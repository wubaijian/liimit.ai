import {
  parseLevelDocument,
  type LevelDocument,
  type LevelObject,
} from '../shared/levelDocument';
import {
  parsePlayerAbilities,
  type PlayerAbilities,
} from '../shared/levelCampaign';
import type { PlaytestReport } from './playtestTelemetry';

export type PlaytestSuggestedChange =
  | { kind: 'delete'; objectId: string; expected: LevelObject }
  | {
      kind: 'move';
      objectId: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }
  | { kind: 'add'; object: LevelObject }
  | {
      kind: 'abilities';
      expected: PlayerAbilities;
      next: PlayerAbilities;
    };

export interface PlaytestSuggestion {
  id: string;
  levelId?: string;
  levelName?: string;
  title: string;
  target: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  impact: string;
  change: PlaytestSuggestedChange;
}

export type PlaytestSuggestionReport = Pick<
  PlaytestReport,
  'evaluationStatus' | 'automationDeaths' | 'lastHazardId' | 'lastX' | 'lastY'
>;

export function createPlaytestSuggestions(
  level: LevelDocument,
  report: PlaytestSuggestionReport,
  abilities?: PlayerAbilities,
): PlaytestSuggestion[] {
  switch (report.evaluationStatus) {
    case 'repeated-death':
      return createRepeatedDeathSuggestion(level, report);
    case 'stuck':
      return createStuckSuggestions(level, report, abilities);
    case 'timeout':
      return [createTimeoutSuggestion(level, report)];
    default:
      return [];
  }
}

export async function persistPlayerAbilitySuggestion(
  suggestion: PlaytestSuggestion,
  load: () => Promise<PlayerAbilities>,
  save: (abilities: PlayerAbilities) => Promise<PlayerAbilities>,
): Promise<PlayerAbilities> {
  const current = await load();
  return save(applyPlayerAbilitySuggestion(current, suggestion));
}

export function applyPlayerAbilitySuggestion(
  abilities: PlayerAbilities,
  suggestion: PlaytestSuggestion,
): PlayerAbilities {
  const change = suggestion.change;
  if (change.kind !== 'abilities') {
    throw new Error('建议无效：这不是角色能力建议。');
  }
  const current = parsePlayerAbilities(abilities);
  if (!samePlayerAbilities(current, change.expected)) {
    throw new Error('建议已经过期：角色能力已经被修改，请重新自动试玩。');
  }
  return parsePlayerAbilities(change.next);
}

export async function persistPlaytestSuggestion(
  suggestion: PlaytestSuggestion,
  load: () => Promise<LevelDocument>,
  save: (level: LevelDocument) => Promise<LevelDocument>,
): Promise<LevelDocument> {
  const currentLevel = await load();
  const nextLevel = applyPlaytestSuggestion(currentLevel, suggestion);
  return save(nextLevel);
}

export function applyPlaytestSuggestion(
  level: LevelDocument,
  suggestion: PlaytestSuggestion,
): LevelDocument {
  const change = suggestion.change;
  if (change.kind === 'abilities') {
    throw new Error('建议无效：角色能力建议不能当作关卡布局修改。');
  }
  if (change.kind === 'delete') {
    if (change.expected.type !== 'spike') {
      throw new Error('建议无效：自动建议只能删除尖刺。');
    }
    const current = level.objects.find(
      (object) => object.id === change.objectId,
    );
    if (!current || !sameLevelObject(current, change.expected)) {
      throw new Error(
        `建议已经过期：尖刺 ${change.objectId} 已经被修改，请重新自动试玩。`,
      );
    }
    return parseLevelDocument({
      ...level,
      objects: level.objects.filter((object) => object.id !== change.objectId),
    });
  }
  if (change.kind === 'move') {
    const current = level.objects.find(
      (object) => object.id === change.objectId,
    );
    if (
      !current ||
      current.type !== 'goal' ||
      current.x !== change.from.x ||
      current.y !== change.from.y
    ) {
      throw new Error(
        `建议已经过期：终点 ${change.objectId} 已经被修改，请重新自动试玩。`,
      );
    }
    return parseLevelDocument({
      ...level,
      objects: level.objects.map((object) =>
        object.id === change.objectId
          ? { ...object, x: change.to.x, y: change.to.y }
          : object,
      ),
    });
  }
  if (change.object.type !== 'platform') {
    throw new Error('建议无效：自动建议只能新增辅助平台。');
  }
  if (level.objects.some((object) => object.id === change.object.id)) {
    throw new Error(
      `建议已经过期：编号 ${change.object.id} 已经被使用，请重新自动试玩。`,
    );
  }
  return parseLevelDocument({
    ...level,
    objects: [...level.objects, { ...change.object }],
  });
}

function createRepeatedDeathSuggestion(
  level: LevelDocument,
  report: PlaytestSuggestionReport,
): PlaytestSuggestion[] {
  const spikes = level.objects.filter((object) => object.type === 'spike');
  const pits = level.objects.filter((object) => object.type === 'pit');
  const hazard =
    [...spikes, ...pits].find((object) => object.id === report.lastHazardId) ??
    nearestObject([...spikes, ...pits], report.lastX, report.lastY);
  if (!hazard) return [];
  if (hazard.type === 'pit') {
    const bridge: LevelObject = {
      id: uniqueObjectId(level, 'suggested-pit-bridge'),
      type: 'platform',
      x: hazard.x,
      y: Math.max(0, hazard.y - level.gridSize),
      width: hazard.width,
      height: level.gridSize,
    };
    return [
      {
        id: `bridge-${hazard.id}`,
        title: '在反复掉落的坑洞上增加桥面',
        target: `坑洞 ${hazard.id}`,
        currentValue: rectangleValue(hazard),
        suggestedValue: `新增平台 ${bridge.id}：${rectangleValue(bridge)}`,
        reason: `机器人在本次自动试玩中死亡 ${report.automationDeaths} 次，最后一次掉进了这个坑洞。`,
        impact: '坑洞会保留，但角色可以从新增的平台上安全通过。',
        change: { kind: 'add', object: bridge },
      },
    ];
  }
  return [
    {
      id: `delete-${hazard.id}`,
      title: '移除反复导致死亡的尖刺',
      target: `尖刺 ${hazard.id}`,
      currentValue: rectangleValue(hazard),
      suggestedValue: '删除这个尖刺',
      reason: `机器人在本次自动试玩中死亡 ${report.automationDeaths} 次，最后一次死亡发生在这个尖刺附近。`,
      impact: '这一处会明显变简单；其他尖刺和平台不会受到影响。',
      change: { kind: 'delete', objectId: hazard.id, expected: { ...hazard } },
    },
  ];
}

function createStuckSuggestions(
  level: LevelDocument,
  report: PlaytestSuggestionReport,
  abilities?: PlayerAbilities,
): PlaytestSuggestion[] {
  const goal = level.objects.find((object) => object.type === 'goal')!;
  const nearGoal =
    Math.abs(goal.x + goal.width / 2 - report.lastX) <= level.gridSize * 6;
  const goalIsHigh = goal.y + goal.height < report.lastY - level.gridSize * 3;
  if (!abilities || !nearGoal || !goalIsHigh) {
    return [createStuckPlatformSuggestion(level, report)];
  }
  return createHighGoalSuggestions(level, report, goal, abilities);
}

function createHighGoalSuggestions(
  level: LevelDocument,
  report: PlaytestSuggestionReport,
  goal: LevelObject,
  abilities: PlayerAbilities,
): PlaytestSuggestion[] {
  const abilitySuggestion = createAbilitySuggestion(abilities);
  return [
    ...(abilitySuggestion ? [abilitySuggestion] : []),
    createLowerGoalSuggestion(level, report, goal),
    createHighGoalPlatformSuggestion(level, goal),
  ];
}

function createAbilitySuggestion(
  abilities: PlayerAbilities,
): PlaytestSuggestion | undefined {
  const enabling = !abilities.doubleJumpEnabled;
  if (!enabling && abilities.doubleJumpPower >= 660) return undefined;
  const next = {
    ...abilities,
    doubleJumpEnabled: true,
    doubleJumpPower: enabling
      ? abilities.doubleJumpPower
      : Math.max(abilities.doubleJumpPower, 660),
  };
  return {
    id: enabling ? 'enable-double-jump' : 'strengthen-double-jump',
    title: enabling ? '为这一关开启二连跳' : '提高这一关的第二次跳跃高度',
    target: '本关角色能力',
    currentValue: enabling
      ? '二连跳：关闭'
      : `二连跳：开启，第二次跳跃高度 ${abilities.doubleJumpPower}`,
    suggestedValue: enabling
      ? `二连跳：开启，第二次跳跃高度 ${abilities.doubleJumpPower}`
      : `二连跳：开启，第二次跳跃高度 ${next.doubleJumpPower}`,
    reason: '机器人已经来到终点下方，但终点高于普通跳跃能够到达的位置。',
    impact: '只改变当前这一关的角色能力，不移动终点、平台或尖刺。',
    change: {
      kind: 'abilities',
      expected: { ...abilities },
      next,
    },
  };
}

function createLowerGoalSuggestion(
  level: LevelDocument,
  report: PlaytestSuggestionReport,
  goal: LevelObject,
): PlaytestSuggestion {
  const spawn = level.objects.find((object) => object.type === 'player-spawn')!;
  const y = Math.max(
    0,
    Math.min(
      level.height - goal.height,
      Math.round(report.lastY + spawn.height / 2 - goal.height),
    ),
  );
  return {
    id: `lower-${goal.id}`,
    title: '把高处终点降低到地面附近',
    target: `终点 ${goal.id}`,
    currentValue: `位置 X ${goal.x}，Y ${goal.y}`,
    suggestedValue: `移动到 X ${goal.x}，Y ${y}`,
    reason: '终点位于角色头顶较高的位置，普通跳跃无法直接碰到。',
    impact: '不需要二连跳也能完成，但这一关的跳跃挑战会明显降低。',
    change: {
      kind: 'move',
      objectId: goal.id,
      from: { x: goal.x, y: goal.y },
      to: { x: goal.x, y },
    },
  };
}

function createHighGoalPlatformSuggestion(
  level: LevelDocument,
  goal: LevelObject,
): PlaytestSuggestion {
  const width = level.gridSize * 4;
  const height = level.gridSize;
  const direction = getGoalDirection(level);
  const rawX =
    direction > 0
      ? goal.x - width - level.gridSize
      : goal.x + goal.width + level.gridSize;
  const object: LevelObject = {
    id: uniqueObjectId(level, 'suggested-goal-step'),
    type: 'platform',
    x: snapAndClamp(rawX, level.gridSize, 0, level.width - width),
    y: snapAndClamp(
      goal.y + goal.height + level.gridSize * 3,
      level.gridSize,
      0,
      level.height - height,
    ),
    width,
    height,
  };
  return {
    id: `add-${object.id}`,
    title: '在高处终点旁增加一级台阶',
    target: `终点 ${goal.id} 附近`,
    currentValue: '终点下方没有可分段跳跃的落脚点',
    suggestedValue: `新增平台 ${object.id}：${rectangleValue(object)}`,
    reason: '增加中间落脚点后，角色可以分两次普通跳跃接近终点。',
    impact: '保留高处终点，但关卡会比必须连续二连跳更容易。',
    change: { kind: 'add', object },
  };
}

function createStuckPlatformSuggestion(
  level: LevelDocument,
  report: PlaytestSuggestionReport,
): PlaytestSuggestion {
  const direction = getGoalDirection(level);
  const spawn = level.objects.find((object) => object.type === 'player-spawn')!;
  const width = Math.min(
    level.gridSize * 4,
    Math.floor(level.width / level.gridSize) * level.gridSize,
  );
  const height = Math.min(
    level.gridSize,
    Math.floor(level.height / level.gridSize) * level.gridSize,
  );
  const rawX =
    direction > 0
      ? report.lastX + level.gridSize
      : report.lastX - level.gridSize - width;
  const x = snapAndClamp(rawX, level.gridSize, 0, level.width - width);
  const rawY = report.lastY - Math.max(level.gridSize, spawn.height);
  const maximumY = level.objects
    .filter(
      (object) =>
        object.type === 'platform' &&
        object.y >= report.lastY &&
        object.x < x + width &&
        object.x + object.width > x,
    )
    .reduce(
      (nearestSurface, object) => Math.min(nearestSurface, object.y - height),
      level.height - height,
    );
  const object: LevelObject = {
    id: uniqueObjectId(level, 'suggested-bridge'),
    type: 'platform',
    x,
    y: snapAndClamp(rawY, level.gridSize, 0, maximumY),
    width,
    height,
  };
  return {
    id: `add-${object.id}`,
    title: '在卡住位置前方增加辅助平台',
    target: `角色卡住位置 X ${Math.round(report.lastX)}，Y ${Math.round(report.lastY)}`,
    currentValue: '前方没有足够的落脚位置',
    suggestedValue: `新增平台 ${object.id}：${rectangleValue(object)}`,
    reason: '机器人连续 5 秒没有形成足够的横向移动，可能无法跨过这里。',
    impact: '角色会多一个落脚点，跳跃难度会降低，但不会移动现有物体。',
    change: { kind: 'add', object },
  };
}

function samePlayerAbilities(
  first: PlayerAbilities,
  second: PlayerAbilities,
): boolean {
  return (
    first.moveSpeed === second.moveSpeed &&
    first.jumpPower === second.jumpPower &&
    first.doubleJumpEnabled === second.doubleJumpEnabled &&
    first.doubleJumpPower === second.doubleJumpPower
  );
}

function createTimeoutSuggestion(
  level: LevelDocument,
  report: PlaytestSuggestionReport,
): PlaytestSuggestion {
  const goal = level.objects.find((object) => object.type === 'goal')!;
  const spawn = level.objects.find((object) => object.type === 'player-spawn')!;
  const direction = getGoalDirection(level);
  const desiredX =
    direction > 0
      ? Math.min(goal.x - level.gridSize, report.lastX + level.gridSize * 3)
      : Math.max(
          goal.x + level.gridSize,
          report.lastX - level.gridSize * 3 - goal.width,
        );
  const spawnBoundary =
    direction > 0
      ? spawn.x + spawn.width + level.gridSize
      : spawn.x - goal.width - level.gridSize;
  const rawX =
    direction > 0
      ? Math.max(spawnBoundary, desiredX)
      : Math.min(spawnBoundary, desiredX);
  const x = snapAndClamp(rawX, level.gridSize, 0, level.width - goal.width);
  return {
    id: `move-${goal.id}`,
    title: '把终点移到机器人已经能够接近的区域',
    target: `终点 ${goal.id}`,
    currentValue: `位置 X ${goal.x}，Y ${goal.y}`,
    suggestedValue: `移动到 X ${x}，Y ${goal.y}`,
    reason: `机器人运行 30 秒仍未通关，最后记录位置是 X ${Math.round(report.lastX)}。`,
    impact: '关卡路线会缩短，终点之前的部分可能不再需要经过。',
    change: {
      kind: 'move',
      objectId: goal.id,
      from: { x: goal.x, y: goal.y },
      to: { x, y: goal.y },
    },
  };
}

function getGoalDirection(level: LevelDocument): -1 | 1 {
  const spawn = level.objects.find((object) => object.type === 'player-spawn')!;
  const goal = level.objects.find((object) => object.type === 'goal')!;
  return goal.x < spawn.x ? -1 : 1;
}

function nearestObject(
  objects: LevelObject[],
  x: number,
  y: number,
): LevelObject | undefined {
  return objects.reduce<LevelObject | undefined>((nearest, object) => {
    if (!nearest) return object;
    return distanceSquared(object, x, y) < distanceSquared(nearest, x, y)
      ? object
      : nearest;
  }, undefined);
}

function distanceSquared(object: LevelObject, x: number, y: number): number {
  const deltaX = object.x + object.width / 2 - x;
  const deltaY = object.y + object.height / 2 - y;
  return deltaX * deltaX + deltaY * deltaY;
}

function rectangleValue(object: LevelObject): string {
  return `X ${object.x}，Y ${object.y}，宽 ${object.width}，高 ${object.height}`;
}

function sameLevelObject(first: LevelObject, second: LevelObject): boolean {
  return (
    first.id === second.id &&
    first.type === second.type &&
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}

function uniqueObjectId(level: LevelDocument, base: string): string {
  const ids = new Set(level.objects.map((object) => object.id));
  if (!ids.has(base)) return base;
  for (let index = 2; index <= level.objects.length + 2; index += 1) {
    const candidate = `${base}-${index}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${base}-new`;
}

function snapAndClamp(
  value: number,
  gridSize: number,
  minimum: number,
  maximum: number,
): number {
  const snapped = Math.round(value / gridSize) * gridSize;
  const alignedMaximum = Math.floor(maximum / gridSize) * gridSize;
  return Math.max(minimum, Math.min(alignedMaximum, snapped));
}
