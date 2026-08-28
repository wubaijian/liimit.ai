import { describe, expect, it } from 'vitest';
import {
  createEmptyPlaytestReport,
  createPlaytestControlMessage,
  evaluatePlaytestResult,
  getPlaytestEvaluationDelay,
  getPlaytestElapsedMs,
  parsePlaytestMessage,
  reducePlaytestReport,
  type PlaytestEvent,
} from '../src/renderer/playtestTelemetry.js';

describe('试玩消息检查', () => {
  it.each<PlaytestEvent>([
    {
      type: 'level-started',
      levelId: 'level-2',
      levelName: '第 2 关',
      levelIndex: 2,
      totalLevels: 3,
      x: 96,
      y: 560,
    },
    { type: 'started', x: 96, y: 560, totalCoins: 2 },
    { type: 'position', x: 128, y: 560 },
    { type: 'jumped', x: 160, y: 540 },
    { type: 'coin-collected', objectId: 'coin-1', x: 416, y: 512 },
    { type: 'died', objectId: 'spike-1', x: 640, y: 624 },
    { type: 'completed', x: 2_240, y: 560 },
    {
      type: 'automation-state',
      active: true,
      action: 'move-right',
      x: 128,
      y: 560,
    },
  ])('接受固定格式的 $type 事件', (event) => {
    expect(parsePlaytestMessage(envelope(event))).toEqual(event);
  });

  it.each([
    { ...envelope({ type: 'position', x: 1, y: 2 }), source: 'other' },
    { ...envelope({ type: 'position', x: 1, y: 2 }), extra: true },
    envelope({ type: 'position', x: Number.NaN, y: 2 }),
    envelope({ type: 'position', x: 1, y: 200_000 }),
    envelope({ type: 'died', objectId: '../secret', x: 1, y: 2 }),
    envelope({ type: 'started', x: 1, y: 2, totalCoins: -1 }),
    envelope({
      type: 'automation-state',
      active: true,
      action: 'fly',
      x: 1,
      y: 2,
    }),
    envelope({
      type: 'automation-state',
      active: 'yes',
      action: 'idle',
      x: 1,
      y: 2,
    }),
    envelope({ type: 'unknown', x: 1, y: 2 }),
    null,
  ])('拒绝错误来源、额外字段和非法内容', (message) => {
    expect(parsePlaytestMessage(message)).toBeUndefined();
  });

  it('创建固定且最小的开始与停止控制消息', () => {
    expect(createPlaytestControlMessage('start')).toEqual({
      source: 'liimit.ai',
      channel: 'playtest-control',
      version: 1,
      command: { type: 'start' },
    });
    expect(createPlaytestControlMessage('stop')).toEqual({
      source: 'liimit.ai',
      channel: 'playtest-control',
      version: 1,
      command: { type: 'stop' },
    });
  });
});

describe('人工试玩报告汇总', () => {
  it('记住正在试玩的关卡和总关卡数', () => {
    const report = reducePlaytestReport(
      createEmptyPlaytestReport(),
      {
        type: 'level-started',
        levelId: 'level-2',
        levelName: '第 2 关',
        levelIndex: 2,
        totalLevels: 3,
        x: 96,
        y: 560,
      },
      1_000,
    );

    expect(report).toMatchObject({
      currentLevelId: 'level-2',
      currentLevelName: '第 2 关',
      currentLevelIndex: 2,
      totalLevels: 3,
    });
  });

  it('汇总位置、跳跃、金币、死亡、重试和通关', () => {
    let report = createEmptyPlaytestReport();
    report = reducePlaytestReport(
      report,
      { type: 'started', x: 96, y: 560, totalCoins: 2 },
      1_000,
    );
    report = reducePlaytestReport(
      report,
      {
        type: 'automation-state',
        active: true,
        action: 'move-right',
        x: 100,
        y: 560,
      },
      1_100,
    );
    report = reducePlaytestReport(
      report,
      { type: 'position', x: 700, y: 500 },
      1_500,
    );
    report = reducePlaytestReport(
      report,
      { type: 'jumped', x: 720, y: 480 },
      1_600,
    );
    report = reducePlaytestReport(
      report,
      { type: 'coin-collected', objectId: 'coin-1', x: 760, y: 500 },
      1_700,
    );
    report = reducePlaytestReport(
      report,
      { type: 'coin-collected', objectId: 'coin-1', x: 760, y: 500 },
      1_800,
    );
    report = reducePlaytestReport(
      report,
      { type: 'died', objectId: 'spike-1', x: 800, y: 624 },
      2_000,
    );
    report = reducePlaytestReport(
      report,
      { type: 'started', x: 96, y: 560, totalCoins: 2 },
      2_100,
    );
    report = reducePlaytestReport(
      report,
      { type: 'completed', x: 2_240, y: 560 },
      3_500,
    );

    expect(report).toMatchObject({
      status: 'completed',
      attempts: 2,
      lastX: 2_240,
      lastY: 560,
      farthestX: 2_240,
      jumps: 1,
      collectedCoinIds: [],
      totalCoins: 2,
      deaths: 1,
      lastHazardId: 'spike-1',
      automationActive: false,
      automationAction: 'idle',
    });
    expect(getPlaytestElapsedMs(report)).toBe(2_500);
  });

  it('空报告的用时为零且收到早于开始的时间也不会产生负数', () => {
    expect(getPlaytestElapsedMs(createEmptyPlaytestReport())).toBe(0);
    const started = reducePlaytestReport(
      createEmptyPlaytestReport(),
      { type: 'started', x: 96, y: 560, totalCoins: 1 },
      1_000,
    );
    const updated = reducePlaytestReport(
      started,
      { type: 'position', x: 100, y: 560 },
      900,
    );
    expect(getPlaytestElapsedMs(updated)).toBe(0);
  });
});

describe('自动试玩结果判断', () => {
  it('人工试玩不会产生自动测试结论', () => {
    let report = reducePlaytestReport(
      createEmptyPlaytestReport(),
      { type: 'started', x: 100, y: 560, totalCoins: 0 },
      1_000,
    );
    report = reducePlaytestReport(
      report,
      { type: 'died', objectId: 'spike-1', x: 200, y: 624 },
      2_000,
    );
    report = evaluatePlaytestResult(report, 60_000);

    expect(report.evaluationStatus).toBe('not-started');
    expect(report.automationDeaths).toBe(0);
  });

  it('开始自动试玩会建立独立计时和移动基准', () => {
    const report = startAutomation(10_000, 320);

    expect(report).toMatchObject({
      evaluationStatus: 'running',
      automationStartedAt: 10_000,
      lastProgressAt: 10_000,
      progressAnchorX: 320,
      automationDeaths: 0,
    });
  });

  it('同一次自动试玩死亡 3 次后判断为反复死亡', () => {
    let report = startAutomation();
    for (let index = 1; index <= 3; index += 1) {
      report = reducePlaytestReport(
        report,
        { type: 'died', objectId: 'spike-1', x: 120, y: 624 },
        1_000 + index * 500,
      );
    }

    expect(report.evaluationStatus).toBe('repeated-death');
    expect(report.automationDeaths).toBe(3);
  });

  it('5 秒没有足够横向进展后判断为卡住', () => {
    let report = startAutomation(1_000, 100);
    report = reducePlaytestReport(
      report,
      { type: 'position', x: 131, y: 400 },
      6_000,
    );

    expect(report.evaluationStatus).toBe('stuck');
  });

  it('横向移动达到 32 像素会重新计算卡住时间', () => {
    let report = startAutomation(1_000, 100);
    report = reducePlaytestReport(
      report,
      { type: 'position', x: 132, y: 560 },
      5_000,
    );
    report = reducePlaytestReport(
      report,
      { type: 'position', x: 150, y: 560 },
      9_500,
    );

    expect(report.evaluationStatus).toBe('running');
    expect(report.lastProgressAt).toBe(5_000);
  });

  it('运行 30 秒未通关判断为超时，且超时优先于卡住', () => {
    const report = evaluatePlaytestResult(startAutomation(1_000), 31_000);

    expect(report.evaluationStatus).toBe('timeout');
  });

  it('没有新事件时也能计算下一次卡住或超时检查时间', () => {
    const report = startAutomation(1_000, 100);

    expect(getPlaytestEvaluationDelay(report, 2_000)).toBe(4_000);
    expect(getPlaytestEvaluationDelay(report, 6_000)).toBe(0);
    expect(
      getPlaytestEvaluationDelay(createEmptyPlaytestReport(), 6_000),
    ).toBeUndefined();
  });

  it('由外层计时器完成失败判断时会更新最终用时', () => {
    const report = evaluatePlaytestResult(startAutomation(1_000), 6_000);

    expect(report).toMatchObject({
      evaluationStatus: 'stuck',
      evaluationCompletedAt: 6_000,
      updatedAt: 6_000,
    });
  });

  it('用户停止时保留停止结论，重新开始会清空上一次结果', () => {
    let report = startAutomation(1_000, 100);
    report = reducePlaytestReport(
      report,
      {
        type: 'automation-state',
        active: false,
        action: 'idle',
        x: 120,
        y: 560,
      },
      2_000,
    );
    expect(report.evaluationStatus).toBe('stopped');

    report = reducePlaytestReport(
      report,
      {
        type: 'automation-state',
        active: true,
        action: 'move-right',
        x: 200,
        y: 560,
      },
      3_000,
    );
    expect(report).toMatchObject({
      evaluationStatus: 'running',
      automationStartedAt: 3_000,
      automationDeaths: 0,
      progressAnchorX: 200,
    });
  });

  it('自动试玩到达终点时成功结论优先，随后停止也不会覆盖', () => {
    let report = startAutomation();
    report = reducePlaytestReport(
      report,
      { type: 'completed', x: 2_240, y: 560 },
      2_000,
    );
    report = reducePlaytestReport(
      report,
      {
        type: 'automation-state',
        active: false,
        action: 'idle',
        x: 2_240,
        y: 560,
      },
      2_001,
    );

    expect(report.evaluationStatus).toBe('success');
  });

  it('终局后冻结自动试玩用时、死亡和方向无关的最远进展', () => {
    let report = startAutomation(1_000, 500);
    report = reducePlaytestReport(
      report,
      { type: 'position', x: 400, y: 560 },
      1_200,
    );
    for (let index = 1; index <= 3; index += 1) {
      report = reducePlaytestReport(
        report,
        { type: 'died', objectId: 'spike-1', x: 400, y: 624 },
        1_200 + index * 400,
      );
    }
    expect(report).toMatchObject({
      evaluationStatus: 'repeated-death',
      evaluationCompletedAt: 2_400,
      automationStartX: 500,
      automationFarthestDistance: 100,
      automationDeaths: 3,
    });

    report = reducePlaytestReport(
      report,
      { type: 'position', x: 0, y: 560 },
      8_000,
    );
    report = reducePlaytestReport(
      report,
      { type: 'died', objectId: 'spike-1', x: 0, y: 624 },
      8_100,
    );
    expect(report).toMatchObject({
      evaluationCompletedAt: 2_400,
      automationFarthestDistance: 100,
      automationDeaths: 3,
    });
  });
});

function startAutomation(startedAt = 1_000, x = 100) {
  return reducePlaytestReport(
    createEmptyPlaytestReport(),
    {
      type: 'automation-state',
      active: true,
      action: 'move-right',
      x,
      y: 560,
    },
    startedAt,
  );
}

function envelope(event: unknown): unknown {
  return {
    source: 'liimit.ai',
    channel: 'playtest',
    version: 1,
    event,
  };
}
