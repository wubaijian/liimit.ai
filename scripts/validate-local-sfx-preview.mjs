import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(
  new URL('../preview-assets/local-sfx/', import.meta.url),
);
const expectedFiles = [
  'jump.wav',
  'coin.wav',
  'death.wav',
  'level-clear.wav',
  'enemy-hit.wav',
  'checkpoint.wav',
];
const reports = [];

for (const file of expectedFiles) {
  const bytes = await fs.readFile(path.join(directory, file));
  assert(bytes.toString('ascii', 0, 4) === 'RIFF', `${file}: missing RIFF`);
  assert(bytes.toString('ascii', 8, 12) === 'WAVE', `${file}: missing WAVE`);
  assert(bytes.toString('ascii', 12, 16) === 'fmt ', `${file}: missing fmt`);
  assert(bytes.readUInt16LE(20) === 1, `${file}: expected PCM`);
  assert(bytes.readUInt16LE(22) === 1, `${file}: expected mono`);
  assert(bytes.readUInt32LE(24) === 44_100, `${file}: expected 44.1 kHz`);
  assert(bytes.readUInt16LE(34) === 16, `${file}: expected 16-bit`);
  assert(bytes.toString('ascii', 36, 40) === 'data', `${file}: missing data`);

  const dataSize = bytes.readUInt32LE(40);
  assert(dataSize === bytes.length - 44, `${file}: invalid data size`);
  let peak = 0;
  let squareSum = 0;
  const sampleCount = dataSize / 2;
  for (let offset = 44; offset < bytes.length; offset += 2) {
    const sample = bytes.readInt16LE(offset) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    squareSum += sample * sample;
  }
  const rms = Math.sqrt(squareSum / sampleCount);
  assert(peak <= 0.9, `${file}: peak clips (${peak})`);
  assert(rms > 0.01, `${file}: audio is effectively silent`);
  reports.push({
    file,
    durationSeconds: Number((sampleCount / 44_100).toFixed(3)),
    peak: Number(peak.toFixed(4)),
    rms: Number(rms.toFixed(4)),
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
}

assert(
  new Set(reports.map((report) => report.sha256)).size === reports.length,
  'Sound files are not all unique',
);

process.stdout.write(
  `${JSON.stringify({ valid: true, unique: true, sounds: reports }, null, 2)}\n`,
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
