import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const MAX_PEAK = 0.88;
const OUTPUT_DIRECTORY = fileURLToPath(
  new URL('../preview-assets/local-sfx/', import.meta.url),
);

const designs = [
  {
    file: 'jump.wav',
    label: '跳跃',
    description: '轻快向上的卡通弹跳声',
    duration: 0.42,
    build(samples) {
      addOscillator(samples, {
        start: 0,
        duration: 0.25,
        from: 245,
        to: 720,
        gain: 0.58,
        wave: 'triangle',
        releasePower: 1.7,
      });
      addOscillator(samples, {
        start: 0.055,
        duration: 0.22,
        from: 420,
        to: 910,
        gain: 0.2,
        wave: 'sine',
        releasePower: 2.2,
      });
      addNoise(samples, {
        start: 0,
        duration: 0.045,
        gain: 0.08,
        seed: 101,
        smoothing: 0.35,
      });
    },
  },
  {
    file: 'coin.wav',
    label: '金币',
    description: '两段式清脆拾取提示声',
    duration: 0.5,
    build(samples) {
      addBell(samples, 0, 0.16, 987.77, 0.52);
      addBell(samples, 0.125, 0.3, 1_318.51, 0.58);
      addOscillator(samples, {
        start: 0.135,
        duration: 0.2,
        from: 1_978,
        to: 2_150,
        gain: 0.09,
        wave: 'sine',
        releasePower: 3,
      });
    },
  },
  {
    file: 'death.wav',
    label: '死亡',
    description: '短促下坠、明确但不过分刺耳',
    duration: 0.92,
    build(samples) {
      addOscillator(samples, {
        start: 0,
        duration: 0.74,
        from: 390,
        to: 62,
        gain: 0.46,
        wave: 'saw',
        releasePower: 1.1,
      });
      addOscillator(samples, {
        start: 0.03,
        duration: 0.66,
        from: 195,
        to: 48,
        gain: 0.3,
        wave: 'sine',
        releasePower: 1.25,
      });
      addNoise(samples, {
        start: 0,
        duration: 0.24,
        gain: 0.18,
        seed: 303,
        smoothing: 0.08,
      });
    },
  },
  {
    file: 'level-clear.wav',
    label: '通关',
    description: '四级上行的胜利小旋律',
    duration: 1.38,
    build(samples) {
      const notes = [523.25, 659.25, 783.99, 1_046.5];
      const starts = [0, 0.2, 0.4, 0.64];
      notes.forEach((frequency, index) => {
        addBell(
          samples,
          starts[index],
          index === notes.length - 1 ? 0.62 : 0.3,
          frequency,
          index === notes.length - 1 ? 0.55 : 0.4,
        );
      });
      addEcho(samples, 0.105, 0.16);
    },
  },
  {
    file: 'enemy-hit.wav',
    label: '击中敌人',
    description: '有力度的碰撞与短促回弹',
    duration: 0.4,
    build(samples) {
      addNoise(samples, {
        start: 0,
        duration: 0.105,
        gain: 0.5,
        seed: 505,
        smoothing: 0.18,
      });
      addOscillator(samples, {
        start: 0,
        duration: 0.21,
        from: 210,
        to: 76,
        gain: 0.56,
        wave: 'square',
        releasePower: 2.4,
      });
      addOscillator(samples, {
        start: 0.065,
        duration: 0.19,
        from: 520,
        to: 250,
        gain: 0.16,
        wave: 'triangle',
        releasePower: 2.7,
      });
    },
  },
  {
    file: 'checkpoint.wav',
    label: '检查点',
    description: '明亮安心的三段激活提示声',
    duration: 0.88,
    build(samples) {
      [659.25, 880, 1_174.66].forEach((frequency, index) => {
        addBell(samples, index * 0.15, 0.34, frequency, 0.42);
      });
      addOscillator(samples, {
        start: 0.34,
        duration: 0.38,
        from: 1_175,
        to: 1_420,
        gain: 0.12,
        wave: 'sine',
        releasePower: 2.2,
      });
      addEcho(samples, 0.085, 0.12);
    },
  },
];

await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

const manifest = [];
for (const design of designs) {
  const samples = new Float64Array(
    Math.max(1, Math.round(design.duration * SAMPLE_RATE)),
  );
  design.build(samples);
  finalize(samples);
  const wav = encodeMonoPcm16(samples);
  await fs.writeFile(path.join(OUTPUT_DIRECTORY, design.file), wav);
  manifest.push({
    file: design.file,
    label: design.label,
    description: design.description,
    durationSeconds: Number((samples.length / SAMPLE_RATE).toFixed(3)),
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bitsPerSample: 16,
    peak: Number(measurePeak(samples).toFixed(4)),
    bytes: wav.length,
  });
}

await fs.writeFile(
  path.join(OUTPUT_DIRECTORY, 'manifest.json'),
  `${JSON.stringify({ generatedBy: 'liimit.ai local deterministic synthesizer', apiUsed: false, sounds: manifest }, null, 2)}\n`,
  'utf8',
);

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

function addBell(samples, start, duration, frequency, gain) {
  addOscillator(samples, {
    start,
    duration,
    from: frequency,
    to: frequency * 1.005,
    gain,
    wave: 'sine',
    releasePower: 2.5,
  });
  addOscillator(samples, {
    start,
    duration: duration * 0.72,
    from: frequency * 2.01,
    to: frequency * 2,
    gain: gain * 0.22,
    wave: 'sine',
    releasePower: 3.2,
  });
}

function addOscillator(
  samples,
  {
    start,
    duration,
    from,
    to = from,
    gain,
    wave,
    attack = 0.004,
    releasePower = 2,
  },
) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const count = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  const last = Math.min(samples.length, first + count);
  for (let index = first; index < last; index += 1) {
    const elapsed = (index - first) / SAMPLE_RATE;
    const progress = Math.min(1, elapsed / duration);
    const phase =
      Math.PI *
      2 *
      (from * elapsed + ((to - from) * elapsed * elapsed) / (2 * duration));
    const attackEnvelope = Math.min(1, elapsed / Math.max(attack, 1 / SAMPLE_RATE));
    const releaseEnvelope = Math.pow(Math.max(0, 1 - progress), releasePower);
    samples[index] +=
      waveform(phase, wave) * gain * attackEnvelope * releaseEnvelope;
  }
}

function addNoise(
  samples,
  { start, duration, gain, seed, smoothing = 0.2 },
) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const count = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  const last = Math.min(samples.length, first + count);
  let state = seed >>> 0;
  let filtered = 0;
  for (let index = first; index < last; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const raw = ((state >>> 0) / 0xffffffff) * 2 - 1;
    filtered += (raw - filtered) * smoothing;
    const progress = (index - first) / count;
    const envelope = Math.pow(Math.max(0, 1 - progress), 2.4);
    samples[index] += filtered * gain * envelope;
  }
}

function addEcho(samples, delaySeconds, feedback) {
  const delay = Math.max(1, Math.round(delaySeconds * SAMPLE_RATE));
  for (let index = delay; index < samples.length; index += 1) {
    samples[index] += samples[index - delay] * feedback;
  }
}

function waveform(phase, type) {
  const sine = Math.sin(phase);
  if (type === 'square') return sine >= 0 ? 1 : -1;
  if (type === 'triangle') return (2 / Math.PI) * Math.asin(sine);
  if (type === 'saw') {
    const cycle = phase / (Math.PI * 2);
    return 2 * (cycle - Math.floor(cycle + 0.5));
  }
  return sine;
}

function finalize(samples) {
  const fadeSamples = Math.min(
    Math.floor(SAMPLE_RATE * 0.008),
    Math.floor(samples.length / 2),
  );
  for (let index = 0; index < fadeSamples; index += 1) {
    const fadeIn = index / Math.max(1, fadeSamples - 1);
    const fadeOut = (fadeSamples - index - 1) / Math.max(1, fadeSamples - 1);
    samples[index] *= fadeIn;
    samples[samples.length - fadeSamples + index] *= fadeOut;
  }
  const peak = measurePeak(samples);
  const scale = peak > 0 ? MAX_PEAK / peak : 1;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.max(-MAX_PEAK, Math.min(MAX_PEAK, samples[index] * scale));
  }
}

function measurePeak(samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

function encodeMonoPcm16(samples) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.round(samples[index] * 32767);
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, value)), 44 + index * 2);
  }
  return wav;
}
