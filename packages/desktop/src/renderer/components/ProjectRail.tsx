import { FolderOpen, Plus, Settings } from 'lucide-react';
import type { ProjectRecord, RemoveProjectInput } from '../../shared/types';
import { gameAgentMascot as brandIcon } from '../assets';

interface ProjectRailProps {
  projects: ProjectRecord[];
  selectedId?: string;
  onHome: () => void;
  onSelect: (project: ProjectRecord) => void;
  onCreate: () => void;
  onSettings: () => void;
  onRemove?: (project: ProjectRecord, mode: RemoveProjectInput['mode']) => void;
  removingId?: string;
}

const STATUS_LABEL: Record<ProjectRecord['status'], string> = {
  draft: '待启动',
  running: '生成中',
  waiting: '待继续',
  completed: '已完成',
  failed: '需处理',
  stopped: '已停止',
};

export function ProjectRail({
  projects,
  selectedId,
  onHome,
  onSelect,
  onCreate,
  onSettings,
  onRemove,
  removingId,
}: ProjectRailProps) {
  return (
    <aside className="project-rail">
      <button
        type="button"
        className="brand-block"
        onClick={onHome}
        aria-label="返回首页"
        title="返回首页"
      >
        <div className="brand-mark" aria-hidden="true">
          <img src={brandIcon} alt="" />
        </div>
        <div>
          <strong>liimit.ai</strong>
          <span>AI GAME AGENT</span>
        </div>
      </button>

      <button className="new-project-button" onClick={onCreate}>
        <Plus size={16} />
        新建游戏
      </button>

      <div className="rail-section-label">
        <span>项目</span>
        <span>{String(projects.length).padStart(2, '0')}</span>
      </div>

      <nav className="project-list" aria-label="游戏项目">
        {projects.length === 0 ? (
          <div className="project-empty">
            <FolderOpen size={20} />
            <p>还没有项目</p>
            <span>从一句游戏创意开始</span>
          </div>
        ) : (
          projects.map((project) => (
            <div className="project-row" key={project.id}>
              <button
                className={`project-item ${project.id === selectedId ? 'is-active' : ''}`}
                key={project.id}
                onClick={() => onSelect(project)}
              >
                <span
                  className={`status-dot status-${projectStatusTone(project)}`}
                />
                <span className="project-item-copy">
                  <strong>{project.name}</strong>
                  <small>{projectStatusLabel(project)}</small>
                  <span className="project-mode-label">
                    PHASER 3 · 横版跳跃
                  </span>
                </span>
              </button>
              <details
                className="project-actions"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector('summary')?.focus();
                  }
                }}
                onBlur={(event) => {
                  if (
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    event.currentTarget.open = false;
                }}
              >
                <summary
                  aria-label={`管理项目：${project.name}`}
                  title="管理项目"
                >
                  ⋯
                </summary>
                <div className="project-action-menu">
                  <button
                    type="button"
                    disabled={Boolean(removingId) || projectIsBusy(project)}
                    onClick={(event) => {
                      event.currentTarget
                        .closest('details')
                        ?.removeAttribute('open');
                      onRemove?.(project, 'list-only');
                    }}
                  >
                    从列表移除<span>保留电脑里的游戏文件</span>
                  </button>
                  <button
                    type="button"
                    className="project-trash-action"
                    disabled={Boolean(removingId) || projectIsBusy(project)}
                    onClick={(event) => {
                      event.currentTarget
                        .closest('details')
                        ?.removeAttribute('open');
                      onRemove?.(project, 'trash');
                    }}
                  >
                    删除项目及文件<span>移到废纸篓，可恢复文件</span>
                  </button>
                  {projectIsBusy(project) ? (
                    <small>请先停止任务或等待准备完成</small>
                  ) : null}
                </div>
              </details>
            </div>
          ))
        )}
      </nav>

      <div className="rail-actions">
        <button className="rail-settings" onClick={onSettings}>
          <Settings size={16} />
          设置
        </button>
      </div>
    </aside>
  );
}

function projectIsBusy(project: ProjectRecord): boolean {
  return (
    project.status === 'running' ||
    project.initialGeneration === 'pending' ||
    project.initialGeneration === 'active' ||
    project.starterPreparation?.status === 'queued' ||
    project.starterPreparation?.status === 'preparing'
  );
}

function projectStatusLabel(project: ProjectRecord): string {
  if (project.initialGeneration === 'pending') return '准备 AI 创建';
  if (project.initialGeneration === 'active') return '按要求生成中';
  if (project.initialGeneration === 'incomplete')
    return project.status === 'stopped' ? 'AI 制作已停止' : 'AI 制作未完成';
  const preparation = project.starterPreparation;
  if (preparation?.status === 'failed') return '准备失败';
  if (preparation && preparation.status !== 'ready') return '正在准备';
  if (preparation?.status === 'ready' && project.status === 'draft') {
    return '可编辑试玩';
  }
  return STATUS_LABEL[project.status];
}

function projectStatusTone(project: ProjectRecord): ProjectRecord['status'] {
  if (
    project.initialGeneration === 'pending' ||
    project.initialGeneration === 'active'
  )
    return 'running';
  if (project.initialGeneration === 'incomplete')
    return project.status === 'stopped' ? 'stopped' : 'failed';
  if (project.starterPreparation?.status === 'failed') return 'failed';
  if (
    project.starterPreparation?.status === 'ready' &&
    project.status === 'draft'
  ) {
    return 'completed';
  }
  if (
    project.starterPreparation &&
    project.starterPreparation.status !== 'ready'
  ) {
    return 'running';
  }
  return project.status;
}
