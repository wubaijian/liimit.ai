import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseLevelCampaign } from '../shared/levelCampaign.js';
import { parseGameInfo } from '../shared/gameInfo.js';

/** Reject untouched calibration workspaces and edits to names/test helpers only. */
export function foundationGameIsReady(
  before: unknown,
  after: unknown,
  info: unknown,
): boolean {
  try {
    const original = parseLevelCampaign(before);
    const next = parseLevelCampaign(after);
    const game = parseGameInfo(info);
    if (
      game.title.includes('待 AI 创建') ||
      next.levels.some((level) => level.name.includes('待 AI 创建'))
    )
      return false;
    const gameplay = (campaign: typeof next) =>
      JSON.stringify(
        campaign.levels.map((level) => ({
          document: {
            ...level.document,
            objects: level.document.objects.map(
              ({ id: _id, ...object }) => object,
            ),
          },
          abilities: level.abilities,
        })),
      );
    return gameplay(original) !== gameplay(next);
  } catch {
    return false;
  }
}

export async function readFoundationJson(
  root: string,
  relative: string,
): Promise<unknown> {
  const resolvedRoot = await realpath(root);
  const file = path.resolve(resolvedRoot, relative);
  if (!file.startsWith(resolvedRoot + path.sep))
    throw new Error('游戏文件路径无效。');
  let current = resolvedRoot;
  for (const part of path.relative(resolvedRoot, file).split(path.sep)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink())
      throw new Error('游戏文件不能使用符号链接。');
  }
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
    throw new Error('游戏文件过大或无效。');
  return JSON.parse(await readFile(file, 'utf8'));
}
