export const LEVEL_DOCUMENT_VERSION = 1 as const;

export const LEVEL_OBJECT_TYPES = [
  'player-spawn',
  'platform',
  'moving-platform',
  'spike',
  'slime',
  'bee',
  'coin',
  'keycard',
  'security-door',
  'floor-switch',
  'laser-gate',
  'checkpoint',
  'goal',
  'pit',
] as const;

export type LevelObjectType = (typeof LEVEL_OBJECT_TYPES)[number];

export type MovingPlatformAxis = 'horizontal' | 'vertical';

export interface MovingPlatformMovement {
  axis: MovingPlatformAxis;
  distance: number;
  speed: number;
}

export const DEFAULT_MOVING_PLATFORM_MOVEMENT: MovingPlatformMovement = {
  axis: 'horizontal',
  distance: 128,
  speed: 90,
};

export const DEFAULT_ENEMY_MOVEMENT: Record<
  'slime' | 'bee',
  MovingPlatformMovement
> = {
  slime: { axis: 'horizontal', distance: 192, speed: 70 },
  bee: { axis: 'horizontal', distance: 256, speed: 95 },
};

export interface LevelObject {
  id: string;
  type: LevelObjectType;
  /** 物体左上角在关卡中的横向位置，单位为像素。 */
  x: number;
  /** 物体左上角在关卡中的纵向位置，单位为像素。 */
  y: number;
  width: number;
  height: number;
  movement?: MovingPlatformMovement;
}

export interface LevelDocument {
  version: typeof LEVEL_DOCUMENT_VERSION;
  width: number;
  height: number;
  gridSize: number;
  objects: LevelObject[];
}

const LEVEL_LIMITS = Object.freeze({
  minWidth: 640,
  maxWidth: 20_000,
  minHeight: 360,
  maxHeight: 4_000,
  minGridSize: 1,
  maxGridSize: 256,
  maxObjects: 2_000,
});

const LEVEL_OBJECT_TYPE_SET = new Set<string>(LEVEL_OBJECT_TYPES);
const OBJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function createDefaultLevelDocument(): LevelDocument {
  return {
    version: LEVEL_DOCUMENT_VERSION,
    width: 2_400,
    height: 720,
    gridSize: 32,
    objects: [
      {
        id: 'player-spawn',
        type: 'player-spawn',
        x: 96,
        y: 560,
        width: 48,
        height: 64,
      },
      {
        id: 'ground',
        type: 'platform',
        x: 0,
        y: 656,
        width: 2_400,
        height: 64,
      },
      {
        id: 'first-spike',
        type: 'spike',
        x: 640,
        y: 624,
        width: 32,
        height: 32,
      },
      {
        id: 'first-coin',
        type: 'coin',
        x: 416,
        y: 512,
        width: 32,
        height: 32,
      },
      {
        id: 'goal',
        type: 'goal',
        x: 2_240,
        y: 560,
        width: 64,
        height: 96,
      },
    ],
  };
}

export function parseLevelDocument(value: unknown): LevelDocument {
  if (!isPlainObject(value)) invalid('关卡根数据必须是对象');
  assertExactKeys(value, ['version', 'width', 'height', 'gridSize', 'objects']);
  if (value.version !== LEVEL_DOCUMENT_VERSION) {
    invalid(`只支持关卡版本 ${LEVEL_DOCUMENT_VERSION}`);
  }
  const width = requireIntegerInRange(
    value.width,
    '关卡宽度',
    LEVEL_LIMITS.minWidth,
    LEVEL_LIMITS.maxWidth,
  );
  const height = requireIntegerInRange(
    value.height,
    '关卡高度',
    LEVEL_LIMITS.minHeight,
    LEVEL_LIMITS.maxHeight,
  );
  const gridSize = requireIntegerInRange(
    value.gridSize,
    '网格大小',
    LEVEL_LIMITS.minGridSize,
    LEVEL_LIMITS.maxGridSize,
  );
  if (!Array.isArray(value.objects)) invalid('关卡物体必须是数组');
  if (value.objects.length > LEVEL_LIMITS.maxObjects) {
    invalid(`关卡物体不能超过 ${LEVEL_LIMITS.maxObjects} 个`);
  }

  const ids = new Set<string>();
  const objects = value.objects.map((candidate, index) => {
    const object = parseLevelObject(candidate, index, width, height, gridSize);
    if (ids.has(object.id)) invalid(`关卡物体编号重复：${object.id}`);
    ids.add(object.id);
    return object;
  });
  requireExactlyOne(objects, 'player-spawn', '玩家出生点');
  requireExactlyOne(objects, 'goal', '终点');
  if (!objects.some((object) => object.type === 'platform')) {
    invalid('关卡至少需要一个普通平台');
  }
  for (const pit of objects.filter((object) => object.type === 'pit')) {
    const supportingGround = objects.find(
      (object) =>
        object.type === 'platform' &&
        object.y === pit.y &&
        pit.x >= object.x &&
        pit.x + pit.width <= object.x + object.width,
    );
    if (!supportingGround) invalid(`坑洞 ${pit.id} 必须完整放在一块地面上`);
    if (pit.y + pit.height !== height) {
      invalid(`坑洞 ${pit.id} 必须一直延伸到关卡底部`);
    }
  }

  return {
    version: LEVEL_DOCUMENT_VERSION,
    width,
    height,
    gridSize,
    objects,
  };
}

function parseLevelObject(
  value: unknown,
  index: number,
  levelWidth: number,
  levelHeight: number,
  gridSize: number,
): LevelObject {
  const label = `关卡物体 ${index + 1}`;
  if (!isPlainObject(value)) invalid(`${label} 必须是对象`);
  if (typeof value.id !== 'string' || !OBJECT_ID_PATTERN.test(value.id)) {
    invalid(`${label} 的编号格式无效`);
  }
  if (
    typeof value.type !== 'string' ||
    !LEVEL_OBJECT_TYPE_SET.has(value.type)
  ) {
    invalid(`${label} 的类型无效`);
  }
  const storedType = value.type as LevelObjectType;
  const type = getCompatibleObjectType(value.id, storedType);
  const supportsMovement =
    type === 'moving-platform' || type === 'slime' || type === 'bee';
  assertExactKeys(
    value,
    supportsMovement
      ? ['id', 'type', 'x', 'y', 'width', 'height', 'movement']
      : ['id', 'type', 'x', 'y', 'width', 'height'],
    label,
  );
  const x = requireIntegerInRange(
    value.x,
    `${label} 的横向位置`,
    0,
    levelWidth,
  );
  const y = requireIntegerInRange(
    value.y,
    `${label} 的纵向位置`,
    0,
    levelHeight,
  );
  const width = requireIntegerInRange(
    value.width,
    `${label} 的宽度`,
    1,
    levelWidth,
  );
  const height = requireIntegerInRange(
    value.height,
    `${label} 的高度`,
    1,
    levelHeight,
  );
  if (x + width > levelWidth || y + height > levelHeight) {
    invalid(`${label} 超出了关卡范围`);
  }
  const object: LevelObject = {
    id: value.id,
    type,
    x,
    y,
    width,
    height,
  };
  if (type === 'moving-platform') {
    object.movement = parseMovingPlatformMovement(
      value.movement,
      label,
      gridSize,
      levelWidth,
      levelHeight,
    );
  } else if (type === 'slime' || type === 'bee') {
    object.movement = parseEnemyMovement(
      value.movement,
      label,
      gridSize,
      levelWidth,
      levelHeight,
      type,
    );
  }
  return object;
}

function getCompatibleObjectType(
  id: string,
  type: LevelObjectType,
): LevelObjectType {
  if (type !== 'spike') return type;
  if (id.startsWith('yandeu-slime-')) return 'slime';
  if (id.startsWith('yandeu-bee-')) return 'bee';
  return type;
}

function parseEnemyMovement(
  value: unknown,
  label: string,
  gridSize: number,
  levelWidth: number,
  levelHeight: number,
  type: 'slime' | 'bee',
): MovingPlatformMovement {
  if (value === undefined) return { ...DEFAULT_ENEMY_MOVEMENT[type] };
  return parseMovingPlatformMovement(
    value,
    label,
    gridSize,
    levelWidth,
    levelHeight,
  );
}

function parseMovingPlatformMovement(
  value: unknown,
  label: string,
  gridSize: number,
  levelWidth: number,
  levelHeight: number,
): MovingPlatformMovement {
  if (value === undefined) {
    return {
      ...DEFAULT_MOVING_PLATFORM_MOVEMENT,
      distance: gridSize * 4,
    };
  }
  if (!isPlainObject(value)) invalid(`${label} 的移动设置必须是对象`);
  assertExactKeys(value, ['axis', 'distance', 'speed'], `${label} 的移动设置`);
  if (value.axis !== 'horizontal' && value.axis !== 'vertical') {
    invalid(`${label} 的移动方向无效`);
  }
  const distance = requireIntegerInRange(
    value.distance,
    `${label} 的移动距离`,
    gridSize,
    Math.max(levelWidth, levelHeight),
  );
  const speed = requireIntegerInRange(
    value.speed,
    `${label} 的移动速度`,
    30,
    300,
  );
  return { axis: value.axis, distance, speed };
}

function requireExactlyOne(
  objects: LevelObject[],
  type: LevelObjectType,
  label: string,
): void {
  const count = objects.filter((object) => object.type === type).length;
  if (count !== 1) invalid(`关卡必须有且只能有一个${label}`);
}

function requireIntegerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(`${label}必须是 ${minimum} 到 ${maximum} 之间的整数`);
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label = '关卡',
): void {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) invalid(`${label} 包含未支持的字段：${unknownKey}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function invalid(message: string): never {
  throw new Error(`关卡数据无效：${message}。`);
}
