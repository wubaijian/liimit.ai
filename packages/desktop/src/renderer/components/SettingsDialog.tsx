import {
  Activity,
  Blocks,
  Braces,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  KeyRound,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Save,
  ServerCog,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Volume2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiCostPanel } from './ApiCostPanel';
import type {
  AgentEvent,
  ApiUsageRecord,
  ApiUsageSnapshot,
  AppSettings,
  AudioDurationSeconds,
  AudioPreviewCandidate,
  AudioPreviewCandidateNumber,
  AudioPreviewProgress,
  DependencyAction,
  DesktopDependency,
  DesktopDependencyId,
  GameSoundSlot,
  ProjectRecord,
  ProjectAudioOverrideSnapshot,
  ProviderConnectionInput,
  ProviderConnectionResult,
  ProviderEndpoint,
  ProviderSlot,
} from '../../shared/types';
import {
  AUDIO_DESCRIPTION_MAX_LENGTH,
  AUDIO_DURATION_OPTIONS,
  AUDIO_RECOMMENDED_DURATION_BY_SOUND,
} from '../../shared/types';
import {
  pauseAndResetOtherCandidates,
  removeCandidatePlayer,
  replayCandidateFromStart,
} from '../audioCandidatePlayback';
import { generateMissingLocalCandidates } from '../localSfxFallback';

interface SettingsDialogProps {
  value: AppSettings;
  project?: ProjectRecord;
  events: AgentEvent[];
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<AppSettings>;
  onTest: (input: ProviderConnectionInput) => Promise<ProviderConnectionResult>;
}

type SettingsSection = 'api' | 'developer' | 'dependencies';
type DeveloperView = 'prompts' | 'functions' | 'scheduler';

const PROVIDERS: Array<{
  key: ProviderSlot;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'main',
    label: '主 Agent',
    shortLabel: 'AGENT',
    description: '规划、编码和工具调用',
  },
  {
    key: 'reasoning',
    label: '策划模型',
    shortLabel: 'PLAN',
    description: '类型识别与 GDD',
  },
  {
    key: 'image',
    label: '图像模型',
    shortLabel: 'IMAGE',
    description: '背景、角色与图块',
  },
  {
    key: 'video',
    label: '视频模型',
    shortLabel: 'VIDEO',
    description: '动画帧与视频素材',
  },
  {
    key: 'audio',
    label: '音频模型',
    shortLabel: 'AUDIO',
    description: 'BGM、音效与合成',
  },
];

const STANDARD_PROVIDER_OPTIONS = [
  { value: 'openai-compat', label: 'OpenAI Compatible' },
  { value: 'tongyi', label: '通义 / DashScope' },
  { value: 'doubao', label: '豆包 / ARK' },
] as const;

const PROFESSIONAL_AUDIO_OPTIONS = [
  { value: 'elevenlabs', label: 'ElevenLabs Music + SFX' },
  { value: 'minimax', label: 'MiniMax Music' },
  { value: 'stability', label: 'Stable Audio' },
  { value: 'google-lyria', label: 'Google Lyria 2' },
  { value: 'mureka', label: 'Mureka Instrumental' },
] as const;

const AUDIO_PRESETS: Partial<
  Record<
    ProviderEndpoint['provider'],
    Pick<ProviderEndpoint, 'baseUrl' | 'model'>
  >
> = {
  'openai-compat': {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  tongyi: {
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'qwen-plus',
  },
  doubao: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1-6-251015',
  },
  elevenlabs: {
    baseUrl: 'https://api.elevenlabs.io',
    model: 'music_v2',
  },
  minimax: {
    baseUrl: 'https://api.minimaxi.com',
    model: 'music-2.6-free',
  },
  stability: {
    baseUrl: 'https://api.stability.ai',
    model: 'stable-audio-3',
  },
  'google-lyria': {
    baseUrl:
      'https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models',
    model: 'lyria-002',
  },
  mureka: {
    baseUrl: 'https://api.mureka.ai',
    model: 'mureka-9',
  },
};

const GAME_SOUND_OPTIONS: Array<{ value: GameSoundSlot; label: string }> = [
  { value: 'jump', label: '跳跃' },
  { value: 'coin', label: '拾取金币' },
  { value: 'death', label: '角色死亡' },
  { value: 'levelClear', label: '完成关卡' },
  { value: 'enemyHit', label: '踩中敌人' },
  { value: 'checkpoint', label: '激活检查点' },
];

const GAME_SOUND_EXAMPLES: Record<GameSoundSlot, string> = {
  jump: '例如：轻快、短促，像弹簧向上弹起的卡通跳跃声',
  coin: '例如：清脆、明亮，像玻璃轻碰的奖励声音',
  death: '例如：复古像素风，短促下降，但不要让人害怕',
  levelClear: '例如：明亮、有成就感的简短通关提示声',
  enemyHit: '例如：软乎乎的怪物被踩扁，带一点弹性的声音',
  checkpoint: '例如：温暖、闪亮，表示检查点已经激活的声音',
};

const SECTION_NAV: Array<{
  key: SettingsSection;
  label: string;
  description: string;
  icon: typeof Gauge;
}> = [
  {
    key: 'api',
    label: 'API 与用量',
    description: '服务、测速、Token',
    icon: Gauge,
  },
  {
    key: 'developer',
    label: '开发者',
    description: '提示词与调用链',
    icon: Braces,
  },
  {
    key: 'dependencies',
    label: '运行环境',
    description: 'Node.js 与构建工具',
    icon: SquareTerminal,
  },
];

export function SettingsDialog({
  value,
  project,
  events,
  onClose,
  onSave,
  onTest,
}: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>(structuredClone(value));
  const [section, setSection] = useState<SettingsSection>('api');
  const [activeProvider, setActiveProvider] = useState<ProviderSlot>('main');
  const [developerView, setDeveloperView] = useState<DeveloperView>('prompts');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [audioPreviewBusy, setAudioPreviewBusy] = useState(false);
  const [audioApplyBusy, setAudioApplyBusy] = useState(false);
  const [audioRestoreBusy, setAudioRestoreBusy] = useState(false);
  const [audioSettingsDirty, setAudioSettingsDirty] = useState(false);
  const [audioSound, setAudioSound] = useState<GameSoundSlot>('jump');
  const [audioDescription, setAudioDescription] = useState('');
  const [audioDurationSeconds, setAudioDurationSeconds] =
    useState<AudioDurationSeconds>(AUDIO_RECOMMENDED_DURATION_BY_SOUND.jump);
  const [audioOverrides, setAudioOverrides] =
    useState<ProjectAudioOverrideSnapshot['overrides']>();
  const [audioOverridesLoading, setAudioOverridesLoading] = useState(false);
  const [audioCandidates, setAudioCandidates] = useState<
    Array<{
      url: string;
      provider: AudioPreviewCandidate['provider'];
      model: AudioPreviewCandidate['model'];
      mimeType: AudioPreviewCandidate['mimeType'];
      latencyMs: number;
      sound: GameSoundSlot;
      durationSeconds: AudioDurationSeconds;
      candidateNumber: AudioPreviewCandidateNumber;
      bytes: Uint8Array;
    }>
  >([]);
  const [selectedAudioCandidate, setSelectedAudioCandidate] =
    useState<AudioPreviewCandidateNumber>();
  const [audioBatchFailedCount, setAudioBatchFailedCount] = useState(0);
  const [audioPreviewProgress, setAudioPreviewProgress] =
    useState<AudioPreviewProgress>();
  const [audioStopBusy, setAudioStopBusy] = useState(false);
  const audioCandidateUrls = useRef<string[]>([]);
  const audioGenerationActive = useRef(false);
  const activeAudioGenerationId = useRef<string | undefined>(undefined);
  const audioStopRequested = useRef(false);
  const audioOverridesRequest = useRef(0);
  const mounted = useRef(true);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning' | 'error' | 'progress';
    message: string;
  }>();
  const [usage, setUsage] = useState<ApiUsageSnapshot>();
  const [usageLoading, setUsageLoading] = useState(true);
  const [dependencies, setDependencies] = useState<DesktopDependency[]>();
  const [dependencyLoading, setDependencyLoading] = useState(false);
  const [dependencyBusy, setDependencyBusy] = useState<DesktopDependencyId>();
  const [dependencyLog, setDependencyLog] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);

  const current = settings[activeProvider];
  const functionEvents = useMemo(
    () =>
      events
        .filter(
          (event) => event.type === 'tool_call' || event.type === 'tool_result',
        )
        .slice(-60)
        .reverse(),
    [events],
  );
  const configuredProviders = PROVIDERS.filter(
    (provider) => settings[provider.key].apiKeyConfigured,
  ).length;
  const runtimeDependencies = dependencies?.filter((item) => item.id === 'npx');
  const installedDependencies =
    runtimeDependencies?.filter(
      (dependency) => dependency.status === 'installed',
    ).length ?? 0;

  useEffect(() => {
    mounted.current = true;
    void refreshUsage();
    const unsubscribe = window.gameAgent.onDependencyOutput((output) => {
      setDependencyLog((previous) =>
        `${previous}${output.text}`.slice(-60_000),
      );
    });
    const unsubscribeAudioPreviewProgress =
      window.gameAgent.onAudioPreviewProgress((progress) => {
        if (!mounted.current || !audioGenerationActive.current) return;
        if (!activeAudioGenerationId.current) {
          activeAudioGenerationId.current = progress.generationId;
        }
        if (progress.generationId !== activeAudioGenerationId.current) return;
        setAudioPreviewProgress(progress);
      });
    return () => {
      mounted.current = false;
      unsubscribe();
      unsubscribeAudioPreviewProgress();
      audioGenerationActive.current = false;
      audioCandidateUrls.current.forEach((url) => URL.revokeObjectURL(url));
      audioCandidateUrls.current = [];
    };
  }, []);

  useEffect(() => {
    if (section !== 'dependencies' || dependencies) return;
    void refreshDependencies();
  }, [section, dependencies]);

  useEffect(() => {
    if (!project) {
      audioOverridesRequest.current += 1;
      setAudioOverrides(undefined);
      return;
    }
    void refreshAudioOverrides(project.id);
  }, [project]);

  useEffect(() => {
    if (section !== 'developer' || !settings.developerMode || !project) {
      setSystemPrompt('');
      return;
    }
    let cancelled = false;
    setPromptLoading(true);
    void window.gameAgent
      .readFile(project.id, '.qwen/system.md')
      .then((file) => {
        if (!cancelled) setSystemPrompt(file.content);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSystemPrompt(`无法读取项目系统提示词：${toMessage(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) setPromptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, section, settings.developerMode]);

  function updateEndpoint(patch: Partial<ProviderEndpoint>) {
    setFeedback(undefined);
    if (activeProvider === 'audio') {
      setAudioSettingsDirty(true);
      releaseAudioPreview();
    }
    setSettings((previous) => ({
      ...previous,
      [activeProvider]: { ...previous[activeProvider], ...patch },
    }));
  }

  function selectProvider(provider: ProviderEndpoint['provider']) {
    const changed = provider !== current.provider;
    updateEndpoint({
      provider,
      ...(activeProvider === 'audio' ? AUDIO_PRESETS[provider] : {}),
      ...(changed
        ? { apiKey: '', apiKeyConfigured: false, apiKeyInherited: false }
        : {}),
    });
  }

  async function save() {
    setBusy(true);
    setFeedback(undefined);
    try {
      const saved = await onSave(settings);
      releaseAudioPreview();
      setSettings(structuredClone(saved));
      setAudioSettingsDirty(false);
      setFeedback({ tone: 'success', message: '设置已安全保存' });
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setFeedback({ tone: 'progress', message: '正在执行基础测速…' });
    try {
      const result = await onTest({ slot: activeProvider, endpoint: current });
      setFeedback({
        tone: result.status,
        message: `${result.message}（${result.latencyMs} ms）`,
      });
      await refreshUsage();
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setTesting(false);
    }
  }

  function releaseAudioPreview() {
    audioCandidateUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioCandidateUrls.current = [];
    setAudioCandidates([]);
    setSelectedAudioCandidate(undefined);
    setAudioBatchFailedCount(0);
  }

  async function generateAudioPreview() {
    const description = audioDescription.trim();
    if (!description) {
      setFeedback({
        tone: 'warning',
        message: '请先描述你想要的声音。',
      });
      return;
    }
    // Reject control characters before sending an audio description.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F-\u009F]/u.test(description)) {
      setFeedback({
        tone: 'warning',
        message: '音效描述包含无法识别的字符，请重新输入。',
      });
      return;
    }
    if (
      activeProvider !== 'audio' ||
      current.provider !== 'elevenlabs' ||
      !current.apiKeyConfigured ||
      audioSettingsDirty
    ) {
      setFeedback({
        tone: 'warning',
        message: '请先保存当前 ElevenLabs 音频设置，再生成测试音效。',
      });
      return;
    }

    audioStopRequested.current = false;
    activeAudioGenerationId.current = undefined;
    audioGenerationActive.current = true;
    setAudioPreviewProgress(undefined);
    setAudioStopBusy(false);
    setAudioPreviewBusy(true);
    releaseAudioPreview();
    setFeedback({
      tone: 'progress',
      message: `正在同时生成 3 条 ${audioDurationSeconds} 秒候选音效，请勿重复点击…`,
    });
    try {
      const result = await window.gameAgent.generateAudioPreview({
        sound: audioSound,
        description: audioDescription.trim(),
        durationSeconds: audioDurationSeconds,
      });
      if (!mounted.current) return;
      if (audioStopRequested.current) {
        setFeedback({
          tone: 'warning',
          message:
            '本次音效生成已停止，所有候选均已作废。已完成的请求可能已经消耗额度。',
        });
        return;
      }
      const candidateUrls: string[] = [];
      const candidates = result.candidates.map((candidate) => {
        const sourceBytes = new Uint8Array(candidate.bytes);
        const buffer = new ArrayBuffer(sourceBytes.byteLength);
        new Uint8Array(buffer).set(sourceBytes);
        const url = URL.createObjectURL(
          new Blob([buffer], { type: candidate.mimeType }),
        );
        candidateUrls.push(url);
        return {
          url,
          provider: candidate.provider,
          model: candidate.model,
          mimeType: candidate.mimeType,
          latencyMs: candidate.latencyMs,
          sound: candidate.sound,
          durationSeconds: candidate.durationSeconds,
          candidateNumber: candidate.candidateNumber,
          bytes: sourceBytes,
        };
      });
      audioCandidateUrls.current = candidateUrls;
      setAudioCandidates(candidates);
      setSelectedAudioCandidate(undefined);
      setAudioBatchFailedCount(result.failedCount);
      setFeedback({
        tone: result.failedCount ? 'warning' : 'success',
        message: result.failedCount
          ? `已生成 ${result.candidates.length} 条候选，${result.failedCount} 条失败；可试听成功结果。`
          : `3 条候选音效已生成，请试听后选择（${result.latencyMs} ms）`,
      });
      await refreshUsage();
    } catch (error) {
      if (mounted.current) {
        setFeedback({
          tone: audioStopRequested.current ? 'warning' : 'error',
          message: audioStopRequested.current
            ? '本次音效生成已停止，所有候选均已作废。已完成的请求可能已经消耗额度。'
            : toMessage(error),
        });
      }
    } finally {
      audioGenerationActive.current = false;
      activeAudioGenerationId.current = undefined;
      if (mounted.current) {
        setAudioPreviewBusy(false);
        setAudioStopBusy(false);
      }
    }
  }

  async function cancelAudioPreviewGeneration() {
    if (!audioPreviewBusy || audioStopBusy) return;
    audioStopRequested.current = true;
    setAudioStopBusy(true);
    releaseAudioPreview();
    setFeedback({ tone: 'progress', message: '正在停止本次音效生成…' });
    try {
      await window.gameAgent.cancelAudioPreviewGeneration();
    } catch (error) {
      audioStopRequested.current = false;
      if (mounted.current) {
        setAudioStopBusy(false);
        setFeedback({ tone: 'error', message: toMessage(error) });
      }
    }
  }

  function fillMissingAudioCandidatesLocally() {
    if (!audioBatchFailedCount || audioPreviewBusy || audioApplyBusy) return;
    try {
      const generated = generateMissingLocalCandidates({
        sound: audioSound,
        durationSeconds: audioDurationSeconds,
        existingCandidateNumbers: audioCandidates.map(
          (candidate) => candidate.candidateNumber,
        ),
      });
      const localUrls: string[] = [];
      const localCandidates = generated.map((candidate) => {
        const sourceBytes = new Uint8Array(candidate.bytes);
        const buffer = new ArrayBuffer(sourceBytes.byteLength);
        new Uint8Array(buffer).set(sourceBytes);
        const url = URL.createObjectURL(
          new Blob([buffer], { type: candidate.mimeType }),
        );
        localUrls.push(url);
        return {
          url,
          provider: candidate.provider,
          model: candidate.model,
          mimeType: candidate.mimeType,
          latencyMs: candidate.latencyMs,
          sound: candidate.sound,
          durationSeconds: candidate.durationSeconds,
          candidateNumber: candidate.candidateNumber,
          bytes: sourceBytes,
        };
      });
      audioCandidateUrls.current.push(...localUrls);
      setAudioCandidates((currentCandidates) =>
        [...currentCandidates, ...localCandidates].sort(
          (left, right) => left.candidateNumber - right.candidateNumber,
        ),
      );
      setAudioBatchFailedCount(0);
      setFeedback({
        tone: 'success',
        message: `已在本机补齐 ${localCandidates.length} 条音效，没有调用 API，也不会产生 API 费用。`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    }
  }

  async function applyAudioPreview() {
    const selectedCandidate = audioCandidates.find(
      (candidate) => candidate.candidateNumber === selectedAudioCandidate,
    );
    if (
      !project ||
      !selectedCandidate?.bytes ||
      selectedCandidate.sound !== audioSound
    ) {
      setFeedback({
        tone: 'warning',
        message: !project
          ? '请先选择一个游戏项目。'
          : audioCandidates.length
            ? '请先选择一条候选音效。'
            : '请先生成并试听当前用途的音效。',
      });
      return;
    }
    setAudioApplyBusy(true);
    setFeedback({
      tone: 'progress',
      message: '等待确认；确认后会保存音效并重新构建游戏…',
    });
    try {
      const result = await window.gameAgent.applyAudioPreview({
        projectId: project.id,
        sound: selectedCandidate.sound,
        mimeType: selectedCandidate.mimeType,
        bytes: selectedCandidate.bytes,
      });
      if (!mounted.current) return;
      if (result.status === 'cancelled') {
        setFeedback({ tone: 'warning', message: '已取消，没有修改游戏。' });
        return;
      }
      releaseAudioPreview();
      await refreshAudioOverrides(project.id);
      setFeedback({
        tone: 'success',
        message: '新音效已应用。关闭设置后刷新 Web 试玩即可体验。',
      });
    } catch (error) {
      if (mounted.current) {
        setFeedback({ tone: 'error', message: toMessage(error) });
      }
    } finally {
      if (mounted.current) setAudioApplyBusy(false);
    }
  }

  async function refreshAudioOverrides(projectId: string) {
    const requestId = ++audioOverridesRequest.current;
    setAudioOverridesLoading(true);
    try {
      const result =
        await window.gameAgent.loadProjectAudioOverrides(projectId);
      if (
        mounted.current &&
        requestId === audioOverridesRequest.current &&
        result.projectId === projectId
      ) {
        setAudioOverrides(result.overrides);
      }
    } catch (error) {
      if (mounted.current && requestId === audioOverridesRequest.current) {
        setAudioOverrides(undefined);
        setFeedback({ tone: 'error', message: toMessage(error) });
      }
    } finally {
      if (mounted.current && requestId === audioOverridesRequest.current) {
        setAudioOverridesLoading(false);
      }
    }
  }

  async function restoreProjectAudio() {
    if (!project || !audioOverrides?.[audioSound]) return;
    setAudioRestoreBusy(true);
    setFeedback({
      tone: 'progress',
      message: '等待确认；确认后会恢复内置声音并重新构建游戏…',
    });
    try {
      const result = await window.gameAgent.restoreProjectAudio({
        projectId: project.id,
        sound: audioSound,
      });
      if (!mounted.current) return;
      if (result.status === 'cancelled') {
        setFeedback({ tone: 'warning', message: '已取消，没有修改游戏。' });
        return;
      }
      await refreshAudioOverrides(project.id);
      setFeedback({
        tone: 'success',
        message:
          result.status === 'restored'
            ? '已恢复内置音效。关闭设置后刷新 Web 试玩即可体验。'
            : '当前已经是内置音效，无需恢复。',
      });
    } catch (error) {
      if (mounted.current) {
        setFeedback({ tone: 'error', message: toMessage(error) });
      }
    } finally {
      if (mounted.current) setAudioRestoreBusy(false);
    }
  }

  async function refreshUsage() {
    setUsageLoading(true);
    try {
      setUsage(await window.gameAgent.loadApiUsage());
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setUsageLoading(false);
    }
  }

  async function refreshDependencies() {
    setDependencyLoading(true);
    try {
      setDependencies(await window.gameAgent.inspectDependencies());
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setDependencyLoading(false);
    }
  }

  async function runDependencyAction(
    dependency: DesktopDependency,
    action: DependencyAction,
  ) {
    setDependencyBusy(dependency.id);
    setDependencyLog('');
    setFeedback({
      tone: 'progress',
      message:
        action === 'open'
          ? `正在打开 ${dependency.name}…`
          : `正在${action === 'install' ? '安装' : '更新'} ${dependency.name}…`,
    });
    try {
      const result = await window.gameAgent.runDependencyAction({
        id: dependency.id,
        action,
      });
      if (!result) {
        setFeedback({ tone: 'warning', message: '依赖操作已取消' });
        return;
      }
      setDependencyLog((previous) =>
        `${previous}${result.output ? `\n${result.output}` : ''}`.slice(
          -60_000,
        ),
      );
      setFeedback({
        tone: result.success ? 'success' : 'error',
        message: result.message,
      });
      await refreshDependencies();
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setDependencyBusy(undefined);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog settings-dialog settings-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <div>
            <span className="dialog-index">SYSTEM / CONTROL CENTER</span>
            <h2 id="settings-title">设置</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="settings-center-layout">
          <nav className="settings-center-nav" aria-label="设置分类">
            <div className="settings-nav-caption">SETTINGS</div>
            {SECTION_NAV.map((item) => {
              const Icon = item.icon;
              const meta =
                item.key === 'api'
                  ? `${configuredProviders}/5`
                  : item.key === 'developer'
                    ? settings.developerMode
                      ? 'ON'
                      : 'OFF'
                    : runtimeDependencies
                      ? `${installedDependencies}/${runtimeDependencies.length}`
                      : '—';
              return (
                <button
                  key={item.key}
                  className={section === item.key ? 'is-active' : ''}
                  aria-current={section === item.key ? 'page' : undefined}
                  onClick={() => {
                    setSection(item.key);
                    setFeedback(undefined);
                  }}
                >
                  <Icon size={17} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <i>{meta}</i>
                </button>
              );
            })}
            <div className="settings-nav-note">
              <ShieldCheck size={15} />
              <span>密钥由系统安全存储加密，开发者视图不显示凭据。</span>
            </div>
          </nav>

          <div
            className={`settings-center-content ${
              section === 'api' ? 'is-api-scroll-locked' : ''
            }`}
          >
            {section === 'api' ? (
              <ApiPanel
                settings={settings}
                active={activeProvider}
                current={current}
                usage={usage}
                usageLoading={usageLoading}
                project={project}
                events={events}
                audioCandidates={audioCandidates}
                selectedAudioCandidate={selectedAudioCandidate}
                audioBatchFailedCount={audioBatchFailedCount}
                audioPreviewBusy={audioPreviewBusy}
                audioPreviewProgress={audioPreviewProgress}
                audioStopBusy={audioStopBusy}
                audioApplyBusy={audioApplyBusy}
                audioRestoreBusy={audioRestoreBusy}
                audioSettingsDirty={audioSettingsDirty}
                audioSound={audioSound}
                audioDescription={audioDescription}
                audioDurationSeconds={audioDurationSeconds}
                audioOverrides={audioOverrides}
                audioOverridesLoading={audioOverridesLoading}
                onActiveChange={(slot) => {
                  setActiveProvider(slot);
                  if (slot !== 'audio') releaseAudioPreview();
                }}
                onProviderChange={selectProvider}
                onEndpointChange={updateEndpoint}
                onGenerateAudioPreview={() => void generateAudioPreview()}
                onCancelAudioPreview={() => void cancelAudioPreviewGeneration()}
                onAudioSoundChange={(sound) => {
                  if (sound !== audioSound) releaseAudioPreview();
                  setAudioSound(sound);
                  setAudioDurationSeconds(
                    AUDIO_RECOMMENDED_DURATION_BY_SOUND[sound],
                  );
                  setFeedback(undefined);
                }}
                onAudioDescriptionChange={(description) => {
                  if (description !== audioDescription) releaseAudioPreview();
                  setAudioDescription(description);
                  setFeedback(undefined);
                }}
                onAudioDurationChange={(durationSeconds) => {
                  if (durationSeconds !== audioDurationSeconds) {
                    releaseAudioPreview();
                  }
                  setAudioDurationSeconds(durationSeconds);
                  setFeedback(undefined);
                }}
                onAudioCandidateSelect={setSelectedAudioCandidate}
                onFillMissingAudioCandidates={fillMissingAudioCandidatesLocally}
                onApplyAudioPreview={() => void applyAudioPreview()}
                onRestoreProjectAudio={() => void restoreProjectAudio()}
                onRefresh={() => void refreshUsage()}
              />
            ) : null}
            {section === 'developer' ? (
              <DeveloperPanel
                enabled={settings.developerMode}
                view={developerView}
                project={project}
                events={events}
                functionEvents={functionEvents}
                systemPrompt={systemPrompt}
                promptLoading={promptLoading}
                onEnabledChange={(enabled) => {
                  setSettings((previous) => ({
                    ...previous,
                    developerMode: enabled,
                  }));
                  setFeedback({
                    tone: 'warning',
                    message: '点击“保存设置”后生效',
                  });
                }}
                onViewChange={setDeveloperView}
              />
            ) : null}
            {section === 'dependencies' ? (
              <DependenciesPanel
                dependencies={runtimeDependencies}
                loading={dependencyLoading}
                busyId={dependencyBusy}
                log={dependencyLog}
                onRefresh={() => void refreshDependencies()}
                onAction={(dependency, action) =>
                  void runDependencyAction(dependency, action)
                }
              />
            ) : null}
          </div>
        </div>

        <footer className="settings-footer settings-center-footer">
          <div className="settings-footer-note">
            {section === 'dependencies' ? (
              <>
                <Wrench size={14} /> Node.js/npm
                安装与更新使用固定白名单，并在执行前再次确认。
              </>
            ) : section === 'developer' ? (
              <>
                <Braces size={14} /> 开发者模式只增加可观测性，不提升 Agent
                权限。
              </>
            ) : (
              <>
                <Activity size={14} /> 用量为本机累计，不包含费用估算。
              </>
            )}
          </div>
          <span
            className={`save-message ${feedback?.tone ?? ''}`}
            role="status"
          >
            {feedback?.message}
          </span>
          {section !== 'dependencies' ? (
            <div className="settings-actions">
              {section === 'api' ? (
                <button
                  className="secondary-button"
                  onClick={() => void testConnection()}
                  disabled={
                    busy ||
                    testing ||
                    audioPreviewBusy ||
                    audioApplyBusy ||
                    audioRestoreBusy
                  }
                >
                  {testing ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Zap size={15} />
                  )}
                  {testing ? '测速中…' : '基础测速'}
                </button>
              ) : null}
              <button
                className="primary-button"
                onClick={() => void save()}
                disabled={
                  busy ||
                  testing ||
                  audioPreviewBusy ||
                  audioApplyBusy ||
                  audioRestoreBusy
                }
              >
                <Save size={15} />
                {busy ? '保存中…' : '保存设置'}
              </button>
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

interface ApiPanelProps {
  settings: AppSettings;
  active: ProviderSlot;
  current: ProviderEndpoint;
  usage?: ApiUsageSnapshot;
  usageLoading: boolean;
  project?: ProjectRecord;
  events: AgentEvent[];
  audioCandidates: Array<{
    url: string;
    provider: AudioPreviewCandidate['provider'];
    model: AudioPreviewCandidate['model'];
    mimeType: AudioPreviewCandidate['mimeType'];
    latencyMs: number;
    sound: GameSoundSlot;
    durationSeconds: AudioDurationSeconds;
    candidateNumber: AudioPreviewCandidateNumber;
    bytes: Uint8Array;
  }>;
  selectedAudioCandidate?: AudioPreviewCandidateNumber;
  audioBatchFailedCount: number;
  audioPreviewBusy: boolean;
  audioPreviewProgress?: AudioPreviewProgress;
  audioStopBusy: boolean;
  audioApplyBusy: boolean;
  audioRestoreBusy: boolean;
  audioSettingsDirty: boolean;
  audioSound: GameSoundSlot;
  audioDescription: string;
  audioDurationSeconds: AudioDurationSeconds;
  audioOverrides?: ProjectAudioOverrideSnapshot['overrides'];
  audioOverridesLoading: boolean;
  onActiveChange: (slot: ProviderSlot) => void;
  onProviderChange: (provider: ProviderEndpoint['provider']) => void;
  onEndpointChange: (patch: Partial<ProviderEndpoint>) => void;
  onGenerateAudioPreview: () => void;
  onCancelAudioPreview: () => void;
  onAudioSoundChange: (sound: GameSoundSlot) => void;
  onAudioDescriptionChange: (description: string) => void;
  onAudioDurationChange: (durationSeconds: AudioDurationSeconds) => void;
  onAudioCandidateSelect: (candidate: AudioPreviewCandidateNumber) => void;
  onFillMissingAudioCandidates: () => void;
  onApplyAudioPreview: () => void;
  onRestoreProjectAudio: () => void;
  onRefresh: () => void;
}

function ApiPanel({
  settings,
  active,
  current,
  usage,
  usageLoading,
  project,
  events,
  audioCandidates,
  selectedAudioCandidate,
  audioBatchFailedCount,
  audioPreviewBusy,
  audioPreviewProgress,
  audioStopBusy,
  audioApplyBusy,
  audioRestoreBusy,
  audioSettingsDirty,
  audioSound,
  audioDescription,
  audioDurationSeconds,
  audioOverrides,
  audioOverridesLoading,
  onActiveChange,
  onProviderChange,
  onEndpointChange,
  onGenerateAudioPreview,
  onCancelAudioPreview,
  onAudioSoundChange,
  onAudioDescriptionChange,
  onAudioDurationChange,
  onAudioCandidateSelect,
  onFillMissingAudioCandidates,
  onApplyAudioPreview,
  onRestoreProjectAudio,
  onRefresh,
}: ApiPanelProps) {
  const [activityView, setActivityView] = useState<'work' | 'usage'>('work');
  const [playingAudioCandidate, setPlayingAudioCandidate] =
    useState<AudioPreviewCandidateNumber>();
  const [audioPlaybackError, setAudioPlaybackError] = useState('');
  const candidateAudioPlayers = useRef<
    Map<AudioPreviewCandidateNumber, HTMLAudioElement>
  >(new Map());
  const candidateAudioRefCallbacks = useRef(
    new Map<
      AudioPreviewCandidateNumber,
      (element: HTMLAudioElement | null) => void
    >(),
  );

  function candidateAudioRef(candidateNumber: AudioPreviewCandidateNumber) {
    const existing = candidateAudioRefCallbacks.current.get(candidateNumber);
    if (existing) return existing;
    const callback = (element: HTMLAudioElement | null) => {
      if (element) {
        candidateAudioPlayers.current.set(candidateNumber, element);
        return;
      }
      removeCandidatePlayer(candidateAudioPlayers.current, candidateNumber);
      setPlayingAudioCandidate((current) =>
        current === candidateNumber ? undefined : current,
      );
    };
    candidateAudioRefCallbacks.current.set(candidateNumber, callback);
    return callback;
  }

  function handleCandidatePlay(candidateNumber: AudioPreviewCandidateNumber) {
    pauseAndResetOtherCandidates(
      candidateAudioPlayers.current,
      candidateNumber,
    );
    setAudioPlaybackError('');
    setPlayingAudioCandidate(candidateNumber);
  }

  function handleCandidateStopped(
    candidateNumber: AudioPreviewCandidateNumber,
  ) {
    setPlayingAudioCandidate((current) =>
      current === candidateNumber ? undefined : current,
    );
  }

  async function replayCandidate(candidateNumber: AudioPreviewCandidateNumber) {
    setAudioPlaybackError('');
    try {
      await replayCandidateFromStart(
        candidateAudioPlayers.current,
        candidateNumber,
      );
      setPlayingAudioCandidate(candidateNumber);
    } catch {
      setAudioPlaybackError('当前候选无法播放，请重新生成后再试。');
    }
  }
  const totals = usage?.totals;
  const successRate = totals?.runs
    ? Math.round((totals.successes / totals.runs) * 100)
    : 0;
  const workEvents = events
    .filter((event) =>
      [
        'user',
        'assistant',
        'tool_call',
        'tool_result',
        'error',
        'complete',
      ].includes(event.type),
    )
    .slice(-20)
    .reverse();
  return (
    <section className="settings-page api-settings-page">
      <div className="settings-page-heading">
        <div>
          <span>API CONTROL / LOCAL TELEMETRY</span>
          <h3>API 管理与调用</h3>
          <p>
            配置服务、执行基础测速，并查看 liimit.ai 在本机记录的调用与 Token。
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={onRefresh}
          disabled={usageLoading}
        >
          <RefreshCw className={usageLoading ? 'spin' : ''} size={14} />
          刷新用量
        </button>
      </div>

      <ApiCostPanel projectId={null} />
      <div className="usage-metrics" aria-label="API 用量摘要">
        <MetricCard
          label="API CALLS"
          value={formatNumber(totals?.calls ?? 0)}
          detail={`${formatNumber(totals?.runs ?? 0)} 个 Agent 回合 / 测速`}
          icon={<Activity size={16} />}
        />
        <MetricCard
          label="SUCCESS RATE"
          value={`${successRate}%`}
          detail={`${totals?.failures ?? 0} 次失败 · ${totals?.warnings ?? 0} 次警告`}
          icon={<CheckCircle2 size={16} />}
          tone="green"
        />
        <MetricCard
          label="AVG LATENCY"
          value={formatLatency(totals?.averageDurationMs ?? 0)}
          detail="正式调用与测速的平均值"
          icon={<Clock3 size={16} />}
        />
        <MetricCard
          label="TOTAL TOKENS"
          value={formatCompactNumber(totals?.totalTokens ?? 0)}
          detail={`IN ${formatCompactNumber(totals?.inputTokens ?? 0)} · OUT ${formatCompactNumber(totals?.outputTokens ?? 0)}`}
          icon={<Gauge size={16} />}
          tone="accent"
        />
      </div>

      <div
        className="provider-slot-strip"
        role="tablist"
        aria-label="API 服务类型"
      >
        {PROVIDERS.map((provider) => (
          <button
            key={provider.key}
            role="tab"
            aria-selected={active === provider.key}
            className={active === provider.key ? 'is-active' : ''}
            onClick={() => onActiveChange(provider.key)}
          >
            <small>{provider.shortLabel}</small>
            <strong>{provider.label}</strong>
            <span
              className={
                settings[provider.key].apiKeyConfigured ? 'is-ready' : ''
              }
            >
              {settings[provider.key].apiKeyConfigured ? '已配置' : '未配置'}
            </span>
          </button>
        ))}
      </div>

      <div className="api-control-grid">
        <div className="provider-form api-provider-form">
          <div className="provider-heading">
            <KeyRound size={18} />
            <div>
              <strong>
                {PROVIDERS.find((item) => item.key === active)?.label}
              </strong>
              <span>
                {current.apiKeyInherited
                  ? inheritedCredentialMessage(active)
                  : current.apiKeyConfigured
                    ? '密钥已保存在系统安全存储中'
                    : '尚未配置密钥'}
              </span>
            </div>
          </div>
          <div className="provider-field-grid">
            <label>
              <span>Provider</span>
              <select
                value={current.provider}
                onChange={(event) =>
                  onProviderChange(
                    event.target.value as ProviderEndpoint['provider'],
                  )
                }
              >
                {(active === 'audio'
                  ? [
                      ...PROFESSIONAL_AUDIO_OPTIONS,
                      ...STANDARD_PROVIDER_OPTIONS,
                    ]
                  : STANDARD_PROVIDER_OPTIONS
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Model</span>
              <input
                value={current.model}
                onChange={(event) =>
                  onEndpointChange({ model: event.target.value })
                }
                placeholder="deepseek-chat"
              />
            </label>
            <label className="provider-wide-field">
              <span>Base URL</span>
              <input
                value={current.baseUrl}
                onChange={(event) =>
                  onEndpointChange({ baseUrl: event.target.value })
                }
                placeholder="https://api.deepseek.com"
              />
            </label>
            <label className="provider-wide-field">
              <span>API Key</span>
              <input
                type="password"
                value={current.apiKey}
                onChange={(event) =>
                  onEndpointChange({ apiKey: event.target.value })
                }
                placeholder={
                  current.apiKeyConfigured ? '已配置；留空则保持不变' : 'sk-…'
                }
                autoComplete="off"
              />
            </label>
          </div>
          <div className="security-note">
            <ShieldCheck size={14} />
            API Key 仅传给内置 Agent Runtime；项目 Shell
            会自动移除凭据，调用记录也不保存密钥、URL 或提示词。
          </div>
          {active === 'audio' && current.provider === 'google-lyria' ? (
            <div className="security-note warning">
              请把 Base URL 中的 PROJECT_ID 替换为 Google Cloud 项目，并在 API
              Key 栏填写 OAuth Access Token。
            </div>
          ) : null}
          {active === 'audio' && current.provider === 'elevenlabs' ? (
            <div className="audio-preview-card">
              <div className="audio-preview-heading">
                <span className="audio-preview-icon">
                  <Volume2 size={16} />
                </span>
                <div>
                  <strong>AI 音效生成与应用</strong>
                  <small>
                    {audioCandidates.length
                      ? `已经生成 ${audioCandidates.length} 条，可以试听`
                      : '尚未生成候选音效'}
                  </small>
                </div>
                <span className={audioCandidates.length ? 'is-ready' : ''}>
                  {audioCandidates.length ? 'READY' : 'TEST'}
                </span>
              </div>
              <p>
                一次会同时生成 3 条候选音效并发起 3 次请求，ElevenLabs
                额度消耗约为生成单条的 3
                倍。生成时会显示真实进度，也可以主动停止。请分别试听、主动选择一条，再确认应用到当前游戏。
              </p>
              <label className="audio-sound-purpose">
                <span>这段声音用于</span>
                <select
                  value={audioSound}
                  onChange={(event) =>
                    onAudioSoundChange(event.target.value as GameSoundSlot)
                  }
                  disabled={
                    audioPreviewBusy || audioApplyBusy || audioRestoreBusy
                  }
                >
                  {GAME_SOUND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="audio-description-field">
                <span>
                  <strong>描述你想要的声音</strong>
                  <small>{audioDescription.length}/300</small>
                </span>
                <input
                  type="text"
                  value={audioDescription}
                  maxLength={AUDIO_DESCRIPTION_MAX_LENGTH}
                  placeholder={GAME_SOUND_EXAMPLES[audioSound]}
                  onChange={(event) =>
                    onAudioDescriptionChange(event.target.value)
                  }
                  disabled={
                    audioPreviewBusy || audioApplyBusy || audioRestoreBusy
                  }
                />
                <small className={!audioDescription.trim() ? 'is-warning' : ''}>
                  {audioDescription.trim()
                    ? `示例：${GAME_SOUND_EXAMPLES[audioSound].replace(/^例如：/, '')}`
                    : '请先描述你想要的声音，可以使用中文或英文。'}
                </small>
              </label>
              <label className="audio-duration-field">
                <span>
                  <strong>音效时长</strong>
                  <small>0.5～8 秒</small>
                </span>
                <select
                  value={audioDurationSeconds}
                  onChange={(event) =>
                    onAudioDurationChange(
                      Number(event.target.value) as AudioDurationSeconds,
                    )
                  }
                  disabled={
                    audioPreviewBusy || audioApplyBusy || audioRestoreBusy
                  }
                >
                  {AUDIO_DURATION_OPTIONS.map((durationSeconds) => (
                    <option key={durationSeconds} value={durationSeconds}>
                      {durationSeconds ===
                      AUDIO_RECOMMENDED_DURATION_BY_SOUND[audioSound]
                        ? `${durationSeconds} 秒（推荐）`
                        : `${durationSeconds} 秒`}
                    </option>
                  ))}
                </select>
                <small>切换声音用途时，会自动使用该用途的推荐时长。</small>
              </label>
              <div className="audio-source-state">
                <span>当前使用</span>
                <strong
                  className={audioOverrides?.[audioSound] ? 'is-custom' : ''}
                >
                  {!project
                    ? '未选择项目'
                    : audioOverridesLoading
                      ? '正在读取…'
                      : audioOverrides?.[audioSound]
                        ? 'AI 自定义音效'
                        : '内置音效'}
                </strong>
                <button
                  className="secondary-button"
                  onClick={onRestoreProjectAudio}
                  disabled={
                    audioRestoreBusy ||
                    audioApplyBusy ||
                    audioPreviewBusy ||
                    audioOverridesLoading ||
                    !project ||
                    !audioOverrides?.[audioSound]
                  }
                >
                  {audioRestoreBusy ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {audioRestoreBusy ? '正在恢复…' : '恢复内置音效'}
                </button>
              </div>
              {audioSettingsDirty || !current.apiKeyConfigured ? (
                <div className="audio-preview-requirement">
                  请先保存当前 ElevenLabs 音频设置。
                </div>
              ) : null}
              <button
                className="secondary-button audio-preview-button"
                onClick={onGenerateAudioPreview}
                disabled={
                  audioPreviewBusy ||
                  audioApplyBusy ||
                  audioSettingsDirty ||
                  !audioDescription.trim() ||
                  !current.apiKeyConfigured
                }
              >
                {audioPreviewBusy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Volume2 size={15} />
                )}
                {audioPreviewBusy
                  ? '正在生成 3 条候选音效…'
                  : `生成 3 条 ${audioDurationSeconds} 秒候选（约 3 倍额度）`}
              </button>
              {audioPreviewBusy ? (
                <div className="audio-generation-progress">
                  <div className="audio-progress-heading">
                    <strong>正在生成候选</strong>
                    <span>
                      已完成 {audioPreviewProgress?.completedCount ?? 0}/3
                    </span>
                  </div>
                  <div
                    className="audio-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={3}
                    aria-valuenow={audioPreviewProgress?.completedCount ?? 0}
                  >
                    <span
                      style={{
                        width: `${((audioPreviewProgress?.completedCount ?? 0) / 3) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="audio-progress-counts">
                    <span>成功 {audioPreviewProgress?.successCount ?? 0}</span>
                    <span>失败 {audioPreviewProgress?.failedCount ?? 0}</span>
                  </div>
                  <button
                    className="secondary-button audio-stop-button"
                    onClick={onCancelAudioPreview}
                    disabled={audioStopBusy}
                  >
                    {audioStopBusy ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <X size={14} />
                    )}
                    {audioStopBusy ? '正在停止' : '停止生成'}
                  </button>
                  <small>
                    停止后本批候选全部作废；已经完成的请求可能已经消耗额度。
                  </small>
                </div>
              ) : null}
              {audioCandidates.length ? (
                <div className="audio-preview-player">
                  {audioBatchFailedCount ? (
                    <div className="audio-batch-warning">
                      <span>
                        本次有 {audioBatchFailedCount} 条生成失败；已成功的 API
                        候选会原样保留。
                      </span>
                      <button
                        className="secondary-button audio-local-fill-button"
                        onClick={onFillMissingAudioCandidates}
                        disabled={audioApplyBusy || audioPreviewBusy}
                      >
                        本地补齐 {audioBatchFailedCount} 条（不消耗 API）
                      </button>
                    </div>
                  ) : null}
                  <div className="audio-candidate-grid">
                    {audioCandidates.map((candidate) => {
                      const selected =
                        candidate.candidateNumber === selectedAudioCandidate;
                      return (
                        <section
                          className={`audio-candidate-card ${selected ? 'is-selected' : ''} ${playingAudioCandidate === candidate.candidateNumber ? 'is-playing' : ''}`}
                          key={candidate.candidateNumber}
                        >
                          <div>
                            <strong>
                              候选 {candidate.candidateNumber}
                              <small
                                className={`audio-candidate-origin ${candidate.provider === 'liimit-local' ? 'is-local' : ''}`}
                              >
                                {candidate.provider === 'liimit-local'
                                  ? '本地备用'
                                  : 'ElevenLabs'}
                              </small>
                            </strong>
                            <span>
                              {candidate.durationSeconds} 秒 ·{' '}
                              {candidate.provider === 'liimit-local'
                                ? '本机生成'
                                : `${candidate.latencyMs} ms`}
                              {playingAudioCandidate ===
                              candidate.candidateNumber
                                ? ' · 正在播放'
                                : ''}
                            </span>
                          </div>
                          <audio
                            ref={candidateAudioRef(candidate.candidateNumber)}
                            controls
                            controlsList="nodownload noplaybackrate"
                            preload="metadata"
                            src={candidate.url}
                            onPlay={() =>
                              handleCandidatePlay(candidate.candidateNumber)
                            }
                            onPause={() =>
                              handleCandidateStopped(candidate.candidateNumber)
                            }
                            onEnded={() =>
                              handleCandidateStopped(candidate.candidateNumber)
                            }
                          >
                            当前系统无法播放这个候选音效。
                          </audio>
                          <div className="audio-candidate-actions">
                            <button
                              className="secondary-button"
                              onClick={() =>
                                void replayCandidate(candidate.candidateNumber)
                              }
                              disabled={audioApplyBusy}
                            >
                              <RefreshCw size={14} />
                              从头播放
                            </button>
                            <button
                              className={
                                selected ? 'primary-button' : 'secondary-button'
                              }
                              onClick={() =>
                                onAudioCandidateSelect(
                                  candidate.candidateNumber,
                                )
                              }
                              disabled={audioApplyBusy}
                              aria-pressed={selected}
                            >
                              {selected ? <CheckCircle2 size={14} /> : null}
                              {selected ? '已选择' : '选择这条'}
                            </button>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  {audioPlaybackError ? (
                    <small className="audio-playback-error">
                      {audioPlaybackError}
                    </small>
                  ) : null}
                  {!selectedAudioCandidate ? (
                    <small className="audio-candidate-requirement">
                      请先试听并选择一条候选音效。
                    </small>
                  ) : null}
                  <button
                    className="primary-button audio-apply-button"
                    onClick={onApplyAudioPreview}
                    disabled={
                      audioApplyBusy || !project || !selectedAudioCandidate
                    }
                  >
                    {audioApplyBusy ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Save size={15} />
                    )}
                    {audioApplyBusy
                      ? '正在应用并重新构建…'
                      : selectedAudioCandidate
                        ? `应用候选 ${selectedAudioCandidate} 到当前游戏`
                        : '请先选择一条候选'}
                  </button>
                  {!project ? (
                    <small className="audio-project-requirement">
                      请先在左侧选择一个游戏项目。
                    </small>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="api-activity-panel">
          <div className="panel-section-heading api-activity-heading">
            <div>
              <span>RECENT ACTIVITY</span>
              <strong>
                {activityView === 'work' ? '实际工作调用' : 'API 计量记录'}
              </strong>
            </div>
            <div
              className="activity-view-toggle"
              role="tablist"
              aria-label="最近调用视图"
            >
              <button
                role="tab"
                aria-selected={activityView === 'work'}
                className={activityView === 'work' ? 'is-active' : ''}
                onClick={() => setActivityView('work')}
              >
                工作调用
              </button>
              <button
                role="tab"
                aria-selected={activityView === 'usage'}
                className={activityView === 'usage' ? 'is-active' : ''}
                onClick={() => setActivityView('usage')}
              >
                API 计量
              </button>
            </div>
          </div>
          {activityView === 'work' ? (
            project ? (
              workEvents.length ? (
                <div
                  className="work-call-list"
                  role="region"
                  aria-label="实际工作调用记录"
                  tabIndex={0}
                >
                  {workEvents.map((event, index) => (
                    <WorkCallRow
                      key={event.id}
                      event={event}
                      defaultOpen={index === 0}
                    />
                  ))}
                </div>
              ) : (
                <div className="settings-empty-state compact">
                  <SquareTerminal size={22} />
                  <strong>还没有实际工作调用</strong>
                  <span>
                    启动当前项目的 Agent 后，用户指令、回复和 Function Calling
                    会按执行顺序显示。
                  </span>
                </div>
              )
            ) : (
              <div className="settings-empty-state compact">
                <SquareTerminal size={22} />
                <strong>请先选择一个项目</strong>
                <span>
                  实际工作调用以当前项目为上下文，不会混入其他项目内容。
                </span>
              </div>
            )
          ) : usageLoading ? (
            <div className="settings-inline-loading">
              <LoaderCircle className="spin" size={18} /> 正在读取本机用量…
            </div>
          ) : usage?.recent.length ? (
            <div
              className="api-call-list"
              role="region"
              aria-label="API 计量记录"
              tabIndex={0}
            >
              {usage.recent.map((record) => (
                <ApiCallRow key={record.id} record={record} />
              ))}
            </div>
          ) : (
            <div className="settings-empty-state compact">
              <Activity size={22} />
              <strong>还没有调用记录</strong>
              <span>启动 Agent 或执行一次基础测速后，这里会显示真实数据。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function WorkCallRow({
  event,
  defaultOpen,
}: {
  event: AgentEvent;
  defaultOpen: boolean;
}) {
  return (
    <details
      className={`work-call-row type-${event.type} ${event.isError ? 'is-error' : ''}`}
      open={defaultOpen ? true : undefined}
    >
      <summary>
        <span className="work-call-type">{workCallTypeLabel(event.type)}</span>
        <div className="work-call-copy">
          <strong>{event.toolName || event.title}</strong>
          <span>{event.message}</span>
        </div>
        <time>{formatTimestamp(event.timestamp)}</time>
      </summary>
      <pre>{event.message}</pre>
    </details>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: 'default' | 'green' | 'accent';
}) {
  return (
    <div className={`usage-metric tone-${tone}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ApiCallRow({ record }: { record: ApiUsageRecord }) {
  const tokens = record.totalTokens
    ? formatCompactNumber(record.totalTokens)
    : '—';
  return (
    <div className="api-call-row">
      <span
        className={`api-status-mark is-${record.status}`}
        aria-hidden="true"
      />
      <div className="api-call-main">
        <strong>{providerDisplayName(record.provider)}</strong>
        <small>{record.model || providerSlotLabel(record.slot)}</small>
      </div>
      <div className="api-call-stats">
        <span>{formatLatency(record.durationMs)}</span>
        <span>{tokens} TOK</span>
      </div>
      <div className="api-call-meta">
        <span>
          {record.source === 'connection-test'
            ? '测速'
            : record.source === 'asset'
              ? '素材'
              : 'Agent'}
        </span>
        <time>{formatTimestamp(record.occurredAt)}</time>
      </div>
    </div>
  );
}

interface DeveloperPanelProps {
  enabled: boolean;
  view: DeveloperView;
  project?: ProjectRecord;
  events: AgentEvent[];
  functionEvents: AgentEvent[];
  systemPrompt: string;
  promptLoading: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onViewChange: (view: DeveloperView) => void;
}

function DeveloperPanel({
  enabled,
  view,
  project,
  events,
  functionEvents,
  systemPrompt,
  promptLoading,
  onEnabledChange,
  onViewChange,
}: DeveloperPanelProps) {
  const toolCalls = events.filter((event) => event.type === 'tool_call');
  const toolFailures = events.filter(
    (event) => event.type === 'tool_result' && event.isError,
  );
  const latestToolCall = [...toolCalls].reverse()[0];
  const latestToolResult = [...events]
    .reverse()
    .find((event) => event.type === 'tool_result');
  const currentTool =
    project?.status === 'running' &&
    latestToolCall &&
    (!latestToolResult || latestToolCall.timestamp > latestToolResult.timestamp)
      ? latestToolCall
      : undefined;
  return (
    <section className="settings-page developer-settings-page">
      <div className="settings-page-heading">
        <div>
          <span>DEVELOPER / OBSERVABILITY</span>
          <h3>开发者模式</h3>
          <p>
            检查项目提示词、Function Calling 与桌面 Agent 的单任务调度状态。
          </p>
        </div>
      </div>

      <div className={`developer-mode-switch ${enabled ? 'is-enabled' : ''}`}>
        <div className="developer-switch-icon">
          <Braces size={21} />
        </div>
        <div>
          <strong>{enabled ? '开发者模式已开启' : '开发者模式已关闭'}</strong>
          <span>
            {enabled
              ? '诊断信息仅在本机展示，并沿用现有脱敏规则。'
              : '开启后可以查看提示词、工具调用与调度状态。'}
          </span>
        </div>
        <button
          className="switch-control"
          role="switch"
          aria-checked={enabled}
          aria-label="开发者模式"
          onClick={() => onEnabledChange(!enabled)}
        >
          <i />
          <span>{enabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {!enabled ? (
        <div className="developer-locked-state">
          <div className="developer-lock-grid" aria-hidden="true">
            <span>PROMPT</span>
            <span>FUNCTION</span>
            <span>SCHEDULER</span>
          </div>
          <SquareTerminal size={28} />
          <strong>诊断界面保持隐藏</strong>
          <p>
            开启开发者模式并保存设置后即可查看。它不会开启 Chromium
            DevTools，也不会改变 Agent 的执行权限。
          </p>
        </div>
      ) : (
        <>
          <div
            className="developer-tabs"
            role="tablist"
            aria-label="开发者诊断类型"
          >
            <button
              role="tab"
              aria-selected={view === 'prompts'}
              className={view === 'prompts' ? 'is-active' : ''}
              onClick={() => onViewChange('prompts')}
            >
              <Blocks size={14} /> 提示词
            </button>
            <button
              role="tab"
              aria-selected={view === 'functions'}
              className={view === 'functions' ? 'is-active' : ''}
              onClick={() => onViewChange('functions')}
            >
              <Braces size={14} /> Function Calling
              <i>{functionEvents.length}</i>
            </button>
            <button
              role="tab"
              aria-selected={view === 'scheduler'}
              className={view === 'scheduler' ? 'is-active' : ''}
              onClick={() => onViewChange('scheduler')}
            >
              <ServerCog size={14} /> 调度器
            </button>
          </div>

          {view === 'prompts' ? (
            project ? (
              <div className="prompt-inspector-grid">
                <PromptInspector
                  label="LATEST USER PROMPT"
                  value={project.prompt}
                  meta={`${project.name} · ${formatTimestamp(project.updatedAt)}`}
                />
                <PromptInspector
                  label="PROJECT SYSTEM PROMPT"
                  value={
                    promptLoading ? '正在读取 .qwen/system.md…' : systemPrompt
                  }
                  meta=".qwen/system.md · 启动 Agent 前刷新"
                />
                <div className="developer-data-note">
                  这里展示项目级系统提示词；Runtime 动态注入的工具
                  schema、memory 与 MCP 协议不在此文本内。
                </div>
              </div>
            ) : (
              <DeveloperProjectEmpty />
            )
          ) : null}

          {view === 'functions' ? (
            project ? (
              functionEvents.length ? (
                <div className="function-call-list">
                  {functionEvents.map((event) => (
                    <div
                      className={`function-call-item ${event.isError ? 'is-error' : ''}`}
                      key={event.id}
                    >
                      <span className="function-call-kind">
                        {event.type === 'tool_call'
                          ? 'CALL'
                          : event.isError
                            ? 'ERROR'
                            : 'RESULT'}
                      </span>
                      <div>
                        <strong>{event.toolName || event.title}</strong>
                        <pre>{event.message}</pre>
                      </div>
                      <time>{formatTimestamp(event.timestamp)}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="settings-empty-state">
                  <Braces size={24} />
                  <strong>还没有 Function Calling</strong>
                  <span>
                    当前项目产生工具调用后，这里会展示脱敏后的输入与结果。
                  </span>
                </div>
              )
            ) : (
              <DeveloperProjectEmpty />
            )
          ) : null}

          {view === 'scheduler' ? (
            project ? (
              <div className="scheduler-panel">
                <div className="scheduler-state-rail">
                  <div className="scheduler-state-copy">
                    <span
                      className={`scheduler-pulse status-${project.status}`}
                    />
                    <div>
                      <small>ACTIVE SCHEDULER</small>
                      <strong>
                        {project.status === 'running'
                          ? '正在执行单任务'
                          : '调度器空闲'}
                      </strong>
                    </div>
                  </div>
                  <span className="scheduler-mode">SERIAL / 1 SLOT</span>
                </div>
                <div className="scheduler-metrics">
                  <SchedulerDatum label="PROJECT" value={project.name} />
                  <SchedulerDatum
                    label="PIPELINE STAGE"
                    value={stageLabel(project.stage)}
                  />
                  <SchedulerDatum
                    label="STATUS"
                    value={projectStatusLabel(project.status)}
                  />
                  <SchedulerDatum
                    label="SESSION"
                    value={
                      project.sessionId
                        ? project.sessionId.slice(0, 12)
                        : 'NEW SESSION'
                    }
                    mono
                  />
                  <SchedulerDatum
                    label="TOOL CALLS"
                    value={String(toolCalls.length)}
                  />
                  <SchedulerDatum
                    label="FAILURES"
                    value={String(toolFailures.length)}
                  />
                </div>
                <div className="scheduler-current-tool">
                  <SquareTerminal size={17} />
                  <div>
                    <span>CURRENT TOOL</span>
                    <strong>{currentTool?.toolName || '无待执行工具'}</strong>
                    <small>
                      {currentTool
                        ? currentTool.message
                        : 'liimit.ai 当前采用全应用单任务互斥；没有后台隐藏队列。'}
                    </small>
                  </div>
                </div>
              </div>
            ) : (
              <DeveloperProjectEmpty />
            )
          ) : null}
        </>
      )}
    </section>
  );
}

function PromptInspector({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="prompt-inspector">
      <div>
        <span>{label}</span>
        <small>{meta}</small>
      </div>
      <pre>{value || '暂无内容'}</pre>
    </div>
  );
}

function SchedulerDatum({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? 'is-mono' : ''}>{value}</strong>
    </div>
  );
}

function DeveloperProjectEmpty() {
  return (
    <div className="settings-empty-state">
      <SquareTerminal size={24} />
      <strong>请先选择一个项目</strong>
      <span>提示词、Function Calling 与调度器都以当前项目为上下文。</span>
    </div>
  );
}

interface DependenciesPanelProps {
  dependencies?: DesktopDependency[];
  loading: boolean;
  busyId?: DesktopDependencyId;
  log: string;
  onRefresh: () => void;
  onAction: (dependency: DesktopDependency, action: DependencyAction) => void;
}

function DependenciesPanel({
  dependencies,
  loading,
  busyId,
  log,
  onRefresh,
  onAction,
}: DependenciesPanelProps) {
  return (
    <section className="settings-page dependency-settings-page">
      <div className="settings-page-heading">
        <div>
          <span>WEB GAME / LOCAL RUNTIME</span>
          <h3>Web 游戏运行环境</h3>
          <p>
            检测 Phaser 项目构建所需的 Node.js/npm，并通过严格白名单执行恢复。
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={onRefresh}
          disabled={loading || Boolean(busyId)}
        >
          <RefreshCw className={loading ? 'spin' : ''} size={14} />
          重新检测
        </button>
      </div>

      {loading && !dependencies ? (
        <div className="settings-inline-loading dependency-loading">
          <LoaderCircle className="spin" size={20} /> 正在检测 Node.js / npm…
        </div>
      ) : (
        <div className="dependency-groups">
          <DependencyGroup
            label="WEB GAME RUNTIME"
            title="Node.js / npm"
            dependencies={dependencies ?? []}
            busyId={busyId}
            onAction={onAction}
          />
        </div>
      )}

      {busyId || log ? (
        <div className="dependency-log-panel">
          <div>
            <span>INSTALL LOG</span>
            <strong>{busyId ? '操作进行中' : '最近一次操作'}</strong>
            {busyId ? <LoaderCircle className="spin" size={14} /> : null}
          </div>
          <pre>{log || '等待命令输出…'}</pre>
        </div>
      ) : null}
    </section>
  );
}

function DependencyGroup({
  label,
  title,
  dependencies,
  busyId,
  onAction,
}: {
  label: string;
  title: string;
  dependencies: DesktopDependency[];
  busyId?: DesktopDependencyId;
  onAction: (dependency: DesktopDependency, action: DependencyAction) => void;
}) {
  return (
    <div className="dependency-group">
      <div className="panel-section-heading">
        <div>
          <span>{label}</span>
          <strong>{title}</strong>
        </div>
        <small>
          {dependencies.filter((item) => item.status === 'installed').length}/
          {dependencies.length} READY
        </small>
      </div>
      <div className="dependency-list">
        {dependencies.map((dependency) => (
          <DependencyRow
            key={dependency.id}
            dependency={dependency}
            busy={busyId === dependency.id}
            disabled={Boolean(busyId)}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}

function DependencyRow({
  dependency,
  busy,
  disabled,
  onAction,
}: {
  dependency: DesktopDependency;
  busy: boolean;
  disabled: boolean;
  onAction: (dependency: DesktopDependency, action: DependencyAction) => void;
}) {
  const Icon = dependencyIcon(dependency.id);
  return (
    <div className="dependency-row">
      <div className={`dependency-icon dependency-${dependency.id}`}>
        <Icon size={19} />
      </div>
      <div className="dependency-copy">
        <div>
          <strong>{dependency.name}</strong>
          <span className={`dependency-status is-${dependency.status}`}>
            {dependencyStatusLabel(dependency.status)}
          </span>
        </div>
        <p>{dependency.description}</p>
        <small title={dependency.path}>
          {dependency.version || dependency.detail || '未检测到版本'}
          {dependency.path ? ` · ${dependency.path}` : ''}
          {` · ${dependencyManagementLabel(dependency.management)}`}
        </small>
      </div>
      <div className="dependency-actions">
        {dependency.availableActions.map((action) => (
          <button
            key={action}
            className={
              action === 'install' ? 'primary-button' : 'secondary-button'
            }
            disabled={disabled}
            onClick={() => onAction(dependency, action)}
          >
            {busy ? (
              <LoaderCircle className="spin" size={14} />
            ) : action === 'open' ? (
              <Settings size={14} />
            ) : (
              <Download size={14} />
            )}
            {busy ? '处理中…' : dependencyActionLabel(action)}
          </button>
        ))}
        {!dependency.availableActions.length ? (
          <span className="dependency-no-action">
            {dependency.management === 'unity-hub'
              ? '由 Unity Hub 管理'
              : '仅检测'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function dependencyIcon(id: DesktopDependencyId) {
  if (id === 'npx' || id === 'uvx') return SquareTerminal;
  if (id === 'blender') return Wrench;
  if (id === 'unity-hub' || id === 'unity-editor') return PackageOpen;
  return ServerCog;
}

function inheritedCredentialMessage(endpoint: ProviderSlot): string {
  if (endpoint === 'video') return '将安全复用图像模型的同一服务密钥';
  if (endpoint === 'reasoning') return '将安全复用主 Agent 的同一服务密钥';
  return '将安全复用已配置的同一服务密钥';
}

function dependencyStatusLabel(status: DesktopDependency['status']): string {
  if (status === 'installed') return '已安装';
  if (status === 'unsupported') return '当前系统不支持';
  return '未安装';
}

function dependencyManagementLabel(
  management: DesktopDependency['management'],
): string {
  if (management === 'homebrew') return 'Homebrew 白名单';
  if (management === 'winget') return 'WinGet 白名单';
  if (management === 'unity-hub') return 'Unity Hub 管理';
  return '仅检测';
}

function dependencyActionLabel(action: DependencyAction): string {
  if (action === 'install') return '安装';
  if (action === 'update') return '更新';
  return '打开 Unity Hub';
}

function providerDisplayName(provider: string): string {
  return (
    {
      'openai-compat': 'OpenAI Compatible',
      tongyi: '通义 / DashScope',
      doubao: '豆包 / ARK',
      elevenlabs: 'ElevenLabs',
      minimax: 'MiniMax',
      stability: 'Stability AI',
      'google-lyria': 'Google Lyria',
      mureka: 'Mureka',
    }[provider] ?? provider
  );
}

function workCallTypeLabel(type: AgentEvent['type']): string {
  return {
    user: 'PROMPT',
    assistant: 'RESPONSE',
    tool_call: 'FUNCTION',
    tool_result: 'RESULT',
    error: 'ERROR',
    complete: 'COMPLETE',
    lifecycle: 'STATE',
    thought: 'THOUGHT',
    text_delta: 'STREAM',
    stderr: 'LOG',
  }[type];
}

function providerSlotLabel(slot?: string): string {
  return PROVIDERS.find((provider) => provider.key === slot)?.label ?? 'API';
}

function projectStatusLabel(status: ProjectRecord['status']): string {
  return {
    draft: '待启动',
    running: '生成中',
    waiting: '待继续',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
  }[status];
}

function stageLabel(stage: ProjectRecord['stage']): string {
  return {
    brief: '需求拆解',
    classify: '类型识别',
    scaffold: '工程脚手架',
    gdd: '游戏设计',
    assets: '素材生成',
    tilemap: '地图生成',
    code: '代码实现',
    verify: '构建验证',
    complete: '完成',
  }[stage];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLatency(value: number): string {
  if (!value) return '—';
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} s`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
