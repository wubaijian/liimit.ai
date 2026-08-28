import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_INFO,
  GAME_SUBTITLE_MAX_LENGTH,
  GAME_TITLE_MAX_LENGTH,
  parseGameInfo,
} from '../src/shared/gameInfo.js';

describe('玩家游戏信息', () => {
  it('接受默认内容并清理用户输入两端的空格', () => {
    expect(parseGameInfo(DEFAULT_GAME_INFO)).toEqual(DEFAULT_GAME_INFO);
    expect(
      parseGameInfo({
        version: 1,
        title: '  我的游戏  ',
        subtitle: '  走到终点。  ',
      }),
    ).toEqual({
      version: 1,
      title: '我的游戏',
      subtitle: '走到终点。',
    });
  });

  it('拒绝空内容、错误版本和超出字数限制的内容', () => {
    expect(() =>
      parseGameInfo({ version: 1, title: '', subtitle: '简介' }),
    ).toThrow('游戏名称不能为空');
    expect(() =>
      parseGameInfo({ version: 2, title: '名称', subtitle: '简介' }),
    ).toThrow('版本无效');
    expect(() =>
      parseGameInfo({
        version: 1,
        title: '名'.repeat(GAME_TITLE_MAX_LENGTH + 1),
        subtitle: '简介',
      }),
    ).toThrow(`不能超过 ${GAME_TITLE_MAX_LENGTH} 个字`);
    expect(() =>
      parseGameInfo({
        version: 1,
        title: '名称',
        subtitle: '介'.repeat(GAME_SUBTITLE_MAX_LENGTH + 1),
      }),
    ).toThrow(`不能超过 ${GAME_SUBTITLE_MAX_LENGTH} 个字`);
  });
});
