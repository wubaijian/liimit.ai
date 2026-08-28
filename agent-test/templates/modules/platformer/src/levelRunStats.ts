export const MAX_PLAYER_LIVES = 3;

export interface DeathOutcome {
  remainingLives: number;
  restartFromBeginning: boolean;
}

export function getDeathOutcome(currentLives: number): DeathOutcome {
  const safeLives = Number.isInteger(currentLives)
    ? Math.min(MAX_PLAYER_LIVES, Math.max(1, currentLives))
    : MAX_PLAYER_LIVES;
  const remainingLives = safeLives - 1;
  return remainingLives > 0
    ? { remainingLives, restartFromBeginning: false }
    : { remainingLives: MAX_PLAYER_LIVES, restartFromBeginning: true };
}

export function getLevelStarRating(deathCount: number): number {
  if (deathCount <= 0) return 3;
  if (deathCount <= 2) return 2;
  return 1;
}

export function formatStarRating(stars: number): string {
  const safeStars = Math.min(3, Math.max(1, Math.round(stars)));
  return `${'★'.repeat(safeStars)}${'☆'.repeat(3 - safeStars)}`;
}
