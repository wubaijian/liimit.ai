import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronPaths = vi.hoisted(() => ({
  userData: '',
  documents: '',
}));
const fileSystemFailure = vi.hoisted(() => ({
  nextOperation: undefined as 'writeFile' | 'rename' | undefined,
  nextTarget: undefined as 'backup' | 'state' | undefined,
  nextReadError: undefined as 'EACCES' | 'EIO' | undefined,
  delay: undefined as Promise<void> | undefined,
  notifyStarted: undefined as (() => void) | undefined,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const code = fileSystemFailure.nextReadError;
      if (code) {
        fileSystemFailure.nextReadError = undefined;
        throw Object.assign(new Error(`injected readFile ${code} failure`), {
          code,
        });
      }
      return actual.readFile(...args);
    },
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (
        fileSystemFailure.nextOperation === 'writeFile' &&
        matchesFailureTarget(args[0], fileSystemFailure.nextTarget)
      ) {
        fileSystemFailure.nextOperation = undefined;
        fileSystemFailure.nextTarget = undefined;
        const delay = fileSystemFailure.delay;
        const notifyStarted = fileSystemFailure.notifyStarted;
        fileSystemFailure.delay = undefined;
        fileSystemFailure.notifyStarted = undefined;
        notifyStarted?.();
        await delay;
        throw new Error('injected writeFile failure');
      }
      return actual.writeFile(...args);
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (
        fileSystemFailure.nextOperation === 'rename' &&
        matchesFailureTarget(args[0], fileSystemFailure.nextTarget)
      ) {
        fileSystemFailure.nextOperation = undefined;
        fileSystemFailure.nextTarget = undefined;
        const delay = fileSystemFailure.delay;
        const notifyStarted = fileSystemFailure.notifyStarted;
        fileSystemFailure.delay = undefined;
        fileSystemFailure.notifyStarted = undefined;
        notifyStarted?.();
        await delay;
        throw new Error('injected rename failure');
      }
      return actual.rename(...args);
    },
  };
});

function matchesFailureTarget(
  file: Parameters<typeof import('node:fs/promises').writeFile>[0],
  target: 'backup' | 'state' | undefined,
): boolean {
  if (!target) return true;
  const isBackup = String(file).includes('.pre-platformer-');
  return target === 'backup' ? isBackup : !isBackup;
}

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData' ? electronPaths.userData : electronPaths.documents,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}));

import { StateStore } from '../src/main/store.js';
import {
  FIXED_PRODUCT_MODE,
  type McpServerDefinition,
  type ProjectRecord,
  type StarterPreparation,
} from '../src/shared/types.js';
/*
 * Persisted input intentionally remains wider than the active ProjectRecord
 * contract so migration tests can represent pre-retirement state files.
 */
type PersistedTestProject = Omit<ProjectRecord, 'productMode'> & {
  productMode?: string;
};

describe('StateStore 固定项目迁移与持久化', () => {
  let root: string;

  it('移除仅影响指定记录，重启保持移除；写入失败不丢记录', async () => {
    const store = new StateStore();
    await store.initialize();
    const first = makeProject('remove-me');
    const second = makeProject('keep-me');
    await store.upsertProject(first);
    await store.upsertProject(second);
    const settings = store.getPublicSettings();
    fileSystemFailure.nextOperation = 'writeFile';
    fileSystemFailure.nextTarget = 'state';
    await expect(store.removeProject(first.id)).rejects.toThrow();
    expect(store.getProject(first.id)).toEqual(first);
    await store.removeProject(first.id);
    expect(store.getProject(first.id)).toBeUndefined();
    expect(store.getProject(second.id)).toEqual(second);
    expect(store.getPublicSettings()).toEqual(settings);
    const reopened = new StateStore();
    await reopened.initialize();
    expect(reopened.getProject(first.id)).toBeUndefined();
    expect(reopened.getProject(second.id)?.id).toBe(second.id);
  });

  it.each(['pending', 'active'] as const)(
    'AI 创建 %s 重启后保留要求且不自动运行',
    async (initialGeneration) => {
      const project = {
        ...makeProject('initial'),
        creationMode: 'ai' as const,
        initialGeneration,
      };
      await writeFile(
        path.join(electronPaths.userData, 'state.json'),
        JSON.stringify({ projects: [project], settings: {}, secrets: {} }),
      );
      const store = new StateStore();
      await store.initialize();
      expect(store.getProject(project.id)).toMatchObject({
        prompt: project.prompt,
        initialGeneration: 'incomplete',
        status: 'stopped',
      });
      const second = new StateStore();
      await second.initialize();
      expect(second.getProject(project.id)).toEqual(
        store.getProject(project.id),
      );
    },
  );

  it('旧项目不推断为 AI 创建，非法创建状态拒绝持久化', async () => {
    const store = new StateStore();
    await store.initialize();
    const project = makeProject('old');
    await store.upsertProject(project);
    expect(store.getProject(project.id)?.initialGeneration).toBeUndefined();
    await expect(
      store.upsertProject({ ...project, creationMode: 'other' } as never),
    ).rejects.toThrow();
    await expect(
      store.upsertProject({ ...project, initialGeneration: 'pending' }),
    ).rejects.toThrow();
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'liimit-store-'));
    electronPaths.userData = path.join(root, 'user-data');
    electronPaths.documents = path.join(root, 'documents');
    await mkdir(electronPaths.userData, { recursive: true });
  });

  afterEach(async () => {
    fileSystemFailure.nextOperation = undefined;
    fileSystemFailure.nextTarget = undefined;
    fileSystemFailure.nextReadError = undefined;
    fileSystemFailure.delay = undefined;
    fileSystemFailure.notifyStarted = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it('保存独立音效密钥后立即返回已配置的脱敏状态', async () => {
    const store = new StateStore();
    await store.initialize();
    const settings = store.getPublicSettings();
    settings.audio = {
      provider: 'elevenlabs',
      baseUrl: 'https://api.elevenlabs.io',
      model: 'music_v2',
      apiKey: 'elevenlabs-audio-secret',
      apiKeyConfigured: false,
      apiKeyInherited: false,
    };

    const saved = await store.saveSettings(settings);

    expect(saved.audio).toMatchObject({
      provider: 'elevenlabs',
      apiKey: '',
      apiKeyConfigured: true,
    });
    expect(saved.audio.apiKeyInherited).not.toBe(true);
    expect(store.getRuntimeSettings().audio.apiKey).toBe(
      'elevenlabs-audio-secret',
    );
    const persisted = JSON.parse(
      await readFile(path.join(electronPaths.userData, 'state.json'), 'utf8'),
    ) as { secrets: { audio?: string } };
    expect(persisted.secrets.audio).toBe(
      encodedSecret('elevenlabs-audio-secret'),
    );
  });

  it('混合状态先备份原始字节，再只保留固定项目且不删除目录、设置、凭据或未知键', async () => {
    const projectPath = path.join(root, 'legacy-game');
    const skillPath = path.join(
      projectPath,
      '.qwen',
      'skills',
      'legacy-skill',
      'SKILL.md',
    );
    const legacySkill =
      '---\nname: legacy-skill\ndescription: 保留的旧项目 Skill\n---\n';
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, legacySkill, 'utf8');

    const legacyProject = {
      id: 'legacy-project',
      name: '旧版俯视项目',
      path: projectPath,
      prompt: '继续旧项目',
      status: 'completed',
      stage: 'complete',
      sessionId: 'legacy-session',
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-01-03T03:04:05.000Z',
    } as const;
    const legacyMcpServers = [
      {
        id: 'legacy-editor-bridge',
        name: '旧外部工具桥接',
        description: '升级后必须保留但不会注入固定项目',
        enabled: true,
        transport: 'stdio',
        command: 'legacy-editor-bridge',
        args: ['--stdio'],
        cwd: projectPath,
        url: '',
        timeoutMs: 12_000,
        trust: true,
        env: [{ name: 'LEGACY_TOKEN', value: 'mcp-secret' }],
        headers: [],
      },
    ];
    const fixedProject = makeProject('fixed-project');
    const fixedSentinel = path.join(fixedProject.path, 'keep.txt');
    const unknownProject = {
      ...legacyProject,
      id: 'unknown-project',
      name: '未知模式项目',
      path: path.join(root, 'unknown-game'),
      productMode: 'future-mode',
    };
    const unknownSentinel = path.join(unknownProject.path, 'keep.txt');
    await mkdir(fixedProject.path, { recursive: true });
    await mkdir(unknownProject.path, { recursive: true });
    await writeFile(fixedSentinel, 'keep-fixed', 'utf8');
    await writeFile(unknownSentinel, 'keep-unknown', 'utf8');

    const persistedState = {
      projects: [legacyProject, fixedProject, unknownProject],
      settings: {
        main: {
          provider: 'openai-compat',
          baseUrl: 'https://main.example.test/v1',
          model: 'legacy-main-model',
        },
        reasoning: {
          provider: 'tongyi',
          baseUrl: 'https://reasoning.example.test/v1',
          model: 'legacy-reasoning-model',
        },
        image: {
          provider: 'tongyi',
          baseUrl: 'https://image.example.test/v1',
          model: 'legacy-image-model',
        },
        video: {
          provider: 'doubao',
          baseUrl: 'https://video.example.test/v1',
          model: 'legacy-video-model',
        },
        audio: {
          provider: 'minimax',
          baseUrl: 'https://audio.example.test/v1',
          model: 'legacy-audio-model',
        },
        defaultWorkspace: path.join(root, 'legacy-workspace'),
        permissionMode: 'yolo',
        developerMode: true,
      },
      secrets: {
        main: encodedSecret('main-secret'),
        image: encodedSecret('image-secret'),
        mcpServers: encodedSecret(JSON.stringify(legacyMcpServers)),
      },
      futureRoot: { preserve: true },
    };
    const statePath = path.join(electronPaths.userData, 'state.json');
    const originalState = JSON.stringify(persistedState, null, 2);
    await writeFile(statePath, originalState, 'utf8');

    const store = new StateStore();
    await store.initialize();

    expect(store.getProjects()).toEqual([fixedProject]);
    expect(store.getRuntimeSettings()).toMatchObject({
      main: {
        provider: 'openai-compat',
        baseUrl: 'https://main.example.test/v1',
        model: 'legacy-main-model',
        apiKey: 'main-secret',
      },
      image: {
        baseUrl: 'https://image.example.test/v1',
        model: 'legacy-image-model',
        apiKey: 'image-secret',
      },
      defaultWorkspace: path.join(root, 'legacy-workspace'),
      developerMode: true,
    });
    expect(store.getRuntimeMcpServers()).toEqual(legacyMcpServers);
    await expect(readFile(skillPath, 'utf8')).resolves.toBe(legacySkill);
    await expect(readFile(fixedSentinel, 'utf8')).resolves.toBe('keep-fixed');
    await expect(readFile(unknownSentinel, 'utf8')).resolves.toBe(
      'keep-unknown',
    );

    const backups = await migrationBackups();
    expect(backups).toHaveLength(1);
    await expect(readFile(backups[0]!, 'utf8')).resolves.toBe(originalState);

    const flushed = JSON.parse(await readFile(statePath, 'utf8')) as {
      projects: Array<Record<string, unknown>>;
      settings: typeof persistedState.settings;
      secrets: typeof persistedState.secrets;
    };
    expect(flushed.projects).toEqual([fixedProject]);
    expect(flushed.settings).toEqual(persistedState.settings);
    expect(flushed.secrets).toEqual(persistedState.secrets);
    expect(flushed).toMatchObject({ futureRoot: { preserve: true } });
  });

  it.each(['writeFile', 'rename'] as const)(
    '迁移备份 %s 失败时拒绝初始化且原状态和项目目录保持不变',
    async (operation) => {
      const { project, persistedState } = makeStartupState(root, false);
      await mkdir(project.path, { recursive: true });
      const sentinel = path.join(project.path, 'keep.txt');
      await writeFile(sentinel, 'keep-project', 'utf8');
      const statePath = path.join(electronPaths.userData, 'state.json');
      const originalState = JSON.stringify(persistedState, null, 2);
      await writeFile(statePath, originalState, 'utf8');
      failNextFileSystemOperation(operation, 'backup');

      const store = new StateStore();
      await expect(store.initialize()).rejects.toThrow(
        `injected ${operation} failure`,
      );

      expect(() => store.getProjects()).toThrow('StateStore 尚未初始化');
      await expect(readFile(statePath, 'utf8')).resolves.toBe(originalState);
      await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep-project');
      expect(await migrationBackups()).toEqual([]);
    },
  );

  it.each(['writeFile', 'rename'] as const)(
    '备份成功但迁移状态 %s 失败时保留原状态和可恢复备份',
    async (operation) => {
      const { persistedState } = makeStartupState(root, false);
      const statePath = path.join(electronPaths.userData, 'state.json');
      const originalState = JSON.stringify(persistedState, null, 2);
      await writeFile(statePath, originalState, 'utf8');
      failNextFileSystemOperation(operation, 'state');

      const store = new StateStore();
      await expect(store.initialize()).rejects.toThrow(
        `injected ${operation} failure`,
      );

      expect(() => store.getProjects()).toThrow('StateStore 尚未初始化');
      await expect(readFile(statePath, 'utf8')).resolves.toBe(originalState);
      const backups = await migrationBackups();
      expect(backups).toHaveLength(1);
      await expect(readFile(backups[0]!, 'utf8')).resolves.toBe(originalState);
    },
  );

  it.each(['writeFile', 'rename'] as const)(
    '有效旧状态在初始化 %s 回写失败时保留原文件并可完整恢复',
    async (operation) => {
      const { project, legacyMcpServers, persistedState } =
        makeStartupState(root);
      const statePath = path.join(electronPaths.userData, 'state.json');
      const originalState = JSON.stringify(persistedState, null, 2);
      await writeFile(statePath, originalState, 'utf8');
      fileSystemFailure.nextOperation = operation;

      const failedStore = new StateStore();
      const initialization = await failedStore.initialize().then(
        () => ({ status: 'resolved' as const, error: undefined }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );

      const stateAfterFailure = await readFile(statePath, 'utf8');
      expect(
        (JSON.parse(stateAfterFailure) as { projects: ProjectRecord[] })
          .projects,
      ).toEqual([project]);
      expect(stateAfterFailure).toBe(originalState);
      expect(initialization).toMatchObject({
        status: 'rejected',
        error: { message: `injected ${operation} failure` },
      });
      expect(() => failedStore.getProjects()).toThrow('StateStore 尚未初始化');

      const recoveredStore = new StateStore();
      await recoveredStore.initialize();

      expect(recoveredStore.getProjects()).toEqual([project]);
      expect(recoveredStore.getRuntimeSettings()).toMatchObject({
        main: {
          baseUrl: 'https://startup-main.example.test/v1',
          model: 'startup-main-model',
          apiKey: 'startup-main-secret',
        },
        image: {
          baseUrl: 'https://startup-image.example.test/v1',
          model: 'startup-image-model',
          apiKey: 'startup-image-secret',
        },
        defaultWorkspace: path.join(root, 'startup-workspace'),
        developerMode: true,
      });
      expect(recoveredStore.getRuntimeMcpServers()).toEqual(legacyMcpServers);
    },
  );

  it.each(['EACCES', 'EIO'] as const)(
    '有效旧状态启动 readFile %s 失败时传播错误、保留原文件并可恢复',
    async (code) => {
      const { project, legacyMcpServers, persistedState } =
        makeStartupState(root);
      const statePath = path.join(electronPaths.userData, 'state.json');
      const originalState = JSON.stringify(persistedState, null, 2);
      await writeFile(statePath, originalState, 'utf8');
      fileSystemFailure.nextReadError = code;

      const failedStore = new StateStore();
      await expect(failedStore.initialize()).rejects.toMatchObject({
        code,
        message: `injected readFile ${code} failure`,
      });

      expect(() => failedStore.getProjects()).toThrow('StateStore 尚未初始化');
      await expect(readFile(statePath, 'utf8')).resolves.toBe(originalState);

      const recoveredStore = new StateStore();
      await recoveredStore.initialize();
      expectStartupStateRecovered(
        recoveredStore,
        project,
        legacyMcpServers,
        root,
      );
    },
  );

  it('状态 JSON 损坏时拒绝覆盖原文件，外部修复后可完整恢复', async () => {
    const { project, legacyMcpServers, persistedState } =
      makeStartupState(root);
    const statePath = path.join(electronPaths.userData, 'state.json');
    const malformedState = '{"projects":[{"id":"recoverable"}],"settings":';
    await writeFile(statePath, malformedState, 'utf8');

    const failedStore = new StateStore();
    await expect(failedStore.initialize()).rejects.toBeInstanceOf(SyntaxError);

    expect(() => failedStore.getProjects()).toThrow('StateStore 尚未初始化');
    await expect(readFile(statePath, 'utf8')).resolves.toBe(malformedState);

    await writeFile(statePath, JSON.stringify(persistedState, null, 2), 'utf8');
    const recoveredStore = new StateStore();
    await recoveredStore.initialize();
    expectStartupStateRecovered(
      recoveredStore,
      project,
      legacyMcpServers,
      root,
    );
  });

  it('状态规范化失败时拒绝覆盖原文件，外部修复后可完整恢复', async () => {
    const { project, legacyMcpServers, persistedState } =
      makeStartupState(root);
    const invalidState = structuredClone(persistedState) as {
      settings: { main: { baseUrl: unknown } };
    };
    invalidState.settings.main.baseUrl = 42;
    const statePath = path.join(electronPaths.userData, 'state.json');
    const originalState = JSON.stringify(invalidState, null, 2);
    await writeFile(statePath, originalState, 'utf8');

    const failedStore = new StateStore();
    await expect(failedStore.initialize()).rejects.toBeInstanceOf(TypeError);

    expect(() => failedStore.getProjects()).toThrow('StateStore 尚未初始化');
    await expect(readFile(statePath, 'utf8')).resolves.toBe(originalState);

    await writeFile(statePath, JSON.stringify(persistedState, null, 2), 'utf8');
    const recoveredStore = new StateStore();
    await recoveredStore.initialize();
    expectStartupStateRecovered(
      recoveredStore,
      project,
      legacyMcpServers,
      root,
    );
  });

  it.each([
    ['根值不是对象', [], []],
    ['projects 不是数组', ['projects'], {}],
    ['settings 不是对象', ['settings'], 'invalid-settings'],
    ['secrets 不是对象', ['secrets'], []],
    ['项目项不是对象', ['projects', 0], 42],
    ['项目必需字段类型错误', ['projects', 0, 'id'], 42],
    ['Provider endpoint 不是对象', ['settings', 'main'], 'invalid'],
    ['Provider endpoint 关键字段类型错误', ['settings', 'main', 'baseUrl'], 42],
    ['defaultWorkspace 类型错误', ['settings', 'defaultWorkspace'], 42],
    ['developerMode 类型错误', ['settings', 'developerMode'], 'true'],
    ['permissionMode 值无效', ['settings', 'permissionMode'], 'unsafe'],
    ['已知 secret 类型错误', ['secrets', 'main'], 42],
  ] as const)(
    '%s 时拒绝初始化且保留原文件',
    async (_name, fieldPath, invalidValue) => {
      const { persistedState } = makeStartupState(root);
      const invalidState = replaceNestedValue(
        persistedState,
        [...fieldPath],
        invalidValue,
      );
      const statePath = path.join(electronPaths.userData, 'state.json');
      const originalState = JSON.stringify(invalidState, null, 2);
      await writeFile(statePath, originalState, 'utf8');

      const failedStore = new StateStore();
      await expect(failedStore.initialize()).rejects.toThrow(
        'state.json 结构无效',
      );

      expect(() => failedStore.getProjects()).toThrow('StateStore 尚未初始化');
      await expect(readFile(statePath, 'utf8')).resolves.toBe(originalState);
    },
  );

  it('真正缺失的旧字段使用默认值并保留未知额外键', async () => {
    const compatibleState = {
      futureRoot: { enabled: true },
      settings: {
        main: { futureEndpointOption: 'keep-endpoint-option' },
        futureSetting: { enabled: true },
      },
      futureTopLevelFlag: 'keep-top-level-flag',
    };
    const statePath = path.join(electronPaths.userData, 'state.json');
    await writeFile(
      statePath,
      JSON.stringify(compatibleState, null, 2),
      'utf8',
    );

    const store = new StateStore();
    await store.initialize();

    expect(store.getProjects()).toEqual([]);
    expect(store.getPublicSettings()).toMatchObject({
      defaultWorkspace: path.join(electronPaths.documents, 'liimit.ai Games'),
      permissionMode: 'yolo',
      developerMode: false,
    });
    expect(store.getRuntimeMcpServers()).toEqual([]);
    expect(await migrationBackups()).toEqual([]);

    const persisted = JSON.parse(await readFile(statePath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(persisted).toMatchObject({
      futureRoot: { enabled: true },
      futureTopLevelFlag: 'keep-top-level-flag',
      projects: [],
      settings: {
        main: { futureEndpointOption: 'keep-endpoint-option' },
        futureSetting: { enabled: true },
      },
      secrets: {},
    });
  });

  it('历史项目缺少 starterPreparation 时保持缺失且不触发自动迁移', async () => {
    const { project, persistedState } = makeStartupState(root);
    const statePath = path.join(electronPaths.userData, 'state.json');
    await writeFile(statePath, JSON.stringify(persistedState, null, 2), 'utf8');

    const store = new StateStore();
    await store.initialize();

    const [loaded] = store.getProjects();
    expect(loaded).toEqual(project);
    expect(Object.hasOwn(loaded ?? {}, 'starterPreparation')).toBe(false);

    const persisted = JSON.parse(await readFile(statePath, 'utf8')) as {
      projects: Array<Record<string, unknown>>;
    };
    expect(
      Object.hasOwn(persisted.projects[0] ?? {}, 'starterPreparation'),
    ).toBe(false);
  });

  it('合法 ready 和 failed 准备状态在初始化与再次打开后保持不变', async () => {
    const ready = {
      schemaVersion: 1,
      status: 'ready',
      phase: 'complete',
      attempt: 1,
      revision: 7,
      message: '基础游戏已经可以编辑和试玩。',
      startedAt: '2026-08-24T10:00:00.000Z',
      finishedAt: '2026-08-24T10:00:05.000Z',
    };
    const failed = {
      schemaVersion: 1,
      status: 'failed',
      phase: 'dependencies',
      attempt: 2,
      revision: 11,
      message: '依赖准备失败，请检查网络后重试。',
      errorCode: 'network',
      startedAt: '2026-08-24T11:00:00.000Z',
      finishedAt: '2026-08-24T11:00:03.000Z',
    };
    const firstProject = {
      ...makeProject('starter-ready'),
      starterPreparation: ready,
    };
    const secondProject = {
      ...makeProject('starter-failed'),
      starterPreparation: failed,
    };
    const statePath = path.join(electronPaths.userData, 'state.json');
    await writeFile(
      statePath,
      JSON.stringify({
        projects: [firstProject, secondProject],
        settings: {},
        secrets: {},
      }),
      'utf8',
    );

    const firstStore = new StateStore();
    await firstStore.initialize();
    expect(firstStore.getProject(firstProject.id)).toMatchObject({
      starterPreparation: ready,
    });
    expect(firstStore.getProject(secondProject.id)).toMatchObject({
      starterPreparation: failed,
    });

    const reopenedStore = new StateStore();
    await reopenedStore.initialize();
    expect(reopenedStore.getProject(firstProject.id)).toMatchObject({
      starterPreparation: ready,
    });
    expect(reopenedStore.getProject(secondProject.id)).toMatchObject({
      starterPreparation: failed,
    });
  });

  it.each([
    [
      'queued',
      {
        schemaVersion: 1,
        status: 'queued',
        phase: 'queued',
        attempt: 1,
        revision: 0,
        message: '基础游戏已排队，等待准备。',
      } satisfies StarterPreparation,
    ],
    [
      'preparing',
      {
        schemaVersion: 1,
        status: 'preparing',
        phase: 'build',
        attempt: 2,
        revision: 8,
        message: '正在构建 Web 游戏。',
        startedAt: '2026-08-24T12:00:00.000Z',
      } satisfies StarterPreparation,
    ],
  ] as const)(
    '启动时将遗留的 %s 状态一次性转换为 failed/interrupted',
    async (_label, preparation) => {
      const project = {
        ...makeProject(`interrupted-${preparation.status}`),
        starterPreparation: preparation,
      };
      const statePath = path.join(electronPaths.userData, 'state.json');
      await writeFile(
        statePath,
        JSON.stringify({
          projects: [project],
          settings: {},
          secrets: {},
        }),
        'utf8',
      );

      const firstStore = new StateStore();
      await firstStore.initialize();
      const recovered = firstStore.getProject(project.id)!;

      expect(recovered).toMatchObject({
        id: project.id,
        name: project.name,
        path: project.path,
        prompt: project.prompt,
        starterPreparation: {
          status: 'failed',
          phase: preparation.phase,
          attempt: preparation.attempt,
          revision: preparation.revision + 1,
          errorCode: 'interrupted',
          message: expect.stringMatching(/中断.*重试/),
          finishedAt: expect.any(String),
        },
      });
      expect(recovered.starterPreparation?.startedAt).toBe(
        preparation.startedAt,
      );
      expect(Date.parse(recovered.updatedAt)).not.toBeNaN();

      const persisted = JSON.parse(await readFile(statePath, 'utf8')) as {
        projects: ProjectRecord[];
      };
      expect(persisted.projects).toEqual([recovered]);

      const reopenedStore = new StateStore();
      await reopenedStore.initialize();
      expect(reopenedStore.getProject(project.id)).toEqual(recovered);
    },
  );

  it('重启恢复不改 ready、failed、历史项目或任何项目目录文件', async () => {
    const projectRoot = path.join(root, 'preserved-project-files');
    await mkdir(projectRoot);
    await writeFile(
      path.join(projectRoot, 'user-level.txt'),
      'preserve this exact user content',
      'utf8',
    );
    const readyPreparation: StarterPreparation = {
      schemaVersion: 1,
      status: 'ready',
      phase: 'complete',
      attempt: 1,
      revision: 6,
      message: '基础游戏已经可以编辑和试玩。',
      startedAt: '2026-08-24T10:00:00.000Z',
      finishedAt: '2026-08-24T10:00:06.000Z',
    };
    const failedPreparation: StarterPreparation = {
      schemaVersion: 1,
      status: 'failed',
      phase: 'dependencies',
      attempt: 2,
      revision: 10,
      message: '网络连接失败，请检查网络后重试。',
      errorCode: 'network',
      startedAt: '2026-08-24T11:00:00.000Z',
      finishedAt: '2026-08-24T11:00:03.000Z',
    };
    const readyProject = {
      ...makeProject('stable-ready-project'),
      path: projectRoot,
      starterPreparation: readyPreparation,
    };
    const failedProject = {
      ...makeProject('stable-failed-project'),
      path: projectRoot,
      starterPreparation: failedPreparation,
    };
    const historicalProject = {
      ...makeProject('stable-historical-project'),
      path: projectRoot,
    };
    const statePath = path.join(electronPaths.userData, 'state.json');
    await writeFile(
      statePath,
      JSON.stringify({
        projects: [readyProject, failedProject, historicalProject],
        settings: {},
        secrets: {},
      }),
      'utf8',
    );

    const store = new StateStore();
    await store.initialize();

    expect(store.getProject(readyProject.id)).toEqual(readyProject);
    expect(store.getProject(failedProject.id)).toEqual(failedProject);
    expect(store.getProject(historicalProject.id)).toEqual(historicalProject);
    expect(
      Object.hasOwn(
        store.getProject(historicalProject.id)!,
        'starterPreparation',
      ),
    ).toBe(false);
    await expect(
      readFile(path.join(projectRoot, 'user-level.txt'), 'utf8'),
    ).resolves.toBe('preserve this exact user content');
    expect(await readdir(projectRoot)).toEqual(['user-level.txt']);
  });

  it.each([
    ['不是对象', null],
    ['缺少 schemaVersion', starterPreparationWithout('schemaVersion')],
    ['schemaVersion 不受支持', validStarterPreparation({ schemaVersion: 2 })],
    ['status 无效', validStarterPreparation({ status: 'running' })],
    ['phase 无效', validStarterPreparation({ phase: 'agent' })],
    ['attempt 不是正整数', validStarterPreparation({ attempt: 0 })],
    ['attempt 不是整数', validStarterPreparation({ attempt: 1.5 })],
    [
      'attempt 超过安全整数',
      validStarterPreparation({ attempt: Number.MAX_SAFE_INTEGER + 1 }),
    ],
    ['revision 是负数', validStarterPreparation({ revision: -1 })],
    ['revision 不是整数', validStarterPreparation({ revision: 1.5 })],
    [
      'revision 超过安全整数',
      validStarterPreparation({ revision: Number.MAX_SAFE_INTEGER + 1 }),
    ],
    ['message 类型无效', validStarterPreparation({ message: 42 })],
    [
      'message 超过 1000 字符',
      validStarterPreparation({ message: '错'.repeat(1_001) }),
    ],
    ['errorCode 无效', validStarterPreparation({ errorCode: 'raw-stderr' })],
    ['startedAt 类型无效', validStarterPreparation({ startedAt: 42 })],
    ['finishedAt 类型无效', validStarterPreparation({ finishedAt: 42 })],
  ] as const)(
    'starterPreparation %s 时拒绝初始化且保留原状态',
    async (_name, starterPreparation) => {
      const project = {
        ...makeProject('invalid-starter-preparation'),
        starterPreparation,
      };
      const statePath = path.join(electronPaths.userData, 'state.json');
      const originalState = JSON.stringify(
        { projects: [project], settings: {}, secrets: {} },
        null,
        2,
      );
      await writeFile(statePath, originalState, 'utf8');

      const store = new StateStore();
      await expect(store.initialize()).rejects.toThrow('state.json 结构无效');

      expect(() => store.getProjects()).toThrow('StateStore 尚未初始化');
      await expect(readFile(statePath, 'utf8')).resolves.toBe(originalState);
    },
  );

  it('只将旧版默认工作区名称升级为 liimit.ai', async () => {
    const legacyProductName = Buffer.from('Tm9vYmkuYWk=', 'base64').toString(
      'utf8',
    );
    const statePath = path.join(electronPaths.userData, 'state.json');
    await writeFile(
      statePath,
      JSON.stringify({
        settings: {
          defaultWorkspace: path.join(
            electronPaths.documents,
            `${legacyProductName} Games`,
          ),
        },
      }),
      'utf8',
    );

    const store = new StateStore();
    await store.initialize();

    expect(store.getPublicSettings().defaultWorkspace).toBe(
      path.join(electronPaths.documents, 'liimit.ai Games'),
    );
  });

  it('首次启动 state.json 不存在时正常创建默认状态', async () => {
    const store = new StateStore();

    await store.initialize();

    expect(store.getProjects()).toEqual([]);
    await expect(
      readFile(path.join(electronPaths.userData, 'state.json'), 'utf8'),
    ).resolves.toContain('"projects": []');
  });

  it.each([undefined, 'unknown-mode'])(
    '拒绝 upsert productMode=%s 的非固定项目',
    async (productMode) => {
      const store = new StateStore();
      await store.initialize();
      const unsupported = {
        ...makeProject('unsupported-project'),
        productMode,
      } as unknown as ProjectRecord;

      await expect(store.upsertProject(unsupported)).rejects.toThrow(
        '只允许保存 Phaser 3 · 2D 横版平台项目',
      );
      expect(store.getProjects()).toEqual([]);
    },
  );

  it.each(['writeFile', 'rename'] as const)(
    '%s 落盘失败时不在内存或后续快照中留下 ghost project',
    async (operation) => {
      const store = new StateStore();
      await store.initialize();
      const ghost = makeProject('ghost-project');
      const recovered = makeProject('recovered-project');

      fileSystemFailure.nextOperation = operation;
      await expect(store.upsertProject(ghost)).rejects.toThrow(
        `injected ${operation} failure`,
      );

      expect(store.getProjects()).toEqual([]);

      await store.upsertProject(recovered);
      expect(store.getProjects()).toEqual([recovered]);

      const persisted = JSON.parse(
        await readFile(path.join(electronPaths.userData, 'state.json'), 'utf8'),
      ) as { projects: ProjectRecord[] };
      expect(persisted.projects).toEqual([recovered]);
    },
  );

  it.each(['writeFile', 'rename'] as const)(
    '%s 落盘失败期间并发保存设置和 MCP 也不会重新落盘 ghost project',
    async (operation) => {
      const store = new StateStore();
      await store.initialize();
      const ghost = makeProject('concurrent-ghost-project');
      const concurrentWorkspace = path.join(root, 'concurrent-workspace');
      const settings = store.getPublicSettings();
      settings.defaultWorkspace = concurrentWorkspace;
      settings.developerMode = true;
      settings.main.apiKey = 'concurrent-main-secret';
      const mcpServers: McpServerDefinition[] = [
        {
          id: 'concurrent-mcp',
          name: '并发 MCP',
          description: '验证失败恢复期间的配置持久化',
          enabled: true,
          transport: 'stdio',
          command: 'concurrent-mcp',
          args: ['--stdio'],
          cwd: concurrentWorkspace,
          url: '',
          timeoutMs: 5_000,
          trust: true,
          env: [{ name: 'MCP_TOKEN', value: 'concurrent-mcp-secret' }],
          headers: [],
        },
      ];
      const failure = delayNextFileSystemFailure(operation);

      const failedUpsert = store.upsertProject(ghost);
      await failure.started;

      const savedSettings = store.saveSettings(settings);
      const savedMcpServers = store.saveMcpServers(mcpServers);
      failure.release();

      await expect(failedUpsert).rejects.toThrow(
        `injected ${operation} failure`,
      );
      await Promise.all([savedSettings, savedMcpServers]);

      expect(store.getProjects()).toEqual([]);
      expect(store.getRuntimeSettings()).toMatchObject({
        defaultWorkspace: concurrentWorkspace,
        developerMode: true,
        main: { apiKey: 'concurrent-main-secret' },
      });
      expect(store.getRuntimeMcpServers()).toEqual(mcpServers);

      const statePath = path.join(electronPaths.userData, 'state.json');
      const persisted = JSON.parse(await readFile(statePath, 'utf8')) as {
        projects: ProjectRecord[];
        settings: { defaultWorkspace: string; developerMode: boolean };
        secrets: { main?: string; mcpServers?: string };
      };
      expect(persisted.projects).toEqual([]);
      expect(persisted.settings).toMatchObject({
        defaultWorkspace: concurrentWorkspace,
        developerMode: true,
      });
      expect(persisted.secrets.main).toBe(
        encodedSecret('concurrent-main-secret'),
      );
      expect(
        JSON.parse(
          Buffer.from(persisted.secrets.mcpServers!, 'base64').toString('utf8'),
        ),
      ).toEqual(mcpServers);

      const recoveredStore = new StateStore();
      await recoveredStore.initialize();
      expect(recoveredStore.getProjects()).toEqual([]);
      expect(recoveredStore.getRuntimeSettings()).toMatchObject({
        defaultWorkspace: concurrentWorkspace,
        developerMode: true,
        main: { apiKey: 'concurrent-main-secret' },
      });
      expect(recoveredStore.getRuntimeMcpServers()).toEqual(mcpServers);
    },
  );
});

function delayNextFileSystemFailure(operation: 'writeFile' | 'rename'): {
  started: Promise<void>;
  release: () => void;
} {
  let notifyStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  fileSystemFailure.delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  fileSystemFailure.nextOperation = operation;
  fileSystemFailure.nextTarget = undefined;
  fileSystemFailure.notifyStarted = notifyStarted;
  return { started, release };
}

function failNextFileSystemOperation(
  operation: 'writeFile' | 'rename',
  target: 'backup' | 'state',
): void {
  fileSystemFailure.nextOperation = operation;
  fileSystemFailure.nextTarget = target;
}

async function migrationBackups(): Promise<string[]> {
  const entries = await readdir(electronPaths.userData);
  return entries
    .filter(
      (entry) =>
        entry.startsWith('state.json.pre-platformer-') &&
        entry.endsWith('.bak'),
    )
    .map((entry) => path.join(electronPaths.userData, entry))
    .sort();
}

function encodedSecret(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function replaceNestedValue(
  source: Record<string, unknown>,
  fieldPath: Array<string | number>,
  value: unknown,
): unknown {
  if (fieldPath.length === 0) return value;
  const copy = structuredClone(source);
  let parent: unknown = copy;
  for (const field of fieldPath.slice(0, -1)) {
    if (typeof field === 'number') {
      if (!Array.isArray(parent)) throw new Error('测试路径不是数组');
      parent = parent[field];
    } else {
      if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
        throw new Error('测试路径不是对象');
      }
      parent = (parent as Record<string, unknown>)[field];
    }
  }
  const lastField = fieldPath.at(-1)!;
  if (typeof lastField === 'number') {
    if (!Array.isArray(parent)) throw new Error('测试目标不是数组');
    parent[lastField] = value;
  } else {
    if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
      throw new Error('测试目标不是对象');
    }
    (parent as Record<string, unknown>)[lastField] = value;
  }
  return copy;
}

function expectStartupStateRecovered(
  store: StateStore,
  project: PersistedTestProject,
  legacyMcpServers: McpServerDefinition[],
  root: string,
): void {
  expect(store.getProjects()).toEqual([project]);
  expect(store.getRuntimeSettings()).toMatchObject({
    main: {
      baseUrl: 'https://startup-main.example.test/v1',
      model: 'startup-main-model',
      apiKey: 'startup-main-secret',
    },
    image: {
      baseUrl: 'https://startup-image.example.test/v1',
      model: 'startup-image-model',
      apiKey: 'startup-image-secret',
    },
    defaultWorkspace: path.join(root, 'startup-workspace'),
    developerMode: true,
  });
  expect(store.getRuntimeMcpServers()).toEqual(legacyMcpServers);
}

function makeStartupState(
  root: string,
  fixed = true,
): {
  project: PersistedTestProject;
  legacyMcpServers: McpServerDefinition[];
  persistedState: Record<string, unknown>;
} {
  const project: PersistedTestProject = {
    id: 'startup-legacy-project',
    name: '启动旧项目',
    path: path.join(root, 'startup-legacy-game'),
    prompt: '继续启动旧项目',
    status: 'completed',
    stage: 'complete',
    sessionId: 'startup-legacy-session',
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-03T03:04:05.000Z',
    ...(fixed ? { productMode: FIXED_PRODUCT_MODE.id } : {}),
  };
  const legacyMcpServers: McpServerDefinition[] = [
    {
      id: 'startup-legacy-mcp',
      name: '启动旧 MCP',
      description: '初始化故障后仍需保留',
      enabled: true,
      transport: 'stdio',
      command: 'startup-legacy-mcp',
      args: ['--stdio'],
      cwd: project.path,
      url: '',
      timeoutMs: 9_000,
      trust: true,
      env: [{ name: 'STARTUP_TOKEN', value: 'startup-mcp-secret' }],
      headers: [],
    },
  ];
  return {
    project,
    legacyMcpServers,
    persistedState: {
      projects: [project],
      settings: {
        main: {
          provider: 'openai-compat',
          baseUrl: 'https://startup-main.example.test/v1',
          model: 'startup-main-model',
        },
        reasoning: {
          provider: 'tongyi',
          baseUrl: 'https://startup-reasoning.example.test/v1',
          model: 'startup-reasoning-model',
        },
        image: {
          provider: 'tongyi',
          baseUrl: 'https://startup-image.example.test/v1',
          model: 'startup-image-model',
        },
        video: {
          provider: 'doubao',
          baseUrl: 'https://startup-video.example.test/v1',
          model: 'startup-video-model',
        },
        audio: {
          provider: 'minimax',
          baseUrl: 'https://startup-audio.example.test/v1',
          model: 'startup-audio-model',
        },
        defaultWorkspace: path.join(root, 'startup-workspace'),
        permissionMode: 'yolo',
        developerMode: true,
      },
      secrets: {
        main: encodedSecret('startup-main-secret'),
        image: encodedSecret('startup-image-secret'),
        mcpServers: encodedSecret(JSON.stringify(legacyMcpServers)),
      },
    },
  };
}

function makeProject(id: string): ProjectRecord {
  const timestamp = '2026-08-23T00:00:00.000Z';
  return {
    id,
    name: id,
    path: path.join(electronPaths.documents, id),
    prompt: '制作横版平台游戏',
    status: 'draft',
    stage: 'brief',
    productMode: FIXED_PRODUCT_MODE.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function validStarterPreparation(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: 'preparing',
    phase: 'dependencies',
    attempt: 1,
    revision: 2,
    message: '正在准备固定运行环境。',
    startedAt: '2026-08-24T12:00:00.000Z',
    ...overrides,
  };
}

function starterPreparationWithout(field: string): Record<string, unknown> {
  const value = validStarterPreparation();
  delete value[field];
  return value;
}
