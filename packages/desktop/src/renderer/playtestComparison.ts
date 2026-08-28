import type {
  PlaytestEvaluationStatus,
  PlaytestReport,
} from './playtestTelemetry';

export type PlaytestComparisonVerdict =
  | 'improved'
  | 'regressed'
  | 'unchanged'
  | 'inconclusive';

export interface PlaytestResultSnapshot {
  evaluationStatus: PlaytestEvaluationStatus;
  automationDeaths: number;
  farthestDistance: number;
  elapsedMs: number;
}

export interface PlaytestComparison {
  verdict: PlaytestComparisonVerdict;
  reason: string;
}

const FAILURE_STATUSES = new Set<PlaytestEvaluationStatus>([
  'repeated-death',
  'stuck',
  'timeout',
]);

export function createPlaytestResultSnapshot(
  report: PlaytestReport,
): PlaytestResultSnapshot {
  const endAt = report.evaluationCompletedAt ?? report.updatedAt;
  const elapsedMs =
    report.automationStartedAt === undefined || endAt === undefined
      ? 0
      : Math.max(0, endAt - report.automationStartedAt);
  return {
    evaluationStatus: report.evaluationStatus,
    automationDeaths: report.automationDeaths,
    farthestDistance: report.automationFarthestDistance,
    elapsedMs,
  };
}

export function comparePlaytestResults(
  before: PlaytestResultSnapshot,
  after: PlaytestResultSnapshot,
): PlaytestComparison {
  if (after.evaluationStatus === 'success') {
    return before.evaluationStatus === 'success'
      ? { verdict: 'unchanged', reason: '修改前后都成功到达终点。' }
      : { verdict: 'improved', reason: '修改后机器人成功到达了终点。' };
  }
  if (before.evaluationStatus === 'success') {
    return { verdict: 'regressed', reason: '修改前能够通关，修改后没有通关。' };
  }
  if (
    !FAILURE_STATUSES.has(before.evaluationStatus) ||
    !FAILURE_STATUSES.has(after.evaluationStatus)
  ) {
    return {
      verdict: 'inconclusive',
      reason: '至少一次试玩没有得到完整的成功或失败结论。',
    };
  }
  if (after.automationDeaths < before.automationDeaths) {
    return { verdict: 'improved', reason: '修改后自动试玩死亡次数减少了。' };
  }
  if (after.automationDeaths > before.automationDeaths) {
    return { verdict: 'regressed', reason: '修改后自动试玩死亡次数增加了。' };
  }
  const distanceChange = after.farthestDistance - before.farthestDistance;
  if (distanceChange >= 32) {
    return {
      verdict: 'improved',
      reason: '修改后机器人至少多前进了 32 像素。',
    };
  }
  if (distanceChange <= -32) {
    return {
      verdict: 'regressed',
      reason: '修改后机器人至少少前进了 32 像素。',
    };
  }
  if (after.evaluationStatus === before.evaluationStatus) {
    return {
      verdict: 'unchanged',
      reason: '修改前后结论、死亡次数和最远进展都没有明显变化。',
    };
  }
  return {
    verdict: 'inconclusive',
    reason: '失败类型发生了变化，但现有数据不足以判断变好还是变差。',
  };
}

export function isFinishedPlaytestEvaluation(
  status: PlaytestEvaluationStatus,
): boolean {
  return (
    status === 'success' || FAILURE_STATUSES.has(status) || status === 'stopped'
  );
}
