import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export interface GameTypeClassifierParams {
  /**
   * User's game description or idea
   */
  game_description: string;
}

export type GameArchetype = 'platformer';

export interface ClassificationResult {
  archetype: GameArchetype;
  reasoning: string;
  physicsProfile: {
    hasGravity: true;
    perspective: 'side';
    movementType: 'continuous';
  };
}

const PLATFORMER_CLASSIFICATION: ClassificationResult = {
  archetype: 'platformer',
  reasoning: 'liimit.ai 仅支持 Phaser 3 · 2D 横版平台游戏',
  physicsProfile: {
    hasGravity: true,
    perspective: 'side',
    movementType: 'continuous',
  },
};

class GameTypeClassifierInvocation extends BaseToolInvocation<
  GameTypeClassifierParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: GameTypeClassifierParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `确定使用 platformer 并在项目目录创建横版脚手架。`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.config.getTargetDir() }];
  }

  override async shouldConfirmExecute(): Promise<
    ToolCallConfirmationDetails | false
  > {
    return {
      type: 'info',
      title: '确认创建游戏脚手架',
      prompt:
        `liimit.ai 将在 ${this.config.getTargetDir()} 中复制核心模板、类型模块与契约文档。` +
        '已有普通文件会保留，符号链接和越界路径会被拒绝。',
      onConfirm: async () => undefined,
    };
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const classification: ClassificationResult = {
        ...PLATFORMER_CLASSIFICATION,
        physicsProfile: { ...PLATFORMER_CLASSIFICATION.physicsProfile },
      };

      const scaffold = await scaffoldGameProject({
        projectRoot: this.config.getTargetDir(),
        templatesDir:
          process.env.GAME_TEMPLATES_DIR || path.resolve('../../templates'),
        docsDir: process.env.GAME_DOCS_DIR || path.resolve('../../docs'),
        archetype: classification.archetype,
        starterTemplateId: process.env.GAME_STARTER_TEMPLATE_ID,
      });

      const llmContent = this.formatLLMContent(classification, scaffold);
      const displayContent = this.formatDisplayContent(classification);

      return {
        llmContent,
        returnDisplay: displayContent,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        llmContent: `游戏类型识别失败：${errorMessage}`,
        returnDisplay: `**游戏类型识别失败**\n\n错误：${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  private formatLLMContent(
    result: ClassificationResult,
    scaffold: GameScaffoldResult,
  ): string {
    if (process.env.GAME_STARTER_TEMPLATE_ID === 'ai-foundation') {
      return '当前是 AI 自主创建项目。基础引擎已由桌面端准备，本次未复制任何示例。请读取 src/AI_CREATION.md，直接按用户要求生成关卡、规则和画面；不要重新套用示例或调用 generate_gdd 绕行。';
    }
    return `<classification>
游戏类型：${result.archetype}
判断理由：${result.reasoning}

物理画像：
- Has Gravity：${result.physicsProfile.hasGravity}
- Perspective：${result.physicsProfile.perspective}
- Movement Type：${result.physicsProfile.movementType}
</classification>

<system-reminder>
游戏类型识别完成：**${result.archetype}**

## 工程脚手架已由工具完成

- 新复制 ${scaffold.copiedFiles} 个文件
- 保留 ${scaffold.preservedFiles} 个已存在文件
- 模板类型：${result.archetype}

脚手架使用受控的 Node.js 文件 API 完成，不需要执行 Bash、PowerShell 或 cmd 命令。

## 脚手架完成后：继续 Phase 2（生成 GDD）

**此时禁止读取模板源码**——模板源码只在 Phase 5（代码实现）读取，过早读取会浪费上下文。

下一步调用真实工具名 \`generate_gdd\`，参数：
- \`raw_user_requirement\`：用户游戏创意
- \`archetype\`："${result.archetype}"
</system-reminder>`;
  }

  private formatDisplayContent(result: ClassificationResult): string {
    return `**游戏类型识别**

**Archetype**：\`${result.archetype}\`
**说明**：侧视角 + 重力（Phaser 3 · 2D 横版平台）

**物理分析**：
| 属性 | 值 |
|----------|-------|
| Has Gravity | ${result.physicsProfile.hasGravity ? '是' : '否'} |
| Perspective | ${result.physicsProfile.perspective} |
| Movement | ${result.physicsProfile.movementType} |

**判断理由**：${result.reasoning}

---
脚手架已准备，下一步继续生成 GDD。`;
  }
}

export interface GameScaffoldResult {
  copiedFiles: number;
  preservedFiles: number;
}

interface GameScaffoldContext {
  createdFiles: Set<string>;
  preservedFiles: Set<string>;
  overlayCandidates: Map<string, string>;
}

const DEPENDENCY_GROUPS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const;
const EXACT_NPM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

type DependencyGroup = (typeof DEPENDENCY_GROUPS)[number];
type JsonObject = Record<string, unknown>;

/**
 * Validate the immutable npm contract consumed by Desktop dependency setup.
 *
 * The Desktop service is responsible for running the fixed npm command. Core
 * only verifies that the scaffold corpus contains a private project manifest,
 * exact direct versions and a matching npm v3 lockfile before copying any
 * project files.
 */
export async function validateTemplateDependencyContract(
  templateCoreDir: string,
): Promise<void> {
  const coreDir = path.resolve(templateCoreDir);
  const [manifest, lockfile] = await Promise.all([
    readTemplateJsonObject(path.join(coreDir, 'package.json')),
    readTemplateJsonObject(path.join(coreDir, 'package-lock.json')),
  ]);

  if (manifest['private'] !== true) {
    throw new Error('模板 package.json 必须声明 private: true');
  }
  if (lockfile['lockfileVersion'] !== 3) {
    throw new Error('模板 package-lock.json 必须使用 lockfileVersion 3');
  }

  const lockPackages = requireJsonObject(
    lockfile['packages'],
    '模板 package-lock.json 缺少 packages 对象',
  );
  const lockRoot = requireJsonObject(
    lockPackages[''],
    '模板 package-lock.json 缺少根项目记录',
  );
  const seenDependencies = new Set<string>();

  for (const group of DEPENDENCY_GROUPS) {
    const manifestDependencies = readDependencyGroup(
      manifest[group],
      `package.json ${group}`,
    );
    const lockedDependencies = readDependencyGroup(
      lockRoot[group],
      `package-lock.json ${group}`,
    );
    for (const [name, version] of Object.entries(manifestDependencies)) {
      if (seenDependencies.has(name)) {
        throw new Error(`模板依赖 ${name} 不能重复出现在多个依赖分组`);
      }
      seenDependencies.add(name);
      if (!EXACT_NPM_VERSION.test(version)) {
        throw new Error(
          `模板依赖 ${name} 必须固定为精确版本，不能使用范围、标签、URL 或本地路径`,
        );
      }
    }

    assertSameDependencyGroup(group, manifestDependencies, lockedDependencies);

    for (const [name, version] of Object.entries(manifestDependencies)) {
      const lockedPackage = requireJsonObject(
        lockPackages[`node_modules/${name}`],
        `模板 package-lock.json 缺少直接依赖 ${name}`,
      );
      if (lockedPackage['version'] !== version) {
        throw new Error(
          `模板 package-lock.json 与 package.json 不一致：${name} 应为 ${version}`,
        );
      }
    }
  }
}

export async function scaffoldGameProject(input: {
  projectRoot: string;
  templatesDir: string;
  docsDir: string;
  archetype: GameArchetype;
  starterTemplateId?: string;
}): Promise<GameScaffoldResult> {
  if ((input as { archetype: unknown }).archetype !== 'platformer') {
    throw new Error('游戏脚手架只支持 platformer archetype');
  }
  const projectRoot = path.resolve(input.projectRoot);
  if (input.starterTemplateId === 'ai-foundation') {
    await assertDirectory(projectRoot, '项目目录不存在或类型不安全');
    await assertDirectory(
      path.join(projectRoot, 'src'),
      '基础工作区尚未准备，请在桌面端重新准备',
    );
    for (const file of [
      'levels.json',
      'gameInfo.json',
      'visualStyle.json',
      'main.ts',
    ]) {
      const stat = await fs
        .lstat(path.join(projectRoot, 'src', file))
        .catch(() => undefined);
      if (!stat?.isFile() || stat.isSymbolicLink())
        throw new Error(
          '基础工作区缺少安全文件，请在桌面端重新准备；不得复制示例替代。',
        );
    }
    return { copiedFiles: 0, preservedFiles: 4 };
  }
  const templatesDir = path.resolve(input.templatesDir);
  const docsDir = path.resolve(input.docsDir);
  await validateTemplateDependencyContract(path.join(templatesDir, 'core'));
  const context: GameScaffoldContext = {
    createdFiles: new Set(),
    preservedFiles: new Set(),
    overlayCandidates: new Map(),
  };

  await assertDirectory(projectRoot, '项目目录不存在或类型不安全');
  await copyDirectoryContents(
    path.join(templatesDir, 'core'),
    projectRoot,
    context,
    projectRoot,
  );
  await copyDirectoryContents(
    path.join(templatesDir, 'modules', input.archetype, 'src'),
    containedDestination(projectRoot, 'src'),
    context,
    projectRoot,
  );
  await copyOneFile(
    path.join(docsDir, 'gdd', 'core.md'),
    containedDestination(projectRoot, 'docs', 'gdd', 'core.md'),
    context,
    projectRoot,
  );
  await copyOneFile(
    path.join(docsDir, 'asset_protocol.md'),
    containedDestination(projectRoot, 'docs', 'asset_protocol.md'),
    context,
    projectRoot,
  );
  await copyOneFile(
    path.join(docsDir, 'debug_protocol.md'),
    containedDestination(projectRoot, 'docs', 'debug_protocol.md'),
    context,
    projectRoot,
  );
  await copyDirectoryContents(
    path.join(docsDir, 'modules', input.archetype),
    containedDestination(projectRoot, 'docs', 'modules', input.archetype),
    context,
    projectRoot,
  );
  for (const destination of context.overlayCandidates.keys()) {
    context.preservedFiles.add(destination);
  }
  return {
    copiedFiles: context.createdFiles.size,
    preservedFiles: context.preservedFiles.size,
  };
}

async function readTemplateJsonObject(filePath: string): Promise<JsonObject> {
  const info = await fs.lstat(filePath).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink()) {
    throw new Error(`模板依赖契约文件不存在或类型不安全：${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`模板依赖契约不是有效 JSON：${filePath}`, {
      cause: error,
    });
  }
  return requireJsonObject(parsed, `模板依赖契约根必须是对象：${filePath}`);
}

function requireJsonObject(value: unknown, message: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as JsonObject;
}

function readDependencyGroup(
  value: unknown,
  label: string,
): Record<string, string> {
  if (value === undefined) return {};
  const group = requireJsonObject(value, `模板 ${label} 必须是对象`);
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(group)) {
    if (typeof version !== 'string') {
      throw new Error(`模板依赖 ${name} 必须固定为精确版本字符串`);
    }
    result[name] = version;
  }
  return result;
}

function assertSameDependencyGroup(
  group: DependencyGroup,
  manifestDependencies: Record<string, string>,
  lockedDependencies: Record<string, string>,
): void {
  const manifestEntries = Object.entries(manifestDependencies).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const lockedEntries = Object.entries(lockedDependencies).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (JSON.stringify(manifestEntries) !== JSON.stringify(lockedEntries)) {
    throw new Error(`模板 package-lock.json 与 package.json 不一致：${group}`);
  }
}

async function copyDirectoryContents(
  source: string,
  destination: string,
  context: GameScaffoldContext,
  projectRoot: string,
): Promise<void> {
  await assertDirectory(source, `脚手架目录不存在或类型不安全：${source}`);
  await ensureSafeProjectDirectory(projectRoot, destination);
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`脚手架不允许符号链接：${sourcePath}`);
    }
    if (entry.isDirectory()) {
      await copyDirectoryContents(
        sourcePath,
        destinationPath,
        context,
        projectRoot,
      );
    } else if (entry.isFile()) {
      await copyOneFile(sourcePath, destinationPath, context, projectRoot);
    } else {
      throw new Error(`脚手架包含不支持的文件类型：${sourcePath}`);
    }
  }
}

async function copyOneFile(
  source: string,
  destination: string,
  context: GameScaffoldContext,
  projectRoot: string,
): Promise<void> {
  const sourceInfo = await fs.lstat(source).catch(() => undefined);
  if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink()) {
    throw new Error(`脚手架文件不存在或类型不安全：${source}`);
  }
  await ensureSafeProjectDirectory(projectRoot, path.dirname(destination));
  const destinationInfo = await fs.lstat(destination).catch(() => undefined);
  if (destinationInfo) {
    if (!destinationInfo.isFile() || destinationInfo.isSymbolicLink()) {
      throw new Error(`项目中已有不安全的脚手架目标：${destination}`);
    }
    if (context.createdFiles.has(destination)) {
      // The archetype module intentionally overlays files created from the
      // core template during this same invocation.
      await fs.copyFile(source, destination);
      return;
    }
    const expectedDigest = context.overlayCandidates.get(destination);
    if (expectedDigest !== undefined) {
      context.overlayCandidates.delete(destination);
      if ((await digestFile(destination)) === expectedDigest) {
        await fs.copyFile(source, destination);
        context.preservedFiles.delete(destination);
        context.createdFiles.add(destination);
        return;
      }
      context.preservedFiles.add(destination);
      return;
    }
    const identicalDigest = await identicalFileDigest(source, destination);
    if (identicalDigest !== undefined) {
      context.overlayCandidates.set(destination, identicalDigest);
    } else {
      context.preservedFiles.add(destination);
    }
    return;
  }
  try {
    await fs.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    context.createdFiles.add(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const racedInfo = await fs.lstat(destination);
    if (!racedInfo.isFile() || racedInfo.isSymbolicLink()) {
      throw new Error(`项目中已有不安全的脚手架目标：${destination}`);
    }
    const identicalDigest = await identicalFileDigest(source, destination);
    if (identicalDigest !== undefined) {
      context.overlayCandidates.set(destination, identicalDigest);
    } else {
      context.preservedFiles.add(destination);
    }
  }
}

async function identicalFileDigest(
  source: string,
  destination: string,
): Promise<string | undefined> {
  const [sourceContent, destinationContent] = await Promise.all([
    fs.readFile(source),
    fs.readFile(destination),
  ]);
  if (!sourceContent.equals(destinationContent)) return undefined;
  return digestContent(sourceContent);
}

async function digestFile(filePath: string): Promise<string> {
  return digestContent(await fs.readFile(filePath));
}

function digestContent(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

async function ensureSafeProjectDirectory(
  projectRoot: string,
  directory: string,
): Promise<void> {
  const relative = path.relative(projectRoot, directory);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('脚手架目标超出项目目录');
  }
  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      await fs.mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const info = await fs.lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`项目中已有不安全的脚手架目录：${current}`);
    }
  }
}

async function assertDirectory(
  directory: string,
  message: string,
): Promise<void> {
  const info = await fs.lstat(directory).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(message);
}

function containedDestination(root: string, ...segments: string[]): string {
  const destination = path.resolve(root, ...segments);
  const relative = path.relative(root, destination);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('脚手架目标超出项目目录');
  }
  return destination;
}

export class GameTypeClassifierTool extends BaseDeclarativeTool<
  GameTypeClassifierParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.GAME_TYPE_CLASSIFIER;

  constructor(private config: Config) {
    super(
      GameTypeClassifierTool.Name,
      ToolDisplayNames.GAME_TYPE_CLASSIFIER,
      `确定性选择 platformer，并把固定 Phaser 3 · 2D 横版模板与文档安全地复制到项目目录；不会调用分类模型。`,
      Kind.Edit,
      {
        type: 'object',
        properties: {
          game_description: {
            type: 'string',
            description:
              '用户的游戏创意或描述，可包含题材、玩法机制和参考游戏。例如：“制作一个类似 Terraria 的游戏”或“推动箱子的网格解谜游戏”。',
          },
        },
        required: ['game_description'],
      },
      false,
      true,
    );
  }

  protected override validateToolParamValues(
    params: GameTypeClassifierParams,
  ): string | null {
    if (!params.game_description || params.game_description.trim() === '') {
      return 'game_description must be a non-empty string';
    }

    if (params.game_description.trim().length < 3) {
      return 'Game description is too short (minimum 3 characters)';
    }

    return null;
  }

  protected createInvocation(
    params: GameTypeClassifierParams,
  ): ToolInvocation<GameTypeClassifierParams, ToolResult> {
    return new GameTypeClassifierInvocation(this.config, params);
  }
}
