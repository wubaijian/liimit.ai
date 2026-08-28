import type { LevelBestResult, LevelProgress } from './levelProgress';

export const LEVELS_PER_SELECTION_PAGE = 6;

export interface SelectableLevel {
  id: string;
  name: string;
}

export interface LevelSelectionEntry {
  id: string;
  name: string;
  index: number;
  unlocked: boolean;
  best?: LevelBestResult;
}

export interface LevelSelectionPage {
  entries: LevelSelectionEntry[];
  page: number;
  pageCount: number;
}

export function getContinueLevelIndex(
  levels: readonly SelectableLevel[],
  progress: LevelProgress,
): number | undefined {
  if (levels.length === 0) return undefined;
  const firstUnfinishedIndex = levels.findIndex((level) => !progress[level.id]);
  if (firstUnfinishedIndex === 0) return undefined;
  if (firstUnfinishedIndex > 0) return firstUnfinishedIndex;
  return levels.length - 1;
}

export function getLevelSelectionPage(
  levels: readonly SelectableLevel[],
  progress: LevelProgress,
  requestedPage: number,
): LevelSelectionPage {
  const pageCount = Math.max(
    1,
    Math.ceil(levels.length / LEVELS_PER_SELECTION_PAGE),
  );
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(requestedPage)));
  const firstIndex = page * LEVELS_PER_SELECTION_PAGE;
  return {
    entries: levels
      .slice(firstIndex, firstIndex + LEVELS_PER_SELECTION_PAGE)
      .map((level, offset) => {
        const index = firstIndex + offset;
        return {
          id: level.id,
          name: level.name,
          index,
          unlocked: index === 0 || Boolean(progress[levels[index - 1]!.id]),
          best: progress[level.id],
        };
      }),
    page,
    pageCount,
  };
}
