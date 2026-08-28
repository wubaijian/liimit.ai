import { describe, expect, it } from 'vitest';
import {
  comparePlaytestResults,
  createPlaytestResultSnapshot,
  isFinishedPlaytestEvaluation,
  type PlaytestResultSnapshot,
} from '../src/renderer/playtestComparison.js';
import { createEmptyPlaytestReport } from '../src/renderer/playtestTelemetry.js';

describe('修改前后自动试玩对比', () => {
  it('快照使用自动测试终局时间和方向无关的最远进展', () => {
    const report = {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death' as const,
      automationStartedAt: 1_000,
      evaluationCompletedAt: 4_500,
      updatedAt: 20_000,
      automationDeaths: 3,
      automationFarthestDistance: 640,
    };

    const snapshot = createPlaytestResultSnapshot(report);
    report.updatedAt = 40_000;
    report.automationDeaths = 9;

    expect(snapshot).toEqual({
      evaluationStatus: 'repeated-death',
      automationDeaths: 3,
      farthestDistance: 640,
      elapsedMs: 3_500,
    });
  });

  it('修改后成功通关判断为有改善', () => {
    expect(comparePlaytestResults(failure(), result('success'))).toEqual({
      verdict: 'improved',
      reason: '修改后机器人成功到达了终点。',
    });
  });

  it('死亡次数减少或最远进展增加时判断为有改善', () => {
    expect(
      comparePlaytestResults(
        failure({ automationDeaths: 3 }),
        failure({ automationDeaths: 1 }),
      ),
    ).toMatchObject({ verdict: 'improved' });
    expect(
      comparePlaytestResults(
        failure({ farthestDistance: 300 }),
        failure({ farthestDistance: 332 }),
      ),
    ).toMatchObject({ verdict: 'improved' });
  });

  it('修改后失去通关、死亡增加或进展减少时判断为变差', () => {
    expect(comparePlaytestResults(result('success'), failure())).toMatchObject({
      verdict: 'regressed',
    });
    expect(
      comparePlaytestResults(
        failure({ automationDeaths: 1 }),
        failure({ automationDeaths: 2 }),
      ),
    ).toMatchObject({ verdict: 'regressed' });
    expect(
      comparePlaytestResults(
        failure({ farthestDistance: 400 }),
        failure({ farthestDistance: 368 }),
      ),
    ).toMatchObject({ verdict: 'regressed' });
  });

  it('证据相同显示暂无明确变化，失败类型变化显示无法判断', () => {
    expect(comparePlaytestResults(failure(), failure())).toMatchObject({
      verdict: 'unchanged',
    });
    expect(
      comparePlaytestResults(failure(), failure({ evaluationStatus: 'stuck' })),
    ).toMatchObject({ verdict: 'inconclusive' });
  });

  it('用户停止或未完成的试玩不能形成明确比较', () => {
    expect(comparePlaytestResults(failure(), result('stopped'))).toMatchObject({
      verdict: 'inconclusive',
    });
    expect(isFinishedPlaytestEvaluation('running')).toBe(false);
    expect(isFinishedPlaytestEvaluation('success')).toBe(true);
    expect(isFinishedPlaytestEvaluation('repeated-death')).toBe(true);
    expect(isFinishedPlaytestEvaluation('stopped')).toBe(true);
  });
});

function failure(
  overrides: Partial<PlaytestResultSnapshot> = {},
): PlaytestResultSnapshot {
  return {
    evaluationStatus: 'repeated-death',
    automationDeaths: 3,
    farthestDistance: 400,
    elapsedMs: 4_000,
    ...overrides,
  };
}

function result(
  evaluationStatus: PlaytestResultSnapshot['evaluationStatus'],
): PlaytestResultSnapshot {
  return {
    evaluationStatus,
    automationDeaths: 0,
    farthestDistance: 1_800,
    elapsedMs: 8_000,
  };
}
