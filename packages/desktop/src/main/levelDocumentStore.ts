import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import {
  createDefaultLevelDocument,
  parseLevelDocument,
  type LevelDocument,
} from '../shared/levelDocument.js';
import {
  addCampaignLevel,
  createDefaultLevelCampaign,
  parseLevelCampaign,
  type LevelCampaign,
  parsePlayerAbilities,
  type PlayerAbilities,
} from '../shared/levelCampaign.js';
import {
  DEFAULT_GAME_INFO,
  parseGameInfo,
  type GameInfo,
} from '../shared/gameInfo.js';
import { isFixedProductMode, type ProjectRecord } from '../shared/types.js';

const MAX_LEVEL_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CAMPAIGN_FILE_BYTES = 16 * 1024 * 1024;
const MAX_GAME_INFO_FILE_BYTES = 16 * 1024;
export const LEVEL_DOCUMENT_RELATIVE_PATH = path.join('src', 'level.json');
export const LEVEL_CAMPAIGN_RELATIVE_PATH = path.join('src', 'levels.json');
export const GAME_INFO_RELATIVE_PATH = path.join('src', 'gameInfo.json');

type LevelProject = Pick<ProjectRecord, 'path' | 'productMode'>;

interface LevelDocumentStoreOptions {
  renameFile?: typeof rename;
  createTemporaryId?: () => string;
}

export class LevelDocumentStore {
  private readonly renameFile: typeof rename;
  private readonly createTemporaryId: () => string;

  constructor(options: LevelDocumentStoreOptions = {}) {
    this.renameFile = options.renameFile ?? rename;
    this.createTemporaryId = options.createTemporaryId ?? randomUUID;
  }

  async read(project: LevelProject): Promise<LevelDocument> {
    return this.readFromDisk(project, false);
  }

  async readRequired(project: LevelProject): Promise<LevelDocument> {
    return this.readFromDisk(project, true);
  }

  private async readFromDisk(
    project: LevelProject,
    required: boolean,
  ): Promise<LevelDocument> {
    assertFixedProject(project);
    const projectRoot = await resolveProjectRoot(project.path);
    const sourceDirectory = path.join(projectRoot, 'src');
    const sourceInfo = await safeLstat(sourceDirectory);
    if (!sourceInfo) return missingLevelDocument(required);
    const realSourceDirectory = await assertSafeDirectory(
      projectRoot,
      sourceDirectory,
      sourceInfo,
    );
    const levelPath = path.join(realSourceDirectory, 'level.json');
    const levelInfo = await safeLstat(levelPath);
    if (!levelInfo) return missingLevelDocument(required);
    if (levelInfo.isSymbolicLink() || !levelInfo.isFile()) {
      throw new Error('关卡文件无效或为符号链接。');
    }
    if (levelInfo.size > MAX_LEVEL_FILE_BYTES) {
      throw new Error('关卡文件过大，不能超过 2 MB。');
    }
    const realLevelPath = await realpath(levelPath);
    assertContained(projectRoot, realLevelPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(realLevelPath, 'utf8')) as unknown;
    } catch (error) {
      throw new Error('关卡文件无法读取，内容可能已损坏。', {
        cause: error,
      });
    }
    return parseLevelDocument(parsed);
  }

  async save(project: LevelProject, value: unknown): Promise<LevelDocument> {
    assertFixedProject(project);
    const level = parseLevelDocument(value);
    const projectRoot = await resolveProjectRoot(project.path);
    const sourceDirectory = await ensureSafeSourceDirectory(projectRoot);
    const levelPath = path.join(sourceDirectory, 'level.json');
    await assertSafeWritableFile(projectRoot, levelPath);

    const temporaryPath = path.join(
      sourceDirectory,
      `.level-${this.createTemporaryId()}.tmp`,
    );
    assertContained(projectRoot, temporaryPath);
    const serialized = `${JSON.stringify(level, null, 2)}\n`;

    try {
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(serialized, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }

      const writtenValue = JSON.parse(
        await readFile(temporaryPath, 'utf8'),
      ) as unknown;
      parseLevelDocument(writtenValue);
      await this.renameFile(temporaryPath, levelPath);
      return level;
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new Error('关卡保存失败，原有关卡已保留。', {
        cause: error,
      });
    }
  }

  async readCampaign(project: LevelProject): Promise<LevelCampaign> {
    assertFixedProject(project);
    const projectRoot = await resolveProjectRoot(project.path);
    const sourceDirectory = path.join(projectRoot, 'src');
    const sourceInfo = await safeLstat(sourceDirectory);
    if (!sourceInfo) return createDefaultLevelCampaign();
    const realSourceDirectory = await assertSafeDirectory(
      projectRoot,
      sourceDirectory,
      sourceInfo,
    );
    const campaignPath = path.join(realSourceDirectory, 'levels.json');
    const campaignInfo = await safeLstat(campaignPath);
    if (!campaignInfo) {
      return createDefaultLevelCampaign(await this.read(project));
    }
    if (campaignInfo.isSymbolicLink() || !campaignInfo.isFile()) {
      throw new Error('关卡集文件无效或为符号链接。');
    }
    if (campaignInfo.size > MAX_CAMPAIGN_FILE_BYTES) {
      throw new Error('关卡集文件过大，不能超过 16 MB。');
    }
    const realCampaignPath = await realpath(campaignPath);
    assertContained(projectRoot, realCampaignPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(realCampaignPath, 'utf8')) as unknown;
    } catch (error) {
      throw new Error('关卡集文件无法读取，内容可能已损坏。', {
        cause: error,
      });
    }
    return parseLevelCampaign(parsed);
  }

  async saveCampaignLevel(
    project: LevelProject,
    levelId: string,
    value: unknown,
  ): Promise<LevelDocument> {
    const level = parseLevelDocument(value);
    const campaign = await this.readCampaign(project);
    const index = campaign.levels.findIndex((item) => item.id === levelId);
    if (index < 0) throw new Error('要保存的关卡不存在。');
    const levels = campaign.levels.map((item, itemIndex) =>
      itemIndex === index ? { ...item, document: level } : item,
    );
    await this.writeCampaign(project, { ...campaign, levels });
    return level;
  }

  async addLevel(
    project: LevelProject,
    sourceLevelId?: string,
  ): Promise<LevelCampaign> {
    const campaign = addCampaignLevel(
      await this.readCampaign(project),
      sourceLevelId,
    );
    await this.writeCampaign(project, campaign);
    return campaign;
  }

  async saveLevelAbilities(
    project: LevelProject,
    levelId: string,
    value: unknown,
  ): Promise<PlayerAbilities> {
    const abilities = parsePlayerAbilities(value);
    const campaign = await this.readCampaign(project);
    const index = campaign.levels.findIndex((item) => item.id === levelId);
    if (index < 0) throw new Error('要设置角色能力的关卡不存在。');
    const levels = campaign.levels.map((item, itemIndex) =>
      itemIndex === index ? { ...item, abilities } : item,
    );
    await this.writeCampaign(project, { ...campaign, levels });
    return abilities;
  }

  async readGameInfo(project: LevelProject): Promise<GameInfo> {
    assertFixedProject(project);
    const projectRoot = await resolveProjectRoot(project.path);
    const sourceDirectory = path.join(projectRoot, 'src');
    const sourceInfo = await safeLstat(sourceDirectory);
    if (!sourceInfo) return { ...DEFAULT_GAME_INFO };
    const realSourceDirectory = await assertSafeDirectory(
      projectRoot,
      sourceDirectory,
      sourceInfo,
    );
    const gameInfoPath = path.join(realSourceDirectory, 'gameInfo.json');
    const gameInfoFile = await safeLstat(gameInfoPath);
    if (!gameInfoFile) return { ...DEFAULT_GAME_INFO };
    if (gameInfoFile.isSymbolicLink() || !gameInfoFile.isFile()) {
      throw new Error('游戏信息文件无效或为符号链接。');
    }
    if (gameInfoFile.size > MAX_GAME_INFO_FILE_BYTES) {
      throw new Error('游戏信息文件过大，不能超过 16 KB。');
    }
    const realGameInfoPath = await realpath(gameInfoPath);
    assertContained(projectRoot, realGameInfoPath);
    try {
      return parseGameInfo(
        JSON.parse(await readFile(realGameInfoPath, 'utf8')) as unknown,
      );
    } catch (error) {
      throw new Error('游戏信息无法读取，内容可能已损坏。', {
        cause: error,
      });
    }
  }

  async saveGameInfo(project: LevelProject, value: unknown): Promise<GameInfo> {
    assertFixedProject(project);
    const gameInfo = parseGameInfo(value);
    const projectRoot = await resolveProjectRoot(project.path);
    const sourceDirectory = await ensureSafeSourceDirectory(projectRoot);
    const gameInfoPath = path.join(sourceDirectory, 'gameInfo.json');
    await assertSafeWritableFile(projectRoot, gameInfoPath);
    const temporaryPath = path.join(
      sourceDirectory,
      `.game-info-${this.createTemporaryId()}.tmp`,
    );
    assertContained(projectRoot, temporaryPath);
    const serialized = `${JSON.stringify(gameInfo, null, 2)}\n`;
    try {
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(serialized, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      parseGameInfo(
        JSON.parse(await readFile(temporaryPath, 'utf8')) as unknown,
      );
      await this.renameFile(temporaryPath, gameInfoPath);
      return gameInfo;
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new Error('游戏信息保存失败，原有内容已保留。', {
        cause: error,
      });
    }
  }

  private async writeCampaign(
    project: LevelProject,
    value: unknown,
  ): Promise<LevelCampaign> {
    assertFixedProject(project);
    const campaign = parseLevelCampaign(value);
    const projectRoot = await resolveProjectRoot(project.path);
    const sourceDirectory = await ensureSafeSourceDirectory(projectRoot);
    const campaignPath = path.join(sourceDirectory, 'levels.json');
    await assertSafeWritableFile(projectRoot, campaignPath);
    const temporaryPath = path.join(
      sourceDirectory,
      `.levels-${this.createTemporaryId()}.tmp`,
    );
    assertContained(projectRoot, temporaryPath);
    const serialized = `${JSON.stringify(campaign, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CAMPAIGN_FILE_BYTES) {
      throw new Error('关卡集文件过大，不能超过 16 MB。');
    }
    try {
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(serialized, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      parseLevelCampaign(
        JSON.parse(await readFile(temporaryPath, 'utf8')) as unknown,
      );
      await this.renameFile(temporaryPath, campaignPath);
      return campaign;
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new Error('关卡集保存失败，原有关卡已保留。', {
        cause: error,
      });
    }
  }
}

function missingLevelDocument(required: boolean): LevelDocument {
  if (required) {
    throw new Error(`${LEVEL_DOCUMENT_RELATIVE_PATH} 真实关卡文件不存在。`);
  }
  return createDefaultLevelDocument();
}

async function resolveProjectRoot(projectPath: string): Promise<string> {
  const resolved = path.resolve(projectPath);
  const info = await safeLstat(resolved);
  if (!info) throw new Error('项目目录不存在，可能已被移动或删除。');
  if (info.isSymbolicLink()) throw new Error('项目目录不能是符号链接。');
  if (!info.isDirectory()) throw new Error('项目路径不是目录。');
  return realpath(resolved);
}

async function ensureSafeSourceDirectory(projectRoot: string): Promise<string> {
  const sourceDirectory = path.join(projectRoot, 'src');
  try {
    await mkdir(sourceDirectory, { mode: 0o700 });
  } catch (error) {
    if (!isErrorCode(error, 'EEXIST')) throw error;
  }
  const info = await lstat(sourceDirectory);
  return assertSafeDirectory(projectRoot, sourceDirectory, info);
}

async function assertSafeDirectory(
  projectRoot: string,
  directory: string,
  info: Awaited<ReturnType<typeof lstat>>,
): Promise<string> {
  if (info.isSymbolicLink()) throw new Error('src 目录不能是符号链接。');
  if (!info.isDirectory()) throw new Error('src 路径不是目录。');
  const resolved = await realpath(directory);
  assertContained(projectRoot, resolved);
  return resolved;
}

async function assertSafeWritableFile(
  projectRoot: string,
  filePath: string,
): Promise<void> {
  assertContained(projectRoot, filePath);
  const info = await safeLstat(filePath);
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error('关卡文件不能是符号链接。');
  if (!info.isFile()) throw new Error('关卡文件路径不是文件。');
  assertContained(projectRoot, await realpath(filePath));
}

function assertFixedProject(project: LevelProject): void {
  if (!isFixedProductMode(project)) {
    throw new Error('只允许读写 Phaser 3 · 2D 横版平台项目的关卡。');
  }
}

function assertContained(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('关卡文件路径超出项目目录。');
  }
}

async function safeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === code
  );
}
