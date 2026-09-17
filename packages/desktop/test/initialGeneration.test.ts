import { describe, expect, it, vi } from 'vitest';
import {
  InitialGenerationService,
  validateCreationMode,
} from '../src/main/initialGenerationService.js';
import { FIXED_PRODUCT_MODE, type ProjectRecord } from '../src/shared/types.js';
import { makeReadyStarterPreparation } from './starterPreparationFixtures.js';
import { StarterPreparationService } from '../src/main/starterPreparationService.js';
import { makeStarterProject } from './starterPreparationFixtures.js';
import { readFileSync } from 'node:fs';
import { mergeProjectUpdate } from '../src/renderer/App.js';

function fixture() {
  let current: ProjectRecord = {
    id: 'p',
    name: 'test',
    path: '/test',
    prompt: '制作三关冰雪游戏',
    status: 'draft',
    stage: 'brief',
    productMode: FIXED_PRODUCT_MODE.id,
    createdAt: '',
    updatedAt: '',
    creationMode: 'ai',
    initialGeneration: 'pending',
  };
  let resolve!: (p: ProjectRecord) => void;
  const preparation = new Promise<ProjectRecord>((r) => {
    resolve = r;
  });
  const start = vi.fn(async () => ({ accepted: true }));
  const preflight = vi.fn();
  const create = vi.fn(async () => current);
  const emit = vi.fn();
  const service = new InitialGenerationService({
    create,
    prepare: () => preparation,
    cancelPreparation: async () => {},
    getProject: () => current,
    save: async (p) => {
      current = p;
    },
    emit,
    preflight,
    start,
  });
  return {
    service,
    start,
    preflight,
    create,
    emit,
    get current() {
      return current;
    },
    ready: () => {
      current = {
        ...current,
        starterPreparation: makeReadyStarterPreparation(),
      };
      resolve(current);
    },
    fail: () =>
      resolve({
        ...current,
        starterPreparation: {
          ...makeReadyStarterPreparation(),
          status: 'failed',
        },
      }),
  };
}
const input = {
  name: 'test',
  directory: '/test',
  prompt: '制作三关冰雪游戏',
  creationMode: 'ai' as const,
};

describe('AI create flow', () => {
  it('forwards creation mode through UI and IPC, not a renderer auto-run effect', () => {
    const dialog = readFileSync(
      new URL(
        '../src/renderer/components/NewProjectDialog.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    const main = readFileSync(
      new URL('../src/main/main.ts', import.meta.url),
      'utf8',
    );
    expect(dialog).toContain(
      "creationMode: creationMethod === 'ai' ? 'ai' : 'template'",
    );
    expect(dialog).toContain('创建并生成');
    expect(dialog).toContain('API 费用');
    expect(main).toContain(
      'creationMode: validateCreationMode(input.creationMode)',
    );
    expect(main).toMatch(
      /initialGeneration\.create\(\s*validateCreateProjectInput\(input\)/,
    );
  });
  it('accepts incomplete creation update even when preparation revision is unchanged', () => {
    const project = makeStarterProject({
      creationMode: 'ai',
      initialGeneration: 'pending',
    });
    const failed = {
      ...project,
      initialGeneration: 'incomplete' as const,
      status: 'failed' as const,
    };
    expect(mergeProjectUpdate([project], failed)[0]).toMatchObject({
      initialGeneration: 'incomplete',
      status: 'failed',
    });
  });
  it('cancels an active preparation before starting later phases', async () => {
    let entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    const build = vi.fn();
    const service = new StarterPreparationService({
      store: { upsertProject: async () => {} },
      projects: {
        prepareFixedProject: async (_p, signal) => {
          entered();
          await new Promise((_r, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            ),
          );
        },
        buildFixedProject: build,
        verifyPlayableBuild: vi.fn(),
      },
      levelDocuments: { readRequired: vi.fn() },
      emitProject: vi.fn(),
      now: () => new Date().toISOString(),
    });
    const project = makeStarterProject();
    const job = service.enqueue(project);
    await started;
    await service.cancel(project.id);
    expect((await job).starterPreparation).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
    });
    expect(build).not.toHaveBeenCalled();
  });
  it('defaults old calls to template and rejects unknown modes', () => {
    expect(validateCreationMode(undefined)).toBe('template');
    expect(validateCreationMode('ai')).toBe('ai');
    expect(() => validateCreationMode('auto')).toThrow();
  });
  it('starts original requirements once only after preparation', async () => {
    const f = fixture();
    await f.service.create(input);
    expect(f.start).not.toHaveBeenCalled();
    await expect(f.service.create(input)).rejects.toThrow(/正在/);
    expect(() => f.service.assertIdle()).toThrow();
    f.ready();
    await f.service.settled();
    expect(f.start).toHaveBeenCalledExactlyOnceWith({
      projectId: 'p',
      prompt: input.prompt,
      resume: false,
    });
    expect(f.service.assertIdle()).toBeUndefined();
  });
  it('template never invokes the model', async () => {
    const f = fixture();
    await f.service.create({ ...input, creationMode: 'template' });
    f.ready();
    await f.service.settled();
    expect(f.preflight).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it('preflight failure creates no project', async () => {
    const f = fixture();
    f.preflight.mockImplementation(() => {
      throw new Error('请先配置模型');
    });
    await expect(f.service.create(input)).rejects.toThrow('配置模型');
    expect(f.create).not.toHaveBeenCalled();
  });
  it('preparation failure never starts or marks completion', async () => {
    const f = fixture();
    await f.service.create(input);
    f.fail();
    await f.service.settled();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.current.initialGeneration).toBe('incomplete');
    expect(f.current.status).toBe('failed');
  });
  it('stop during preparation prevents API use', async () => {
    const f = fixture();
    await f.service.create(input);
    const stop = f.service.stop('p');
    f.ready();
    await stop;
    await f.service.settled();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.current.status).toBe('stopped');
  });
  it('shutdown prevents automatic launch', async () => {
    const f = fixture();
    await f.service.create(input);
    f.service.preventNewStarts();
    f.ready();
    await f.service.settled();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.current.initialGeneration).toBe('incomplete');
  });
  it('failed model startup retains requirements and exposes safe failure', async () => {
    const f = fixture();
    f.start.mockRejectedValueOnce(new Error('SECRET'));
    await f.service.create(input);
    f.ready();
    await f.service.settled();
    expect(f.current.prompt).toBe(input.prompt);
    expect(f.current.status).toBe('failed');
    expect(JSON.stringify(f.emit.mock.calls)).not.toContain('SECRET');
  });
});
