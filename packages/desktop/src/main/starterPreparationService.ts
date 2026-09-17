import type { LevelDocument } from '../shared/levelDocument.js';
import {
  isFixedProductMode,
  type ProjectRecord,
  type StarterPreparationErrorCode,
  type StarterPreparationPhase,
} from '../shared/types.js';
import type { FixedProjectPreparationReporter } from './fixedProjectProvisioner.js';

type PreparationProjectManager = {
  prepareFixedProject(
    project: ProjectRecord,
    signal: AbortSignal,
    reportPhase: FixedProjectPreparationReporter,
  ): Promise<unknown>;
  buildFixedProject(project: ProjectRecord, signal: AbortSignal): Promise<void>;
  verifyPlayableBuild(
    project: ProjectRecord,
    signal: AbortSignal,
  ): Promise<void>;
};

export interface StarterPreparationServiceOptions {
  store: {
    upsertProject(project: ProjectRecord): Promise<void>;
  };
  projects: PreparationProjectManager;
  levelDocuments: {
    readRequired(project: ProjectRecord): Promise<LevelDocument>;
  };
  emitProject(project: ProjectRecord): void;
  now: () => string;
}

const PREPARATION_MESSAGES: Record<StarterPreparationPhase, string> = {
  queued: '基础游戏已排队，等待准备。',
  scaffold: '正在复制固定游戏模板。',
  dependencies: '正在准备固定运行环境。',
  build: '正在构建 Web 游戏。',
  'level-validation': '正在检查真实关卡。',
  'preview-validation': '正在检查 Web 试玩。',
  complete: '基础游戏已经可以编辑和试玩。',
};

const FAILURE_MESSAGES: Record<StarterPreparationErrorCode, string> = {
  interrupted: '基础游戏准备被中断，请重试。',
  network: '网络暂时不可用，请检查网络连接后重试。',
  permission: '项目目录权限不足，请检查读写权限后重试。',
  'disk-space': '磁盘空间不足，请清理空间后重试。',
  'unsafe-project': '项目目录不安全，请检查目录后重试。',
  dependency: '固定运行环境准备失败，请检查网络后重试。',
  build: 'Web 游戏构建失败，请重试。',
  'level-validation': '真实关卡检查失败，请修复关卡后重试。',
  'preview-validation': 'Web 试玩检查失败，请重试。',
  persistence: '基础游戏准备状态保存失败，请重试。',
  unknown: '基础游戏准备失败，请重试。',
};

class PreparationPersistenceError extends Error {
  constructor() {
    super(FAILURE_MESSAGES.persistence);
    this.name = 'PreparationPersistenceError';
  }
}

export class StarterPreparationService {
  private readonly jobs = new Map<string, Promise<ProjectRecord>>();
  private readonly controllers = new Map<string, AbortController>();
  private queueTail: Promise<void> = Promise.resolve();
  private shuttingDown = false;
  private readonly cancelled = new Set<string>();

  constructor(private readonly options: StarterPreparationServiceOptions) {}

  enqueue(project: ProjectRecord): Promise<ProjectRecord> {
    try {
      this.validateProject(project);
    } catch (error) {
      return Promise.reject(error);
    }

    const active = this.jobs.get(project.id);
    if (active) return active;
    if (project.starterPreparation?.status === 'ready') {
      return Promise.resolve(project);
    }
    if (this.shuttingDown) {
      return Promise.reject(new Error('应用正在退出，不能开始新的准备任务。'));
    }

    const job = this.queueTail.then(() => this.prepare(project));
    this.jobs.set(project.id, job);
    this.queueTail = job.then(
      () => undefined,
      () => undefined,
    );
    void job.then(
      () => this.removeJob(project.id, job),
      () => this.removeJob(project.id, job),
    );
    return job;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const controller of this.controllers.values()) controller.abort();
    await Promise.allSettled([...this.jobs.values()]);
  }

  isProjectBusy(projectId: string): boolean {
    return this.jobs.has(projectId);
  }

  async cancel(projectId: string): Promise<void> {
    if (!this.jobs.has(projectId)) return;
    this.cancelled.add(projectId);
    this.controllers.get(projectId)?.abort();
    await this.jobs.get(projectId);
  }

  private validateProject(project: ProjectRecord): void {
    if (!isFixedProductMode(project)) {
      throw new Error('只允许准备 Phaser 3 · 2D 横版平台项目。');
    }
    if (!project.starterPreparation) {
      throw new Error('项目没有基础游戏准备记录。');
    }
  }

  private removeJob(
    projectId: string,
    completed: Promise<ProjectRecord>,
  ): void {
    if (this.jobs.get(projectId) === completed) this.jobs.delete(projectId);
  }

  private async prepare(project: ProjectRecord): Promise<ProjectRecord> {
    let currentProject = project;
    let currentPhase = project.starterPreparation?.phase ?? 'queued';
    const controller = new AbortController();
    this.controllers.set(project.id, controller);

    try {
      if (this.shuttingDown || this.cancelled.has(project.id)) {
        return await this.persistFailure(
          currentProject,
          currentPhase,
          'interrupted',
        );
      }

      if (currentProject.starterPreparation?.status === 'failed') {
        const attempt = currentProject.starterPreparation.attempt + 1;
        if (!Number.isSafeInteger(attempt)) {
          throw new Error('基础游戏重试次数无效。');
        }
        currentProject = await this.persistState(currentProject, {
          status: 'queued',
          phase: 'queued',
          attempt,
          message: PREPARATION_MESSAGES.queued,
          errorCode: undefined,
          startedAt: undefined,
          finishedAt: undefined,
        });
        currentPhase = 'queued';
      }

      const enterPhase = async (
        phase: Exclude<StarterPreparationPhase, 'queued' | 'complete'>,
      ): Promise<void> => {
        currentPhase = phase;
        const startedAt =
          currentProject.starterPreparation?.startedAt ?? this.options.now();
        currentProject = await this.persistState(currentProject, {
          status: 'preparing',
          phase,
          message: PREPARATION_MESSAGES[phase],
          errorCode: undefined,
          startedAt,
          finishedAt: undefined,
        });
      };

      await this.options.projects.prepareFixedProject(
        currentProject,
        controller.signal,
        enterPhase,
      );

      await enterPhase('build');
      await this.options.projects.buildFixedProject(
        currentProject,
        controller.signal,
      );

      await enterPhase('level-validation');
      await this.options.levelDocuments.readRequired(currentProject);

      await enterPhase('preview-validation');
      await this.options.projects.verifyPlayableBuild(
        currentProject,
        controller.signal,
      );

      return await this.persistState(currentProject, {
        status: 'ready',
        phase: 'complete',
        message: PREPARATION_MESSAGES.complete,
        errorCode: undefined,
        finishedAt: this.options.now(),
      });
    } catch (error) {
      if (error instanceof PreparationPersistenceError) throw error;
      const errorCode = classifyFailure(error, currentPhase, controller.signal);
      return this.persistFailure(currentProject, currentPhase, errorCode);
    } finally {
      this.cancelled.delete(project.id);
      if (this.controllers.get(project.id) === controller) {
        this.controllers.delete(project.id);
      }
    }
  }

  private persistFailure(
    project: ProjectRecord,
    phase: StarterPreparationPhase,
    errorCode: StarterPreparationErrorCode,
  ): Promise<ProjectRecord> {
    return this.persistState(project, {
      status: 'failed',
      phase,
      errorCode,
      message: FAILURE_MESSAGES[errorCode],
      finishedAt: this.options.now(),
    });
  }

  private async persistState(
    project: ProjectRecord,
    change: Pick<
      NonNullable<ProjectRecord['starterPreparation']>,
      'status' | 'phase' | 'message'
    > &
      Partial<
        Pick<
          NonNullable<ProjectRecord['starterPreparation']>,
          'attempt' | 'errorCode' | 'startedAt' | 'finishedAt'
        >
      >,
  ): Promise<ProjectRecord> {
    const preparation = project.starterPreparation;
    if (!preparation) {
      throw new Error('项目没有基础游戏准备记录。');
    }
    const timestamp = this.options.now();
    const nextPreparation = {
      ...preparation,
      ...change,
      revision: preparation.revision + 1,
    };
    for (const field of ['errorCode', 'startedAt', 'finishedAt'] as const) {
      if (nextPreparation[field] === undefined) delete nextPreparation[field];
    }
    const nextProject: ProjectRecord = {
      ...project,
      updatedAt: timestamp,
      starterPreparation: nextPreparation,
    };

    try {
      await this.options.store.upsertProject(nextProject);
    } catch {
      throw new PreparationPersistenceError();
    }
    this.options.emitProject(nextProject);
    return nextProject;
  }
}

function classifyFailure(
  error: unknown,
  phase: StarterPreparationPhase,
  signal: AbortSignal,
): StarterPreparationErrorCode {
  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (signal.aborted || code === 'ABORT_ERR' || code === 'ERR_ABORTED') {
    return 'interrupted';
  }
  if (
    [
      'ENETUNREACH',
      'ENETDOWN',
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'EAI_AGAIN',
    ].includes(code)
  ) {
    return 'network';
  }
  if (code === 'EACCES' || code === 'EPERM') return 'permission';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'disk-space';
  if (
    /符号链接|目录.{0,12}(?:不安全|越界)|unsafe|outside project/i.test(message)
  ) {
    return 'unsafe-project';
  }

  return {
    dependencies: 'dependency',
    build: 'build',
    'level-validation': 'level-validation',
    'preview-validation': 'preview-validation',
    scaffold: 'unsafe-project',
    queued: 'unknown',
    complete: 'unknown',
  }[phase] as StarterPreparationErrorCode;
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.toUpperCase() : '';
}
