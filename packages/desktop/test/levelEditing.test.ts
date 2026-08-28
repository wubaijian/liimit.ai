import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultLevelDocument,
  parseLevelDocument,
} from '../src/shared/levelDocument.js';
import {
  addCheckpointToLevel,
  addCoinToLevel,
  addEnemyToLevel,
  addMovingPlatformToLevel,
  addPlatformToLevel,
  addPitToLevel,
  addSpikeToLevel,
  clientPointToLevel,
  copyLevelObject,
  didLevelObjectMove,
  getCoinOrSpikeResizeBlockReason,
  getLevelObjectCopyBlockReason,
  getLevelObjectDeletionBlockReason,
  getPlatformHeightResizeBlockReason,
  getPlatformWidthResizeBlockReason,
  moveLevelObject,
  persistLevelAddition,
  persistLevelCopy,
  persistLevelDeletion,
  persistLevelObjectMove,
  persistLevelObjectResize,
  persistLevelUndo,
  persistPlatformResize,
  removeLevelObject,
  resizeCoinOrSpike,
  resizePlatformHeight,
  resizePlatformWidth,
  updateMovingPlatformMovement,
} from '../src/renderer/levelEditing.js';

describe('关卡单物体拖动', () => {
  it('把窗口中的指针位置换算为关卡位置', () => {
    expect(
      clientPointToLevel(
        { x: 350, y: 250 },
        { left: 100, top: 100, width: 500, height: 300 },
        { width: 2_000, height: 600 },
      ),
    ).toEqual({ x: 1_000, y: 300 });
  });

  it('移动时对齐网格且只修改被选中的物体', () => {
    const level = createDefaultLevelDocument();
    const originalObjects = level.objects;
    const moved = moveLevelObject(level, 'first-coin', { x: 501, y: 419 });

    expect(moved).not.toBe(level);
    expect(moved.objects).not.toBe(originalObjects);
    expect(
      moved.objects.find((object) => object.id === 'first-coin'),
    ).toMatchObject({ x: 512, y: 416 });
    expect(moved.objects.find((object) => object.id === 'ground')).toBe(
      level.objects.find((object) => object.id === 'ground'),
    );
    expect(didLevelObjectMove(level, moved, 'first-coin')).toBe(true);
  });

  it('不允许把物体拖出关卡边界', () => {
    const level = createDefaultLevelDocument();
    const leftTop = moveLevelObject(level, 'first-coin', {
      x: -500,
      y: -500,
    });
    expect(
      leftTop.objects.find((object) => object.id === 'first-coin'),
    ).toMatchObject({ x: 0, y: 0 });

    const rightBottom = moveLevelObject(level, 'first-coin', {
      x: 99_999,
      y: 99_999,
    });
    expect(
      rightBottom.objects.find((object) => object.id === 'first-coin'),
    ).toMatchObject({ x: level.width - 32, y: level.height - 32 });
  });

  it('位置没变时不发起保存', async () => {
    const level = createDefaultLevelDocument();
    const save = vi.fn(async () => level);

    await expect(
      persistLevelObjectMove(level, level, 'first-coin', save),
    ).resolves.toEqual({ level, status: 'unchanged' });
    expect(save).not.toHaveBeenCalled();
  });

  it('松开后只保存一次并采用后台返回的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const next = moveLevelObject(previous, 'first-coin', { x: 512, y: 416 });
    const saved = structuredClone(next);
    const save = vi.fn(async () => saved);

    await expect(
      persistLevelObjectMove(previous, next, 'first-coin', save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(next);
  });

  it('保存失败时返回拖动前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const next = moveLevelObject(previous, 'first-coin', { x: 512, y: 416 });
    const failure = new Error('save failed');

    await expect(
      persistLevelObjectMove(previous, next, 'first-coin', async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('撤销上一步编辑', () => {
  it('一次撤销只保存一次编辑前的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const current = addCoinToLevel(previous).level;
    const saved = structuredClone(previous);
    const save = vi.fn(async () => saved);

    await expect(persistLevelUndo(current, previous, save)).resolves.toEqual({
      level: saved,
      status: 'saved',
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(previous);
  });

  it('撤销保存失败时恢复撤销前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const current = addCoinToLevel(previous).level;
    const failure = new Error('save failed');

    await expect(
      persistLevelUndo(current, previous, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: current,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('新增普通平台', () => {
  it('新增固定尺寸、网格对齐且不越界的平台', () => {
    const previous = createDefaultLevelDocument();
    const addition = addPlatformToLevel(previous);

    expect(addition.platform).toEqual({
      id: 'platform-1',
      type: 'platform',
      x: 96,
      y: 96,
      width: 192,
      height: 32,
    });
    expect(previous.objects).toHaveLength(5);
    expect(addition.level.objects).toHaveLength(6);
    expect(() => parseLevelDocument(addition.level)).not.toThrow();
  });

  it('连续新增时使用不重复的平台编号', () => {
    const first = addPlatformToLevel(createDefaultLevelDocument());
    const second = addPlatformToLevel(first.level);

    expect(first.platform.id).toBe('platform-1');
    expect(second.platform.id).toBe('platform-2');
    expect(new Set(second.level.objects.map((object) => object.id)).size).toBe(
      second.level.objects.length,
    );
  });

  it('一次新增只保存一次并采用后台返回的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const addition = addPlatformToLevel(previous);
    const saved = structuredClone(addition.level);
    const save = vi.fn(async () => saved);

    await expect(
      persistLevelAddition(previous, addition.level, save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(addition.level);
  });

  it('新增保存失败时恢复新增前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const addition = addPlatformToLevel(previous);
    const failure = new Error('save failed');

    await expect(
      persistLevelAddition(previous, addition.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('新增移动平台', () => {
  it('新增四个网格宽、可继续拖动和调整尺寸的移动平台', () => {
    const previous = createDefaultLevelDocument();
    const addition = addMovingPlatformToLevel(previous);

    expect(addition.platform).toEqual({
      id: 'moving-platform-1',
      type: 'moving-platform',
      x: 256,
      y: 320,
      width: 128,
      height: 32,
      movement: { axis: 'horizontal', distance: 128, speed: 90 },
    });
    const moved = moveLevelObject(addition.level, addition.platform.id, {
      x: 600,
      y: 400,
    });
    expect(
      moved.objects.find((object) => object.id === addition.platform.id),
    ).toMatchObject({ x: 608, y: 416 });

    const wider = resizePlatformWidth(moved, addition.platform.id, 'expand');
    const taller = resizePlatformHeight(
      wider.level,
      addition.platform.id,
      'expand',
    );
    expect(taller.platform).toMatchObject({ width: 160, height: 64 });
    expect(() => parseLevelDocument(taller.level)).not.toThrow();
  });

  it('连续新增使用不重复编号', () => {
    const first = addMovingPlatformToLevel(createDefaultLevelDocument());
    const second = addMovingPlatformToLevel(first.level);

    expect(first.platform.id).toBe('moving-platform-1');
    expect(second.platform.id).toBe('moving-platform-2');
  });

  it('可以分别修改方向、距离和速度', () => {
    const addition = addMovingPlatformToLevel(createDefaultLevelDocument());
    const updated = updateMovingPlatformMovement(
      addition.level,
      addition.platform.id,
      { axis: 'vertical', distance: 192, speed: 140 },
    );

    expect(updated.platform.movement).toEqual({
      axis: 'vertical',
      distance: 192,
      speed: 140,
    });
    expect(() => parseLevelDocument(updated.level)).not.toThrow();
  });

  it('拒绝修改普通平台和无效速度', () => {
    const level = createDefaultLevelDocument();
    expect(() =>
      updateMovingPlatformMovement(level, 'ground', { speed: 140 }),
    ).toThrow('只有移动平台');

    const addition = addMovingPlatformToLevel(level);
    expect(() =>
      updateMovingPlatformMovement(addition.level, addition.platform.id, {
        speed: 999,
      }),
    ).toThrow('移动速度');
  });
});

describe('新增金币', () => {
  it('新增一个网格大小、网格对齐且不越界的金币', () => {
    const previous = createDefaultLevelDocument();
    const addition = addCoinToLevel(previous);

    expect(addition.coin).toEqual({
      id: 'coin-1',
      type: 'coin',
      x: 128,
      y: 128,
      width: 32,
      height: 32,
    });
    expect(previous.objects).toHaveLength(5);
    expect(addition.level.objects).toHaveLength(6);
    expect(() => parseLevelDocument(addition.level)).not.toThrow();
  });

  it('连续新增金币时使用不重复编号', () => {
    const first = addCoinToLevel(createDefaultLevelDocument());
    const second = addCoinToLevel(first.level);

    expect(first.coin.id).toBe('coin-1');
    expect(second.coin.id).toBe('coin-2');
    expect(new Set(second.level.objects.map((object) => object.id)).size).toBe(
      second.level.objects.length,
    );
  });

  it('一次新增金币只保存一次并采用后台返回的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const addition = addCoinToLevel(previous);
    const saved = structuredClone(addition.level);
    const save = vi.fn(async () => saved);

    await expect(
      persistLevelAddition(previous, addition.level, save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(addition.level);
  });

  it('新增金币保存失败时恢复新增前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const addition = addCoinToLevel(previous);
    const failure = new Error('save failed');

    await expect(
      persistLevelAddition(previous, addition.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('新增检查点', () => {
  it('把检查点放在底部地面上并保持关卡有效', () => {
    const previous = createDefaultLevelDocument();
    const addition = addCheckpointToLevel(previous);

    expect(addition.checkpoint).toEqual({
      id: 'checkpoint-1',
      type: 'checkpoint',
      x: 384,
      y: 592,
      width: 32,
      height: 64,
    });
    expect(previous.objects).toHaveLength(5);
    expect(addition.level.objects).toHaveLength(6);
    expect(() => parseLevelDocument(addition.level)).not.toThrow();
  });

  it('连续新增检查点时使用不重复编号', () => {
    const first = addCheckpointToLevel(createDefaultLevelDocument());
    const second = addCheckpointToLevel(first.level);

    expect(first.checkpoint.id).toBe('checkpoint-1');
    expect(second.checkpoint.id).toBe('checkpoint-2');
  });

  it('没有底部地面或上方空间时说明无法新增', () => {
    const noGround = createDefaultLevelDocument();
    noGround.objects = noGround.objects.filter(
      (object) => object.id !== 'ground',
    );
    expect(() => addCheckpointToLevel(noGround)).toThrow('连接关卡底部');

    const noSpace = createDefaultLevelDocument();
    const ground = noSpace.objects.find((object) => object.id === 'ground')!;
    ground.y = 0;
    ground.height = noSpace.height;
    expect(() => addCheckpointToLevel(noSpace)).toThrow('没有足够空间');
  });
});

describe('新增尖刺', () => {
  it('新增一个网格大小、网格对齐且不越界的尖刺', () => {
    const previous = createDefaultLevelDocument();
    const addition = addSpikeToLevel(previous);

    expect(addition.spike).toEqual({
      id: 'spike-1',
      type: 'spike',
      x: 192,
      y: 128,
      width: 32,
      height: 32,
    });
    expect(previous.objects).toHaveLength(5);
    expect(addition.level.objects).toHaveLength(6);
    expect(() => parseLevelDocument(addition.level)).not.toThrow();
  });

  it('连续新增尖刺时使用不重复编号', () => {
    const first = addSpikeToLevel(createDefaultLevelDocument());
    const second = addSpikeToLevel(first.level);

    expect(first.spike.id).toBe('spike-1');
    expect(second.spike.id).toBe('spike-2');
    expect(new Set(second.level.objects.map((object) => object.id)).size).toBe(
      second.level.objects.length,
    );
  });

  it('一次新增尖刺只保存一次并采用后台返回的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const addition = addSpikeToLevel(previous);
    const saved = structuredClone(addition.level);
    const save = vi.fn(async () => saved);

    await expect(
      persistLevelAddition(previous, addition.level, save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(addition.level);
  });

  it('新增尖刺保存失败时恢复新增前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const addition = addSpikeToLevel(previous);
    const failure = new Error('save failed');

    await expect(
      persistLevelAddition(previous, addition.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('新增正式敌人', () => {
  it('新增史莱姆和蜜蜂时带有各自的默认巡逻设置', () => {
    const slime = addEnemyToLevel(createDefaultLevelDocument(), 'slime');
    const bee = addEnemyToLevel(slime.level, 'bee');

    expect(slime.enemy).toMatchObject({
      id: 'slime-1',
      type: 'slime',
      movement: { axis: 'horizontal', distance: 192, speed: 70 },
    });
    expect(bee.enemy).toMatchObject({
      id: 'bee-1',
      type: 'bee',
      movement: { axis: 'horizontal', distance: 256, speed: 95 },
    });
    expect(() => parseLevelDocument(bee.level)).not.toThrow();
  });
});

describe('新增坑洞', () => {
  it('在底部地面中央新增三个网格宽的真实坑洞', () => {
    const previous = createDefaultLevelDocument();
    const addition = addPitToLevel(previous);

    expect(addition.pit).toEqual({
      id: 'pit-1',
      type: 'pit',
      x: 1_152,
      y: 656,
      width: 96,
      height: 64,
    });
    expect(previous.objects).toHaveLength(5);
    expect(() => parseLevelDocument(addition.level)).not.toThrow();
  });

  it('坑洞只能横向拖动，并可以调整宽度、复制和删除', () => {
    const addition = addPitToLevel(createDefaultLevelDocument());
    const moved = moveLevelObject(addition.level, addition.pit.id, {
      x: 1_500,
      y: 100,
    });
    const pit = moved.objects.find((object) => object.id === addition.pit.id)!;
    expect(pit).toMatchObject({ x: 1_504, y: 656 });

    const expanded = resizePlatformWidth(moved, pit.id, 'expand');
    expect(expanded.platform.width).toBe(128);
    expect(() => parseLevelDocument(expanded.level)).not.toThrow();

    const copied = copyLevelObject(expanded.level, pit.id);
    expect(copied.object).toMatchObject({ type: 'pit', y: 656 });
    expect(() => parseLevelDocument(copied.level)).not.toThrow();

    const removed = removeLevelObject(copied.level, copied.object.id);
    expect(
      removed.level.objects.some((object) => object.id === copied.object.id),
    ).toBe(false);
  });
});

describe('删除当前选中的物体', () => {
  it('删除金币时不修改原关卡且其他物体保持不变', () => {
    const previous = createDefaultLevelDocument();
    const removal = removeLevelObject(previous, 'first-coin');

    expect(removal.object).toMatchObject({ id: 'first-coin', type: 'coin' });
    expect(previous.objects).toHaveLength(5);
    expect(removal.level.objects).toHaveLength(4);
    expect(
      removal.level.objects.some((object) => object.id === 'first-coin'),
    ).toBe(false);
    expect(removal.level.objects.find((object) => object.id === 'goal')).toBe(
      previous.objects.find((object) => object.id === 'goal'),
    );
    expect(() => parseLevelDocument(removal.level)).not.toThrow();
  });

  it('禁止删除出生点、终点和最后一个平台', () => {
    const level = createDefaultLevelDocument();

    expect(getLevelObjectDeletionBlockReason(level, 'player-spawn')).toContain(
      '出生点',
    );
    expect(getLevelObjectDeletionBlockReason(level, 'goal')).toContain('终点');
    expect(getLevelObjectDeletionBlockReason(level, 'ground')).toContain(
      '最后一个平台',
    );
    expect(() => removeLevelObject(level, 'player-spawn')).toThrow('不能删除');
    expect(() => removeLevelObject(level, 'goal')).toThrow('不能删除');
    expect(() => removeLevelObject(level, 'ground')).toThrow('不能删除');
  });

  it('存在多个平台时允许删除其中一个', () => {
    const withExtraPlatform = addPlatformToLevel(
      createDefaultLevelDocument(),
    ).level;
    const removal = removeLevelObject(withExtraPlatform, 'platform-1');

    expect(
      getLevelObjectDeletionBlockReason(withExtraPlatform, 'platform-1'),
    ).toBeUndefined();
    expect(
      removal.level.objects.filter((object) => object.type === 'platform'),
    ).toHaveLength(1);
    expect(() => parseLevelDocument(removal.level)).not.toThrow();
  });

  it('一次删除只保存一次并采用后台返回的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const removal = removeLevelObject(previous, 'first-spike');
    const saved = structuredClone(removal.level);
    const save = vi.fn(async () => saved);

    await expect(
      persistLevelDeletion(previous, removal.level, save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(removal.level);
  });

  it('删除保存失败时恢复删除前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const removal = removeLevelObject(previous, 'first-spike');
    const failure = new Error('save failed');

    await expect(
      persistLevelDeletion(previous, removal.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('复制当前选中的物体', () => {
  it('复制金币时生成新编号、错开一格且不修改原关卡', () => {
    const previous = createDefaultLevelDocument();
    const copy = copyLevelObject(previous, 'first-coin');

    expect(copy.object).toEqual({
      id: 'coin-copy-1',
      type: 'coin',
      x: 448,
      y: 544,
      width: 32,
      height: 32,
    });
    expect(previous.objects).toHaveLength(5);
    expect(copy.level.objects).toHaveLength(6);
    expect(() => parseLevelDocument(copy.level)).not.toThrow();
  });

  it('连续复制时使用不重复编号', () => {
    const first = copyLevelObject(createDefaultLevelDocument(), 'first-spike');
    const second = copyLevelObject(first.level, 'first-spike');

    expect(first.object.id).toBe('spike-copy-1');
    expect(second.object.id).toBe('spike-copy-2');
    expect(new Set(second.level.objects.map((object) => object.id)).size).toBe(
      second.level.objects.length,
    );
  });

  it('靠近关卡边界的平台复制后仍在关卡内', () => {
    const level = createDefaultLevelDocument();
    const copy = copyLevelObject(level, 'ground');

    expect(copy.object).toMatchObject({ x: 0, y: 640 });
    expect(copy.object.x + copy.object.width).toBeLessThanOrEqual(level.width);
    expect(copy.object.y + copy.object.height).toBeLessThanOrEqual(
      level.height,
    );
    expect(() => parseLevelDocument(copy.level)).not.toThrow();
  });

  it('禁止复制出生点和终点', () => {
    const level = createDefaultLevelDocument();

    expect(getLevelObjectCopyBlockReason(level, 'player-spawn')).toContain(
      '出生点',
    );
    expect(getLevelObjectCopyBlockReason(level, 'goal')).toContain('终点');
    expect(() => copyLevelObject(level, 'player-spawn')).toThrow('不能复制');
    expect(() => copyLevelObject(level, 'goal')).toThrow('不能复制');
  });

  it('一次复制只保存一次并采用后台返回的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const copy = copyLevelObject(previous, 'first-coin');
    const saved = structuredClone(copy.level);
    const save = vi.fn(async () => saved);

    await expect(persistLevelCopy(previous, copy.level, save)).resolves.toEqual(
      { level: saved, status: 'saved' },
    );
    expect(save).toHaveBeenCalledExactlyOnceWith(copy.level);
  });

  it('复制保存失败时恢复复制前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const copy = copyLevelObject(previous, 'first-coin');
    const failure = new Error('save failed');

    await expect(
      persistLevelCopy(previous, copy.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('改变普通平台宽度', () => {
  it('每次按一个网格加宽且只修改选中的平台', () => {
    const previous = addPlatformToLevel(createDefaultLevelDocument()).level;
    const originalObjects = previous.objects;
    const resize = resizePlatformWidth(previous, 'platform-1', 'expand');

    expect(resize.platform).toMatchObject({ width: 224, height: 32 });
    expect(resize.level.objects).not.toBe(originalObjects);
    expect(
      previous.objects.find((object) => object.id === 'platform-1')?.width,
    ).toBe(192);
    expect(
      resize.level.objects.find((object) => object.id === 'first-coin'),
    ).toBe(previous.objects.find((object) => object.id === 'first-coin'));
    expect(() => parseLevelDocument(resize.level)).not.toThrow();
  });

  it('每次按一个网格缩短并保留至少一个网格', () => {
    const level = addPlatformToLevel(createDefaultLevelDocument()).level;
    const shortened = resizePlatformWidth(level, 'platform-1', 'shrink');

    expect(shortened.platform.width).toBe(160);
    const minimum = {
      ...level,
      objects: level.objects.map((object) =>
        object.id === 'platform-1' ? { ...object, width: 32 } : object,
      ),
    };
    expect(
      getPlatformWidthResizeBlockReason(minimum, 'platform-1', 'shrink'),
    ).toContain('不能小于');
    expect(() => resizePlatformWidth(minimum, 'platform-1', 'shrink')).toThrow(
      '不能小于',
    );
  });

  it('只有普通平台可以调整宽度', () => {
    const level = createDefaultLevelDocument();

    expect(
      getPlatformWidthResizeBlockReason(level, 'first-coin', 'expand'),
    ).toContain('只有普通平台');
    expect(() => resizePlatformWidth(level, 'first-coin', 'expand')).toThrow(
      '只有普通平台',
    );
  });

  it('平台右侧没有一个完整网格时不能继续加宽', () => {
    const level = createDefaultLevelDocument();

    expect(
      getPlatformWidthResizeBlockReason(level, 'ground', 'expand'),
    ).toContain('没有足够空间');
    expect(() => resizePlatformWidth(level, 'ground', 'expand')).toThrow(
      '没有足够空间',
    );
  });

  it('一次调整只保存一次并采用后台返回的关卡', async () => {
    const previous = addPlatformToLevel(createDefaultLevelDocument()).level;
    const resize = resizePlatformWidth(previous, 'platform-1', 'expand');
    const saved = structuredClone(resize.level);
    const save = vi.fn(async () => saved);

    await expect(
      persistPlatformResize(previous, resize.level, save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(resize.level);
  });

  it('宽度保存失败时恢复调整前的完整关卡', async () => {
    const previous = addPlatformToLevel(createDefaultLevelDocument()).level;
    const resize = resizePlatformWidth(previous, 'platform-1', 'expand');
    const failure = new Error('save failed');

    await expect(
      persistPlatformResize(previous, resize.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('改变普通平台高度', () => {
  it('每次变高一个网格且只修改选中的平台高度', () => {
    const previous = addPlatformToLevel(createDefaultLevelDocument()).level;
    const resize = resizePlatformHeight(previous, 'platform-1', 'expand');

    expect(resize.platform).toMatchObject({ width: 192, height: 64 });
    expect(resize.platform.x).toBe(
      previous.objects.find((object) => object.id === 'platform-1')?.x,
    );
    expect(resize.platform.y).toBe(
      previous.objects.find((object) => object.id === 'platform-1')?.y,
    );
    expect(
      resize.level.objects.find((object) => object.id === 'first-coin'),
    ).toBe(previous.objects.find((object) => object.id === 'first-coin'));
    expect(() => parseLevelDocument(resize.level)).not.toThrow();
  });

  it('每次变矮一个网格并保留至少一个网格', () => {
    const level = createDefaultLevelDocument();
    const shortened = resizePlatformHeight(level, 'ground', 'shrink');

    expect(shortened.platform.height).toBe(32);
    expect(
      getPlatformHeightResizeBlockReason(shortened.level, 'ground', 'shrink'),
    ).toContain('不能低于');
    expect(() =>
      resizePlatformHeight(shortened.level, 'ground', 'shrink'),
    ).toThrow('不能低于');
  });

  it('只有普通平台可以调整高度', () => {
    const level = createDefaultLevelDocument();

    expect(
      getPlatformHeightResizeBlockReason(level, 'first-coin', 'expand'),
    ).toContain('只有普通平台');
    expect(() => resizePlatformHeight(level, 'first-coin', 'expand')).toThrow(
      '只有普通平台',
    );
  });

  it('找不到选中物体时给出明确限制', () => {
    const level = createDefaultLevelDocument();

    expect(
      getPlatformHeightResizeBlockReason(level, 'missing', 'expand'),
    ).toContain('已经不存在');
    expect(() => resizePlatformHeight(level, 'missing', 'expand')).toThrow(
      '已经不存在',
    );
  });

  it('平台下方没有一个完整网格时不能继续变高', () => {
    const level = createDefaultLevelDocument();

    expect(
      getPlatformHeightResizeBlockReason(level, 'ground', 'expand'),
    ).toContain('没有足够空间');
    expect(() => resizePlatformHeight(level, 'ground', 'expand')).toThrow(
      '没有足够空间',
    );
  });

  it('高度调整只保存一次并采用后台返回的关卡', async () => {
    const previous = addPlatformToLevel(createDefaultLevelDocument()).level;
    const resize = resizePlatformHeight(previous, 'platform-1', 'expand');
    const saved = structuredClone(resize.level);
    const save = vi.fn(async () => saved);

    await expect(
      persistPlatformResize(previous, resize.level, save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(resize.level);
  });

  it('高度保存失败时恢复调整前的完整关卡', async () => {
    const previous = addPlatformToLevel(createDefaultLevelDocument()).level;
    const resize = resizePlatformHeight(previous, 'platform-1', 'expand');
    const failure = new Error('save failed');

    await expect(
      persistPlatformResize(previous, resize.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});

describe('改变金币和尖刺大小', () => {
  it.each(['first-coin', 'first-spike'])(
    '每次把 %s 的宽高同时放大一个网格',
    (objectId) => {
      const previous = createDefaultLevelDocument();
      const resize = resizeCoinOrSpike(previous, objectId, 'expand');

      expect(resize.object).toMatchObject({ width: 64, height: 64 });
      expect(resize.object.x).toBe(
        previous.objects.find((object) => object.id === objectId)?.x,
      );
      expect(resize.object.y).toBe(
        previous.objects.find((object) => object.id === objectId)?.y,
      );
      expect(
        resize.level.objects.find((object) => object.id === 'ground'),
      ).toBe(previous.objects.find((object) => object.id === 'ground'));
      expect(() => parseLevelDocument(resize.level)).not.toThrow();
    },
  );

  it('缩小同时减少宽高并保留至少一个网格', () => {
    const level = createDefaultLevelDocument();
    const expanded = resizeCoinOrSpike(level, 'first-coin', 'expand');
    const shrunk = resizeCoinOrSpike(expanded.level, 'first-coin', 'shrink');

    expect(shrunk.object).toMatchObject({ width: 32, height: 32 });
    expect(
      getCoinOrSpikeResizeBlockReason(shrunk.level, 'first-coin', 'shrink'),
    ).toContain('不能小于');
    expect(() =>
      resizeCoinOrSpike(shrunk.level, 'first-coin', 'shrink'),
    ).toThrow('不能小于');
  });

  it('平台、出生点和终点不能使用统一缩放', () => {
    const level = createDefaultLevelDocument();

    for (const objectId of ['ground', 'player-spawn', 'goal']) {
      expect(
        getCoinOrSpikeResizeBlockReason(level, objectId, 'expand'),
      ).toContain('只有金币和尖刺');
      expect(() => resizeCoinOrSpike(level, objectId, 'expand')).toThrow(
        '只有金币和尖刺',
      );
    }
  });

  it('找不到选中物体时给出明确限制', () => {
    const level = createDefaultLevelDocument();

    expect(
      getCoinOrSpikeResizeBlockReason(level, 'missing', 'expand'),
    ).toContain('已经不存在');
  });

  it('右侧或下方空间不足时不能放大', () => {
    const level = createDefaultLevelDocument();
    const atBoundary = {
      ...level,
      objects: level.objects.map((object) =>
        object.id === 'first-coin'
          ? { ...object, x: level.width - 32, y: level.height - 32 }
          : object,
      ),
    };

    expect(
      getCoinOrSpikeResizeBlockReason(atBoundary, 'first-coin', 'expand'),
    ).toContain('没有足够空间');
    expect(() => resizeCoinOrSpike(atBoundary, 'first-coin', 'expand')).toThrow(
      '没有足够空间',
    );
  });

  it('大小调整只保存一次并采用后台返回的关卡', async () => {
    const previous = createDefaultLevelDocument();
    const resize = resizeCoinOrSpike(previous, 'first-coin', 'expand');
    const saved = structuredClone(resize.level);
    const save = vi.fn(async () => saved);

    await expect(
      persistLevelObjectResize(previous, resize.level, save),
    ).resolves.toEqual({ level: saved, status: 'saved' });
    expect(save).toHaveBeenCalledExactlyOnceWith(resize.level);
  });

  it('大小保存失败时恢复调整前的完整关卡', async () => {
    const previous = createDefaultLevelDocument();
    const resize = resizeCoinOrSpike(previous, 'first-spike', 'expand');
    const failure = new Error('save failed');

    await expect(
      persistLevelObjectResize(previous, resize.level, async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      level: previous,
      status: 'reverted',
      error: failure,
    });
  });
});
