import { describe, expect, it } from 'vitest';
import {
  LEVEL_OBJECT_TYPES,
  createDefaultLevelDocument,
  parseLevelDocument,
  type LevelDocument,
} from '../src/shared/levelDocument.js';

describe('可视化编辑器关卡数据', () => {
  it('创建有效默认关卡，并支持可选坑洞和移动平台', () => {
    const level = createDefaultLevelDocument();

    expect(parseLevelDocument(level)).toEqual(level);
    expect(level.objects.map((object) => object.type)).not.toContain('pit');
    expect(LEVEL_OBJECT_TYPES).toContain('pit');
    expect(LEVEL_OBJECT_TYPES).toContain('moving-platform');
    expect(LEVEL_OBJECT_TYPES).toContain('checkpoint');
    expect(LEVEL_OBJECT_TYPES).toContain('slime');
    expect(LEVEL_OBJECT_TYPES).toContain('bee');
    expect(LEVEL_OBJECT_TYPES).toContain('keycard');
    expect(LEVEL_OBJECT_TYPES).toContain('security-door');
    expect(LEVEL_OBJECT_TYPES).toContain('floor-switch');
    expect(LEVEL_OBJECT_TYPES).toContain('laser-gate');
  });

  it('支持工厂门卡和安全门，并保持它们可拖动保存', () => {
    const level = createDefaultLevelDocument();
    level.objects.push(
      {
        id: 'factory-keycard',
        type: 'keycard',
        x: 640,
        y: 512,
        width: 48,
        height: 32,
      },
      {
        id: 'factory-security-door',
        type: 'security-door',
        x: 1_280,
        y: 336,
        width: 64,
        height: 320,
      },
    );
    expect(parseLevelDocument(level)).toEqual(level);
  });

  it('支持工厂地面开关和激光门，并保持它们可拖动保存', () => {
    const level = createDefaultLevelDocument();
    level.objects.push(
      {
        id: 'factory-switch',
        type: 'floor-switch',
        x: 512,
        y: 636,
        width: 160,
        height: 20,
      },
      {
        id: 'factory-laser-gate',
        type: 'laser-gate',
        x: 1_280,
        y: 240,
        width: 64,
        height: 416,
      },
    );
    expect(parseLevelDocument(level)).toEqual(level);
  });

  it('parses explicit enemies with safe patrol defaults', () => {
    const level = createDefaultLevelDocument();
    level.objects.push(
      { id: 'slime-1', type: 'slime', x: 320, y: 560, width: 48, height: 32 },
      { id: 'bee-1', type: 'bee', x: 512, y: 320, width: 48, height: 48 },
    );

    const parsed = parseLevelDocument(level);
    expect(
      parsed.objects.find((object) => object.id === 'slime-1'),
    ).toMatchObject({
      type: 'slime',
      movement: { axis: 'horizontal', distance: 192, speed: 70 },
    });
    expect(
      parsed.objects.find((object) => object.id === 'bee-1'),
    ).toMatchObject({
      type: 'bee',
      movement: { axis: 'horizontal', distance: 256, speed: 95 },
    });
  });

  it('narrowly migrates the selected sample legacy enemy markers', () => {
    const level = createDefaultLevelDocument();
    level.objects.push(
      {
        id: 'yandeu-slime-1',
        type: 'spike',
        x: 320,
        y: 560,
        width: 48,
        height: 32,
      },
      {
        id: 'yandeu-bee-1',
        type: 'spike',
        x: 512,
        y: 320,
        width: 48,
        height: 48,
      },
      {
        id: 'ordinary-spike',
        type: 'spike',
        x: 768,
        y: 624,
        width: 32,
        height: 32,
      },
    );

    const parsed = parseLevelDocument(level);
    expect(
      parsed.objects.find((object) => object.id === 'yandeu-slime-1')?.type,
    ).toBe('slime');
    expect(
      parsed.objects.find((object) => object.id === 'yandeu-bee-1')?.type,
    ).toBe('bee');
    expect(
      parsed.objects.find((object) => object.id === 'ordinary-spike')?.type,
    ).toBe('spike');
  });

  it('坑洞必须完整位于地面内并一直延伸到关卡底部', () => {
    const level = createDefaultLevelDocument();
    level.objects.push({
      id: 'pit-1',
      type: 'pit',
      x: 1_152,
      y: 656,
      width: 96,
      height: 64,
    });
    expect(parseLevelDocument(level)).toEqual(level);

    const floating = structuredClone(level);
    floating.objects.at(-1)!.y = 624;
    floating.objects.at(-1)!.height = 96;
    expect(() => parseLevelDocument(floating)).toThrow('完整放在一块地面');

    const shallow = structuredClone(level);
    shallow.objects.at(-1)!.height = 32;
    expect(() => parseLevelDocument(shallow)).toThrow('延伸到关卡底部');
  });

  it('旧移动平台自动获得默认设置，并拒绝无效设置', () => {
    const level = createDefaultLevelDocument();
    level.objects.push({
      id: 'moving-platform-1',
      type: 'moving-platform',
      x: 256,
      y: 320,
      width: 128,
      height: 32,
    });
    expect(
      parseLevelDocument(level).objects.find(
        (object) => object.id === 'moving-platform-1',
      )?.movement,
    ).toEqual({ axis: 'horizontal', distance: 128, speed: 90 });

    const invalid = structuredClone(level) as unknown as {
      objects: Array<Record<string, unknown>>;
    };
    invalid.objects.at(-1)!.movement = {
      axis: 'diagonal',
      distance: 128,
      speed: 90,
    };
    expect(() => parseLevelDocument(invalid)).toThrow('移动方向');
  });

  it('返回独立数据，不共用可被意外修改的物体数组', () => {
    const first = createDefaultLevelDocument();
    const second = createDefaultLevelDocument();

    first.objects[0]!.x = 999;
    expect(second.objects[0]!.x).toBe(96);
  });

  it.each([
    [
      '缺少出生点',
      (level: LevelDocument) => {
        level.objects = level.objects.filter(
          (object) => object.type !== 'player-spawn',
        );
      },
      '玩家出生点',
    ],
    [
      '缺少终点',
      (level: LevelDocument) => {
        level.objects = level.objects.filter(
          (object) => object.type !== 'goal',
        );
      },
      '终点',
    ],
    [
      '重复物体编号',
      (level: LevelDocument) => {
        level.objects[1]!.id = level.objects[0]!.id;
      },
      '编号重复',
    ],
    [
      '物体越界',
      (level: LevelDocument) => {
        level.objects[0]!.x = level.width;
      },
      '超出了关卡范围',
    ],
    [
      '物体尺寸为零',
      (level: LevelDocument) => {
        level.objects[0]!.width = 0;
      },
      '宽度',
    ],
  ])('拒绝%s', (_name, mutate, expectedMessage) => {
    const level = createDefaultLevelDocument();
    mutate(level);

    expect(() => parseLevelDocument(level)).toThrow(expectedMessage);
  });

  it('拒绝未知物体类型和多余字段', () => {
    const unknownType = createDefaultLevelDocument() as unknown as {
      objects: Array<Record<string, unknown>>;
    };
    unknownType.objects[0]!.type = 'enemy';
    expect(() => parseLevelDocument(unknownType)).toThrow('类型无效');

    const unknownField = createDefaultLevelDocument() as LevelDocument & {
      script?: string;
    };
    unknownField.script = 'run anything';
    expect(() => parseLevelDocument(unknownField)).toThrow('未支持的字段');
  });

  it('检查关卡版本、尺寸和物体数量', () => {
    expect(() =>
      parseLevelDocument({ ...createDefaultLevelDocument(), version: 2 }),
    ).toThrow('只支持关卡版本 1');
    expect(() =>
      parseLevelDocument({ ...createDefaultLevelDocument(), width: 100 }),
    ).toThrow('关卡宽度');
    expect(() =>
      parseLevelDocument({
        ...createDefaultLevelDocument(),
        objects: Array.from({ length: 2_001 }, () => ({})),
      }),
    ).toThrow('不能超过 2000 个');
  });
});
