import { describe, expect, it } from 'vitest';
import { LOCAL_SFX, mayPlayLocalSfx, resolveLocalSfxPath } from '../localSfx';

describe('LOCAL_SFX', () => {
  it('defines six unique, local-only and bounded sound effects', () => {
    const values = Object.values(LOCAL_SFX);
    expect(values).toHaveLength(6);
    expect(new Set(values.map((value) => value.assetKey)).size).toBe(6);
    expect(new Set(values.map((value) => value.path)).size).toBe(6);
    for (const value of values) {
      expect(value.path).toMatch(/^assets\/audio\/[a-z-]+\.wav$/);
      expect(value.path).not.toMatch(/^https?:/);
      expect(value.volume).toBeGreaterThan(0);
      expect(value.volume).toBeLessThanOrEqual(0.6);
      expect(value.minimumIntervalMs).toBeGreaterThanOrEqual(60);
    }
  });

  it('allows the first play and rejects repeats inside the configured interval', () => {
    expect(mayPlayLocalSfx(undefined, 1_000, 100)).toBe(true);
    expect(mayPlayLocalSfx(1_000, 1_099, 100)).toBe(false);
    expect(mayPlayLocalSfx(1_000, 1_100, 100)).toBe(true);
  });

  it('uses only the exact per-sound MP3 or WAV custom path and otherwise keeps the built-in WAV', () => {
    expect(
      resolveLocalSfxPath('jump', {
        jump: 'assets/audio/custom/jump.mp3',
      }),
    ).toBe('assets/audio/custom/jump.mp3');
    expect(
      resolveLocalSfxPath('jump', {
        jump: 'assets/audio/custom/jump.wav',
      }),
    ).toBe('assets/audio/custom/jump.wav');
    expect(
      resolveLocalSfxPath('jump', {
        jump: 'https://example.com/unsafe.mp3',
      }),
    ).toBe('assets/audio/jump.wav');
    expect(
      resolveLocalSfxPath('jump', {
        jump: 'assets/audio/custom/death.mp3',
      }),
    ).toBe('assets/audio/jump.wav');
  });
});
