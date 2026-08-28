import {
  DEFAULT_ENEMY_MOVEMENT,
  DEFAULT_MOVING_PLATFORM_MOVEMENT,
  parseLevelDocument,
  type LevelDocument,
  type LevelObject,
  type MovingPlatformMovement,
} from '../shared/levelDocument';

export interface LevelPoint {
  x: number;
  y: number;
}

export interface CanvasRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PersistLevelMoveResult {
  level: LevelDocument;
  status: 'unchanged' | 'saved' | 'reverted';
  error?: unknown;
}

export interface PersistLevelUndoResult {
  level: LevelDocument;
  status: 'saved' | 'reverted';
  error?: unknown;
}

export async function persistLevelUndo(
  current: LevelDocument,
  previous: LevelDocument,
  save: (level: LevelDocument) => Promise<LevelDocument>,
): Promise<PersistLevelUndoResult> {
  try {
    return { level: await save(previous), status: 'saved' };
  } catch (error) {
    return { level: current, status: 'reverted', error };
  }
}

export interface AddedPlatform {
  level: LevelDocument;
  platform: LevelObject;
}

export interface AddedMovingPlatform {
  level: LevelDocument;
  platform: LevelObject;
}

export interface UpdatedMovingPlatform {
  level: LevelDocument;
  platform: LevelObject;
}

export interface AddedCoin {
  level: LevelDocument;
  coin: LevelObject;
}

export interface AddedCheckpoint {
  level: LevelDocument;
  checkpoint: LevelObject;
}

export interface AddedSpike {
  level: LevelDocument;
  spike: LevelObject;
}

export interface AddedEnemy {
  level: LevelDocument;
  enemy: LevelObject;
}

export interface AddedPit {
  level: LevelDocument;
  pit: LevelObject;
}

export interface PersistLevelAdditionResult {
  level: LevelDocument;
  status: 'saved' | 'reverted';
  error?: unknown;
}

export interface RemovedLevelObject {
  level: LevelDocument;
  object: LevelObject;
}

export interface PersistLevelDeletionResult {
  level: LevelDocument;
  status: 'saved' | 'reverted';
  error?: unknown;
}

export interface CopiedLevelObject {
  level: LevelDocument;
  object: LevelObject;
}

export interface PersistLevelCopyResult {
  level: LevelDocument;
  status: 'saved' | 'reverted';
  error?: unknown;
}

export type PlatformWidthResizeDirection = 'shrink' | 'expand';
export type PlatformHeightResizeDirection = 'shrink' | 'expand';
export type CoinOrSpikeResizeDirection = 'shrink' | 'expand';

export interface ResizedPlatform {
  level: LevelDocument;
  platform: LevelObject;
}

export interface ResizedCoinOrSpike {
  level: LevelDocument;
  object: LevelObject;
}

export interface PersistPlatformResizeResult {
  level: LevelDocument;
  status: 'saved' | 'reverted';
  error?: unknown;
}

export function getPlatformWidthResizeBlockReason(
  level: LevelDocument,
  objectId: string,
  direction: PlatformWidthResizeDirection,
): string | undefined {
  const target = level.objects.find((object) => object.id === objectId);
  if (!target) return '选中的物体已经不存在';
  if (
    target.type !== 'platform' &&
    target.type !== 'moving-platform' &&
    target.type !== 'pit'
  ) {
    return '只有普通平台、移动平台和坑洞可以调整宽度';
  }
  if (
    direction === 'shrink' &&
    target.width - level.gridSize < level.gridSize
  ) {
    return target.type === 'pit'
      ? '坑洞不能小于一个网格'
      : '平台不能小于一个网格';
  }
  if (
    direction === 'expand' &&
    target.width + level.gridSize > level.width - target.x
  ) {
    return `${target.type === 'pit' ? '坑洞' : target.type === 'moving-platform' ? '移动平台' : '平台'}右边已经没有足够空间`;
  }
  return undefined;
}

export function resizePlatformWidth(
  level: LevelDocument,
  objectId: string,
  direction: PlatformWidthResizeDirection,
): ResizedPlatform {
  const reason = getPlatformWidthResizeBlockReason(level, objectId, direction);
  if (reason) throw new Error(reason);
  const target = level.objects.find((object) => object.id === objectId)!;
  const width =
    target.width + (direction === 'expand' ? level.gridSize : -level.gridSize);
  const platform = { ...target, width };
  return {
    level: {
      ...level,
      objects: level.objects.map((object) =>
        object.id === objectId ? platform : object,
      ),
    },
    platform,
  };
}

export function getPlatformHeightResizeBlockReason(
  level: LevelDocument,
  objectId: string,
  direction: PlatformHeightResizeDirection,
): string | undefined {
  const target = level.objects.find((object) => object.id === objectId);
  if (!target) return '选中的物体已经不存在';
  if (target.type !== 'platform' && target.type !== 'moving-platform') {
    return '只有普通平台和移动平台可以调整高度';
  }
  if (
    direction === 'shrink' &&
    target.height - level.gridSize < level.gridSize
  ) {
    return '平台不能低于一个网格';
  }
  if (
    direction === 'expand' &&
    target.height + level.gridSize > level.height - target.y
  ) {
    return '平台下方已经没有足够空间';
  }
  return undefined;
}

export function resizePlatformHeight(
  level: LevelDocument,
  objectId: string,
  direction: PlatformHeightResizeDirection,
): ResizedPlatform {
  const reason = getPlatformHeightResizeBlockReason(level, objectId, direction);
  if (reason) throw new Error(reason);
  const target = level.objects.find((object) => object.id === objectId)!;
  const height =
    target.height + (direction === 'expand' ? level.gridSize : -level.gridSize);
  const platform = { ...target, height };
  return {
    level: {
      ...level,
      objects: level.objects.map((object) =>
        object.id === objectId ? platform : object,
      ),
    },
    platform,
  };
}

export async function persistPlatformResize(
  previous: LevelDocument,
  next: LevelDocument,
  save: (level: LevelDocument) => Promise<LevelDocument>,
): Promise<PersistPlatformResizeResult> {
  try {
    return { level: await save(next), status: 'saved' };
  } catch (error) {
    return { level: previous, status: 'reverted', error };
  }
}

export const persistLevelObjectResize = persistPlatformResize;

export function getCoinOrSpikeResizeBlockReason(
  level: LevelDocument,
  objectId: string,
  direction: CoinOrSpikeResizeDirection,
): string | undefined {
  const target = level.objects.find((object) => object.id === objectId);
  if (!target) return '选中的物体已经不存在';
  if (target.type !== 'coin' && target.type !== 'spike') {
    return '只有金币和尖刺可以统一缩放';
  }
  if (
    direction === 'shrink' &&
    (target.width - level.gridSize < level.gridSize ||
      target.height - level.gridSize < level.gridSize)
  ) {
    return '金币或尖刺不能小于一个网格';
  }
  if (
    direction === 'expand' &&
    (target.width + level.gridSize > level.width - target.x ||
      target.height + level.gridSize > level.height - target.y)
  ) {
    return '物体右侧或下方已经没有足够空间';
  }
  return undefined;
}

export function resizeCoinOrSpike(
  level: LevelDocument,
  objectId: string,
  direction: CoinOrSpikeResizeDirection,
): ResizedCoinOrSpike {
  const reason = getCoinOrSpikeResizeBlockReason(level, objectId, direction);
  if (reason) throw new Error(reason);
  const target = level.objects.find((object) => object.id === objectId)!;
  const step = direction === 'expand' ? level.gridSize : -level.gridSize;
  const object = {
    ...target,
    width: target.width + step,
    height: target.height + step,
  };
  return {
    level: {
      ...level,
      objects: level.objects.map((candidate) =>
        candidate.id === objectId ? object : candidate,
      ),
    },
    object,
  };
}

export function getLevelObjectCopyBlockReason(
  level: LevelDocument,
  objectId: string,
): string | undefined {
  const target = level.objects.find((object) => object.id === objectId);
  if (!target) return '选中的物体已经不存在';
  if (target.type === 'player-spawn') return '出生点只能有一个，不能复制';
  if (target.type === 'goal') return '终点只能有一个，不能复制';
  return undefined;
}

export function copyLevelObject(
  level: LevelDocument,
  objectId: string,
): CopiedLevelObject {
  const reason = getLevelObjectCopyBlockReason(level, objectId);
  if (reason) throw new Error(reason);
  const source = level.objects.find((object) => object.id === objectId)!;
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`${source.type}-copy-${sequence}`)) sequence += 1;
  const position = findCopiedObjectPosition(level, source);
  const object: LevelObject = {
    ...source,
    id: `${source.type}-copy-${sequence}`,
    ...position,
  };
  return {
    level: { ...level, objects: [...level.objects, object] },
    object,
  };
}

export async function persistLevelCopy(
  previous: LevelDocument,
  next: LevelDocument,
  save: (level: LevelDocument) => Promise<LevelDocument>,
): Promise<PersistLevelCopyResult> {
  try {
    return { level: await save(next), status: 'saved' };
  } catch (error) {
    return { level: previous, status: 'reverted', error };
  }
}

export function getLevelObjectDeletionBlockReason(
  level: LevelDocument,
  objectId: string,
): string | undefined {
  const target = level.objects.find((object) => object.id === objectId);
  if (!target) return '选中的物体已经不存在';
  if (target.type === 'player-spawn') return '出生点是关卡必需物体，不能删除';
  if (target.type === 'goal') return '终点是关卡必需物体，不能删除';
  if (
    target.type === 'platform' &&
    level.objects.filter((object) => object.type === 'platform').length === 1
  ) {
    return '关卡至少需要一个平台，最后一个平台不能删除';
  }
  return undefined;
}

export function removeLevelObject(
  level: LevelDocument,
  objectId: string,
): RemovedLevelObject {
  const reason = getLevelObjectDeletionBlockReason(level, objectId);
  if (reason) throw new Error(reason);
  const object = level.objects.find((candidate) => candidate.id === objectId)!;
  return {
    level: {
      ...level,
      objects: level.objects.filter((candidate) => candidate.id !== objectId),
    },
    object,
  };
}

export async function persistLevelDeletion(
  previous: LevelDocument,
  next: LevelDocument,
  save: (level: LevelDocument) => Promise<LevelDocument>,
): Promise<PersistLevelDeletionResult> {
  try {
    return { level: await save(next), status: 'saved' };
  } catch (error) {
    return { level: previous, status: 'reverted', error };
  }
}

export function addPlatformToLevel(level: LevelDocument): AddedPlatform {
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`platform-${sequence}`)) sequence += 1;

  const width = Math.min(level.gridSize * 6, level.width);
  const height = Math.min(level.gridSize, level.height);
  const maximumX =
    Math.floor((level.width - width) / level.gridSize) * level.gridSize;
  const maximumY =
    Math.floor((level.height - height) / level.gridSize) * level.gridSize;
  const platform: LevelObject = {
    id: `platform-${sequence}`,
    type: 'platform',
    x: Math.min(level.gridSize * 3, maximumX),
    y: Math.min(level.gridSize * 3, maximumY),
    width,
    height,
  };
  return {
    level: { ...level, objects: [...level.objects, platform] },
    platform,
  };
}

export function updateMovingPlatformMovement(
  level: LevelDocument,
  objectId: string,
  patch: Partial<MovingPlatformMovement>,
): UpdatedMovingPlatform {
  const target = level.objects.find((object) => object.id === objectId);
  if (!target) throw new Error('选中的物体已经不存在');
  if (target.type !== 'moving-platform') {
    throw new Error('只有移动平台可以调整移动设置');
  }
  const movement = {
    ...DEFAULT_MOVING_PLATFORM_MOVEMENT,
    distance: level.gridSize * 4,
    ...target.movement,
    ...patch,
  };
  const parsed = parseLevelDocument({
    ...level,
    objects: level.objects.map((object) =>
      object.id === objectId ? { ...object, movement } : object,
    ),
  });
  return {
    level: parsed,
    platform: parsed.objects.find((object) => object.id === objectId)!,
  };
}

export function addMovingPlatformToLevel(
  level: LevelDocument,
): AddedMovingPlatform {
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`moving-platform-${sequence}`)) sequence += 1;

  const width = Math.min(level.gridSize * 4, level.width);
  const height = Math.min(level.gridSize, level.height);
  const maximumX =
    Math.floor((level.width - width) / level.gridSize) * level.gridSize;
  const maximumY =
    Math.floor((level.height - height) / level.gridSize) * level.gridSize;
  const platform: LevelObject = {
    id: `moving-platform-${sequence}`,
    type: 'moving-platform',
    x: Math.min(level.gridSize * 8, maximumX),
    y: Math.min(level.gridSize * 10, maximumY),
    width,
    height,
    movement: {
      ...DEFAULT_MOVING_PLATFORM_MOVEMENT,
      distance: level.gridSize * 4,
    },
  };
  return {
    level: { ...level, objects: [...level.objects, platform] },
    platform,
  };
}

export function addCoinToLevel(level: LevelDocument): AddedCoin {
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`coin-${sequence}`)) sequence += 1;

  const size = level.gridSize;
  const maximumX =
    Math.floor((level.width - size) / level.gridSize) * level.gridSize;
  const maximumY =
    Math.floor((level.height - size) / level.gridSize) * level.gridSize;
  const coin: LevelObject = {
    id: `coin-${sequence}`,
    type: 'coin',
    x: Math.min(level.gridSize * 4, maximumX),
    y: Math.min(level.gridSize * 4, maximumY),
    width: size,
    height: size,
  };
  return {
    level: { ...level, objects: [...level.objects, coin] },
    coin,
  };
}

export function addCheckpointToLevel(level: LevelDocument): AddedCheckpoint {
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`checkpoint-${sequence}`)) sequence += 1;

  const ground = [...level.objects]
    .filter(
      (object) =>
        object.type === 'platform' && object.y + object.height === level.height,
    )
    .sort((first, second) => second.width - first.width)[0];
  if (!ground) throw new Error('请先准备一块连接关卡底部的地面。');
  const width = Math.min(level.gridSize, ground.width);
  const height = Math.min(level.gridSize * 2, ground.y);
  if (height < 1) throw new Error('地面上方没有足够空间放置检查点。');
  const desiredX = ground.x + level.gridSize * (12 + (sequence - 1) * 6);
  const maximumX = ground.x + ground.width - width;
  const checkpoint: LevelObject = {
    id: `checkpoint-${sequence}`,
    type: 'checkpoint',
    x: Math.min(desiredX, maximumX),
    y: ground.y - height,
    width,
    height,
  };
  return {
    level: { ...level, objects: [...level.objects, checkpoint] },
    checkpoint,
  };
}

export function addSpikeToLevel(level: LevelDocument): AddedSpike {
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`spike-${sequence}`)) sequence += 1;

  const size = level.gridSize;
  const maximumX =
    Math.floor((level.width - size) / level.gridSize) * level.gridSize;
  const maximumY =
    Math.floor((level.height - size) / level.gridSize) * level.gridSize;
  const spike: LevelObject = {
    id: `spike-${sequence}`,
    type: 'spike',
    x: Math.min(level.gridSize * 6, maximumX),
    y: Math.min(level.gridSize * 4, maximumY),
    width: size,
    height: size,
  };
  return {
    level: { ...level, objects: [...level.objects, spike] },
    spike,
  };
}

export function addEnemyToLevel(
  level: LevelDocument,
  type: 'slime' | 'bee',
): AddedEnemy {
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`${type}-${sequence}`)) sequence += 1;
  const size = level.gridSize * 2;
  const ground = level.objects.find((object) => object.type === 'platform');
  const maximumX = Math.max(0, level.width - size);
  const maximumY = Math.max(0, level.height - size);
  const enemy: LevelObject = {
    id: `${type}-${sequence}`,
    type,
    x: Math.min(level.gridSize * (8 + sequence * 2), maximumX),
    y: Math.min(
      type === 'slime' && ground
        ? Math.max(0, ground.y - size)
        : level.gridSize * 6,
      maximumY,
    ),
    width: size,
    height: size,
    movement: { ...DEFAULT_ENEMY_MOVEMENT[type] },
  };
  return { level: { ...level, objects: [...level.objects, enemy] }, enemy };
}

export function addPitToLevel(level: LevelDocument): AddedPit {
  const ids = new Set(level.objects.map((object) => object.id));
  let sequence = 1;
  while (ids.has(`pit-${sequence}`)) sequence += 1;
  const ground = [...level.objects]
    .filter(
      (object) =>
        object.type === 'platform' && object.y + object.height === level.height,
    )
    .sort((first, second) => second.width - first.width)[0];
  if (!ground) throw new Error('请先准备一块连接关卡底部的地面。');
  const width = Math.min(level.gridSize * 3, ground.width);
  const centeredX =
    ground.x +
    Math.floor((ground.width - width) / level.gridSize / 2) * level.gridSize;
  const pit: LevelObject = {
    id: `pit-${sequence}`,
    type: 'pit',
    x: centeredX,
    y: ground.y,
    width,
    height: level.height - ground.y,
  };
  return {
    level: { ...level, objects: [...level.objects, pit] },
    pit,
  };
}

export async function persistLevelAddition(
  previous: LevelDocument,
  next: LevelDocument,
  save: (level: LevelDocument) => Promise<LevelDocument>,
): Promise<PersistLevelAdditionResult> {
  try {
    return { level: await save(next), status: 'saved' };
  } catch (error) {
    return { level: previous, status: 'reverted', error };
  }
}

export function clientPointToLevel(
  client: LevelPoint,
  rectangle: CanvasRectangle,
  level: Pick<LevelDocument, 'width' | 'height'>,
): LevelPoint {
  if (rectangle.width <= 0 || rectangle.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: ((client.x - rectangle.left) / rectangle.width) * level.width,
    y: ((client.y - rectangle.top) / rectangle.height) * level.height,
  };
}

export function moveLevelObject(
  level: LevelDocument,
  objectId: string,
  requestedPosition: LevelPoint,
): LevelDocument {
  const target = level.objects.find((object) => object.id === objectId);
  if (!target) throw new Error(`关卡物体不存在：${objectId}。`);
  const x = snapAndClamp(
    requestedPosition.x,
    level.gridSize,
    level.width - target.width,
  );
  const y =
    target.type === 'pit'
      ? target.y
      : snapAndClamp(
          requestedPosition.y,
          level.gridSize,
          level.height - target.height,
        );
  if (target.x === x && target.y === y) return level;
  return {
    ...level,
    objects: level.objects.map((object) =>
      object.id === objectId ? { ...object, x, y } : object,
    ),
  };
}

export function didLevelObjectMove(
  previous: LevelDocument,
  next: LevelDocument,
  objectId: string,
): boolean {
  const before = previous.objects.find((object) => object.id === objectId);
  const after = next.objects.find((object) => object.id === objectId);
  return Boolean(
    before && after && (before.x !== after.x || before.y !== after.y),
  );
}

export async function persistLevelObjectMove(
  previous: LevelDocument,
  next: LevelDocument,
  objectId: string,
  save: (level: LevelDocument) => Promise<LevelDocument>,
): Promise<PersistLevelMoveResult> {
  if (!didLevelObjectMove(previous, next, objectId)) {
    return { level: next, status: 'unchanged' };
  }
  try {
    return { level: await save(next), status: 'saved' };
  } catch (error) {
    return { level: previous, status: 'reverted', error };
  }
}

function snapAndClamp(
  value: number,
  gridSize: number,
  maximum: number,
): number {
  const finite = Number.isFinite(value) ? value : 0;
  const snapped = Math.round(finite / gridSize) * gridSize;
  return Math.min(maximum, Math.max(0, snapped));
}

function findCopiedObjectPosition(
  level: LevelDocument,
  object: LevelObject,
): LevelPoint {
  if (object.type === 'pit') {
    return {
      x: snapAndClamp(
        object.x + level.gridSize,
        level.gridSize,
        level.width - object.width,
      ),
      y: object.y,
    };
  }
  const offsets = [
    { x: level.gridSize, y: level.gridSize },
    { x: level.gridSize, y: -level.gridSize },
    { x: -level.gridSize, y: level.gridSize },
    { x: -level.gridSize, y: -level.gridSize },
  ];
  const positions = offsets.map((offset) => ({
    x: snapAndClamp(
      object.x + offset.x,
      level.gridSize,
      level.width - object.width,
    ),
    y: snapAndClamp(
      object.y + offset.y,
      level.gridSize,
      level.height - object.height,
    ),
  }));
  return (
    positions.find(
      (position) => position.x !== object.x || position.y !== object.y,
    ) ?? positions[0]
  );
}
