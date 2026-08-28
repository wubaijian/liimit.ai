import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateLegacyUserData } from '../src/main/brandMigration.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('liimit.ai 本地数据迁移', () => {
  it('只迁移应用状态、Agent 历史和 API 用量记录', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'liimit-brand-data-'));
    roots.push(root);
    const appDataDirectory = path.join(root, 'app-data');
    const legacyDirectory = path.join(appDataDirectory, 'legacy-brand');
    const userDataDirectory = path.join(appDataDirectory, 'liimit.ai');
    await Promise.all([
      mkdir(path.join(legacyDirectory, 'agent-history'), { recursive: true }),
      mkdir(path.join(legacyDirectory, 'api-usage'), { recursive: true }),
    ]);
    await writeFile(path.join(legacyDirectory, 'state.json'), 'state', 'utf8');
    await writeFile(
      path.join(legacyDirectory, 'agent-history', 'events.jsonl'),
      'event',
      'utf8',
    );
    await writeFile(
      path.join(legacyDirectory, 'unrelated-cache'),
      'leave in place',
      'utf8',
    );

    await expect(
      migrateLegacyUserData({
        appDataDirectory,
        userDataDirectory,
        legacyDirectoryName: 'legacy-brand',
      }),
    ).resolves.toEqual({
      migrated: ['state.json', 'agent-history', 'api-usage'],
      skipped: [],
    });
    await expect(
      readFile(path.join(userDataDirectory, 'state.json'), 'utf8'),
    ).resolves.toBe('state');
    await expect(
      readFile(
        path.join(userDataDirectory, 'agent-history', 'events.jsonl'),
        'utf8',
      ),
    ).resolves.toBe('event');
    await expect(
      readFile(path.join(legacyDirectory, 'unrelated-cache'), 'utf8'),
    ).resolves.toBe('leave in place');
  });

  it('新目录已有数据时不覆盖', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'liimit-brand-conflict-'),
    );
    roots.push(root);
    const appDataDirectory = path.join(root, 'app-data');
    const legacyDirectory = path.join(appDataDirectory, 'legacy-brand');
    const userDataDirectory = path.join(appDataDirectory, 'liimit.ai');
    await Promise.all([
      mkdir(legacyDirectory, { recursive: true }),
      mkdir(userDataDirectory, { recursive: true }),
    ]);
    await writeFile(path.join(legacyDirectory, 'state.json'), 'old', 'utf8');
    await writeFile(path.join(userDataDirectory, 'state.json'), 'new', 'utf8');

    await expect(
      migrateLegacyUserData({
        appDataDirectory,
        userDataDirectory,
        legacyDirectoryName: 'legacy-brand',
      }),
    ).resolves.toEqual({ migrated: [], skipped: ['state.json'] });
    await expect(
      readFile(path.join(userDataDirectory, 'state.json'), 'utf8'),
    ).resolves.toBe('new');
    await expect(
      readFile(path.join(legacyDirectory, 'state.json'), 'utf8'),
    ).resolves.toBe('old');
  });
});
