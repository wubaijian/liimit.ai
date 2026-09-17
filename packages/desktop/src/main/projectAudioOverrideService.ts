import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  GAME_SOUND_SLOTS,
  isFixedProductMode,
  type AudioPreviewMimeType,
  type GameSoundSlot,
  type ProjectRecord,
} from '../shared/types.js';

export const PROJECT_AUDIO_MAX_BYTES = 1024 * 1024;

export const PROJECT_AUDIO_RELATIVE_PATHS: Record<GameSoundSlot, string> = {
  jump: 'assets/audio/custom/jump.mp3',
  coin: 'assets/audio/custom/coin.mp3',
  death: 'assets/audio/custom/death.mp3',
  levelClear: 'assets/audio/custom/level-clear.mp3',
  enemyHit: 'assets/audio/custom/enemy-hit.mp3',
  checkpoint: 'assets/audio/custom/checkpoint.mp3',
};

export const PROJECT_AUDIO_WAV_RELATIVE_PATHS: Record<GameSoundSlot, string> = {
  jump: 'assets/audio/custom/jump.wav',
  coin: 'assets/audio/custom/coin.wav',
  death: 'assets/audio/custom/death.wav',
  levelClear: 'assets/audio/custom/level-clear.wav',
  enemyHit: 'assets/audio/custom/enemy-hit.wav',
  checkpoint: 'assets/audio/custom/checkpoint.wav',
};

interface ProjectAudioOverrideServiceOptions {
  buildProject: (project: ProjectRecord) => Promise<void>;
}

export class ProjectAudioOverrideService {
  constructor(private readonly options: ProjectAudioOverrideServiceOptions) {}

  async inspect(
    project: ProjectRecord,
  ): Promise<Record<GameSoundSlot, boolean>> {
    const { configPath } = await resolveConfigPath(project);
    const config = parseOverrideConfig(await readOptionalFile(configPath));
    return Object.fromEntries(
      GAME_SOUND_SLOTS.map((sound) => [sound, config[sound] !== null]),
    ) as Record<GameSoundSlot, boolean>;
  }

  async restore(
    project: ProjectRecord,
    sound: GameSoundSlot,
  ): Promise<boolean> {
    assertGameSoundSlot(sound);
    const { configPath } = await resolveConfigPath(project);
    const previousConfig = await readOptionalFile(configPath);
    const nextConfig = parseOverrideConfig(previousConfig);
    if (nextConfig[sound] === null) return false;
    nextConfig[sound] = null;
    try {
      await atomicWrite(
        configPath,
        Buffer.from(`${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8'),
      );
      await this.options.buildProject(project);
      return true;
    } catch (error) {
      await restoreFile(configPath, previousConfig);
      throw new Error('恢复内置音效后项目构建失败，已经保留原来的声音。', {
        cause: error,
      });
    }
  }

  async apply(
    project: ProjectRecord,
    sound: GameSoundSlot,
    bytes: Uint8Array,
    mimeType: AudioPreviewMimeType = 'audio/mpeg',
  ): Promise<string> {
    if (!isFixedProductMode(project)) {
      throw new Error('只允许修改 Phaser 3 · 2D 横版平台项目的音效。');
    }
    assertGameSoundSlot(sound);
    assertAudioBytes(bytes, mimeType);

    const projectLink = await lstat(project.path);
    if (projectLink.isSymbolicLink() || !projectLink.isDirectory()) {
      throw new Error('项目目录无效或不安全，无法应用音效。');
    }
    const projectRoot = await realpath(project.path);
    const sourceDirectory = await safeExistingDirectory(projectRoot, 'src');
    const audioDirectory = await safeExistingDirectory(
      projectRoot,
      'public/assets/audio',
    );
    const customDirectory = await safeChildDirectory(
      projectRoot,
      audioDirectory,
      'custom',
    );

    const configPath = path.join(sourceDirectory, 'audioOverrides.json');
    const relativeAudioPath =
      mimeType === 'audio/wav'
        ? PROJECT_AUDIO_WAV_RELATIVE_PATHS[sound]
        : PROJECT_AUDIO_RELATIVE_PATHS[sound];
    const targetName = path.basename(relativeAudioPath);
    const targetPath = path.join(customDirectory, targetName);
    await assertSafeFile(projectRoot, configPath);
    await assertSafeFile(projectRoot, targetPath);

    const previousConfig = await readOptionalFile(configPath);
    const previousAudio = await readOptionalFile(targetPath);
    const nextConfig = parseOverrideConfig(previousConfig);
    nextConfig[sound] = relativeAudioPath;

    try {
      await atomicWrite(targetPath, bytes);
      await atomicWrite(
        configPath,
        Buffer.from(`${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8'),
      );
      await this.options.buildProject(project);
      return `public/${relativeAudioPath}`;
    } catch (error) {
      await restoreFile(targetPath, previousAudio);
      await restoreFile(configPath, previousConfig);
      throw new Error('应用音效后项目构建失败，已经恢复修改前的版本。', {
        cause: error,
      });
    }
  }
}

async function resolveConfigPath(
  project: ProjectRecord,
): Promise<{ projectRoot: string; configPath: string }> {
  if (!isFixedProductMode(project)) {
    throw new Error('只允许读取 Phaser 3 · 2D 横版平台项目的音效。');
  }
  const projectLink = await lstat(project.path);
  if (projectLink.isSymbolicLink() || !projectLink.isDirectory()) {
    throw new Error('项目目录无效或不安全，无法读取音效。');
  }
  const projectRoot = await realpath(project.path);
  const sourceDirectory = await safeExistingDirectory(projectRoot, 'src');
  const configPath = path.join(sourceDirectory, 'audioOverrides.json');
  await assertSafeFile(projectRoot, configPath);
  return { projectRoot, configPath };
}

export function assertMp3(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 3) {
    throw new Error('音效文件为空或格式无效。');
  }
  if (bytes.byteLength > PROJECT_AUDIO_MAX_BYTES) {
    throw new Error('音效文件超过 1 MiB 安全上限。');
  }
  const hasId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const hasFrameSync = bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
  if (!hasId3 && !hasFrameSync) {
    throw new Error('音效不是有效的 MP3 文件。');
  }
}

export function assertAudioBytes(
  bytes: Uint8Array,
  mimeType: AudioPreviewMimeType,
): void {
  if (mimeType === 'audio/wav') {
    assertWav(bytes);
    return;
  }
  assertMp3(bytes);
}

function assertWav(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 44) {
    throw new Error('音效不是有效的 WAV 文件。');
  }
  if (bytes.byteLength > PROJECT_AUDIO_MAX_BYTES) {
    throw new Error('音效文件超过 1 MiB 安全上限。');
  }
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  const wave = String.fromCharCode(...bytes.slice(8, 12));
  const format = String.fromCharCode(...bytes.slice(12, 16));
  const data = String.fromCharCode(...bytes.slice(36, 40));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isPcmMono16 =
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 44_100 &&
    view.getUint16(34, true) === 16;
  if (
    signature !== 'RIFF' ||
    wave !== 'WAVE' ||
    format !== 'fmt ' ||
    data !== 'data' ||
    !isPcmMono16
  ) {
    throw new Error('音效不是有效的 WAV 文件。');
  }
}

function assertGameSoundSlot(value: string): asserts value is GameSoundSlot {
  if (!GAME_SOUND_SLOTS.some((sound) => sound === value)) {
    throw new Error('音效用途无效。');
  }
}

async function safeExistingDirectory(
  root: string,
  relativePath: string,
): Promise<string> {
  const candidate = path.join(root, relativePath);
  const info = await lstat(candidate);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error('项目音效目录无效或不安全。');
  }
  const resolved = await realpath(candidate);
  assertContained(root, resolved);
  return resolved;
}

async function safeChildDirectory(
  root: string,
  parent: string,
  name: string,
): Promise<string> {
  const candidate = path.join(parent, name);
  try {
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('项目自定义音效目录无效或不安全。');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(candidate, { mode: 0o700 });
  }
  const resolved = await realpath(candidate);
  assertContained(root, resolved);
  return resolved;
}

async function assertSafeFile(root: string, candidate: string): Promise<void> {
  assertContained(root, candidate);
  try {
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error('项目音效文件无效或不安全。');
    }
    assertContained(root, await realpath(candidate));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function assertContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('拒绝写入项目目录以外的位置。');
  }
}

async function readOptionalFile(
  candidate: string,
): Promise<Buffer | undefined> {
  try {
    return await readFile(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseOverrideConfig(
  bytes: Buffer | undefined,
): Record<GameSoundSlot, string | null> {
  const result = Object.fromEntries(
    GAME_SOUND_SLOTS.map((sound) => [sound, null]),
  ) as Record<GameSoundSlot, string | null>;
  if (!bytes) return result;
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as Record<
      string,
      unknown
    >;
    for (const sound of GAME_SOUND_SLOTS) {
      const configured = parsed[sound];
      if (
        configured === PROJECT_AUDIO_RELATIVE_PATHS[sound] ||
        configured === PROJECT_AUDIO_WAV_RELATIVE_PATHS[sound]
      ) {
        result[sound] = configured;
      }
    }
    return result;
  } catch {
    throw new Error('项目音效覆盖配置已损坏，请先恢复该文件。');
  }
}

async function atomicWrite(
  candidate: string,
  bytes: Uint8Array,
): Promise<void> {
  const temporary = path.join(
    path.dirname(candidate),
    `.${path.basename(candidate)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, candidate);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function restoreFile(
  candidate: string,
  previous: Buffer | undefined,
): Promise<void> {
  if (previous) {
    await atomicWrite(candidate, previous);
    return;
  }
  await unlink(candidate).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
