import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { projectContentSnapshot } from '../src/main/projectContentSnapshot.js';

it('detects content changes and deletion but ignores timestamps and build outputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'liimit-snapshot-'));
  try {
    await mkdir(path.join(root, 'src'));
    const file = path.join(root, 'src/game.ts');
    await writeFile(file, 'old');
    const before = await projectContentSnapshot(root);
    expect(before).not.toBeNull();
    await utimes(file, new Date(), new Date());
    await writeFile(path.join(root, 'log.txt'), 'ignored');
    expect(await projectContentSnapshot(root)).toBe(before);
    await writeFile(file, 'new');
    expect(await projectContentSnapshot(root)).not.toBe(before);
    await writeFile(path.join(root, 'src/extra.ts'), 'extra');
    const extra = await projectContentSnapshot(root);
    await rm(path.join(root, 'src/extra.ts'));
    expect(await projectContentSnapshot(root)).not.toBe(extra);
    await symlink(file, path.join(root, 'src/link.ts'));
    expect(await projectContentSnapshot(root)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
