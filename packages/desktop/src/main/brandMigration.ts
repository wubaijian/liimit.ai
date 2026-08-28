import { lstat, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const LEGACY_PRODUCT_DIRECTORY = Buffer.from('Tm9vYmkuYWk=', 'base64').toString(
  'utf8',
);
const MIGRATED_ENTRIES = Object.freeze([
  { name: 'state.json', kind: 'file' },
  { name: 'agent-history', kind: 'directory' },
  { name: 'api-usage', kind: 'directory' },
] as const);

interface BrandMigrationOptions {
  appDataDirectory: string;
  userDataDirectory: string;
  legacyDirectoryName?: string;
}

export interface BrandMigrationResult {
  migrated: string[];
  skipped: string[];
}

export async function migrateLegacyUserData({
  appDataDirectory,
  userDataDirectory,
  legacyDirectoryName = LEGACY_PRODUCT_DIRECTORY,
}: BrandMigrationOptions): Promise<BrandMigrationResult> {
  const legacyDirectory = path.join(appDataDirectory, legacyDirectoryName);
  const result: BrandMigrationResult = { migrated: [], skipped: [] };
  if (path.resolve(legacyDirectory) === path.resolve(userDataDirectory)) {
    return result;
  }

  const legacyInfo = await safeLstat(legacyDirectory);
  if (!legacyInfo) return result;
  if (legacyInfo.isSymbolicLink() || !legacyInfo.isDirectory()) {
    throw new Error('旧版用户数据目录无效或为符号链接。');
  }

  await mkdir(userDataDirectory, { recursive: true, mode: 0o700 });
  const targetInfo = await lstat(userDataDirectory);
  if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) {
    throw new Error('新版用户数据目录无效或为符号链接。');
  }

  for (const entry of MIGRATED_ENTRIES) {
    const source = path.join(legacyDirectory, entry.name);
    const destination = path.join(userDataDirectory, entry.name);
    const sourceInfo = await safeLstat(source);
    if (!sourceInfo) continue;
    if (
      sourceInfo.isSymbolicLink() ||
      (entry.kind === 'file' && !sourceInfo.isFile()) ||
      (entry.kind === 'directory' && !sourceInfo.isDirectory())
    ) {
      result.skipped.push(entry.name);
      continue;
    }
    if (await safeLstat(destination)) {
      result.skipped.push(entry.name);
      continue;
    }
    await rename(source, destination);
    result.migrated.push(entry.name);
  }

  return result;
}

async function safeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
}
