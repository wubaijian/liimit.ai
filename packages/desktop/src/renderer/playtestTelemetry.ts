export const PLAYTEST_MESSAGE_SOURCE = 'liimit.ai';
export const PLAYTEST_MESSAGE_CHANNEL = 'playtest';
export const PLAYTEST_CONTROL_CHANNEL = 'playtest-control';

export type PlaytestAutomationAction =
  | 'idle'
  | 'move-left'
  | 'move-right'
  | 'jump';
export type PlaytestControlCommand = 'start' | 'stop';
export type PlaytestEvaluationStatus =
  | 'not-started'
  | 'running'
  | 'success'
  | 'repeated-death'
  | 'stuck'
  | 'timeout'
  | 'stopped';

export const PLAYTEST_REPEATED_DEATH_LIMIT = 3;
export const PLAYTEST_STUCK_MS = 5_000;
export const PLAYTEST_TIMEOUT_MS = 30_000;
export const PLAYTEST_PROGRESS_DISTANCE = 32;

interface PlaytestPosition {
  x: number;
  y: number;
}

export type PlaytestEvent =
  | ({
      type: 'level-started';
      levelId: string;
      levelName: string;
      levelIndex: number;
      totalLevels: number;
    } & PlaytestPosition)
  | ({ type: 'started'; totalCoins: number } & PlaytestPosition)
  | ({ type: 'position' } & PlaytestPosition)
  | ({ type: 'jumped' } & PlaytestPosition)
  | ({ type: 'coin-collected'; objectId: string } & PlaytestPosition)
  | ({ type: 'died'; objectId: string } & PlaytestPosition)
  | ({ type: 'completed' } & PlaytestPosition)
  | ({
      type: 'automation-state';
      active: boolean;
      action: PlaytestAutomationAction;
    } & PlaytestPosition);

export interface PlaytestReport {
  status: 'waiting' | 'running' | 'completed';
  startedAt?: number;
  updatedAt?: number;
  attempts: number;
  currentLevelId?: string;
  currentLevelName?: string;
  currentLevelIndex: number;
  totalLevels: number;
  lastX: number;
  lastY: number;
  farthestX: number;
  jumps: number;
  collectedCoinIds: string[];
  totalCoins: number;
  deaths: number;
  lastHazardId?: string;
  automationActive: boolean;
  automationAction: PlaytestAutomationAction;
  evaluationStatus: PlaytestEvaluationStatus;
  automationStartedAt?: number;
  evaluationCompletedAt?: number;
  automationStartX?: number;
  automationFarthestDistance: number;
  automationDeaths: number;
  lastProgressAt?: number;
  progressAnchorX: number;
}

const EVENT_KEYS: Record<PlaytestEvent['type'], readonly string[]> = {
  'level-started': [
    'type',
    'levelId',
    'levelName',
    'levelIndex',
    'totalLevels',
    'x',
    'y',
  ],
  started: ['type', 'x', 'y', 'totalCoins'],
  position: ['type', 'x', 'y'],
  jumped: ['type', 'x', 'y'],
  'coin-collected': ['type', 'objectId', 'x', 'y'],
  died: ['type', 'objectId', 'x', 'y'],
  completed: ['type', 'x', 'y'],
  'automation-state': ['type', 'active', 'action', 'x', 'y'],
};
const OBJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const AUTOMATION_ACTIONS = new Set<PlaytestAutomationAction>([
  'idle',
  'move-left',
  'move-right',
  'jump',
]);

export function createEmptyPlaytestReport(): PlaytestReport {
  return {
    status: 'waiting',
    attempts: 0,
    currentLevelIndex: 1,
    totalLevels: 1,
    lastX: 0,
    lastY: 0,
    farthestX: 0,
    jumps: 0,
    collectedCoinIds: [],
    totalCoins: 0,
    deaths: 0,
    automationActive: false,
    automationAction: 'idle',
    evaluationStatus: 'not-started',
    automationFarthestDistance: 0,
    automationDeaths: 0,
    progressAnchorX: 0,
  };
}

export function createPlaytestControlMessage(command: PlaytestControlCommand) {
  return {
    source: PLAYTEST_MESSAGE_SOURCE,
    channel: PLAYTEST_CONTROL_CHANNEL,
    version: 1 as const,
    command: { type: command },
  };
}

export function parsePlaytestMessage(
  value: unknown,
): PlaytestEvent | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!hasExactKeys(value, ['source', 'channel', 'version', 'event'])) {
    return undefined;
  }
  if (
    value.source !== PLAYTEST_MESSAGE_SOURCE ||
    value.channel !== PLAYTEST_MESSAGE_CHANNEL ||
    value.version !== 1 ||
    !isPlainObject(value.event) ||
    typeof value.event.type !== 'string' ||
    !(value.event.type in EVENT_KEYS)
  ) {
    return undefined;
  }
  const type = value.event.type as PlaytestEvent['type'];
  if (!hasExactKeys(value.event, EVENT_KEYS[type])) return undefined;
  if (!isCoordinate(value.event.x) || !isCoordinate(value.event.y)) {
    return undefined;
  }
  if (
    type === 'level-started' &&
    (typeof value.event.levelId !== 'string' ||
      !OBJECT_ID_PATTERN.test(value.event.levelId) ||
      typeof value.event.levelName !== 'string' ||
      value.event.levelName.length === 0 ||
      value.event.levelName.length > 40 ||
      !Number.isSafeInteger(value.event.levelIndex) ||
      (value.event.levelIndex as number) < 1 ||
      !Number.isSafeInteger(value.event.totalLevels) ||
      (value.event.totalLevels as number) < 1 ||
      (value.event.totalLevels as number) > 30 ||
      (value.event.levelIndex as number) > (value.event.totalLevels as number))
  ) {
    return undefined;
  }
  if (
    (type === 'coin-collected' || type === 'died') &&
    (typeof value.event.objectId !== 'string' ||
      !OBJECT_ID_PATTERN.test(value.event.objectId))
  ) {
    return undefined;
  }
  if (
    type === 'started' &&
    (typeof value.event.totalCoins !== 'number' ||
      !Number.isSafeInteger(value.event.totalCoins) ||
      value.event.totalCoins < 0 ||
      value.event.totalCoins > 2_000)
  ) {
    return undefined;
  }
  if (
    type === 'automation-state' &&
    (typeof value.event.active !== 'boolean' ||
      typeof value.event.action !== 'string' ||
      !AUTOMATION_ACTIONS.has(value.event.action as PlaytestAutomationAction))
  ) {
    return undefined;
  }
  return value.event as unknown as PlaytestEvent;
}

export function reducePlaytestReport(
  previous: PlaytestReport,
  event: PlaytestEvent,
  receivedAt: number,
): PlaytestReport {
  const startedAt = previous.startedAt ?? receivedAt;
  let common = {
    ...previous,
    startedAt,
    updatedAt: Math.max(startedAt, receivedAt),
    lastX: event.x,
    lastY: event.y,
    farthestX: Math.max(previous.farthestX, event.x),
    automationFarthestDistance:
      previous.automationActive &&
      previous.evaluationStatus === 'running' &&
      previous.automationStartX !== undefined
        ? Math.max(
            previous.automationFarthestDistance,
            Math.abs(event.x - previous.automationStartX),
          )
        : previous.automationFarthestDistance,
  };
  if (
    previous.automationActive &&
    previous.evaluationStatus === 'running' &&
    Math.abs(event.x - previous.progressAnchorX) >= PLAYTEST_PROGRESS_DISTANCE
  ) {
    common = {
      ...common,
      lastProgressAt: receivedAt,
      progressAnchorX: event.x,
    };
  }
  switch (event.type) {
    case 'level-started':
      return {
        ...common,
        currentLevelId: event.levelId,
        currentLevelName: event.levelName,
        currentLevelIndex: event.levelIndex,
        totalLevels: event.totalLevels,
      };
    case 'started':
      return {
        ...common,
        status: 'running',
        attempts: previous.attempts + 1,
        collectedCoinIds: [],
        totalCoins: event.totalCoins,
      };
    case 'position':
      return evaluatePlaytestResult(common, receivedAt);
    case 'jumped':
      return { ...common, jumps: previous.jumps + 1 };
    case 'coin-collected':
      return {
        ...common,
        collectedCoinIds: previous.collectedCoinIds.includes(event.objectId)
          ? previous.collectedCoinIds
          : [...previous.collectedCoinIds, event.objectId],
      };
    case 'died':
      return evaluatePlaytestResult(
        {
          ...common,
          deaths: previous.deaths + 1,
          lastHazardId: event.objectId,
          automationDeaths:
            previous.automationDeaths +
            (previous.automationActive &&
            previous.evaluationStatus === 'running'
              ? 1
              : 0),
        },
        receivedAt,
      );
    case 'completed':
      return {
        ...common,
        status: 'completed',
        automationActive: false,
        automationAction: 'idle',
        evaluationStatus: previous.automationActive
          ? 'success'
          : previous.evaluationStatus,
        evaluationCompletedAt: previous.automationActive
          ? receivedAt
          : previous.evaluationCompletedAt,
      };
    case 'automation-state':
      if (event.active && !previous.automationActive) {
        return {
          ...common,
          automationActive: true,
          automationAction: event.action,
          evaluationStatus: 'running',
          automationStartedAt: receivedAt,
          evaluationCompletedAt: undefined,
          automationStartX: event.x,
          automationFarthestDistance: 0,
          automationDeaths: 0,
          lastProgressAt: receivedAt,
          progressAnchorX: event.x,
        };
      }
      if (!event.active && previous.automationActive) {
        return {
          ...common,
          automationActive: false,
          automationAction: event.action,
          evaluationStatus: isFinalEvaluation(previous.evaluationStatus)
            ? previous.evaluationStatus
            : 'stopped',
          evaluationCompletedAt: isFinalEvaluation(previous.evaluationStatus)
            ? previous.evaluationCompletedAt
            : receivedAt,
        };
      }
      return evaluatePlaytestResult(
        {
          ...common,
          automationActive: event.active,
          automationAction: event.action,
        },
        receivedAt,
      );
    default:
      return common;
  }
}

export function evaluatePlaytestResult(
  report: PlaytestReport,
  now: number,
): PlaytestReport {
  if (
    !report.automationActive ||
    report.evaluationStatus !== 'running' ||
    report.automationStartedAt === undefined ||
    report.lastProgressAt === undefined
  ) {
    return report;
  }
  if (report.automationDeaths >= PLAYTEST_REPEATED_DEATH_LIMIT) {
    return {
      ...report,
      updatedAt: Math.max(report.updatedAt ?? now, now),
      evaluationStatus: 'repeated-death',
      evaluationCompletedAt: now,
    };
  }
  if (now - report.automationStartedAt >= getPlaytestTimeoutMs(report)) {
    return {
      ...report,
      updatedAt: Math.max(report.updatedAt ?? now, now),
      evaluationStatus: 'timeout',
      evaluationCompletedAt: now,
    };
  }
  if (now - report.lastProgressAt >= PLAYTEST_STUCK_MS) {
    return {
      ...report,
      updatedAt: Math.max(report.updatedAt ?? now, now),
      evaluationStatus: 'stuck',
      evaluationCompletedAt: now,
    };
  }
  return report;
}

export function getPlaytestEvaluationDelay(
  report: PlaytestReport,
  now: number,
): number | undefined {
  if (
    !report.automationActive ||
    report.evaluationStatus !== 'running' ||
    report.automationStartedAt === undefined ||
    report.lastProgressAt === undefined
  ) {
    return undefined;
  }
  const deadline = Math.min(
    report.automationStartedAt + getPlaytestTimeoutMs(report),
    report.lastProgressAt + PLAYTEST_STUCK_MS,
  );
  return Math.max(0, deadline - now);
}

export function getPlaytestTimeoutMs(report: PlaytestReport): number {
  return PLAYTEST_TIMEOUT_MS * Math.max(1, report.attempts);
}

export function isFailedPlaytestEvaluation(
  status: PlaytestEvaluationStatus,
): boolean {
  return (
    status === 'repeated-death' || status === 'stuck' || status === 'timeout'
  );
}

function isFinalEvaluation(status: PlaytestEvaluationStatus): boolean {
  return status !== 'not-started' && status !== 'running';
}

export function getPlaytestElapsedMs(report: PlaytestReport): number {
  if (report.startedAt === undefined || report.updatedAt === undefined)
    return 0;
  return Math.max(0, report.updatedAt - report.startedAt);
}

function isCoordinate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= 100_000
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}
