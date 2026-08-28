import {
  createDefaultLevelDocument,
  parseLevelDocument,
  type LevelDocument,
} from './levelDocument.js';

export const LEVEL_CAMPAIGN_VERSION = 1 as const;
export const MAX_CAMPAIGN_LEVELS = 30;

export interface PlayerAbilities {
  moveSpeed: number;
  jumpPower: number;
  doubleJumpEnabled: boolean;
  doubleJumpPower: number;
}

export const DEFAULT_PLAYER_ABILITIES: PlayerAbilities = {
  moveSpeed: 240,
  jumpPower: 620,
  doubleJumpEnabled: false,
  doubleJumpPower: 560,
};

export interface CampaignLevel {
  id: string;
  name: string;
  document: LevelDocument;
  abilities: PlayerAbilities;
}

export interface LevelCampaign {
  version: typeof LEVEL_CAMPAIGN_VERSION;
  levels: CampaignLevel[];
}

const LEVEL_ID_PATTERN = /^level-[1-9][0-9]{0,2}$/;

export function createDefaultLevelCampaign(
  firstLevel: LevelDocument = createDefaultLevelDocument(),
): LevelCampaign {
  return {
    version: LEVEL_CAMPAIGN_VERSION,
    levels: [
      {
        id: 'level-1',
        name: '第 1 关',
        document: parseLevelDocument(firstLevel),
        abilities: { ...DEFAULT_PLAYER_ABILITIES },
      },
    ],
  };
}

export function parseLevelCampaign(value: unknown): LevelCampaign {
  if (!isPlainObject(value)) invalid('关卡集必须是对象');
  assertExactKeys(value, ['version', 'levels']);
  if (value.version !== LEVEL_CAMPAIGN_VERSION) {
    invalid(`只支持关卡集版本 ${LEVEL_CAMPAIGN_VERSION}`);
  }
  if (!Array.isArray(value.levels) || value.levels.length === 0) {
    invalid('游戏至少需要一关');
  }
  if (value.levels.length > MAX_CAMPAIGN_LEVELS) {
    invalid(`一个游戏最多支持 ${MAX_CAMPAIGN_LEVELS} 关`);
  }
  const ids = new Set<string>();
  const levels = value.levels.map((candidate, index) => {
    if (!isPlainObject(candidate)) invalid(`第 ${index + 1} 个关卡无效`);
    assertCampaignLevelKeys(candidate, `第 ${index + 1} 个关卡`);
    if (
      typeof candidate.id !== 'string' ||
      !LEVEL_ID_PATTERN.test(candidate.id)
    ) {
      invalid(`第 ${index + 1} 个关卡编号无效`);
    }
    if (ids.has(candidate.id)) invalid(`关卡编号重复：${candidate.id}`);
    ids.add(candidate.id);
    if (
      typeof candidate.name !== 'string' ||
      candidate.name.trim().length === 0 ||
      candidate.name.length > 40
    ) {
      invalid(`第 ${index + 1} 个关卡名称无效`);
    }
    return {
      id: candidate.id,
      name: candidate.name.trim(),
      document: parseLevelDocument(candidate.document),
      abilities:
        candidate.abilities === undefined
          ? { ...DEFAULT_PLAYER_ABILITIES }
          : parsePlayerAbilities(candidate.abilities),
    };
  });
  return { version: LEVEL_CAMPAIGN_VERSION, levels };
}

export function addCampaignLevel(
  campaignValue: unknown,
  sourceLevelId?: string,
): LevelCampaign {
  const campaign = parseLevelCampaign(campaignValue);
  if (campaign.levels.length >= MAX_CAMPAIGN_LEVELS) {
    invalid(`一个游戏最多支持 ${MAX_CAMPAIGN_LEVELS} 关`);
  }
  const source = sourceLevelId
    ? campaign.levels.find((level) => level.id === sourceLevelId)
    : undefined;
  if (sourceLevelId && !source) invalid('要复制的关卡不存在');
  const id = nextLevelId(campaign.levels.map((level) => level.id));
  const nextNumber = campaign.levels.length + 1;
  return parseLevelCampaign({
    ...campaign,
    levels: [
      ...campaign.levels,
      {
        id,
        name: `第 ${nextNumber} 关`,
        document: structuredClone(
          source?.document ?? createDefaultLevelDocument(),
        ),
        abilities: structuredClone(
          source?.abilities ?? DEFAULT_PLAYER_ABILITIES,
        ),
      },
    ],
  });
}

export function parsePlayerAbilities(value: unknown): PlayerAbilities {
  if (!isPlainObject(value)) invalid('角色能力必须是对象');
  assertExactKeys(
    value,
    ['moveSpeed', 'jumpPower', 'doubleJumpEnabled', 'doubleJumpPower'],
    '角色能力',
  );
  assertNumberInRange(value.moveSpeed, 120, 420, '移动速度');
  assertNumberInRange(value.jumpPower, 400, 850, '第一次跳跃高度');
  if (typeof value.doubleJumpEnabled !== 'boolean') {
    invalid('二连跳开关必须是真或假');
  }
  assertNumberInRange(value.doubleJumpPower, 350, 800, '第二次跳跃高度');
  return {
    moveSpeed: value.moveSpeed,
    jumpPower: value.jumpPower,
    doubleJumpEnabled: value.doubleJumpEnabled,
    doubleJumpPower: value.doubleJumpPower,
  };
}

function assertCampaignLevelKeys(
  value: Record<string, unknown>,
  label: string,
): void {
  const keys = Object.keys(value).sort();
  const legacyKeys = ['document', 'id', 'name'];
  const currentKeys = ['abilities', 'document', 'id', 'name'];
  if (
    keys.join('|') !== legacyKeys.join('|') &&
    keys.join('|') !== currentKeys.join('|')
  ) {
    invalid(`${label}字段不完整或包含未支持的内容`);
  }
}

function assertNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(`${label}必须在 ${minimum} 到 ${maximum} 之间`);
  }
}

function nextLevelId(ids: string[]): string {
  for (let index = 1; index <= MAX_CAMPAIGN_LEVELS + 1; index += 1) {
    const id = `level-${index}`;
    if (!ids.includes(id)) return id;
  }
  throw new Error('无法分配新关卡编号。');
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: string[],
  label = '关卡集',
): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) invalid(`${label}包含未支持的字段：${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) invalid(`${label}缺少字段：${key}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function invalid(message: string): never {
  throw new Error(`关卡集数据无效：${message}。`);
}
