import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultLevelDocument,
  type LevelDocument,
} from '../src/shared/levelDocument.js';
import { createEmptyPlaytestReport } from '../src/renderer/playtestTelemetry.js';
import { DEFAULT_PLAYER_ABILITIES } from '../src/shared/levelCampaign.js';
import {
  applyPlayerAbilitySuggestion,
  applyPlaytestSuggestion,
  createPlaytestSuggestions,
  persistPlayerAbilitySuggestion,
  persistPlaytestSuggestion,
  type PlaytestSuggestion,
} from '../src/renderer/playtestSuggestions.js';

describe('自动试玩修改建议', () => {
  it('反复死亡时指出记录到的尖刺并只建议删除', () => {
    const level = createDefaultLevelDocument();
    const suggestions = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death',
      automationDeaths: 3,
      lastHazardId: 'first-spike',
      lastX: 640,
      lastY: 624,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      target: '尖刺 first-spike',
      currentValue: 'X 640，Y 624，宽 32，高 32',
      suggestedValue: '删除这个尖刺',
      change: { kind: 'delete', objectId: 'first-spike' },
    });
  });

  it('尖刺编号不存在时使用离死亡位置最近的尖刺', () => {
    const level = createDefaultLevelDocument();
    level.objects.push({
      id: 'second-spike',
      type: 'spike',
      x: 1_200,
      y: 624,
      width: 32,
      height: 32,
    });
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death',
      automationDeaths: 3,
      lastHazardId: 'missing-spike',
      lastX: 1_190,
      lastY: 620,
    });

    expect(suggestion.change).toMatchObject({
      kind: 'delete',
      objectId: 'second-spike',
    });
  });

  it('关卡没有尖刺时不臆造反复死亡建议', () => {
    const level = createDefaultLevelDocument();
    level.objects = level.objects.filter((object) => object.type !== 'spike');

    expect(
      createPlaytestSuggestions(level, {
        ...createEmptyPlaytestReport(),
        evaluationStatus: 'repeated-death',
        automationDeaths: 3,
        lastX: 640,
        lastY: 624,
      }),
    ).toEqual([]);
  });

  it('反复掉进坑洞时建议增加桥面而不是删除无关尖刺', () => {
    const level = createDefaultLevelDocument();
    level.objects.push({
      id: 'pit-1',
      type: 'pit',
      x: 1_152,
      y: 656,
      width: 96,
      height: 64,
    });
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death',
      automationDeaths: 3,
      lastHazardId: 'pit-1',
      lastX: 1_190,
      lastY: 688,
    });

    expect(suggestion).toMatchObject({
      title: '在反复掉落的坑洞上增加桥面',
      target: '坑洞 pit-1',
      change: { kind: 'add', object: { type: 'platform', x: 1_152 } },
    });
  });

  it('卡住时在前方生成网格对齐且不越界的辅助平台', () => {
    const level = createDefaultLevelDocument();
    level.objects.push({
      id: 'suggested-bridge',
      type: 'platform',
      x: 1_000,
      y: 500,
      width: 128,
      height: 32,
    });
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'stuck',
      lastX: 2_390,
      lastY: 700,
    });

    expect(suggestion.change.kind).toBe('add');
    if (suggestion.change.kind !== 'add') throw new Error('应当新增平台');
    const object = suggestion.change.object;
    expect(object.id).toBe('suggested-bridge-2');
    expect(object.type).toBe('platform');
    expect(object.x % level.gridSize).toBe(0);
    expect(object.y % level.gridSize).toBe(0);
    expect(object.width % level.gridSize).toBe(0);
    expect(object.height % level.gridSize).toBe(0);
    expect(object.x + object.width).toBeLessThanOrEqual(level.width);
    expect(object.y + object.height).toBeLessThanOrEqual(level.height);
  });

  it('角色站在地面时把辅助平台放在地面上方而不是地面内部', () => {
    const level = createDefaultLevelDocument();
    const ground = level.objects.find((object) => object.id === 'ground')!;
    const spawn = level.objects.find(
      (object) => object.type === 'player-spawn',
    )!;
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'stuck',
      lastX: 128,
      lastY: 624,
    });

    if (suggestion.change.kind !== 'add') throw new Error('应当新增平台');
    const object = suggestion.change.object;
    const expectedY =
      Math.round(
        (624 - Math.max(level.gridSize, spawn.height)) / level.gridSize,
      ) * level.gridSize;
    expect(object).toMatchObject({
      x: 160,
      y: expectedY,
      width: 128,
      height: 32,
    });
    expect(object.y + object.height).toBeLessThanOrEqual(ground.y);
  });

  it('卡在高处终点下方且未开启二连跳时优先说明角色能力问题', () => {
    const level = createDefaultLevelDocument();
    level.objects = level.objects.map((object) =>
      object.type === 'goal' ? { ...object, x: 2_112, y: 304 } : object,
    );
    const suggestions = createPlaytestSuggestions(
      level,
      {
        ...createEmptyPlaytestReport(),
        evaluationStatus: 'stuck',
        lastX: 2_152,
        lastY: 624,
      },
      DEFAULT_PLAYER_ABILITIES,
    );

    expect(suggestions).toHaveLength(3);
    expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
      '为这一关开启二连跳',
      '把高处终点降低到地面附近',
      '在高处终点旁增加一级台阶',
    ]);
    expect(suggestions[0]).toMatchObject({
      currentValue: '二连跳：关闭',
      change: {
        kind: 'abilities',
        next: { doubleJumpEnabled: true },
      },
    });
    expect(suggestions[0]?.reason).toContain('终点下方');
    expect(suggestions[1]).toMatchObject({
      change: { kind: 'move', to: { x: 2_112, y: 560 } },
    });
  });

  it('已经开启二连跳仍卡在高处时建议提高第二次跳跃高度', () => {
    const level = createDefaultLevelDocument();
    level.objects = level.objects.map((object) =>
      object.type === 'goal' ? { ...object, x: 2_112, y: 304 } : object,
    );
    const [suggestion] = createPlaytestSuggestions(
      level,
      {
        ...createEmptyPlaytestReport(),
        evaluationStatus: 'stuck',
        lastX: 2_152,
        lastY: 624,
      },
      { ...DEFAULT_PLAYER_ABILITIES, doubleJumpEnabled: true },
    );

    expect(suggestion).toMatchObject({
      title: '提高这一关的第二次跳跃高度',
      change: {
        kind: 'abilities',
        next: { doubleJumpEnabled: true, doubleJumpPower: 660 },
      },
    });
  });

  it('第二次跳跃已经是最高预设时不生成没有变化的能力建议', () => {
    const level = createDefaultLevelDocument();
    level.objects = level.objects.map((object) =>
      object.type === 'goal' ? { ...object, x: 2_112, y: 304 } : object,
    );
    const suggestions = createPlaytestSuggestions(
      level,
      {
        ...createEmptyPlaytestReport(),
        evaluationStatus: 'stuck',
        lastX: 2_152,
        lastY: 624,
      },
      {
        ...DEFAULT_PLAYER_ABILITIES,
        doubleJumpEnabled: true,
        doubleJumpPower: 660,
      },
    );

    expect(suggestions).toHaveLength(2);
    expect(
      suggestions.some((suggestion) => suggestion.change.kind === 'abilities'),
    ).toBe(false);
  });

  it('终点在左侧时把辅助平台放到角色左前方', () => {
    const level = leftwardLevel();
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'stuck',
      lastX: 1_200,
      lastY: 500,
    });

    if (suggestion.change.kind !== 'add') throw new Error('应当新增平台');
    expect(suggestion.change.object.x).toBeLessThan(1_200);
  });

  it('超时时把终点移到最后位置前方并保持关卡边界', () => {
    const level = createDefaultLevelDocument();
    const original = structuredClone(level);
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'timeout',
      lastX: 1_200,
      lastY: 560,
    });

    expect(suggestion.change).toMatchObject({
      kind: 'move',
      objectId: 'goal',
      from: { x: 2_240, y: 560 },
    });
    if (suggestion.change.kind !== 'move') throw new Error('应当移动终点');
    expect(suggestion.change.to.x).toBeGreaterThan(1_200);
    expect(suggestion.change.to.x).toBeLessThan(2_240);
    expect(suggestion.change.to.x % level.gridSize).toBe(0);
    expect(suggestion.change.to.x + 64).toBeLessThanOrEqual(level.width);
    expect(level).toEqual(original);
  });

  it.each(['not-started', 'running', 'success', 'stopped'] as const)(
    '%s 结果不会生成修改建议',
    (evaluationStatus) => {
      expect(
        createPlaytestSuggestions(createDefaultLevelDocument(), {
          ...createEmptyPlaytestReport(),
          evaluationStatus,
        }),
      ).toEqual([]);
    },
  );
});

describe('用户确认后的建议应用', () => {
  it('角色能力建议只在原设置未变化时开启二连跳', async () => {
    const level = createDefaultLevelDocument();
    level.objects = level.objects.map((object) =>
      object.type === 'goal' ? { ...object, x: 2_112, y: 304 } : object,
    );
    const [suggestion] = createPlaytestSuggestions(
      level,
      {
        ...createEmptyPlaytestReport(),
        evaluationStatus: 'stuck',
        lastX: 2_152,
        lastY: 624,
      },
      DEFAULT_PLAYER_ABILITIES,
    );
    const next = applyPlayerAbilitySuggestion(
      DEFAULT_PLAYER_ABILITIES,
      suggestion,
    );
    expect(next.doubleJumpEnabled).toBe(true);
    expect(() =>
      applyPlayerAbilitySuggestion(
        { ...DEFAULT_PLAYER_ABILITIES, moveSpeed: 300 },
        suggestion,
      ),
    ).toThrow('建议已经过期');

    const save = vi.fn(async (abilities) => abilities);
    await persistPlayerAbilitySuggestion(
      suggestion,
      async () => DEFAULT_PLAYER_ABILITIES,
      save,
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ doubleJumpEnabled: true }),
    );
  });

  it('删除建议只删除仍与生成时完全一致的尖刺', () => {
    const level = createDefaultLevelDocument();
    const original = structuredClone(level);
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death',
      automationDeaths: 3,
      lastHazardId: 'first-spike',
      lastX: 640,
      lastY: 624,
    });

    const next = applyPlaytestSuggestion(level, suggestion);

    expect(next.objects.some((object) => object.id === 'first-spike')).toBe(
      false,
    );
    expect(level).toEqual(original);
  });

  it('尖刺已经被用户移动时拒绝旧删除建议', () => {
    const level = createDefaultLevelDocument();
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death',
      automationDeaths: 3,
      lastHazardId: 'first-spike',
      lastX: 640,
      lastY: 624,
    });
    const changed = {
      ...level,
      objects: level.objects.map((object) =>
        object.id === 'first-spike' ? { ...object, x: 672 } : object,
      ),
    };

    expect(() => applyPlaytestSuggestion(changed, suggestion)).toThrow(
      '建议已经过期',
    );
  });

  it('新增建议只新增完整校验通过且编号未占用的平台', () => {
    const level = createDefaultLevelDocument();
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'stuck',
      lastX: 800,
      lastY: 500,
    });

    const next = applyPlaytestSuggestion(level, suggestion);
    if (suggestion.change.kind !== 'add') throw new Error('应当新增平台');
    expect(next.objects).toContainEqual(suggestion.change.object);
    expect(() => applyPlaytestSuggestion(next, suggestion)).toThrow(
      '编号 suggested-bridge 已经被使用',
    );
  });

  it('移动建议只移动原坐标仍一致的终点', () => {
    const level = createDefaultLevelDocument();
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'timeout',
      lastX: 1_200,
      lastY: 560,
    });
    const next = applyPlaytestSuggestion(level, suggestion);
    if (suggestion.change.kind !== 'move') throw new Error('应当移动终点');
    expect(
      next.objects.find((object) => object.id === suggestion.change.objectId),
    ).toMatchObject(suggestion.change.to);

    const changed = {
      ...level,
      objects: level.objects.map((object) =>
        object.type === 'goal' ? { ...object, x: object.x - 32 } : object,
      ),
    };
    expect(() => applyPlaytestSuggestion(changed, suggestion)).toThrow(
      '建议已经过期',
    );
  });

  it('拒绝被伪造成删除普通平台的建议', () => {
    const level = createDefaultLevelDocument();
    const ground = level.objects.find((object) => object.id === 'ground')!;
    const suggestion: PlaytestSuggestion = {
      id: 'bad-delete',
      title: '错误建议',
      target: '平台 ground',
      currentValue: '',
      suggestedValue: '',
      reason: '',
      impact: '',
      change: { kind: 'delete', objectId: ground.id, expected: ground },
    };

    expect(() => applyPlaytestSuggestion(level, suggestion)).toThrow(
      '只能删除尖刺',
    );
  });

  it('拒绝超出关卡边界的新增内容', () => {
    const level = createDefaultLevelDocument();
    const [generated] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'stuck',
      lastX: 800,
      lastY: 500,
    });
    if (generated.change.kind !== 'add') throw new Error('应当新增平台');
    const suggestion: PlaytestSuggestion = {
      ...generated,
      change: {
        kind: 'add',
        object: { ...generated.change.object, x: level.width },
      },
    };

    expect(() => applyPlaytestSuggestion(level, suggestion)).toThrow(
      '关卡数据无效',
    );
  });

  it('确认工作流重新读取最新关卡，校验后才调用保存', async () => {
    const level = createDefaultLevelDocument();
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death',
      automationDeaths: 3,
      lastHazardId: 'first-spike',
      lastX: 640,
      lastY: 624,
    });
    const load = vi.fn(async () => structuredClone(level));
    const save = vi.fn(async (next: LevelDocument) => next);

    const saved = await persistPlaytestSuggestion(suggestion, load, save);

    expect(load).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(load.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
    expect(saved.objects.some((object) => object.id === 'first-spike')).toBe(
      false,
    );
  });

  it('最新关卡与旧建议不一致时不会调用保存', async () => {
    const level = createDefaultLevelDocument();
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'timeout',
      lastX: 1_200,
      lastY: 560,
    });
    const changed = {
      ...level,
      objects: level.objects.map((object) =>
        object.type === 'goal' ? { ...object, x: object.x - 32 } : object,
      ),
    };
    const save = vi.fn(async (next: LevelDocument) => next);

    await expect(
      persistPlaytestSuggestion(suggestion, async () => changed, save),
    ).rejects.toThrow('建议已经过期');
    expect(save).not.toHaveBeenCalled();
  });

  it('保存失败时向上报告错误且不改变读取到的关卡对象', async () => {
    const level = createDefaultLevelDocument();
    const original = structuredClone(level);
    const [suggestion] = createPlaytestSuggestions(level, {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'stuck',
      lastX: 800,
      lastY: 500,
    });

    await expect(
      persistPlaytestSuggestion(
        suggestion,
        async () => level,
        async () => {
          throw new Error('磁盘写入失败');
        },
      ),
    ).rejects.toThrow('磁盘写入失败');
    expect(level).toEqual(original);
  });
});

function leftwardLevel(): LevelDocument {
  const level = createDefaultLevelDocument();
  return {
    ...level,
    objects: level.objects.map((object) => {
      if (object.type === 'player-spawn') return { ...object, x: 2_200 };
      if (object.type === 'goal') return { ...object, x: 64 };
      return object;
    }),
  };
}
