export interface GamePreferences {
  showGrid: boolean;
  showControlHints: boolean;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_GAME_PREFERENCES: GamePreferences = {
  showGrid: true,
  showControlHints: true,
};

const PREFERENCES_STORAGE_KEY = 'liimit.ai:platformer-preferences:v1';

export function loadGamePreferences(
  storage?: PreferenceStorage,
): GamePreferences {
  if (!storage) return { ...DEFAULT_GAME_PREFERENCES };
  try {
    const value = storage.getItem(PREFERENCES_STORAGE_KEY);
    if (!value) return { ...DEFAULT_GAME_PREFERENCES };
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      showGrid:
        typeof parsed.showGrid === 'boolean'
          ? parsed.showGrid
          : DEFAULT_GAME_PREFERENCES.showGrid,
      showControlHints:
        typeof parsed.showControlHints === 'boolean'
          ? parsed.showControlHints
          : DEFAULT_GAME_PREFERENCES.showControlHints,
    };
  } catch {
    return { ...DEFAULT_GAME_PREFERENCES };
  }
}

export function saveGamePreferences(
  storage: PreferenceStorage | undefined,
  preferences: GamePreferences,
): void {
  if (!storage) return;
  try {
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}
