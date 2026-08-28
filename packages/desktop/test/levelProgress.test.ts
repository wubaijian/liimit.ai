import { describe, expect, it, vi } from 'vitest';
import {
  LEVEL_PROGRESS_STORAGE_KEY,
  loadLevelProgress,
  saveLevelResult,
  type ProgressStorage,
} from '../../../agent-test/templates/modules/platformer/src/levelProgress.js';

describe('本地通关记录', () => {
  it('第一次通关会保存星级和最少死亡次数', () => {
    const storage = createStorage();

    expect(saveLevelResult(storage, 'level-1', 2, 2)).toEqual({
      best: { bestStars: 2, fewestDeaths: 2 },
      improved: true,
      persisted: true,
    });
    expect(loadLevelProgress(storage)).toEqual({
      'level-1': { bestStars: 2, fewestDeaths: 2 },
    });
  });

  it('只保留更高星级和更少死亡次数', () => {
    const storage = createStorage();
    saveLevelResult(storage, 'level-1', 2, 3);

    expect(saveLevelResult(storage, 'level-1', 1, 5).improved).toBe(false);
    expect(saveLevelResult(storage, 'level-1', 3, 4)).toMatchObject({
      best: { bestStars: 3, fewestDeaths: 3 },
      improved: true,
    });
    expect(saveLevelResult(storage, 'level-1', 2, 0)).toMatchObject({
      best: { bestStars: 3, fewestDeaths: 0 },
      improved: true,
    });
  });

  it('损坏、超大和无法读写的浏览器记录不会让游戏崩溃', () => {
    const brokenRead: ProgressStorage = {
      getItem: () => '{wrong',
      setItem: vi.fn(),
    };
    expect(loadLevelProgress(brokenRead)).toEqual({});

    const brokenWrite: ProgressStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(saveLevelResult(brokenWrite, 'level-1', 99, -10)).toEqual({
      best: { bestStars: 3, fewestDeaths: 0 },
      improved: true,
      persisted: false,
    });
  });

  it('忽略伪造的关卡编号和错误成绩字段', () => {
    const storage = createStorage();
    storage.setItem(
      LEVEL_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        '../secret': { bestStars: 3, fewestDeaths: 0 },
        'level-1': { bestStars: 8, fewestDeaths: -1 },
        'level-2': { bestStars: 2, fewestDeaths: 4 },
      }),
    );

    expect(loadLevelProgress(storage)).toEqual({
      'level-2': { bestStars: 2, fewestDeaths: 4 },
    });
  });
});

function createStorage(): ProgressStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
