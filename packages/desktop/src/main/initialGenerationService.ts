import type {
  CreateProjectInput,
  ProjectRecord,
  StartAgentInput,
} from '../shared/types.js';

export function validateCreationMode(value: unknown): 'template' | 'ai' {
  if (value === undefined || value === 'template') return 'template';
  if (value === 'ai') return 'ai';
  throw new Error('创建方式无效，请选择固定模板或 AI 生成。');
}

/** One explicit creation intent; never replayed on launch or renderer mount. */
export class InitialGenerationService {
  private pending: { projectId?: string; cancelled: boolean } | undefined;
  private job: Promise<void> = Promise.resolve();
  private closing = false;
  constructor(
    private readonly options: {
      create(input: CreateProjectInput): Promise<ProjectRecord>;
      prepare(project: ProjectRecord): Promise<ProjectRecord>;
      cancelPreparation(projectId: string): Promise<void>;
      getProject(projectId: string): ProjectRecord;
      save(project: ProjectRecord): Promise<void>;
      emit(project: ProjectRecord): void;
      reportFailure?(project: ProjectRecord, message: string): Promise<void>;
      preflight(): void;
      start(input: StartAgentInput): Promise<{ accepted: boolean }>;
    },
  ) {}

  assertIdle(): void {
    if (this.closing) throw new Error('应用正在退出，请稍后重试。');
    if (this.pending)
      throw new Error('正在准备 AI 创建任务，请等待完成或先停止。');
  }

  isProjectBusy(projectId: string): boolean {
    return this.pending?.projectId === projectId;
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const mode = validateCreationMode(input.creationMode);
    if (this.closing) throw new Error('应用正在退出。');
    if (mode === 'template') {
      const project = await this.options.create({
        ...input,
        creationMode: mode,
      });
      void this.options.prepare(project).catch(() => {
        /* Preparation service owns its failure state. */
      });
      return project;
    }
    this.assertIdle();
    this.options.preflight();
    const intent = {
      projectId: undefined as string | undefined,
      cancelled: false,
    };
    this.pending = intent;
    try {
      const project = await this.options.create({
        ...input,
        creationMode: mode,
      });
      intent.projectId = project.id;
      this.job = this.run(project, intent).finally(() => {
        if (this.pending === intent) this.pending = undefined;
      });
      // Errors have a safe persistent state where possible; never print provider secrets.
      void this.job.catch(() =>
        console.error('[liimit.ai] AI 创建状态保存失败。'),
      );
      return project;
    } catch (error) {
      if (this.pending === intent) this.pending = undefined;
      throw error;
    }
  }

  private async run(
    project: ProjectRecord,
    intent: { cancelled: boolean },
  ): Promise<void> {
    try {
      const prepared = await this.options.prepare(project);
      if (intent.cancelled || this.closing) {
        await this.finishIncomplete(project.id, 'stopped');
        return;
      }
      if (prepared.starterPreparation?.status !== 'ready') {
        await this.finishIncomplete(project.id, 'failed');
        return;
      }
      // No await between cancellation check and handing ownership to Runner.
      const result = await this.options.start({
        projectId: project.id,
        prompt: project.prompt,
        resume: false,
      });
      if (!result.accepted)
        await this.finishIncomplete(
          project.id,
          intent.cancelled || this.closing ? 'stopped' : 'failed',
        );
    } catch {
      await this.finishIncomplete(
        project.id,
        intent.cancelled || this.closing ? 'stopped' : 'failed',
      );
    }
  }

  private async finishIncomplete(
    id: string,
    status: 'failed' | 'stopped',
  ): Promise<void> {
    const project = {
      ...this.options.getProject(id),
      initialGeneration: 'incomplete' as const,
      status,
      updatedAt: new Date().toISOString(),
    };
    await this.options.save(project);
    this.options.emit(project);
    if (status === 'failed') {
      const message =
        project.starterPreparation?.status === 'failed'
          ? '基础游戏准备未完成，因此没有启动 AI。请先重试基础准备，再点击“重试 AI 制作”。'
          : 'AI 创建未能启动或启动被拒绝。要求和已有内容已保留；请检查模型设置及执行记录，再点击“重试 AI 制作”。';
      await this.options.reportFailure?.(project, message);
    }
  }

  async stop(id: string): Promise<boolean> {
    if (this.pending?.projectId !== id) return false;
    this.pending.cancelled = true;
    await this.options.cancelPreparation(id);
    return true;
  }

  preventNewStarts(): void {
    this.closing = true;
    if (this.pending) this.pending.cancelled = true;
  }

  settled(): Promise<void> {
    return this.job;
  }
}
