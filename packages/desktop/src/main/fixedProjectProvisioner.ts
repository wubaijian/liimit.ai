import { createHash, randomUUID, type Hash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  opendir,
  readdir,
  realpath,
  readlink,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  createProcessCommandRunner,
  type CommandRunner,
  type DependencyOutputListener,
} from './dependencyManager.js';
import type {
  StarterPreparationPhase,
  StarterTemplateId,
} from '../shared/types.js';

const INSTALL_TIMEOUT_MS = 15 * 60_000;
const VALIDATE_TIMEOUT_MS = 2 * 60_000;
const BUILD_TIMEOUT_MS = 5 * 60_000;
const MAX_BUILD_TOOL_ENTRY_BYTES = 1024 * 1024;
const MAX_DEPENDENCY_JSON_BYTES = 1024 * 1024;
const MAX_DEPENDENCY_MARKER_BYTES = 64 * 1024;
const MAX_SCAFFOLD_COMPARISON_BYTES = 8 * 1024 * 1024;
const MAX_NODE_MODULE_ENTRIES = 100_000;
const MAX_NODE_MODULE_FILE_BYTES = 128 * 1024 * 1024;
const MAX_NODE_MODULE_TOTAL_BYTES = 1024 * 1024 * 1024;
const NODE_MODULE_HASH_CHUNK_BYTES = 64 * 1024;
const MUTABLE_NODE_MODULE_CACHE_DIRECTORIES = new Set([
  '.cache',
  '.vite',
  '.vite-temp',
]);
const ERROR_SUMMARY_LIMIT = 4_000;
const TRUSTED_BUILD_SCRIPT = 'tsc --noEmit && vite build';
const EXACT_NPM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const DEPENDENCY_GROUPS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const;
const INSTALL_LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
] as const;

export interface FixedProjectProvisionerLocations {
  templatesDir: string;
  docsDir: string;
}

export interface NpmProcessInvocation {
  executable: string;
  prefixArgs: string[];
}

export interface FixedProjectProvisionResult {
  scaffoldedFiles: number;
  preservedFiles: number;
  dependencies: 'installed' | 'ready';
}

export type FixedProjectPreparationPhase = Extract<
  StarterPreparationPhase,
  'scaffold' | 'dependencies'
>;

export type FixedProjectPreparationReporter = (
  phase: FixedProjectPreparationPhase,
) => void | Promise<void>;

export interface ResolveNpmOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  fileExists?: (filePath: string) => Promise<boolean>;
  listDirectory?: (directory: string) => Promise<string[]>;
}

export interface FixedProjectProvisionerOptions {
  runCommand?: CommandRunner;
  resolveNpm?: () => Promise<NpmProcessInvocation>;
  onOutput?: DependencyOutputListener;
}

interface ManagedDependencyState {
  packageSha256: string;
  lockSha256: string;
  installer: 'npm-ci';
  preparedAt: string;
}

interface DependencyMarker extends ManagedDependencyState {
  schemaVersion: 2;
  platform: NodeJS.Platform;
  architecture: NodeJS.Architecture;
  buildTools: BuildToolSnapshot;
  nodeModules: NodeModulesSnapshot;
}

interface LegacyDependencyMarker extends ManagedDependencyState {
  schemaVersion: 1;
}

interface DependencyMarkerRecord {
  schemaVersion?: unknown;
  packageSha256?: unknown;
  lockSha256?: unknown;
  installer?: unknown;
  preparedAt?: unknown;
  platform?: unknown;
  architecture?: unknown;
  buildTools?: unknown;
  nodeModules?: unknown;
}

interface BuildToolSnapshot {
  typescriptCli: string;
  viteCli: string;
  typescriptShim: string;
  viteShim: string;
}

interface BuildToolInspection {
  snapshot?: BuildToolSnapshot;
  problem?: string;
}

interface NodeModulesSnapshot {
  sha256: string;
  entries: number;
  bytes: number;
}

interface NodeModulesInspection {
  snapshot?: NodeModulesSnapshot;
  problem?: string;
}

interface DirectDependency {
  name: string;
  version: string;
}

interface TrustedDependencyContract {
  packageContents: Buffer;
  lockContents: Buffer;
  packageSha256: string;
  lockSha256: string;
  directDependencies: DirectDependency[];
}

interface CopyContext {
  created: Set<string>;
  preserved: Set<string>;
}

export class FixedProjectProvisioner {
  private readonly runCommand: CommandRunner;
  private readonly resolveNpm: () => Promise<NpmProcessInvocation>;
  private readonly onOutput?: DependencyOutputListener;

  constructor(
    private readonly locations: FixedProjectProvisionerLocations,
    options: FixedProjectProvisionerOptions = {},
  ) {
    this.runCommand = options.runCommand ?? createProcessCommandRunner();
    this.resolveNpm = options.resolveNpm ?? (() => resolveNpmProcess());
    this.onOutput = options.onOutput;
  }

  async prepare(
    projectDirectory: string,
    signal?: AbortSignal,
    reportPhase?: FixedProjectPreparationReporter,
    starterTemplateId?: StarterTemplateId,
  ): Promise<FixedProjectProvisionResult> {
    throwIfDependencyInspectionAborted(signal);
    const rootInfo = await lstat(projectDirectory);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw new Error('项目目录类型不安全，无法准备运行环境。');
    }
    const projectRoot = await realpath(projectDirectory);
    const contract = await readTrustedDependencyContract(
      path.join(this.locations.templatesDir, 'core'),
    );
    await reportPhase?.('scaffold');
    const projectPackagePath = path.join(projectRoot, 'package.json');
    const projectLockPath = path.join(projectRoot, 'package-lock.json');
    const markerPath = path.join(
      projectRoot,
      '.gameagent',
      'dependencies.json',
    );
    await assertOptionalProjectDirectory(projectRoot, path.dirname(markerPath));
    const existingMarker = await readDependencyMarker(markerPath, signal);
    await reconcileProjectDependencyFiles(
      projectPackagePath,
      projectLockPath,
      contract,
      existingMarker,
      signal,
    );

    const context: CopyContext = {
      created: new Set<string>(),
      preserved: new Set<string>(),
    };

    const foundation = starterTemplateId === 'ai-foundation';
    // Seed content takes precedence before the shared engine is copied. On
    // retries copyFile preserves all already-existing user files.
    if (foundation) {
      await this.copyTree(
        path.join(
          this.locations.templatesDir,
          'variants',
          'ai-foundation',
          'src',
        ),
        path.join(projectRoot, 'src'),
        projectRoot,
        context,
        undefined,
        signal,
      );
    }

    await this.copyTree(
      path.join(this.locations.templatesDir, 'core'),
      projectRoot,
      projectRoot,
      context,
      undefined,
      signal,
      foundation,
    );
    await this.copyTree(
      path.join(this.locations.templatesDir, 'modules', 'platformer', 'src'),
      path.join(projectRoot, 'src'),
      projectRoot,
      context,
      path.join(this.locations.templatesDir, 'core', 'src'),
      signal,
      foundation,
    );
    if (starterTemplateId === 'zero-factory-escape') {
      const variantRoot = path.join(
        this.locations.templatesDir,
        'variants',
        starterTemplateId,
      );
      await this.copyTree(
        path.join(variantRoot, 'src'),
        path.join(projectRoot, 'src'),
        projectRoot,
        context,
        undefined,
        signal,
      );
      await this.copyTree(
        path.join(variantRoot, 'public'),
        path.join(projectRoot, 'public'),
        projectRoot,
        context,
        undefined,
        signal,
      );
    }
    await this.copyFile(
      path.join(this.locations.docsDir, 'gdd', 'core.md'),
      path.join(projectRoot, 'docs', 'gdd', 'core.md'),
      projectRoot,
      context,
      undefined,
      signal,
    );
    await this.copyFile(
      path.join(this.locations.docsDir, 'asset_protocol.md'),
      path.join(projectRoot, 'docs', 'asset_protocol.md'),
      projectRoot,
      context,
      undefined,
      signal,
    );
    await this.copyFile(
      path.join(this.locations.docsDir, 'debug_protocol.md'),
      path.join(projectRoot, 'docs', 'debug_protocol.md'),
      projectRoot,
      context,
      undefined,
      signal,
    );
    await this.copyTree(
      path.join(this.locations.docsDir, 'modules', 'platformer'),
      path.join(projectRoot, 'docs', 'modules', 'platformer'),
      projectRoot,
      context,
      undefined,
      signal,
    );

    await reportPhase?.('dependencies');

    const [projectPackage, projectLock] = await Promise.all([
      readProjectFile(projectPackagePath, signal),
      readProjectFile(projectLockPath, signal),
    ]);

    if (
      !projectPackage.equals(contract.packageContents) ||
      !projectLock.equals(contract.lockContents)
    ) {
      throw new Error(
        '项目依赖清单与固定横版模板不一致。为避免执行未知安装脚本，liimit.ai 已停止；请恢复 package.json 和 package-lock.json 后重试。',
      );
    }

    const packageSha256 = contract.packageSha256;
    const lockSha256 = contract.lockSha256;
    const nodeModulesPath = path.join(projectRoot, 'node_modules');
    await assertSafeNodeModulesDirectory(nodeModulesPath);
    let npm: NpmProcessInvocation | undefined;
    if (
      await this.dependencyFilesAreReady(
        projectRoot,
        markerPath,
        packageSha256,
        lockSha256,
        contract.directDependencies,
        signal,
      )
    ) {
      npm = await this.resolveNpm();
      if (await this.dependencyTreeIsReady(projectRoot, npm, signal)) {
        return {
          scaffoldedFiles: context.created.size,
          preservedFiles: context.preserved.size,
          dependencies: 'ready',
        };
      }
    }

    npm ??= await this.resolveNpm();
    const result = await this.runCommand(
      {
        executable: npm.executable,
        args: [
          ...npm.prefixArgs,
          'ci',
          '--no-audit',
          '--no-fund',
          '--ignore-scripts',
          '--registry=https://registry.npmjs.org/',
          '--loglevel=error',
        ],
        timeoutMs: INSTALL_TIMEOUT_MS,
        cwd: projectRoot,
        terminateProcessGroup: true,
        signal,
      },
      this.onOutput,
    );
    if (result.aborted) {
      throw new Error('固定横版项目环境准备已停止。');
    }
    if (result.timedOut) {
      throw new Error('准备 Phaser 项目依赖超时，请检查网络后重试。');
    }
    if (result.exitCode !== 0) {
      const detail = summarizeCommandFailure(result.stderr, result.stdout);
      throw new Error(
        `准备 Phaser 项目依赖失败（npm 退出码 ${result.exitCode ?? '未知'}）。${detail ? `\n${detail}` : ''}`,
      );
    }

    await assertSafeNodeModulesDirectory(nodeModulesPath);
    const installedProblem = await installedDependencyProblem(
      nodeModulesPath,
      contract.directDependencies,
      signal,
    );
    if (installedProblem) {
      throw new Error(`依赖准备结果不完整：${installedProblem}。`);
    }
    const buildTools = await inspectBuildTools(nodeModulesPath, signal);
    if (!buildTools.snapshot) {
      throw new Error(`依赖准备结果不完整：${buildTools.problem}。`);
    }
    const nodeModules = await inspectNodeModules(nodeModulesPath, signal);
    if (!nodeModules.snapshot) {
      throw new Error(`依赖准备结果不完整：${nodeModules.problem}。`);
    }

    await this.ensureProjectDirectory(projectRoot, path.dirname(markerPath));
    await assertSafeMarkerDestination(markerPath);
    const marker: DependencyMarker = {
      schemaVersion: 2,
      packageSha256,
      lockSha256,
      installer: 'npm-ci',
      preparedAt: new Date().toISOString(),
      platform: process.platform,
      architecture: process.arch,
      buildTools: buildTools.snapshot,
      nodeModules: nodeModules.snapshot,
    };
    const temporaryMarker = `${markerPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryMarker, JSON.stringify(marker, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryMarker, markerPath);

    return {
      scaffoldedFiles: context.created.size,
      preservedFiles: context.preserved.size,
      dependencies: 'installed',
    };
  }

  async build(projectDirectory: string, signal?: AbortSignal): Promise<void> {
    throwIfDependencyInspectionAborted(signal);
    const rootInfo = await lstat(projectDirectory);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw new Error('项目目录类型不安全，无法执行最终构建。');
    }
    const projectRoot = await realpath(projectDirectory);
    const contract = await readTrustedDependencyContract(
      path.join(this.locations.templatesDir, 'core'),
    );
    const [projectPackage, projectLock] = await Promise.all([
      readProjectFile(path.join(projectRoot, 'package.json'), signal),
      readProjectFile(path.join(projectRoot, 'package-lock.json'), signal),
    ]);
    if (
      !projectPackage.equals(contract.packageContents) ||
      !projectLock.equals(contract.lockContents)
    ) {
      throw new Error('项目依赖清单已偏离固定横版模板，无法执行受控最终构建。');
    }

    const markerPath = path.join(
      projectRoot,
      '.gameagent',
      'dependencies.json',
    );
    await assertOptionalProjectDirectory(projectRoot, path.dirname(markerPath));
    const nodeModulesPath = path.join(projectRoot, 'node_modules');
    await assertSafeNodeModulesDirectory(nodeModulesPath);
    if (
      !(await this.dependencyFilesAreReady(
        projectRoot,
        markerPath,
        contract.packageSha256,
        contract.lockSha256,
        contract.directDependencies,
        signal,
      ))
    ) {
      throw new Error('固定横版项目依赖不完整，请重新准备项目环境。');
    }

    const npm = await this.resolveNpm();
    if (!(await this.dependencyTreeIsReady(projectRoot, npm, signal))) {
      await removeSafeDependencyMarker(projectRoot, markerPath);
      throw new Error('固定横版项目依赖树不完整，请重新准备项目环境。');
    }
    await removeSafeBuildOutput(projectRoot);
    let result;
    try {
      result = await this.runCommand(
        {
          executable: npm.executable,
          args: [...npm.prefixArgs, 'run', 'build', '--ignore-scripts'],
          timeoutMs: BUILD_TIMEOUT_MS,
          cwd: projectRoot,
          terminateProcessGroup: true,
          signal,
        },
        this.onOutput,
      );
    } catch (error) {
      if (!signal?.aborted) {
        await removeSafeDependencyMarker(projectRoot, markerPath);
      }
      throw error;
    }
    if (result.aborted) throw new Error('固定横版项目最终构建已停止。');
    if (result.timedOut) {
      await removeSafeDependencyMarker(projectRoot, markerPath);
      throw new Error('固定横版项目最终构建超时，请继续修复后重试。');
    }
    if (result.exitCode !== 0) {
      await removeSafeDependencyMarker(projectRoot, markerPath);
      const detail = summarizeCommandFailure(result.stderr, result.stdout);
      throw new Error(
        `固定横版项目最终构建失败（npm 退出码 ${result.exitCode ?? '未知'}）。${detail ? `\n${detail}` : ''}`,
      );
    }
  }

  private async dependencyFilesAreReady(
    projectRoot: string,
    markerPath: string,
    packageSha256: string,
    lockSha256: string,
    directDependencies: DirectDependency[],
    signal?: AbortSignal,
  ): Promise<boolean> {
    throwIfDependencyInspectionAborted(signal);
    const marker = await readDependencyMarker(markerPath, signal);
    if (!marker) return false;
    if (
      marker.schemaVersion !== 2 ||
      marker.installer !== 'npm-ci' ||
      marker.packageSha256 !== packageSha256 ||
      marker.lockSha256 !== lockSha256 ||
      marker.platform !== process.platform ||
      marker.architecture !== process.arch
    ) {
      return false;
    }
    const installedProblem = await installedDependencyProblem(
      path.join(projectRoot, 'node_modules'),
      directDependencies,
      signal,
    );
    if (installedProblem) return false;
    const buildTools = await inspectBuildTools(
      path.join(projectRoot, 'node_modules'),
      signal,
    );
    if (
      !buildTools.snapshot ||
      !isBuildToolSnapshot(marker.buildTools) ||
      !buildToolSnapshotsMatch(buildTools.snapshot, marker.buildTools)
    ) {
      return false;
    }
    if (!isNodeModulesSnapshot(marker.nodeModules)) return false;
    const nodeModules = await inspectNodeModules(
      path.join(projectRoot, 'node_modules'),
      signal,
    );
    return Boolean(
      nodeModules.snapshot &&
      nodeModulesSnapshotsMatch(nodeModules.snapshot, marker.nodeModules),
    );
  }

  private async dependencyTreeIsReady(
    projectRoot: string,
    npm: NpmProcessInvocation,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const result = await this.runCommand({
      executable: npm.executable,
      args: [
        ...npm.prefixArgs,
        'ls',
        '--all',
        '--json',
        '--ignore-scripts',
        '--loglevel=error',
      ],
      timeoutMs: VALIDATE_TIMEOUT_MS,
      cwd: projectRoot,
      terminateProcessGroup: true,
      signal,
    });
    if (result.aborted) {
      throw new Error('固定横版项目环境准备已停止。');
    }
    return !result.timedOut && result.exitCode === 0;
  }

  private async copyTree(
    source: string,
    destination: string,
    projectRoot: string,
    context: CopyContext,
    replaceFromDirectory?: string,
    signal?: AbortSignal,
    foundation = false,
  ): Promise<void> {
    throwIfDependencyInspectionAborted(signal);
    const sourceInfo = await lstat(source).catch(() => undefined);
    if (!sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) {
      throw new Error(`固定横版脚手架目录不存在或类型不安全：${source}`);
    }
    await this.ensureProjectDirectory(projectRoot, destination);
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);
      if (foundation) {
        const relative = path
          .relative(projectRoot, destinationPath)
          .split(path.sep)
          .join('/');
        if (
          relative === 'public/assets/images' ||
          [
            'src/levels.json',
            'src/level.json',
            'src/gameInfo.json',
            'src/visualStyle.json',
          ].includes(relative)
        )
          continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`固定横版脚手架不允许符号链接：${sourcePath}`);
      }
      if (entry.isDirectory()) {
        await this.copyTree(
          sourcePath,
          destinationPath,
          projectRoot,
          context,
          replaceFromDirectory
            ? path.join(replaceFromDirectory, entry.name)
            : undefined,
          signal,
          foundation,
        );
      } else if (entry.isFile()) {
        await this.copyFile(
          sourcePath,
          destinationPath,
          projectRoot,
          context,
          replaceFromDirectory
            ? path.join(replaceFromDirectory, entry.name)
            : undefined,
          signal,
        );
      } else {
        throw new Error(`固定横版脚手架包含不支持的文件类型：${sourcePath}`);
      }
    }
  }

  private async copyFile(
    source: string,
    destination: string,
    projectRoot: string,
    context: CopyContext,
    replaceIfMatches?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    throwIfDependencyInspectionAborted(signal);
    const sourceInfo = await lstat(source).catch(() => undefined);
    if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink()) {
      throw new Error(`固定横版脚手架文件不存在或类型不安全：${source}`);
    }
    await this.ensureProjectDirectory(projectRoot, path.dirname(destination));
    const destinationInfo = await lstat(destination).catch(() => undefined);
    if (destinationInfo) {
      if (!destinationInfo.isFile() || destinationInfo.isSymbolicLink()) {
        throw new Error(`项目中已有不安全的脚手架目标：${destination}`);
      }
      if (context.created.has(destination)) {
        await copyFile(source, destination);
      } else if (
        replaceIfMatches &&
        (await filesMatch(destination, replaceIfMatches, signal))
      ) {
        await copyFile(source, destination);
      } else {
        context.preserved.add(destination);
      }
      return;
    }
    await copyFile(source, destination);
    context.created.add(destination);
  }

  private async ensureProjectDirectory(
    projectRoot: string,
    directory: string,
  ): Promise<void> {
    const relative = path.relative(projectRoot, directory);
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('固定横版脚手架目标超出项目目录。');
    }
    let current = projectRoot;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      await mkdir(current, { recursive: false }).catch((error: unknown) => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw error;
      });
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`项目脚手架目录类型不安全：${current}`);
      }
      const resolved = await realpath(current);
      const resolvedRelative = path.relative(projectRoot, resolved);
      if (
        resolvedRelative === '..' ||
        resolvedRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(resolvedRelative)
      ) {
        throw new Error(`项目脚手架目录越界：${current}`);
      }
    }
  }
}

export async function resolveNpmProcess(
  options: ResolveNpmOptions = {},
): Promise<NpmProcessInvocation> {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const fileExists = options.fileExists ?? defaultFileExists;
  const listDirectory = options.listDirectory ?? defaultListDirectory;

  const configuredCli = environmentPathValue(environment, 'npm_execpath');
  const configuredNode = environmentPathValue(environment, 'npm_node_execpath');
  if (
    configuredCli &&
    configuredNode &&
    (await fileExists(configuredCli)) &&
    (await fileExists(configuredNode))
  ) {
    return { executable: configuredNode, prefixArgs: [configuredCli] };
  }

  const nodeCandidates = new Set<string>();
  const pathValue = environmentValue(environment, 'PATH');
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  for (const directory of pathValue?.split(pathApi.delimiter) ?? []) {
    const normalizedDirectory = normalizePathEntry(directory);
    if (!normalizedDirectory) continue;
    nodeCandidates.add(
      pathApi.join(
        normalizedDirectory,
        platform === 'win32' ? 'node.exe' : 'node',
      ),
    );
  }
  if (platform === 'win32') {
    const programFilesRoots = [
      environmentPathValue(environment, 'ProgramW6432'),
      environmentPathValue(environment, 'ProgramFiles'),
    ].filter((value): value is string => Boolean(value));
    for (const root of programFilesRoots) {
      nodeCandidates.add(pathApi.join(root, 'nodejs', 'node.exe'));
    }
    const nvmSymlink = environmentPathValue(environment, 'NVM_SYMLINK');
    if (nvmSymlink) {
      nodeCandidates.add(pathApi.join(nvmSymlink, 'node.exe'));
    }
    const localAppData =
      environmentPathValue(environment, 'LOCALAPPDATA') ??
      pathApi.join(homeDirectory, 'AppData', 'Local');
    nodeCandidates.add(
      pathApi.join(localAppData, 'Programs', 'nodejs', 'node.exe'),
    );
    await addVoltaNodeCandidates(
      nodeCandidates,
      environmentPathValue(environment, 'VOLTA_HOME') ??
        pathApi.join(localAppData, 'Volta'),
      platform,
      listDirectory,
    );
  } else {
    nodeCandidates.add('/opt/homebrew/bin/node');
    nodeCandidates.add('/usr/local/bin/node');
    const voltaRoot =
      environmentPathValue(environment, 'VOLTA_HOME') ??
      pathApi.join(homeDirectory, '.volta');
    nodeCandidates.add(pathApi.join(voltaRoot, 'bin', 'node'));
    await addVoltaNodeCandidates(
      nodeCandidates,
      voltaRoot,
      platform,
      listDirectory,
    );
    const nvmRoot = pathApi.join(homeDirectory, '.nvm', 'versions', 'node');
    for (const version of await nodeVersionDirectories(
      nvmRoot,
      listDirectory,
    )) {
      nodeCandidates.add(pathApi.join(nvmRoot, version, 'bin', 'node'));
    }
  }

  for (const nodeExecutable of nodeCandidates) {
    if (!(await fileExists(nodeExecutable))) continue;
    const cliCandidates = npmCliCandidates(nodeExecutable, platform);
    for (const cli of cliCandidates) {
      if (await fileExists(cli)) {
        return { executable: nodeExecutable, prefixArgs: [cli] };
      }
    }
  }

  throw new Error(
    '未找到可用的 Node.js/npm。请先在“设置 → 运行环境”安装或修复 Node.js，然后重试。',
  );
}

function npmCliCandidates(
  nodeExecutable: string,
  platform: NodeJS.Platform,
): string[] {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const binDirectory = pathApi.dirname(nodeExecutable);
  if (platform === 'win32') {
    return [
      pathApi.join(binDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      pathApi.join(
        pathApi.dirname(binDirectory),
        'node_modules',
        'npm',
        'bin',
        'npm-cli.js',
      ),
    ];
  }
  const prefix = pathApi.dirname(binDirectory);
  return [
    pathApi.join(prefix, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    pathApi.join(prefix, 'share', 'nodejs', 'npm', 'bin', 'npm-cli.js'),
    pathApi.join(binDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
}

async function addVoltaNodeCandidates(
  candidates: Set<string>,
  voltaRoot: string,
  platform: NodeJS.Platform,
  listDirectory: (directory: string) => Promise<string[]>,
): Promise<void> {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const imagesRoot = pathApi.join(voltaRoot, 'tools', 'image', 'node');
  for (const version of await nodeVersionDirectories(
    imagesRoot,
    listDirectory,
  )) {
    const imageRoot = pathApi.join(imagesRoot, version);
    if (platform === 'win32') {
      nodeCandidatesForWindowsVolta(candidates, imageRoot);
    } else {
      candidates.add(pathApi.join(imageRoot, 'bin', 'node'));
    }
  }
}

function nodeCandidatesForWindowsVolta(
  candidates: Set<string>,
  imageRoot: string,
): void {
  candidates.add(path.win32.join(imageRoot, 'node.exe'));
  candidates.add(path.win32.join(imageRoot, 'bin', 'node.exe'));
}

async function nodeVersionDirectories(
  root: string,
  listDirectory: (directory: string) => Promise<string[]>,
): Promise<string[]> {
  const versions = await listDirectory(root).catch(() => []);
  return versions
    .filter((version) => /^v?\d+(?:\.\d+){1,2}$/.test(version))
    .sort(compareNodeVersionsDescending);
}

function compareNodeVersionsDescending(left: string, right: string): number {
  const leftParts = left.replace(/^v/, '').split('.').map(Number);
  const rightParts = right.replace(/^v/, '').split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference) return difference;
  }
  return right.localeCompare(left);
}

function normalizePathEntry(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    trimmed.length >= 2 &&
    (quote === '"' || quote === "'") &&
    trimmed.at(-1) === quote
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function environmentPathValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = environmentValue(environment, name);
  if (!value) return undefined;
  return normalizePathEntry(value) || undefined;
}

function environmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(environment)) {
    if (key.toLowerCase() === target && value?.trim()) return value.trim();
  }
  return undefined;
}

async function defaultFileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function defaultListDirectory(directory: string): Promise<string[]> {
  return readdir(directory);
}

async function readTrustedFile(filePath: string): Promise<Buffer> {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`固定横版模板文件类型不安全：${filePath}`);
  }
  return readBoundedFile(
    filePath,
    MAX_DEPENDENCY_JSON_BYTES,
    '固定横版模板文件',
  );
}

type JsonObject = Record<string, unknown>;

async function readTrustedDependencyContract(
  templateCoreDirectory: string,
): Promise<TrustedDependencyContract> {
  let packageContents: Buffer;
  let lockContents: Buffer;
  try {
    [packageContents, lockContents] = await Promise.all([
      readTrustedFile(path.join(templateCoreDirectory, 'package.json')),
      readTrustedFile(path.join(templateCoreDirectory, 'package-lock.json')),
    ]);
  } catch (error) {
    throw new Error(
      '固定横版模板缺少 package.json 或 package-lock.json，无法安全准备依赖。',
      { cause: error },
    );
  }

  const manifest = parseJsonObject(packageContents, '模板 package.json');
  const lockfile = parseJsonObject(lockContents, '模板 package-lock.json');
  if (manifest['private'] !== true) {
    throw new Error('固定横版模板 package.json 必须声明 private: true。');
  }
  const scripts = readStringMap(manifest['scripts'], '模板 scripts');
  for (const scriptName of INSTALL_LIFECYCLE_SCRIPTS) {
    if (scriptName in scripts) {
      throw new Error(`固定横版模板禁止根级 ${scriptName} 安装脚本。`);
    }
  }
  if (scripts['build'] !== TRUSTED_BUILD_SCRIPT) {
    throw new Error('固定横版模板 build 脚本与受控构建契约不一致。');
  }
  if (lockfile['lockfileVersion'] !== 3) {
    throw new Error('固定横版模板必须使用 npm v3 package-lock.json。');
  }
  const lockPackages = requireJsonObject(
    lockfile['packages'],
    '模板 package-lock.json 缺少 packages。',
  );
  const lockRoot = requireJsonObject(
    lockPackages[''],
    '模板 package-lock.json 缺少根项目记录。',
  );
  const directDependencies: DirectDependency[] = [];
  const seen = new Set<string>();

  for (const group of DEPENDENCY_GROUPS) {
    const declared = readStringMap(manifest[group], `模板 ${group}`);
    const locked = readStringMap(lockRoot[group], `锁文件 ${group}`);
    if (!sameEntries(declared, locked)) {
      throw new Error(
        `模板 package.json 与 package-lock.json 的 ${group} 不一致。`,
      );
    }
    for (const [name, version] of Object.entries(declared)) {
      if (!SAFE_PACKAGE_NAME.test(name)) {
        throw new Error(`固定横版模板包含不安全的依赖名称：${name}。`);
      }
      if (!EXACT_NPM_VERSION.test(version)) {
        throw new Error(`固定横版模板依赖 ${name} 必须使用精确版本。`);
      }
      if (seen.has(name)) {
        throw new Error(`固定横版模板依赖 ${name} 重复出现在多个分组。`);
      }
      seen.add(name);
      const lockedPackage = requireJsonObject(
        lockPackages[`node_modules/${name}`],
        `模板锁文件缺少直接依赖 ${name}。`,
      );
      if (lockedPackage['version'] !== version) {
        throw new Error(`模板锁文件中的 ${name} 版本不匹配。`);
      }
      directDependencies.push({ name, version });
    }
  }

  for (const [packagePath, value] of Object.entries(lockPackages)) {
    if (!packagePath) continue;
    const lockedPackage = requireJsonObject(
      value,
      `模板锁文件包记录无效：${packagePath}。`,
    );
    const resolved = lockedPackage['resolved'];
    const integrity = lockedPackage['integrity'];
    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(String(resolved));
    } catch {
      throw new Error(`模板锁文件依赖来源无效：${packagePath}。`);
    }
    if (
      resolvedUrl.protocol !== 'https:' ||
      resolvedUrl.hostname !== 'registry.npmjs.org' ||
      typeof integrity !== 'string' ||
      !/^sha(?:1|256|384|512)-[A-Za-z0-9+/=]+$/.test(integrity)
    ) {
      throw new Error(`模板锁文件依赖来源或完整性不受信任：${packagePath}。`);
    }
  }

  return {
    packageContents,
    lockContents,
    packageSha256: digest(packageContents),
    lockSha256: digest(lockContents),
    directDependencies,
  };
}

async function readProjectFile(
  filePath: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  throwIfDependencyInspectionAborted(signal);
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`项目依赖清单类型不安全：${filePath}`);
  }
  return readBoundedFile(
    filePath,
    MAX_DEPENDENCY_JSON_BYTES,
    '项目依赖清单',
    signal,
  );
}

async function readOptionalProjectFile(
  filePath: string,
  label: string,
  signal?: AbortSignal,
): Promise<Buffer | undefined> {
  throwIfDependencyInspectionAborted(signal);
  const info = await lstat(filePath).catch(() => undefined);
  if (!info) return undefined;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`项目 ${label} 类型不安全，已停止依赖准备。`);
  }
  return readBoundedFile(
    filePath,
    MAX_DEPENDENCY_JSON_BYTES,
    `项目 ${label}`,
    signal,
  );
}

async function readDependencyMarker(
  markerPath: string,
  signal?: AbortSignal,
): Promise<DependencyMarkerRecord | undefined> {
  throwIfDependencyInspectionAborted(signal);
  const info = await lstat(markerPath).catch(() => undefined);
  if (!info) return undefined;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error('项目依赖状态文件类型不安全，已停止依赖准备。');
  }
  try {
    const contents = await readBoundedFile(
      markerPath,
      MAX_DEPENDENCY_MARKER_BYTES,
      '项目依赖状态文件',
      signal,
    );
    return JSON.parse(contents.toString('utf8')) as DependencyMarkerRecord;
  } catch {
    throwIfDependencyInspectionAborted(signal);
    return undefined;
  }
}

async function assertOptionalProjectDirectory(
  projectRoot: string,
  directory: string,
): Promise<void> {
  const relative = path.relative(projectRoot, directory);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('项目状态目录超出项目范围。');
  }

  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => undefined);
    if (!info) return;
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`项目状态目录类型不安全：${current}`);
    }
    const resolved = await realpath(current);
    if (!isContained(projectRoot, resolved)) {
      throw new Error(`项目状态目录越界：${current}`);
    }
  }
}

async function reconcileProjectDependencyFiles(
  packagePath: string,
  lockPath: string,
  contract: TrustedDependencyContract,
  marker: DependencyMarkerRecord | undefined,
  signal?: AbortSignal,
): Promise<void> {
  throwIfDependencyInspectionAborted(signal);
  const [projectPackage, projectLock] = await Promise.all([
    readOptionalProjectFile(packagePath, 'package.json', signal),
    readOptionalProjectFile(lockPath, 'package-lock.json', signal),
  ]);
  let managedUpgrade = false;
  for (const [label, contents, trusted, markerHash] of [
    [
      'package.json',
      projectPackage,
      contract.packageContents,
      marker?.packageSha256,
    ],
    [
      'package-lock.json',
      projectLock,
      contract.lockContents,
      marker?.lockSha256,
    ],
  ] as const) {
    if (!contents || contents.equals(trusted)) continue;
    if (!isManagedMarker(marker) || digest(contents) !== markerHash) {
      throw new Error(
        `项目 ${label} 与固定横版模板不一致。为避免执行未知安装脚本，liimit.ai 已停止；请恢复该文件后重试。`,
      );
    }
    managedUpgrade = true;
  }

  if (managedUpgrade) {
    await writeFile(packagePath, contract.packageContents, { mode: 0o600 });
    await writeFile(lockPath, contract.lockContents, { mode: 0o600 });
  }
}

function isManagedMarker(
  marker: DependencyMarkerRecord | undefined,
): marker is DependencyMarker | LegacyDependencyMarker {
  return Boolean(
    (marker?.schemaVersion === 1 || marker?.schemaVersion === 2) &&
    marker.installer === 'npm-ci' &&
    typeof marker.packageSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(marker.packageSha256) &&
    typeof marker.lockSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(marker.lockSha256),
  );
}

async function removeSafeDependencyMarker(
  projectRoot: string,
  markerPath: string,
): Promise<void> {
  await assertOptionalProjectDirectory(projectRoot, path.dirname(markerPath));
  const info = await lstat(markerPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (!info) return;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error('项目依赖状态文件类型不安全，无法重置。');
  }
  const resolved = await realpath(markerPath);
  if (!isContained(projectRoot, resolved)) {
    throw new Error('项目依赖状态文件越界，无法重置。');
  }
  await unlink(markerPath);
}

async function removeSafeBuildOutput(projectRoot: string): Promise<void> {
  const outputPath = path.join(projectRoot, 'dist');
  const info = await lstat(outputPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (!info) return;
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('项目 dist 构建目录类型不安全，已拒绝清理和构建。');
  }
  const resolved = await realpath(outputPath);
  if (!isContained(projectRoot, resolved)) {
    throw new Error('项目 dist 构建目录越界，已拒绝清理和构建。');
  }
  await rm(outputPath, { recursive: true, force: false });
}

async function assertSafeMarkerDestination(markerPath: string): Promise<void> {
  const info = await lstat(markerPath).catch(() => undefined);
  if (info && (!info.isFile() || info.isSymbolicLink())) {
    throw new Error('项目依赖状态文件类型不安全，无法写入。');
  }
}

async function assertSafeNodeModulesDirectory(
  nodeModulesPath: string,
): Promise<void> {
  const info = await lstat(nodeModulesPath).catch(() => undefined);
  if (!info) return;
  if (info.isSymbolicLink()) {
    throw new Error('项目 node_modules 是符号链接，已拒绝执行依赖准备。');
  }
  if (!info.isDirectory()) {
    throw new Error('项目 node_modules 不是文件夹，已拒绝执行依赖准备。');
  }
}

async function installedDependencyProblem(
  nodeModulesPath: string,
  dependencies: DirectDependency[],
  signal?: AbortSignal,
): Promise<string | undefined> {
  throwIfDependencyInspectionAborted(signal);
  const rootInfo = await lstat(nodeModulesPath).catch(() => undefined);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) {
    return 'node_modules 不存在或类型不安全';
  }
  const resolvedRoot = await realpath(nodeModulesPath);
  for (const dependency of dependencies) {
    throwIfDependencyInspectionAborted(signal);
    let current = nodeModulesPath;
    for (const segment of dependency.name.split('/')) {
      current = path.join(current, segment);
      const info = await lstat(current).catch(() => undefined);
      if (!info?.isDirectory() || info.isSymbolicLink()) {
        return `缺少 ${dependency.name}`;
      }
      const resolved = await realpath(current);
      if (!isContained(resolvedRoot, resolved)) {
        return `${dependency.name} 路径越界`;
      }
    }
    const manifestPath = path.join(current, 'package.json');
    const manifestInfo = await lstat(manifestPath).catch(() => undefined);
    if (!manifestInfo?.isFile() || manifestInfo.isSymbolicLink()) {
      return `缺少 ${dependency.name}`;
    }
    let manifest: JsonObject;
    try {
      manifest = parseJsonObject(
        await readBoundedFile(
          manifestPath,
          MAX_DEPENDENCY_JSON_BYTES,
          `${dependency.name} package.json`,
          signal,
        ),
        `${dependency.name} package.json`,
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      return `${dependency.name} 清单无效`;
    }
    if (
      manifest['name'] !== dependency.name ||
      manifest['version'] !== dependency.version
    ) {
      return `${dependency.name} 版本不是 ${dependency.version}`;
    }
  }
  return undefined;
}

async function inspectBuildTools(
  nodeModulesPath: string,
  signal?: AbortSignal,
): Promise<BuildToolInspection> {
  const typescriptCli = path.join('typescript', 'bin', 'tsc');
  const viteCli = path.join('vite', 'bin', 'vite.js');
  const shimExtension = process.platform === 'win32' ? '.cmd' : '';
  const entries = [
    ['typescriptCli', typescriptCli, '缺少 TypeScript 构建入口', undefined],
    ['viteCli', viteCli, '缺少 Vite 构建入口', undefined],
    [
      'typescriptShim',
      path.join('.bin', `tsc${shimExtension}`),
      '缺少 TypeScript 命令入口',
      process.platform === 'win32' ? undefined : typescriptCli,
    ],
    [
      'viteShim',
      path.join('.bin', `vite${shimExtension}`),
      '缺少 Vite 命令入口',
      process.platform === 'win32' ? undefined : viteCli,
    ],
  ] as const;
  const snapshot = {} as BuildToolSnapshot;
  for (const [key, relativePath, label, expectedTarget] of entries) {
    throwIfDependencyInspectionAborted(signal);
    const fingerprint = await fingerprintBuildTool(
      nodeModulesPath,
      relativePath,
      label,
      expectedTarget,
      signal,
    );
    if (!fingerprint.sha256) return { problem: fingerprint.problem };
    snapshot[key] = fingerprint.sha256;
  }
  return { snapshot };
}

async function fingerprintBuildTool(
  nodeModulesPath: string,
  relativePath: string,
  label: string,
  expectedTarget?: string,
  signal?: AbortSignal,
): Promise<{ sha256?: string; problem?: string }> {
  throwIfDependencyInspectionAborted(signal);
  const entryPath = path.join(nodeModulesPath, relativePath);
  const info = await lstat(entryPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (!info) return { problem: label };
  if (expectedTarget) {
    if (!info.isSymbolicLink()) return { problem: `${label}类型不安全` };
  } else if (!info.isFile() || info.isSymbolicLink()) {
    return { problem: `${label}类型不安全` };
  }

  const resolved = await realpath(entryPath).catch(() => undefined);
  if (!resolved || !isContained(nodeModulesPath, resolved)) {
    return { problem: `${label}路径越界` };
  }
  if (expectedTarget) {
    const expected = await realpath(
      path.join(nodeModulesPath, expectedTarget),
    ).catch(() => undefined);
    if (!expected || resolved !== expected) {
      return { problem: `${label}指向了非固定构建工具` };
    }
  }

  const resolvedInfo = await stat(resolved);
  if (
    !resolvedInfo.isFile() ||
    resolvedInfo.size === 0 ||
    resolvedInfo.size > MAX_BUILD_TOOL_ENTRY_BYTES
  ) {
    return { problem: `${label}大小或类型无效` };
  }
  return {
    sha256: digest(
      await readBoundedFile(
        resolved,
        MAX_BUILD_TOOL_ENTRY_BYTES,
        label,
        signal,
      ),
    ),
  };
}

function isBuildToolSnapshot(value: unknown): value is BuildToolSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ['typescriptCli', 'viteCli', 'typescriptShim', 'viteShim'].every(
    (key) =>
      typeof record[key] === 'string' &&
      /^[a-f0-9]{64}$/.test(record[key] as string),
  );
}

function buildToolSnapshotsMatch(
  left: BuildToolSnapshot,
  right: BuildToolSnapshot,
): boolean {
  return (
    left.typescriptCli === right.typescriptCli &&
    left.viteCli === right.viteCli &&
    left.typescriptShim === right.typescriptShim &&
    left.viteShim === right.viteShim
  );
}

async function inspectNodeModules(
  nodeModulesPath: string,
  signal?: AbortSignal,
): Promise<NodeModulesInspection> {
  try {
    throwIfDependencyInspectionAborted(signal);
    const rootInfo = await lstat(nodeModulesPath);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      return { problem: 'node_modules 不存在或类型不安全' };
    }
    const resolvedRoot = await realpath(nodeModulesPath);
    const hash = createHash('sha256');
    let entries = 0;
    let scannedEntries = 0;
    let bytes = 0;

    const visit = async (directory: string): Promise<void> => {
      throwIfDependencyInspectionAborted(signal);
      const children: Dirent[] = [];
      const directoryHandle = await opendir(directory);
      for await (const child of directoryHandle) {
        throwIfDependencyInspectionAborted(signal);
        scannedEntries += 1;
        if (scannedEntries > MAX_NODE_MODULE_ENTRIES) {
          throw new Error('node_modules 文件数超过安全上限');
        }
        children.push(child);
      }
      children.sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
      for (const child of children) {
        throwIfDependencyInspectionAborted(signal);
        const absolutePath = path.join(directory, child.name);
        const relativePath = path
          .relative(resolvedRoot, absolutePath)
          .split(path.sep)
          .join('/');
        const info = await lstat(absolutePath);
        if (
          directory === resolvedRoot &&
          info.isDirectory() &&
          !info.isSymbolicLink() &&
          MUTABLE_NODE_MODULE_CACHE_DIRECTORIES.has(child.name)
        ) {
          continue;
        }
        const mode = info.mode & 0o777;
        if (info.isSymbolicLink()) {
          entries += 1;
          const [target, resolvedTarget] = await Promise.all([
            readlink(absolutePath),
            realpath(absolutePath),
          ]);
          if (!isContained(resolvedRoot, resolvedTarget)) {
            throw new Error(`node_modules 符号链接越界：${relativePath}`);
          }
          hash.update(JSON.stringify(['symlink', relativePath, target, mode]));
          continue;
        }
        if (info.isDirectory()) {
          await visit(absolutePath);
          continue;
        }
        if (!info.isFile()) {
          throw new Error(`node_modules 包含不支持的文件类型：${relativePath}`);
        }
        if (info.size > MAX_NODE_MODULE_FILE_BYTES) {
          throw new Error(`node_modules 单文件超过安全上限：${relativePath}`);
        }
        bytes += info.size;
        if (bytes > MAX_NODE_MODULE_TOTAL_BYTES) {
          throw new Error('node_modules 总大小超过安全上限');
        }
        entries += 1;
        hash.update(JSON.stringify(['file', relativePath, info.size, mode]));
        await updateHashWithStableFingerprintFile(
          hash,
          absolutePath,
          info.size,
          relativePath,
          signal,
        );
      }
    };

    await visit(resolvedRoot);
    throwIfDependencyInspectionAborted(signal);
    return {
      snapshot: { sha256: hash.digest('hex'), entries, bytes },
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('固定横版项目依赖校验已停止。', { cause: error });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { problem: `node_modules 完整性校验失败：${detail}` };
  }
}

async function updateHashWithStableFingerprintFile(
  hash: Hash,
  filePath: string,
  expectedBytes: number,
  relativePath: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfDependencyInspectionAborted(signal);
  const handle = await open(filePath, 'r');
  try {
    throwIfDependencyInspectionAborted(signal);
    const current = await handle.stat();
    if (!current.isFile() || current.size !== expectedBytes) {
      throw new Error(`node_modules 文件在校验时发生变化：${relativePath}`);
    }
    const chunk = Buffer.allocUnsafe(
      Math.max(1, Math.min(NODE_MODULE_HASH_CHUNK_BYTES, expectedBytes)),
    );
    let offset = 0;
    while (offset < expectedBytes) {
      throwIfDependencyInspectionAborted(signal);
      const bytesToRead = Math.min(chunk.length, expectedBytes - offset);
      const { bytesRead } = await handle.read(chunk, 0, bytesToRead, offset);
      if (bytesRead === 0) break;
      hash.update(chunk.subarray(0, bytesRead));
      offset += bytesRead;
    }
    throwIfDependencyInspectionAborted(signal);
    const extra = Buffer.allocUnsafe(1);
    const { bytesRead: extraBytes } = await handle.read(
      extra,
      0,
      1,
      expectedBytes,
    );
    if (offset !== expectedBytes || extraBytes !== 0) {
      throw new Error(`node_modules 文件在校验时发生变化：${relativePath}`);
    }
  } finally {
    await handle.close();
  }
}

function throwIfDependencyInspectionAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('固定横版项目依赖校验已停止。');
  }
}

function isNodeModulesSnapshot(value: unknown): value is NodeModulesSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['sha256'] === 'string' &&
    /^[a-f0-9]{64}$/.test(record['sha256']) &&
    Number.isSafeInteger(record['entries']) &&
    (record['entries'] as number) >= 0 &&
    Number.isSafeInteger(record['bytes']) &&
    (record['bytes'] as number) >= 0
  );
}

function nodeModulesSnapshotsMatch(
  left: NodeModulesSnapshot,
  right: NodeModulesSnapshot,
): boolean {
  return (
    left.sha256 === right.sha256 &&
    left.entries === right.entries &&
    left.bytes === right.bytes
  );
}

function parseJsonObject(contents: Buffer, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString('utf8')) as unknown;
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON。`, { cause: error });
  }
  return requireJsonObject(parsed, `${label} 必须是对象。`);
}

function requireJsonObject(value: unknown, message: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as JsonObject;
}

function readStringMap(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {};
  const object = requireJsonObject(value, `${label} 必须是对象。`);
  const result: Record<string, string> = {};
  for (const [name, candidate] of Object.entries(object)) {
    if (typeof candidate !== 'string') {
      throw new Error(`${label} 的 ${name} 必须是字符串。`);
    }
    result[name] = candidate;
  }
  return result;
}

function sameEntries(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  return (
    JSON.stringify(
      Object.entries(left).sort(([a], [b]) => a.localeCompare(b)),
    ) ===
    JSON.stringify(Object.entries(right).sort(([a], [b]) => a.localeCompare(b)))
  );
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function readBoundedFile(
  filePath: string,
  maxBytes: number,
  label: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  throwIfDependencyInspectionAborted(signal);
  const pathInfo = await lstat(filePath);
  if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) {
    throw new Error(`${label}类型不安全。`);
  }
  if (pathInfo.size > maxBytes) {
    throw new Error(`${label}超过安全大小上限。`);
  }
  const handle = await open(filePath, 'r');
  try {
    throwIfDependencyInspectionAborted(signal);
    const initial = await handle.stat();
    if (
      !initial.isFile() ||
      initial.dev !== pathInfo.dev ||
      initial.ino !== pathInfo.ino
    ) {
      throw new Error(`${label}类型不安全。`);
    }
    if (initial.size > maxBytes) {
      throw new Error(`${label}超过安全大小上限。`);
    }

    const contents = Buffer.allocUnsafe(initial.size + 1);
    let offset = 0;
    while (offset < contents.length) {
      throwIfDependencyInspectionAborted(signal);
      const bytesToRead = Math.min(
        NODE_MODULE_HASH_CHUNK_BYTES,
        contents.length - offset,
      );
      const { bytesRead } = await handle.read(
        contents,
        offset,
        bytesToRead,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    throwIfDependencyInspectionAborted(signal);
    const final = await handle.stat();
    if (
      !final.isFile() ||
      final.size !== initial.size ||
      offset !== initial.size
    ) {
      throw new Error(`${label}在读取时发生变化。`);
    }
    return contents.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

async function filesMatch(
  first: string,
  second: string,
  signal?: AbortSignal,
): Promise<boolean> {
  throwIfDependencyInspectionAborted(signal);
  const [firstPathInfo, secondPathInfo] = await Promise.all([
    lstat(first).catch(() => undefined),
    lstat(second).catch(() => undefined),
  ]);
  if (
    !firstPathInfo?.isFile() ||
    firstPathInfo.isSymbolicLink() ||
    !secondPathInfo?.isFile() ||
    secondPathInfo.isSymbolicLink() ||
    firstPathInfo.size !== secondPathInfo.size ||
    firstPathInfo.size > MAX_SCAFFOLD_COMPARISON_BYTES
  ) {
    return false;
  }

  const firstHandle = await open(first, 'r');
  const secondHandle = await open(second, 'r').catch(async (error: unknown) => {
    await firstHandle.close().catch(() => undefined);
    throw error;
  });
  try {
    const [firstInfo, secondInfo] = await Promise.all([
      firstHandle.stat(),
      secondHandle.stat(),
    ]);
    if (
      !firstInfo.isFile() ||
      !secondInfo.isFile() ||
      firstInfo.dev !== firstPathInfo.dev ||
      firstInfo.ino !== firstPathInfo.ino ||
      secondInfo.dev !== secondPathInfo.dev ||
      secondInfo.ino !== secondPathInfo.ino ||
      firstInfo.size !== secondInfo.size ||
      firstInfo.size !== firstPathInfo.size
    ) {
      return false;
    }

    const firstChunk = Buffer.allocUnsafe(NODE_MODULE_HASH_CHUNK_BYTES);
    const secondChunk = Buffer.allocUnsafe(NODE_MODULE_HASH_CHUNK_BYTES);
    let offset = 0;
    while (offset < firstInfo.size) {
      throwIfDependencyInspectionAborted(signal);
      const bytesToRead = Math.min(
        NODE_MODULE_HASH_CHUNK_BYTES,
        firstInfo.size - offset,
      );
      const [firstRead, secondRead] = await Promise.all([
        firstHandle.read(firstChunk, 0, bytesToRead, offset),
        secondHandle.read(secondChunk, 0, bytesToRead, offset),
      ]);
      if (
        firstRead.bytesRead !== bytesToRead ||
        secondRead.bytesRead !== bytesToRead ||
        !firstChunk
          .subarray(0, bytesToRead)
          .equals(secondChunk.subarray(0, bytesToRead))
      ) {
        return false;
      }
      offset += bytesToRead;
    }
    throwIfDependencyInspectionAborted(signal);
    const firstExtra = Buffer.allocUnsafe(1);
    const secondExtra = Buffer.allocUnsafe(1);
    const [firstFinalRead, secondFinalRead] = await Promise.all([
      firstHandle.read(firstExtra, 0, 1, firstInfo.size),
      secondHandle.read(secondExtra, 0, 1, secondInfo.size),
    ]);
    return firstFinalRead.bytesRead === 0 && secondFinalRead.bytesRead === 0;
  } finally {
    await Promise.all([firstHandle.close(), secondHandle.close()]);
  }
}

function digest(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function summarizeCommandFailure(stderr: string, stdout: string): string {
  const detail = (stderr.trim() || stdout.trim()).slice(-ERROR_SUMMARY_LIMIT);
  return [...detail]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      );
    })
    .join('');
}
