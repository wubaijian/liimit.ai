import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_PREFERENCES,
  getNextSoundVolume,
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

  it('保存并重新读取全部游戏设置', () => {
    const storage = createStorage();
    saveGamePreferences(storage, {
      showGrid: false,
      showControlHints: false,
      soundEnabled: false,
      soundVolume: 0.5,
    });
    expect(storage.read()).toContain('"showGrid":false');
    expect(loadGamePreferences(storage)).toEqual({
      showGrid: false,
      showControlHints: false,
      soundEnabled: false,
      soundVolume: 0.5,
    });
  });

  it('兼容旧版记录并为声音设置补充默认值', () => {
    const storage = createStorage(
      JSON.stringify({ showGrid: false, showControlHints: false }),
    );
    expect(loadGamePreferences(storage)).toEqual({
      showGrid: false,
      showControlHints: false,
      soundEnabled: true,
      soundVolume: 1,
    });
  });

  it('拒绝非法声音设置并按四档循环音量', () => {
    const storage = createStorage(
      JSON.stringify({ soundEnabled: 'yes', soundVolume: 0.6 }),
    );
    expect(loadGamePreferences(storage).soundEnabled).toBe(true);
    expect(loadGamePreferences(storage).soundVolume).toBe(1);
    expect(getNextSoundVolume(0.25)).toBe(0.5);
    expect(getNextSoundVolume(0.5)).toBe(0.75);
    expect(getNextSoundVolume(0.75)).toBe(1);
    expect(getNextSoundVolume(1)).toBe(0.25);
  });
});
