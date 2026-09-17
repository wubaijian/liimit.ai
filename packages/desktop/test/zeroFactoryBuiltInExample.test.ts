import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findZeroFactoryExampleProject,
  ZERO_FACTORY_BUILT_IN_EXAMPLE,
} from '../src/shared/builtInExamples.js';
import type { ProjectRecord } from '../src/shared/types.js';
import {
  isStarterTemplateId,
  STARTER_TEMPLATE_IDS,
} from '../src/shared/types.js';

const designUrl = new URL(
  '../../../agent-test/templates/variants/zero-factory-escape/src/factoryDesign.json',
  import.meta.url,
);
const gameInfoUrl = new URL(
  '../../../agent-test/templates/variants/zero-factory-escape/src/gameInfo.json',
  import.meta.url,
);
const campaignUrl = new URL(
  '../../../agent-test/templates/variants/zero-factory-escape/src/levels.json',
  import.meta.url,
);
const legacyLevelUrl = new URL(
  '../../../agent-test/templates/variants/zero-factory-escape/src/level.json',
  import.meta.url,
);
const assetDirectoryUrl = new URL(
  '../../../agent-test/templates/variants/zero-factory-escape/public/assets/factory/',
  import.meta.url,
);
const visualSceneUrl = new URL(
  '../../../agent-test/templates/modules/platformer/src/scenes/VisualLevelScene.ts',
  import.meta.url,
);
const appUrl = new URL('../src/renderer/App.tsx', import.meta.url);
const dialogUrl = new URL(
  '../src/renderer/components/NewProjectDialog.tsx',
  import.meta.url,
);
const assetIndexUrl = new URL(
  '../src/renderer/assets/index.ts',
  import.meta.url,
);

describe('零号工厂正式内置示例基础', () => {
  it('提供独立且受限制的固定模板身份', () => {
    expect(STARTER_TEMPLATE_IDS).toContain('zero-factory-escape');
    expect(isStarterTemplateId('zero-factory-escape')).toBe(true);
    expect(isStarterTemplateId('../../outside')).toBe(false);
    expect(ZERO_FACTORY_BUILT_IN_EXAMPLE).toMatchObject({
      id: 'zero-factory-escape',
      starterTemplateId: 'zero-factory-escape',
      name: '零号工厂逃生',
      label: '正式内置示例',
    });
  });

  it('在首页和新建窗口提供零号工厂一键打开入口', () => {
    const app = readFileSync(appUrl, 'utf8');
    const dialog = readFileSync(dialogUrl, 'utf8');
    const assetIndex = readFileSync(assetIndexUrl, 'utf8');
    expect(app).toContain('BUILT_IN_PLATFORMER_EXAMPLES.map');
    expect(app).toContain("'zero-factory-escape': zeroFactoryExample");
    expect(app).toContain('findBuiltInExampleProject(');
    expect(dialog).toContain("| 'factory-example'");
    expect(dialog).toContain('零号工厂逃生示例');
    expect(dialog).toContain('门卡、双开关和激光门三关游戏');
    expect(dialog).toContain(
      'await onOpenBuiltInExample(selectedBuiltInExample.id, directory)',
    );
    expect(assetIndex).toContain('zero-factory-background.png');
  });

  it('工作区已有零号工厂时直接找到原项目，避免重复创建', () => {
    const existing = {
      id: 'existing-zero-factory',
      name: '零号工厂逃生',
      path: '/Users/test/liimit.ai Games/零号工厂逃生',
    } as ProjectRecord;
    expect(
      findZeroFactoryExampleProject([existing], '/Users/test/liimit.ai Games/'),
    ).toBe(existing);
    expect(
      findZeroFactoryExampleProject([existing], '/Users/test/other'),
    ).toBeUndefined();
  });

  it('定义三关机关解谜结构和第一版对象边界', () => {
    expect(existsSync(designUrl)).toBe(true);
    expect(existsSync(gameInfoUrl)).toBe(true);
    const design = JSON.parse(readFileSync(designUrl, 'utf8')) as {
      levels: Array<{ id: string; name: string }>;
      plannedObjects: string[];
    };
    expect(design.levels.map((level) => level.name)).toEqual([
      '流水线车间',
      '门禁区域',
      '中央控制室',
    ]);
    expect(design.plannedObjects).toEqual([
      'keycard',
      'security-door',
      'floor-switch',
      'laser-gate',
      'factory-robot',
    ]);
  });

  it('包含独立的工厂背景、主角和巡逻机器人美术', () => {
    const design = JSON.parse(readFileSync(designUrl, 'utf8')) as {
      assets: Record<string, string>;
    };
    expect(design.assets).toEqual({
      background: '/assets/factory/zero-factory-background.png',
      player: '/assets/factory/maintenance-robot-hero.png',
      enemy: '/assets/factory/security-robot-enemy.png',
    });

    for (const fileName of [
      'zero-factory-background.png',
      'maintenance-robot-hero.png',
      'security-robot-enemy.png',
    ]) {
      const assetUrl = new URL(fileName, assetDirectoryUrl);
      expect(existsSync(assetUrl)).toBe(true);
      expect(readFileSync(assetUrl).subarray(1, 4).toString('ascii')).toBe(
        'PNG',
      );
    }
  });

  it('为主角和巡逻机器人准备可平均切分的三帧动画', () => {
    const design = JSON.parse(readFileSync(designUrl, 'utf8')) as {
      animations: Record<
        string,
        Record<
          string,
          {
            path: string;
            frames: number;
            frameWidth: number;
            frameHeight: number;
          }
        >
      >;
    };
    const animations = [
      ...Object.values(design.animations.player),
      ...Object.values(design.animations.enemy),
    ];
    expect(animations).toHaveLength(5);

    for (const animation of animations) {
      expect(animation.frames).toBe(3);
      const assetUrl = new URL(
        animation.path.split('/').at(-1)!,
        assetDirectoryUrl,
      );
      const png = readFileSync(assetUrl);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(animation.frameWidth * 3);
      expect(png.readUInt32BE(20)).toBe(animation.frameHeight);
      expect(png[25]).toBe(6);
    }
  });

  it('在工厂模板中根据移动状态自动播放角色动作', () => {
    const source = readFileSync(visualSceneUrl, 'utf8');
    expect(source).toContain("bundledGameInfo.title === '零号工厂逃生'");
    expect(source).toContain('this.load.spritesheet');
    expect(source).toContain('createCharacterAnimations');
    expect(source).toContain('heroIdle.animationKey');
    expect(source).toContain('heroRun.animationKey');
    expect(source).toContain('heroJump.textureKey');
    expect(source).toContain('enemyPatrol.animationKey');
    expect(source).toContain('enemyAlert.animationKey');
    expect(source).toContain(
      'Math.abs(this.player.x - runtime.enemy.x) <= 340',
    );
  });

  it('第一关使用独立的流水线车间布置，不再沿用火山名称', () => {
    const campaign = JSON.parse(readFileSync(campaignUrl, 'utf8')) as {
      levels: Array<{
        id: string;
        name: string;
        document: { objects: Array<{ id: string; type: string }> };
      }>;
    };
    const legacyLevel = JSON.parse(readFileSync(legacyLevelUrl, 'utf8')) as {
      objects: Array<{ id: string; type: string }>;
    };
    expect(campaign.levels).toHaveLength(3);
    expect(campaign.levels[0]?.id).toBe('level-1');
    expect(campaign.levels[0]?.name).toBe('第 1 关 · 流水线车间');
    expect(campaign.levels[0]?.document).toEqual(legacyLevel);

    const objects = campaign.levels[0]!.document.objects;
    expect(
      objects.filter((object) => object.type === 'moving-platform'),
    ).toHaveLength(3);
    expect(objects.filter((object) => object.type === 'slime')).toHaveLength(2);
    expect(objects.filter((object) => object.type === 'spike')).toHaveLength(2);
    expect(objects.filter((object) => object.type === 'pit')).toHaveLength(2);
    expect(objects.filter((object) => object.type === 'coin')).toHaveLength(6);
    expect(objects.some((object) => object.id === 'f1-checkpoint')).toBe(true);
    expect(objects.some((object) => object.id === 'f1-goal')).toBe(true);
  });

  it('第二关要求先取得蓝色门卡，再通过安全门', () => {
    const campaign = JSON.parse(readFileSync(campaignUrl, 'utf8')) as {
      levels: Array<{
        id: string;
        name: string;
        abilities: { doubleJumpEnabled: boolean };
        document: { objects: Array<{ id: string; type: string }> };
      }>;
    };
    const level = campaign.levels[1]!;
    expect(level.id).toBe('level-2');
    expect(level.name).toBe('第 2 关 · 门禁区域');
    expect(level.abilities.doubleJumpEnabled).toBe(true);
    expect(level.document.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'f2-keycard', type: 'keycard' }),
        expect.objectContaining({
          id: 'f2-security-door',
          type: 'security-door',
        }),
      ]),
    );
  });

  it('第三关要求依次启动两个开关，再关闭激光门', () => {
    const campaign = JSON.parse(readFileSync(campaignUrl, 'utf8')) as {
      levels: Array<{
        id: string;
        name: string;
        document: { objects: Array<{ id: string; type: string }> };
      }>;
    };
    const level = campaign.levels[2]!;
    expect(level.id).toBe('level-3');
    expect(level.name).toBe('第 3 关 · 中央控制室');
    expect(
      level.document.objects.filter((object) => object.type === 'floor-switch'),
    ).toHaveLength(2);
    expect(level.document.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'f3-switch-a', type: 'floor-switch' }),
        expect.objectContaining({ id: 'f3-switch-b', type: 'floor-switch' }),
        expect.objectContaining({
          id: 'f3-laser-gate',
          type: 'laser-gate',
        }),
      ]),
    );
  });

  it('工厂模式把通用物体显示为能源、机械齿轮和设备坠落区', () => {
    const source = readFileSync(visualSceneUrl, 'utf8');
    expect(source).toContain("IS_ZERO_FACTORY ? '能源' : '晶石'");
    expect(source).toContain("'⚠ 设备坠落区'");
    expect(source).toContain('private updateFactoryGears(');
    expect(source).toContain("? '中央控制台'");
    expect(source).toContain(": '升降出口'");
    expect(source).toContain('private collectKeycard(');
    expect(source).toContain('private unlockSecurityDoors(');
    expect(source).toContain('需要先找到蓝色门卡');
    expect(source).toContain('private activateFloorSwitch(');
    expect(source).toContain('private disableLaserGates(');
    expect(source).toContain('全部开关已启动，激光门已关闭');
  });
});
