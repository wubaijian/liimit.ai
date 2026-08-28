import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LevelDocument } from '../src/shared/levelDocument.js';
import type {
  ProjectRecord,
  StarterPreparationPhase,
} from '../src/shared/types.js';
import {
  makeFailedStarterPreparation,
  makeStarterProject,
  STARTER_PREPARATION_FIXTURE_TIMESTAMPS,
} from './starterPreparationFixtures.js';

type FixedPreparationPhase = Extract<
  StarterPreparationPhase,
  'scaffold' | 'dependencies'
>;
type ReportPreparationPhase = (phase: FixedPreparationPhase) => Promise<void>;

interface StarterPreparationServiceOptions {
  store: {
    upsertProject(project: ProjectRecord): Promise<void>;
  };
  projects: {
    prepareFixedProject(
      project: ProjectRecord,
      signal: AbortSignal,
      reportPhase: ReportPreparationPhase,
    ): Promise<unknown>;
    buildFixedProject(
      project: ProjectRecord,
      signal: AbortSignal,
    ): Promise<void>;
    verifyPlayableBuild(
      project: ProjectRecord,
      signal: AbortSignal,
    ): Promise<void>;
  };
  levelDocuments: {
    readRequired(project: ProjectRecord): Promise<LevelDocument>;
  };
  emitProject(project: ProjectRecord): void;
  now(): string;
}

interface StarterPreparationServiceInstance {
  enqueue(project: ProjectRecord): Promise<ProjectRecord>;
  shutdown(): Promise<void>;
}

interface StarterPreparationServiceModule {
  StarterPreparationService: new (
    options: StarterPreparationServiceOptions,
  ) => StarterPreparationServiceInstance;
}

const mainModules = import.meta.glob<StarterPreparationServiceModule>(
  '../src/main/*.ts',
);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('StarterPreparationService 成功流程', () => {
  it('按模板、依赖、构建、真实关卡和真实试玩顺序执行', async () => {
    const project = makeStarterProject();
    const operations: string[] = [];
    const persisted: ProjectRecord[] = [];
    const emitted: ProjectRecord[] = [];
    const options: StarterPreparationServiceOptions = {
      store: {
        upsertProject: vi.fn(async (nextProject) => {
          operations.push(describeState('persist', nextProject));
          persisted.push(structuredClone(nextProject));
        }),
      },
      projects: {
        prepareFixedProject: vi.fn(
          async (_nextProject, signal, reportPhase) => {
            expect(signal).toBeInstanceOf(AbortSignal);
            operations.push('prepare:entered');
            await reportPhase('scaffold');
            operations.push('scaffold:completed');
            await reportPhase('dependencies');
            operations.push('dependencies:completed');
          },
        ),
        buildFixedProject: vi.fn(async (_nextProject, signal) => {
          expect(signal).toBeInstanceOf(AbortSignal);
          operations.push('build:completed');
        }),
        verifyPlayableBuild: vi.fn(async (_nextProject, signal) => {
          expect(signal).toBeInstanceOf(AbortSignal);
          operations.push('preview-validation:completed');
        }),
      },
      levelDocuments: {
        readRequired: vi.fn(async () => {
          operations.push('level-validation:completed');
          return {
            version: 1,
            width: 640,
            height: 360,
            gridSize: 32,
            objects: [],
          };
        }),
      },
      emitProject: vi.fn((nextProject) => {
        expect(nextProject).toEqual(persisted.at(-1));
        operations.push(describeState('emit', nextProject));
        emitted.push(structuredClone(nextProject));
      }),
      now: () => STARTER_PREPARATION_FIXTURE_TIMESTAMPS.startedAt,
    };
    const service = await createService(options);

    const result = await service.enqueue(project);

    expect(operations).toEqual([
      'prepare:entered',
      'persist:scaffold:1',
      'emit:scaffold:1',
      'scaffold:completed',
      'persist:dependencies:2',
      'emit:dependencies:2',
      'dependencies:completed',
      'persist:build:3',
      'emit:build:3',
      'build:completed',
      'persist:level-validation:4',
      'emit:level-validation:4',
      'level-validation:completed',
      'persist:preview-validation:5',
      'emit:preview-validation:5',
      'preview-validation:completed',
      'persist:complete:6',
      'emit:complete:6',
    ]);
    expect(persisted.map((item) => item.starterPreparation?.revision)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(emitted).toEqual(persisted);
    expect(result).toEqual(persisted.at(-1));
    for (const persistedProject of persisted.slice(0, -1)) {
      const state = persistedProject.starterPreparation!;
      expect(Object.hasOwn(state, 'errorCode')).toBe(false);
      expect(Object.hasOwn(state, 'finishedAt')).toBe(false);
    }
    expect(result.starterPreparation).toMatchObject({
      status: 'ready',
      phase: 'complete',
      revision: 6,
    });
  });

  it('真实试玩探测完成前绝不持久化或通知 ready', async () => {
    const project = makeStarterProject();
    const persisted: ProjectRecord[] = [];
    const emitted: ProjectRecord[] = [];
    let releasePreview!: () => void;
    let notifyPreviewStarted!: () => void;
    const previewGate = new Promise<void>((resolve) => {
      releasePreview = resolve;
    });
    const previewStarted = new Promise<void>((resolve) => {
      notifyPreviewStarted = resolve;
    });
    const options: StarterPreparationServiceOptions = {
      store: {
        upsertProject: vi.fn(async (nextProject) => {
          persisted.push(structuredClone(nextProject));
        }),
      },
      projects: {
        prepareFixedProject: vi.fn(
          async (_nextProject, _signal, reportPhase) => {
            await reportPhase('scaffold');
            await reportPhase('dependencies');
          },
        ),
        buildFixedProject: vi.fn(async () => undefined),
        verifyPlayableBuild: vi.fn(async () => {
          notifyPreviewStarted();
          await previewGate;
        }),
      },
      levelDocuments: {
        readRequired: vi.fn(async () => ({
          version: 1,
          width: 640,
          height: 360,
          gridSize: 32,
          objects: [],
        })),
      },
      emitProject: vi.fn((nextProject) => {
        emitted.push(structuredClone(nextProject));
      }),
      now: () => STARTER_PREPARATION_FIXTURE_TIMESTAMPS.finishedAt,
    };
    const service = await createService(options);

    const preparation = service.enqueue(project);
    await previewStarted;

    expect(persisted.at(-1)?.starterPreparation).toMatchObject({
      status: 'preparing',
      phase: 'preview-validation',
      revision: 5,
    });
    expect(
      persisted.some((item) => item.starterPreparation?.status === 'ready'),
    ).toBe(false);
    expect(
      emitted.some((item) => item.starterPreparation?.status === 'ready'),
    ).toBe(false);

    releasePreview();
    await expect(preparation).resolves.toMatchObject({
      starterPreparation: {
        status: 'ready',
        phase: 'complete',
        revision: 6,
      },
    });
  });

  it('服务源码不依赖 Agent、模型配置、素材生成、MCP 或 API 用量服务', async () => {
    const sourceUrl = new URL(
      '../src/main/starterPreparationService.ts',
      import.meta.url,
    );
    const source = await readFile(sourceUrl, 'utf8');

    expect(source).not.toMatch(
      /from ['"].*(?:agentRunner|providerConnection|apiUsageStore|extensionManager|mcpConfig|githubSkillInstaller)/,
    );
    expect(source).not.toMatch(
      /getRuntimeSettings|getPublicSettings|apiKey|ProviderEndpoint/,
    );
  });
});

describe('StarterPreparationService 失败与并发契约', () => {
  it.each([
    [
      '网络不可达',
      'dependencies',
      codedError(
        'ENETUNREACH',
        'request https://registry.npmjs.org failed token=secret-value',
      ),
      'network',
      /网络.*重试/,
    ],
    [
      '目录权限不足',
      'scaffold',
      codedError('EACCES', '/Users/private/game/src permission denied'),
      'permission',
      /权限.*重试/,
    ],
    [
      '磁盘空间不足',
      'dependencies',
      codedError('ENOSPC', 'no space at /Users/private/game'),
      'disk-space',
      /空间.*重试/,
    ],
    [
      '项目目录不安全',
      'scaffold',
      new Error('src 目录不能是符号链接。'),
      'unsafe-project',
      /目录.*重试/,
    ],
    [
      '固定依赖失败',
      'dependencies',
      new Error('npm exited with private stderr'),
      'dependency',
      /运行环境.*重试/,
    ],
    [
      '构建失败',
      'build',
      new Error('vite raw stderr and /private/project/path'),
      'build',
      /构建.*重试/,
    ],
    [
      '真实关卡失败',
      'level-validation',
      new Error('broken level payload at /private/project/src/level.json'),
      'level-validation',
      /关卡.*重试/,
    ],
    [
      '真实试玩失败',
      'preview-validation',
      new Error('http://127.0.0.1:49152 leaked probe detail'),
      'preview-validation',
      /试玩.*重试/,
    ],
  ] as const)(
    '%s时持久化稳定分类和脱敏中文说明',
    async (_label, phase, failure, errorCode, messagePattern) => {
      const persisted: ProjectRecord[] = [];
      const emitted: ProjectRecord[] = [];
      const options = failureOptions(phase, failure, persisted, emitted);
      const service = await createService(options);

      const result = await service.enqueue(makeStarterProject());

      expect(result.starterPreparation).toMatchObject({
        status: 'failed',
        phase,
        errorCode,
        finishedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.finishedAt,
      });
      expect(result.starterPreparation?.message).toMatch(messagePattern);
      expect(result.starterPreparation?.message).not.toMatch(
        /https?:\/\/|secret-value|private stderr|\/Users\/private|\/private\/project|127\.0\.0\.1/,
      );
      expect(emitted.at(-1)).toEqual(persisted.at(-1));
      expect(emitted.at(-1)).toEqual(result);
    },
  );

  it('失败后保留项目资料和已经安全写入的文件内容', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'liimit-starter-failure-files-'),
    );
    temporaryRoots.push(root);
    const safeFile = path.join(root, 'safe-template-file.txt');
    const project = makeStarterProject({ path: root });
    const failure = codedError('ENOSPC', 'disk full after safe write');
    const options = successfulOptions();
    options.projects.prepareFixedProject = vi.fn(
      async (_nextProject, _signal, reportPhase) => {
        await reportPhase('scaffold');
        await writeFile(safeFile, 'safe generated content', 'utf8');
        await reportPhase('dependencies');
        throw failure;
      },
    );
    const service = await createService(options);

    const result = await service.enqueue(project);

    expect(result).toMatchObject({
      id: project.id,
      name: project.name,
      path: project.path,
      prompt: project.prompt,
      starterPreparation: { status: 'failed', errorCode: 'disk-space' },
    });
    await expect(readFile(safeFile, 'utf8')).resolves.toBe(
      'safe generated content',
    );
  });

  it('同一项目的重复请求合并为一次准备流程', async () => {
    const gate = deferred<void>();
    const options = successfulOptions();
    options.projects.prepareFixedProject = vi.fn(
      async (_project, _signal, reportPhase) => {
        await reportPhase('scaffold');
        await gate.promise;
        await reportPhase('dependencies');
      },
    );
    const service = await createService(options);
    const project = makeStarterProject();

    const first = service.enqueue(project);
    const second = service.enqueue(project);
    await vi.waitFor(() =>
      expect(options.projects.prepareFixedProject).toHaveBeenCalled(),
    );
    const callCountWhileBlocked = vi.mocked(
      options.projects.prepareFixedProject,
    ).mock.calls.length;
    gate.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(callCountWhileBlocked).toBe(1);
    expect(options.projects.prepareFixedProject).toHaveBeenCalledOnce();
    expect(firstResult).toEqual(secondResult);
    expect(firstResult.starterPreparation).toMatchObject({
      status: 'ready',
      attempt: 1,
      revision: 6,
    });
  });

  it('失败项目真正重试时 attempt 只增加一次并清除上次失败字段', async () => {
    const persisted: ProjectRecord[] = [];
    const gate = deferred<void>();
    const options = successfulOptions();
    options.store.upsertProject = vi.fn(async (project) => {
      persisted.push(structuredClone(project));
    });
    options.projects.prepareFixedProject = vi.fn(
      async (_project, _signal, reportPhase) => {
        await reportPhase('scaffold');
        await gate.promise;
        await reportPhase('dependencies');
      },
    );
    const service = await createService(options);
    const failedProject = makeStarterProject({
      starterPreparation: makeFailedStarterPreparation({
        attempt: 1,
        revision: 3,
      }),
    });

    const first = service.enqueue(failedProject);
    const duplicate = service.enqueue(failedProject);
    await vi.waitFor(() => expect(persisted.length).toBeGreaterThan(1));

    const {
      errorCode: _previousErrorCode,
      startedAt: _previousStartedAt,
      finishedAt: _previousFinishedAt,
      ...previousPreparation
    } = failedProject.starterPreparation!;
    expect(persisted[0]?.starterPreparation).toEqual({
      ...previousPreparation,
      status: 'queued',
      phase: 'queued',
      attempt: 2,
      revision: 4,
      message: '基础游戏已排队，等待准备。',
    });
    expect(Object.hasOwn(persisted[0]!.starterPreparation!, 'errorCode')).toBe(
      false,
    );
    expect(Object.hasOwn(persisted[0]!.starterPreparation!, 'startedAt')).toBe(
      false,
    );
    expect(Object.hasOwn(persisted[0]!.starterPreparation!, 'finishedAt')).toBe(
      false,
    );
    expect(
      persisted.every((project) => project.starterPreparation?.attempt === 2),
    ).toBe(true);

    gate.resolve();
    const [firstResult, duplicateResult] = await Promise.all([
      first,
      duplicate,
    ]);
    expect(firstResult).toEqual(duplicateResult);
    expect(firstResult.starterPreparation).toMatchObject({
      status: 'ready',
      attempt: 2,
    });
  });

  it('不同项目按进入顺序串行准备', async () => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const entered: string[] = [];
    const options = successfulOptions();
    options.projects.prepareFixedProject = vi.fn(
      async (project, _signal, reportPhase) => {
        entered.push(project.id);
        await reportPhase('scaffold');
        await (project.id === 'first-project'
          ? firstGate.promise
          : secondGate.promise);
        await reportPhase('dependencies');
      },
    );
    const service = await createService(options);

    const first = service.enqueue(makeStarterProject({ id: 'first-project' }));
    const second = service.enqueue(
      makeStarterProject({ id: 'second-project' }),
    );
    await vi.waitFor(() => expect(entered.length).toBeGreaterThan(0));
    const enteredBeforeFirstFinished = [...entered];
    firstGate.resolve();
    await vi.waitFor(() => expect(entered).toContain('second-project'));
    secondGate.resolve();
    await Promise.all([first, second]);

    expect(enteredBeforeFirstFinished).toEqual(['first-project']);
    expect(entered).toEqual(['first-project', 'second-project']);
  });

  it('主动关闭服务会中止正在运行的准备并保存 interrupted', async () => {
    let activeSignal: AbortSignal | undefined;
    const fallback = deferred<void>();
    const options = successfulOptions();
    options.projects.prepareFixedProject = vi.fn(
      async (_project, signal, reportPhase) => {
        activeSignal = signal;
        await reportPhase('scaffold');
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(codedError('ABORT_ERR', 'raw process aborted')),
            { once: true },
          );
          void fallback.promise.then(resolve);
        });
      },
    );
    const service = await createService(options);
    const preparation = service.enqueue(makeStarterProject());
    await vi.waitFor(() => expect(activeSignal).toBeDefined());
    if (typeof service.shutdown !== 'function') {
      fallback.resolve();
      await preparation;
      throw new Error('StarterPreparationService.shutdown 尚未实现。');
    }

    await service.shutdown();
    const result = await preparation;

    expect(activeSignal?.aborted).toBe(true);
    expect(result.starterPreparation).toMatchObject({
      status: 'failed',
      phase: 'scaffold',
      errorCode: 'interrupted',
    });
    expect(result.starterPreparation?.message).toMatch(/中断.*重试/);
  });

  it('状态持久化失败时不通知页面、不继续执行且不暴露原始错误', async () => {
    const options = successfulOptions();
    options.store.upsertProject = vi.fn(async () => {
      throw new Error(
        'write /Users/private/state.json failed with secret-value',
      );
    });
    const service = await createService(options);

    const preparation = service.enqueue(makeStarterProject());
    await expect(preparation).rejects.toThrow(/准备状态.*保存失败/);
    await expect(preparation).rejects.not.toThrow(
      /\/Users\/private|secret-value/,
    );
    expect(options.emitProject).not.toHaveBeenCalled();
    expect(options.projects.buildFixedProject).not.toHaveBeenCalled();
    expect(options.levelDocuments.readRequired).not.toHaveBeenCalled();
    expect(options.projects.verifyPlayableBuild).not.toHaveBeenCalled();
  });
});

async function createService(
  options: StarterPreparationServiceOptions,
): Promise<StarterPreparationServiceInstance> {
  const loadModule = mainModules['../src/main/starterPreparationService.ts'];
  if (!loadModule) {
    throw new Error(
      'StarterPreparationService 尚未实现；这是 T015 前的预期失败。',
    );
  }
  const module = await loadModule();
  return new module.StarterPreparationService(options);
}

function describeState(prefix: string, project: ProjectRecord): string {
  const preparation = project.starterPreparation;
  return `${prefix}:${preparation?.phase}:${preparation?.revision}`;
}

function successfulOptions(): StarterPreparationServiceOptions {
  return {
    store: { upsertProject: vi.fn(async () => undefined) },
    projects: {
      prepareFixedProject: vi.fn(async (_project, _signal, reportPhase) => {
        await reportPhase('scaffold');
        await reportPhase('dependencies');
      }),
      buildFixedProject: vi.fn(async () => undefined),
      verifyPlayableBuild: vi.fn(async () => undefined),
    },
    levelDocuments: {
      readRequired: vi.fn(async () => ({
        version: 1,
        width: 640,
        height: 360,
        gridSize: 32,
        objects: [],
      })),
    },
    emitProject: vi.fn(),
    now: () => STARTER_PREPARATION_FIXTURE_TIMESTAMPS.finishedAt,
  };
}

function failureOptions(
  phase: StarterPreparationPhase,
  failure: Error,
  persisted: ProjectRecord[],
  emitted: ProjectRecord[],
): StarterPreparationServiceOptions {
  const options = successfulOptions();
  options.store.upsertProject = vi.fn(async (project) => {
    persisted.push(structuredClone(project));
  });
  options.emitProject = vi.fn((project) => {
    emitted.push(structuredClone(project));
  });
  options.projects.prepareFixedProject = vi.fn(
    async (_project, _signal, reportPhase) => {
      await reportPhase('scaffold');
      if (phase === 'scaffold') throw failure;
      await reportPhase('dependencies');
      if (phase === 'dependencies') throw failure;
    },
  );
  options.projects.buildFixedProject = vi.fn(async () => {
    if (phase === 'build') throw failure;
  });
  options.levelDocuments.readRequired = vi.fn(async () => {
    if (phase === 'level-validation') throw failure;
    return {
      version: 1,
      width: 640,
      height: 360,
      gridSize: 32,
      objects: [],
    };
  });
  options.projects.verifyPlayableBuild = vi.fn(async () => {
    if (phase === 'preview-validation') throw failure;
  });
  return options;
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
