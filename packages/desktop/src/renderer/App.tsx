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
import { pendingModificationProposal } from '../shared/modificationProposal';
import { ModificationProposalCard } from './components/ModificationProposalCard';
import type {
  AgentEvent,
  AppSettings,
  BootstrapState,
  CreateProjectInput,
  ProjectRecord,
  ProviderConnectionInput,
} from '../shared/types';
import {
  BUILT_IN_PLATFORMER_EXAMPLES,
  findBuiltInExampleProject,
  getBuiltInExample,
  type BuiltInExampleId,
} from '../shared/builtInExamples';
import { EventStream, type EventHistoryState } from './components/EventStream';
import { ApiCostPanel } from './components/ApiCostPanel';
import {
  GodotMazePreview,
  type GodotMazePreviewInput,
} from './components/GodotMazePreview';
import { Inspector } from './components/Inspector';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ProjectRail } from './components/ProjectRail';
import { SettingsDialog } from './components/SettingsDialog';
import { mergeAgentEvents } from './history';
import {
  fireMountainExample,
  gameAgentMascot as brandIcon,
  zeroFactoryExample,
} from './assets';

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
      if (
        current.starterPreparation.status !== 'ready' &&
        !(
          incoming.initialGeneration === 'incomplete' &&
          current.initialGeneration === 'pending'
        )
      )
        return projects;
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
  const [godotPreview, setGodotPreview] = useState<GodotMazePreviewInput>();
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState<string>();
  const [removalNotice, setRemovalNotice] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [openingBuiltInExampleId, setOpeningBuiltInExampleId] =
    useState<BuiltInExampleId>();

  async function removeProject(
    project: ProjectRecord,
    mode: 'list-only' | 'trash',
  ) {
    if (removingId) return;
    setRemovingId(project.id);
    setError('');
    setRemovalNotice('');
    try {
      const result = await window.gameAgent.removeProject({
        projectId: project.id,
        mode,
      });
      if (!result.removed) return;
      setProjects((previous) =>
        previous.filter((item) => item.id !== result.projectId),
      );
      setSelectedId((current) =>
        current === result.projectId ? undefined : current,
      );
      setRemovalNotice(
        mode === 'trash'
          ? `“${project.name}”已移到废纸篓，可从废纸篓恢复文件。`
          : `“${project.name}”已从列表移除，游戏文件仍保留在原位置。`,
      );
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setRemovingId(undefined);
    }
  }

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const agentAvailable = canStartAgent(selected);
  const creationPending = selected?.initialGeneration === 'pending';
  const proposal = selected
    ? pendingModificationProposal(events[selected.id] ?? [], selected.id)
    : undefined;

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
    setInstruction(
      selected.status === 'draft' || selected.initialGeneration === 'incomplete'
        ? selected.prompt
        : '',
    );
  }, [selected]);

  async function createProject(input: CreateProjectInput) {
    const project = await window.gameAgent.createProject(input);
    setProjects((previous) => mergeProjectUpdate(previous, project));
    setSelectedId(project.id);
    setInstruction(project.prompt);
    setShowCreate(false);
  }

  async function openBuiltInExample(
    exampleId: BuiltInExampleId,
    directory = settings?.defaultWorkspace,
  ) {
    if (openingBuiltInExampleId || !settings) return;
    const example = getBuiltInExample(exampleId);
    setOpeningBuiltInExampleId(exampleId);
    setError('');
    try {
      const existing = findBuiltInExampleProject(
        exampleId,
        projects,
        directory ?? settings.defaultWorkspace,
      );
      if (existing) {
        setSelectedId(existing.id);
        setInstruction(existing.status === 'draft' ? existing.prompt : '');
        setShowCreate(false);
        return;
      }
      await createProject({
        name: example.name,
        directory: directory ?? settings.defaultWorkspace,
        prompt: example.prompt,
        starterTemplateId: example.starterTemplateId,
      });
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setOpeningBuiltInExampleId(undefined);
    }
  }

  async function startAgent() {
    if (!selected || !agentAvailable || creationPending) return;
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
    return publicSettings;
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
        onRemove={(project, mode) => void removeProject(project, mode)}
        removingId={removingId}
      />

      <main className="workspace">
        {removalNotice ? (
          <div className="project-removal-notice" role="status">
            {removalNotice}
            <button
              type="button"
              onClick={() => setRemovalNotice('')}
              aria-label="关闭项目移除提示"
            >
              ×
            </button>
          </div>
        ) : null}
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
              <span className="project-engine-chip">PHASER 3 · 横版跳跃</span>
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
                <div className="progress-heading">
                  <span>制作进度</span>
                  <strong title={projectStatusDescription(selected)}>
                    {projectStatusLabel(selected)}
                  </strong>
                </div>
                <ol className="product-steps" aria-label="制作流程">
                  <li className={agentAvailable ? 'is-done' : 'is-active'}>
                    <span>1</span>
                    <div>
                      <strong>准备游戏</strong>
                    </div>
                  </li>
                  <li className={agentAvailable ? 'is-active' : ''}>
                    <span>2</span>
                    <div>
                      <strong>
                        {selected.initialGeneration &&
                        selected.initialGeneration !== 'completed'
                          ? '按要求制作'
                          : '编辑与试玩'}
                      </strong>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>测试与优化</strong>
                    </div>
                  </li>
                </ol>
              </section>

              <section
                className="optional-agent-panel"
                aria-label="AI 修改助手"
              >
                <header className="agent-panel-header">
                  <span>
                    <Sparkles size={15} />
                    AI 修改助手
                  </span>
                  <small>
                    {selected.initialGeneration &&
                    selected.initialGeneration !== 'completed'
                      ? 'AI 创建 · 使用 API'
                      : '可选 · 需要 API'}
                  </small>
                </header>
                {selected.initialGeneration &&
                selected.initialGeneration !== 'completed' ? (
                  <div
                    className="composer-hint"
                    role="status"
                    style={{ padding: '8px 14px' }}
                  >
                    {creationPending
                      ? '正在准备运行框架，完成后自动按你的要求制作；基础工作区不是最终游戏。'
                      : selected.status === 'running'
                        ? '正在按要求生成，请查看下方进展；当前内容还不是最终结果。'
                        : 'AI 制作尚未完成。要求和已有内容已保留；可先编辑，或检查模型设置及下方记录后重试。若基础准备失败，请先在左侧重试准备。'}
                  </div>
                ) : null}
                <ApiCostPanel
                  key={`cost:${selected.id}`}
                  projectId={selected.id}
                />
                <div className="agent-workspace-body">
                  <EventStream
                    key={selected.id}
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
                  >
                    {proposal && (
                      <ModificationProposalCard
                        key={`${proposal.projectId}:${proposal.id}`}
                        proposal={proposal}
                        disabled={
                          !agentAvailable || selected.status === 'running'
                        }
                        onDecide={(input) =>
                          window.gameAgent.decideProposal(input)
                        }
                      />
                    )}
                  </EventStream>
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
                        selected.status === 'running' ||
                        creationPending ||
                        !agentAvailable
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
                          agentAvailable &&
                          !creationPending
                        ) {
                          event.preventDefault();
                          void startAgent();
                        }
                      }}
                    />
                    {selected.status === 'running' || creationPending ? (
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
                        {selected.initialGeneration === 'incomplete'
                          ? '重试 AI 制作'
                          : selected.sessionId
                            ? '继续执行'
                            : '启动 AI'}
                      </button>
                    )}
                    <div className="composer-hint">
                      基础游戏完成后可选择让 AI 继续修改；
                      {'AI 可能修改当前项目文件。'}
                      不接 API 也可以编辑和试玩基础游戏。
                    </div>
                  </div>
                </div>
              </section>
            </section>
          </div>
        ) : (
          <EmptyWorkspace
            onCreate={() => setShowCreate(true)}
            onOpenBuiltInExample={(exampleId) =>
              void openBuiltInExample(exampleId)
            }
            openingBuiltInExampleId={openingBuiltInExampleId}
          />
        )}
      </main>

      {showCreate ? (
        <NewProjectDialog
          defaultDirectory={settings.defaultWorkspace}
          onClose={() => setShowCreate(false)}
          onCreate={createProject}
          onOpenBuiltInExample={openBuiltInExample}
          builtInExampleExists={{
            'fire-mountain-escape': Boolean(
              findBuiltInExampleProject(
                'fire-mountain-escape',
                projects,
                settings.defaultWorkspace,
              ),
            ),
            'zero-factory-escape': Boolean(
              findBuiltInExampleProject(
                'zero-factory-escape',
                projects,
                settings.defaultWorkspace,
              ),
            ),
          }}
          onPreviewGodot={(input) => {
            setShowCreate(false);
            setGodotPreview(input);
          }}
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
      {godotPreview ? (
        <GodotMazePreview
          input={godotPreview}
          onClose={() => setGodotPreview(undefined)}
        />
      ) : null}
    </div>
  );
}

function EmptyWorkspace({
  onCreate,
  onOpenBuiltInExample,
  openingBuiltInExampleId,
}: {
  onCreate: () => void;
  onOpenBuiltInExample: (exampleId: BuiltInExampleId) => void;
  openingBuiltInExampleId?: BuiltInExampleId;
}) {
  const previewImages: Record<BuiltInExampleId, string> = {
    'fire-mountain-escape': fireMountainExample,
    'zero-factory-escape': zeroFactoryExample,
  };
  return (
    <section className="empty-workspace">
      <div className="empty-sequence" aria-hidden="true">
        <span>IDEA</span>
        <i />
        <span>GDD</span>
        <i />
        <span>GAME</span>
      </div>
      <p className="eyebrow">PHASER 3 · GODOT</p>
      <h1>
        选择游戏类型，搭出
        <br />
        你的第一个版本。
      </h1>
      <p>
        选择适合的游戏类型，从固定模板或 AI
        开始搭建关卡，并在一个工作台内完成编辑、试玩和调整。
      </p>
      <button className="hero-button" onClick={onCreate}>
        <Sparkles size={16} />
        选择游戏类型
      </button>
      <div className="home-game-types" aria-label="游戏类型">
        <div className="is-phaser">
          <span>Phaser 3</span>
          <strong>横版平台跳跃</strong>
          <small>2D · Web 试玩 · 关卡编辑</small>
        </div>
        <div>
          <strong>俯视角迷宫</strong>
          <small>Godot · 2D · Web</small>
        </div>
        {BUILT_IN_PLATFORMER_EXAMPLES.map((example) => (
          <button
            className="built-in-example-card"
            type="button"
            key={example.id}
            disabled={Boolean(openingBuiltInExampleId)}
            onClick={() => onOpenBuiltInExample(example.id)}
          >
            <img
              src={previewImages[example.id]}
              alt={`${example.name}关卡背景`}
            />
            <span className="built-in-example-copy">
              <small>{example.label}</small>
              <strong>{example.name}</strong>
              <span>{example.description}</span>
            </span>
            <b>
              {openingBuiltInExampleId === example.id
                ? '正在创建…'
                : '一键打开'}
            </b>
          </button>
        ))}
      </div>
      <div className="capability-strip">
        <span>Phaser 3 · 2D</span>
        <span>横版平台跳跃</span>
        <span>应用内 Web 浏览器试玩</span>
        <span>固定平台模板</span>
        <span>Godot · 2D 迷宫</span>
      </div>
    </section>
  );
}

function projectStatusLabel(project: ProjectRecord): string {
  if (project.initialGeneration === 'pending') return '准备 AI 创建';
  if (project.initialGeneration === 'incomplete')
    return project.status === 'stopped' ? 'AI 制作已停止' : 'AI 制作未完成';
  if (project.initialGeneration === 'active') return '按要求生成中';
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
