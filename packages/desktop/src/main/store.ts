import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  STARTER_PREPARATION_MESSAGE_MAX_LENGTH,
  STARTER_PREPARATION_SCHEMA_VERSION,
  isFixedProductMode,
  type AppSettings,
  type McpServerDefinition,
  type ProjectRecord,
  type ProviderEndpoint,
  type SecretField,
  type StarterPreparation,
} from '../shared/types.js';

type ProviderSecretKey = 'main' | 'reasoning' | 'image' | 'video' | 'audio';
type SecretKey = ProviderSecretKey | 'mcpServers';

interface PersistedSettings {
  main: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  reasoning: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  image: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  video: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  audio: Omit<
    ProviderEndpoint,
    'apiKey' | 'apiKeyConfigured' | 'apiKeyInherited'
  >;
  defaultWorkspace: string;
  permissionMode: 'auto-edit' | 'yolo';
  developerMode: boolean;
  [key: string]: unknown;
}

type PersistedSecrets = Partial<Record<SecretKey, string>> &
  Record<string, unknown>;

interface PersistedState {
  projects: ProjectRecord[];
  settings: PersistedSettings;
  secrets: PersistedSecrets;
  [key: string]: unknown;
}

interface PersistedProjectRecord
  extends Omit<ProjectRecord, 'productMode'>, Record<string, unknown> {
  productMode?: string;
}

type ParsedProviderEndpoint = Partial<PersistedSettings['main']> &
  Record<string, unknown>;

interface ParsedPersistedSettings extends Record<string, unknown> {
  main?: ParsedProviderEndpoint;
  reasoning?: ParsedProviderEndpoint;
  image?: ParsedProviderEndpoint;
  video?: ParsedProviderEndpoint;
  audio?: ParsedProviderEndpoint;
  defaultWorkspace?: string;
  permissionMode?: PersistedSettings['permissionMode'];
  developerMode?: boolean;
}

interface ParsedPersistedState extends Record<string, unknown> {
  projects?: PersistedProjectRecord[];
  settings?: ParsedPersistedSettings;
  secrets?: PersistedSecrets;
}

const endpoint = (
  provider: ProviderEndpoint['provider'],
  baseUrl: string,
  model: string,
): ProviderEndpoint => ({ provider, baseUrl, model, apiKey: '' });

const LEGACY_PRODUCT_NAME = Buffer.from('Tm9vYmkuYWk=', 'base64').toString(
  'utf8',
);

export function defaultSettings(): AppSettings {
  return {
    main: endpoint(
      'openai-compat',
      'https://api.deepseek.com',
      'deepseek-v4-flash',
    ),
    reasoning: endpoint(
      'openai-compat',
      'https://api.deepseek.com',
      'deepseek-v4-pro',
    ),
    image: endpoint(
      'tongyi',
      'https://dashscope.aliyuncs.com',
      'wan2.5-t2i-preview',
    ),
    video: endpoint(
      'tongyi',
      'https://dashscope.aliyuncs.com',
      'wan2.5-i2v-preview',
    ),
    audio: endpoint(
      'openai-compat',
      'https://api.deepseek.com',
      'deepseek-v4-flash',
    ),
    defaultWorkspace: path.join(app.getPath('documents'), 'liimit.ai Games'),
    permissionMode: 'yolo',
    developerMode: false,
  };
}

export class StateStore {
  private statePath = path.join(app.getPath('userData'), 'state.json');
  private state: PersistedState | null = null;
  private flushChain: Promise<void> = Promise.resolve();
  private stateMutationChain: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    let serializedState: string | undefined;
    try {
      serializedState = await readFile(this.statePath, 'utf8');
    } catch (error) {
      if (
        !(error instanceof Error) ||
        (error as NodeJS.ErrnoException).code !== 'ENOENT'
      ) {
        throw error;
      }
    }

    let nextState: PersistedState;
    let requiresProjectMigration = false;
    if (serializedState === undefined) {
      nextState = {
        projects: [],
        settings: this.toPersistedSettings(defaultSettings()),
        secrets: {},
      };
    } else {
      const parsedValue = JSON.parse(serializedState) as unknown;
      assertPersistedStateStructure(parsedValue);
      const parsed = parsedValue;
      const defaults = this.toPersistedSettings(defaultSettings());
      const parsedSettings = parsed.settings ?? {};
      const parsedSecrets = parsed.secrets ?? {};
      const parsedProjects = parsed.projects ?? [];
      const activeProjects = parsedProjects.filter(
        (project): project is PersistedProjectRecord & ProjectRecord =>
          isFixedProductMode(project),
      );
      requiresProjectMigration =
        activeProjects.length !== parsedProjects.length;
      const mergeEndpoint = (key: ProviderSecretKey) => {
        const merged = {
          ...defaults[key],
          ...(parsedSettings[key] ?? {}),
        };

        if (
          merged.provider === 'openai-compat' &&
          merged.baseUrl.includes('api.deepseek.com')
        ) {
          merged.baseUrl = 'https://api.deepseek.com';
          if (merged.model === 'deepseek-chat') {
            merged.model = 'deepseek-v4-flash';
          } else if (merged.model === 'deepseek-reasoner') {
            merged.model = 'deepseek-v4-pro';
          }
        }

        if (
          (key === 'image' || key === 'video') &&
          !parsedSecrets[key] &&
          (!merged.baseUrl || !merged.model)
        ) {
          return { ...merged, ...defaults[key] };
        }

        return merged;
      };
      const now = new Date().toISOString();
      const legacyDefaultWorkspace = path.join(
        app.getPath('documents'),
        `${LEGACY_PRODUCT_NAME} Games`,
      );
      const persistedDefaultWorkspace = parsedSettings.defaultWorkspace;
      nextState = {
        ...parsed,
        projects: activeProjects.map((project) =>
          normalizeInterruptedProject(project, now),
        ),
        settings: {
          ...parsedSettings,
          main: mergeEndpoint('main'),
          reasoning: mergeEndpoint('reasoning'),
          image: mergeEndpoint('image'),
          video: mergeEndpoint('video'),
          audio: mergeEndpoint('audio'),
          defaultWorkspace:
            persistedDefaultWorkspace === legacyDefaultWorkspace
              ? defaults.defaultWorkspace
              : persistedDefaultWorkspace || defaults.defaultWorkspace,
          // A headless one-shot runtime has no interactive approval channel;
          // the complete game pipeline therefore runs only in autonomous mode.
          permissionMode: 'yolo',
          developerMode: parsedSettings.developerMode === true,
        },
        secrets: parsedSecrets,
      };
    }
    if (serializedState !== undefined && requiresProjectMigration) {
      await this.backupStateBeforeProjectMigration(serializedState);
    }
    await this.flush(nextState);
    this.state = nextState;
  }

  getProjects(): ProjectRecord[] {
    return [...this.requireState().projects].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  getProject(id: string): ProjectRecord | undefined {
    return this.requireState().projects.find((project) => project.id === id);
  }

  async upsertProject(project: ProjectRecord): Promise<void> {
    if (!isFixedProductMode(project)) {
      throw new Error('只允许保存 Phaser 3 · 2D 横版平台项目。');
    }
    assertProjectRecord(project, 0);
    await this.updateState((state) => {
      const projects = [...state.projects];
      const index = projects.findIndex((item) => item.id === project.id);
      if (index >= 0) projects[index] = project;
      else projects.push(project);
      return { ...state, projects };
    });
  }

  getPublicSettings(): AppSettings {
    const state = this.requireState();
    const hydrate = (key: ProviderSecretKey): ProviderEndpoint => ({
      ...state.settings[key],
      apiKey: '',
      apiKeyConfigured: Boolean(this.decrypt(state.secrets[key])),
    });

    const main = hydrate('main');
    const reasoning = inheritCredential(hydrate('reasoning'), main);
    const image = hydrate('image');
    const video = inheritCredential(hydrate('video'), image);
    const audio = inheritCredential(hydrate('audio'), reasoning);

    return {
      main,
      reasoning,
      image,
      video,
      audio,
      defaultWorkspace: state.settings.defaultWorkspace,
      permissionMode: state.settings.permissionMode,
      developerMode: state.settings.developerMode,
    };
  }

  getRuntimeSettings(): AppSettings {
    const publicSettings = this.getPublicSettings();
    for (const key of [
      'main',
      'reasoning',
      'image',
      'video',
      'audio',
    ] as ProviderSecretKey[]) {
      publicSettings[key].apiKey = this.decrypt(
        this.requireState().secrets[key],
      );
    }
    return publicSettings;
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    await this.updateState((state) => {
      const previousProviders = Object.fromEntries(
        (
          [
            'main',
            'reasoning',
            'image',
            'video',
            'audio',
          ] as ProviderSecretKey[]
        ).map((key) => [key, state.settings[key].provider]),
      ) as Record<ProviderSecretKey, ProviderEndpoint['provider']>;
      const secrets = { ...state.secrets };

      for (const key of [
        'main',
        'reasoning',
        'image',
        'video',
        'audio',
      ] as ProviderSecretKey[]) {
        const nextKey = settings[key].apiKey.trim();
        if (nextKey) secrets[key] = this.encrypt(nextKey);
        else if (settings[key].provider !== previousProviders[key]) {
          delete secrets[key];
        }
      }

      return {
        ...state,
        settings: this.mergePersistedSettings(
          state.settings,
          this.toPersistedSettings({
            ...settings,
            permissionMode: 'yolo',
          }),
        ),
        secrets,
      };
    });
    return this.getPublicSettings();
  }

  getPublicMcpServers(): McpServerDefinition[] {
    return this.getRuntimeMcpServers().map((server) => ({
      ...server,
      env: hideSecretFields(server.env),
      headers: hideSecretFields(server.headers),
    }));
  }

  getRuntimeMcpServers(): McpServerDefinition[] {
    return this.getRuntimeMcpServersFromState(this.requireState());
  }

  private getRuntimeMcpServersFromState(
    state: PersistedState,
  ): McpServerDefinition[] {
    const raw = this.decrypt(state.secrets.mcpServers);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as McpServerDefinition[]) : [];
    } catch {
      return [];
    }
  }

  async saveMcpServers(
    servers: McpServerDefinition[],
  ): Promise<McpServerDefinition[]> {
    await this.updateState((state) => {
      const previous = new Map(
        this.getRuntimeMcpServersFromState(state).map((server) => [
          server.id,
          server,
        ]),
      );
      const merged = servers.map((server) => {
        const existing = previous.get(server.id);
        return {
          ...server,
          env: mergeSecretFields(server.env, existing?.env),
          headers: mergeSecretFields(server.headers, existing?.headers),
        };
      });
      const secrets = { ...state.secrets };
      if (merged.length) {
        secrets.mcpServers = this.encrypt(JSON.stringify(merged));
      } else {
        delete secrets.mcpServers;
      }
      return { ...state, secrets };
    });
    return this.getPublicMcpServers();
  }

  private toPersistedSettings(settings: AppSettings): PersistedSettings {
    const strip = ({
      apiKey: _apiKey,
      apiKeyConfigured: _configured,
      apiKeyInherited: _inherited,
      ...rest
    }: ProviderEndpoint) => rest;
    return {
      main: strip(settings.main),
      reasoning: strip(settings.reasoning),
      image: strip(settings.image),
      video: strip(settings.video),
      audio: strip(settings.audio),
      defaultWorkspace: settings.defaultWorkspace,
      permissionMode: settings.permissionMode,
      developerMode: settings.developerMode,
    };
  }

  private mergePersistedSettings(
    previous: PersistedSettings,
    next: PersistedSettings,
  ): PersistedSettings {
    return {
      ...previous,
      ...next,
      main: { ...previous.main, ...next.main },
      reasoning: { ...previous.reasoning, ...next.reasoning },
      image: { ...previous.image, ...next.image },
      video: { ...previous.video, ...next.video },
      audio: { ...previous.audio, ...next.audio },
    };
  }

  private encrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全存储暂不可用，无法保存敏感配置。');
    }
    return safeStorage.encryptString(value).toString('base64');
  }

  private decrypt(value?: string): string {
    if (!value || !safeStorage.isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch {
      return '';
    }
  }

  private requireState(): PersistedState {
    if (!this.state) throw new Error('StateStore 尚未初始化');
    return this.state;
  }

  private async updateState(
    update: (state: PersistedState) => PersistedState,
  ): Promise<void> {
    const operation = this.stateMutationChain
      .catch(() => undefined)
      .then(async () => {
        const nextState = update(this.requireState());
        await this.flush(nextState);
        this.state = nextState;
      });
    this.stateMutationChain = operation;
    await operation;
  }

  private async flush(state = this.requireState()): Promise<void> {
    const snapshot = JSON.stringify(state, null, 2);
    const temporaryPath = `${this.statePath}.tmp`;
    const operation = this.flushChain
      .catch(() => undefined)
      .then(async () => {
        await writeFile(temporaryPath, snapshot, 'utf8');
        await rename(temporaryPath, this.statePath);
      });
    this.flushChain = operation;
    await operation;
  }

  private async backupStateBeforeProjectMigration(
    serializedState: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.statePath}.pre-platformer-${timestamp}.bak`;
    const temporaryPath = `${backupPath}.tmp`;
    await writeFile(temporaryPath, serializedState, 'utf8');
    await rename(temporaryPath, backupPath);
  }
}

const PROJECT_STATUSES = new Set<ProjectRecord['status']>([
  'draft',
  'running',
  'waiting',
  'completed',
  'failed',
  'stopped',
]);
const PIPELINE_STAGES = new Set<ProjectRecord['stage']>([
  'brief',
  'classify',
  'scaffold',
  'gdd',
  'assets',
  'tilemap',
  'code',
  'verify',
  'complete',
]);
const STARTER_PREPARATION_STATUSES = new Set<StarterPreparation['status']>([
  'queued',
  'preparing',
  'ready',
  'failed',
]);
const STARTER_PREPARATION_PHASES = new Set<StarterPreparation['phase']>([
  'queued',
  'scaffold',
  'dependencies',
  'build',
  'level-validation',
  'preview-validation',
  'complete',
]);
const STARTER_PREPARATION_ERROR_CODES = new Set<
  NonNullable<StarterPreparation['errorCode']>
>([
  'interrupted',
  'network',
  'permission',
  'disk-space',
  'unsafe-project',
  'dependency',
  'build',
  'level-validation',
  'preview-validation',
  'persistence',
  'unknown',
]);
const PROVIDER_NAMES = new Set<ProviderEndpoint['provider']>([
  'openai-compat',
  'tongyi',
  'doubao',
  'elevenlabs',
  'minimax',
  'stability',
  'google-lyria',
  'mureka',
]);

function assertPersistedStateStructure(
  value: unknown,
): asserts value is ParsedPersistedState {
  if (!isPlainObject(value)) invalidState('根值必须是对象');

  if (hasOwn(value, 'projects')) {
    if (!Array.isArray(value.projects)) invalidState('projects 必须是数组');
    value.projects.forEach((project, index) =>
      assertProjectRecord(project, index),
    );
  }

  if (hasOwn(value, 'settings')) {
    if (!isPlainObject(value.settings)) invalidState('settings 必须是对象');
    assertPersistedSettings(value.settings);
  }

  if (hasOwn(value, 'secrets')) {
    if (!isPlainObject(value.secrets)) invalidState('secrets 必须是对象');
    for (const key of [
      'main',
      'reasoning',
      'image',
      'video',
      'audio',
      'mcpServers',
    ] as SecretKey[]) {
      if (
        hasOwn(value.secrets, key) &&
        typeof value.secrets[key] !== 'string'
      ) {
        invalidState(`secrets.${key} 必须是字符串`);
      }
    }
  }
}

function assertProjectRecord(value: unknown, index: number): void {
  if (!isPlainObject(value)) invalidState(`projects[${index}] 必须是对象`);
  for (const field of [
    'id',
    'name',
    'path',
    'prompt',
    'status',
    'stage',
    'createdAt',
    'updatedAt',
  ] as const) {
    if (typeof value[field] !== 'string') {
      invalidState(`projects[${index}].${field} 必须是字符串`);
    }
  }
  if (!PROJECT_STATUSES.has(value.status as ProjectRecord['status'])) {
    invalidState(`projects[${index}].status 值无效`);
  }
  if (!PIPELINE_STAGES.has(value.stage as ProjectRecord['stage'])) {
    invalidState(`projects[${index}].stage 值无效`);
  }
  for (const field of ['sessionId', 'productMode'] as const) {
    if (hasOwn(value, field) && typeof value[field] !== 'string') {
      invalidState(`projects[${index}].${field} 必须是字符串`);
    }
  }
  if (hasOwn(value, 'starterPreparation')) {
    assertStarterPreparation(value.starterPreparation, index);
  }
}

function assertStarterPreparation(value: unknown, projectIndex: number): void {
  const fieldPath = `projects[${projectIndex}].starterPreparation`;
  if (!isPlainObject(value)) invalidState(`${fieldPath} 必须是对象`);

  if (
    !hasOwn(value, 'schemaVersion') ||
    value.schemaVersion !== STARTER_PREPARATION_SCHEMA_VERSION
  ) {
    invalidState(`${fieldPath}.schemaVersion 值无效`);
  }
  if (
    !hasOwn(value, 'status') ||
    !STARTER_PREPARATION_STATUSES.has(
      value.status as StarterPreparation['status'],
    )
  ) {
    invalidState(`${fieldPath}.status 值无效`);
  }
  if (
    !hasOwn(value, 'phase') ||
    !STARTER_PREPARATION_PHASES.has(value.phase as StarterPreparation['phase'])
  ) {
    invalidState(`${fieldPath}.phase 值无效`);
  }
  if (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1) {
    invalidState(`${fieldPath}.attempt 必须是安全正整数`);
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) {
    invalidState(`${fieldPath}.revision 必须是安全非负整数`);
  }
  if (
    typeof value.message !== 'string' ||
    value.message.length > STARTER_PREPARATION_MESSAGE_MAX_LENGTH
  ) {
    invalidState(
      `${fieldPath}.message 必须是不超过 ${STARTER_PREPARATION_MESSAGE_MAX_LENGTH} 字符的字符串`,
    );
  }
  if (
    hasOwn(value, 'errorCode') &&
    !STARTER_PREPARATION_ERROR_CODES.has(
      value.errorCode as NonNullable<StarterPreparation['errorCode']>,
    )
  ) {
    invalidState(`${fieldPath}.errorCode 值无效`);
  }
  for (const field of ['startedAt', 'finishedAt'] as const) {
    if (hasOwn(value, field) && typeof value[field] !== 'string') {
      invalidState(`${fieldPath}.${field} 必须是字符串`);
    }
  }
}

function assertPersistedSettings(settings: Record<string, unknown>): void {
  for (const key of [
    'main',
    'reasoning',
    'image',
    'video',
    'audio',
  ] as ProviderSecretKey[]) {
    if (!hasOwn(settings, key)) continue;
    const endpoint = settings[key];
    if (!isPlainObject(endpoint)) {
      invalidState(`settings.${key} 必须是对象`);
    }
    for (const field of ['provider', 'baseUrl', 'model'] as const) {
      if (hasOwn(endpoint, field) && typeof endpoint[field] !== 'string') {
        invalidState(`settings.${key}.${field} 必须是字符串`);
      }
    }
    if (
      hasOwn(endpoint, 'provider') &&
      !PROVIDER_NAMES.has(endpoint.provider as ProviderEndpoint['provider'])
    ) {
      invalidState(`settings.${key}.provider 值无效`);
    }
  }

  if (
    hasOwn(settings, 'defaultWorkspace') &&
    typeof settings.defaultWorkspace !== 'string'
  ) {
    invalidState('settings.defaultWorkspace 必须是字符串');
  }
  if (
    hasOwn(settings, 'developerMode') &&
    typeof settings.developerMode !== 'boolean'
  ) {
    invalidState('settings.developerMode 必须是布尔值');
  }
  if (
    hasOwn(settings, 'permissionMode') &&
    settings.permissionMode !== 'auto-edit' &&
    settings.permissionMode !== 'yolo'
  ) {
    invalidState('settings.permissionMode 值无效');
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalidState(reason: string): never {
  throw new TypeError(`state.json 结构无效：${reason}`);
}

function normalizeInterruptedProject(
  project: PersistedProjectRecord & ProjectRecord,
  now: string,
): PersistedProjectRecord & ProjectRecord {
  const agentWasInterrupted =
    project.status === 'running' || project.status === 'waiting';
  const preparation = project.starterPreparation;
  const preparationWasInterrupted =
    preparation?.status === 'queued' || preparation?.status === 'preparing';

  if (!agentWasInterrupted && !preparationWasInterrupted) return project;

  return {
    ...project,
    status: agentWasInterrupted ? 'stopped' : project.status,
    updatedAt: now,
    ...(preparationWasInterrupted
      ? {
          starterPreparation: {
            ...preparation,
            status: 'failed',
            revision: preparation.revision + 1,
            errorCode: 'interrupted',
            message: '上次基础游戏准备被中断，请重试。',
            finishedAt: now,
          },
        }
      : {}),
  };
}

function inheritCredential(
  endpoint: ProviderEndpoint,
  fallback: ProviderEndpoint,
): ProviderEndpoint {
  if (
    endpoint.apiKeyConfigured ||
    !fallback.apiKeyConfigured ||
    endpoint.provider !== fallback.provider
  ) {
    return endpoint;
  }
  return { ...endpoint, apiKeyConfigured: true, apiKeyInherited: true };
}

function hideSecretFields(fields: SecretField[]): SecretField[] {
  return fields.map((field) => ({
    name: field.name,
    value: '',
    configured: Boolean(field.value),
  }));
}

function mergeSecretFields(
  fields: SecretField[],
  previous: SecretField[] = [],
): SecretField[] {
  const previousValues = new Map(
    previous.map((field) => [field.name, field.value]),
  );
  return fields.map((field) => ({
    name: field.name,
    value:
      field.value ||
      (field.configured ? (previousValues.get(field.name) ?? '') : ''),
  }));
}
