import { describe, expect, it, vi } from 'vitest';
import {
  pauseAndResetOtherCandidates,
  removeCandidatePlayer,
  replayCandidateFromStart,
  type CandidateAudioPlayer,
} from './audioCandidatePlayback';

function player(currentTime = 0): CandidateAudioPlayer & {
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
} {
  return {
    currentTime,
    pause: vi.fn(),
    play: vi.fn(async () => undefined),
  };
}

describe('candidate audio playback', () => {
  it('pauses and resets every candidate except the one that started playing', () => {
    const first = player(0.4);
    const second = player(0.2);
    const third = player(0.8);
    const players = new Map([
      [1, first],
      [2, second],
      [3, third],
    ]);

    pauseAndResetOtherCandidates(players, 2);

    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.currentTime).toBe(0);
    expect(second.pause).not.toHaveBeenCalled();
    expect(second.currentTime).toBe(0.2);
    expect(third.pause).toHaveBeenCalledOnce();
    expect(third.currentTime).toBe(0);
  });

  it('does not reset the active candidate when native pause and continue are used', () => {
    const active = player(0.7);
    pauseAndResetOtherCandidates(new Map([[2, active]]), 2);
    expect(active.pause).not.toHaveBeenCalled();
    expect(active.currentTime).toBe(0.7);
  });

  it('replays the target from zero after stopping all other candidates', async () => {
    const first = player(0.3);
    const second = player(0.9);
    const players = new Map([
      [1, first],
      [2, second],
    ]);

    await replayCandidateFromStart(players, 2);

    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.currentTime).toBe(0);
    expect(second.currentTime).toBe(0);
    expect(second.play).toHaveBeenCalledOnce();
  });

  it('stops, resets, and removes an unmounted candidate', () => {
    const removed = player(0.6);
    const players = new Map([[1, removed]]);

    removeCandidatePlayer(players, 1);

    expect(removed.pause).toHaveBeenCalledOnce();
    expect(removed.currentTime).toBe(0);
    expect(players.has(1)).toBe(false);
  });
});
