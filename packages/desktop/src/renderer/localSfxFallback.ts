import {
  AUDIO_PREVIEW_CANDIDATE_NUMBERS,
  type AudioDurationSeconds,
  type AudioPreviewCandidate,
  type AudioPreviewCandidateNumber,
  type GameSoundSlot,
} from '../shared/types';

const SAMPLE_RATE = 44_100;
const WAV_HEADER_BYTES = 44;
const MAX_LOCAL_FILL_COUNT = 2;

interface GenerateMissingLocalCandidatesInput {
  sound: GameSoundSlot;
  durationSeconds: AudioDurationSeconds;
  existingCandidateNumbers: AudioPreviewCandidateNumber[];
}

interface SoundProfile {
  startFrequency: number;
  endFrequency: number;
  harmonic: number;
  noise: number;
  pulseRate: number;
}

const SOUND_PROFILES: Record<GameSoundSlot, SoundProfile> = {
  jump: {
    startFrequency: 260,
    endFrequency: 680,
    harmonic: 0.22,
    noise: 0.015,
    pulseRate: 0,
  },
  coin: {
    startFrequency: 760,
    endFrequency: 1_280,
    harmonic: 0.35,
    noise: 0,
    pulseRate: 10,
  },
  death: {
    startFrequency: 310,
    endFrequency: 72,
    harmonic: 0.18,
    noise: 0.2,
    pulseRate: 0,
  },
  levelClear: {
    startFrequency: 390,
    endFrequency: 880,
    harmonic: 0.3,
    noise: 0,
    pulseRate: 6,
  },
  enemyHit: {
    startFrequency: 190,
    endFrequency: 92,
    harmonic: 0.12,
    noise: 0.42,
    pulseRate: 0,
  },
  checkpoint: {
    startFrequency: 520,
    endFrequency: 780,
    harmonic: 0.28,
    noise: 0.015,
    pulseRate: 7,
  },
};

export function generateMissingLocalCandidates({
  sound,
  durationSeconds,
  existingCandidateNumbers,
}: GenerateMissingLocalCandidatesInput): AudioPreviewCandidate[] {
  const existing = new Set(existingCandidateNumbers);
  const missing = AUDIO_PREVIEW_CANDIDATE_NUMBERS.filter(
    (candidateNumber) => !existing.has(candidateNumber),
  );
  if (missing.length === 0) return [];
  if (missing.length > MAX_LOCAL_FILL_COUNT) {
    throw new Error('本地补齐需要至少保留一条已成功的 API 候选。');
  }
  return missing.map((candidateNumber) => ({
    provider: 'liimit-local',
    model: 'local-sfx-v1',
    sound,
    durationSeconds,
    mimeType: 'audio/wav',
    bytes: synthesizeWav(sound, durationSeconds, candidateNumber),
    latencyMs: 0,
    candidateNumber,
  }));
}

function synthesizeWav(
  sound: GameSoundSlot,
  durationSeconds: AudioDurationSeconds,
  candidateNumber: AudioPreviewCandidateNumber,
): Uint8Array {
  const sampleCount = Math.round(SAMPLE_RATE * durationSeconds);
  const bytes = new Uint8Array(WAV_HEADER_BYTES + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  const profile = SOUND_PROFILES[sound];
  const variation = [0.92, 1, 1.08][candidateNumber - 1]!;
  let phase = 0;
  let seed = 2_659_443_761 ^ candidateNumber ^ sound.length;
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / Math.max(1, sampleCount - 1);
    const seconds = index / SAMPLE_RATE;
    const frequency =
      (profile.startFrequency +
        (profile.endFrequency - profile.startFrequency) * progress) *
      variation;
    phase += (Math.PI * 2 * frequency) / SAMPLE_RATE;
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    const noise = seed / 0xffff_ffff - 0.5;
    const attack = Math.min(1, progress / 0.025);
    const release = Math.pow(
      Math.max(0, 1 - progress),
      sound === 'coin' ? 2.2 : 1.35,
    );
    const pulse = profile.pulseRate
      ? 0.68 +
        0.32 * Math.max(0, Math.sin(seconds * Math.PI * profile.pulseRate))
      : 1;
    const tone =
      Math.sin(phase) +
      profile.harmonic * Math.sin(phase * (candidateNumber + 1));
    const sample =
      (tone * (1 - profile.noise) + noise * profile.noise * 2) *
      attack *
      release *
      pulse *
      0.58;
    view.setInt16(
      WAV_HEADER_BYTES + index * 2,
      Math.round(Math.max(-1, Math.min(1, sample)) * 32_767),
      true,
    );
  }
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}
