import bundledAudioOverrides from './audioOverrides.json';

const DEFAULT_SFX_PATHS = {
  jump: 'assets/audio/jump.wav',
  coin: 'assets/audio/coin.wav',
  death: 'assets/audio/death.wav',
  levelClear: 'assets/audio/level-clear.wav',
  enemyHit: 'assets/audio/enemy-hit.wav',
  checkpoint: 'assets/audio/checkpoint.wav',
} as const;

const CUSTOM_SFX_PATHS = {
  jump: ['assets/audio/custom/jump.mp3', 'assets/audio/custom/jump.wav'],
  coin: ['assets/audio/custom/coin.mp3', 'assets/audio/custom/coin.wav'],
  death: ['assets/audio/custom/death.mp3', 'assets/audio/custom/death.wav'],
  levelClear: [
    'assets/audio/custom/level-clear.mp3',
    'assets/audio/custom/level-clear.wav',
  ],
  enemyHit: [
    'assets/audio/custom/enemy-hit.mp3',
    'assets/audio/custom/enemy-hit.wav',
  ],
  checkpoint: [
    'assets/audio/custom/checkpoint.mp3',
    'assets/audio/custom/checkpoint.wav',
  ],
} as const;

export type LocalSfxName = keyof typeof DEFAULT_SFX_PATHS;

export function resolveLocalSfxPath(
  name: LocalSfxName,
  overrides: unknown,
): string {
  if (!overrides || typeof overrides !== 'object') {
    return DEFAULT_SFX_PATHS[name];
  }
  const configured = (overrides as Record<string, unknown>)[name];
  return CUSTOM_SFX_PATHS[name].some((path) => path === configured)
    ? (configured as string)
    : DEFAULT_SFX_PATHS[name];
}

export const LOCAL_SFX = {
  jump: {
    assetKey: 'liimit-sfx-jump',
    path: resolveLocalSfxPath('jump', bundledAudioOverrides),
    volume: 0.28,
    minimumIntervalMs: 60,
  },
  coin: {
    assetKey: 'liimit-sfx-coin',
    path: resolveLocalSfxPath('coin', bundledAudioOverrides),
    volume: 0.34,
    minimumIntervalMs: 60,
  },
  death: {
    assetKey: 'liimit-sfx-death',
    path: resolveLocalSfxPath('death', bundledAudioOverrides),
    volume: 0.38,
    minimumIntervalMs: 700,
  },
  levelClear: {
    assetKey: 'liimit-sfx-level-clear',
    path: resolveLocalSfxPath('levelClear', bundledAudioOverrides),
    volume: 0.38,
    minimumIntervalMs: 1_200,
  },
  enemyHit: {
    assetKey: 'liimit-sfx-enemy-hit',
    path: resolveLocalSfxPath('enemyHit', bundledAudioOverrides),
    volume: 0.3,
    minimumIntervalMs: 100,
  },
  checkpoint: {
    assetKey: 'liimit-sfx-checkpoint',
    path: resolveLocalSfxPath('checkpoint', bundledAudioOverrides),
    volume: 0.34,
    minimumIntervalMs: 800,
  },
} as const;

export function mayPlayLocalSfx(
  previousPlayedAt: number | undefined,
  now: number,
  minimumIntervalMs: number,
): boolean {
  return (
    Number.isFinite(now) &&
    minimumIntervalMs >= 0 &&
    (previousPlayedAt === undefined ||
      now - previousPlayedAt >= minimumIntervalMs)
  );
}
