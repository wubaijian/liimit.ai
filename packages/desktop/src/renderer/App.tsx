import {
  CircleHelp,
  FolderOpen,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AgentEvent,
  AppSettings,
  BootstrapState,
  CreateProjectInput,
  ProjectRecord,
  ProviderConnectionInput,
} from '../shared/types';
import { EventStream, type EventHistoryState } from './components/EventStream';
import { Inspector } from './components/Inspector';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ProjectRail } from './components/ProjectRail';
import { SettingsDialog } from './components/SettingsDialog';
import { mergeAgentEvents } from './history';
import { gameAgentMascot as brandIcon } from './assets';

type EventMap = Record<string, AgentEvent[]>;
type TextMap = Record<string, string>;
type HistoryMap = Record<string, EventHistoryState>;

export function mergeProjectUpdate(
  projects: ProjectRecord[],
  incoming: ProjectRecord,
): ProjectRecord[] {
  const current = projects.find((project) => project.id === incoming.id);
  let accepted = incoming;
  if (current?.starterPreparation) {
    const incomingRevision = incoming.starterPreparation?.revision;
    if (
      incomingRevision === undefined ||
      incomingRevision < current.starterPreparation.revision
    ) {
      return projects;
    }
    if (incomingRevision === current.starterPreparation.revision) {
      if (current.starterPreparation.status !== 'ready') return projects;
      accepted = {
        ...incoming,
        starterPreparation: current.starterPreparation,
      };
    }
  }
  const next = current
    ? projects.map((project) =>
        project.id === incoming.id ? accepted : project,
      )
    : [accepted, ...projects];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function canStartAgent(project: ProjectRecord | undefined): boolean {
  if (!project) return false;
  const preparation = project.starterPreparation;
  if (!preparation) return true;
  return preparation.status === 'ready' && preparation.phase === 'complete';
}

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [events, setEvents] = useState<EventMap>({});
  const [liveText, setLiveText] = useState<TextMap>({});
  const [history, setHistory] = useState<HistoryMap>({});
  const [instruction, setInstruction] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const agentAvailable = canStartAgent(selected);

  useEffect(() => {
    void window.gameAgent
      .bootstrap()
      .then((state) => {
        setBootstrap(state);
        setProjects(state.projects);
        setSettings(state.settings);
        if (state.projects[0]) setSelectedId(state.projects[0].id);
      })
      .catch((reason) => setError(toMessage(reason)));

    const stopEvents = window.gameAgent.onAgentEvent((event) => {
      if (
        event.type === 'text_delta' ||
        (event.type === 'thought' && event.title === '思考中')
      ) {
        setLiveText((previous) => ({
          ...previous,
          [event.projectId]:
            `${previous[event.projectId] ?? ''}${event.message}`.slice(-12_000),
        }));
        return;
      }

      setLiveText((previous) => ({ ...previous, [event.projectId]: '' }));
      setEvents((previous) => ({
        ...previous,
        [event.projectId]: mergeAgentEvents(previous[event.projectId] ?? [], [
          event,
        ]),
      }));
      if (event.type === 'tool_result' || event.type === 'complete') {
        setRefreshToken((value) => value + 1);
      }
    });

    const stopProjects = window.gameAgent.onProjectUpdated((project) => {
      setProjects((previous) => mergeProjectUpdate(previous, project));
    });

    return () => {
      stopEvents();
      stopProjects();
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setHistory((previous) => ({
      ...previous,
      [selectedId]: {
        ...(previous[selectedId] ?? { hasMore: false, source: 'empty' }),
        loading: true,
        error: '',
      },
    }));

    void window.gameAgent
      .loadAgentHistory(selectedId)
      .then((result) => {
        if (cancelled) return;
        setEvents((previous) => ({
          ...previous,
          [selectedId]: mergeAgentEvents(
            result.events,
            previous[selectedId] ?? [],
          ),
        }));
        setHistory((previous) => ({
          ...previous,
          [selectedId]: {
            loading: false,
            hasMore: result.hasMore,
            source: result.source,
            error: '',
          },
        }));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setHistory((previous) => ({
          ...previous,
          [selectedId]: {
            loading: false,
            hasMore: false,
            source: 'empty',
            error: toMessage(reason),
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    setInstruction(selected.status === 'draft' ? selected.prompt : '');
  }, [selected]);

  async function createProject(input: CreateProjectInput) {
    const project = await window.gameAgent.createProject(input);
    setProjects((previous) => mergeProjectUpdate(previous, project));
    setSelectedId(project.id);
    setInstruction(project.prompt);
    setShowCreate(false);
  }

  async function startAgent() {
    if (!selected || !agentAvailable) return;
    const prompt = instruction.trim() || selected.prompt;
    setError('');
    try {
      await window.gameAgent.startAgent({
        projectId: selected.id,
        prompt,
        resume: Boolean(selected.sessionId),
      });
      setInstruction('');
    } catch (reason) {
      const message = toMessage(reason);
      setError(message);
      if (/API Key|模型设置/.test(message)) setShowSettings(true);
    }
  }

  async function stopAgent() {
    if (!selected) return;
    await window.gameAgent.stopAgent(selected.id);
  }

  async function saveSettings(next: AppSettings) {
    const publicSettings = await window.gameAgent.saveSettings(next);
    setSettings(publicSettings);
  }

  async function testProviderConnection(input: ProviderConnectionInput) {
    return window.gameAgent.testProviderConnection(input);
  }

  if (!bootstrap || !settings) {
    return (
      <div className="loading-screen">
        <div className="loading-mark">
          <img src={brandIcon} alt="" />
        </div>
        <strong>liimit.ai</strong>
        <span>AI GAME AGENT · 正在连接 Runtime…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <ProjectRail
        projects={projects}
        selectedId={selectedId}
        onHome={() => setSelectedId(undefined)}
        onSelect={(project) => setSelectedId(project.id)}
        onCreate={() => setShowCreate(true)}
        onSettings={() => setShowSettings(true)}
      />

      <main className="workspace">
        <header className="topbar">
          <div className="drag-region" />
          <div className="topbar-copy">
            <span
              className={`runtime-light ${bootstrap.runtimeReady ? 'is-ready' : ''}`}
            />
            <span>{bootstrap.runtimeMessage}</span>
          </div>
          {selected ? (
            <div className="project-heading">
              <strong>{selected.name}</strong>
              <span
                className={`status-chip status-${projectStatusTone(selected)}`}
              >
                {projectStatusLabel(selected)}
              </span>
            </div>
          ) : null}
          <div className="topbar-actions">
            <button
              className="icon-button"
              title="打开项目目录"
              aria-label="打开项目目录"
              disabled={!selected}
              onClick={() =>
                selected && void window.gameAgent.revealProject(selected.id)
              }
            >
              <FolderOpen size={15} />
            </button>
            <button
              className="icon-button"
              title="使用说明"
              aria-label="使用说明"
            >
              <CircleHelp size={15} />
            </button>
          </div>
        </header>

        {selected ? (
          <div className="production-layout">
            <Inspector
              project={selected}
              refreshToken={refreshToken}
              onError={setError}
            />
            <section className="production-center" aria-label="项目与 AI 工具">
              <section className="project-overview-card">
                <span className="section-kicker">当前可以做什么</span>
                <strong>{projectStatusLabel(selected)}</strong>
                <p>{projectStatusDescription(selected)}</p>
                <ol className="product-steps" aria-label="制作流程">
                  <li className={agentAvailable ? 'is-done' : 'is-active'}>
                    <span>1</span>
                    <div>
                      <strong>准备游戏</strong>
                      <small>生成固定模板</small>
                    </div>
                  </li>
                  <li className={agentAvailable ? 'is-active' : ''}>
                    <span>2</span>
                    <div>
                      <strong>编辑与试玩</strong>
                      <small>拖动关卡并检查效果</small>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>测试与优化</strong>
                      <small>自动测试并给出建议</small>
                    </div>
                  </li>
                </ol>
              </section>

              <details
                className="optional-agent-panel"
                open={selected.status === 'running' ? true : undefined}
              >
                <summary>
                  <span>
                    <Sparkles size={15} />
                    AI 修改助手
                  </span>
                  <small>可选 · 需要 API</small>
                </summary>
                <div className="agent-workspace-body">
                  <div className="composer">
                    <div className="composer-label">
                      <span>
                        {selected.sessionId ? '继续修改' : '让 AI 修改游戏'}
                      </span>
                      <small>
                        {selected.sessionId
                          ? `SESSION ${selected.sessionId.slice(0, 8)}`
                          : 'NEW SESSION'}
                      </small>
                    </div>
                    <textarea
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      disabled={
                        selected.status === 'running' || !agentAvailable
                      }
                      placeholder={
                        !agentAvailable
                          ? '基础游戏准备完成后才能使用…'
                          : '例如：把第一个平台向右移动一些…'
                      }
                      rows={2}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === 'Enter' &&
                          selected.status !== 'running' &&
                          agentAvailable
                        ) {
                          event.preventDefault();
                          void startAgent();
                        }
                      }}
                    />
                    {selected.status === 'running' ? (
                      <button className="stop-button" onClick={stopAgent}>
                        <Square size={14} fill="currentColor" />
                        停止
                      </button>
                    ) : (
                      <button
                        className="run-button"
                        disabled={!agentAvailable}
                        onClick={startAgent}
                      >
                        {selected.sessionId ? (
                          <RotateCcw size={15} />
                        ) : (
                          <Play size={15} fill="currentColor" />
                        )}
                        {selected.sessionId ? '继续执行' : '启动 AI'}
                      </button>
                    )}
                    <div className="composer-hint">
                      基础游戏完成后可选择让 AI 继续修改；
                      {'AI 可能修改当前项目文件。'}
                      不接 API 也可以编辑和试玩基础游戏。
                    </div>
                  </div>
                  <EventStream
                    project={selected}
                    events={events[selected.id] ?? []}
                    liveText={liveText[selected.id] ?? ''}
                    history={
                      history[selected.id] ?? {
                        loading: true,
                        hasMore: false,
                        source: 'empty',
                      }
                    }
                  />
                </div>
              </details>
            </section>
          </div>
        ) : (
          <EmptyWorkspace onCreate={() => setShowCreate(true)} />
        )}
      </main>

      {showCreate ? (
        <NewProjectDialog
          defaultDirectory={settings.defaultWorkspace}
          onClose={() => setShowCreate(false)}
          onCreate={createProject}
        />
      ) : null}
      {showSettings ? (
        <SettingsDialog
          value={settings}
          project={selected}
          events={selected ? (events[selected.id] ?? []) : []}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
          onTest={testProviderConnection}
        />
      ) : null}
      {error ? (
        <div className="toast-error" role="alert">
          <span>{error}</span>
          <button aria-label="关闭错误提示" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-workspace">
      <div className="empty-sequence" aria-hidden="true">
        <span>IDEA</span>
        <i />
        <span>GDD</span>
        <i />
        <span>GAME</span>
      </div>
      <p className="eyebrow">PHASER 3 · 2D · PLATFORMER</p>
      <h1>
        一句话，做出可玩的
        <br />
        横版平台游戏。
      </h1>
      <p>
        liimit.ai 使用固定平台模板生成游戏设计、素材与代码，完成后直接在应用内
        Web 浏览器试玩。
      </p>
      <button className="hero-button" onClick={onCreate}>
        <Sparkles size={16} />
        创建第一个游戏
      </button>
      <div className="capability-strip">
        <span>Phaser 3 · 2D</span>
        <span>横版平台跳跃</span>
        <span>应用内 Web 浏览器试玩</span>
        <span>固定平台模板</span>
      </div>
    </section>
  );
}

function projectStatusLabel(project: ProjectRecord): string {
  const preparation = project.starterPreparation;
  if (preparation?.status === 'failed') return '准备失败';
  if (preparation && preparation.status !== 'ready') return '正在准备';
  if (preparation?.status === 'ready' && project.status === 'draft') {
    return '基础游戏可用';
  }
  return {
    draft: '待启动',
    running: '生成中',
    waiting: '待继续',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
  }[project.status];
}

function projectStatusTone(project: ProjectRecord): ProjectRecord['status'] {
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

function projectStatusDescription(project: ProjectRecord): string {
  const preparation = project.starterPreparation;
  if (preparation?.status === 'failed') {
    return '项目资料已保留，可以在左侧按钮重试准备。';
  }
  if (preparation && preparation.status !== 'ready') {
    return '平台正在生成可玩的基础游戏，完成后会自动打开编辑区。';
  }
  return '你可以修改游戏名称和简介、拖动调整关卡，再到“Web 试玩”检查效果。';
}

function toMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    '',
  );
}
