import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_PREFERENCES,
  loadGamePreferences,
  saveGamePreferences,
} from '../../../agent-test/templates/modules/platformer/src/gamePreferences.js';

function createStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    },
    read: () => value,
  };
}

describe('玩家游戏设置', () => {
  it('没有保存记录或记录损坏时使用默认设置', () => {
    expect(loadGamePreferences()).toEqual(DEFAULT_GAME_PREFERENCES);
    expect(loadGamePreferences(createStorage('{bad json'))).toEqual(
      DEFAULT_GAME_PREFERENCES,
    );
  });

  it('保存并重新读取网格和操作提示开关', () => {
    const storage = createStorage();
    saveGamePreferences(storage, {
      showGrid: false,
      showControlHints: false,
    });
    expect(storage.read()).toContain('"showGrid":false');
    expect(loadGamePreferences(storage)).toEqual({
      showGrid: false,
      showControlHints: false,
    });
  });
});
