import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rm,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ProjectRemovalService,
  validateRemoveProjectInput,
} from '../src/main/projectRemovalService.js';
import type { ProjectRecord } from '../src/shared/types.js';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'liimit-removal-')),
  );
  roots.push(root);
  const project = {
    id: 'p1',
    name: '临时游戏',
    path: path.join(root, 'game'),
    status: 'draft',
  } as ProjectRecord;
  await mkdir(path.join(project.path, '.gameagent'), { recursive: true });
  await writeFile(
    path.join(project.path, '.gameagent/project.json'),
    JSON.stringify(project),
  );
  await writeFile(path.join(project.path, 'keep.txt'), 'keep');
  const options = {
    getProject: () => project,
    getProjects: () => [project],
    isBusy: () => false,
    confirm: vi.fn(async () => true),
    trash: vi.fn(async (_target: string) => {}),
    removeRecord: vi.fn(async (_id: string) => {}),
    stopPreview: vi.fn(async (_id: string) => {}),
    protectedPaths: [root],
  };
  return {
    root,
    project,
    options,
    service: new ProjectRemovalService(options),
  };
}
it('validates exact modes and bounded ids', () => {
  for (const value of [
    null,
    {},
    { projectId: 'p', mode: 'permanent' },
    { projectId: '', mode: 'trash' },
    { projectId: 'x'.repeat(161), mode: 'trash' },
  ])
    expect(() => validateRemoveProjectInput(value)).toThrow();
});
it('list-only preserves files and removes only the requested record', async () => {
  const f = await fixture();
  expect(
    await f.service.remove({ projectId: 'p1', mode: 'list-only' }),
  ).toEqual({ projectId: 'p1', removed: true });
  expect(f.options.trash).not.toHaveBeenCalled();
  expect(f.options.removeRecord).toHaveBeenCalledWith('p1');
  expect(await readFile(path.join(f.project.path, 'keep.txt'), 'utf8')).toBe(
    'keep',
  );
});
it('cancel does not touch files, record or preview', async () => {
  const f = await fixture();
  f.options.confirm.mockResolvedValue(false);
  expect(
    (await f.service.remove({ projectId: 'p1', mode: 'trash' })).removed,
  ).toBe(false);
  expect(f.options.trash).not.toHaveBeenCalled();
  expect(f.options.removeRecord).not.toHaveBeenCalled();
  expect(f.options.stopPreview).not.toHaveBeenCalled();
});
it('trashes the verified exact directory before removing record', async () => {
  const f = await fixture();
  await f.service.remove({ projectId: 'p1', mode: 'trash' });
  expect(f.options.trash).toHaveBeenCalledWith(f.project.path);
  expect(f.options.trash.mock.invocationCallOrder[0]).toBeLessThan(
    f.options.removeRecord.mock.invocationCallOrder[0]!,
  );
});
it('trash failure retains record; storage failure explains recovery; locks release', async () => {
  const f = await fixture();
  f.options.trash.mockRejectedValueOnce(new Error('denied'));
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'trash' }),
  ).rejects.toThrow();
  expect(f.options.removeRecord).not.toHaveBeenCalled();
  f.options.removeRecord.mockRejectedValueOnce(new Error('disk'));
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'trash' }),
  ).rejects.toThrow('已移到废纸篓');
  expect(f.service.busy).toBe(false);
});
it('rejects busy, changed identity and concurrent removal', async () => {
  const f = await fixture();
  f.options.isBusy = () => true;
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'list-only' }),
  ).rejects.toThrow('正在');
  f.options.isBusy = () => false;
  let release!: (v: boolean) => void;
  f.options.confirm.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const first = f.service.remove({ projectId: 'p1', mode: 'list-only' });
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'list-only' }),
  ).rejects.toThrow();
  release(false);
  await first;
  f.options.confirm.mockResolvedValue(true);
  await writeFile(
    path.join(f.project.path, '.gameagent/project.json'),
    JSON.stringify({ ...f.project, id: 'wrong' }),
  );
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'trash' }),
  ).rejects.toThrow('身份');
});
it('rejects protected, overlapping and symlink targets', async () => {
  const f = await fixture();
  f.options.protectedPaths.push(f.project.path);
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'trash' }),
  ).rejects.toThrow('保护');
  f.options.protectedPaths.pop();
  f.options.getProjects = () => [
    f.project,
    { ...f.project, id: 'nested', path: path.join(f.project.path, 'nested') },
  ];
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'trash' }),
  ).rejects.toThrow('重叠');
  f.options.getProjects = () => [f.project];
  const link = path.join(f.root, 'alias');
  await symlink(f.project.path, link);
  f.project.path = link;
  await expect(
    f.service.remove({ projectId: 'p1', mode: 'trash' }),
  ).rejects.toThrow('符号链接');
  expect(f.options.trash).not.toHaveBeenCalled();
});
