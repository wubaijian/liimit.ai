export interface CandidateAudioPlayer {
  currentTime: number;
  pause(): void;
  play(): Promise<void>;
}

export function pauseAndResetOtherCandidates(
  players: ReadonlyMap<number, CandidateAudioPlayer>,
  activeCandidate: number,
): void {
  for (const [candidateNumber, player] of players) {
    if (candidateNumber === activeCandidate) continue;
    player.pause();
    player.currentTime = 0;
  }
}

export async function replayCandidateFromStart(
  players: ReadonlyMap<number, CandidateAudioPlayer>,
  candidateNumber: number,
): Promise<void> {
  const player = players.get(candidateNumber);
  if (!player) throw new Error('候选播放器已失效。');
  pauseAndResetOtherCandidates(players, candidateNumber);
  player.currentTime = 0;
  await player.play();
}

export function removeCandidatePlayer(
  players: Map<number, CandidateAudioPlayer>,
  candidateNumber: number,
): void {
  const player = players.get(candidateNumber);
  if (!player) return;
  player.pause();
  player.currentTime = 0;
  players.delete(candidateNumber);
}
