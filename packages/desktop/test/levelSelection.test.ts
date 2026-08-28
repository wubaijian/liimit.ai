import { describe, expect, it } from 'vitest';
import {
  getContinueLevelIndex,
  getLevelSelectionPage,
  LEVELS_PER_SELECTION_PAGE,
} from '../../../agent-test/templates/modules/platformer/src/levelSelection.js';

const levels = Array.from({ length: 8 }, (_, index) => ({
  id: `level-${index + 1}`,
  name: `第 ${index + 1} 关`,
}));

describe('玩家关卡选择', () => {
  it('根据已通关记录找到玩家应该继续的关卡', () => {
    expect(getContinueLevelIndex(levels, {})).toBeUndefined();
    expect(
      getContinueLevelIndex(levels, {
        'level-1': { bestStars: 3, fewestDeaths: 0 },
        'level-2': { bestStars: 2, fewestDeaths: 1 },
      }),
    ).toBe(2);
    expect(
      getContinueLevelIndex(
        levels,
        Object.fromEntries(
          levels.map((level) => [level.id, { bestStars: 3, fewestDeaths: 0 }]),
        ),
      ),
    ).toBe(levels.length - 1);
  });

  it('第一关默认开放，后续关卡在上一关通关后开放', () => {
    const firstPage = getLevelSelectionPage(levels, {}, 0);
    expect(firstPage.entries.map((entry) => entry.unlocked)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);

    const progressed = getLevelSelectionPage(
      levels,
      {
        'level-1': { bestStars: 3, fewestDeaths: 0 },
        'level-2': { bestStars: 2, fewestDeaths: 1 },
      },
      0,
    );
    expect(progressed.entries[1]).toMatchObject({
      unlocked: true,
      best: { bestStars: 2, fewestDeaths: 1 },
    });
    expect(progressed.entries[2]?.unlocked).toBe(true);
    expect(progressed.entries[3]?.unlocked).toBe(false);
  });

  it('每页最多显示六关并限制错误页码', () => {
    expect(LEVELS_PER_SELECTION_PAGE).toBe(6);
    expect(getLevelSelectionPage(levels, {}, 0)).toMatchObject({
      page: 0,
      pageCount: 2,
    });
    expect(getLevelSelectionPage(levels, {}, 0).entries).toHaveLength(6);
    expect(getLevelSelectionPage(levels, {}, 99)).toMatchObject({
      page: 1,
      entries: [{ id: 'level-7' }, { id: 'level-8' }],
    });
    expect(getLevelSelectionPage(levels, {}, -8).page).toBe(0);
  });
});
