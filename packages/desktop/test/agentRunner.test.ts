import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FIXED_PRODUCT_MODE,
  type AgentEvent,
  type AppSettings,
  type ProjectRecord,
} from '../src/shared/types.js';
import {
  AgentRunner,
  assertSameProjectIdentity,
  assetIdleTimeoutFromEnv,
  assetOutputDirFromInput,
  buildCredentialPayload,
  buildRuntimeArguments,
  deriveRuntimeProductPolicy,
  inspectAssetProgress,
  isRuntimeFailure,
  PendingToolTracker,
  sanitizeRuntimeEnvironment,
  terminateProcessTree,
  withDesktopToolPaths,
} from '../src/main/agentRunner.js';
import type { ChildProcess } from 'node:child_process';
import { makeReadyStarterPreparation } from './starterPreparationFixtures.js';

describe('deriveRuntimeProductPolicy', () => {
  it('固定项目只启用 platformer，不加载 Skills 或 MCP', () => {
    expect(
      deriveRuntimeProductPolicy({ productMode: FIXED_PRODUCT_MODE.id }),
    ).toEqual({
      fixedArchetype: 'platformer',
      loadSkills: false,
      mcpServers: [],
    });
  });

  it.each([undefined, 'unknown-mode'])(
    '拒绝 productMode=%s 的非固定项目进入 Runtime',
    (productMode) => {
      expect(() =>
        deriveRuntimeProductPolicy({ productMode } as never),
      ).toThrow('只允许运行 Phaser 3 · 2D 横版平台项目');
    },
  );
});

describe('Agent project identity guard', () => {
  it('允许同一项目 ID 和目录继续执行', () => {
    expect(() =>
      assertSameProjectIdentity(
        { id: 'same-project', path: '/projects/same' },
        { id: 'same-project', path: '/projects/same' },
      ),
    ).not.toThrow();
  });

  it.each([
    [{ id: 'other-project', path: '/projects/same' }],
    [{ id: 'same-project', path: '/projects/other' }],
  ])('ID 或目录变化时停止，避免写错项目', (candidate) => {
    expect(() =>
      assertSameProjectIdentity(
        { id: 'same-project', path: '/projects/same' },
        candidate,
      ),
    ).toThrow(/项目身份发生变化.*停止/);
  });
});

describe('buildRuntimeArguments', () => {
  it('固定项目用空 allowlist 禁用 Runtime 最终 MCP 集合，且不启用 Skills', () => {
    const policy = deriveRuntimeProductPolicy({
      productMode: FIXED_PRODUCT_MODE.id,
    });

    expect(
      buildRuntimeArguments({
        prefixArgs: ['runtime.js'],
        productPolicy: policy,
        model: 'test-model',
      }),
    ).toEqual([
      'runtime.js',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--approval-mode',
      'yolo',
      '--auth-type',
      'openai',
      '--chat-recording',
      '--allowed-mcp-server-names',
      '',
      '--model',
      'test-model',
    ]);
  });
});

describe('isRuntimeFailure', () => {
  it('识别 Runtime 显式错误', () => {
    expect(isRuntimeFailure({ is_error: true })).toBe(true);
    expect(isRuntimeFailure({ error: { message: '连接失败' } })).toBe(true);
  });

  it('识别被上游包装成普通 result 的 Provider 错误', () => {
    expect(isRuntimeFailure({ result: '[API Error: 401 Unauthorized]' })).toBe(
      true,
    );
    expect(
      isRuntimeFailure({ result: '[Authentication Error: invalid key]' }),
    ).toBe(true);
  });

  it('保留正常完成结果', () => {
    expect(isRuntimeFailure({ result: '游戏生成完成' })).toBe(false);
    expect(isRuntimeFailure({})).toBe(false);
  });
});

describe('Runtime completion gate', () => {
  it('marks a successful Runtime result completed only after a fresh controlled build and Web entry verification', async () => {
    const harness = createCompletionGateHarness();

    await harness.handleResult({
      type: 'result',
      result: '游戏已生成',
      num_turns: 12,
    });

    expect(harness.buildFixedProject).not.toHaveBeenCalled();
    expect(harness.verifyPlayableBuild).not.toHaveBeenCalled();
    expect(harness.current()).toMatchObject({
      status: 'running',
      stage: 'verify',
    });
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'complete' }),
    );

    await harness.close(0);

    expect(harness.buildFixedProject).toHaveBeenCalledWith(
      harness.original,
      expect.any(AbortSignal),
    );
    expect(harness.verifyPlayableBuild).toHaveBeenCalledWith(
      harness.original,
      expect.any(AbortSignal),
    );
    expect(harness.buildFixedProject.mock.invocationCallOrder[0]).toBeLessThan(
      harness.verifyPlayableBuild.mock.invocationCallOrder[0]!,
    );
    expect(harness.current()).toMatchObject({
      status: 'completed',
      stage: 'complete',
    });
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: 'complete',
        title: '游戏生成完成',
        isError: false,
      }),
    );
  });

  it('keeps the project waiting with an actionable error when Web preview verification fails', async () => {
    const harness = createCompletionGateHarness(
      new Error('游戏构建产物 dist/index.html 不存在，请先完成构建。'),
    );

    await harness.handleResult({ type: 'result', result: '任务已执行' });
    await harness.close(0);

    expect(harness.current()).toMatchObject({
      status: 'waiting',
      stage: 'verify',
    });
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'complete' }),
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        title: '尚未达到可试玩完成门槛',
        message: expect.stringMatching(/dist\/index\.html[\s\S]*继续执行/),
        isError: true,
      }),
    );
  });

  it('never accepts an old dist when rebuilding the current source fails', async () => {
    const harness = createCompletionGateHarness(
      undefined,
      new Error('固定横版项目最终构建失败（npm 退出码 2）。'),
    );

    await harness.handleResult({ type: 'result', result: '游戏已生成' });
    await harness.close(0);

    expect(harness.buildFixedProject).toHaveBeenCalledOnce();
    expect(harness.verifyPlayableBuild).not.toHaveBeenCalled();
    expect(harness.current()).toMatchObject({
      status: 'waiting',
      stage: 'verify',
    });
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'complete' }),
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        title: '尚未达到可试玩完成门槛',
        message: expect.stringContaining('重新构建当前源码'),
      }),
    );
  });

  it('allows the user to stop the controlled final build', async () => {
    const harness = createCompletionGateHarness();
    harness.buildFixedProject.mockImplementationOnce(
      async (_project: ProjectRecord, signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('最终构建已停止。')),
            { once: true },
          );
        }),
    );
    await harness.handleResult({ type: 'result', result: '游戏已生成' });

    const closing = harness.close(0);
    await vi.waitFor(() =>
      expect(harness.buildFixedProject).toHaveBeenCalledOnce(),
    );
    await Promise.all([closing, harness.stop()]);

    expect(harness.current()).toMatchObject({
      status: 'stopped',
      stage: 'verify',
    });
    expect(harness.verifyPlayableBuild).not.toHaveBeenCalled();
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'complete' }),
    );
  });

  it('never treats a zero exit without a verified Runtime result as completed', async () => {
    const harness = createCompletionGateHarness();

    await harness.close(0);

    expect(harness.buildFixedProject).not.toHaveBeenCalled();
    expect(harness.verifyPlayableBuild).not.toHaveBeenCalled();
    expect(harness.current()).toMatchObject({
      status: 'waiting',
      stage: 'verify',
    });
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'complete' }),
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        title: 'Runtime 未确认完成',
        message: expect.stringContaining('继续执行'),
      }),
    );
  });

  it('does not emit completion when a verified result is followed by a non-zero exit', async () => {
    const harness = createCompletionGateHarness();

    await harness.handleResult({ type: 'result', result: '游戏已生成' });
    await harness.close(7);

    expect(harness.buildFixedProject).not.toHaveBeenCalled();
    expect(harness.verifyPlayableBuild).not.toHaveBeenCalled();
    expect(harness.current().status).toBe('failed');
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'complete' }),
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        title: 'Runtime 异常退出',
        message: expect.stringContaining('7'),
      }),
    );
  });

  it('does not misdiagnose an internal preview probe failure as a build command failure', async () => {
    const harness = createCompletionGateHarness(
      new Error('The operation was aborted due to timeout'),
    );

    await harness.handleResult({ type: 'result', result: '游戏已生成' });
    await harness.close(0);

    const failure = harness.events.find(
      (event) => event.title === '尚未达到可试玩完成门槛',
    );
    expect(failure?.message).toContain('本地预览服务');
    expect(failure?.message).toContain('重试');
    expect(failure?.message).not.toContain('npm run build');
  });
});

describe('fixed project preparation gate', () => {
  it('ready 项目启动 Agent 时沿用同一 ID、目录并保留用户关卡哈希', async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'liimit-agent-same-project-'),
    );
    try {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await writeFile(path.join(root, 'dist', 'cli.js'), '', 'utf8');
      const projectDirectory = path.join(root, 'user-project');
      const levelPath = path.join(projectDirectory, 'src', 'level.json');
      await mkdir(path.dirname(levelPath), { recursive: true });
      const userLevel = JSON.stringify({
        version: 1,
        width: 2400,
        height: 720,
        gridSize: 32,
        objects: [
          {
            id: 'user-edited-platform',
            type: 'platform',
            x: 456,
            y: 512,
            width: 320,
            height: 32,
          },
        ],
      });
      await writeFile(levelPath, userLevel, 'utf8');
      const beforeHash = await fileSha256(levelPath);
      const timestamp = '2026-08-26T01:00:00.000Z';
      let project: ProjectRecord = {
        id: 'same-ready-project',
        name: '保留用户关卡',
        path: projectDirectory,
        prompt: '继续修改这个游戏',
        status: 'draft',
        stage: 'brief',
        productMode: FIXED_PRODUCT_MODE.id,
        starterPreparation: makeReadyStarterPreparation(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const seenProjectIds: string[] = [];
      const persisted: ProjectRecord[] = [];
      const prepareFixedProject = vi.fn(async (candidate: ProjectRecord) => {
        expect(candidate.id).toBe(project.id);
        expect(candidate.path).toBe(projectDirectory);
        expect(await fileSha256(levelPath)).toBe(beforeHash);
        await mkdir(path.join(projectDirectory, '.gameagent'), {
          recursive: true,
        });
        await writeFile(
          path.join(projectDirectory, '.gameagent', 'dependencies.json'),
          '{"prepared":true}',
          'utf8',
        );
        expect(await fileSha256(levelPath)).toBe(beforeHash);
        return {
          scaffoldedFiles: 0,
          preservedFiles: 1,
          dependencies: 'ready' as const,
        };
      });
      const child = fakeRuntimeChild();
      const spawnRuntime = vi.fn(
        (
          _command: string,
          _args: readonly string[],
          options: { cwd?: string },
        ) => {
          expect(options.cwd).toBe(projectDirectory);
          return child;
        },
      ) as unknown as typeof import('node:child_process').spawn;
      const runner = new AgentRunner({
        repoRoot: root,
        store: {
          getProject: (projectId: string) => {
            seenProjectIds.push(projectId);
            return projectId === project.id ? project : undefined;
          },
          getRuntimeSettings: () => makeSettings(),
          upsertProject: async (next: ProjectRecord) => {
            persisted.push(structuredClone(next));
            project = next;
          },
        },
        projects: {
          prepareFixedProject,
          prepareSystemPrompt: vi.fn(async () => undefined),
          locationsInfo: {
            templatesDir: path.join(root, 'templates'),
            docsDir: path.join(root, 'docs'),
          },
        },
        emitEvent: vi.fn(),
        emitProject: vi.fn(),
        spawnRuntime,
      } as unknown as ConstructorParameters<typeof AgentRunner>[0]);

      await expect(
        runner.start({
          projectId: 'same-ready-project',
          prompt: '在现有关卡上继续修改',
        }),
      ).resolves.toEqual({ accepted: true });

      expect(seenProjectIds[0]).toBe('same-ready-project');
      expect(prepareFixedProject).toHaveBeenCalledOnce();
      expect(spawnRuntime).toHaveBeenCalledOnce();
      expect(persisted.every((item) => item.id === project.id)).toBe(true);
      expect(persisted.every((item) => item.path === projectDirectory)).toBe(
        true,
      );
      expect(await readFile(levelPath, 'utf8')).toBe(userLevel);
      expect(await fileSha256(levelPath)).toBe(beforeHash);

      child.emit('close', 1);
      await vi.waitFor(() => expect(project.status).toBe('failed'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prepares dependencies before the prompt and Runtime process', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-start-order-'));
    try {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await writeFile(path.join(root, 'dist', 'cli.js'), '', 'utf8');
      const timestamp = '2026-08-23T12:00:00.000Z';
      let project: ProjectRecord = {
        id: 'start-order-project',
        name: '启动顺序测试',
        path: path.join(root, 'project'),
        prompt: '制作横版游戏',
        status: 'draft',
        stage: 'brief',
        productMode: FIXED_PRODUCT_MODE.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const order: string[] = [];
      const prepareFixedProject = vi.fn(async () => {
        order.push('prepare');
        return {
          scaffoldedFiles: 10,
          preservedFiles: 0,
          dependencies: 'installed' as const,
        };
      });
      const prepareSystemPrompt = vi.fn(async () => {
        order.push('prompt');
      });
      const child = fakeRuntimeChild();
      const spawnRuntime = vi.fn(() => {
        order.push('spawn');
        return child;
      }) as unknown as typeof import('node:child_process').spawn;
      const runner = new AgentRunner({
        repoRoot: root,
        store: {
          getProject: () => project,
          getRuntimeSettings: () => makeSettings(),
          upsertProject: async (next: ProjectRecord) => {
            project = next;
          },
        },
        projects: {
          prepareFixedProject,
          prepareSystemPrompt,
          locationsInfo: {
            templatesDir: path.join(root, 'templates'),
            docsDir: path.join(root, 'docs'),
          },
        },
        emitEvent: vi.fn(),
        emitProject: vi.fn(),
        spawnRuntime,
      } as unknown as ConstructorParameters<typeof AgentRunner>[0]);

      await expect(
        runner.start({
          projectId: project.id,
          prompt: '生成一个最小横版关卡',
        }),
      ).resolves.toEqual({ accepted: true });
      expect(order).toEqual(['prepare', 'prompt', 'spawn']);
      expect(prepareFixedProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: project.id }),
        expect.any(AbortSignal),
      );

      child.emit('close', 1);
      await vi.waitFor(() => expect(project.status).toBe('failed'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails before prompt preparation or Runtime launch when locked dependencies cannot be prepared', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-start-gate-'));
    try {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await writeFile(path.join(root, 'dist', 'cli.js'), '', 'utf8');
      await mkdir(path.join(root, 'project'), { recursive: true });
      await writeFile(
        path.join(root, 'project', 'user-level.json'),
        '{"keep":true}',
        'utf8',
      );
      const timestamp = '2026-08-23T12:00:00.000Z';
      const runtimeSettings = makeSettings();
      let project: ProjectRecord = {
        id: 'prepare-project',
        name: '依赖准备测试',
        path: path.join(root, 'project'),
        prompt: '制作横版游戏',
        status: 'draft',
        stage: 'brief',
        sessionId: 'existing-session',
        productMode: FIXED_PRODUCT_MODE.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const prepareFixedProject = vi
        .fn()
        .mockRejectedValue(
          new Error('准备 Phaser 项目依赖超时，请检查网络后重试。'),
        );
      const prepareSystemPrompt = vi.fn();
      const runner = new AgentRunner({
        repoRoot: root,
        store: {
          getProject: () => project,
          getRuntimeSettings: () => runtimeSettings,
          upsertProject: async (next: ProjectRecord) => {
            project = next;
          },
        },
        projects: {
          prepareFixedProject,
          prepareSystemPrompt,
        },
        emitEvent: vi.fn(),
        emitProject: vi.fn(),
      } as unknown as ConstructorParameters<typeof AgentRunner>[0]);

      await expect(
        runner.start({
          projectId: project.id,
          prompt: '生成一个最小横版关卡',
        }),
      ).rejects.toThrow('准备 Phaser 项目依赖超时');

      expect(prepareFixedProject).toHaveBeenCalledWith(
        expect.objectContaining({
          id: project.id,
          status: 'running',
          stage: 'scaffold',
        }),
        expect.any(AbortSignal),
      );
      expect(prepareSystemPrompt).not.toHaveBeenCalled();
      expect(project).toMatchObject({
        status: 'failed',
        stage: 'scaffold',
        sessionId: 'existing-session',
      });
      await expect(
        readFile(path.join(root, 'project', 'user-level.json'), 'utf8'),
      ).resolves.toBe('{"keep":true}');
      expect(runtimeSettings.main.apiKey).toBe('deepseek-key');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows the user to stop dependency preparation before Runtime launch', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-start-stop-'));
    try {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await writeFile(path.join(root, 'dist', 'cli.js'), '', 'utf8');
      const timestamp = '2026-08-23T12:00:00.000Z';
      let project: ProjectRecord = {
        id: 'prepare-stop-project',
        name: '停止依赖准备',
        path: path.join(root, 'project'),
        prompt: '制作横版游戏',
        status: 'draft',
        stage: 'brief',
        productMode: FIXED_PRODUCT_MODE.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const prepareFixedProject = vi.fn(
        async (_project: ProjectRecord, signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new Error('项目环境准备已停止。')),
              { once: true },
            );
          }),
      );
      const prepareSystemPrompt = vi.fn();
      const runner = new AgentRunner({
        repoRoot: root,
        store: {
          getProject: () => project,
          getRuntimeSettings: () => makeSettings(),
          upsertProject: async (next: ProjectRecord) => {
            project = next;
          },
        },
        projects: { prepareFixedProject, prepareSystemPrompt },
        emitEvent: vi.fn(),
        emitProject: vi.fn(),
      } as unknown as ConstructorParameters<typeof AgentRunner>[0]);

      const start = runner.start({
        projectId: project.id,
        prompt: '生成一个最小横版关卡',
      });
      await vi.waitFor(() =>
        expect(prepareFixedProject).toHaveBeenCalledOnce(),
      );
      await runner.stop(project.id);

      await expect(start).resolves.toEqual({ accepted: false });
      expect(prepareSystemPrompt).not.toHaveBeenCalled();
      expect(project).toMatchObject({ status: 'stopped', stage: 'scaffold' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('buildCredentialPayload', () => {
  it('同一 Provider 复用密钥，但保留每个服务自己的模型', () => {
    const payload = buildCredentialPayload(makeSettings());

    expect(payload.providers.reasoning).toMatchObject({
      apiKey: 'deepseek-key',
      model: 'deepseek-v4-pro',
    });
    expect(payload.providers.audio).toMatchObject({
      apiKey: 'deepseek-key',
      model: 'deepseek-v4-flash',
    });
    expect(payload.providers.video).toMatchObject({
      apiKey: 'dashscope-key',
      model: 'wan2.5-i2v-preview',
    });
  });

  it('不同 Provider 之间不复用密钥', () => {
    const settings = makeSettings();
    settings.video.provider = 'doubao';
    expect(buildCredentialPayload(settings).providers.video).toBeUndefined();
  });

  it('专业音频 Provider 使用自己的密钥，不复用策划模型密钥', () => {
    const settings = makeSettings();
    settings.audio = {
      provider: 'elevenlabs',
      baseUrl: 'https://api.elevenlabs.io',
      model: 'music_v2',
      apiKey: 'elevenlabs-key',
    };

    expect(buildCredentialPayload(settings).providers.audio).toEqual({
      provider: 'elevenlabs',
      apiKey: 'elevenlabs-key',
      baseUrl: 'https://api.elevenlabs.io',
      model: 'music_v2',
    });

    settings.audio.apiKey = '';
    expect(buildCredentialPayload(settings).providers.audio).toBeUndefined();
  });
});

describe('desktop tool PATH', () => {
  it('adds Finder-missing tool directories without duplicating entries', () => {
    const entries = withDesktopToolPaths(
      '/usr/bin:/custom/bin:/opt/homebrew/bin',
      'darwin',
      {},
      '/Users/tester',
    ).split(':');
    expect(entries.slice(0, 2)).toEqual([
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ]);
    expect(entries).toContain('/custom/bin');
    expect(entries).toContain('/Users/tester/.local/bin');
    expect(
      entries.filter((entry) => entry === '/opt/homebrew/bin'),
    ).toHaveLength(1);
  });

  it('preserves one Windows PATH key and adds trusted user tool locations', () => {
    const environment = sanitizeRuntimeEnvironment(
      {
        Path: 'C:\\Windows\\System32;C:\\Custom',
        PATH: 'C:\\ignored-duplicate',
        LOCALAPPDATA: 'C:\\Users\\测试 用户\\AppData\\Local',
        APPDATA: 'C:\\Users\\测试 用户\\AppData\\Roaming',
        ProgramFiles: 'C:\\Program Files',
        API_KEY: 'must-not-leak',
      },
      'win32',
      'C:\\Users\\测试 用户',
    );

    expect(environment).not.toHaveProperty('Path');
    expect(environment).not.toHaveProperty('API_KEY');
    const entries = environment.PATH?.split(';') ?? [];
    expect(entries).toContain('C:\\Windows\\System32');
    expect(entries).toContain(
      'C:\\Users\\测试 用户\\AppData\\Local\\Microsoft\\WinGet\\Links',
    );
    expect(entries).toContain('C:\\Users\\测试 用户\\AppData\\Roaming\\npm');
    expect(entries).not.toContain('/opt/homebrew/bin');
  });

  it('preserves the exact POSIX PATH without collapsing an unrelated Path key', () => {
    const environment = sanitizeRuntimeEnvironment(
      { Path: '/mixed-case-value', PATH: '/expected/bin' },
      'darwin',
      '/Users/tester',
    );

    expect(environment.Path).toBe('/mixed-case-value');
    expect(environment.PATH?.split(':')).toContain('/expected/bin');
  });

  it('uses the tsx JavaScript entry instead of a Windows cmd shim', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-runtime-'));
    try {
      const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      const sourceCli = path.join(root, 'packages', 'cli', 'index.ts');
      await mkdir(path.dirname(tsxCli), { recursive: true });
      await mkdir(path.dirname(sourceCli), { recursive: true });
      await Promise.all([writeFile(tsxCli, ''), writeFile(sourceCli, '')]);
      const runner = new AgentRunner({
        repoRoot: root,
      } as ConstructorParameters<typeof AgentRunner>[0]);

      expect(runner.inspectRuntime()).toMatchObject({
        prefixArgs: [tsxCli, sourceCli],
        ready: true,
      });
      expect(runner.inspectRuntime().command).not.toMatch(/\.cmd$/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the absolute system taskkill with shell disabled', async () => {
    const child = fakeChild(4242);
    const spawnCommand = vi.fn(() => closingCommand(0));

    await terminateProcessTree(child, true, {
      platform: 'win32',
      environment: { SystemRoot: String.raw`C:\Windows` },
      spawnCommand,
    });

    expect(spawnCommand).toHaveBeenCalledWith(
      String.raw`C:\Windows\System32\taskkill.exe`,
      ['/pid', '4242', '/t', '/f'],
      { stdio: 'ignore', windowsHide: true, shell: false },
    );
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('reports tree termination as failed when taskkill exits unsuccessfully', async () => {
    const child = fakeChild(4242);

    await expect(
      terminateProcessTree(child, false, {
        platform: 'win32',
        environment: { SYSTEMROOT: String.raw`D:\Windows` },
        spawnCommand: () => closingCommand(5),
      }),
    ).rejects.toThrow('无法确认 Windows Agent 进程树已终止');

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

async function fileSha256(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function fakeChild(pid: number): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  Object.assign(emitter, {
    pid,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => true),
  });
  return emitter;
}

function fakeRuntimeChild(): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const credentialPipe = new PassThrough();
  Object.assign(emitter, {
    pid: undefined,
    exitCode: null,
    signalCode: null,
    stdin,
    stdout,
    stderr,
    stdio: [stdin, stdout, stderr, credentialPipe],
    kill: vi.fn(() => true),
  });
  return emitter;
}

function closingCommand(exitCode: number) {
  const command = new EventEmitter();
  queueMicrotask(() => command.emit('close', exitCode));
  return command;
}

describe('asset generation liveness', () => {
  it('detects real file progress without reading file contents', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-assets-'));
    try {
      const assets = path.join(root, 'public', 'assets');
      await mkdir(assets, { recursive: true });
      expect(inspectAssetProgress(root)).toEqual({
        available: true,
        fileCount: 0,
        latestMtimeMs: 0,
      });

      await writeFile(path.join(assets, 'hero.png'), 'png');
      const progress = inspectAssetProgress(root);
      expect(progress.fileCount).toBe(1);
      expect(progress.latestMtimeMs).toBeGreaterThan(0);

      const customAssets = path.join(root, 'generated', 'sprites');
      await mkdir(customAssets, { recursive: true });
      await writeFile(path.join(customAssets, 'enemy.png'), 'png');
      expect(
        inspectAssetProgress(root, path.join('generated', 'sprites')).fileCount,
      ).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('bounds the asset-specific idle timeout', () => {
    expect(assetIdleTimeoutFromEnv({})).toBe(12 * 60_000);
    expect(
      assetIdleTimeoutFromEnv({ GAMEAGENT_ASSET_IDLE_TIMEOUT_MS: '1000' }),
    ).toBe(4 * 60_000);
    expect(
      assetIdleTimeoutFromEnv({
        GAMEAGENT_ASSET_IDLE_TIMEOUT_MS: String(60 * 60_000),
      }),
    ).toBe(30 * 60_000);
  });

  it('tracks multiple tools by call ID and starts asset monitoring only at the queue head', () => {
    const tracker = new PendingToolTracker();
    tracker.add('todo_write', 'tool-1');
    tracker.add(
      'generate_game_assets',
      'tool-2',
      assetOutputDirFromInput({ output_dir_name: 'generated/assets' }),
    );
    tracker.add('write_file', 'tool-3');

    expect(tracker.current()?.name).toBe('todo_write');
    expect(tracker.complete('unknown')).toBeUndefined();
    expect(tracker.current()?.name).toBe('todo_write');

    tracker.complete('tool-1');
    expect(tracker.current()).toMatchObject({
      id: 'tool-2',
      name: 'generate_game_assets',
      outputDirName: 'generated/assets',
    });

    tracker.complete('tool-2');
    expect(tracker.current()?.name).toBe('write_file');
  });
});

function makeSettings(): AppSettings {
  return {
    main: {
      provider: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: 'deepseek-key',
    },
    reasoning: {
      provider: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      apiKey: '',
    },
    image: {
      provider: 'tongyi',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'wan2.5-t2i-preview',
      apiKey: 'dashscope-key',
    },
    video: {
      provider: 'tongyi',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'wan2.5-i2v-preview',
      apiKey: '',
    },
    audio: {
      provider: 'openai-compat',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: '',
    },
    defaultWorkspace: '/tmp/gameagent-test',
    permissionMode: 'yolo',
    developerMode: false,
  };
}

function createCompletionGateHarness(
  verificationError?: Error,
  buildError?: Error,
) {
  const timestamp = '2026-08-23T12:00:00.000Z';
  const original: ProjectRecord = {
    id: 'completion-project',
    name: '完成门槛测试',
    path: '/tmp/liimit-completion-project',
    prompt: '制作一个横版平台游戏',
    status: 'running',
    stage: 'verify',
    sessionId: 'session-completion',
    productMode: FIXED_PRODUCT_MODE.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  let project = original;
  const events: AgentEvent[] = [];
  const verifyPlayableBuild = verificationError
    ? vi.fn().mockRejectedValue(verificationError)
    : vi.fn().mockResolvedValue(undefined);
  const buildFixedProject = buildError
    ? vi.fn().mockRejectedValue(buildError)
    : vi.fn().mockResolvedValue(undefined);
  const upsertProject = vi.fn(async (next: ProjectRecord) => {
    project = next;
  });
  const runner = new AgentRunner({
    repoRoot: '/tmp/liimit-completion-runtime',
    store: {
      getProject: () => project,
      upsertProject,
    },
    projects: { buildFixedProject, verifyPlayableBuild },
    emitEvent: (event: AgentEvent) => events.push(event),
    emitProject: () => undefined,
  } as unknown as ConstructorParameters<typeof AgentRunner>[0]);
  const active = {
    projectId: original.id,
    child: fakeChild(4321),
    stoppedByUser: false,
    timedOut: false,
    liveness: { touch: vi.fn() },
    monitor: null,
    providerLabel: '模型',
    provider: 'openai-compat',
    model: 'test-model',
    pendingTools: new PendingToolTracker(),
  };
  (runner as unknown as { active: unknown }).active = active;

  return {
    runner,
    original,
    events,
    buildFixedProject,
    verifyPlayableBuild,
    current: () => project,
    stop: () => runner.stop(original.id),
    close: (code: number | null) =>
      (
        runner as unknown as {
          finalizeClosedRun(
            project: ProjectRecord,
            active: unknown,
            code: number | null,
          ): Promise<void>;
        }
      ).finalizeClosedRun(project, active, code),
    handleResult: (message: object) =>
      (
        runner as unknown as {
          handleStdoutLine(project: ProjectRecord, line: string): Promise<void>;
        }
      ).handleStdoutLine(original, JSON.stringify(message)),
  };
}
