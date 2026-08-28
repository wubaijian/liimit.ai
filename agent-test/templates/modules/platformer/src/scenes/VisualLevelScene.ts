import Phaser from 'phaser';
import bundledGameInfo from '../gameInfo.json';
import bundledLevel from '../level.json';
import bundledCampaign from '../levels.json';
import { decideBasicPlaytestAction } from '../playtestBot';
import {
  formatStarRating,
  getDeathOutcome,
  getLevelStarRating,
  MAX_PLAYER_LIVES,
} from '../levelRunStats';
import {
  loadLevelProgress,
  saveLevelResult,
  type LevelBestResult,
  type ProgressStorage,
} from '../levelProgress';
import {
  type GamePreferences,
  loadGamePreferences,
  saveGamePreferences,
} from '../gamePreferences';
import {
  getContinueLevelIndex,
  getLevelSelectionPage,
  LEVELS_PER_SELECTION_PAGE,
} from '../levelSelection';

const LIVE_LEVEL_CACHE_KEY = 'liimit-live-level';
const LIVE_LEVEL_URL = '/__liimit/levels.json';
const LIVE_GAME_INFO_CACHE_KEY = 'liimit-live-game-info';
const LIVE_GAME_INFO_URL = '/__liimit/game-info.json';
const PLAYTEST_POSITION_INTERVAL_MS = 250;

type LevelObjectType =
  | 'player-spawn'
  | 'platform'
  | 'moving-platform'
  | 'spike'
  | 'slime'
  | 'bee'
  | 'coin'
  | 'checkpoint'
  | 'goal'
  | 'pit';

interface LevelObject {
  id: string;
  type: LevelObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  movement?: {
    axis: 'horizontal' | 'vertical';
    distance: number;
    speed: number;
  };
}

interface LevelDocument {
  version: 1;
  width: number;
  height: number;
  gridSize: number;
  objects: LevelObject[];
}

interface PlayerAbilities {
  moveSpeed: number;
  jumpPower: number;
  doubleJumpEnabled: boolean;
  doubleJumpPower: number;
}

const DEFAULT_PLAYER_ABILITIES: PlayerAbilities = {
  moveSpeed: 240,
  jumpPower: 620,
  doubleJumpEnabled: false,
  doubleJumpPower: 560,
};

interface CampaignLevel {
  id: string;
  name: string;
  document: LevelDocument;
  abilities?: PlayerAbilities;
}

interface LevelCampaign {
  version: 1;
  levels: CampaignLevel[];
}

interface GameInfo {
  version: 1;
  title: string;
  subtitle: string;
}

interface MovingPlatformRuntime {
  objectId: string;
  rectangle: Phaser.GameObjects.Rectangle;
  axis: 'horizontal' | 'vertical';
  minimum: number;
  maximum: number;
  speed: number;
}

interface EnemyRuntime {
  objectId: string;
  enemy: Phaser.GameObjects.Ellipse;
  axis: 'horizontal' | 'vertical';
  minimum: number;
  maximum: number;
  speed: number;
}

type PlaytestEvent =
  | {
      type: 'level-started';
      levelId: string;
      levelName: string;
      levelIndex: number;
      totalLevels: number;
      x: number;
      y: number;
    }
  | { type: 'started'; x: number; y: number; totalCoins: number }
  | { type: 'position'; x: number; y: number }
  | { type: 'jumped'; x: number; y: number }
  | { type: 'coin-collected'; objectId: string; x: number; y: number }
  | { type: 'died'; objectId: string; x: number; y: number }
  | { type: 'completed'; x: number; y: number }
  | {
      type: 'automation-state';
      active: boolean;
      action: 'idle' | 'move-left' | 'move-right' | 'jump';
      x: number;
      y: number;
    };

export class VisualLevelScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'D', Phaser.Input.Keyboard.Key>;
  private remainingCoins = 0;
  private coinLabel!: Phaser.GameObjects.Text;
  private completed = false;
  private restarting = false;
  private lastPositionEventAt = 0;
  private level!: LevelDocument;
  private pits: LevelObject[] = [];
  private movingPlatforms: MovingPlatformRuntime[] = [];
  private enemies: EnemyRuntime[] = [];
  private activeCheckpointId?: string;
  private checkpointRegistryKey = '';
  private livesRegistryKey = '';
  private deathsRegistryKey = '';
  private remainingLives = MAX_PLAYER_LIVES;
  private deathCount = 0;
  private levelBest?: LevelBestResult;
  private progressStorage?: ProgressStorage;
  private preferences: GamePreferences = {
    showGrid: true,
    showControlHints: true,
  };
  private mainMenuOpen = false;
  private mainMenuObjects: Phaser.GameObjects.GameObject[] = [];
  private levelSelectionOpen = false;
  private levelSelectionObjects: Phaser.GameObjects.GameObject[] = [];
  private pauseMenuOpen = false;
  private pauseMenuObjects: Phaser.GameObjects.GameObject[] = [];
  private pauseButton?: Phaser.GameObjects.Text;
  private abilities: PlayerAbilities = { ...DEFAULT_PLAYER_ABILITIES };
  private campaign!: LevelCampaign;
  private levelIndex = 0;
  private autoPlaying = false;
  private autoAction: 'idle' | 'move-left' | 'move-right' | 'jump' = 'idle';
  private lastAutoJumpAt = Number.NEGATIVE_INFINITY;
  private autoJumpActionUntil = 0;
  private hasUsedAirJump = false;

  constructor() {
    super('Level1Scene');
  }

  preload(): void {
    this.load.json(LIVE_LEVEL_CACHE_KEY, LIVE_LEVEL_URL);
    this.load.json(LIVE_GAME_INFO_CACHE_KEY, LIVE_GAME_INFO_URL);
  }

  create(): void {
    this.remainingCoins = 0;
    this.completed = false;
    this.restarting = false;
    this.mainMenuOpen = false;
    this.mainMenuObjects = [];
    this.levelSelectionOpen = false;
    this.levelSelectionObjects = [];
    this.pauseMenuOpen = false;
    this.pauseMenuObjects = [];
    this.pauseButton = undefined;
    this.lastPositionEventAt = 0;
    this.campaign = readLevelCampaign(
      this.cache.json.get(LIVE_LEVEL_CACHE_KEY) ?? bundledCampaign,
      bundledLevel,
    );
    const storedIndex = this.registry.get('liimitCurrentLevelIndex');
    const requestedStartIndex =
      this.registry.get('liimitStartLevelApplied') === true
        ? undefined
        : getRequestedStartLevelIndex(this.campaign);
    if (requestedStartIndex !== undefined) {
      this.registry.set('liimitMainMenuHandled', true);
      this.registry.set('liimitLevelSelectionHandled', true);
    }
    this.levelIndex =
      requestedStartIndex ??
      (typeof storedIndex === 'number' &&
      storedIndex >= 0 &&
      storedIndex < this.campaign.levels.length
        ? storedIndex
        : 0);
    this.registry.set('liimitStartLevelApplied', true);
    this.registry.set('liimitCurrentLevelIndex', this.levelIndex);
    const campaignLevel = this.campaign.levels[this.levelIndex]!;
    const level = campaignLevel.document;
    this.level = level;
    this.checkpointRegistryKey = `liimitCheckpoint:${campaignLevel.id}`;
    this.livesRegistryKey = `liimitLives:${campaignLevel.id}`;
    this.deathsRegistryKey = `liimitDeaths:${campaignLevel.id}`;
    const storedCheckpointId = this.registry.get(this.checkpointRegistryKey);
    this.activeCheckpointId =
      typeof storedCheckpointId === 'string' ? storedCheckpointId : undefined;
    const storedLives = this.registry.get(this.livesRegistryKey);
    this.remainingLives =
      typeof storedLives === 'number' &&
      Number.isInteger(storedLives) &&
      storedLives >= 1 &&
      storedLives <= MAX_PLAYER_LIVES
        ? storedLives
        : MAX_PLAYER_LIVES;
    const storedDeaths = this.registry.get(this.deathsRegistryKey);
    this.deathCount =
      typeof storedDeaths === 'number' &&
      Number.isInteger(storedDeaths) &&
      storedDeaths >= 0
        ? storedDeaths
        : 0;
    this.progressStorage = getProgressStorage();
    this.preferences = loadGamePreferences(this.progressStorage);
    this.levelBest = loadLevelProgress(this.progressStorage)[campaignLevel.id];
    this.abilities = readPlayerAbilities(campaignLevel.abilities);
    this.autoPlaying = this.registry.get('liimitAutoPlayActive') === true;
    this.autoAction = 'idle';
    this.lastAutoJumpAt = Number.NEGATIVE_INFINITY;
    this.autoJumpActionUntil = 0;
    this.hasUsedAirJump = false;
    this.physics.world.setBounds(0, 0, level.width, level.height);
    this.physics.world.setBoundsCollision(true, true, true, false);
    this.cameras.main.setBounds(0, 0, level.width, level.height);
    this.cameras.main.setBackgroundColor('#14222d');

    this.add
      .rectangle(0, 0, level.width, level.height, 0x14222d)
      .setOrigin(0, 0)
      .setDepth(-10);
    if (this.preferences.showGrid) this.drawGrid(level);

    const platforms = this.physics.add.staticGroup();
    const movingPlatformGroup = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    const spikes = this.physics.add.staticGroup();
    const enemies = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    const coins = this.physics.add.staticGroup();
    const checkpoints = this.physics.add.staticGroup();
    const goals = this.physics.add.staticGroup();
    let spawn = level.objects.find((object) => object.type === 'player-spawn')!;
    this.pits = level.objects.filter((object) => object.type === 'pit');
    this.movingPlatforms = [];
    this.enemies = [];

    for (const object of level.objects) {
      if (object.type === 'player-spawn') {
        spawn = object;
      } else if (object.type === 'platform') {
        for (const segment of splitPlatformAroundPits(object, this.pits)) {
          this.addStaticRectangle(platforms, segment, 0x596d4a, 0x92b476);
        }
      } else if (object.type === 'moving-platform') {
        this.addMovingPlatform(movingPlatformGroup, object, level);
      } else if (object.type === 'spike') {
        this.addSpike(spikes, object);
      } else if (object.type === 'slime' || object.type === 'bee') {
        this.addEnemy(enemies, object, level);
      } else if (object.type === 'coin') {
        this.addCoin(coins, object);
      } else if (object.type === 'checkpoint') {
        this.addCheckpoint(checkpoints, object);
      } else if (object.type === 'goal') {
        this.addGoal(goals, object);
      } else if (object.type === 'pit') {
        this.drawPit(object);
      }
    }

    const activeCheckpoint = level.objects.find(
      (object) =>
        object.type === 'checkpoint' && object.id === this.activeCheckpointId,
    );
    if (!activeCheckpoint) this.activeCheckpointId = undefined;
    this.player = this.add.rectangle(
      activeCheckpoint
        ? activeCheckpoint.x + activeCheckpoint.width / 2
        : spawn.x + spawn.width / 2,
      activeCheckpoint
        ? activeCheckpoint.y + activeCheckpoint.height - spawn.height / 2
        : spawn.y + spawn.height / 2,
      spawn.width,
      spawn.height,
      0x70c2f2,
    );
    this.player.setStrokeStyle(3, 0xc8efff);
    this.physics.add.existing(this.player);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setCollideWorldBounds(true);
    playerBody.setMaxVelocity(320, 900);

    this.physics.add.collider(this.player, platforms);
    this.physics.add.collider(this.player, movingPlatformGroup);
    this.physics.add.overlap(this.player, coins, (_player, coinObject) => {
      const coin = coinObject as Phaser.GameObjects.GameObject;
      this.emitPlaytestEvent({
        type: 'coin-collected',
        objectId: String(coin.getData('levelObjectId')),
        ...this.playerPosition(),
      });
      coin.destroy();
      this.remainingCoins = Math.max(0, this.remainingCoins - 1);
      this.coinLabel.setText(`金币：${this.remainingCoins}`);
    });
    this.physics.add.overlap(
      this.player,
      checkpoints,
      (_player, checkpointObject) =>
        this.activateCheckpoint(
          checkpointObject as Phaser.GameObjects.Rectangle,
        ),
    );
    this.physics.add.overlap(this.player, spikes, (_player, spikeObject) => {
      if (this.restarting) return;
      const spike = spikeObject as Phaser.GameObjects.GameObject;
      this.handleDeath(String(spike.getData('levelObjectId')));
    });
    this.physics.add.overlap(this.player, enemies, (_player, enemyObject) => {
      const enemy = enemyObject as Phaser.GameObjects.Ellipse;
      if (this.restarting || !enemy.active) return;
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (body.velocity.y > 0 && this.player.y < enemy.y) {
        enemy.destroy();
        body.setVelocityY(-Math.min(this.abilities.jumpPower * 0.7, 560));
        return;
      }
      this.handleDeath(String(enemy.getData('levelObjectId')));
    });
    this.physics.add.overlap(this.player, goals, () => this.completeLevel());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,D') as Record<
      'W' | 'A' | 'D',
      Phaser.Input.Keyboard.Key
    >;
    this.input.keyboard!.on('keydown-ESC', this.togglePauseMenu);
    this.input.keyboard!.on('keydown-P', this.togglePauseMenu);
    window.addEventListener('message', this.receivePlaytestControl);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('message', this.receivePlaytestControl);
      this.input.keyboard?.off('keydown-ESC', this.togglePauseMenu);
      this.input.keyboard?.off('keydown-P', this.togglePauseMenu);
    });
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(260, 180);

    this.coinLabel = this.add
      .text(18, 16, `金币：${this.remainingCoins}`, {
        color: '#ffe08b',
        fontFamily: 'monospace',
        fontSize: '20px',
        stroke: '#081016',
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(100);
    this.add
      .text(
        18,
        44,
        `生命：${'♥'.repeat(this.remainingLives)}${'♡'.repeat(MAX_PLAYER_LIVES - this.remainingLives)}  ·  死亡：${this.deathCount}`,
        {
          color: '#ffb4b4',
          fontFamily: 'monospace',
          fontSize: '16px',
          stroke: '#081016',
          strokeThickness: 3,
        },
      )
      .setScrollFactor(0)
      .setDepth(100);
    this.add
      .text(
        this.cameras.main.width - 18,
        44,
        this.levelBest
          ? `历史最佳：${formatStarRating(this.levelBest.bestStars)} · 最少死亡 ${this.levelBest.fewestDeaths}`
          : '历史最佳：尚未通关',
        {
          color: '#bcd7e6',
          fontFamily: 'monospace',
          fontSize: '14px',
          stroke: '#081016',
          strokeThickness: 3,
        },
      )
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    if (this.preferences.showControlHints) {
      this.add
        .text(18, 70, '方向键 / A D 移动 · W / ↑ / 空格跳跃', {
          color: '#d8e5ec',
          fontFamily: 'monospace',
          fontSize: '14px',
        })
        .setScrollFactor(0)
        .setDepth(100);
    }
    this.add
      .text(
        this.cameras.main.width - 18,
        16,
        `${this.campaign.levels[this.levelIndex]!.name} / 共 ${this.campaign.levels.length} 关`,
        {
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '18px',
          stroke: '#081016',
          strokeThickness: 4,
        },
      )
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    if (!this.autoPlaying) {
      this.pauseButton = this.add
        .text(this.cameras.main.width - 18, 76, '暂停  Esc', {
          color: '#14222d',
          backgroundColor: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '15px',
          padding: { x: 12, y: 7 },
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(100)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', this.togglePauseMenu);
    }
    if (
      this.registry.get('liimitMainMenuHandled') !== true &&
      !this.autoPlaying
    ) {
      this.showMainMenu();
      return;
    }
    if (
      this.registry.get('liimitLevelSelectionHandled') !== true &&
      !this.autoPlaying
    ) {
      const requestedSelectionPage = this.registry.get(
        'liimitLevelSelectionPage',
      );
      this.showLevelSelection(
        typeof requestedSelectionPage === 'number' ? requestedSelectionPage : 0,
      );
      return;
    }
    this.emitPlaytestEvent({
      type: 'level-started',
      levelId: this.campaign.levels[this.levelIndex]!.id,
      levelName: this.campaign.levels[this.levelIndex]!.name,
      levelIndex: this.levelIndex + 1,
      totalLevels: this.campaign.levels.length,
      ...this.playerPosition(),
    });
    this.emitPlaytestEvent({
      type: 'started',
      totalCoins: this.remainingCoins,
      ...this.playerPosition(),
    });
    this.emitAutomationState();
  }

  update(): void {
    if (
      this.completed ||
      this.restarting ||
      this.mainMenuOpen ||
      this.levelSelectionOpen ||
      this.pauseMenuOpen
    )
      return;
    this.updateMovingPlatforms();
    this.updateEnemies();
    if (this.restartIfPlayerFellOutOfBounds()) return;
    if (this.restartIfPlayerFellIntoPit()) return;
    if (
      this.time.now - this.lastPositionEventAt >=
      PLAYTEST_POSITION_INTERVAL_MS
    ) {
      this.lastPositionEventAt = this.time.now;
      this.emitPlaytestEvent({ type: 'position', ...this.playerPosition() });
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down) this.hasUsedAirJump = false;
    if (this.autoPlaying) {
      this.updateAutoPlay(body);
      return;
    }
    this.updateManualControls(body);
  }

  private updateManualControls(body: Phaser.Physics.Arcade.Body): void {
    const movingLeft = this.cursors.left.isDown || this.wasd.A.isDown;
    const movingRight = this.cursors.right.isDown || this.wasd.D.isDown;
    body.setVelocityX(
      movingLeft === movingRight
        ? 0
        : movingLeft
          ? -this.abilities.moveSpeed
          : this.abilities.moveSpeed,
    );

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W);
    const canAirJump =
      this.abilities.doubleJumpEnabled &&
      !body.blocked.down &&
      !this.hasUsedAirJump;
    if (jumpPressed && (body.blocked.down || canAirJump)) {
      body.setVelocityY(
        -(body.blocked.down
          ? this.abilities.jumpPower
          : this.abilities.doubleJumpPower),
      );
      if (!body.blocked.down) this.hasUsedAirJump = true;
      this.emitPlaytestEvent({ type: 'jumped', ...this.playerPosition() });
    }
  }

  private updateAutoPlay(body: Phaser.Physics.Arcade.Body): void {
    const goal = this.level.objects.find((object) => object.type === 'goal')!;
    const goalX = goal.x + goal.width / 2;
    const decision = decideBasicPlaytestAction({
      playerX: this.player.x,
      feetY: this.player.y + this.player.height / 2,
      goalX,
      onGround: body.blocked.down,
      now: this.time.now,
      lastJumpAt: this.lastAutoJumpAt,
      objects: this.getPlaytestObjects(),
    });
    body.setVelocityX(decision.direction * this.abilities.moveSpeed);
    if (decision.jump) {
      body.setVelocityY(-this.abilities.jumpPower);
      this.lastAutoJumpAt = this.time.now;
      this.autoJumpActionUntil = this.time.now + 250;
      this.setAutoAction('jump');
      this.emitPlaytestEvent({ type: 'jumped', ...this.playerPosition() });
      return;
    }
    const shouldUseAirJump =
      this.abilities.doubleJumpEnabled &&
      !body.blocked.down &&
      !this.hasUsedAirJump &&
      this.time.now - this.lastAutoJumpAt >= 260 &&
      body.velocity.y >= -40 &&
      this.needsAutoAirJump(body, decision.direction);
    if (shouldUseAirJump) {
      body.setVelocityY(-this.abilities.doubleJumpPower);
      this.hasUsedAirJump = true;
      this.lastAutoJumpAt = this.time.now;
      this.autoJumpActionUntil = this.time.now + 250;
      this.setAutoAction('jump');
      this.emitPlaytestEvent({ type: 'jumped', ...this.playerPosition() });
      return;
    }
    this.setAutoAction(
      this.time.now < this.autoJumpActionUntil ? 'jump' : decision.action,
    );
  }

  private needsAutoAirJump(
    body: Phaser.Physics.Arcade.Body,
    direction: -1 | 1,
  ): boolean {
    if (direction > 0 ? body.blocked.right : body.blocked.left) return true;
    const projectedX = this.player.x + direction * 160;
    const feetY = this.player.y + this.player.height / 2;
    const pitBelow = this.pits.some(
      (pit) => projectedX >= pit.x && projectedX <= pit.x + pit.width,
    );
    if (pitBelow) return true;
    const elevatedGoalAhead = this.level.objects.some(
      (object) =>
        object.type === 'goal' &&
        projectedX >= object.x - 80 &&
        projectedX <= object.x + object.width + 80 &&
        object.y + object.height < feetY - 32,
    );
    if (elevatedGoalAhead) return true;
    const landingAhead = this.level.objects.some(
      (object) =>
        (object.type === 'platform' || object.type === 'moving-platform') &&
        projectedX >= object.x - 24 &&
        projectedX <= object.x + object.width + 24 &&
        object.y >= feetY - 32,
    );
    return !landingAhead;
  }

  private drawGrid(level: LevelDocument): void {
    const graphics = this.add.graphics().setDepth(-5);
    graphics.lineStyle(1, 0x6f8796, 0.14);
    for (let x = 0; x <= level.width; x += level.gridSize) {
      graphics.lineBetween(x, 0, x, level.height);
    }
    for (let y = 0; y <= level.height; y += level.gridSize) {
      graphics.lineBetween(0, y, level.width, y);
    }
  }

  private drawPit(object: LevelObject): void {
    this.add
      .rectangle(
        object.x + object.width / 2,
        object.y + object.height / 2,
        object.width,
        object.height,
        0x071018,
      )
      .setStrokeStyle(3, 0xd66559)
      .setDepth(-3);
  }

  private restartIfPlayerFellIntoPit(): boolean {
    if (this.restarting) return true;
    const feetY = this.player.y + this.player.height / 2;
    if (feetY < this.level.height - 2) return false;
    const pit = this.pits.find(
      (candidate) =>
        this.player.x >= candidate.x &&
        this.player.x <= candidate.x + candidate.width,
    );
    if (!pit) return false;
    this.handleDeath(pit.id);
    return true;
  }

  private handleDeath(objectId: string): void {
    if (this.restarting) return;
    this.restarting = true;
    this.deathCount += 1;
    this.registry.set(this.deathsRegistryKey, this.deathCount);
    const outcome = getDeathOutcome(this.remainingLives);
    this.remainingLives = outcome.remainingLives;
    this.registry.set(this.livesRegistryKey, this.remainingLives);
    this.emitPlaytestEvent({
      type: 'died',
      objectId,
      ...this.playerPosition(),
    });
    if (!outcome.restartFromBeginning) {
      this.scene.restart();
      return;
    }

    this.registry.remove(this.checkpointRegistryKey);
    this.activeCheckpointId = undefined;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.add
      .text(
        this.cameras.main.centerX,
        this.cameras.main.centerY,
        '生命用完\n本关将从头重新开始',
        {
          align: 'center',
          color: '#ffffff',
          backgroundColor: '#a33f3f',
          fontFamily: 'monospace',
          fontSize: '34px',
          padding: { x: 24, y: 16 },
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.time.delayedCall(900, () => this.scene.restart());
  }

  private addStaticRectangle(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: LevelObject,
    fill: number,
    stroke: number,
  ): void {
    const rectangle = this.add.rectangle(
      object.x + object.width / 2,
      object.y + object.height / 2,
      object.width,
      object.height,
      fill,
    );
    rectangle.setStrokeStyle(3, stroke);
    this.physics.add.existing(rectangle, true);
    group.add(rectangle);
  }

  private addMovingPlatform(
    group: Phaser.Physics.Arcade.Group,
    object: LevelObject,
    level: LevelDocument,
  ): void {
    const rectangle = this.add.rectangle(
      object.x + object.width / 2,
      object.y + object.height / 2,
      object.width,
      object.height,
      0x47798c,
    );
    rectangle.setStrokeStyle(3, 0x7bd2ea);
    rectangle.setData('levelObjectId', object.id);
    this.physics.add.existing(rectangle);
    const body = rectangle.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.pushable = false;
    const movement = object.movement ?? {
      axis: 'horizontal' as const,
      distance: level.gridSize * 4,
      speed: 90,
    };
    const travel = movement.distance;
    const halfWidth = object.width / 2;
    const halfHeight = object.height / 2;
    const center = movement.axis === 'horizontal' ? rectangle.x : rectangle.y;
    const minimum = Math.max(
      movement.axis === 'horizontal' ? halfWidth : halfHeight,
      center - travel,
    );
    const maximum = Math.min(
      movement.axis === 'horizontal'
        ? level.width - halfWidth
        : level.height - halfHeight,
      center + travel,
    );
    if (movement.axis === 'horizontal') {
      body.setVelocityX(minimum === maximum ? 0 : movement.speed);
    } else {
      body.setVelocityY(minimum === maximum ? 0 : movement.speed);
    }
    group.add(rectangle);
    this.movingPlatforms.push({
      objectId: object.id,
      rectangle,
      axis: movement.axis,
      minimum,
      maximum,
      speed: movement.speed,
    });
  }

  private updateMovingPlatforms(): void {
    for (const platform of this.movingPlatforms) {
      const body = platform.rectangle.body as Phaser.Physics.Arcade.Body;
      const position =
        platform.axis === 'horizontal'
          ? platform.rectangle.x
          : platform.rectangle.y;
      const velocity =
        position <= platform.minimum ? platform.speed : -platform.speed;
      if (position <= platform.minimum || position >= platform.maximum) {
        if (platform.axis === 'horizontal') body.setVelocityX(velocity);
        else body.setVelocityY(velocity);
      }
    }
  }

  private updateEnemies(): void {
    for (const runtime of this.enemies) {
      if (!runtime.enemy.active) continue;
      const body = runtime.enemy.body as Phaser.Physics.Arcade.Body;
      const position =
        runtime.axis === 'horizontal' ? runtime.enemy.x : runtime.enemy.y;
      if (position <= runtime.minimum) {
        if (runtime.axis === 'horizontal') body.setVelocityX(runtime.speed);
        else body.setVelocityY(runtime.speed);
      } else if (position >= runtime.maximum) {
        if (runtime.axis === 'horizontal') body.setVelocityX(-runtime.speed);
        else body.setVelocityY(-runtime.speed);
      }
    }
  }

  private restartIfPlayerFellOutOfBounds(): boolean {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.top <= this.level.height + 32) return false;
    this.handleDeath('fall');
    return true;
  }

  private getPlaytestObjects(): LevelObject[] {
    return this.level.objects.map((object) => {
      if (object.type !== 'moving-platform') return object;
      const runtime = this.movingPlatforms.find(
        (platform) => platform.objectId === object.id,
      );
      if (!runtime) return object;
      return {
        ...object,
        x: runtime.rectangle.x - object.width / 2,
        y: runtime.rectangle.y - object.height / 2,
      };
    });
  }

  private addSpike(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: LevelObject,
  ): void {
    const spike = this.add.triangle(
      object.x + object.width / 2,
      object.y + object.height / 2,
      0,
      object.height,
      object.width / 2,
      0,
      object.width,
      object.height,
      0xd66559,
    );
    spike.setStrokeStyle(2, 0xff9a88);
    spike.setData('levelObjectId', object.id);
    this.physics.add.existing(spike, true);
    group.add(spike);
  }

  private addEnemy(
    group: Phaser.Physics.Arcade.Group,
    object: LevelObject,
    level: LevelDocument,
  ): void {
    const isSlime = object.type === 'slime';
    const enemy = this.add.ellipse(
      object.x + object.width / 2,
      object.y + object.height / 2,
      object.width * (isSlime ? 0.88 : 0.72),
      object.height * (isSlime ? 0.72 : 0.58),
      isSlime ? 0x76c442 : 0xf4c542,
    );
    enemy.setStrokeStyle(3, isSlime ? 0x315f42 : 0x6d4b16);
    enemy.setData('levelObjectId', object.id);
    this.physics.add.existing(enemy);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setImmovable(true);
    group.add(enemy);

    const movement = object.movement ?? {
      axis: 'horizontal' as const,
      distance: isSlime ? 192 : 256,
      speed: isSlime ? 70 : 95,
    };
    const halfSize =
      movement.axis === 'horizontal' ? object.width / 2 : object.height / 2;
    const center = movement.axis === 'horizontal' ? enemy.x : enemy.y;
    const boundary =
      movement.axis === 'horizontal' ? level.width : level.height;
    const minimum = Phaser.Math.Clamp(
      center - movement.distance / 2,
      halfSize,
      boundary - halfSize,
    );
    const maximum = Phaser.Math.Clamp(
      center + movement.distance / 2,
      minimum,
      boundary - halfSize,
    );
    if (movement.axis === 'horizontal')
      body.setVelocityX(minimum === maximum ? 0 : movement.speed);
    else body.setVelocityY(minimum === maximum ? 0 : movement.speed);
    this.enemies.push({
      objectId: object.id,
      enemy,
      axis: movement.axis,
      minimum,
      maximum,
      speed: movement.speed,
    });
  }

  private addCoin(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: LevelObject,
  ): void {
    const coin = this.add.circle(
      object.x + object.width / 2,
      object.y + object.height / 2,
      Math.min(object.width, object.height) / 2,
      0xe6a53b,
    );
    coin.setStrokeStyle(3, 0xffe08b);
    coin.setData('levelObjectId', object.id);
    this.physics.add.existing(coin, true);
    group.add(coin);
    this.remainingCoins += 1;
  }

  private addCheckpoint(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: LevelObject,
  ): void {
    const active = object.id === this.activeCheckpointId;
    const checkpoint = this.add.rectangle(
      object.x + object.width / 2,
      object.y + object.height / 2,
      object.width,
      object.height,
      active ? 0x4bbf73 : 0xd49b3d,
      active ? 0.32 : 0.16,
    );
    checkpoint.setStrokeStyle(2, active ? 0x8ff0aa : 0xffe08b);
    checkpoint.setData('levelObjectId', object.id);
    this.physics.add.existing(checkpoint, true);
    group.add(checkpoint);
    this.add
      .text(
        object.x + object.width / 2,
        object.y - 8,
        active ? '已激活' : '检查点',
        {
          color: active ? '#8ff0aa' : '#ffe08b',
          fontFamily: 'monospace',
          fontSize: '14px',
        },
      )
      .setOrigin(0.5, 1);
  }

  private activateCheckpoint(checkpoint: Phaser.GameObjects.Rectangle): void {
    const objectId = String(checkpoint.getData('levelObjectId'));
    if (this.activeCheckpointId === objectId) return;
    this.activeCheckpointId = objectId;
    this.registry.set(this.checkpointRegistryKey, objectId);
    checkpoint.setFillStyle(0x4bbf73, 0.32);
    checkpoint.setStrokeStyle(2, 0x8ff0aa);
    const notice = this.add
      .text(this.cameras.main.centerX, 78, '检查点已激活！死亡后从这里继续', {
        color: '#ffffff',
        backgroundColor: '#1f7a45',
        fontFamily: 'monospace',
        fontSize: '18px',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(180);
    this.time.delayedCall(1_200, () => notice.destroy());
  }

  private addGoal(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: LevelObject,
  ): void {
    const goal = this.add.rectangle(
      object.x + object.width / 2,
      object.y + object.height / 2,
      object.width,
      object.height,
      0x4bbf73,
      0.35,
    );
    goal.setStrokeStyle(3, 0x8ff0aa);
    this.physics.add.existing(goal, true);
    group.add(goal);
    this.add
      .text(object.x + object.width / 2, object.y - 10, '终点', {
        color: '#d8ffe2',
        fontFamily: 'monospace',
        fontSize: '18px',
      })
      .setOrigin(0.5, 1);
  }

  private completeLevel(): void {
    if (this.completed) return;
    this.completed = true;
    this.pauseButton?.setVisible(false);
    this.registry.remove(this.checkpointRegistryKey);
    this.registry.remove(this.livesRegistryKey);
    this.registry.remove(this.deathsRegistryKey);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    const hasNextLevel = this.levelIndex < this.campaign.levels.length - 1;
    const starRating = getLevelStarRating(this.deathCount);
    const result = saveLevelResult(
      this.progressStorage,
      this.campaign.levels[this.levelIndex]!.id,
      starRating,
      this.deathCount,
    );
    const recordMessage = result.improved
      ? '新纪录！'
      : `历史最佳：${formatStarRating(result.best.bestStars)} · 最少死亡 ${result.best.fewestDeaths}`;
    const wasAutoPlaying = this.autoPlaying;
    if (!hasNextLevel) {
      this.emitPlaytestEvent({ type: 'completed', ...this.playerPosition() });
      this.registry.set('liimitAutoPlayActive', false);
      this.autoPlaying = false;
      this.setAutoAction('idle');
    }
    this.showLevelSettlement(
      hasNextLevel,
      starRating,
      recordMessage,
      !wasAutoPlaying,
    );
    if (hasNextLevel && wasAutoPlaying) {
      this.registry.set('liimitCurrentLevelIndex', this.levelIndex + 1);
      this.time.delayedCall(2_200, () => this.scene.restart());
    }
  }

  private showLevelSettlement(
    hasNextLevel: boolean,
    starRating: number,
    recordMessage: string,
    showPlayerChoices: boolean,
  ): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    this.add
      .rectangle(width / 2, height / 2, width, height, 0x0c1821, 0.82)
      .setScrollFactor(0)
      .setDepth(190);
    this.add
      .rectangle(width / 2, height / 2, 470, 540, 0x163426, 0.98)
      .setStrokeStyle(3, 0x8ff0aa)
      .setScrollFactor(0)
      .setDepth(200);
    this.add
      .text(
        width / 2,
        height / 2 - 210,
        hasNextLevel
          ? `${this.campaign.levels[this.levelIndex]!.name}完成！`
          : '全部关卡完成！',
        {
          align: 'center',
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '36px',
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);
    this.add
      .text(
        width / 2,
        height / 2 - 112,
        `${formatStarRating(starRating)}\n本关死亡：${this.deathCount} 次\n${recordMessage}`,
        {
          align: 'center',
          color: '#d8ffe2',
          fontFamily: 'monospace',
          fontSize: '21px',
          lineSpacing: 10,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);
    if (!showPlayerChoices) {
      if (hasNextLevel) {
        this.add
          .text(width / 2, height / 2 + 42, 'AI 正在进入下一关…', {
            color: '#bcd7e6',
            fontFamily: 'monospace',
            fontSize: '18px',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(201);
      }
      return;
    }
    if (hasNextLevel) {
      this.addLevelSettlementButton(height / 2 + 18, '进入下一关', () =>
        this.advanceToNextLevel(),
      );
      this.addLevelSettlementButton(height / 2 + 92, '再玩一次', () =>
        this.replayCompletedLevel(),
      );
      this.addLevelSettlementButton(height / 2 + 166, '返回关卡选择', () =>
        this.returnToLevelSelection(),
      );
    } else {
      this.addLevelSettlementButton(height / 2 + 62, '再玩一次', () =>
        this.replayCompletedLevel(),
      );
      this.addLevelSettlementButton(height / 2 + 142, '返回关卡选择', () =>
        this.returnToLevelSelection(),
      );
    }
  }

  private addLevelSettlementButton(
    y: number,
    label: string,
    action: () => void,
  ): void {
    this.add
      .text(this.cameras.main.centerX, y, label, {
        align: 'center',
        color: '#14222d',
        backgroundColor: '#ffffff',
        fixedWidth: 280,
        fontFamily: 'monospace',
        fontSize: '19px',
        padding: { x: 18, y: 11 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', action);
  }

  private advanceToNextLevel(): void {
    if (this.levelIndex >= this.campaign.levels.length - 1) return;
    this.registry.set('liimitCurrentLevelIndex', this.levelIndex + 1);
    this.scene.restart();
  }

  private replayCompletedLevel(): void {
    this.registry.set('liimitCurrentLevelIndex', this.levelIndex);
    this.scene.restart();
  }

  private showMainMenu(panel: 'home' | 'controls' | 'settings' = 'home'): void {
    this.mainMenuOpen = true;
    this.physics.world.pause();
    for (const object of this.mainMenuObjects) object.destroy();
    this.mainMenuObjects = [];
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const gameInfo = (this.cache.json.get(LIVE_GAME_INFO_CACHE_KEY) ??
      bundledGameInfo) as GameInfo;
    this.keepMainMenuObject(
      this.add
        .rectangle(width / 2, height / 2, width, height, 0x0c1821, 0.97)
        .setScrollFactor(0)
        .setDepth(500),
    );
    if (panel === 'controls') {
      this.keepMainMenuObject(
        this.add
          .text(width / 2, 86, '操作说明', {
            color: '#ffffff',
            fontFamily: 'monospace',
            fontSize: '38px',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(501),
      );
      this.keepMainMenuObject(
        this.add
          .text(
            width / 2,
            height / 2 - 22,
            '← → 或 A D：左右移动\nW、↑ 或空格：跳跃\n开启二连跳的关卡可在空中再次跳跃\n经过检查点后，死亡会从检查点继续\nEsc 或 P：暂停游戏',
            {
              align: 'left',
              color: '#d8e5ec',
              fontFamily: 'monospace',
              fontSize: '21px',
              lineSpacing: 18,
            },
          )
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(501),
      );
      this.addMainMenuButton(height - 88, '返回游戏首页', () =>
        this.showMainMenu(),
      );
      return;
    }
    if (panel === 'settings') {
      this.keepMainMenuObject(
        this.add
          .text(width / 2, 86, '游戏设置', {
            color: '#ffffff',
            fontFamily: 'monospace',
            fontSize: '38px',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(501),
      );
      this.addMainMenuButton(
        height / 2 - 70,
        `关卡背景网格：${this.preferences.showGrid ? '显示' : '隐藏'}`,
        () => this.togglePreference('showGrid'),
      );
      this.addMainMenuButton(
        height / 2 + 18,
        `游戏内操作提示：${this.preferences.showControlHints ? '显示' : '隐藏'}`,
        () => this.togglePreference('showControlHints'),
      );
      this.keepMainMenuObject(
        this.add
          .text(width / 2, height / 2 + 92, '设置会自动保存，进入关卡后生效', {
            color: '#82929a',
            fontFamily: 'monospace',
            fontSize: '15px',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(501),
      );
      this.addMainMenuButton(height - 88, '返回游戏首页', () =>
        this.showMainMenu(),
      );
      return;
    }

    const progress = loadLevelProgress(this.progressStorage);
    const continueIndex = getContinueLevelIndex(this.campaign.levels, progress);
    const completedCount = this.campaign.levels.filter(
      (level) => progress[level.id],
    ).length;
    this.keepMainMenuObject(
      this.add
        .text(width / 2, 58, gameInfo.title, {
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '46px',
          stroke: '#081016',
          strokeThickness: 5,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(501),
    );
    this.keepMainMenuObject(
      this.add
        .text(width / 2, 124, gameInfo.subtitle, {
          align: 'center',
          color: '#bcd7e6',
          fontFamily: 'monospace',
          fontSize: '17px',
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(501),
    );
    this.keepMainMenuObject(
      this.add
        .text(
          width / 2,
          164,
          `闯关进度：${completedCount} / ${this.campaign.levels.length}`,
          {
            color: '#8ff0aa',
            fontFamily: 'monospace',
            fontSize: '16px',
          },
        )
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(501),
    );
    this.addMainMenuButton(242, '开始游戏', () =>
      this.startGameFromMainMenu(0),
    );
    this.addMainMenuButton(
      318,
      continueIndex === undefined ? '继续游戏（暂无进度）' : '继续游戏',
      () => {
        if (continueIndex !== undefined)
          this.startGameFromMainMenu(continueIndex);
      },
      continueIndex !== undefined,
    );
    this.addMainMenuButton(394, '选择关卡', () =>
      this.openLevelSelectionFromMainMenu(),
    );
    this.addMainMenuButton(470, '操作说明', () =>
      this.showMainMenu('controls'),
    );
    this.addMainMenuButton(546, '游戏设置', () =>
      this.showMainMenu('settings'),
    );
  }

  private addMainMenuButton(
    y: number,
    label: string,
    action: () => void,
    enabled = true,
  ): void {
    const button = this.add
      .text(this.cameras.main.centerX, y, label, {
        align: 'center',
        color: enabled ? '#14222d' : '#77858c',
        backgroundColor: enabled ? '#ffffff' : '#2b363c',
        fixedWidth: 330,
        fontFamily: 'monospace',
        fontSize: '19px',
        padding: { x: 18, y: 11 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(501);
    this.keepMainMenuObject(button);
    if (enabled) {
      button.setInteractive({ useHandCursor: true }).on('pointerdown', action);
    }
  }

  private keepMainMenuObject<T extends Phaser.GameObjects.GameObject>(
    object: T,
  ): T {
    this.mainMenuObjects.push(object);
    return object;
  }

  private startGameFromMainMenu(levelIndex: number): void {
    this.registry.set('liimitMainMenuHandled', true);
    this.registry.set('liimitLevelSelectionHandled', true);
    this.registry.set('liimitCurrentLevelIndex', levelIndex);
    this.mainMenuOpen = false;
    this.physics.world.resume();
    this.scene.restart();
  }

  private openLevelSelectionFromMainMenu(): void {
    this.registry.set('liimitMainMenuHandled', true);
    this.registry.set('liimitLevelSelectionHandled', false);
    this.mainMenuOpen = false;
    for (const object of this.mainMenuObjects) object.destroy();
    this.mainMenuObjects = [];
    this.showLevelSelection(0);
  }

  private togglePreference(key: keyof GamePreferences): void {
    this.preferences = { ...this.preferences, [key]: !this.preferences[key] };
    saveGamePreferences(this.progressStorage, this.preferences);
    this.showMainMenu('settings');
  }

  private returnToMainMenu(): void {
    this.registry.set('liimitMainMenuHandled', false);
    this.registry.set('liimitLevelSelectionHandled', true);
    this.mainMenuOpen = false;
    this.levelSelectionOpen = false;
    this.pauseMenuOpen = false;
    this.physics.world.resume();
    this.scene.restart();
  }

  private readonly togglePauseMenu = (): void => {
    if (
      this.mainMenuOpen ||
      this.levelSelectionOpen ||
      this.completed ||
      this.restarting ||
      this.autoPlaying
    ) {
      return;
    }
    if (this.pauseMenuOpen) this.closePauseMenu();
    else this.showPauseMenu();
  };

  private showPauseMenu(): void {
    this.pauseMenuOpen = true;
    this.physics.world.pause();
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    this.keepPauseMenuObject(
      this.add
        .rectangle(width / 2, height / 2, width, height, 0x0c1821, 0.78)
        .setScrollFactor(0)
        .setDepth(400),
    );
    this.keepPauseMenuObject(
      this.add
        .rectangle(width / 2, height / 2, 390, 520, 0x162a36, 0.98)
        .setStrokeStyle(2, 0x7bd2ea)
        .setScrollFactor(0)
        .setDepth(401),
    );
    this.keepPauseMenuObject(
      this.add
        .text(width / 2, height / 2 - 206, '游戏已暂停', {
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '34px',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(402),
    );
    this.keepPauseMenuObject(
      this.add
        .text(
          width / 2,
          height / 2 - 154,
          `${this.campaign.levels[this.levelIndex]!.name} · 剩余生命 ${this.remainingLives}`,
          {
            color: '#bcd7e6',
            fontFamily: 'monospace',
            fontSize: '16px',
          },
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(402),
    );
    this.addPauseMenuButton(height / 2 - 82, '继续游戏', () =>
      this.closePauseMenu(),
    );
    this.addPauseMenuButton(height / 2 - 8, '重新开始本关', () =>
      this.restartCurrentLevel(),
    );
    this.addPauseMenuButton(height / 2 + 66, '返回关卡选择', () =>
      this.returnToLevelSelection(),
    );
    this.addPauseMenuButton(height / 2 + 140, '返回游戏首页', () =>
      this.returnToMainMenu(),
    );
    this.keepPauseMenuObject(
      this.add
        .text(width / 2, height / 2 + 216, '按 Esc 或 P 也可以继续', {
          color: '#82929a',
          fontFamily: 'monospace',
          fontSize: '14px',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(402),
    );
  }

  private addPauseMenuButton(
    y: number,
    label: string,
    action: () => void,
  ): void {
    this.keepPauseMenuObject(
      this.add
        .text(this.cameras.main.centerX, y, label, {
          align: 'center',
          color: '#14222d',
          backgroundColor: '#ffffff',
          fixedWidth: 260,
          fontFamily: 'monospace',
          fontSize: '19px',
          padding: { x: 18, y: 12 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(402)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', action),
    );
  }

  private keepPauseMenuObject<T extends Phaser.GameObjects.GameObject>(
    object: T,
  ): T {
    this.pauseMenuObjects.push(object);
    return object;
  }

  private closePauseMenu(): void {
    this.pauseMenuOpen = false;
    for (const object of this.pauseMenuObjects) object.destroy();
    this.pauseMenuObjects = [];
    this.physics.world.resume();
  }

  private restartCurrentLevel(): void {
    this.registry.remove(this.checkpointRegistryKey);
    this.registry.remove(this.livesRegistryKey);
    this.registry.remove(this.deathsRegistryKey);
    this.pauseMenuOpen = false;
    this.physics.world.resume();
    this.scene.restart();
  }

  private returnToLevelSelection(): void {
    this.registry.set('liimitMainMenuHandled', true);
    this.registry.set('liimitLevelSelectionHandled', false);
    this.registry.set(
      'liimitLevelSelectionPage',
      Math.floor(this.levelIndex / LEVELS_PER_SELECTION_PAGE),
    );
    this.registry.set('liimitCurrentLevelIndex', 0);
    this.pauseMenuOpen = false;
    this.physics.world.resume();
    this.scene.restart();
  }

  private showLevelSelection(page: number): void {
    this.levelSelectionOpen = true;
    this.physics.world.pause();
    for (const object of this.levelSelectionObjects) object.destroy();
    this.levelSelectionObjects = [];

    const progress = loadLevelProgress(this.progressStorage);
    const selection = getLevelSelectionPage(
      this.campaign.levels,
      progress,
      page,
    );
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const completedCount = this.campaign.levels.filter(
      (level) => progress[level.id],
    ).length;
    this.keepSelectionObject(
      this.add
        .rectangle(width / 2, height / 2, width, height, 0x0c1821, 0.97)
        .setScrollFactor(0)
        .setDepth(300),
    );
    this.keepSelectionObject(
      this.add
        .text(width / 2, 34, '选择关卡', {
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '34px',
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(310),
    );
    this.keepSelectionObject(
      this.add
        .text(18, 24, '← 游戏首页', {
          color: '#14222d',
          backgroundColor: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '15px',
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(311)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.returnToMainMenu()),
    );
    this.keepSelectionObject(
      this.add
        .text(
          width / 2,
          80,
          `已通关 ${completedCount} / ${this.campaign.levels.length} 关`,
          {
            color: '#bcd7e6',
            fontFamily: 'monospace',
            fontSize: '16px',
          },
        )
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(310),
    );

    for (const [position, entry] of selection.entries.entries()) {
      const column = position % 2;
      const row = Math.floor(position / 2);
      const x = width / 2 + (column === 0 ? -150 : 150);
      const y = 158 + row * 116;
      const fill = entry.unlocked ? 0x193647 : 0x1c252b;
      const stroke = entry.best
        ? 0x8ff0aa
        : entry.unlocked
          ? 0x7bd2ea
          : 0x59666d;
      const card = this.add
        .rectangle(x, y, 270, 94, fill, 0.98)
        .setStrokeStyle(2, stroke)
        .setScrollFactor(0)
        .setDepth(310);
      this.keepSelectionObject(card);
      if (entry.unlocked) {
        card
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.startSelectedLevel(entry.index));
      }
      const resultText = entry.best
        ? `${formatStarRating(entry.best.bestStars)} · 最少死亡 ${entry.best.fewestDeaths}`
        : entry.unlocked
          ? '尚未通关'
          : '🔒 需要先通关上一关';
      this.keepSelectionObject(
        this.add
          .text(x, y, `${entry.name}\n${resultText}`, {
            align: 'center',
            color: entry.unlocked ? '#ffffff' : '#82929a',
            fontFamily: 'monospace',
            fontSize: '17px',
            lineSpacing: 8,
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(311),
      );
    }

    if (selection.pageCount > 1) {
      this.addSelectionPageButton(
        width / 2 - 120,
        height - 34,
        '上一页',
        selection.page > 0,
        selection.page - 1,
      );
      this.keepSelectionObject(
        this.add
          .text(
            width / 2,
            height - 34,
            `${selection.page + 1} / ${selection.pageCount}`,
            {
              color: '#bcd7e6',
              fontFamily: 'monospace',
              fontSize: '16px',
            },
          )
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(311),
      );
      this.addSelectionPageButton(
        width / 2 + 120,
        height - 34,
        '下一页',
        selection.page < selection.pageCount - 1,
        selection.page + 1,
      );
    }
  }

  private addSelectionPageButton(
    x: number,
    y: number,
    label: string,
    enabled: boolean,
    targetPage: number,
  ): void {
    const button = this.add
      .text(x, y, label, {
        color: enabled ? '#14222d' : '#77858c',
        backgroundColor: enabled ? '#ffffff' : '#2b363c',
        fontFamily: 'monospace',
        fontSize: '16px',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(311);
    this.keepSelectionObject(button);
    if (enabled) {
      button
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.showLevelSelection(targetPage));
    }
  }

  private keepSelectionObject<T extends Phaser.GameObjects.GameObject>(
    object: T,
  ): T {
    this.levelSelectionObjects.push(object);
    return object;
  }

  private startSelectedLevel(levelIndex: number): void {
    this.registry.set('liimitMainMenuHandled', true);
    this.registry.set('liimitLevelSelectionHandled', true);
    this.registry.remove('liimitLevelSelectionPage');
    this.registry.set('liimitCurrentLevelIndex', levelIndex);
    this.physics.world.resume();
    this.scene.restart();
  }

  private playerPosition(): { x: number; y: number } {
    return { x: Math.round(this.player.x), y: Math.round(this.player.y) };
  }

  private emitPlaytestEvent(event: PlaytestEvent): void {
    if (window.parent === window) return;
    window.parent.postMessage(
      {
        source: 'liimit.ai',
        channel: 'playtest',
        version: 1,
        event,
      },
      '*',
    );
  }

  private readonly receivePlaytestControl = (message: MessageEvent): void => {
    if (
      message.source !== window.parent ||
      !isPlaytestControlMessage(message.data)
    ) {
      return;
    }
    const active = message.data.command.type === 'start';
    if (active && this.pauseMenuOpen) this.closePauseMenu();
    this.registry.set('liimitAutoPlayActive', active);
    this.autoPlaying = active;
    this.pauseButton?.setVisible(!active);
    if (active && (this.mainMenuOpen || this.levelSelectionOpen)) {
      this.registry.set('liimitMainMenuHandled', true);
      this.registry.set('liimitLevelSelectionHandled', true);
      this.physics.world.resume();
      this.scene.restart();
      return;
    }
    if (active && this.completed) {
      this.registry.set('liimitCurrentLevelIndex', 0);
      this.scene.restart();
      return;
    }
    if (!active && this.player.body) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    }
    this.autoAction = 'idle';
    this.emitAutomationState();
  };

  private setAutoAction(
    action: 'idle' | 'move-left' | 'move-right' | 'jump',
  ): void {
    if (this.autoAction === action) return;
    this.autoAction = action;
    this.emitAutomationState();
  }

  private emitAutomationState(): void {
    this.emitPlaytestEvent({
      type: 'automation-state',
      active: this.autoPlaying,
      action: this.autoAction,
      ...this.playerPosition(),
    });
  }
}

function isPlaytestControlMessage(value: unknown): value is {
  source: 'liimit.ai';
  channel: 'playtest-control';
  version: 1;
  command: { type: 'start' | 'stop' };
} {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (
    message.source !== 'liimit.ai' ||
    message.channel !== 'playtest-control' ||
    message.version !== 1 ||
    !message.command ||
    typeof message.command !== 'object'
  ) {
    return false;
  }
  const command = message.command as Record<string, unknown>;
  return (
    Object.keys(message).length === 4 &&
    Object.keys(command).length === 1 &&
    (command.type === 'start' || command.type === 'stop')
  );
}

function readLevelDocument(value: unknown): LevelDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('关卡数据无效。');
  }
  const candidate = value as Partial<LevelDocument>;
  if (
    candidate.version !== 1 ||
    typeof candidate.width !== 'number' ||
    typeof candidate.height !== 'number' ||
    typeof candidate.gridSize !== 'number' ||
    !Array.isArray(candidate.objects)
  ) {
    throw new Error('关卡数据无效。');
  }
  return candidate as LevelDocument;
}

function splitPlatformAroundPits(
  platform: LevelObject,
  pits: readonly LevelObject[],
): LevelObject[] {
  const cuts = pits
    .filter(
      (pit) =>
        pit.y === platform.y &&
        pit.x < platform.x + platform.width &&
        pit.x + pit.width > platform.x,
    )
    .map((pit) => ({
      start: Math.max(platform.x, pit.x),
      end: Math.min(platform.x + platform.width, pit.x + pit.width),
    }))
    .sort((first, second) => first.start - second.start);
  if (!cuts.length) return [platform];
  const segments: LevelObject[] = [];
  let cursor = platform.x;
  for (const cut of cuts) {
    if (cut.start > cursor) {
      segments.push({
        ...platform,
        id: `${platform.id}-segment-${segments.length + 1}`,
        x: cursor,
        width: cut.start - cursor,
      });
    }
    cursor = Math.max(cursor, cut.end);
  }
  const platformEnd = platform.x + platform.width;
  if (cursor < platformEnd) {
    segments.push({
      ...platform,
      id: `${platform.id}-segment-${segments.length + 1}`,
      x: cursor,
      width: platformEnd - cursor,
    });
  }
  return segments;
}

function getRequestedStartLevelIndex(
  campaign: LevelCampaign,
): number | undefined {
  const levelId = new URLSearchParams(window.location.search).get(
    'liimitStartLevel',
  );
  if (!levelId) return undefined;
  const index = campaign.levels.findIndex((level) => level.id === levelId);
  return index >= 0 ? index : undefined;
}

function readLevelCampaign(
  value: unknown,
  legacyLevel: unknown,
): LevelCampaign {
  if (value && typeof value === 'object') {
    const candidate = value as Partial<LevelCampaign>;
    if (
      candidate.version === 1 &&
      Array.isArray(candidate.levels) &&
      candidate.levels.length > 0
    ) {
      return {
        version: 1,
        levels: candidate.levels.map((level, index) => {
          if (!level || typeof level !== 'object') {
            throw new Error(`第 ${index + 1} 关数据无效。`);
          }
          const item = level as Partial<CampaignLevel>;
          if (typeof item.id !== 'string' || typeof item.name !== 'string') {
            throw new Error(`第 ${index + 1} 关信息无效。`);
          }
          return {
            id: item.id,
            name: item.name,
            document: readLevelDocument(item.document),
            abilities: readPlayerAbilities(item.abilities),
          };
        }),
      };
    }
  }
  return {
    version: 1,
    levels: [
      {
        id: 'level-1',
        name: '第 1 关',
        document: readLevelDocument(legacyLevel),
        abilities: { ...DEFAULT_PLAYER_ABILITIES },
      },
    ],
  };
}

function readPlayerAbilities(value: unknown): PlayerAbilities {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_PLAYER_ABILITIES };
  }
  const candidate = value as Partial<PlayerAbilities>;
  if (
    typeof candidate.moveSpeed !== 'number' ||
    typeof candidate.jumpPower !== 'number' ||
    typeof candidate.doubleJumpEnabled !== 'boolean' ||
    typeof candidate.doubleJumpPower !== 'number'
  ) {
    return { ...DEFAULT_PLAYER_ABILITIES };
  }
  return candidate as PlayerAbilities;
}

function getProgressStorage(): ProgressStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
