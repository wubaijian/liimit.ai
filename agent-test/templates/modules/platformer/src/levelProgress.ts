export const LEVEL_PROGRESS_STORAGE_KEY = 'liimit.ai:level-progress:v1';

export interface LevelBestResult {
  bestStars: number;
  fewestDeaths: number;
}

export type LevelProgress = Record<string, LevelBestResult>;

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SavedLevelResult {
  best: LevelBestResult;
  improved: boolean;
  persisted: boolean;
}

const LEVEL_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function loadLevelProgress(storage?: ProgressStorage): LevelProgress {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LEVEL_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const progress: LevelProgress = {};
    for (const [levelId, result] of Object.entries(value)) {
      if (
        Object.keys(progress).length >= 1_000 ||
        !LEVEL_ID_PATTERN.test(levelId) ||
        !isLevelBestResult(result)
      ) {
        continue;
      }
      progress[levelId] = result;
    }
    return progress;
  } catch {
    return {};
  }
}

export function saveLevelResult(
  storage: ProgressStorage | undefined,
  levelId: string,
  stars: number,
  deaths: number,
): SavedLevelResult {
  const safeStars = Number.isFinite(stars)
    ? Math.min(3, Math.max(1, Math.round(stars)))
    : 1;
  const safeDeaths = Number.isFinite(deaths)
    ? Math.min(999_999, Math.max(0, Math.round(deaths)))
    : 0;
  const progress = loadLevelProgress(storage);
  const previous = progress[levelId];
  const best = {
    bestStars: Math.max(previous?.bestStars ?? 0, safeStars),
    fewestDeaths: Math.min(previous?.fewestDeaths ?? safeDeaths, safeDeaths),
  };
  const improved =
    !previous ||
    best.bestStars > previous.bestStars ||
    best.fewestDeaths < previous.fewestDeaths;
  progress[levelId] = best;
  if (!storage || !LEVEL_ID_PATTERN.test(levelId)) {
    return { best, improved, persisted: false };
  }
  try {
    storage.setItem(LEVEL_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return { best, improved, persisted: true };
  } catch {
    return { best, improved, persisted: false };
  }
}

function isLevelBestResult(value: unknown): value is LevelBestResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    Object.keys(result).length === 2 &&
    Number.isInteger(result.bestStars) &&
    typeof result.bestStars === 'number' &&
    result.bestStars >= 1 &&
    result.bestStars <= 3 &&
    Number.isInteger(result.fewestDeaths) &&
    typeof result.fewestDeaths === 'number' &&
    result.fewestDeaths >= 0 &&
    result.fewestDeaths <= 999_999
  );
}
