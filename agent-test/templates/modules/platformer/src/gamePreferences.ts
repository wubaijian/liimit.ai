export const SOUND_VOLUME_STEPS = [0.25, 0.5, 0.75, 1] as const;

export type SoundVolume = (typeof SOUND_VOLUME_STEPS)[number];

export interface GamePreferences {
  showGrid: boolean;
  showControlHints: boolean;
  soundEnabled: boolean;
  soundVolume: SoundVolume;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_GAME_PREFERENCES: GamePreferences = {
  showGrid: true,
  showControlHints: true,
  soundEnabled: true,
  soundVolume: 1,
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
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_GAME_PREFERENCES.soundEnabled,
      soundVolume: isSoundVolume(parsed.soundVolume)
        ? parsed.soundVolume
        : DEFAULT_GAME_PREFERENCES.soundVolume,
    };
  } catch {
    return { ...DEFAULT_GAME_PREFERENCES };
  }
}

export function getNextSoundVolume(current: SoundVolume): SoundVolume {
  const currentIndex = SOUND_VOLUME_STEPS.indexOf(current);
  return SOUND_VOLUME_STEPS[(currentIndex + 1) % SOUND_VOLUME_STEPS.length];
}

function isSoundVolume(value: unknown): value is SoundVolume {
  return SOUND_VOLUME_STEPS.some((step) => step === value);
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
