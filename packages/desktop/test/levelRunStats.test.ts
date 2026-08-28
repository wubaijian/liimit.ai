import { describe, expect, it } from 'vitest';
import {
  formatStarRating,
  getDeathOutcome,
  getLevelStarRating,
  MAX_PLAYER_LIVES,
} from '../../../agent-test/templates/modules/platformer/src/levelRunStats.js';

describe('关卡生命和结算规则', () => {
  it('默认有三条生命，前两次死亡继续从复活点开始', () => {
    expect(MAX_PLAYER_LIVES).toBe(3);
    expect(getDeathOutcome(3)).toEqual({
      remainingLives: 2,
      restartFromBeginning: false,
    });
    expect(getDeathOutcome(2)).toEqual({
      remainingLives: 1,
      restartFromBeginning: false,
    });
  });

  it('最后一条生命用完后补满生命并从本关开头开始', () => {
    expect(getDeathOutcome(1)).toEqual({
      remainingLives: 3,
      restartFromBeginning: true,
    });
  });

  it('根据死亡次数给出三星、二星或一星', () => {
    expect(getLevelStarRating(0)).toBe(3);
    expect(getLevelStarRating(1)).toBe(2);
    expect(getLevelStarRating(2)).toBe(2);
    expect(getLevelStarRating(3)).toBe(1);
    expect(formatStarRating(3)).toBe('★★★');
    expect(formatStarRating(2)).toBe('★★☆');
    expect(formatStarRating(1)).toBe('★☆☆');
  });
});
