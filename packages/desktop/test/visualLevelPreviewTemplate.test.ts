import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  LEVEL_OBJECT_TYPES,
  createDefaultLevelDocument,
  parseLevelDocument,
} from '../src/shared/levelDocument.js';
import { parseLevelCampaign } from '../src/shared/levelCampaign.js';

const platformerTemplate = new URL(
  '../../../agent-test/templates/modules/platformer/src/',
  import.meta.url,
);
const coreTemplate = new URL(
  '../../../agent-test/templates/core/',
  import.meta.url,
);

describe('fixed visual level preview template', () => {
  it('ships the same valid default level as the editor', async () => {
    const [source, campaignSource] = await Promise.all([
      readFile(new URL('level.json', platformerTemplate), 'utf8'),
      readFile(new URL('levels.json', platformerTemplate), 'utf8'),
    ]);

    expect(parseLevelDocument(JSON.parse(source))).toEqual(
      createDefaultLevelDocument(),
    );
    expect(
      parseLevelCampaign(JSON.parse(campaignSource)).levels[0]?.document,
    ).toEqual(createDefaultLevelDocument());
  });

  it('starts the fixed playable scene from the Phaser entry', async () => {
    const source = await readFile(
      new URL('main.ts', platformerTemplate),
      'utf8',
    );

    expect(source).toContain('import { VisualLevelScene }');
    expect(source).toContain('scene: [VisualLevelScene]');
  });

  it('loads fresh preview data with a bundled fallback and renders every editor object type', async () => {
    const source = await readFile(
      new URL('scenes/VisualLevelScene.ts', platformerTemplate),
      'utf8',
    );

    expect(source).toContain("'/__liimit/levels.json'");
    expect(source).toContain("'/__liimit/game-info.json'");
    expect(source).toContain("import bundledLevel from '../level.json'");
    expect(source).toContain("import bundledCampaign from '../levels.json'");
    for (const objectType of LEVEL_OBJECT_TYPES) {
      expect(source).toContain(`object.type === '${objectType}'`);
    }
    expect(source).toContain('this.scene.restart()');
    expect(source).toContain("this.registry.set('liimitCurrentLevelIndex'");
    expect(source).toContain('全部关卡完成！');
    expect(source).toContain('this.levelIndex + 1');
    expect(source).toContain("addKeys('W,A,D')");
    expect(source).toContain("type: 'started'");
    expect(source).toContain("type: 'level-started'");
    expect(source).toContain("type: 'position'");
    expect(source).toContain("type: 'jumped'");
    expect(source).toContain("type: 'coin-collected'");
    expect(source).toContain("type: 'died'");
    expect(source).toContain("type: 'completed'");
    expect(source).toContain("type: 'automation-state'");
    expect(source).toContain("setData('levelObjectId', object.id)");
    expect(source).toContain('PLAYTEST_POSITION_INTERVAL_MS = 250');
    expect(source).toContain('window.parent.postMessage');
    expect(source).toContain('message.source !== window.parent');
    expect(source).toContain("channel !== 'playtest-control'");
    expect(source).toContain("this.registry.set('liimitAutoPlayActive'");
    expect(source).toContain('this.updateAutoPlay(body)');
    expect(source).toContain('decideBasicPlaytestAction');
    expect(source).toContain('this.abilities.moveSpeed');
    expect(source).toContain('this.abilities.jumpPower');
    expect(source).toContain('this.abilities.doubleJumpPower');
    expect(source).toContain('shouldUseAirJump');
    expect(source).toContain('this.hasUsedAirJump = true');
    expect(source).toContain('elevatedGoalAhead');
    expect(source).toContain('splitPlatformAroundPits');
    expect(source).toContain('restartIfPlayerFellIntoPit');
    expect(source).toContain('restartIfPlayerFellOutOfBounds');
    expect(source).toContain("this.handleDeath('fall')");
    expect(source).toContain('setBoundsCollision(true, true, true, false)');
    expect(source).toContain('getRequestedStartLevelIndex');
    expect(source).toContain("'liimitStartLevel'");
    expect(source).toContain("this.registry.set('liimitStartLevelApplied'");
    expect(source).toContain('addMovingPlatform');
    expect(source).toContain('updateMovingPlatforms');
    expect(source).toContain('addEnemy');
    expect(source).toContain('updateEnemies');
    expect(source).toContain("object.type === 'slime'");
    expect(source).toContain("object.type === 'bee'");
    expect(source).toContain("axis: 'horizontal' as const");
    expect(source).toContain("movement.axis === 'horizontal'");
    expect(source).toContain('movement.distance');
    expect(source).toContain('movement.speed');
    expect(source).toContain('addCheckpoint');
    expect(source).toContain('activateCheckpoint');
    expect(source).toContain('`liimitCheckpoint:${campaignLevel.id}`');
    expect(source).toContain(
      'this.registry.remove(this.checkpointRegistryKey)',
    );
    expect(source).toContain('检查点已激活！死亡后从这里继续');
    expect(source).toContain('MAX_PLAYER_LIVES');
    expect(source).toContain('handleDeath');
    expect(source).toContain('生命用完');
    expect(source).toContain('本关死亡：');
    expect(source).toContain('getLevelStarRating');
    expect(source).toContain('loadLevelProgress');
    expect(source).toContain('saveLevelResult');
    expect(source).toContain('历史最佳：尚未通关');
    expect(source).toContain('新纪录！');
    expect(source).toContain('getLevelSelectionPage');
    expect(source).toContain('showLevelSelection');
    expect(source).toContain('liimitLevelSelectionHandled');
    expect(source).toContain('bundledGameInfo');
    expect(source).toContain('LIVE_GAME_INFO_CACHE_KEY');
    expect(source).toContain('showMainMenu');
    expect(source).toContain('liimitMainMenuHandled');
    expect(source).toContain('开始游戏');
    expect(source).toContain('继续游戏（暂无进度）');
    expect(source).toContain('操作说明');
    expect(source).toContain('游戏设置');
    expect(source).toContain('返回游戏首页');
    expect(source).toContain('loadGamePreferences');
    expect(source).toContain('this.preferences.showGrid');
    expect(source).toContain('this.preferences.showControlHints');
    expect(source).toContain('返回关卡选择');
    expect(source).toContain('需要先通关上一关');
    expect(source).toContain('togglePauseMenu');
    expect(source).toContain('游戏已暂停');
    expect(source).toContain('继续游戏');
    expect(source).toContain('重新开始本关');
    expect(source).toContain('showLevelSettlement');
    expect(source).toContain('进入下一关');
    expect(source).toContain('再玩一次');
    expect(source).toContain('AI 正在进入下一关…');
    expect(source).toContain('advanceToNextLevel');
    expect(source).toContain('replayCompletedLevel');
    expect(source).toContain('LEVELS_PER_SELECTION_PAGE');
    expect(source).toContain('this.pauseButton?.setVisible(!active)');
    expect(source).toContain(
      'active && (this.mainMenuOpen || this.levelSelectionOpen)',
    );
    expect(source).toContain('getPlaytestObjects');
    expect(source).toContain(
      'this.physics.add.collider(this.player, movingPlatformGroup)',
    );
    expect(source).toContain('this.scene.restart()');
    expect(
      source.indexOf("this.emitPlaytestEvent({ type: 'completed'"),
    ).toBeLessThan(
      source.indexOf("this.registry.set('liimitAutoPlayActive', false)"),
    );
  });

  it('keeps the deterministic basic playtest robot in a protected helper', async () => {
    const source = await readFile(
      new URL('playtestBot.ts', platformerTemplate),
      'utf8',
    );

    expect(source).toContain('decideBasicPlaytestAction');
    expect(source).toContain("? 'move-left' : 'move-right'");
    expect(source).toContain("object.type !== 'spike'");
    expect(source).toContain("object.type !== 'platform'");
    expect(source).toContain('edgeDistance <= 100');
  });

  it('lets the game Agent update editor-visible campaign data while preserving the fixed entry', async () => {
    const prompt = await readFile(
      new URL('../../../agent-test/prompts/custom.md', import.meta.url),
      'utf8',
    );

    expect(prompt).toContain('Agent 可受控编辑 `src/levels.json`');
    expect(prompt).toContain('`slime`、`bee`');
    expect(prompt).toContain('只修改用户指定的关卡');
    expect(prompt).toContain('局部关卡修改禁止改动');
    expect(prompt).toContain('`src/level.json` 是旧项目的第一关兼容文件');
    expect(prompt).toContain('不得通过运行时注入');
    expect(prompt).toContain('不得删除或替换 `scene: [VisualLevelScene]`');
    expect(prompt).toContain('/__liimit/levels.json');
    expect(prompt).toContain('`started`、`position`、`jumped`');
    expect(prompt).toContain('`coin-collected`、`died` 和 `completed`');
    expect(prompt).toContain('`automation-state` 状态事件');
    expect(prompt).toContain('`src/playtestBot.ts`');
    expect(prompt).toContain('`src/gamePreferences.ts`');
    expect(prompt).toContain('`src/gameInfo.json`');
    expect(prompt).toContain('正式玩家游戏首页');
  });

  it('ships editable player-facing game information', async () => {
    const source = await readFile(
      new URL('gameInfo.json', platformerTemplate),
      'utf8',
    );
    const gameInfo = JSON.parse(source) as Record<string, unknown>;

    expect(gameInfo).toMatchObject({
      version: 1,
      title: '我的横版冒险',
      subtitle: '收集金币，躲避危险，抵达每一关的终点。',
    });
  });

  it('does not reference image or font files that are absent from the fixed template', async () => {
    const [styles, tailwindConfig] = await Promise.all([
      readFile(new URL('src/styles/tailwind.css', coreTemplate), 'utf8'),
      readFile(new URL('tailwind.config.js', coreTemplate), 'utf8'),
    ]);

    expect(styles).not.toContain("url('/assets/");
    expect(tailwindConfig).not.toContain('url("/assets/');
    expect(tailwindConfig).toContain("retro: ['Courier New'");
    expect(tailwindConfig).toContain(
      "border: '3px solid rgba(255, 255, 255, 0.18)'",
    );
  });

  it('separates the platformer game code from the Arcade-only Phaser engine build', async () => {
    const viteConfig = await readFile(
      new URL('vite.config.js', coreTemplate),
      'utf8',
    );

    expect(viteConfig).toContain('phaser/dist/phaser-arcade-physics.js');
    expect(viteConfig).toContain("phaser: ['phaser']");
    expect(viteConfig).toContain('chunkSizeWarningLimit: 1400');
  });
});
