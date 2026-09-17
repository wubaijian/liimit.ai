import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateMissingLocalCandidates } from './localSfxFallback';

const source = readFileSync(
  new URL('./localSfxFallback.ts', import.meta.url),
  'utf8',
);

describe('generateMissingLocalCandidates', () => {
  it('fills only one missing candidate without networking', () => {
    const result = generateMissingLocalCandidates({
      sound: 'jump',
      durationSeconds: 0.5,
      existingCandidateNumbers: [1, 3],
    });
    expect(result.map((candidate) => candidate.candidateNumber)).toEqual([2]);
    expect(result[0]).toMatchObject({
      provider: 'liimit-local',
      model: 'local-sfx-v1',
      mimeType: 'audio/wav',
      sound: 'jump',
      durationSeconds: 0.5,
    });
  });

  it('fills exactly two missing candidates with distinct valid WAV files', () => {
    const result = generateMissingLocalCandidates({
      sound: 'coin',
      durationSeconds: 1,
      existingCandidateNumbers: [2],
    });
    expect(result.map((candidate) => candidate.candidateNumber)).toEqual([
      1, 3,
    ]);
    for (const candidate of result) {
      expect(String.fromCharCode(...candidate.bytes.slice(0, 4))).toBe('RIFF');
      expect(String.fromCharCode(...candidate.bytes.slice(8, 12))).toBe('WAVE');
      expect(candidate.bytes.byteLength).toBe(44 + 44_100 * 2);
      expect(candidate.bytes.byteLength).toBeLessThanOrEqual(1024 * 1024);
    }
    expect([...result[0]!.bytes]).not.toEqual([...result[1]!.bytes]);
  });

  it('returns nothing when all three candidates already exist', () => {
    expect(
      generateMissingLocalCandidates({
        sound: 'death',
        durationSeconds: 1,
        existingCandidateNumbers: [1, 2, 3],
      }),
    ).toEqual([]);
  });

  it('has no network, API bridge or credential access', () => {
    expect(source).not.toMatch(
      /fetch\(|XMLHttpRequest|window\.gameAgent|apiKey/i,
    );
  });
});
