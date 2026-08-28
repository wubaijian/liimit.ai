export interface GameInfo {
  version: 1;
  title: string;
  subtitle: string;
}

export const GAME_TITLE_MAX_LENGTH = 40;
export const GAME_SUBTITLE_MAX_LENGTH = 100;

export const DEFAULT_GAME_INFO: GameInfo = {
  version: 1,
  title: '我的横版冒险',
  subtitle: '收集金币，躲避危险，抵达每一关的终点。',
};

export function parseGameInfo(value: unknown): GameInfo {
  if (!value || typeof value !== 'object') {
    throw new Error('游戏信息无效。');
  }
  const candidate = value as Partial<GameInfo>;
  if (candidate.version !== 1) {
    throw new Error('游戏信息版本无效。');
  }
  return {
    version: 1,
    title: parseText(candidate.title, '游戏名称', GAME_TITLE_MAX_LENGTH),
    subtitle: parseText(
      candidate.subtitle,
      '一句话简介',
      GAME_SUBTITLE_MAX_LENGTH,
    ),
  };
}

function parseText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}不能为空。`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`${label}不能超过 ${maxLength} 个字。`);
  }
  return text;
}
