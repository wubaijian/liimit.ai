import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CommandInvocation,
  CommandResult,
  CommandRunner,
} from '../src/main/dependencyManager.js';
import {
  FixedProjectProvisioner,
  resolveNpmProcess,
} from '../src/main/fixedProjectProvisioner.js';
import type { StarterPreparationPhase } from '../src/shared/types.js';

const temporaryRoots: string[] = [];
const successfulCommand: CommandResult = {
  exitCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
};
const fixtureDependencies = {
  phaser: '3.90.0',
  'phaser3-rex-plugins': '1.80.16',
};
const fixtureDevDependencies = {
  postcss: '8.5.6',
  typescript: '5.8.3',
  vite: '6.2.6',
};
type FixedPreparationPhase = Extract<
  StarterPreparationPhase,
  'scaffold' | 'dependencies'
>;
type ReportPreparationPhase = (phase: FixedPreparationPhase) => Promise<void>;

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('FixedProjectProvisioner', () => {
  it('reports scaffold before copying and dependencies before controlled installation without exposing command details', async () => {
    const fixture = await createFixture();
    const reports: unknown[][] = [];
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: '/trusted/node',
        prefixArgs: ['/trusted/npm-cli.js'],
      }),
    });
    const reportPhase = vi.fn(async (...args: unknown[]) => {
      reports.push(args);
      if (args[0] === 'scaffold') {
        expect(await readdir(fixture.projectDirectory)).toEqual([]);
      }
      if (args[0] === 'dependencies') {
        await expect(
          readFile(
            path.join(fixture.projectDirectory, 'src', 'gameConfig.json'),
            'utf8',
          ),
        ).resolves.toBe('platformer-config');
        await expect(
          lstat(path.join(fixture.projectDirectory, 'node_modules')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
      }
    });

    await prepareWithProgress(
      provisioner,
      fixture.projectDirectory,
      reportPhase,
    );

    expect(reports).toEqual([['scaffold'], ['dependencies']]);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('reports the same two phases when locked dependencies are already ready', async () => {
    const fixture = await createFixture();
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: '/trusted/node',
        prefixArgs: ['/trusted/npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);
    const phases: FixedPreparationPhase[] = [];

    await prepareWithProgress(
      provisioner,
      fixture.projectDirectory,
      async (phase) => {
        phases.push(phase);
      },
    );

    expect(phases).toEqual(['scaffold', 'dependencies']);
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(
      (runCommand as ReturnType<typeof vi.fn>).mock.calls[1]?.[0],
    ).toMatchObject({
      args: expect.arrayContaining(['ls', '--ignore-scripts']),
    });
  });

  it('copies the fixed platformer scaffold and installs its locked dependencies once', async () => {
    const fixture = await createFixture();
    const invocations: CommandInvocation[] = [];
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      invocations.push(invocation);
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: '/trusted/node',
        prefixArgs: ['/trusted/npm-cli.js'],
      }),
    });

    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    await expect(
      readFile(
        path.join(fixture.projectDirectory, 'src', 'gameConfig.json'),
        'utf8',
      ),
    ).resolves.toBe('platformer-config');
    await expect(
      readFile(path.join(fixture.projectDirectory, 'src', 'main.ts'), 'utf8'),
    ).resolves.toBe('platformer-main');
    await expect(
      readFile(
        path.join(
          fixture.projectDirectory,
          'docs',
          'modules',
          'platformer',
          'rules.md',
        ),
        'utf8',
      ),
    ).resolves.toBe('platformer-rules');
    expect(invocations).toEqual([
      {
        executable: '/trusted/node',
        args: [
          '/trusted/npm-cli.js',
          'ci',
          '--no-audit',
          '--no-fund',
          '--ignore-scripts',
          '--registry=https://registry.npmjs.org/',
          '--loglevel=error',
        ],
        timeoutMs: 15 * 60_000,
        cwd: await realpath(fixture.projectDirectory),
        terminateProcessGroup: true,
        signal: undefined,
      },
    ]);
    await expect(
      readFile(
        path.join(fixture.projectDirectory, '.gameagent', 'dependencies.json'),
        'utf8',
      ),
    ).resolves.toMatch(/"installer": "npm-ci"/);

    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'ready' }));
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(invocations.at(-1)).toEqual({
      executable: '/trusted/node',
      args: [
        '/trusted/npm-cli.js',
        'ls',
        '--all',
        '--json',
        '--ignore-scripts',
        '--loglevel=error',
      ],
      timeoutMs: 2 * 60_000,
      cwd: await realpath(fixture.projectDirectory),
      terminateProcessGroup: true,
      signal: undefined,
    });
  });

  it('preserves user game files while recovering an interrupted core-to-platformer overlay', async () => {
    const fixture = await createFixture();
    await write(
      path.join(fixture.projectDirectory, 'src', 'gameConfig.json'),
      'core-config',
    );
    await write(
      path.join(fixture.projectDirectory, 'src', 'main.ts'),
      'user-main-edit',
    );
    const runCommand: CommandRunner = vi.fn(async () => {
      await createInstalledPackages(fixture.projectDirectory);
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });

    await provisioner.prepare(fixture.projectDirectory);

    await expect(
      readFile(
        path.join(fixture.projectDirectory, 'src', 'gameConfig.json'),
        'utf8',
      ),
    ).resolves.toBe('platformer-config');
    await expect(
      readFile(path.join(fixture.projectDirectory, 'src', 'main.ts'), 'utf8'),
    ).resolves.toBe('user-main-edit');
  });

  it('rejects an unknown project manifest before writing scaffold files or running npm', async () => {
    const fixture = await createFixture();
    await write(
      path.join(fixture.projectDirectory, 'package.json'),
      JSON.stringify({ scripts: { preinstall: 'unknown-command' } }),
    );
    const runCommand = vi.fn<CommandRunner>();
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
    });

    await expect(provisioner.prepare(fixture.projectDirectory)).rejects.toThrow(
      /package\.json.*固定横版模板不一致/,
    );
    expect(runCommand).not.toHaveBeenCalled();
    await expect(readdir(fixture.projectDirectory)).resolves.toEqual([
      'package.json',
    ]);
  });

  it('rejects an oversized project dependency manifest before reading or running npm', async () => {
    const fixture = await createFixture();
    const packagePath = path.join(fixture.projectDirectory, 'package.json');
    await write(packagePath, '');
    await truncate(packagePath, 2 * 1024 * 1024);
    const runCommand = vi.fn<CommandRunner>();
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
    });

    await expect(provisioner.prepare(fixture.projectDirectory)).rejects.toThrow(
      '超过安全大小上限',
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('preserves a large user game file without reading it into memory', async () => {
    const fixture = await createFixture();
    const gameConfigPath = path.join(
      fixture.projectDirectory,
      'src',
      'gameConfig.json',
    );
    await write(gameConfigPath, '');
    await truncate(gameConfigPath, 16 * 1024 * 1024);
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });

    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    await expect(lstat(gameConfigPath)).resolves.toMatchObject({
      size: 16 * 1024 * 1024,
    });
  });

  it('returns an actionable and sanitized npm failure', async () => {
    const fixture = await createFixture();
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand: async () => ({
        exitCode: 7,
        stdout: '',
        stderr: `${'x'.repeat(5_000)}registry unavailable\u0000\n`,
        timedOut: false,
      }),
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });

    const error = await provisioner
      .prepare(fixture.projectDirectory)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/npm 退出码 7[\s\S]*registry unavailable/);
    expect(message).not.toContain('\u0000');
    expect(message.length).toBeLessThan(4_100);
  });

  it('reports a dependency preparation timeout', async () => {
    const fixture = await createFixture();
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand: async () => ({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true,
      }),
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });

    await expect(provisioner.prepare(fixture.projectDirectory)).rejects.toThrow(
      '准备 Phaser 项目依赖超时',
    );
  });

  it('reinstalls when any direct dependency is missing or has the wrong version', async () => {
    const fixture = await createFixture();
    const runCommand: CommandRunner = vi.fn(async () => {
      await createInstalledPackages(fixture.projectDirectory);
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });

    await provisioner.prepare(fixture.projectDirectory);
    await rm(path.join(fixture.projectDirectory, 'node_modules', 'postcss'), {
      recursive: true,
    });
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));

    await write(
      path.join(
        fixture.projectDirectory,
        'node_modules',
        'phaser',
        'package.json',
      ),
      JSON.stringify({ name: 'phaser', version: '0.0.1' }),
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    expect(runCommand).toHaveBeenCalledTimes(3);
  });

  it('reinstalls when the dependency marker belongs to another platform or architecture', async () => {
    const fixture = await createFixture();
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    const markerPath = path.join(
      fixture.projectDirectory,
      '.gameagent',
      'dependencies.json',
    );
    await provisioner.prepare(fixture.projectDirectory);

    const otherPlatformMarker = JSON.parse(
      await readFile(markerPath, 'utf8'),
    ) as Record<string, unknown>;
    otherPlatformMarker.platform =
      process.platform === 'win32' ? 'darwin' : 'win32';
    await writeFile(
      markerPath,
      JSON.stringify(otherPlatformMarker, null, 2),
      'utf8',
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));

    const otherArchitectureMarker = JSON.parse(
      await readFile(markerPath, 'utf8'),
    ) as Record<string, unknown>;
    otherArchitectureMarker.architecture =
      process.arch === 'x64' ? 'arm64' : 'x64';
    await writeFile(
      markerPath,
      JSON.stringify(otherArchitectureMarker, null, 2),
      'utf8',
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    expect(runCommand).toHaveBeenCalledTimes(3);
  });

  it('self-heals a broken transitive dependency tree with npm ci', async () => {
    const fixture = await createFixture();
    let failNextValidation = false;
    const invocations: CommandInvocation[] = [];
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      invocations.push(invocation);
      if (invocation.args.includes('ls') && failNextValidation) {
        failNextValidation = false;
        return { ...successfulCommand, exitCode: 1 };
      }
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);

    failNextValidation = true;
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    expect(
      invocations.map(({ args }) =>
        args.find((argument) => argument === 'ci' || argument === 'ls'),
      ),
    ).toEqual(['ci', 'ls', 'ci']);
  });

  it('ignores legitimate root tool caches without hiding dependency changes', async () => {
    const fixture = await createFixture();
    const invocations: CommandInvocation[] = [];
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      invocations.push(invocation);
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);

    const nodeModules = path.join(fixture.projectDirectory, 'node_modules');
    await Promise.all([
      mkdir(path.join(nodeModules, '.vite-temp'), { recursive: true }),
      write(path.join(nodeModules, '.vite', 'cache.json'), 'vite-cache'),
      write(path.join(nodeModules, '.cache', 'tool.tmp'), 'tool-cache'),
    ]);

    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'ready' }));
    await expect(provisioner.build(fixture.projectDirectory)).resolves.toBe(
      undefined,
    );
    expect(
      invocations.filter((invocation) => invocation.args.includes('ci')),
    ).toHaveLength(1);

    await write(
      path.join(nodeModules, 'phaser', 'dist', 'phaser.esm.js'),
      'tampered outside cache',
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
  });

  it('recovers boundedly from oversized marker and dependency manifest files', async () => {
    const fixture = await createFixture();
    const invocations: CommandInvocation[] = [];
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      invocations.push(invocation);
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    const markerPath = path.join(
      fixture.projectDirectory,
      '.gameagent',
      'dependencies.json',
    );
    await provisioner.prepare(fixture.projectDirectory);

    await truncate(markerPath, 128 * 1024);
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));

    const phaserManifest = path.join(
      fixture.projectDirectory,
      'node_modules',
      'phaser',
      'package.json',
    );
    await truncate(phaserManifest, 2 * 1024 * 1024);
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    expect(
      invocations.filter((invocation) => invocation.args.includes('ci')),
    ).toHaveLength(3);
  });

  it('stops before dependency scanning or npm work when already cancelled', async () => {
    const fixture = await createFixture();
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    const gameConfigPath = path.join(
      fixture.projectDirectory,
      'src',
      'gameConfig.json',
    );
    await write(gameConfigPath, '');
    await truncate(gameConfigPath, 16 * 1024 * 1024);
    const controller = new AbortController();
    controller.abort();

    await expect(
      provisioner.prepare(fixture.projectDirectory, controller.signal),
    ).rejects.toThrow('依赖校验已停止');
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('reinstalls when a required TypeScript or Vite executable is missing or changed', async () => {
    const fixture = await createFixture();
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);

    await rm(
      path.join(
        fixture.projectDirectory,
        'node_modules',
        'typescript',
        'bin',
        'tsc',
      ),
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));

    await writeFile(
      path.join(
        fixture.projectDirectory,
        'node_modules',
        'vite',
        'bin',
        'vite.js',
      ),
      'corrupted-vite-entry',
      'utf8',
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    expect(runCommand).toHaveBeenCalledTimes(3);
  });

  it('reinstalls before Agent startup when a deep TypeScript or Phaser file is missing', async () => {
    const fixture = await createFixture();
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);

    await rm(
      path.join(
        fixture.projectDirectory,
        'node_modules',
        'typescript',
        'lib',
        'tsc.js',
      ),
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));

    await rm(
      path.join(
        fixture.projectDirectory,
        'node_modules',
        'phaser',
        'dist',
        'phaser.esm.js',
      ),
    );
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    expect(runCommand).toHaveBeenCalledTimes(3);
  });

  it('upgrades dependency files that still match the previously managed marker', async () => {
    const fixture = await createFixture();
    const runCommand: CommandRunner = vi.fn(async () => {
      await createInstalledPackages(fixture.projectDirectory);
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);

    const markerPath = path.join(
      fixture.projectDirectory,
      '.gameagent',
      'dependencies.json',
    );
    const legacyMarker = JSON.parse(
      await readFile(markerPath, 'utf8'),
    ) as Record<string, unknown>;
    legacyMarker.schemaVersion = 1;
    delete legacyMarker.platform;
    delete legacyMarker.architecture;
    await writeFile(markerPath, JSON.stringify(legacyMarker, null, 2), 'utf8');

    const upgraded = fixtureDependencyFiles({
      dependencies: { ...fixtureDependencies, phaser: '3.91.0' },
    });
    await Promise.all([
      write(
        path.join(fixture.templateCoreDirectory, 'package.json'),
        upgraded.manifest,
      ),
      write(
        path.join(fixture.templateCoreDirectory, 'package-lock.json'),
        upgraded.lockfile,
      ),
    ]);

    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    await expect(
      readFile(path.join(fixture.projectDirectory, 'package.json'), 'utf8'),
    ).resolves.toContain('"phaser": "3.91.0"');
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it('rejects unsafe template lifecycle hooks before touching the project', async () => {
    const fixture = await createFixture();
    const unsafe = fixtureDependencyFiles({
      scripts: { postinstall: 'unknown-command' },
    });
    await write(
      path.join(fixture.templateCoreDirectory, 'package.json'),
      unsafe.manifest,
    );
    const runCommand = vi.fn<CommandRunner>();
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
    });

    await expect(provisioner.prepare(fixture.projectDirectory)).rejects.toThrow(
      '禁止根级 postinstall',
    );
    expect(runCommand).not.toHaveBeenCalled();
    await expect(readdir(fixture.projectDirectory)).resolves.toEqual([]);
  });

  it('rejects a template that replaces the controlled build script', async () => {
    const fixture = await createFixture();
    const unsafe = fixtureDependencyFiles({
      scripts: { build: 'unknown-command' },
    });
    await write(
      path.join(fixture.templateCoreDirectory, 'package.json'),
      unsafe.manifest,
    );
    const runCommand = vi.fn<CommandRunner>();
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
    });

    await expect(provisioner.prepare(fixture.projectDirectory)).rejects.toThrow(
      'build 脚本与受控构建契约不一致',
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('rejects a lockfile package outside the trusted npm registry', async () => {
    const fixture = await createFixture();
    const lockPath = path.join(
      fixture.templateCoreDirectory,
      'package-lock.json',
    );
    const lockfile = JSON.parse(await readFile(lockPath, 'utf8')) as {
      packages: Record<string, { resolved?: string }>;
    };
    lockfile.packages['node_modules/phaser'].resolved =
      'https://example.invalid/phaser.tgz';
    await write(lockPath, `${JSON.stringify(lockfile, null, 2)}\n`);
    const runCommand = vi.fn<CommandRunner>();
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
    });

    await expect(provisioner.prepare(fixture.projectDirectory)).rejects.toThrow(
      '来源或完整性不受信任',
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('runs a controlled final build only after locked dependencies are ready', async () => {
    const fixture = await createFixture();
    const invocations: CommandInvocation[] = [];
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      invocations.push(invocation);
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: '/trusted/node',
        prefixArgs: ['/trusted/npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);

    await expect(provisioner.build(fixture.projectDirectory)).resolves.toBe(
      undefined,
    );
    expect(invocations.at(-1)).toEqual({
      executable: '/trusted/node',
      args: ['/trusted/npm-cli.js', 'run', 'build', '--ignore-scripts'],
      timeoutMs: 5 * 60_000,
      cwd: await realpath(fixture.projectDirectory),
      terminateProcessGroup: true,
      signal: undefined,
    });
  });

  it('forces a clean dependency reinstall after any non-zero controlled build', async () => {
    const fixture = await createFixture();
    let failBuild = true;
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      if (invocation.args.includes('build') && failBuild) {
        failBuild = false;
        return { ...successfulCommand, exitCode: 1 };
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    const markerPath = path.join(
      fixture.projectDirectory,
      '.gameagent',
      'dependencies.json',
    );
    await provisioner.prepare(fixture.projectDirectory);

    await expect(provisioner.build(fixture.projectDirectory)).rejects.toThrow(
      '最终构建失败',
    );
    await expect(lstat(markerPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      provisioner.prepare(fixture.projectDirectory),
    ).resolves.toEqual(expect.objectContaining({ dependencies: 'installed' }));
    await expect(provisioner.build(fixture.projectDirectory)).resolves.toBe(
      undefined,
    );
  });

  it('removes the previous dist before a successful controlled build', async () => {
    const fixture = await createFixture();
    const oldDist = path.join(fixture.projectDirectory, 'dist');
    const alternateOutput = path.join(fixture.projectDirectory, 'other');
    const runCommand: CommandRunner = vi.fn(async (invocation) => {
      if (invocation.args.includes('ci')) {
        await createInstalledPackages(fixture.projectDirectory);
      }
      if (invocation.args.includes('build')) {
        await expect(lstat(oldDist)).rejects.toMatchObject({ code: 'ENOENT' });
        await write(path.join(alternateOutput, 'index.html'), 'new output');
      }
      return successfulCommand;
    });
    const provisioner = new FixedProjectProvisioner(fixture.locations, {
      runCommand,
      resolveNpm: async () => ({
        executable: 'node',
        prefixArgs: ['npm-cli.js'],
      }),
    });
    await provisioner.prepare(fixture.projectDirectory);
    await write(path.join(oldDist, 'index.html'), 'stale playable output');

    await expect(provisioner.build(fixture.projectDirectory)).resolves.toBe(
      undefined,
    );
    await expect(lstat(oldDist)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(path.join(alternateOutput, 'index.html'), 'utf8'),
    ).resolves.toBe('new output');
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a symlinked dist instead of deleting its external target',
    async () => {
      const fixture = await createFixture();
      const outside = path.join(fixture.root, 'outside-dist');
      const invocations: CommandInvocation[] = [];
      const runCommand: CommandRunner = vi.fn(async (invocation) => {
        invocations.push(invocation);
        if (invocation.args.includes('ci')) {
          await createInstalledPackages(fixture.projectDirectory);
        }
        return successfulCommand;
      });
      const provisioner = new FixedProjectProvisioner(fixture.locations, {
        runCommand,
        resolveNpm: async () => ({
          executable: 'node',
          prefixArgs: ['npm-cli.js'],
        }),
      });
      await provisioner.prepare(fixture.projectDirectory);
      await mkdir(outside);
      await writeFile(path.join(outside, 'keep.txt'), 'keep', 'utf8');
      await symlink(outside, path.join(fixture.projectDirectory, 'dist'));

      await expect(provisioner.build(fixture.projectDirectory)).rejects.toThrow(
        'dist 构建目录类型不安全',
      );
      expect(
        invocations.some((invocation) => invocation.args.includes('build')),
      ).toBe(false);
      await expect(
        readFile(path.join(outside, 'keep.txt'), 'utf8'),
      ).resolves.toBe('keep');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a symlinked marker directory without writing outside the project',
    async () => {
      const fixture = await createFixture();
      const outside = path.join(fixture.root, 'outside-marker');
      await mkdir(outside);
      await symlink(outside, path.join(fixture.projectDirectory, '.gameagent'));
      const runCommand = vi.fn<CommandRunner>();
      const provisioner = new FixedProjectProvisioner(fixture.locations, {
        runCommand,
      });

      await expect(
        provisioner.prepare(fixture.projectDirectory),
      ).rejects.toThrow('状态目录类型不安全');
      expect(runCommand).not.toHaveBeenCalled();
      await expect(readdir(outside)).resolves.toEqual([]);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rechecks node_modules after npm finishes',
    async () => {
      const fixture = await createFixture();
      const outside = path.join(fixture.root, 'outside-install');
      await mkdir(outside);
      const provisioner = new FixedProjectProvisioner(fixture.locations, {
        runCommand: async () => {
          await symlink(
            outside,
            path.join(fixture.projectDirectory, 'node_modules'),
          );
          return successfulCommand;
        },
        resolveNpm: async () => ({
          executable: 'node',
          prefixArgs: ['npm-cli.js'],
        }),
      });

      await expect(
        provisioner.prepare(fixture.projectDirectory),
      ).rejects.toThrow('node_modules 是符号链接');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a symlinked node_modules directory before running npm',
    async () => {
      const fixture = await createFixture();
      const outside = path.join(fixture.root, 'outside-node-modules');
      await mkdir(outside);
      await symlink(
        outside,
        path.join(fixture.projectDirectory, 'node_modules'),
      );
      const runCommand = vi.fn<CommandRunner>();
      const provisioner = new FixedProjectProvisioner(fixture.locations, {
        runCommand,
      });

      await expect(
        provisioner.prepare(fixture.projectDirectory),
      ).rejects.toThrow('node_modules 是符号链接');
      expect(runCommand).not.toHaveBeenCalled();
    },
  );
});

describe('resolveNpmProcess', () => {
  it('prefers a configured Node executable and npm CLI pair', async () => {
    const existing = new Set(['/managed/node', '/managed/npm-cli.js']);

    await expect(
      resolveNpmProcess({
        environment: {
          npm_node_execpath: '/managed/node',
          npm_execpath: '/managed/npm-cli.js',
        },
        fileExists: async (filePath) => existing.has(filePath),
      }),
    ).resolves.toEqual({
      executable: '/managed/node',
      prefixArgs: ['/managed/npm-cli.js'],
    });
  });

  it('trims and unquotes Windows PATH entries when locating npm', async () => {
    const node = String.raw`D:\Node\node.exe`;
    const npmCli = String.raw`D:\Node\node_modules\npm\bin\npm-cli.js`;
    const existing = new Set([node, npmCli]);

    await expect(
      resolveNpmProcess({
        platform: 'win32',
        environment: { PATH: String.raw` "D:\Node" ; "C:\Tools" ` },
        homeDirectory: String.raw`C:\Users\tester`,
        fileExists: async (filePath) => existing.has(filePath),
      }),
    ).resolves.toEqual({ executable: node, prefixArgs: [npmCli] });
  });

  it('treats a custom Windows NVM_SYMLINK as the direct Node directory', async () => {
    const nvmDirectory = String.raw`D:\Managed Node\current`;
    const node = String.raw`D:\Managed Node\current\node.exe`;
    const npmCli = String.raw`D:\Managed Node\current\node_modules\npm\bin\npm-cli.js`;
    const existing = new Set([node, npmCli]);

    await expect(
      resolveNpmProcess({
        platform: 'win32',
        environment: { NVM_SYMLINK: ` "${nvmDirectory}" ` },
        homeDirectory: String.raw`C:\Users\tester`,
        fileExists: async (filePath) => existing.has(filePath),
        listDirectory: async () => [],
      }),
    ).resolves.toEqual({ executable: node, prefixArgs: [npmCli] });
  });

  it('prefers the newest installed NVM Node version', async () => {
    const homeDirectory = '/Users/tester';
    const nvmRoot = `${homeDirectory}/.nvm/versions/node`;
    const node = `${nvmRoot}/v22.12.0/bin/node`;
    const npmCli = `${nvmRoot}/v22.12.0/lib/node_modules/npm/bin/npm-cli.js`;
    const existing = new Set([
      node,
      npmCli,
      `${nvmRoot}/v18.20.5/bin/node`,
      `${nvmRoot}/v18.20.5/lib/node_modules/npm/bin/npm-cli.js`,
    ]);

    await expect(
      resolveNpmProcess({
        platform: 'darwin',
        environment: {},
        homeDirectory,
        fileExists: async (filePath) => existing.has(filePath),
        listDirectory: async (directory) =>
          directory === nvmRoot
            ? ['v18.20.5', 'not-a-version', 'v22.12.0', 'v20.18.1']
            : [],
      }),
    ).resolves.toEqual({ executable: node, prefixArgs: [npmCli] });
  });

  it('locates npm inside the newest Volta Node tool image', async () => {
    const voltaRoot = '/managed/volta';
    const imagesRoot = `${voltaRoot}/tools/image/node`;
    const node = `${imagesRoot}/22.11.0/bin/node`;
    const npmCli = `${imagesRoot}/22.11.0/lib/node_modules/npm/bin/npm-cli.js`;
    const existing = new Set([node, npmCli]);

    await expect(
      resolveNpmProcess({
        platform: 'linux',
        environment: { VOLTA_HOME: voltaRoot },
        homeDirectory: '/home/tester',
        fileExists: async (filePath) => existing.has(filePath),
        listDirectory: async (directory) =>
          directory === imagesRoot ? ['18.20.5', '22.11.0'] : [],
      }),
    ).resolves.toEqual({ executable: node, prefixArgs: [npmCli] });
  });

  it('supports the Windows Volta tool image layout', async () => {
    const voltaRoot = String.raw`D:\Volta Data`;
    const imagesRoot = String.raw`D:\Volta Data\tools\image\node`;
    const node = String.raw`D:\Volta Data\tools\image\node\22.11.0\node.exe`;
    const npmCli = String.raw`D:\Volta Data\tools\image\node\22.11.0\node_modules\npm\bin\npm-cli.js`;
    const existing = new Set([node, npmCli]);

    await expect(
      resolveNpmProcess({
        platform: 'win32',
        environment: { VOLTA_HOME: ` "${voltaRoot}" ` },
        homeDirectory: String.raw`C:\Users\tester`,
        fileExists: async (filePath) => existing.has(filePath),
        listDirectory: async (directory) =>
          directory === imagesRoot ? ['20.18.1', '22.11.0'] : [],
      }),
    ).resolves.toEqual({ executable: node, prefixArgs: [npmCli] });
  });

  it('supports the Debian npm CLI layout under /usr/share/nodejs', async () => {
    const node = '/usr/bin/node';
    const npmCli = '/usr/share/nodejs/npm/bin/npm-cli.js';
    const existing = new Set([node, npmCli]);

    await expect(
      resolveNpmProcess({
        platform: 'linux',
        environment: { PATH: '/usr/bin' },
        homeDirectory: '/home/tester',
        fileExists: async (filePath) => existing.has(filePath),
        listDirectory: async () => [],
      }),
    ).resolves.toEqual({ executable: node, prefixArgs: [npmCli] });
  });

  it('explains how to recover when Node and npm cannot be located', async () => {
    await expect(
      resolveNpmProcess({
        environment: {},
        fileExists: async () => false,
        listDirectory: async () => [],
      }),
    ).rejects.toThrow('设置 → 运行环境');
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'liimit-provisioner-'));
  temporaryRoots.push(root);
  const templatesDir = path.join(root, 'templates');
  const docsDir = path.join(root, 'docs-source');
  const projectDirectory = path.join(root, 'project');
  const { manifest, lockfile } = fixtureDependencyFiles();
  await Promise.all([
    mkdir(projectDirectory, { recursive: true }),
    write(path.join(templatesDir, 'core', 'package.json'), manifest),
    write(path.join(templatesDir, 'core', 'package-lock.json'), lockfile),
    write(path.join(templatesDir, 'core', 'src', 'main.ts'), 'core-main'),
    write(
      path.join(templatesDir, 'modules', 'platformer', 'src', 'main.ts'),
      'platformer-main',
    ),
    write(
      path.join(templatesDir, 'core', 'src', 'gameConfig.json'),
      'core-config',
    ),
    write(
      path.join(
        templatesDir,
        'modules',
        'platformer',
        'src',
        'gameConfig.json',
      ),
      'platformer-config',
    ),
    write(
      path.join(
        templatesDir,
        'modules',
        'platformer',
        'src',
        'scenes',
        'Level.ts',
      ),
      'platformer-level',
    ),
    write(path.join(docsDir, 'gdd', 'core.md'), 'core-gdd'),
    write(path.join(docsDir, 'asset_protocol.md'), 'asset-protocol'),
    write(path.join(docsDir, 'debug_protocol.md'), 'debug-protocol'),
    write(
      path.join(docsDir, 'modules', 'platformer', 'rules.md'),
      'platformer-rules',
    ),
  ]);
  return {
    root,
    projectDirectory,
    locations: { templatesDir, docsDir },
    templateCoreDirectory: path.join(templatesDir, 'core'),
  };
}

async function prepareWithProgress(
  provisioner: FixedProjectProvisioner,
  projectDirectory: string,
  reportPhase: ReportPreparationPhase,
): Promise<unknown> {
  const prepare = provisioner.prepare.bind(provisioner) as (
    projectDirectory: string,
    signal: AbortSignal | undefined,
    reportPhase: ReportPreparationPhase,
  ) => Promise<unknown>;
  return prepare(projectDirectory, undefined, reportPhase);
}

async function createInstalledPackages(
  projectDirectory: string,
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(projectDirectory, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };
  const nodeModules = path.join(projectDirectory, 'node_modules');
  await rm(nodeModules, { recursive: true, force: true });
  await Promise.all(
    Object.entries(dependencies).map(([packageName, version]) =>
      write(
        path.join(
          projectDirectory,
          'node_modules',
          packageName,
          'package.json',
        ),
        JSON.stringify({ name: packageName, version }),
      ),
    ),
  );
  const typescriptCli = path.join(nodeModules, 'typescript', 'bin', 'tsc');
  const viteCli = path.join(nodeModules, 'vite', 'bin', 'vite.js');
  await Promise.all([
    write(typescriptCli, '#!/usr/bin/env node\nrequire("../lib/tsc.js");\n'),
    write(
      path.join(nodeModules, 'typescript', 'lib', 'tsc.js'),
      'module.exports = {};\n',
    ),
    write(viteCli, '#!/usr/bin/env node\nimport "../dist/node/cli.js";\n'),
    write(
      path.join(nodeModules, 'vite', 'dist', 'node', 'cli.js'),
      'export {};\n',
    ),
    write(
      path.join(nodeModules, 'phaser', 'dist', 'phaser.esm.js'),
      'export default {};\n',
    ),
    mkdir(path.join(nodeModules, '.bin'), { recursive: true }),
  ]);
  if (process.platform === 'win32') {
    await Promise.all([
      write(
        path.join(nodeModules, '.bin', 'tsc.cmd'),
        '@node "%~dp0\\..\\typescript\\bin\\tsc" %*\r\n',
      ),
      write(
        path.join(nodeModules, '.bin', 'vite.cmd'),
        '@node "%~dp0\\..\\vite\\bin\\vite.js" %*\r\n',
      ),
    ]);
  } else {
    await Promise.all([
      symlink(
        path.join('..', 'typescript', 'bin', 'tsc'),
        path.join(nodeModules, '.bin', 'tsc'),
      ),
      symlink(
        path.join('..', 'vite', 'bin', 'vite.js'),
        path.join(nodeModules, '.bin', 'vite'),
      ),
    ]);
  }
}

function fixtureDependencyFiles(
  overrides: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  } = {},
) {
  const dependencies = overrides.dependencies ?? fixtureDependencies;
  const devDependencies = overrides.devDependencies ?? fixtureDevDependencies;
  const manifestObject = {
    name: 'fixed-platformer',
    private: true,
    version: '0.0.0',
    scripts: overrides.scripts ?? { build: 'tsc --noEmit && vite build' },
    dependencies,
    devDependencies,
  };
  const packages: Record<string, unknown> = {
    '': {
      name: manifestObject.name,
      version: manifestObject.version,
      dependencies,
      devDependencies,
    },
  };
  for (const [packageName, version] of Object.entries({
    ...dependencies,
    ...devDependencies,
  })) {
    packages[`node_modules/${packageName}`] = {
      version,
      resolved: `https://registry.npmjs.org/${packageName}/-/${packageName
        .split('/')
        .at(-1)}-${version}.tgz`,
      integrity: 'sha512-YWJjZA==',
    };
  }
  return {
    manifest: `${JSON.stringify(manifestObject, null, 2)}\n`,
    lockfile: `${JSON.stringify(
      {
        name: manifestObject.name,
        version: manifestObject.version,
        lockfileVersion: 3,
        requires: true,
        packages,
      },
      null,
      2,
    )}\n`,
  };
}

async function write(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}
