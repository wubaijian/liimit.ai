import path from 'node:path';
import {
  FIXED_PRODUCT_MODE,
  STARTER_PREPARATION_SCHEMA_VERSION,
  type ProjectRecord,
  type StarterPreparation,
} from '../src/shared/types.js';

export const STARTER_PREPARATION_FIXTURE_TIMESTAMPS = {
  createdAt: '2026-08-24T08:00:00.000Z',
  startedAt: '2026-08-24T08:00:01.000Z',
  finishedAt: '2026-08-24T08:00:07.000Z',
} as const;

export function makeQueuedStarterPreparation(
  overrides: Partial<StarterPreparation> = {},
): StarterPreparation {
  return {
    schemaVersion: STARTER_PREPARATION_SCHEMA_VERSION,
    status: 'queued',
    phase: 'queued',
    attempt: 1,
    revision: 0,
    message: '基础游戏已排队，等待准备。',
    ...overrides,
  };
}

export function makePreparingStarterPreparation(
  overrides: Partial<StarterPreparation> = {},
): StarterPreparation {
  return {
    schemaVersion: STARTER_PREPARATION_SCHEMA_VERSION,
    status: 'preparing',
    phase: 'scaffold',
    attempt: 1,
    revision: 1,
    message: '正在复制固定游戏模板。',
    startedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.startedAt,
    ...overrides,
  };
}

export function makeReadyStarterPreparation(
  overrides: Partial<StarterPreparation> = {},
): StarterPreparation {
  return {
    schemaVersion: STARTER_PREPARATION_SCHEMA_VERSION,
    status: 'ready',
    phase: 'complete',
    attempt: 1,
    revision: 7,
    message: '基础游戏已经可以编辑和试玩。',
    startedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.startedAt,
    finishedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.finishedAt,
    ...overrides,
  };
}

export function makeFailedStarterPreparation(
  overrides: Partial<StarterPreparation> = {},
): StarterPreparation {
  return {
    schemaVersion: STARTER_PREPARATION_SCHEMA_VERSION,
    status: 'failed',
    phase: 'dependencies',
    attempt: 1,
    revision: 3,
    message: '依赖准备失败，请检查网络后重试。',
    errorCode: 'network',
    startedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.startedAt,
    finishedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.finishedAt,
    ...overrides,
  };
}

export function makeStarterPreparationSequence(): StarterPreparation[] {
  return [
    makeQueuedStarterPreparation(),
    makePreparingStarterPreparation(),
    makePreparingStarterPreparation({
      phase: 'dependencies',
      revision: 2,
      message: '正在准备固定运行环境。',
    }),
    makePreparingStarterPreparation({
      phase: 'build',
      revision: 3,
      message: '正在构建 Web 游戏。',
    }),
    makePreparingStarterPreparation({
      phase: 'level-validation',
      revision: 4,
      message: '正在检查真实关卡。',
    }),
    makePreparingStarterPreparation({
      phase: 'preview-validation',
      revision: 5,
      message: '正在检查 Web 试玩。',
    }),
    makeReadyStarterPreparation({ revision: 6 }),
  ];
}

export function makeStarterProject(
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  const id = overrides.id ?? 'starter-project';
  return {
    id,
    name: '基础横版游戏',
    path: path.join('test-workspace', id),
    prompt: '制作一个可以跳跃的横版平台游戏。',
    status: 'draft',
    stage: 'brief',
    productMode: FIXED_PRODUCT_MODE.id,
    createdAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.createdAt,
    updatedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.createdAt,
    starterPreparation: makeQueuedStarterPreparation(),
    ...overrides,
  };
}
