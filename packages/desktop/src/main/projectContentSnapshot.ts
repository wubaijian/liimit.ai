import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Only game inputs: exclude credentials, dependencies, logs and build output. */
export async function projectContentSnapshot(
  root: string,
): Promise<string | null> {
  const hash = createHash('sha256');
  let count = 0;
  let bytes = 0;
  async function visit(relative: string): Promise<void> {
    const file = path.join(root, relative);
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw new Error('Linked game input');
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort())
        await visit(path.join(relative, name));
    } else if (info.isFile()) {
      if (++count > 10000 || (bytes += info.size) > 512 * 1024 * 1024)
        throw new Error('Snapshot limit');
      hash.update(JSON.stringify([relative, info.size]));
      for await (const chunk of createReadStream(file)) hash.update(chunk);
    }
  }
  try {
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return null;
    for (const name of [
      'src',
      'public',
      'index.html',
      'package.json',
      'package-lock.json',
      'vite.config.js',
      'vite.config.ts',
    ]) {
      try {
        await lstat(path.join(root, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      await visit(name);
    }
    return count ? hash.digest('hex') : null;
  } catch {
    return null;
  }
}
