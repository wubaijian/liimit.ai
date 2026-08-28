import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_ABILITIES,
  addCampaignLevel,
  createDefaultLevelCampaign,
  parseLevelCampaign,
  parsePlayerAbilities,
} from '../src/shared/levelCampaign.js';

describe('多关卡数据', () => {
  it('从一张可玩关卡开始', () => {
    const campaign = createDefaultLevelCampaign();

    expect(campaign.levels).toHaveLength(1);
    expect(campaign.levels[0]?.id).toBe('level-1');
    expect(campaign.levels[0]?.name).toBe('第 1 关');
    expect(campaign.levels[0]?.abilities).toEqual(DEFAULT_PLAYER_ABILITIES);
  });

  it('可以新增空白关卡或复制当前关卡', () => {
    const first = createDefaultLevelCampaign();
    const blank = addCampaignLevel(first);
    const copied = addCampaignLevel(blank, 'level-1');

    expect(blank.levels.map((level) => level.name)).toEqual([
      '第 1 关',
      '第 2 关',
    ]);
    expect(copied.levels).toHaveLength(3);
    expect(copied.levels[2]?.document).toEqual(copied.levels[0]?.document);
    expect(copied.levels[2]?.document).not.toBe(copied.levels[0]?.document);
    expect(copied.levels[2]?.abilities).toEqual(copied.levels[0]?.abilities);
    expect(copied.levels[2]?.abilities).not.toBe(copied.levels[0]?.abilities);
  });

  it('兼容没有角色能力的旧关卡，并严格检查新设置', () => {
    const legacy = createDefaultLevelCampaign();
    const legacyLevel = { ...legacy.levels[0] } as Partial<
      (typeof legacy.levels)[number]
    >;
    delete legacyLevel.abilities;

    expect(
      parseLevelCampaign({ ...legacy, levels: [legacyLevel] }).levels[0]
        ?.abilities,
    ).toEqual(DEFAULT_PLAYER_ABILITIES);
    expect(() =>
      parsePlayerAbilities({
        ...DEFAULT_PLAYER_ABILITIES,
        moveSpeed: 999,
      }),
    ).toThrow('移动速度');
  });

  it('拒绝空关卡集、重复编号和损坏关卡', () => {
    expect(() => parseLevelCampaign({ version: 1, levels: [] })).toThrow(
      '至少需要一关',
    );
    const campaign = createDefaultLevelCampaign();
    expect(() =>
      parseLevelCampaign({
        ...campaign,
        levels: [...campaign.levels, campaign.levels[0]],
      }),
    ).toThrow('关卡编号重复');
    const broken = structuredClone(campaign);
    broken.levels[0]!.document.objects =
      broken.levels[0]!.document.objects.filter(
        (object) => object.type !== 'goal',
      );
    expect(() => parseLevelCampaign(broken)).toThrow('终点');
  });
});
