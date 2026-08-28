import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GAME_INFO_RELATIVE_PATH,
  LEVEL_CAMPAIGN_RELATIVE_PATH,
  LEVEL_DOCUMENT_RELATIVE_PATH,
  LevelDocumentStore,
} from '../src/main/levelDocumentStore.js';
import { DEFAULT_GAME_INFO } from '../src/shared/gameInfo.js';
import {
  createDefaultLevelDocument,
  type LevelDocument,
} from '../src/shared/levelDocument.js';
import { FIXED_PRODUCT_MODE, type ProjectRecord } from '../src/shared/types.js';
import { DEFAULT_PLAYER_ABILITIES } from '../src/shared/levelCampaign.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('关卡文件安全保存与读取', () => {
  it('关卡文件不存在时返回默认关卡，但不擅自写入项目', async () => {
    const project = await createProject();

    await expect(new LevelDocumentStore().read(project)).resolves.toEqual(
      createDefaultLevelDocument(),
    );
    expect(await readdir(project.path)).toEqual([]);
  });

  it('严格读取在 src 目录或真实关卡文件缺失时拒绝默认回退且不写入文件', async () => {
    const projectWithoutSource = await createProject();
    const projectWithoutLevel = await createProject();
    await mkdir(path.join(projectWithoutLevel.path, 'src'));

    await expect(
      readRequiredLevel(new LevelDocumentStore(), projectWithoutSource),
    ).rejects.toThrow(/src[/\\]level\.json.*不存在/);
    await expect(
      readRequiredLevel(new LevelDocumentStore(), projectWithoutLevel),
    ).rejects.toThrow(/src[/\\]level\.json.*不存在/);

    expect(await readdir(projectWithoutSource.path)).toEqual([]);
    expect(await readdir(projectWithoutLevel.path)).toEqual(['src']);
    expect(await readdir(path.join(projectWithoutLevel.path, 'src'))).toEqual(
      [],
    );
  });

  it('严格读取只返回磁盘上真实存在且通过校验的关卡', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    const persistedLevel = createDefaultLevelDocument();
    persistedLevel.objects.find((object) => object.type === 'coin')!.x = 704;
    await store.save(project, persistedLevel);

    await expect(readRequiredLevel(store, project)).resolves.toEqual(
      persistedLevel,
    );
    expect(
      JSON.parse(
        await readFile(
          path.join(project.path, LEVEL_DOCUMENT_RELATIVE_PATH),
          'utf8',
        ),
      ),
    ).toEqual(persistedLevel);
  });

  it('将有效关卡保存到 src/level.json 并原样读回', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    const level = createDefaultLevelDocument();
    level.objects.find((object) => object.type === 'coin')!.x = 512;

    await expect(store.save(project, level)).resolves.toEqual(level);
    await expect(store.read(project)).resolves.toEqual(level);
    const serialized = await readFile(
      path.join(project.path, LEVEL_DOCUMENT_RELATIVE_PATH),
      'utf8',
    );
    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized)).toEqual(level);
  });

  it('把旧项目的单关卡无损识别为第一关', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    const legacy = createDefaultLevelDocument();
    legacy.objects.find((object) => object.type === 'coin')!.x = 544;
    await store.save(project, legacy);

    const campaign = await store.readCampaign(project);

    expect(campaign.levels).toHaveLength(1);
    expect(campaign.levels[0]?.document).toEqual(legacy);
    await expect(
      readFile(path.join(project.path, LEVEL_CAMPAIGN_RELATIVE_PATH), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('可以新增和复制关卡，并分别保存每一关', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    const twoLevels = await store.addLevel(project);
    const threeLevels = await store.addLevel(project, 'level-1');
    const changed = structuredClone(twoLevels.levels[1]!.document);
    changed.objects.find((object) => object.type === 'coin')!.x = 800;

    await store.saveCampaignLevel(project, 'level-2', changed);
    const persisted = await store.readCampaign(project);

    expect(threeLevels.levels).toHaveLength(3);
    expect(persisted.levels).toHaveLength(3);
    expect(persisted.levels[1]?.document).toEqual(changed);
    expect(
      JSON.parse(
        await readFile(
          path.join(project.path, LEVEL_CAMPAIGN_RELATIVE_PATH),
          'utf8',
        ),
      ),
    ).toEqual(persisted);
  });

  it('可以单独保存某一关的角色能力', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    await store.addLevel(project);
    const abilities = {
      ...DEFAULT_PLAYER_ABILITIES,
      moveSpeed: 300,
      doubleJumpEnabled: true,
      doubleJumpPower: 660,
    };

    await expect(
      store.saveLevelAbilities(project, 'level-2', abilities),
    ).resolves.toEqual(abilities);
    const campaign = await store.readCampaign(project);
    expect(campaign.levels[0]?.abilities).toEqual(DEFAULT_PLAYER_ABILITIES);
    expect(campaign.levels[1]?.abilities).toEqual(abilities);
  });

  it('游戏信息不存在时返回默认内容，但不擅自写入项目', async () => {
    const project = await createProject();

    await expect(
      new LevelDocumentStore().readGameInfo(project),
    ).resolves.toEqual(DEFAULT_GAME_INFO);
    expect(await readdir(project.path)).toEqual([]);
  });

  it('安全保存游戏名称和简介，并自动去掉首尾空格', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    const saved = await store.saveGameInfo(project, {
      version: 1,
      title: '  小蓝的天空冒险  ',
      subtitle: '  收集星星，找到天空城。  ',
    });

    expect(saved).toEqual({
      version: 1,
      title: '小蓝的天空冒险',
      subtitle: '收集星星，找到天空城。',
    });
    await expect(store.readGameInfo(project)).resolves.toEqual(saved);
    expect(
      JSON.parse(
        await readFile(
          path.join(project.path, GAME_INFO_RELATIVE_PATH),
          'utf8',
        ),
      ),
    ).toEqual(saved);
  });

  it('拒绝空白或过长的游戏信息，并保留原有内容', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    await store.saveGameInfo(project, DEFAULT_GAME_INFO);

    await expect(
      store.saveGameInfo(project, {
        version: 1,
        title: '   ',
        subtitle: '仍然有简介',
      }),
    ).rejects.toThrow('游戏名称不能为空');
    await expect(
      store.saveGameInfo(project, {
        version: 1,
        title: '名字',
        subtitle: '太'.repeat(101),
      }),
    ).rejects.toThrow('不能超过 100 个字');
    await expect(store.readGameInfo(project)).resolves.toEqual(
      DEFAULT_GAME_INFO,
    );
  });

  it('保存非法数据时不改变已有关卡', async () => {
    const project = await createProject();
    const store = new LevelDocumentStore();
    const original = createDefaultLevelDocument();
    await store.save(project, original);
    const invalid = structuredClone(original);
    invalid.objects = invalid.objects.filter(
      (object) => object.type !== 'goal',
    );

    await expect(store.save(project, invalid)).rejects.toThrow('终点');
    await expect(store.read(project)).resolves.toEqual(original);
  });

  it('最后替换失败时保留旧关卡并清理临时文件', async () => {
    const project = await createProject();
    const originalStore = new LevelDocumentStore();
    const original = createDefaultLevelDocument();
    await originalStore.save(project, original);
    const replacement = structuredClone(original);
    replacement.objects.find((object) => object.type === 'coin')!.x = 768;
    const failingStore = new LevelDocumentStore({
      createTemporaryId: () => 'replacement-failure',
      renameFile: async () => {
        throw new Error('injected replacement failure');
      },
    });

    await expect(failingStore.save(project, replacement)).rejects.toThrow(
      '原有关卡已保留',
    );
    await expect(originalStore.read(project)).resolves.toEqual(original);
    expect(await readdir(path.join(project.path, 'src'))).toEqual([
      'level.json',
    ]);
  });

  it('拒绝损坏和过大的关卡文件', async () => {
    const project = await createProject();
    const levelPath = path.join(project.path, LEVEL_DOCUMENT_RELATIVE_PATH);
    await mkdir(path.dirname(levelPath));
    await writeFile(levelPath, '{broken json', 'utf8');

    await expect(new LevelDocumentStore().read(project)).rejects.toThrow(
      '内容可能已损坏',
    );
    await truncate(levelPath, 2 * 1024 * 1024 + 1);
    await expect(new LevelDocumentStore().read(project)).rejects.toThrow(
      '不能超过 2 MB',
    );
  });

  it.skipIf(process.platform === 'win32')(
    '拒绝通过符号链接把 src 目录指向项目外',
    async () => {
      const project = await createProject();
      const outside = await mkdtemp(
        path.join(os.tmpdir(), 'liimit-level-outside-'),
      );
      roots.push(outside);
      await symlink(outside, path.join(project.path, 'src'));
      const store = new LevelDocumentStore();

      await expect(store.read(project)).rejects.toThrow('符号链接');
      await expect(
        store.save(project, createDefaultLevelDocument()),
      ).rejects.toThrow('符号链接');
      expect(await readdir(outside)).toEqual([]);
    },
  );

  it('拒绝其他游戏类型的项目', async () => {
    const project = await createProject();
    const unsupported = {
      ...project,
      productMode: 'other-game-mode',
    } as unknown as ProjectRecord;

    await expect(new LevelDocumentStore().read(unsupported)).rejects.toThrow(
      '只允许读写 Phaser 3',
    );
  });
});

async function createProject(): Promise<ProjectRecord> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'liimit-level-store-'));
  roots.push(root);
  const projectPath = path.join(root, 'project');
  await mkdir(projectPath);
  return {
    id: 'project',
    name: 'Project',
    path: projectPath,
    prompt: 'Build a platformer',
    status: 'draft',
    stage: 'brief',
    productMode: FIXED_PRODUCT_MODE.id,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

function readRequiredLevel(
  store: LevelDocumentStore,
  project: ProjectRecord,
): Promise<LevelDocument> {
  return (
    store as unknown as {
      readRequired(project: ProjectRecord): Promise<LevelDocument>;
    }
  ).readRequired(project);
}
