import { lstat, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  ProjectRecord,
  RemoveProjectInput,
  RemoveProjectResult,
} from '../shared/types.js';

export function validateRemoveProjectInput(value: unknown): RemoveProjectInput {
  if (!value || typeof value !== 'object')
    throw new Error('项目移除请求无效。');
  const input = value as Partial<RemoveProjectInput>;
  if (
    typeof input.projectId !== 'string' ||
    !input.projectId.trim() ||
    input.projectId.length > 160 ||
    !['list-only', 'trash'].includes(input.mode ?? '')
  )
    throw new Error('项目 ID 或移除方式无效。');
  return { projectId: input.projectId, mode: input.mode! };
}

interface RemovalOptions {
  getProject(id: string): ProjectRecord;
  getProjects(): ProjectRecord[];
  isBusy(id: string): boolean;
  confirm(
    project: ProjectRecord,
    mode: RemoveProjectInput['mode'],
  ): Promise<boolean>;
  trash(target: string): Promise<void>;
  removeRecord(id: string): Promise<void>;
  stopPreview(id: string): Promise<void>;
  protectedPaths: string[];
}

const contains = (parent: string, child: string) =>
  child === parent ||
  child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

/** No permanent deletion; only trusted registered, independently owned folders. */
export class ProjectRemovalService {
  busy = false;
  constructor(private readonly options: RemovalOptions) {}

  async remove(value: unknown): Promise<RemoveProjectResult> {
    const input = validateRemoveProjectInput(value);
    if (this.busy) throw new Error('正在处理项目移除，请稍后再试。');
    this.busy = true;
    let trashed = false;
    try {
      const project = { ...this.options.getProject(input.projectId) };
      if (project.id !== input.projectId) throw new Error('项目身份不匹配。');
      this.assertIdle(project);
      const original =
        input.mode === 'trash' ? await this.validateTarget(project) : undefined;
      if (!(await this.options.confirm(project, input.mode)))
        return { projectId: project.id, removed: false };
      const latest = this.options.getProject(project.id);
      if (latest.path !== project.path || latest.id !== project.id)
        throw new Error('项目身份已变化，请重新操作。');
      this.assertIdle(latest);
      await this.options.stopPreview(project.id);
      if (input.mode === 'trash') {
        const checked = await this.validateTarget(project);
        if (checked.ino !== original!.ino || checked.dev !== original!.dev)
          throw new Error('项目目录已变化，请重新操作。');
        try {
          await this.options.trash(checked.root);
        } catch {
          throw new Error(
            '未能把项目移到废纸篓，列表记录已保留。请检查目录权限或关闭占用文件的程序后重试。',
          );
        }
        trashed = true;
      }
      await this.options.removeRecord(project.id);
      return { projectId: project.id, removed: true };
    } catch (error) {
      if (trashed)
        throw new Error(
          '项目文件已移到废纸篓，但列表保存失败。请从废纸篓恢复文件，或重试“从列表移除”。',
        );
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private assertIdle(project: ProjectRecord): void {
    if (
      this.options.isBusy(project.id) ||
      project.status === 'running' ||
      project.initialGeneration === 'pending' ||
      project.initialGeneration === 'active' ||
      ['queued', 'preparing'].includes(project.starterPreparation?.status ?? '')
    ) {
      throw new Error(
        '项目正在生成、准备或读写，请先停止任务或等待完成，再移除。',
      );
    }
  }

  private async validateTarget(
    project: ProjectRecord,
  ): Promise<{ root: string; ino: number; dev: number }> {
    if (!path.isAbsolute(project.path))
      throw new Error('项目路径不安全，只能从列表移除。');
    const root = path.resolve(project.path);
    const home = homedir();
    const protectedPaths = [
      path.parse(root).root,
      home,
      ...['Desktop', 'Documents', 'Downloads', 'Library'].map((name) =>
        path.join(home, name),
      ),
      '/Applications',
      ...this.options.protectedPaths,
    ];
    for (const protectedPath of protectedPaths) {
      const canonical = await realpath(protectedPath).catch(() =>
        path.resolve(protectedPath),
      );
      if (contains(root, canonical))
        throw new Error(
          '此路径属于受保护目录，不能整体移到废纸篓；可以只从列表移除。',
        );
    }
    let current = path.parse(root).root;
    for (const part of root
      .slice(current.length)
      .split(path.sep)
      .filter(Boolean)) {
      current = path.join(current, part);
      const info = await lstat(current).catch(() => undefined);
      if (!info) throw new Error('项目目录不存在或无法访问，请只从列表移除。');
      if (info.isSymbolicLink())
        throw new Error('项目路径包含符号链接，请只从列表移除。');
      if (!info.isDirectory()) throw new Error('项目路径不是目录。');
    }
    if ((await realpath(root)) !== root)
      throw new Error('项目路径身份不一致。');
    for (const other of this.options.getProjects()) {
      if (other.id === project.id) continue;
      const otherRoot = await realpath(other.path).catch(() =>
        path.resolve(other.path),
      );
      if (contains(root, otherRoot) || contains(otherRoot, root))
        throw new Error('项目目录与其他项目重叠，请只从列表移除。');
    }
    const metadataDir = path.join(root, '.gameagent');
    const dirInfo = await lstat(metadataDir).catch(() => undefined);
    if (!dirInfo?.isDirectory() || dirInfo.isSymbolicLink())
      throw new Error('无法核验项目身份，请只从列表移除。');
    const metadata = path.join(metadataDir, 'project.json');
    const fileInfo = await lstat(metadata).catch(() => undefined);
    if (
      !fileInfo?.isFile() ||
      fileInfo.isSymbolicLink() ||
      fileInfo.size > 1024 * 1024
    )
      throw new Error('项目身份文件无效，请只从列表移除。');
    const identity = JSON.parse(
      await readFile(metadata, 'utf8'),
    ) as Partial<ProjectRecord>;
    if (identity.id !== project.id || identity.path !== root)
      throw new Error('项目身份不匹配，请只从列表移除。');
    const info = await lstat(root);
    return { root, ino: info.ino, dev: info.dev };
  }
}
