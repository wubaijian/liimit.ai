import {
  Code2,
  Eye,
  Files,
  FolderOpen,
  Gamepad2,
  Map,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileContent, FileNode, ProjectRecord } from '../../shared/types';
import {
  comparePlaytestResults,
  createPlaytestResultSnapshot,
  isFinishedPlaytestEvaluation,
  type PlaytestComparison,
  type PlaytestResultSnapshot,
} from '../playtestComparison';
import {
  createEmptyPlaytestReport,
  createPlaytestControlMessage,
  evaluatePlaytestResult,
  getPlaytestElapsedMs,
  getPlaytestEvaluationDelay,
  getPlaytestTimeoutMs,
  isFailedPlaytestEvaluation,
  parsePlaytestMessage,
  PLAYTEST_PROGRESS_DISTANCE,
  PLAYTEST_REPEATED_DEATH_LIMIT,
  PLAYTEST_STUCK_MS,
  reducePlaytestReport,
  type PlaytestReport,
  type PlaytestControlCommand,
} from '../playtestTelemetry';
import { FileTree } from './FileTree';
import { LevelViewer } from './LevelViewer';
import { GameInfoEditor } from './GameInfoEditor';
import {
  createPlaytestSuggestions,
  persistPlayerAbilitySuggestion,
  persistPlaytestSuggestion,
  type PlaytestSuggestion,
} from '../playtestSuggestions';
import { StarterPreparationView } from './StarterPreparationView';

interface InspectorProps {
  project: ProjectRecord;
  refreshToken: number;
  onError: (message: string) => void;
}

type InspectorTab = 'level' | 'game' | 'preview' | 'files';

export interface PlaytestReplayState {
  phase: 'reloading' | 'starting' | 'running' | 'completed' | 'error';
  suggestionTitle: string;
  before: PlaytestResultSnapshot;
  after?: PlaytestResultSnapshot;
  comparison?: PlaytestComparison;
  error?: string;
}

export function Inspector({ project, refreshToken, onError }: InspectorProps) {
  const preparation = project.starterPreparation;
  if (
    preparation &&
    (preparation.status !== 'ready' || preparation.phase !== 'complete')
  ) {
    return (
      <StarterPreparationView
        key={project.id}
        projectId={project.id}
        preparation={preparation}
        onError={onError}
      />
    );
  }
  return (
    <ReadyProjectInspector
      project={project}
      refreshToken={refreshToken}
      onError={onError}
    />
  );
}

function ReadyProjectInspector({
  project,
  refreshToken,
  onError,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('level');
  const [previewUrl, setPreviewUrl] = useState('');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewLevels, setPreviewLevels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [previewStartLevelId, setPreviewStartLevelId] = useState<string>();
  const [playtestReport, setPlaytestReport] = useState(
    createEmptyPlaytestReport,
  );
  const [playtestSuggestions, setPlaytestSuggestions] = useState<
    PlaytestSuggestion[]
  >([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string>();
  const [applyingSuggestionId, setApplyingSuggestionId] = useState<string>();
  const [appliedSuggestionId, setAppliedSuggestionId] = useState<string>();
  const [suggestionApplyError, setSuggestionApplyError] = useState('');
  const [replayState, setReplayState] = useState<PlaytestReplayState>();
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const pendingReplayStartRef = useRef(false);
  const pendingReplayUrlRef = useRef<string | undefined>(undefined);
  const awaitingReplayAutomationRef = useRef(false);
  const replayLoadTimeoutRef = useRef<number | undefined>(undefined);
  const replayAutomationTimeoutRef = useRef<number | undefined>(undefined);
  const previousProjectStatusRef = useRef({
    projectId: project.id,
    status: project.status,
  });
  const projectIdRef = useRef(project.id);
  projectIdRef.current = project.id;
  const suggestionInput = useMemo(
    () => ({
      evaluationStatus: playtestReport.evaluationStatus,
      automationDeaths: playtestReport.automationDeaths,
      lastHazardId: playtestReport.lastHazardId,
      lastX: playtestReport.lastX,
      lastY: playtestReport.lastY,
      currentLevelId: playtestReport.currentLevelId,
      currentLevelName: playtestReport.currentLevelName,
    }),
    [
      playtestReport.automationDeaths,
      playtestReport.evaluationStatus,
      playtestReport.lastHazardId,
      playtestReport.lastX,
      playtestReport.lastY,
      playtestReport.currentLevelId,
      playtestReport.currentLevelName,
    ],
  );

  const refreshFiles = useCallback(async () => {
    try {
      setFiles(await window.gameAgent.listFiles(project.id));
    } catch (error) {
      onError(toMessage(error));
    }
  }, [onError, project.id]);

  const sendPlaytestControl = useCallback(
    (command: PlaytestControlCommand) => {
      if (!previewUrl) return;
      previewFrameRef.current?.contentWindow?.postMessage(
        createPlaytestControlMessage(command),
        new URL(previewUrl).origin,
      );
    },
    [previewUrl],
  );

  useEffect(() => {
    setPreviewUrl('');
    setSelectedFile(null);
    setPlaytestReport(createEmptyPlaytestReport());
    setPlaytestSuggestions([]);
    setSuggestionsError('');
    setPendingSuggestionId(undefined);
    setApplyingSuggestionId(undefined);
    setAppliedSuggestionId(undefined);
    setSuggestionApplyError('');
    setReplayState(undefined);
    setPreviewLevels([]);
    setPreviewStartLevelId(undefined);
    pendingReplayStartRef.current = false;
    pendingReplayUrlRef.current = undefined;
    awaitingReplayAutomationRef.current = false;
    if (replayLoadTimeoutRef.current !== undefined) {
      window.clearTimeout(replayLoadTimeoutRef.current);
      replayLoadTimeoutRef.current = undefined;
    }
    if (replayAutomationTimeoutRef.current !== undefined) {
      window.clearTimeout(replayAutomationTimeoutRef.current);
      replayAutomationTimeoutRef.current = undefined;
    }
    void refreshFiles();
  }, [project.id, refreshFiles]);

  useEffect(() => {
    let cancelled = false;
    void window.gameAgent
      .loadLevelCampaign(project.id)
      .then((campaign) => {
        if (cancelled || projectIdRef.current !== project.id) return;
        const levels = campaign.levels.map(({ id, name }) => ({ id, name }));
        setPreviewLevels(levels);
        setPreviewStartLevelId((current) =>
          levels.some((level) => level.id === current)
            ? current
            : levels[0]?.id,
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(toMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [onError, project.id, refreshToken]);

  useEffect(() => {
    const previous = previousProjectStatusRef.current;
    previousProjectStatusRef.current = {
      projectId: project.id,
      status: project.status,
    };
    if (previous.projectId !== project.id) return;
    const previousStatus = previous.status;
    if (
      previousStatus === 'running' &&
      project.status !== 'running' &&
      previewUrl
    ) {
      const refreshedPreviewUrl = new URL(previewUrl);
      refreshedPreviewUrl.searchParams.set('liimitRefresh', String(Date.now()));
      setPreviewUrl(refreshedPreviewUrl.toString());
    }
  }, [previewUrl, project.id, project.status, refreshToken]);

  useEffect(
    () => () => {
      if (replayLoadTimeoutRef.current !== undefined) {
        window.clearTimeout(replayLoadTimeoutRef.current);
      }
      if (replayAutomationTimeoutRef.current !== undefined) {
        window.clearTimeout(replayAutomationTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!previewUrl) return;
    const previewOrigin = new URL(previewUrl).origin;
    function receivePlaytestEvent(event: MessageEvent<unknown>) {
      if (
        event.origin !== previewOrigin ||
        event.source !== previewFrameRef.current?.contentWindow
      ) {
        return;
      }
      const playtestEvent = parsePlaytestMessage(event.data);
      if (!playtestEvent) return;
      setPlaytestReport((previous) =>
        reducePlaytestReport(previous, playtestEvent, Date.now()),
      );
      if (
        playtestEvent.type === 'started' &&
        pendingReplayStartRef.current &&
        pendingReplayUrlRef.current === previewUrl
      ) {
        pendingReplayStartRef.current = false;
        pendingReplayUrlRef.current = undefined;
        if (replayLoadTimeoutRef.current !== undefined) {
          window.clearTimeout(replayLoadTimeoutRef.current);
          replayLoadTimeoutRef.current = undefined;
        }
        previewFrameRef.current?.contentWindow?.postMessage(
          createPlaytestControlMessage('start'),
          previewOrigin,
        );
        awaitingReplayAutomationRef.current = true;
        replayAutomationTimeoutRef.current = window.setTimeout(() => {
          if (
            !awaitingReplayAutomationRef.current ||
            projectIdRef.current !== project.id
          ) {
            return;
          }
          awaitingReplayAutomationRef.current = false;
          replayAutomationTimeoutRef.current = undefined;
          setReplayState((previous) =>
            previous?.phase === 'starting'
              ? {
                  ...previous,
                  phase: 'error',
                  error: '机器人在 10 秒内没有确认开始自动试玩。',
                }
              : previous,
          );
        }, 10_000);
        setReplayState((previous) =>
          previous ? { ...previous, phase: 'starting' } : previous,
        );
        return;
      }
      if (
        playtestEvent.type === 'automation-state' &&
        playtestEvent.active &&
        awaitingReplayAutomationRef.current
      ) {
        awaitingReplayAutomationRef.current = false;
        if (replayAutomationTimeoutRef.current !== undefined) {
          window.clearTimeout(replayAutomationTimeoutRef.current);
          replayAutomationTimeoutRef.current = undefined;
        }
        setReplayState((previous) =>
          previous?.phase === 'starting'
            ? { ...previous, phase: 'running' }
            : previous,
        );
      }
    }
    window.addEventListener('message', receivePlaytestEvent);
    return () => window.removeEventListener('message', receivePlaytestEvent);
  }, [previewUrl, project.id]);

  useEffect(() => {
    if (project.status === 'completed' || tab === 'files') void refreshFiles();
  }, [refreshFiles, refreshToken, project.status, tab]);

  useEffect(() => {
    const delay = getPlaytestEvaluationDelay(playtestReport, Date.now());
    if (delay === undefined) return;
    const timeout = window.setTimeout(
      () => {
        setPlaytestReport((previous) =>
          evaluatePlaytestResult(previous, Date.now()),
        );
      },
      Math.max(1, delay),
    );
    return () => window.clearTimeout(timeout);
  }, [playtestReport]);

  useEffect(() => {
    if (
      playtestReport.automationActive &&
      isFailedPlaytestEvaluation(playtestReport.evaluationStatus)
    ) {
      sendPlaytestControl('stop');
    }
  }, [
    playtestReport.automationActive,
    playtestReport.evaluationStatus,
    sendPlaytestControl,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!isFailedPlaytestEvaluation(suggestionInput.evaluationStatus)) {
      setPlaytestSuggestions((previous) => (previous.length ? [] : previous));
      setSuggestionsLoading(false);
      setSuggestionsError('');
      setPendingSuggestionId(undefined);
      setApplyingSuggestionId(undefined);
      setAppliedSuggestionId(undefined);
      setSuggestionApplyError('');
      return;
    }
    setPlaytestSuggestions([]);
    setSuggestionsLoading(true);
    setSuggestionsError('');
    setPendingSuggestionId(undefined);
    setAppliedSuggestionId(undefined);
    setSuggestionApplyError('');
    void window.gameAgent
      .loadLevelCampaign(project.id)
      .then((campaign) => {
        if (cancelled) return;
        const target = suggestionInput.currentLevelId
          ? campaign.levels.find(
              (level) => level.id === suggestionInput.currentLevelId,
            )
          : campaign.levels[0];
        if (!target) throw new Error('自动试玩对应的关卡不存在。');
        setPlaytestSuggestions(
          createPlaytestSuggestions(
            target.document,
            suggestionInput,
            target.abilities,
          ).map((suggestion) => ({
            ...suggestion,
            levelId: target.id,
            levelName: target.name,
            target: `${target.name} · ${suggestion.target}`,
          })),
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) setSuggestionsError(toMessage(error));
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, suggestionInput]);

  useEffect(() => {
    if (
      replayState?.phase !== 'running' ||
      !isFinishedPlaytestEvaluation(playtestReport.evaluationStatus)
    ) {
      return;
    }
    const after = createPlaytestResultSnapshot(playtestReport);
    setReplayState((previous) =>
      previous?.phase === 'running'
        ? {
            ...previous,
            phase: 'completed',
            after,
            comparison: comparePlaytestResults(previous.before, after),
          }
        : previous,
    );
  }, [playtestReport, replayState?.phase]);

  async function loadPreview() {
    pendingReplayStartRef.current = false;
    pendingReplayUrlRef.current = undefined;
    awaitingReplayAutomationRef.current = false;
    if (replayLoadTimeoutRef.current !== undefined) {
      window.clearTimeout(replayLoadTimeoutRef.current);
      replayLoadTimeoutRef.current = undefined;
    }
    if (replayAutomationTimeoutRef.current !== undefined) {
      window.clearTimeout(replayAutomationTimeoutRef.current);
      replayAutomationTimeoutRef.current = undefined;
    }
    setReplayState(undefined);
    setLoadingPreview(true);
    setPlaytestReport(createEmptyPlaytestReport());
    try {
      const url = await window.gameAgent.startPreview(project.id);
      setPreviewUrl(addPreviewStartLevel(url, previewStartLevelId));
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function openFile(filePath: string) {
    try {
      setSelectedFile(await window.gameAgent.readFile(project.id, filePath));
    } catch (error) {
      onError(toMessage(error));
    }
  }

  async function confirmSuggestion(suggestion: PlaytestSuggestion) {
    const activeProjectId = project.id;
    const before = createPlaytestResultSnapshot(playtestReport);
    setApplyingSuggestionId(suggestion.id);
    setSuggestionApplyError('');
    try {
      if (suggestion.change.kind === 'abilities') {
        if (!suggestion.levelId) throw new Error('建议对应的关卡不存在。');
        await persistPlayerAbilitySuggestion(
          suggestion,
          async () => {
            const campaign =
              await window.gameAgent.loadLevelCampaign(activeProjectId);
            const target = campaign.levels.find(
              (level) => level.id === suggestion.levelId,
            );
            if (!target) throw new Error('建议对应的关卡不存在。');
            return target.abilities;
          },
          (abilities) =>
            window.gameAgent.saveLevelAbilities(
              activeProjectId,
              suggestion.levelId!,
              abilities,
            ),
        );
      } else {
        await persistPlaytestSuggestion(
          suggestion,
          async () => {
            const campaign =
              await window.gameAgent.loadLevelCampaign(activeProjectId);
            const target = suggestion.levelId
              ? campaign.levels.find((level) => level.id === suggestion.levelId)
              : campaign.levels[0];
            if (!target) throw new Error('建议对应的关卡不存在。');
            return target.document;
          },
          (level) => {
            if (!suggestion.levelId) {
              return window.gameAgent.saveLevel(activeProjectId, level);
            }
            return window.gameAgent.saveCampaignLevel(
              activeProjectId,
              suggestion.levelId,
              level,
            );
          },
        );
      }
      if (projectIdRef.current !== activeProjectId) return;
      setPendingSuggestionId(undefined);
      setAppliedSuggestionId(suggestion.id);
      await startReplay(activeProjectId, suggestion.title, before);
    } catch (error) {
      if (projectIdRef.current === activeProjectId) {
        setSuggestionApplyError(toMessage(error));
      }
    } finally {
      if (projectIdRef.current === activeProjectId) {
        setApplyingSuggestionId(undefined);
      }
    }
  }

  async function startReplay(
    activeProjectId: string,
    suggestionTitle: string,
    before: PlaytestResultSnapshot,
  ) {
    setReplayState({ phase: 'reloading', suggestionTitle, before });
    try {
      const url = await window.gameAgent.startPreview(activeProjectId);
      if (projectIdRef.current !== activeProjectId) return;
      const replayUrl = new URL(url);
      if (previewStartLevelId) {
        replayUrl.searchParams.set('liimitStartLevel', previewStartLevelId);
      }
      replayUrl.searchParams.set('liimitReplay', String(Date.now()));
      const replayUrlValue = replayUrl.toString();
      pendingReplayStartRef.current = true;
      pendingReplayUrlRef.current = replayUrlValue;
      awaitingReplayAutomationRef.current = false;
      replayLoadTimeoutRef.current = window.setTimeout(() => {
        if (
          !pendingReplayStartRef.current ||
          projectIdRef.current !== activeProjectId
        ) {
          return;
        }
        pendingReplayStartRef.current = false;
        pendingReplayUrlRef.current = undefined;
        replayLoadTimeoutRef.current = undefined;
        setReplayState({
          phase: 'error',
          suggestionTitle,
          before,
          error: '最新版游戏在 10 秒内没有准备好。',
        });
      }, 10_000);
      setPlaytestReport(createEmptyPlaytestReport());
      setPreviewUrl(replayUrlValue);
    } catch (error) {
      if (projectIdRef.current !== activeProjectId) return;
      pendingReplayStartRef.current = false;
      pendingReplayUrlRef.current = undefined;
      awaitingReplayAutomationRef.current = false;
      setReplayState({
        phase: 'error',
        suggestionTitle,
        before,
        error: toMessage(error),
      });
    }
  }

  return (
    <aside className="inspector">
      <div className="inspector-tabs" role="tablist">
        <button
          className={tab === 'level' ? 'is-active' : ''}
          onClick={() => setTab('level')}
        >
          <Map size={14} />
          关卡
        </button>
        <button
          className={tab === 'game' ? 'is-active' : ''}
          onClick={() => setTab('game')}
        >
          <Gamepad2 size={14} />
          游戏信息
        </button>
        <button
          className={tab === 'preview' ? 'is-active' : ''}
          onClick={() => setTab('preview')}
        >
          <Eye size={14} />
          Web 试玩
        </button>
        <button
          className={tab === 'files' ? 'is-active' : ''}
          onClick={() => setTab('files')}
        >
          <Files size={14} />
          文件
        </button>
      </div>

      {tab === 'level' ? (
        <LevelViewer
          project={project}
          refreshToken={refreshToken}
          onError={onError}
          preferredLevelId={previewStartLevelId}
          onActiveLevelChange={setPreviewStartLevelId}
        />
      ) : tab === 'game' ? (
        <GameInfoEditor
          project={project}
          refreshToken={refreshToken}
          onError={onError}
        />
      ) : tab === 'preview' ? (
        <div className="preview-pane">
          <div className="preview-toolbar">
            <div className="browser-dots">
              <i />
              <i />
              <i />
            </div>
            <span>
              {previewUrl ? new URL(previewUrl).host : '应用内 Web 浏览器'}
            </span>
            <button
              aria-label="刷新预览"
              title="刷新预览"
              disabled={!previewUrl}
              onClick={() => {
                const current = previewUrl;
                setPlaytestReport(createEmptyPlaytestReport());
                setPreviewUrl('');
                requestAnimationFrame(() => setPreviewUrl(current));
              }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="preview-start-controls">
            <div className="preview-level-picker">
              <span>从第几关开始试玩</span>
              <div
                className="preview-level-options"
                role="group"
                aria-label="选择试玩起点"
              >
                {previewLevels.map((level) => (
                  <button
                    key={level.id}
                    className={
                      previewStartLevelId === level.id ? 'is-active' : ''
                    }
                    disabled={loadingPreview}
                    onClick={() => setPreviewStartLevelId(level.id)}
                  >
                    {level.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="preview-start-action"
              onClick={() => void loadPreview()}
              disabled={loadingPreview || !previewStartLevelId}
            >
              {loadingPreview ? (
                <RefreshCw className="spin" size={14} />
              ) : (
                <Play size={14} />
              )}
              {previewUrl ? '从所选关重新试玩' : '从所选关开始试玩'}
            </button>
            <small>编辑区当前关卡会自动带到这里</small>
          </div>
          {previewUrl ? (
            <iframe
              ref={previewFrameRef}
              key={previewUrl}
              src={previewUrl}
              title={`${project.name} Web 试玩`}
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            />
          ) : (
            <div className="preview-empty">
              <div className="preview-grid" aria-hidden="true" />
              <Eye size={28} />
              <strong>基础游戏已可试玩</strong>
              <p>点击下方按钮，就能在应用内的 Web 浏览器里直接试玩。</p>
              <button onClick={loadPreview} disabled={loadingPreview}>
                {loadingPreview ? (
                  <RefreshCw className="spin" size={15} />
                ) : (
                  <Play size={15} />
                )}
                {loadingPreview ? '正在连接' : '载入 Web 试玩'}
              </button>
            </div>
          )}
          {previewUrl ? (
            <PlaytestSummary
              report={playtestReport}
              suggestions={playtestSuggestions}
              suggestionsLoading={suggestionsLoading}
              suggestionsError={suggestionsError}
              pendingSuggestionId={pendingSuggestionId}
              applyingSuggestionId={applyingSuggestionId}
              appliedSuggestionId={appliedSuggestionId}
              suggestionApplyError={suggestionApplyError}
              replayState={replayState}
              onChooseSuggestion={(suggestionId) => {
                setPendingSuggestionId(suggestionId);
                setSuggestionApplyError('');
              }}
              onCancelSuggestion={() => {
                setPendingSuggestionId(undefined);
                setSuggestionApplyError('');
              }}
              onConfirmSuggestion={(suggestion) =>
                void confirmSuggestion(suggestion)
              }
              onStart={() => {
                pendingReplayStartRef.current = false;
                pendingReplayUrlRef.current = undefined;
                awaitingReplayAutomationRef.current = false;
                if (replayLoadTimeoutRef.current !== undefined) {
                  window.clearTimeout(replayLoadTimeoutRef.current);
                  replayLoadTimeoutRef.current = undefined;
                }
                if (replayAutomationTimeoutRef.current !== undefined) {
                  window.clearTimeout(replayAutomationTimeoutRef.current);
                  replayAutomationTimeoutRef.current = undefined;
                }
                setReplayState(undefined);
                sendPlaytestControl('start');
              }}
              onStop={() => sendPlaytestControl('stop')}
            />
          ) : null}
          <div className="preview-footer">
            <button
              onClick={() => void window.gameAgent.revealProject(project.id)}
            >
              <FolderOpen size={13} /> 在 Finder 中显示
            </button>
            {previewUrl ? (
              <button onClick={() => void loadPreview()}>
                <RefreshCw size={13} />
                重新检测
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="files-pane">
          <div className="files-toolbar">
            <span>PROJECT FILES</span>
            <button
              aria-label="刷新文件"
              title="刷新文件"
              onClick={() => void refreshFiles()}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="file-layout">
            <div className="file-tree-pane">
              {files.length ? (
                <FileTree
                  nodes={files}
                  selected={selectedFile?.path}
                  onSelect={openFile}
                />
              ) : (
                <div className="files-empty">暂无文件</div>
              )}
            </div>
            <div className="code-pane">
              {selectedFile ? (
                <>
                  <header>
                    <Code2 size={13} />
                    <span>{selectedFile.path}</span>
                  </header>
                  <pre>
                    <code>{selectedFile.content}</code>
                  </pre>
                  {selectedFile.truncated ? (
                    <small>文件较大，仅显示前 1 MB</small>
                  ) : null}
                </>
              ) : (
                <div className="code-empty">
                  <Code2 size={20} />
                  选择文件查看内容
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export function PlaytestSummary({
  report,
  suggestions = [],
  suggestionsLoading = false,
  suggestionsError = '',
  pendingSuggestionId,
  applyingSuggestionId,
  appliedSuggestionId,
  suggestionApplyError = '',
  replayState,
  onChooseSuggestion,
  onCancelSuggestion,
  onConfirmSuggestion,
  onStart,
  onStop,
}: {
  report: PlaytestReport;
  suggestions?: PlaytestSuggestion[];
  suggestionsLoading?: boolean;
  suggestionsError?: string;
  pendingSuggestionId?: string;
  applyingSuggestionId?: string;
  appliedSuggestionId?: string;
  suggestionApplyError?: string;
  replayState?: PlaytestReplayState;
  onChooseSuggestion?: (suggestionId: string) => void;
  onCancelSuggestion?: () => void;
  onConfirmSuggestion?: (suggestion: PlaytestSuggestion) => void;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const elapsedSeconds = (getPlaytestElapsedMs(report) / 1_000).toFixed(1);
  const statusLabel =
    report.status === 'completed'
      ? '已完成全部关卡'
      : report.status === 'running'
        ? '记录中'
        : '等待游戏开始';
  const actionLabel = {
    idle: '等待',
    'move-left': '向左移动',
    'move-right': '向右移动',
    jump: '跳跃',
  }[report.automationAction];
  const evaluation = getEvaluationCopy(report);
  return (
    <section className="playtest-summary" aria-live="polite">
      <header>
        <strong>试玩记录与自动控制</strong>
        <div className="playtest-controls">
          <span className={`is-${report.status}`}>{statusLabel}</span>
          <span>机器人：{actionLabel}</span>
          <button
            disabled={report.status === 'waiting' || report.automationActive}
            onClick={onStart}
          >
            开始自动试玩
          </button>
          <button disabled={!report.automationActive} onClick={onStop}>
            停止
          </button>
        </div>
      </header>
      <div
        className={`playtest-evaluation is-${report.evaluationStatus}`}
        role="status"
      >
        <strong>自动试玩判断：{evaluation.title}</strong>
        <p>{evaluation.reason}</p>
      </div>
      <dl className="playtest-metrics">
        <div>
          <dt>当前关卡</dt>
          <dd>
            {report.currentLevelIndex} / {report.totalLevels}
          </dd>
        </div>
        <div>
          <dt>开始次数</dt>
          <dd>{report.attempts}</dd>
        </div>
        <div>
          <dt>用时</dt>
          <dd>{elapsedSeconds}s</dd>
        </div>
        <div>
          <dt>最远位置</dt>
          <dd>X {Math.round(report.farthestX)}</dd>
        </div>
        <div>
          <dt>最后位置</dt>
          <dd>
            {Math.round(report.lastX)}, {Math.round(report.lastY)}
          </dd>
        </div>
        <div>
          <dt>跳跃</dt>
          <dd>{report.jumps}</dd>
        </div>
        <div>
          <dt>金币</dt>
          <dd>
            {report.collectedCoinIds.length} / {report.totalCoins}
          </dd>
        </div>
        <div>
          <dt>死亡</dt>
          <dd>{report.deaths}</dd>
        </div>
        <div>
          <dt>最后碰到</dt>
          <dd>{report.lastHazardId ?? '—'}</dd>
        </div>
      </dl>
      {isFailedPlaytestEvaluation(report.evaluationStatus) ? (
        <section className="playtest-suggestions">
          <header>
            <strong>具体修改建议</strong>
            <span>
              {appliedSuggestionId
                ? '已按你的确认修改'
                : '仅建议，尚未修改关卡'}
            </span>
          </header>
          {suggestionsLoading ? (
            <p>正在读取当前关卡并计算建议…</p>
          ) : suggestionsError ? (
            <p>暂时无法读取关卡：{suggestionsError}</p>
          ) : suggestions.length ? (
            suggestions.map((suggestion) => (
              <article key={suggestion.id}>
                <h4>{suggestion.title}</h4>
                <dl>
                  <div>
                    <dt>修改目标</dt>
                    <dd>{suggestion.target}</dd>
                  </div>
                  <div>
                    <dt>当前值</dt>
                    <dd>{suggestion.currentValue}</dd>
                  </div>
                  <div>
                    <dt>建议值</dt>
                    <dd>{suggestion.suggestedValue}</dd>
                  </div>
                  <div>
                    <dt>为什么</dt>
                    <dd>{suggestion.reason}</dd>
                  </div>
                  <div>
                    <dt>可能影响</dt>
                    <dd>{suggestion.impact}</dd>
                  </div>
                </dl>
                {appliedSuggestionId === suggestion.id ? (
                  <p className="suggestion-applied">
                    修改已保存，但尚未重新试玩。
                  </p>
                ) : pendingSuggestionId === suggestion.id ? (
                  <div className="suggestion-confirmation">
                    <p>确认后会修改并保存当前关卡。要继续吗？</p>
                    {suggestionApplyError ? (
                      <p className="is-error">{suggestionApplyError}</p>
                    ) : null}
                    <div>
                      <button
                        disabled={applyingSuggestionId === suggestion.id}
                        onClick={() => onConfirmSuggestion?.(suggestion)}
                      >
                        {applyingSuggestionId === suggestion.id
                          ? '正在保存…'
                          : '确认修改'}
                      </button>
                      <button
                        disabled={applyingSuggestionId === suggestion.id}
                        onClick={onCancelSuggestion}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="choose-suggestion"
                    onClick={() => onChooseSuggestion?.(suggestion.id)}
                  >
                    采用这个建议
                  </button>
                )}
              </article>
            ))
          ) : (
            <p>当前关卡里找不到可以安全指出的物体，因此没有生成建议。</p>
          )}
        </section>
      ) : null}
      {replayState ? <PlaytestComparisonPanel state={replayState} /> : null}
    </section>
  );
}

function PlaytestComparisonPanel({ state }: { state: PlaytestReplayState }) {
  if (state.phase === 'reloading') {
    return (
      <section className="playtest-comparison is-running">
        <strong>修改后复测：正在载入最新版关卡…</strong>
        <p>修改已经保存，机器人会在新游戏准备好后自动开始一次试玩。</p>
      </section>
    );
  }
  if (state.phase === 'starting') {
    return (
      <section className="playtest-comparison is-running">
        <strong>修改后复测：最新版关卡已载入，正在启动机器人…</strong>
        <p>收到机器人确认后才会开始计算复测结果。</p>
      </section>
    );
  }
  if (state.phase === 'running') {
    return (
      <section className="playtest-comparison is-running">
        <strong>修改后复测：机器人正在试玩</strong>
        <p>本轮只验证一次，不会根据结果继续自动修改。</p>
      </section>
    );
  }
  if (state.phase === 'error') {
    return (
      <section className="playtest-comparison is-error">
        <strong>修改已保存，但复测没有启动</strong>
        <p>{state.error ?? '无法重新载入浏览器游戏。'}</p>
      </section>
    );
  }
  const after = state.after!;
  const comparison = state.comparison!;
  const verdictLabel = {
    improved: '有改善',
    regressed: '变差',
    unchanged: '暂无明确变化',
    inconclusive: '无法判断',
  }[comparison.verdict];
  return (
    <section className={`playtest-comparison is-${comparison.verdict}`}>
      <header>
        <strong>修改后复测：{verdictLabel}</strong>
        <span>{state.suggestionTitle}</span>
      </header>
      <p>{comparison.reason}</p>
      <table>
        <thead>
          <tr>
            <th>对比项目</th>
            <th>修改前</th>
            <th>修改后</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>结果</th>
            <td>{evaluationStatusLabel(state.before.evaluationStatus)}</td>
            <td>{evaluationStatusLabel(after.evaluationStatus)}</td>
          </tr>
          <tr>
            <th>死亡</th>
            <td>{state.before.automationDeaths}</td>
            <td>{after.automationDeaths}</td>
          </tr>
          <tr>
            <th>最远进展</th>
            <td>{Math.round(state.before.farthestDistance)} px</td>
            <td>{Math.round(after.farthestDistance)} px</td>
          </tr>
          <tr>
            <th>用时</th>
            <td>{(state.before.elapsedMs / 1_000).toFixed(1)}s</td>
            <td>{(after.elapsedMs / 1_000).toFixed(1)}s</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function evaluationStatusLabel(
  status: PlaytestResultSnapshot['evaluationStatus'],
): string {
  return {
    'not-started': '未开始',
    running: '测试中',
    success: '成功',
    'repeated-death': '反复死亡',
    stuck: '卡住',
    timeout: '超时',
    stopped: '用户停止',
  }[status];
}

function getEvaluationCopy(report: PlaytestReport): {
  title: string;
  reason: string;
} {
  switch (report.evaluationStatus) {
    case 'running':
      return {
        title: '测试中',
        reason: '机器人正在试玩，系统会持续观察它能否前进和到达终点。',
      };
    case 'success':
      return { title: '成功', reason: '机器人已经完成全部关卡。' };
    case 'repeated-death':
      return {
        title: '反复死亡',
        reason: `本次自动试玩已经死亡 ${report.automationDeaths} 次，达到 ${PLAYTEST_REPEATED_DEATH_LIMIT} 次的判断标准。最后碰到的是 ${report.lastHazardId ?? '未知尖刺'}。`,
      };
    case 'stuck':
      return {
        title: '卡住',
        reason: `角色连续 ${PLAYTEST_STUCK_MS / 1_000} 秒没有向左或向右移动至少 ${PLAYTEST_PROGRESS_DISTANCE} 像素。`,
      };
    case 'timeout':
      return {
        title: '超时',
        reason: `自动试玩已经运行 ${getPlaytestTimeoutMs(report) / 1_000} 秒，仍然没有完成全部关卡。`,
      };
    case 'stopped':
      return {
        title: '用户停止',
        reason: '你在系统得出成功或失败结论前停止了自动试玩。',
      };
    default:
      return {
        title: '尚未开始',
        reason: '点击“开始自动试玩”后，系统会从你选择的关卡开始检查。',
      };
  }
}

function addPreviewStartLevel(url: string, levelId?: string): string {
  if (!levelId) return url;
  const previewUrl = new URL(url);
  previewUrl.searchParams.set('liimitStartLevel', levelId);
  return previewUrl.toString();
}

function toMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    '',
  );
}
