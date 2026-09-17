import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import path from 'node:path';
import {
  FIXED_PRODUCT_MODE,
  isFixedProductMode,
  type AgentEvent,
  type AppSettings,
  type McpServerDefinition,
  type PipelineStageId,
  type ProjectRecord,
  type StartAgentInput,
} from '../shared/types.js';
import type { ProjectManager } from './projectManager.js';
import type { StateStore } from './store.js';
import {
  RunLivenessHarness,
  runLivenessPolicyFromEnv,
} from './runLivenessHarness.js';
import {
  collectMcpSecrets,
  toRuntimeMcpServers,
  type RuntimeMcpServerConfig,
} from './mcpConfig.js';
import { usageFromRuntimeResult, type ApiUsageInput } from './apiUsageStore.js';
import { projectContentSnapshot } from './projectContentSnapshot.js';
import type { ApiCostGateway } from './apiCostGateway.js';
import type { CostSlot } from '../shared/apiCost.js';
import {
  AgentVerificationGuard,
  verificationWorkflowInstructions,
} from './agentVerificationGuard.js';
import {
  foundationGameIsReady,
  readFoundationJson,
} from './foundationValidation.js';

const MAX_EVENT_TEXT = 12_000;
const MAX_STDERR_TEXT = 4_000;
const DEFAULT_ASSET_IDLE_TIMEOUT_MS = 12 * 60_000;

export interface RuntimeProductPolicy {
  fixedArchetype: typeof FIXED_PRODUCT_MODE.archetype;
  loadSkills: false;
  mcpServers: McpServerDefinition[];
}

/** Derives process-only behavior without changing the stored project or MCP data. */
export function deriveRuntimeProductPolicy(
  project: Pick<ProjectRecord, 'productMode'>,
): RuntimeProductPolicy {
  if (!isFixedProductMode(project)) {
    throw new Error('只允许运行 Phaser 3 · 2D 横版平台项目。');
  }

  return {
    fixedArchetype: FIXED_PRODUCT_MODE.archetype,
    loadSkills: false,
    mcpServers: [],
  };
}

export function assertSameProjectIdentity(
  expected: Pick<ProjectRecord, 'id' | 'path'>,
  candidate: Pick<ProjectRecord, 'id' | 'path'>,
): void {
  if (candidate.id !== expected.id || candidate.path !== expected.path) {
    throw new Error('Agent 项目身份发生变化，已停止以避免修改错误的项目。');
  }
}

export function buildRuntimeArguments(input: {
  prefixArgs: string[];
  productPolicy: RuntimeProductPolicy;
  model: string;
  resumeSessionId?: string;
}): string[] {
  const args = [
    ...input.prefixArgs,
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--approval-mode',
    'yolo',
    '--auth-type',
    'openai',
    '--chat-recording',
  ];
  if (
    input.productPolicy.fixedArchetype !== FIXED_PRODUCT_MODE.archetype ||
    input.productPolicy.loadSkills ||
    input.productPolicy.mcpServers.length > 0
  ) {
    throw new Error('Runtime 产品策略必须固定为无 Skills/MCP 的 platformer。');
  }
  // The CLI merges desktop credentials with user, project and extension MCP
  // settings. An explicitly empty allowlist clears that final merged set.
  args.push('--allowed-mcp-server-names', '');
  args.push('--model', input.model);
  if (input.resumeSessionId) {
    args.push('--resume', input.resumeSessionId);
  }
  return args;
}

export interface AssetProgressSnapshot {
  available: boolean;
  fileCount: number;
  latestMtimeMs: number;
}

export function inspectAssetProgress(
  projectPath: string,
  outputDirName = path.join('public', 'assets'),
): AssetProgressSnapshot {
  const assetsDir = path.join(projectPath, outputDirName);
  try {
    let fileCount = 0;
    let latestMtimeMs = 0;
    let available = true;
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.endsWith('.tmp')) continue;
      try {
        const info = statSync(path.join(assetsDir, entry.name));
        fileCount += 1;
        latestMtimeMs = Math.max(latestMtimeMs, info.mtimeMs);
      } catch {
        // A file can be atomically replaced between readdir and stat. Mark the
        // snapshot unreliable so the monitor preserves its previous baseline.
        available = false;
      }
    }
    return { available, fileCount, latestMtimeMs };
  } catch {
    return { available: false, fileCount: 0, latestMtimeMs: 0 };
  }
}

export interface PendingToolCall {
  id: string;
  name: string;
  outputDirName?: string;
  input?: unknown;
}

/** Tracks tool calls in runtime execution order and completes them by ID. */
export class PendingToolTracker {
  private readonly calls: PendingToolCall[] = [];
  private anonymousSequence = 0;

  add(name: string, id?: string, outputDirName?: string): PendingToolCall {
    const normalizedId = id?.trim();
    const call: PendingToolCall = {
      id: normalizedId || `anonymous:${++this.anonymousSequence}`,
      name,
      outputDirName,
    };
    const existingIndex = this.calls.findIndex(
      (candidate) => candidate.id === call.id,
    );
    if (existingIndex >= 0) this.calls[existingIndex] = call;
    else this.calls.push(call);
    return call;
  }

  complete(id?: string): PendingToolCall | undefined {
    const normalizedId = id?.trim();
    if (!normalizedId) return this.calls.shift();
    const index = this.calls.findIndex(
      (candidate) => candidate.id === normalizedId,
    );
    if (index < 0) return undefined;
    return this.calls.splice(index, 1)[0];
  }

  current(): PendingToolCall | undefined {
    return this.calls[0];
  }

  hasAssetGeneration(): boolean {
    return this.calls.some((call) => isGenerateAssetsTool(call.name));
  }

  clear(): void {
    this.calls.length = 0;
  }
}

export function assetIdleTimeoutFromEnv(env: NodeJS.ProcessEnv): number {
  const candidate = Number(env['GAMEAGENT_ASSET_IDLE_TIMEOUT_MS']);
  if (!Number.isFinite(candidate)) return DEFAULT_ASSET_IDLE_TIMEOUT_MS;
  return Math.min(30 * 60_000, Math.max(4 * 60_000, Math.trunc(candidate)));
}

interface RuntimeLocation {
  command: string;
  prefixArgs: string[];
  extraEnv?: Record<string, string>;
  ready: boolean;
  message: string;
}

interface RunnerOptions {
  repoRoot: string;
  packagedRuntimePath?: string;
  store: StateStore;
  projects: ProjectManager;
  emitEvent: (event: AgentEvent) => void;
  emitProject: (project: ProjectRecord) => void;
  recordApiUsage?: (input: ApiUsageInput) => Promise<void>;
  createCostMonitor?: (
    projectId: string,
    credentials: DesktopCredentialPayload,
    onBlock: (reason: string) => void,
    onWarning: (message: string) => void,
  ) => Promise<ApiCostGateway>;
  spawnRuntime?: typeof spawn;
  snapshotProject?: typeof projectContentSnapshot;
  terminateRuntime?: typeof terminateProcessTreeWithEscalation;
}

interface RuntimeContentBlock {
  id?: string;
  tool_use_id?: string;
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

interface RuntimeOutputMessage {
  session_id?: string;
  type?: string;
  event?: {
    delta?: {
      type?: string;
      text?: string;
      thinking?: string;
    };
  };
  message?: {
    content?: RuntimeContentBlock[];
  };
  is_error?: boolean;
  error?: { message?: string };
  result?: string;
  num_turns?: number;
}

interface ActiveRunState {
  costMonitor?: ApiCostGateway;
  verificationGuard: AgentVerificationGuard;
  guardStopped?: string;
  initialContent?: string | null;
  projectId: string;
  child: ChildProcess;
  stoppedByUser: boolean;
  timedOut: boolean;
  liveness: RunLivenessHarness;
  monitor: NodeJS.Timeout | null;
  providerLabel: string;
  provider: string;
  model: string;
  pendingTools: PendingToolTracker;
  assetProgress?: {
    toolId: string;
    outputDirName: string;
    snapshot: AssetProgressSnapshot;
  };
  reportedCompletion?: { summary: string };
}

interface ControlledPhaseState {
  projectId: string;
  kind: 'preparing' | 'finalizing';
  controller: AbortController;
  stoppedByUser: boolean;
  completion: Promise<void>;
  settle: () => void;
}

function createControlledPhase(
  projectId: string,
  kind: ControlledPhaseState['kind'],
): ControlledPhaseState {
  let resolveCompletion!: () => void;
  let settled = false;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  return {
    projectId,
    kind,
    controller: new AbortController(),
    stoppedByUser: false,
    completion,
    settle: () => {
      if (settled) return;
      settled = true;
      resolveCompletion();
    },
  };
}

const TOOL_STAGE: Array<[RegExp, PipelineStageId, string]> = [
  [/todo|plan/i, 'brief', '拆解制作任务'],
  [/classify.game.type|game.type.classifier/i, 'classify', '识别游戏类型'],
  [/copy.template|scaffold/i, 'scaffold', '搭建项目骨架'],
  [/generate.gdd/i, 'gdd', '生成游戏设计文档'],
  [/generate.game.assets|generate.assets/i, 'assets', '生成游戏素材'],
  [/generate.tilemap/i, 'tilemap', '生成地图'],
  [/write.file|replace|edit|smart.edit/i, 'code', '编写游戏代码'],
  [/shell|run.*command|test|build/i, 'verify', '构建与验证'],
];

export class AgentRunner {
  private active: ActiveRunState | null = null;
  private controlledPhase: ControlledPhaseState | null = null;
  private activeSecrets: string[] = [];
  private readonly assetIdleTimeoutMs = assetIdleTimeoutFromEnv(process.env);

  constructor(private readonly options: RunnerOptions) {}

  inspectRuntime(): RuntimeLocation {
    const packaged = this.options.packagedRuntimePath;
    if (packaged) {
      const runtimeRoot = path.dirname(packaged);
      const requiredFiles = [
        packaged,
        path.join(runtimeRoot, 'node_modules', 'tiktoken', 'package.json'),
        path.join(
          runtimeRoot,
          'node_modules',
          '@imgly',
          'background-removal-node',
          'package.json',
        ),
        path.join(runtimeRoot, 'node_modules', 'sharp', 'package.json'),
      ];
      const missing = requiredFiles.filter((file) => !existsSync(file));
      return {
        command: process.execPath,
        prefixArgs: [packaged],
        extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
        ready: missing.length === 0,
        message:
          missing.length === 0
            ? '使用应用内置 Agent Runtime'
            : `内置 Agent Runtime 不完整：缺少 ${path.relative(runtimeRoot, missing[0])}`,
      };
    }

    const bundledCli = path.join(this.options.repoRoot, 'dist', 'cli.js');
    if (existsSync(bundledCli)) {
      return {
        command: process.env['npm_node_execpath'] || 'node',
        prefixArgs: [bundledCli],
        ready: true,
        message: 'Agent Runtime 已构建',
      };
    }

    const tsxCli = path.join(
      this.options.repoRoot,
      'node_modules',
      'tsx',
      'dist',
      'cli.mjs',
    );
    const sourceCli = path.join(
      this.options.repoRoot,
      'packages',
      'cli',
      'index.ts',
    );
    if (existsSync(tsxCli) && existsSync(sourceCli)) {
      return {
        command: process.env['npm_node_execpath'] || 'node',
        prefixArgs: [tsxCli, sourceCli],
        ready: true,
        message: '使用 TypeScript 开发 Runtime',
      };
    }

    return {
      command: '',
      prefixArgs: [],
      ready: false,
      message:
        'Agent Runtime 尚未构建，请先在项目根目录运行 npm install && npm run build。',
    };
  }

  assertCanStart(): void {
    if (this.active || this.controlledPhase) {
      throw new Error('已有 Agent 任务正在启动或运行，请先停止。');
    }
    const settings = this.options.store.getRuntimeSettings();
    if (!settings.main.apiKey)
      throw new Error('请先在模型设置中填写或重新保存主 Agent API Key。');
    if (!settings.main.baseUrl || !settings.main.model)
      throw new Error('主 Agent 的 Base URL 和模型名称不能为空。');
    if (settings.permissionMode !== 'yolo')
      throw new Error('完整游戏工作流需要“完整自动化”执行权限。');
    const runtime = this.inspectRuntime();
    if (!runtime.ready) throw new Error(runtime.message);
  }

  isProjectBusy(projectId: string): boolean {
    return (
      this.active?.projectId === projectId ||
      this.controlledPhase?.projectId === projectId
    );
  }

  async start(input: StartAgentInput): Promise<{ accepted: boolean }> {
    this.assertCanStart();
    const startPhase = createControlledPhase(input.projectId, 'preparing');
    this.controlledPhase = startPhase;

    let runningProject: ProjectRecord | undefined;
    let costMonitor: ApiCostGateway | undefined;
    try {
      const project = this.options.store.getProject(input.projectId);
      if (!project) throw new Error('项目不存在。');
      const projectIdentity = { id: project.id, path: project.path };

      const prompt = input.prompt.trim();
      if (!prompt) throw new Error('提示词不能为空。');
      if (input.resume && !project.sessionId) {
        throw new Error('当前项目没有可恢复的会话，请创建新会话。');
      }

      const productPolicy = deriveRuntimeProductPolicy(project);
      const settings = this.options.store.getRuntimeSettings();
      if (!settings.main.apiKey) {
        throw new Error('请先在模型设置中填写或重新保存主 Agent API Key。');
      }
      if (!settings.main.baseUrl || !settings.main.model) {
        throw new Error('主 Agent 的 Base URL 和模型名称不能为空。');
      }
      if (settings.permissionMode !== 'yolo') {
        throw new Error('完整游戏工作流需要“完整自动化”执行权限。');
      }

      const runtime = this.inspectRuntime();
      if (!runtime.ready) throw new Error(runtime.message);

      runningProject = {
        ...project,
        prompt,
        ...(project.initialGeneration &&
        project.initialGeneration !== 'completed'
          ? { initialGeneration: 'active' as const }
          : {}),
        status: 'running',
        stage: input.resume ? project.stage : 'scaffold',
        updatedAt: new Date().toISOString(),
      };
      await this.updateProject(runningProject);
      this.emit(
        runningProject,
        'lifecycle',
        '正在准备固定横版项目',
        'liimit.ai 正在复制受控 Phaser 模板并核对锁定依赖；普通用户不需要打开终端。',
      );
      const preparation = await this.options.projects.prepareFixedProject(
        runningProject,
        startPhase.controller.signal,
      );
      assertSameProjectIdentity(projectIdentity, runningProject);
      if (startPhase.controller.signal.aborted) {
        throw new Error('固定横版项目环境准备已停止。');
      }
      this.emit(
        runningProject,
        'lifecycle',
        '固定横版项目已准备',
        preparation.dependencies === 'installed'
          ? `已补齐 ${preparation.scaffoldedFiles} 个模板文件，并按锁文件完成首次依赖准备。`
          : '模板和锁定依赖已经就绪，本次无需重复安装。',
      );
      await this.options.projects.prepareSystemPrompt(
        projectIdentity.path,
        runningProject,
      );
      if (startPhase.controller.signal.aborted) {
        throw new Error('固定横版项目启动已停止。');
      }

      const args = buildRuntimeArguments({
        prefixArgs: runtime.prefixArgs,
        productPolicy,
        model: settings.main.model,
        resumeSessionId: input.resume ? project.sessionId : undefined,
      });

      if (!input.resume) {
        runningProject = {
          ...runningProject,
          stage: 'brief',
          updatedAt: new Date().toISOString(),
        };
        await this.updateProject(runningProject);
      }

      const env = this.buildEnvironment(runtime.extraEnv);
      env.GAME_STARTER_TEMPLATE_ID = project.starterTemplateId ?? '';
      const initialContent = await (
        this.options.snapshotProject ?? projectContentSnapshot
      )(projectIdentity.path);
      const credentials = buildCredentialPayload(
        settings,
        productPolicy.mcpServers,
      );
      costMonitor = await this.options.createCostMonitor?.(
        project.id,
        credentials,
        (reason) => {
          const active = this.active;
          if (active?.projectId === project.id)
            this.stopForVerification(
              this.options.store.getProject(project.id) ?? runningProject!,
              active,
              reason,
            );
        },
        (message) =>
          this.emit(
            this.options.store.getProject(project.id) ?? runningProject!,
            'lifecycle',
            '费用提醒',
            message,
          ),
      );
      if (startPhase.controller.signal.aborted) throw new Error('启动已停止。');
      if (costMonitor) {
        credentials.main.baseUrl = costMonitor.baseUrl('main');
        for (const [slot, endpoint] of Object.entries(credentials.providers)) {
          if (endpoint)
            endpoint.baseUrl = costMonitor.baseUrl(slot as CostSlot);
        }
      }
      const child = (this.options.spawnRuntime ?? spawn)(
        runtime.command,
        args,
        {
          cwd: projectIdentity.path,
          env,
          stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          windowsHide: true,
        },
      );
      const providerLabel = settings.main.baseUrl
        .toLowerCase()
        .includes('api.deepseek.com')
        ? 'DeepSeek'
        : '模型';
      const liveness = new RunLivenessHarness(
        runLivenessPolicyFromEnv(process.env),
      );
      this.active = {
        costMonitor,
        verificationGuard: new AgentVerificationGuard(),
        initialContent,
        projectId: project.id,
        child,
        stoppedByUser: false,
        timedOut: false,
        liveness,
        monitor: null,
        providerLabel,
        provider: settings.main.provider,
        model: settings.main.model,
        pendingTools: new PendingToolTracker(),
      };
      this.releaseControlledPhase(startPhase);
      this.active.monitor = setInterval(
        () => this.monitorActiveRun(project.id, child),
        15_000,
      );
      this.active.monitor.unref();
      this.activeSecrets = collectSecrets(settings, productPolicy.mcpServers);
      this.activeSecrets.push(...(costMonitor?.redactions() ?? []));

      let parseChain: Promise<void> = Promise.resolve();
      const queue = (task: () => Promise<void>) => {
        parseChain = parseChain.then(task).catch((error: unknown) => {
          const latest =
            this.options.store.getProject(project.id) ?? runningProject!;
          this.emit(
            latest,
            'error',
            '事件处理失败',
            error instanceof Error ? error.message : String(error),
            undefined,
            true,
          );
        });
      };

      const stdout = createInterface({
        input: child.stdout!,
        crlfDelay: Infinity,
      });
      stdout.on('line', (line) => {
        queue(() => this.handleStdoutLine(runningProject!, line));
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        const message = String(chunk).trim();
        if (!message) return;
        const currentTool =
          this.active?.child === child
            ? this.active.pendingTools.current()
            : undefined;
        // Provider polling logs are not proof that an asset request is making
        // progress. Asset runs use structured output and real file changes.
        if (
          this.active?.child === child &&
          !isGenerateAssetsTool(currentTool?.name)
        ) {
          this.active.liveness.touch();
        }
        this.emit(
          this.options.store.getProject(project.id) ?? runningProject!,
          'stderr',
          'Runtime 日志',
          truncate(message, MAX_STDERR_TEXT),
        );
      });

      child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPIPE') return;
        this.emit(
          this.options.store.getProject(project.id) ?? runningProject!,
          'stderr',
          '输入流异常',
          error.message,
        );
      });

      const credentialPipe = child.stdio[3] as NodeJS.WritableStream | null;
      credentialPipe?.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EPIPE') return;
        this.emit(
          this.options.store.getProject(project.id) ?? runningProject!,
          'stderr',
          '凭据通道异常',
          error.message,
        );
      });

      child.once('error', (error) => {
        queue(async () => {
          const latest =
            this.options.store.getProject(project.id) ?? runningProject!;
          this.emit(
            latest,
            'error',
            '启动失败',
            error.message,
            undefined,
            true,
          );
          await this.finishProject(latest, 'failed');
        });
      });

      child.once('close', (code) => {
        void (async () => {
          stdout.close();
          await parseChain;
          const active = this.active?.child === child ? this.active : null;
          if (active?.monitor) clearInterval(active.monitor);
          try {
            await costMonitor?.close(
              active?.guardStopped ||
                (active?.stoppedByUser
                  ? '用户停止任务。'
                  : active?.timedOut
                    ? '任务超时。'
                    : code !== 0
                      ? '任务异常退出。'
                      : ''),
            );
          } catch {
            if (active) {
              active.guardStopped =
                '费用记录保存失败，任务已停止；请先核对服务商账单。';
              active.reportedCompletion = undefined;
            }
          }
          if (active) this.active = null;
          const latest =
            this.options.store.getProject(project.id) ?? runningProject!;
          await this.finalizeClosedRun(latest, active, code);
          this.activeSecrets = [];
        })().catch((error: unknown) => {
          console.error('[GameAgent] Failed to finalize Agent process:', error);
        });
      });

      if (!credentialPipe) {
        await terminateProcessTree(child, true).catch((error: unknown) => {
          console.error(
            '[liimit.ai] Failed to stop rejected Agent process:',
            error,
          );
        });
        throw new Error('无法创建 Agent 凭据通道。');
      }
      credentialPipe.end(JSON.stringify(credentials));
      child.stdin?.end(
        initialCreationPrompt(project, prompt) +
          verificationWorkflowInstructions(projectIdentity.path),
      );
      this.emit(runningProject, 'user', '用户指令', prompt);
      this.emit(
        runningProject,
        'lifecycle',
        `${providerLabel} Harness 已启动`,
        '正在理解你的游戏创意；长请求会报告等待状态，无输出超时会自动停止并允许恢复。',
      );
      return { accepted: true };
    } catch (error) {
      await costMonitor?.close('任务启动未完成。').catch(() => undefined);
      if (startPhase.stoppedByUser) {
        if (runningProject && !this.active) {
          this.emit(
            runningProject,
            'lifecycle',
            '任务已停止',
            '项目环境准备已由用户停止。',
          );
          await this.finishProject(runningProject, 'stopped');
        }
        return { accepted: false };
      }
      if (runningProject && !this.active) {
        this.emit(
          runningProject,
          'error',
          '启动失败',
          error instanceof Error ? error.message : String(error),
          undefined,
          true,
        );
        await this.finishProject(runningProject, 'failed');
      }
      throw error;
    } finally {
      this.releaseControlledPhase(startPhase);
    }
  }

  async stop(projectId: string): Promise<void> {
    const controlled = this.controlledPhase;
    if (controlled?.projectId === projectId) {
      controlled.stoppedByUser = true;
      controlled.controller.abort();
      await controlled.completion;
      return;
    }
    if (this.active?.projectId === projectId) {
      this.active.stoppedByUser = true;
      const child = this.active.child;
      try {
        await this.active.costMonitor?.close('用户停止任务。');
      } finally {
        await terminateProcessTreeWithEscalation(child);
      }
    }
  }

  async shutdown(): Promise<void> {
    const projectId = this.controlledPhase?.projectId ?? this.active?.projectId;
    if (projectId) await this.stop(projectId);
  }

  private releaseControlledPhase(phase: ControlledPhaseState): void {
    if (this.controlledPhase === phase) this.controlledPhase = null;
    phase.settle();
  }

  private monitorActiveRun(projectId: string, child: ChildProcess): void {
    const active = this.active;
    if (!active || active.projectId !== projectId || active.child !== child)
      return;
    const latest = this.options.store.getProject(projectId);
    if (!latest || active.guardStopped || active.stoppedByUser) return;
    this.syncAssetProgress(latest);
    const currentTool = active.pendingTools.current();
    const generatingAssets = isGenerateAssetsTool(currentTool?.name);
    const verificationStop = active.verificationGuard.inspect(
      Date.now(),
      active.pendingTools.hasAssetGeneration(),
    );
    if (verificationStop) {
      this.stopForVerification(latest, active, verificationStop);
      return;
    }

    if (generatingAssets && active.assetProgress) {
      const progress = inspectAssetProgress(
        latest.path,
        active.assetProgress.outputDirName,
      );
      const previous = active.assetProgress.snapshot;
      if (progress.available) active.assetProgress.snapshot = progress;
      if (
        progress.available &&
        (progress.fileCount > previous.fileCount ||
          progress.latestMtimeMs > previous.latestMtimeMs)
      ) {
        active.liveness.touch();
        this.emit(
          latest,
          'lifecycle',
          '素材生成进行中',
          `检测到新的素材文件，当前目录共 ${progress.fileCount} 个文件；liimit.ai 将自动复用已有文件并继续补齐缺失项。`,
          currentTool?.name,
        );
      }
    }

    const state = active.liveness.inspect(
      Date.now(),
      generatingAssets ? this.assetIdleTimeoutMs : undefined,
    );

    if (state.kind === 'notice') {
      this.emit(
        latest,
        'lifecycle',
        generatingAssets
          ? '素材工具仍在处理'
          : `${active.providerLabel} 仍在处理`,
        generatingAssets
          ? `已连续 ${formatDuration(state.idleMs)} 没有检测到新的素材文件或工具输出；liimit.ai 正在监控，素材阶段最长空闲 ${formatDuration(this.assetIdleTimeoutMs)}。`
          : `已连续 ${formatDuration(state.idleMs)} 没有收到新输出；Harness 正在监控，达到硬超时会自动结束本轮。`,
      );
      return;
    }

    if (state.kind !== 'timeout' || active.timedOut) return;
    active.timedOut = true;
    if (active.monitor) {
      clearInterval(active.monitor);
      active.monitor = null;
    }
    this.emit(
      latest,
      'error',
      generatingAssets
        ? '素材工具无进度超时'
        : `${active.providerLabel} Harness 无输出超时`,
      generatingAssets
        ? `连续 ${formatDuration(state.idleMs)} 没有检测到新的素材文件或工具输出。本轮已停止；已有素材和会话 ID 均已保留，继续时只会补齐缺失项。`
        : `连续 ${formatDuration(state.idleMs)} 没有收到模型或工具输出。本轮已停止，项目文件和会话 ID 均已保留，可直接继续执行。`,
      undefined,
      true,
    );
    void terminateProcessTreeWithEscalation(child).catch((error: unknown) => {
      console.error(
        '[liimit.ai] Failed to stop timed-out Agent process:',
        error,
      );
    });
  }

  private async handleStdoutLine(
    project: ProjectRecord,
    line: string,
  ): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: RuntimeOutputMessage;
    try {
      message = JSON.parse(trimmed) as RuntimeOutputMessage;
    } catch {
      this.emit(
        project,
        'lifecycle',
        'Runtime 输出',
        truncate(trimmed, MAX_EVENT_TEXT),
      );
      return;
    }

    if (this.active?.projectId === project.id) {
      this.active.liveness.touch();
    }

    const latest = this.options.store.getProject(project.id) ?? project;
    if (this.active?.projectId === project.id && this.active.guardStopped)
      return;
    if (
      typeof message.session_id === 'string' &&
      message.session_id !== latest.sessionId
    ) {
      await this.updateProject({
        ...latest,
        sessionId: message.session_id,
        updatedAt: new Date().toISOString(),
      });
    }

    if (message.type === 'stream_event') {
      const delta = message.event?.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        this.emit(
          latest,
          'text_delta',
          'Agent',
          truncate(String(delta.text), 2000),
        );
      } else if (delta?.type === 'thinking_delta' && delta.thinking) {
        this.emit(
          latest,
          'thought',
          '思考中',
          truncate(String(delta.thinking), 2000),
        );
      }
      return;
    }

    if (message.type === 'assistant') {
      for (const block of message.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) {
          this.emit(
            latest,
            'assistant',
            'Agent 回复',
            truncate(block.text, MAX_EVENT_TEXT),
          );
        } else if (block.type === 'thinking' && block.thinking?.trim()) {
          this.emit(
            latest,
            'thought',
            'Agent 思考',
            truncate(block.thinking, MAX_EVENT_TEXT),
          );
        } else if (block.type === 'tool_use') {
          await this.handleToolCall(latest, block);
        }
      }
      return;
    }

    if (message.type === 'user' && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type !== 'tool_result') continue;
        let completedTool: PendingToolCall | undefined;
        if (this.active?.projectId === latest.id) {
          completedTool = this.active.pendingTools.complete(block.tool_use_id);
          this.syncAssetProgress(latest);
        }
        const text = summarizeToolResult(block.content);
        const active =
          this.active?.projectId === latest.id ? this.active : undefined;
        const observed = active?.verificationGuard.observe({
          id: block.tool_use_id,
          tool: completedTool?.name,
          input: completedTool?.input,
          text: toolResultDetectionText(block.content),
          isError: block.is_error,
        });
        const failed = observed?.failed || Boolean(block.is_error);
        this.emit(
          latest,
          'tool_result',
          failed ? '工具执行失败' : '工具执行完成',
          observed?.failed
            ? `${observed.explanation}\n同类失败 ${observed.count}/3 次。\n\n${text}`
            : text,
          completedTool?.name,
          failed,
        );
        if (observed?.stop && active) {
          this.stopForVerification(
            latest,
            active,
            `${observed.explanation}\n同类工具错误已累计 3 次，已停止本轮以避免继续消耗 API。文件和会话已保留，但本轮尚未完成验证；请先检查失败原因，再决定是否继续。`,
          );
          return;
        }
      }
      return;
    }

    if (message.type === 'result') {
      const active =
        this.active?.projectId === latest.id ? this.active : undefined;
      if (active && this.options.recordApiUsage) {
        const usage = usageFromRuntimeResult(message, {
          provider: active.provider,
          model: active.model,
          slot: 'main',
          projectId: latest.id,
        });
        if (usage) {
          try {
            await this.options.recordApiUsage(usage);
          } catch (error) {
            console.error('[liimit.ai] Failed to persist API usage:', error);
          }
        }
      }
      if (this.active?.projectId === latest.id) {
        this.active.pendingTools.clear();
        this.active.assetProgress = undefined;
      }
      if (isRuntimeFailure(message)) {
        const errorText =
          message.error?.message || message.result || 'Agent 执行失败';
        this.emit(
          latest,
          'error',
          '生成失败',
          truncate(String(errorText), MAX_EVENT_TEXT),
          undefined,
          true,
        );
        await this.finishProject(latest, 'failed');
      } else {
        const verificationProject = await this.enterVerificationStage(latest);
        const summary =
          message.result || `完成 ${message.num_turns ?? 0} 轮 Agent 执行`;
        if (!active || this.active !== active) {
          this.emit(
            verificationProject,
            'error',
            'Runtime 生命周期已结束',
            '已收到 Agent 成功结果，但无法确认当前 Runtime 进程状态。请点击“继续执行”重试。',
            undefined,
            true,
          );
          await this.finishProject(verificationProject, 'waiting');
          return;
        }
        active.reportedCompletion = { summary: String(summary) };
        this.emit(
          verificationProject,
          'lifecycle',
          'Agent 本轮回复已结束',
          '正在等待 Runtime 正常退出；退出后 liimit.ai 会重新执行受控构建并校验当前 Web 入口。',
        );
      }
    }
  }

  private async handleToolCall(
    project: ProjectRecord,
    block: RuntimeContentBlock,
  ): Promise<void> {
    const toolName = String(block.name ?? 'unknown');
    if (this.active?.projectId === project.id) {
      const tracked = this.active.pendingTools.add(
        toolName,
        block.id,
        isGenerateAssetsTool(toolName)
          ? assetOutputDirFromInput(block.input)
          : undefined,
      );
      tracked.input = block.input;
      this.syncAssetProgress(project);
    }
    const matched = TOOL_STAGE.find(([pattern]) => pattern.test(toolName));
    const stage = matched?.[1] ?? project.stage;
    const title = matched?.[2] ?? '调用工具';
    const updated: ProjectRecord = {
      ...project,
      stage,
      updatedAt: new Date().toISOString(),
    };
    await this.updateProject(updated);
    this.emit(
      updated,
      'tool_call',
      title,
      compactToolInput(block.input),
      toolName,
    );
  }

  private syncAssetProgress(project: ProjectRecord): void {
    const active = this.active;
    if (!active || active.projectId !== project.id) return;
    const currentTool = active.pendingTools.current();
    if (!currentTool || !isGenerateAssetsTool(currentTool.name)) {
      active.assetProgress = undefined;
      return;
    }

    const outputDirName =
      currentTool.outputDirName || path.join('public', 'assets');
    if (
      active.assetProgress?.toolId === currentTool.id &&
      active.assetProgress.outputDirName === outputDirName
    ) {
      return;
    }
    active.assetProgress = {
      toolId: currentTool.id,
      outputDirName,
      snapshot: inspectAssetProgress(project.path, outputDirName),
    };
  }

  private stopForVerification(
    project: ProjectRecord,
    active: ActiveRunState,
    reason: string,
  ): void {
    if (active.guardStopped || active.stoppedByUser || active.timedOut) return;
    active.guardStopped = reason;
    void active.costMonitor?.close(reason).catch(() => undefined);
    active.reportedCompletion = undefined;
    if (active.monitor) clearInterval(active.monitor);
    active.monitor = null;
    this.emit(
      project,
      'error',
      '检查遇到问题，已自动停止',
      reason,
      undefined,
      true,
    );
    void (this.options.terminateRuntime ?? terminateProcessTreeWithEscalation)(
      active.child,
    ).catch(() => {
      this.emit(
        project,
        'error',
        '停止进程未完成',
        '请点击停止任务或关闭应用；当前内容未标记为完成。',
        undefined,
        true,
      );
    });
  }

  private buildEnvironment(
    extraEnv?: Record<string, string>,
  ): NodeJS.ProcessEnv {
    const { templatesDir, docsDir } = this.options.projects.locationsInfo;
    const env: NodeJS.ProcessEnv = {
      ...getSanitizedRuntimeEnvironment(),
      ...extraEnv,
      NO_COLOR: '1',
      NO_BROWSER: '1',
      QWEN_SYSTEM_MD: '1',
      QWEN_CODE_NO_RELAUNCH: 'true',
      GAMEAGENT_CREDENTIAL_FD: '3',
      NODE_OPTIONS: withHeapLimit(process.env['NODE_OPTIONS']),
      GAME_TEMPLATES_DIR: templatesDir,
      GAME_DOCS_DIR: docsDir,
      // Keep one provider attempt shorter than the outer liveness watchdog so
      // the runtime can surface a recoverable API error instead of appearing
      // frozen for the SDK default timeout/retry window.
      MODEL_REQUEST_TIMEOUT: '180000',
      MODEL_MAX_RETRIES: '1',
    };

    // Product mode is process-scoped. Replace any inherited value with the
    // only product archetype accepted by the desktop runtime.
    delete env['LIIMIT_FIXED_GAME_ARCHETYPE'];
    env['LIIMIT_FIXED_GAME_ARCHETYPE'] = FIXED_PRODUCT_MODE.archetype;

    return env;
  }

  private async finalizeClosedRun(
    latest: ProjectRecord,
    active: ActiveRunState | null,
    code: number | null,
  ): Promise<void> {
    if (active?.stoppedByUser) {
      this.emit(latest, 'lifecycle', '任务已停止', 'Agent 已由用户停止。');
      await this.finishProject(latest, 'stopped');
      return;
    }
    if (active?.timedOut) {
      await this.finishProject(latest, 'failed');
      return;
    }
    if (active?.guardStopped) {
      await this.finishProject(latest, 'waiting');
      return;
    }
    if (code !== 0) {
      if (latest.status !== 'failed') {
        this.emit(
          latest,
          'error',
          'Runtime 异常退出',
          `Agent 进程退出码：${code ?? 'unknown'}`,
          undefined,
          true,
        );
        await this.finishProject(latest, 'failed');
      }
      return;
    }
    if (latest.status !== 'running') return;

    const finalization = createControlledPhase(latest.id, 'finalizing');
    const projectIdentity = { id: latest.id, path: latest.path };
    this.controlledPhase = finalization;
    let verificationProject = latest;
    try {
      verificationProject = await this.enterVerificationStage(latest);
      if (finalization.controller.signal.aborted) {
        throw new Error('任务收尾已停止。');
      }
      if (!active?.reportedCompletion) {
        this.emit(
          verificationProject,
          'error',
          'Runtime 未确认完成',
          'Agent 进程已正常退出，但未收到成功结果。请点击“继续执行”，让 Agent 继续生成并报告结果。',
          undefined,
          true,
        );
        await this.finishProject(verificationProject, 'waiting');
        return;
      }
      this.emit(
        verificationProject,
        'lifecycle',
        '正在执行受控最终构建',
        'liimit.ai 正在用固定模板的锁定依赖重新构建当前源码，防止把上一次的旧 dist 误当成本次结果。',
      );
      const finalContent = await (
        this.options.snapshotProject ?? projectContentSnapshot
      )(verificationProject.path);
      if (
        !active.initialContent ||
        !finalContent ||
        active.initialContent === finalContent
      ) {
        const unchanged = Boolean(active.initialContent && finalContent);
        this.emit(
          verificationProject,
          'lifecycle',
          unchanged ? '本轮未产生游戏修改' : '未能核验游戏修改',
          `${unchanged ? '游戏文件内容未变化；本轮回复不代表生成或修改完成。' : '无法核验本轮文件变化，未标记为完成。'}\n\n${active.reportedCompletion.summary}`,
        );
        await this.finishProject(verificationProject, 'waiting');
        return;
      }
      if (
        verificationProject.starterTemplateId === 'ai-foundation' &&
        verificationProject.initialGeneration !== 'completed'
      ) {
        const [baseline, campaign, info] = await Promise.all([
          readFoundationJson(
            this.options.projects.locationsInfo.templatesDir,
            'variants/ai-foundation/src/levels.json',
          ),
          readFoundationJson(verificationProject.path, 'src/levels.json'),
          readFoundationJson(verificationProject.path, 'src/gameInfo.json'),
        ]);
        if (!foundationGameIsReady(baseline, campaign, info)) {
          this.emit(
            verificationProject,
            'lifecycle',
            '游戏内容尚未生成',
            '当前仍是基础工作区，或者只修改了名称、测试等辅助内容，不能算游戏创建完成。请继续按要求制作关卡和玩法。',
          );
          await this.finishProject(verificationProject, 'waiting');
          return;
        }
      }
      await this.options.projects.buildFixedProject(
        verificationProject,
        finalization.controller.signal,
      );
      assertSameProjectIdentity(projectIdentity, verificationProject);
      if (finalization.controller.signal.aborted) {
        throw new Error('固定横版项目最终构建已停止。');
      }
      this.emit(
        verificationProject,
        'lifecycle',
        '最终构建已通过',
        '正在通过平台正式试玩服务核验页面、脚本、关卡和游戏信息；这些检查不等于已经实际玩通。',
      );
      await this.options.projects.verifyPlayableBuild(
        verificationProject,
        finalization.controller.signal,
      );
      if (finalization.controller.signal.aborted) {
        throw new Error('固定横版项目 Web 入口校验已停止。');
      }
      this.emit(
        verificationProject,
        'complete',
        '游戏文件已更新并通过运行检查',
        `当前源码的受控构建、Web 入口与关卡数据读取已通过；游戏是否能顺利玩通，仍需实际试玩确认。\n\n${active.reportedCompletion.summary}`,
      );
      await this.finishProject(verificationProject, 'completed');
    } catch (error) {
      if (finalization.stoppedByUser) {
        this.emit(
          verificationProject,
          'lifecycle',
          '任务已停止',
          '受控最终构建已由用户停止。',
        );
        await this.finishProject(verificationProject, 'stopped');
      } else {
        this.emit(
          verificationProject,
          'error',
          '尚未达到可试玩完成门槛',
          describePlayableBuildFailure(error),
          undefined,
          true,
        );
        await this.finishProject(verificationProject, 'waiting');
      }
    } finally {
      this.releaseControlledPhase(finalization);
    }
  }

  private async enterVerificationStage(
    project: ProjectRecord,
  ): Promise<ProjectRecord> {
    if (project.stage === 'verify') return project;
    const verificationProject: ProjectRecord = {
      ...project,
      stage: 'verify',
      updatedAt: new Date().toISOString(),
    };
    await this.updateProject(verificationProject);
    return verificationProject;
  }

  private emit(
    project: ProjectRecord,
    type: AgentEvent['type'],
    title: string,
    message: string,
    toolName?: string,
    isError = false,
  ): void {
    const safeMessage = redactSensitiveText(message, this.activeSecrets);
    this.options.emitEvent({
      id: randomUUID(),
      projectId: project.id,
      type,
      stage: project.stage,
      title,
      message: truncate(safeMessage, MAX_EVENT_TEXT),
      toolName,
      isError,
      timestamp: new Date().toISOString(),
    });
  }

  private async finishProject(
    project: ProjectRecord,
    status: ProjectRecord['status'],
  ): Promise<void> {
    const latest = this.options.store.getProject(project.id) ?? project;
    const finished: ProjectRecord = {
      ...latest,
      status,
      ...(latest.initialGeneration && latest.initialGeneration !== 'completed'
        ? {
            initialGeneration:
              status === 'completed'
                ? ('completed' as const)
                : ('incomplete' as const),
          }
        : {}),
      stage: status === 'completed' ? 'complete' : latest.stage,
      updatedAt: new Date().toISOString(),
    };
    await this.updateProject(finished);
  }

  private async updateProject(project: ProjectRecord): Promise<void> {
    await this.options.store.upsertProject(project);
    this.options.emitProject(project);
  }
}

export function initialCreationPrompt(
  project: ProjectRecord,
  prompt: string,
): string {
  if (
    project.creationMode !== 'ai' ||
    project.sessionId ||
    !project.initialGeneration ||
    project.initialGeneration === 'completed'
  )
    return prompt;
  if (project.starterTemplateId === 'ai-foundation') {
    return `【liimit.ai 首次自主创建】\n用户已授权按下列要求创建新游戏。现有内容只是中性校准工作区，不是示例游戏也不是交付成果。请先读 src/AI_CREATION.md，按要求设计并写入全新的关卡布局、规则和画面。不要复制固定示例，不要先修测试框架；遇到不能实现的要求明确说明并等待确认。完成后列出实际完成项和未完成项。\n\n用户要求：\n${prompt}`;
  }
  return `【liimit.ai 首次创建任务】\n用户已选择“AI 生成”并提交以下要求，授权在这个新建项目内完成游戏。目录内现有模板是系统自动准备的起点，不是已经交付的用户游戏。请按要求实际调整关卡、规则与所需内容并保存、验证，不要只返回模板或停在修改方案。此授权仅适用于本次首次创建要求；不覆盖用户随后手工修改的内容，不扩大范围。若缺少能力、服务或有关键歧义，请明确说明并等待用户决定，不得声称未做的内容已完成。完成后说明实际完成内容和未完成项。\n\n用户要求：\n${prompt}`;
}

export function isRuntimeFailure(
  message: Pick<RuntimeOutputMessage, 'is_error' | 'error' | 'result'>,
): boolean {
  if (message.is_error || message.error?.message) return true;
  return /^\s*\[(?:API|Auth(?:entication)?|Network|Model|Provider) Error\b/i.test(
    message.result ?? '',
  );
}

function describePlayableBuildFailure(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  if (/最终构建|依赖不完整|依赖清单|构建失败/.test(reason)) {
    return `Agent 已结束，但 liimit.ai 重新构建当前源码时未通过：${reason}\n\n请点击“继续执行”，让 Agent 根据构建错误修改源码，直到受控构建通过。`;
  }
  if (
    /(?:dist[\\/]index\.html|构建目录 dist)[^\n]*不存在|请先完成构建/.test(
      reason,
    )
  ) {
    return `Agent 已结束，但受控构建后的游戏产物未就绪：${reason}\n\n请点击“继续执行”，让 Agent 修复源码或构建配置，直到生成可安全读取的 dist/index.html。`;
  }
  if (
    /符号链接|路径超出|不是有效的 HTML|无法安全读取|预览目标不是文件/.test(
      reason,
    )
  ) {
    return `Agent 已结束，但本地 Web 试玩产物不安全或无效：${reason}\n\n请点击“继续执行”，让 Agent 重新生成安全的 dist/index.html 后再试。`;
  }
  return `Agent 已结束，但本地预览服务未能完成可试玩校验：${reason}\n\n请稍后点击“继续执行”重试；若持续失败，请重启 liimit.ai 后再试。`;
}

interface RuntimeProviderCredential {
  provider: AppSettings['main']['provider'];
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DesktopCredentialPayload {
  main: RuntimeProviderCredential;
  providers: {
    reasoning?: RuntimeProviderCredential;
    image?: RuntimeProviderCredential;
    video?: RuntimeProviderCredential;
    audio?: RuntimeProviderCredential;
  };
  mcpServers: Record<string, RuntimeMcpServerConfig>;
}

export function buildCredentialPayload(
  settings: AppSettings,
  mcpServers: McpServerDefinition[] = [],
): DesktopCredentialPayload {
  const toProvider = (
    endpoint: AppSettings['main'],
    fallback?: AppSettings['main'],
  ) => {
    const compatibleFallback =
      fallback?.provider === endpoint.provider ? fallback : undefined;
    const apiKey = endpoint.apiKey || compatibleFallback?.apiKey;
    if (!apiKey) return undefined;
    return {
      provider: endpoint.provider,
      apiKey,
      baseUrl: endpoint.baseUrl || compatibleFallback?.baseUrl || '',
      model: endpoint.model || compatibleFallback?.model || '',
    };
  };

  const reasoning = toProvider(settings.reasoning, settings.main);
  const audioFallback = settings.reasoning.apiKey
    ? settings.reasoning
    : settings.main;
  return {
    main: {
      provider: settings.main.provider,
      apiKey: settings.main.apiKey,
      baseUrl: settings.main.baseUrl,
      model: settings.main.model,
    },
    providers: {
      reasoning,
      image: toProvider(settings.image),
      video: toProvider(settings.video, settings.image),
      audio: toProvider(settings.audio, audioFallback),
    },
    mcpServers: toRuntimeMcpServers(mcpServers),
  };
}

function compactToolInput(input: unknown): string {
  if (!input || typeof input !== 'object')
    return input ? String(input) : '无参数';
  const compact = JSON.stringify(
    input,
    (key, value) => {
      if (/api.?key|token|secret|authorization/i.test(key)) return '[已隐藏]';
      if (key === 'content' && typeof value === 'string')
        return `[文件内容：${value.length} 字符]`;
      if (typeof value === 'string' && value.length > 800)
        return `${value.slice(0, 800)}…`;
      return value;
    },
    2,
  );
  return truncate(compact, 3000);
}

function toolResultDetectionText(content: unknown): string {
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((item) =>
              item && typeof item === 'object' && 'text' in item
                ? String(item.text)
                : '',
            )
            .join('\n')
        : JSON.stringify(content ?? '');
  // Keep the tail: exit codes and stack traces often follow long build output.
  return raw.length > 100_000
    ? raw.slice(0, 50_000) + '\n' + raw.slice(-50_000)
    : raw;
}

function summarizeToolResult(content: unknown): string {
  if (typeof content === 'string') return truncate(content, 5000);
  if (Array.isArray(content)) {
    return truncate(
      content
        .map((item) =>
          item && typeof item === 'object' && 'text' in item
            ? String((item as { text: unknown }).text)
            : JSON.stringify(item),
        )
        .join('\n'),
      5000,
    );
  }
  return truncate(JSON.stringify(content ?? '工具未返回文本'), 5000);
}

function truncate(value: string, limit: number): string {
  return value.length > limit
    ? `${value.slice(0, limit)}\n…[已截断 ${value.length - limit} 字符]`
    : value;
}

function isGenerateAssetsTool(toolName?: string): boolean {
  return Boolean(
    toolName && /generate[._]?(?:game[._]?)?assets/i.test(toolName),
  );
}

export function assetOutputDirFromInput(input: unknown): string {
  if (input && typeof input === 'object') {
    const candidate = (input as Record<string, unknown>)['output_dir_name'];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return path.join('public', 'assets');
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function withHeapLimit(existing?: string): string {
  if (existing?.includes('--max-old-space-size')) return existing;
  return [existing, '--max-old-space-size=12288'].filter(Boolean).join(' ');
}

function getSanitizedRuntimeEnvironment(): NodeJS.ProcessEnv {
  return sanitizeRuntimeEnvironment(process.env);
}

export function sanitizeRuntimeEnvironment(
  source: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  userHome: string = homedir(),
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  let existingPath: string | undefined;
  const sensitiveName =
    /(^|_)(API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|AUTHORIZATION|CREDENTIALS?)($|_)/i;
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const isPathKey =
      platform === 'win32' ? name.toLowerCase() === 'path' : name === 'PATH';
    if (isPathKey) {
      existingPath ??= value;
      continue;
    }
    if (!sensitiveName.test(name)) result[name] = value;
  }
  result.PATH = withDesktopToolPaths(existingPath, platform, source, userHome);
  return result;
}

export function withDesktopToolPaths(
  existingPath?: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  userHome: string = homedir(),
): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  const preferred =
    platform === 'win32'
      ? windowsToolPaths(environment, userHome)
      : [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          path.posix.join(userHome, '.local', 'bin'),
          path.posix.join(userHome, '.cargo', 'bin'),
          path.posix.join(userHome, '.volta', 'bin'),
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
        ];
  const entries = [...preferred, ...(existingPath?.split(delimiter) ?? [])]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      const key = platform === 'win32' ? entry.toLowerCase() : entry;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(delimiter);
}

function windowsToolPaths(
  environment: NodeJS.ProcessEnv,
  userHome: string,
): string[] {
  const localAppData = environment['LOCALAPPDATA'];
  const roamingAppData = environment['APPDATA'];
  const programFiles =
    environment['ProgramFiles'] ?? environment['PROGRAMFILES'];
  return [
    localAppData &&
      path.win32.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
    roamingAppData && path.win32.join(roamingAppData, 'npm'),
    programFiles && path.win32.join(programFiles, 'nodejs'),
    programFiles && path.win32.join(programFiles, 'WinGet', 'Links'),
    path.win32.join(userHome, '.local', 'bin'),
    path.win32.join(userHome, '.cargo', 'bin'),
    path.win32.join(userHome, '.volta', 'bin'),
  ].filter((entry): entry is string => Boolean(entry));
}

function collectSecrets(
  settings: AppSettings,
  mcpServers: McpServerDefinition[] = [],
): string[] {
  return [
    settings.main.apiKey,
    settings.reasoning.apiKey,
    settings.image.apiKey,
    settings.video.apiKey,
    settings.audio.apiKey,
    ...collectMcpSecrets(mcpServers),
  ].filter((value): value is string => Boolean(value && value.length >= 8));
}

function redactSensitiveText(value: string, secrets: string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join('[已隐藏密钥]');
  }
  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [已隐藏密钥]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[已隐藏密钥]');
}

export interface ProcessTreeTerminationOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  spawnCommand?: (
    executable: string,
    args: readonly string[],
    options: {
      stdio: 'ignore';
      windowsHide: true;
      shell: false;
    },
  ) => {
    once(event: 'error', listener: (error: Error) => void): unknown;
    once(event: 'close', listener: (exitCode: number | null) => void): unknown;
  };
}

export async function terminateProcessTree(
  child: ChildProcess,
  force: boolean,
  options: ProcessTreeTerminationOptions = {},
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    if (!child.pid) {
      if (!child.kill(force ? 'SIGKILL' : 'SIGTERM')) {
        throw new Error('Agent 进程没有可用 PID，且直接终止失败。');
      }
      return;
    }
    const args = ['/pid', String(child.pid), '/t'];
    if (force) args.push('/f');
    const environment = options.environment ?? process.env;
    const systemRoot =
      environmentValueCaseInsensitive(environment, 'SystemRoot') ??
      String.raw`C:\Windows`;
    const taskkill = path.win32.join(systemRoot, 'System32', 'taskkill.exe');
    const spawnCommand =
      options.spawnCommand ??
      ((executable, commandArgs, spawnOptions) =>
        spawn(executable, [...commandArgs], spawnOptions));
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const killer = spawnCommand(taskkill, args, {
          stdio: 'ignore',
          windowsHide: true,
          shell: false,
        });
        killer.once('error', (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
        killer.once('close', (exitCode) => {
          if (settled) return;
          settled = true;
          if (exitCode === 0) resolve();
          else reject(new Error(`taskkill 退出码：${exitCode ?? '未知'}`));
        });
      });
      return;
    } catch (error) {
      child.kill(force ? 'SIGKILL' : 'SIGTERM');
      throw new Error(
        `无法确认 Windows Agent 进程树已终止：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  try {
    if (child.pid) process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
    else if (!child.kill(force ? 'SIGKILL' : 'SIGTERM')) {
      throw new Error('直接终止 Agent 进程失败。');
    }
  } catch {
    if (!child.kill(force ? 'SIGKILL' : 'SIGTERM')) {
      throw new Error('无法终止 Agent 进程。');
    }
  }
}

async function terminateProcessTreeWithEscalation(
  child: ChildProcess,
): Promise<void> {
  await terminateProcessTree(child, false);
  if (await waitForChildExit(child, 5_000)) return;
  await terminateProcessTree(child, true);
  if (await waitForChildExit(child, 1_500)) return;
  throw new Error('Agent 进程树在强制终止后仍未退出。');
}

async function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const onClose = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    child.once('close', onClose);
    if (child.exitCode !== null || child.signalCode !== null) {
      child.off('close', onClose);
      settled = true;
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.off('close', onClose);
      resolve(false);
    }, timeoutMs);
    timer.unref();
  });
}

function environmentValueCaseInsensitive(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(environment)) {
    if (key.toLowerCase() === target && value?.trim()) return value.trim();
  }
  return undefined;
}
