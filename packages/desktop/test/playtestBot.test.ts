import { describe, expect, it } from 'vitest';
import { decideBasicPlaytestAction } from '../../../agent-test/templates/modules/platformer/src/playtestBot.js';

const ground = {
  type: 'platform' as const,
  x: 0,
  y: 656,
  width: 2_400,
  height: 64,
};

describe('固定基础试玩机器人', () => {
  it('根据终点方向向右或向左移动', () => {
    expect(decide({ playerX: 1_200, goalX: 2_000 }).action).toBe('move-right');
    expect(decide({ playerX: 1_200, goalX: 20 }).action).toBe('move-left');
  });

  it.each([
    { type: 'spike' as const, x: 220, y: 624, width: 32, height: 32 },
    { type: 'platform' as const, x: 220, y: 560, width: 96, height: 32 },
    {
      type: 'moving-platform' as const,
      x: 220,
      y: 560,
      width: 96,
      height: 32,
    },
    { type: 'pit' as const, x: 220, y: 656, width: 96, height: 64 },
  ])('对前方 $type 执行跳跃', (object) => {
    expect(decide({ objects: [ground, object] })).toMatchObject({
      action: 'jump',
      jump: true,
    });
  });

  it('接近当前平台边缘时执行跳跃', () => {
    expect(
      decide({
        playerX: 250,
        objects: [{ ...ground, width: 320 }],
      }),
    ).toMatchObject({ action: 'jump', jump: true });
  });

  it('接近放在高处的终点时执行跳跃', () => {
    expect(
      decide({
        playerX: 1_900,
        goalX: 2_080,
        objects: [
          ground,
          { type: 'goal', x: 2_048, y: 304, width: 64, height: 96 },
        ],
      }),
    ).toMatchObject({ action: 'jump', jump: true });
  });

  it('在空中或跳跃冷却期间不会重复跳跃', () => {
    const spike = {
      type: 'spike' as const,
      x: 220,
      y: 624,
      width: 32,
      height: 32,
    };
    expect(decide({ onGround: false, objects: [ground, spike] }).jump).toBe(
      false,
    );
    expect(
      decide({ now: 1_000, lastJumpAt: 700, objects: [ground, spike] }).jump,
    ).toBe(false);
  });

  it('忽略身后的障碍和金币', () => {
    expect(
      decide({
        objects: [
          ground,
          { type: 'spike', x: 20, y: 624, width: 32, height: 32 },
          { type: 'coin', x: 220, y: 512, width: 32, height: 32 },
        ],
      }),
    ).toMatchObject({ action: 'move-right', jump: false });
  });
});

function decide(
  overrides: Partial<Parameters<typeof decideBasicPlaytestAction>[0]> = {},
) {
  return decideBasicPlaytestAction({
    playerX: 100,
    feetY: 656,
    goalX: 2_000,
    onGround: true,
    now: 1_000,
    lastJumpAt: Number.NEGATIVE_INFINITY,
    objects: [ground],
    ...overrides,
  });
}
