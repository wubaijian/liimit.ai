import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = readFileSync(
  new URL(
    '../../../agent-test/templates/modules/platformer/src/scenes/VisualLevelScene.ts',
    import.meta.url,
  ),
  'utf8',
);
const backgroundUrl = new URL(
  '../../../agent-test/templates/core/public/assets/images/fire-mountain/volcano-cavern-bg.png',
  import.meta.url,
);
const characterDirectory = new URL(
  '../../../agent-test/templates/core/public/assets/images/fire-mountain/characters/',
  import.meta.url,
);
const campaign = JSON.parse(
  readFileSync(
    new URL(
      '../../../agent-test/templates/modules/platformer/src/levels.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  levels: Array<{
    id: string;
    name: string;
    abilities: { doubleJumpEnabled: boolean };
    document: { objects: Array<{ id: string; type: string }> };
  }>;
};

describe('火山逃生原创视觉契约', () => {
  it('打包原创火山背景并保持为有效 PNG', () => {
    expect(existsSync(backgroundUrl)).toBe(true);
    const background = readFileSync(backgroundUrl);
    expect(background.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(background.length).toBeGreaterThan(100_000);
  });

  it('通过本地路径预加载背景且不依赖外部网址', () => {
    expect(scene).toContain(
      "'/assets/images/fire-mountain/volcano-cavern-bg.png'",
    );
    expect(scene).toContain('this.load.image(');
    expect(scene).toContain('this.drawGameBackground();');
    expect(scene).not.toMatch(/volcano-cavern-bg[^\n]*https?:\/\//);
  });

  it('打包北极熊、史莱姆和蜜蜂三个可平均切分的三帧动画', () => {
    for (const file of [
      'polar-bear-run-3f.png',
      'lava-slime-bounce-3f.png',
      'fire-bee-fly-3f.png',
    ]) {
      const image = readFileSync(new URL(file, characterDirectory));
      expect(image.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(image.length).toBeGreaterThan(50_000);
      expect(image.readUInt32BE(16)).toBe(724 * 3);
      expect(image.readUInt32BE(20)).toBe(724);
      expect(image[25]).toBe(6);
    }
    expect(scene).toContain('FIRE_MOUNTAIN_ANIMATION_ASSETS');
    expect(scene).toContain('this.load.spritesheet');
    expect(scene).toContain('this.createCharacterAnimations();');
    expect(scene).toContain('private updatePlayerVisual(');
    expect(scene).toContain('FIRE_MOUNTAIN_ANIMATION_ASSETS.hero.animationKey');
    expect(scene).toContain(
      'FIRE_MOUNTAIN_ANIMATION_ASSETS.slime.animationKey',
    );
    expect(scene).toContain('FIRE_MOUNTAIN_ANIMATION_ASSETS.bee.animationKey');
  });

  it('固定提供三关火山流程且逐关增加能力和敌人', () => {
    expect(campaign.levels.map((level) => level.id)).toEqual([
      'level-1',
      'level-2',
      'level-3',
    ]);
    expect(campaign.levels.map((level) => level.name)).toEqual([
      '第 1 关 · 岩浆边缘',
      '第 2 关 · 熔炉桥梁',
      '第 3 关 · 火山核心',
    ]);
    expect(campaign.levels[0]?.abilities.doubleJumpEnabled).toBe(false);
    expect(campaign.levels[1]?.abilities.doubleJumpEnabled).toBe(true);
    expect(campaign.levels[2]?.abilities.doubleJumpEnabled).toBe(true);
    expect(
      campaign.levels[1]?.document.objects.some(
        (object) => object.type === 'slime',
      ),
    ).toBe(true);
    expect(
      campaign.levels[2]?.document.objects.some(
        (object) => object.type === 'bee',
      ),
    ).toBe(true);
  });

  it('平台、岩浆、尖刺、晶石、检查点和出口共用原创配色', () => {
    expect(scene).toContain('const FIRE_MOUNTAIN_COLORS');
    expect(scene).toContain('FIRE_MOUNTAIN_COLORS.basalt');
    expect(scene).toContain('FIRE_MOUNTAIN_COLORS.mineralGold');
    expect(scene).toContain('FIRE_MOUNTAIN_COLORS.lava');
    expect(scene).toContain('FIRE_MOUNTAIN_COLORS.lavaLight');
    expect(scene).toContain('FIRE_MOUNTAIN_COLORS.iceBlue');
    expect(scene).toContain('this.add.polygon(');
  });

  it('逐关增加移动平台，并在第三关加入不可踩掉的追逐巨兽', () => {
    const movingPlatformCounts = campaign.levels.map(
      (level) =>
        level.document.objects.filter(
          (object) => object.type === 'moving-platform',
        ).length,
    );
    expect(movingPlatformCounts).toEqual([1, 3, 3]);
    expect(
      campaign.levels[2]?.document.objects.some(
        (object) => object.id === 'l3-pursuer' && object.type === 'slime',
      ),
    ).toBe(true);
    expect(scene).toContain(
      "const isPursuer = !IS_CUSTOM_GAME && object.id === 'l3-pursuer'",
    );
    expect(scene).toContain('岩浆巨兽正在追赶！不要停下！');
    expect(scene).toContain("'BOSS · 岩浆巨兽'");
    expect(scene).toContain('isPursuer ? 900');
    expect(scene).toMatch(/isPursuer\s*\?\s*level\.height \+ 128/);
    expect(scene).toContain("enemy.getData('isPursuer') === true");
    expect(scene).toContain('this.player.x - runtime.enemy.x');
    expect(scene).toContain('const track = this.add.graphics().setDepth(3)');
    expect(scene).toContain("movement.axis === 'horizontal' ? '↔' : '↕'");
    expect(scene).toContain('body.updateFromGameObject()');
    expect(scene).toContain('platform.position +');
  });
});
