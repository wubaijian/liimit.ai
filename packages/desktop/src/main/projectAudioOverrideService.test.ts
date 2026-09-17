import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_PRODUCT_MODE, type ProjectRecord } from '../shared/types.js';
import {
  PROJECT_AUDIO_MAX_BYTES,
  ProjectAudioOverrideService,
  assertAudioBytes,
  assertMp3,
} from './projectAudioOverrideService.js';

const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0]);
const WAV = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 36, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74,
  0x20, 16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16,
  0, 0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0,
]);

describe('ProjectAudioOverrideService', () => {
  it('writes one fixed MP3 and updates only the selected override before build', async () => {
    const fixture = await createProjectFixture();
    const buildProject = vi.fn(async () => undefined);
    const service = new ProjectAudioOverrideService({ buildProject });

    const relativePath = await service.apply(fixture.project, 'jump', MP3);

    expect(relativePath).toBe('public/assets/audio/custom/jump.mp3');
    expect(await readFile(path.join(fixture.root, relativePath))).toEqual(
      Buffer.from(MP3),
    );
    const config = JSON.parse(
      await readFile(
        path.join(fixture.root, 'src/audioOverrides.json'),
        'utf8',
      ),
    );
    expect(config.jump).toBe('assets/audio/custom/jump.mp3');
    expect(config.coin).toBeNull();
    expect(buildProject).toHaveBeenCalledWith(fixture.project);
  });

  it('writes a validated local WAV override and keeps old MP3 paths compatible', async () => {
    const fixture = await createProjectFixture();
    const service = new ProjectAudioOverrideService({
      buildProject: async () => undefined,
    });
    const relativePath = await service.apply(
      fixture.project,
      'checkpoint',
      WAV,
      'audio/wav',
    );
    expect(relativePath).toBe('public/assets/audio/custom/checkpoint.wav');
    const config = JSON.parse(
      await readFile(
        path.join(fixture.root, 'src/audioOverrides.json'),
        'utf8',
      ),
    );
    expect(config.checkpoint).toBe('assets/audio/custom/checkpoint.wav');
    expect((await service.inspect(fixture.project)).checkpoint).toBe(true);
    expect(() => assertAudioBytes(WAV, 'audio/wav')).not.toThrow();
    expect(() => assertAudioBytes(MP3, 'audio/wav')).toThrow('WAV');
  });

  it('restores the old config and audio when the project build fails', async () => {
    const fixture = await createProjectFixture();
    const target = path.join(
      fixture.root,
      'public/assets/audio/custom/jump.mp3',
    );
    await mkdir(path.dirname(target));
    const previous = Uint8Array.from([0x49, 0x44, 0x33, 0x03]);
    await writeFile(target, previous);
    const originalConfig = await readFile(
      path.join(fixture.root, 'src/audioOverrides.json'),
    );
    const service = new ProjectAudioOverrideService({
      buildProject: async () => {
        throw new Error('build failed');
      },
    });

    await expect(service.apply(fixture.project, 'jump', MP3)).rejects.toThrow(
      '已经恢复',
    );
    expect(await readFile(target)).toEqual(Buffer.from(previous));
    expect(
      await readFile(path.join(fixture.root, 'src/audioOverrides.json')),
    ).toEqual(originalConfig);
  });

  it('rejects invalid and oversized audio before writing', async () => {
    expect(() => assertMp3(Uint8Array.from([1, 2, 3]))).toThrow('有效的 MP3');
    expect(() =>
      assertMp3(new Uint8Array(PROJECT_AUDIO_MAX_BYTES + 1).fill(0x49)),
    ).toThrow('1 MiB');
  });

  it('rejects a custom audio directory symlinked outside the project', async () => {
    const fixture = await createProjectFixture();
    const outside = await mkdtemp(
      path.join(os.tmpdir(), 'liimit-audio-outside-'),
    );
    await symlink(
      outside,
      path.join(fixture.root, 'public/assets/audio/custom'),
      'dir',
    );
    const service = new ProjectAudioOverrideService({
      buildProject: async () => undefined,
    });

    await expect(service.apply(fixture.project, 'coin', MP3)).rejects.toThrow(
      '不安全',
    );
  });

  it('reports six boolean sources and restores only one override without deleting MP3', async () => {
    const fixture = await createProjectFixture();
    const buildProject = vi.fn(async () => undefined);
    const service = new ProjectAudioOverrideService({ buildProject });
    await service.apply(fixture.project, 'coin', MP3);
    expect((await service.inspect(fixture.project)).coin).toBe(true);
    expect((await service.inspect(fixture.project)).jump).toBe(false);

    expect(await service.restore(fixture.project, 'coin')).toBe(true);
    const snapshot = await service.inspect(fixture.project);
    expect(snapshot.coin).toBe(false);
    expect(Object.keys(snapshot)).toHaveLength(6);
    expect(
      await readFile(
        path.join(fixture.root, 'public/assets/audio/custom/coin.mp3'),
      ),
    ).toEqual(Buffer.from(MP3));
  });

  it('does not build when already using the built-in sound and rolls back a failed restore', async () => {
    const fixture = await createProjectFixture();
    const buildProject = vi.fn(async () => undefined);
    const service = new ProjectAudioOverrideService({ buildProject });
    expect(await service.restore(fixture.project, 'death')).toBe(false);
    expect(buildProject).not.toHaveBeenCalled();

    await service.apply(fixture.project, 'death', MP3);
    const failingService = new ProjectAudioOverrideService({
      buildProject: async () => {
        throw new Error('build failed');
      },
    });
    await expect(
      failingService.restore(fixture.project, 'death'),
    ).rejects.toThrow('保留原来的声音');
    expect((await service.inspect(fixture.project)).death).toBe(true);
  });
});

async function createProjectFixture(): Promise<{
  root: string;
  project: ProjectRecord;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'liimit-audio-project-'));
  await mkdir(path.join(root, 'src'));
  await mkdir(path.join(root, 'public/assets/audio'), { recursive: true });
  await writeFile(
    path.join(root, 'src/audioOverrides.json'),
    JSON.stringify({
      jump: null,
      coin: null,
      death: null,
      levelClear: null,
      enemyHit: null,
      checkpoint: null,
    }),
  );
  return {
    root,
    project: {
      id: 'project-audio-test',
      name: '音效测试',
      path: root,
      prompt: 'test',
      status: 'completed',
      stage: 'complete',
      productMode: FIXED_PRODUCT_MODE.id,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  };
}
