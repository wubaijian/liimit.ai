import type { LevelDocument } from './levelDocument.js';
import type { LevelCampaign, PlayerAbilities } from './levelCampaign.js';
import type { GameInfo } from './gameInfo.js';

export type PipelineStageId =
  | 'brief'
  | 'classify'
  | 'scaffold'
  | 'gdd'
  | 'assets'
  | 'tilemap'
  | 'code'
  | 'verify'
  | 'complete';

export const FIXED_PRODUCT_MODE = {
  id: 'phaser-platformer-web',
  engine: 'Phaser 3',
  dimension: '2D',
  archetype: 'platformer',
  previewTarget: 'embedded-web-browser',
} as const;

export type ProductModeId = typeof FIXED_PRODUCT_MODE.id;

export const STARTER_TEMPLATE_IDS = [
  'ai-foundation',
  'platformer-base',
  'fire-mountain-escape',
  'zero-factory-escape',
] as const;

export type StarterTemplateId = (typeof STARTER_TEMPLATE_IDS)[number];

export function isStarterTemplateId(
  value: unknown,
): value is StarterTemplateId {
  return (
    typeof value === 'string' &&
    (STARTER_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

export function isFixedProductMode(project: {
  productMode?: unknown;
}): project is { productMode: ProductModeId } {
  return project.productMode === FIXED_PRODUCT_MODE.id;
}

export type ProjectStatus =
  | 'draft'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'stopped';

export const STARTER_PREPARATION_SCHEMA_VERSION = 1;
export const STARTER_PREPARATION_MESSAGE_MAX_LENGTH = 1_000;

export type StarterPreparationStatus =
  | 'queued'
  | 'preparing'
  | 'ready'
  | 'failed';

export type StarterPreparationPhase =
  | 'queued'
  | 'scaffold'
  | 'dependencies'
  | 'build'
  | 'level-validation'
  | 'preview-validation'
  | 'complete';

export type StarterPreparationErrorCode =
  | 'interrupted'
  | 'network'
  | 'permission'
  | 'disk-space'
  | 'unsafe-project'
  | 'dependency'
  | 'build'
  | 'level-validation'
  | 'preview-validation'
  | 'persistence'
  | 'unknown';

export interface StarterPreparation {
  schemaVersion: 1;
  status: StarterPreparationStatus;
  phase: StarterPreparationPhase;
  attempt: number;
  revision: number;
  message: string;
  errorCode?: StarterPreparationErrorCode;
  startedAt?: string;
  finishedAt?: string;
}

export type AgentEventType =
  | 'user'
  | 'lifecycle'
  | 'thought'
  | 'assistant'
  | 'text_delta'
  | 'tool_call'
  | 'tool_result'
  | 'stderr'
  | 'error'
  | 'complete';

export interface AgentEvent {
  id: string;
  projectId: string;
  type: AgentEventType;
  stage: PipelineStageId;
  title: string;
  message: string;
  toolName?: string;
  isError?: boolean;
  timestamp: string;
}

export interface AgentHistoryResult {
  projectId: string;
  events: AgentEvent[];
  hasMore: boolean;
  source: 'persisted' | 'recording' | 'empty';
}

export interface ProjectRecord {
  creationMode?: 'template' | 'ai';
  initialGeneration?: 'pending' | 'active' | 'incomplete' | 'completed';
  id: string;
  name: string;
  path: string;
  prompt: string;
  status: ProjectStatus;
  stage: PipelineStageId;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  productMode: ProductModeId;
  starterTemplateId?: StarterTemplateId;
  starterPreparation?: StarterPreparation;
}

export interface StarterPreparationRetryResult {
  accepted: boolean;
  project: ProjectRecord;
}

export type ProviderName =
  | 'openai-compat'
  | 'tongyi'
  | 'doubao'
  | 'elevenlabs'
  | 'minimax'
  | 'stability'
  | 'google-lyria'
  | 'mureka';

export interface ProviderEndpoint {
  provider: ProviderName;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyConfigured?: boolean;
  apiKeyInherited?: boolean;
}

export type ProviderSlot = 'main' | 'reasoning' | 'image' | 'video' | 'audio';

export interface ProviderConnectionInput {
  slot: ProviderSlot;
  endpoint: ProviderEndpoint;
}

export interface ProviderConnectionResult {
  status: 'success' | 'warning' | 'error';
  message: string;
  latencyMs: number;
}

export const GAME_SOUND_SLOTS = [
  'jump',
  'coin',
  'death',
  'levelClear',
  'enemyHit',
  'checkpoint',
] as const;

export type GameSoundSlot = (typeof GAME_SOUND_SLOTS)[number];

export const AUDIO_DESCRIPTION_MAX_LENGTH = 300;

export const AUDIO_DURATION_OPTIONS = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
] as const;

export type AudioDurationSeconds = (typeof AUDIO_DURATION_OPTIONS)[number];

export const AUDIO_RECOMMENDED_DURATION_BY_SOUND: Record<
  GameSoundSlot,
  AudioDurationSeconds
> = {
  jump: 0.5,
  coin: 0.5,
  death: 1,
  levelClear: 2,
  enemyHit: 0.5,
  checkpoint: 1,
};

export interface GenerateAudioPreviewInput {
  sound: GameSoundSlot;
  description: string;
  durationSeconds: AudioDurationSeconds;
}

export type AudioPreviewMimeType = 'audio/mpeg' | 'audio/wav';

export interface AudioPreviewResult {
  provider: 'elevenlabs' | 'liimit-local';
  model: 'eleven_text_to_sound_v2' | 'local-sfx-v1';
  sound: GameSoundSlot;
  durationSeconds: AudioDurationSeconds;
  mimeType: 'audio/mpeg' | 'audio/wav';
  bytes: Uint8Array;
  latencyMs: number;
}

export const AUDIO_PREVIEW_CANDIDATE_NUMBERS = [1, 2, 3] as const;
export const AUDIO_PREVIEW_CANDIDATE_COUNT = 3 as const;

export type AudioPreviewCandidateNumber =
  (typeof AUDIO_PREVIEW_CANDIDATE_NUMBERS)[number];

export interface AudioPreviewCandidate extends AudioPreviewResult {
  candidateNumber: AudioPreviewCandidateNumber;
}

export interface AudioPreviewBatchResult {
  candidates: AudioPreviewCandidate[];
  failedCount: number;
  attemptedCount: typeof AUDIO_PREVIEW_CANDIDATE_COUNT;
  latencyMs: number;
}

export interface AudioPreviewProgress {
  generationId: string;
  status: 'running' | 'complete' | 'cancelled';
  totalCount: typeof AUDIO_PREVIEW_CANDIDATE_COUNT;
  completedCount: number;
  successCount: number;
  failedCount: number;
}

export interface CancelAudioPreviewResult {
  status: 'cancelling' | 'idle';
}

export interface ApplyAudioPreviewInput {
  projectId: string;
  sound: GameSoundSlot;
  mimeType: AudioPreviewMimeType;
  bytes: Uint8Array;
}

export interface ApplyAudioPreviewResult {
  status: 'applied' | 'cancelled';
  sound: GameSoundSlot;
  relativePath?: string;
}

export interface ProjectAudioOverrideSnapshot {
  projectId: string;
  overrides: Record<GameSoundSlot, boolean>;
}

export interface RestoreProjectAudioInput {
  projectId: string;
  sound: GameSoundSlot;
}

export interface RestoreProjectAudioResult {
  status: 'restored' | 'cancelled' | 'unchanged';
  sound: GameSoundSlot;
}

export interface AppSettings {
  main: ProviderEndpoint;
  reasoning: ProviderEndpoint;
  image: ProviderEndpoint;
  video: ProviderEndpoint;
  audio: ProviderEndpoint;
  defaultWorkspace: string;
  permissionMode: 'auto-edit' | 'yolo';
  developerMode: boolean;
}

export type ApiCallSource = 'agent' | 'connection-test' | 'asset';
export type ApiCallStatus = 'success' | 'warning' | 'error';

export interface ApiUsageRecord {
  id: string;
  provider: string;
  model?: string;
  slot?: string;
  projectId?: string;
  source: ApiCallSource;
  status: ApiCallStatus;
  durationMs: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  occurredAt: string;
}

export interface ApiUsageTotals {
  runs: number;
  calls: number;
  successes: number;
  warnings: number;
  failures: number;
  durationMs: number;
  averageDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface ProviderUsageSummary extends ApiUsageTotals {
  provider: string;
  lastCalledAt: string;
}

export interface ApiUsageSnapshot {
  generatedAt: string;
  totals: ApiUsageTotals;
  providers: ProviderUsageSummary[];
  recent: ApiUsageRecord[];
}

export type DesktopDependencyId =
  | 'npx'
  | 'uvx'
  | 'godot'
  | 'blender'
  | 'unity-hub'
  | 'unity-editor';

export type DependencyAction = 'install' | 'update' | 'open';
export type DependencyStatus = 'installed' | 'missing' | 'unsupported';

export interface DependencyInstallation {
  version?: string;
  path: string;
}

export interface DesktopDependency {
  id: DesktopDependencyId;
  name: string;
  description: string;
  status: DependencyStatus;
  path?: string;
  version?: string;
  installations?: DependencyInstallation[];
  availableActions: DependencyAction[];
  management: 'homebrew' | 'winget' | 'unity-hub' | 'manual';
  detail?: string;
}

export interface DependencyActionInput {
  id: string;
  action: string;
}

export interface DependencyOutput {
  stream: 'system' | 'stdout' | 'stderr';
  text: string;
}

export interface DependencyActionResult {
  id: DesktopDependencyId;
  action: DependencyAction;
  success: boolean;
  message: string;
  command: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export type SkillLevel = 'project' | 'user';

export interface SkillSourceInfo {
  kind: 'github';
  repository: string;
  ref: string;
  path: string;
  url: string;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  level: SkillLevel;
  directory: string;
  valid: boolean;
  error?: string;
  source?: SkillSourceInfo;
}

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface SecretField {
  name: string;
  value: string;
  configured?: boolean;
}

export interface McpServerDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  transport: McpTransport;
  command: string;
  args: string[];
  cwd: string;
  url: string;
  timeoutMs: number;
  trust: boolean;
  env: SecretField[];
  headers: SecretField[];
}

export interface ExtensionsSnapshot {
  skills: SkillSummary[];
  skillDirectories: {
    user: string;
    project?: string;
  };
  mcpServers: McpServerDefinition[];
}

export interface ImportSkillInput {
  level: SkillLevel;
  projectId?: string;
}

export interface InstallGitHubSkillInput extends ImportSkillInput {
  url: string;
  path?: string;
  ref?: string;
}

export interface BootstrapState {
  projects: ProjectRecord[];
  settings: AppSettings;
  version: string;
  runtimeReady: boolean;
  runtimeMessage: string;
}

export interface CreateProjectInput {
  creationMode?: 'template' | 'ai';
  name: string;
  directory: string;
  prompt: string;
  starterTemplateId?: StarterTemplateId;
}

export interface StartAgentInput {
  projectId: string;
  prompt: string;
  resume?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  truncated: boolean;
}

export interface RemoveProjectInput {
  projectId: string;
  mode: 'list-only' | 'trash';
}
export interface RemoveProjectResult {
  projectId: string;
  removed: boolean;
}

export interface GameAgentAPI {
  removeProject(input: RemoveProjectInput): Promise<RemoveProjectResult>;
  bootstrap(): Promise<BootstrapState>;
  chooseDirectory(): Promise<string | null>;
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  retryStarterPreparation(
    projectId: string,
  ): Promise<StarterPreparationRetryResult>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  testProviderConnection(
    input: ProviderConnectionInput,
  ): Promise<ProviderConnectionResult>;
  generateAudioPreview(
    input: GenerateAudioPreviewInput,
  ): Promise<AudioPreviewBatchResult>;
  cancelAudioPreviewGeneration(): Promise<CancelAudioPreviewResult>;
  onAudioPreviewProgress(
    callback: (progress: AudioPreviewProgress) => void,
  ): () => void;
  applyAudioPreview(
    input: ApplyAudioPreviewInput,
  ): Promise<ApplyAudioPreviewResult>;
  loadProjectAudioOverrides(
    projectId: string,
  ): Promise<ProjectAudioOverrideSnapshot>;
  restoreProjectAudio(
    input: RestoreProjectAudioInput,
  ): Promise<RestoreProjectAudioResult>;
  loadApiUsage(): Promise<ApiUsageSnapshot>;
  loadApiCosts(
    projectId: string | null,
  ): Promise<import('./apiCost.js').CostSnapshot>;
  saveApiCostSettings(
    settings: import('./apiCost.js').CostSettings,
  ): Promise<void>;
  inspectDependencies(): Promise<DesktopDependency[]>;
  runDependencyAction(
    input: DependencyActionInput,
  ): Promise<DependencyActionResult | null>;
  startAgent(input: StartAgentInput): Promise<{ accepted: boolean }>;
  decideProposal(
    input: import('./modificationProposal.js').ProposalDecisionInput,
  ): Promise<{ accepted: boolean }>;
  stopAgent(projectId: string): Promise<void>;
  loadAgentHistory(projectId: string): Promise<AgentHistoryResult>;
  listFiles(projectId: string): Promise<FileNode[]>;
  readFile(projectId: string, filePath: string): Promise<FileContent>;
  loadLevel(projectId: string): Promise<LevelDocument>;
  saveLevel(projectId: string, level: LevelDocument): Promise<LevelDocument>;
  loadLevelCampaign(projectId: string): Promise<LevelCampaign>;
  saveCampaignLevel(
    projectId: string,
    levelId: string,
    level: LevelDocument,
  ): Promise<LevelDocument>;
  addLevel(projectId: string, sourceLevelId?: string): Promise<LevelCampaign>;
  saveLevelAbilities(
    projectId: string,
    levelId: string,
    abilities: PlayerAbilities,
  ): Promise<PlayerAbilities>;
  loadGameInfo(projectId: string): Promise<GameInfo>;
  saveGameInfo(projectId: string, gameInfo: GameInfo): Promise<GameInfo>;
  startPreview(projectId: string): Promise<string>;
  revealProject(projectId: string): Promise<void>;
  loadExtensions(projectId?: string): Promise<ExtensionsSnapshot>;
  saveMcpServers(
    servers: McpServerDefinition[],
  ): Promise<McpServerDefinition[]>;
  importSkill(input: ImportSkillInput): Promise<SkillSummary | null>;
  installGitHubSkill(input: InstallGitHubSkillInput): Promise<SkillSummary>;
  removeSkill(projectId: string | undefined, skillId: string): Promise<void>;
  revealSkill(projectId: string | undefined, skillId: string): Promise<void>;
  revealSkillDirectory(level: SkillLevel, projectId?: string): Promise<void>;
  openGitHubUrl(url: string): Promise<void>;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onProjectUpdated(callback: (project: ProjectRecord) => void): () => void;
  onDependencyOutput(callback: (output: DependencyOutput) => void): () => void;
}

declare global {
  interface Window {
    gameAgent: GameAgentAPI;
  }
}
