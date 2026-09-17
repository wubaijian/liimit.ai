import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shared = readFileSync(
  new URL('../src/shared/types.ts', import.meta.url),
  'utf8',
);
const preload = readFileSync(
  new URL('../src/main/preload.cts', import.meta.url),
  'utf8',
);
const main = readFileSync(
  new URL('../src/main/main.ts', import.meta.url),
  'utf8',
);
const service = readFileSync(
  new URL('../src/main/audioPreviewService.ts', import.meta.url),
  'utf8',
);
const projectAudioService = readFileSync(
  new URL('../src/main/projectAudioOverrideService.ts', import.meta.url),
  'utf8',
);
const settingsDialog = readFileSync(
  new URL('../src/renderer/components/SettingsDialog.tsx', import.meta.url),
  'utf8',
);
const app = readFileSync(
  new URL('../src/renderer/App.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);

describe('ElevenLabs 音效生成与应用安全链路契约', () => {
  it('只通过强类型 Preload 传用途、描述、项目 ID 和受限音频字节', () => {
    expect(shared).toMatch(
      /generateAudioPreview\(\s*input:\s*GenerateAudioPreviewInput,?\s*\):\s*Promise<AudioPreviewBatchResult>/,
    );
    expect(preload).toContain(
      'generateAudioPreview: (input: GenerateAudioPreviewInput) =>',
    );
    expect(preload).toContain(
      "ipcRenderer.invoke('settings:generate-audio-preview', input)",
    );
    expect(preload).toContain(
      'applyAudioPreview: (input: ApplyAudioPreviewInput)',
    );
    const inputContract = shared.match(
      /export interface GenerateAudioPreviewInput\s*\{(?<body>[^}]*)\}/s,
    );
    expect(inputContract?.groups?.body).toMatch(/sound:\s*GameSoundSlot/);
    expect(inputContract?.groups?.body).toMatch(/description:\s*string/);
    expect(inputContract?.groups?.body).toMatch(
      /durationSeconds:\s*AudioDurationSeconds/,
    );
    expect(inputContract?.groups?.body).not.toMatch(
      /apiKey|baseUrl|path|bytes/,
    );
    expect(preload).not.toMatch(
      /generateAudioPreview:[^\n]*(apiKey|baseUrl|prompt)/,
    );
  });

  it('仅由受信 Main 处理器从安全存储读取已保存音频设置', () => {
    expect(main).toContain(
      "secureHandle('settings:generate-audio-preview', async (value: unknown) =>",
    );
    expect(main).toContain('store.getRuntimeSettings().audio');
    expect(main).toContain('generateElevenLabsAudioPreview');
    expect(main).not.toMatch(
      /settings:generate-audio-preview[^;]{0,500}(apiKey|baseUrl|prompt)\s*:/s,
    );
  });

  it('返回契约不含密钥、地址、提示词或项目字段', () => {
    const resultContract = shared.match(
      /export interface AudioPreviewResult\s*\{(?<body>[^}]*)\}/s,
    );
    expect(resultContract?.groups?.body).toBeDefined();
    expect(resultContract?.groups?.body).toMatch(/provider:\s*'elevenlabs'/);
    expect(resultContract?.groups?.body).toMatch(
      /model:\s*'eleven_text_to_sound_v2'/,
    );
    expect(resultContract?.groups?.body).toMatch(/mimeType:\s*'audio\/mpeg'/);
    expect(resultContract?.groups?.body).toMatch(/sound:\s*GameSoundSlot/);
    expect(resultContract?.groups?.body).toMatch(
      /durationSeconds:\s*AudioDurationSeconds/,
    );
    expect(resultContract?.groups?.body).toMatch(/bytes:\s*Uint8Array/);
    expect(resultContract?.groups?.body).toMatch(/latencyMs:\s*number/);
    expect(resultContract?.groups?.body).not.toMatch(
      /apiKey|baseUrl|prompt|project|path/i,
    );
  });

  it('强制官方源、安全短音效约束与模型、0.5 秒、30 秒超时和 1 MiB 上限', () => {
    expect(service).toContain("'https://api.elevenlabs.io'");
    expect(service).toContain("'eleven_text_to_sound_v2'");
    expect(service).toContain('AUDIO_PROMPT_SAFETY_SUFFIX');
    expect(service).toContain('AUDIO_PREVIEW_PURPOSE_CONTEXT');
    expect(shared).toContain('AUDIO_DESCRIPTION_MAX_LENGTH = 300');
    expect(service).toMatch(/duration_seconds:\s*durationSeconds/);
    expect(service).toMatch(/AUDIO_PREVIEW_TIMEOUT_MS\s*=\s*30_000/);
    expect(service).toMatch(/AUDIO_PREVIEW_MAX_BYTES\s*=\s*1024\s*\*\s*1024/);
    expect(service).toContain("redirect: 'error'");
    expect(service).toContain("'audio/mpeg'");
  });

  it('用量记录只写运行元数据，不写密钥、URL、提示词或音频', () => {
    expect(main).toContain("source: 'asset'");
    expect(main).toContain("slot: 'audio'");
    expect(main).toContain("model: 'eleven_text_to_sound_v2'");
    expect(main).not.toMatch(
      /apiUsage\.record\(\s*\{[^}]*\b(apiKey|baseUrl|prompt|bytes|url)\b/s,
    );
  });
});

describe('ElevenLabs 设置与临时试听界面契约', () => {
  it('保存后用 Main 返回的脱敏设置刷新当前弹窗', () => {
    expect(app).toContain('return publicSettings;');
    expect(settingsDialog).toContain('const saved = await onSave(settings);');
    expect(settingsDialog).toContain('setSettings(structuredClone(saved));');
    expect(settingsDialog).toContain('setAudioSettingsDirty(false);');
  });

  it('只在 AUDIO + ElevenLabs 显示带额度说明的生成入口', () => {
    expect(settingsDialog).toContain(
      "active === 'audio' && current.provider === 'elevenlabs'",
    );
    expect(settingsDialog).toContain('AI 音效生成与应用');
    expect(settingsDialog).toContain('额度消耗约为');
    expect(settingsDialog).toMatch(/ElevenLabs\s*额度/);
    expect(settingsDialog).toContain(
      '`生成 3 条 ${audioDurationSeconds} 秒候选（约 3 倍额度）`',
    );
    expect(settingsDialog).toContain('应用到当前游戏');
  });

  it('测试生成只传固定用途和临时描述并在未保存或正在生成时阻止重复调用', () => {
    expect(settingsDialog).toContain(
      'await window.gameAgent.generateAudioPreview({',
    );
    expect(settingsDialog).toContain('sound: audioSound');
    expect(settingsDialog).toContain('description: audioDescription.trim()');
    expect(settingsDialog).toContain('durationSeconds: audioDurationSeconds');
    expect(settingsDialog).toContain('!current.apiKeyConfigured ||');
    expect(settingsDialog).toContain('audioSettingsDirty');
    expect(settingsDialog).toContain(
      'disabled={\n                  audioPreviewBusy ||',
    );
    expect(settingsDialog).toContain('请勿重复点击');
  });

  it('使用临时 Blob 播放并在替换、切换或关闭时释放 URL', () => {
    expect(settingsDialog).toContain('URL.createObjectURL(');
    expect(settingsDialog.match(/URL\.revokeObjectURL\(/g)).toHaveLength(2);
    expect(settingsDialog).toContain('<audio');
    expect(settingsDialog).toContain(
      'controlsList="nodownload noplaybackrate"',
    );
    expect(settingsDialog).toContain('releaseAudioPreview();');
    expect(styles).toContain('.audio-preview-player audio');
    expect(styles).toMatch(
      /\.audio-preview-player audio\s*\{[^}]*width:\s*100%/s,
    );
  });

  it('把试听记录标为素材，并由受限服务确认后写入当前项目', () => {
    expect(settingsDialog).toContain("record.source === 'asset'");
    expect(main).toContain("secureHandle('project:apply-audio-preview'");
    expect(main).toContain("buttons: ['取消', '确认替换']");
    expect(main).toContain('projectAudioOverrides.apply(');
    expect(projectAudioService).toContain("'public/assets/audio'");
    expect(projectAudioService).toContain('assertContained(root, resolved)');
    expect(projectAudioService).toContain(
      'await this.options.buildProject(project)',
    );
    expect(projectAudioService).toContain(
      'await restoreFile(targetPath, previousAudio)',
    );
  });
});

describe('音效时长选择契约', () => {
  it('共享层定义 16 个半秒档位和六种用途推荐值', () => {
    expect(shared).toContain('AUDIO_DURATION_OPTIONS');
    expect(shared).toContain('AUDIO_RECOMMENDED_DURATION_BY_SOUND');
    expect(shared).toContain('jump: 0.5');
    expect(shared).toContain('coin: 0.5');
    expect(shared).toContain('death: 1');
    expect(shared).toContain('levelClear: 2');
    expect(shared).toContain('enemyHit: 0.5');
    expect(shared).toContain('checkpoint: 1');
  });

  it('Main 二次校验时长，服务使用并返回有效值', () => {
    expect(main).toContain(
      'durationSeconds: validateAudioDurationSeconds(input.durationSeconds)',
    );
    expect(service).toContain(
      'validateAudioDurationSeconds(input.durationSeconds)',
    );
    expect(service).toContain('duration_seconds: durationSeconds');
    expect(service).toContain('durationSeconds,');
    expect(service).toContain('音效时长必须选择 0.5～8 秒的半秒档位');
  });

  it('界面显示推荐时长、16 个选项，并在改变用途或时长时清除旧试听', () => {
    expect(settingsDialog).toContain(
      'const [audioDurationSeconds, setAudioDurationSeconds]',
    );
    expect(settingsDialog).toContain('audio-duration-field');
    expect(settingsDialog).toContain('AUDIO_DURATION_OPTIONS.map');
    expect(settingsDialog).toContain(
      'AUDIO_RECOMMENDED_DURATION_BY_SOUND[sound]',
    );
    expect(settingsDialog).toContain('onAudioDurationChange');
    expect(settingsDialog).toContain('releaseAudioPreview();');
    expect(settingsDialog).toContain('秒（推荐）');
    expect(settingsDialog).toContain('candidate.durationSeconds');
    expect(styles).toContain('.audio-duration-field');
  });
});

describe('三候选音效批次契约', () => {
  it('共享层固定三个编号并返回候选、失败数和批次耗时', () => {
    expect(shared).toContain('AUDIO_PREVIEW_CANDIDATE_NUMBERS = [1, 2, 3]');
    expect(shared).toContain('AudioPreviewCandidateNumber');
    expect(shared).toContain('candidateNumber: AudioPreviewCandidateNumber');
    const batchContract = shared.match(
      /export interface AudioPreviewBatchResult\s*\{(?<body>[^}]*)\}/s,
    );
    expect(batchContract?.groups?.body).toMatch(
      /candidates:\s*AudioPreviewCandidate\[\]/,
    );
    expect(batchContract?.groups?.body).toMatch(/failedCount:\s*number/);
    expect(batchContract?.groups?.body).toMatch(
      /attemptedCount:\s*typeof AUDIO_PREVIEW_CANDIDATE_COUNT/,
    );
    expect(batchContract?.groups?.body).toMatch(/latencyMs:\s*number/);
    expect(batchContract?.groups?.body).not.toMatch(
      /apiKey|baseUrl|description|prompt|project|path/i,
    );
  });

  it('可信服务固定并行三次、保留部分成功且 Main 记录三次调用', () => {
    expect(service).toContain('generateElevenLabsAudioPreviewBatch');
    expect(service).toContain('Promise.allSettled');
    expect(service).toContain('AUDIO_PREVIEW_CANDIDATE_NUMBERS.map');
    expect(service).toContain('candidateNumber');
    expect(service).toContain('failedCount');
    expect(service).toContain('3 条候选音效都生成失败');
    expect(main).toContain('generateElevenLabsAudioPreviewBatch');
    expect(main).toContain(
      "status = result.failedCount ? 'warning' : 'success'",
    );
    expect(main).toContain('callCount: sentCalls');
  });

  it('界面建立三条临时播放资源、要求明确单选并只应用所选字节', () => {
    expect(settingsDialog).toContain(
      'const [audioCandidates, setAudioCandidates]',
    );
    expect(settingsDialog).toContain(
      'const [selectedAudioCandidate, setSelectedAudioCandidate]',
    );
    expect(settingsDialog).toContain('result.candidates.map');
    expect(settingsDialog).toContain('audioCandidateUrls.current.forEach');
    expect(settingsDialog).toContain('audioCandidates.map');
    expect(settingsDialog).toContain('选择这条');
    expect(settingsDialog).toContain('已选择');
    expect(settingsDialog).toContain('selectedCandidate?.bytes');
    expect(settingsDialog).toContain('请先选择一条候选音效');
    expect(settingsDialog).toMatch(/约为生成单条的\s*3\s*倍/);
    expect(settingsDialog).toContain('audio-candidate-grid');
    expect(settingsDialog).toContain('audio-batch-warning');
    expect(styles).toContain('.audio-candidate-grid');
    expect(styles).toContain('.audio-candidate-card.is-selected');
    expect(styles).toContain('.audio-batch-warning');
  });
});

describe('音效生成进度与主动停止契约', () => {
  it('共享桥接只公开脱敏进度、无参数停止和可清理订阅', () => {
    const progressContract = shared.match(
      /export interface AudioPreviewProgress\s*\{(?<body>[^}]*)\}/s,
    );
    expect(progressContract?.groups?.body).toMatch(/generationId:\s*string/);
    expect(progressContract?.groups?.body).toMatch(
      /status:\s*'running'\s*\|\s*'complete'\s*\|\s*'cancelled'/,
    );
    expect(progressContract?.groups?.body).toMatch(/totalCount:/);
    expect(progressContract?.groups?.body).toMatch(/completedCount:\s*number/);
    expect(progressContract?.groups?.body).toMatch(/successCount:\s*number/);
    expect(progressContract?.groups?.body).toMatch(/failedCount:\s*number/);
    expect(progressContract?.groups?.body).not.toMatch(
      /apiKey|baseUrl|description|prompt|bytes|project|path/i,
    );
    expect(shared).toMatch(
      /cancelAudioPreviewGeneration\(\):\s*Promise<CancelAudioPreviewResult>/,
    );
    expect(shared).toMatch(
      /onAudioPreviewProgress\(\s*callback:\s*\(progress:\s*AudioPreviewProgress\)\s*=>\s*void,?\s*\):\s*\(\)\s*=>\s*void/,
    );
    expect(preload).toContain(
      "ipcRenderer.invoke('settings:cancel-audio-preview')",
    );
    expect(preload).toContain(
      "ipcRenderer.on('settings:audio-preview-progress', listener)",
    );
    expect(preload).toContain(
      "ipcRenderer.removeListener('settings:audio-preview-progress', listener)",
    );
  });

  it('Main 持有当前批次控制器，发送带标识进度并安全处理空闲停止', () => {
    expect(main).toContain('audioPreviewAbortController');
    expect(main).toContain('randomUUID()');
    expect(main).toContain("sendAudioProgress('running')");
    expect(main).toContain(
      "mainWindow?.webContents.send('settings:audio-preview-progress'",
    );
    expect(main).toContain(
      "secureHandle('settings:cancel-audio-preview', () =>",
    );
    expect(main).toContain('audioPreviewAbortController.abort()');
    expect(main).toContain("status: 'cancelling'");
    expect(main).toContain("status: 'idle'");
  });

  it('界面显示可信计数和停止按钮，并以用户停止意图丢弃迟到结果', () => {
    expect(settingsDialog).toContain('onAudioPreviewProgress');
    expect(settingsDialog).toContain('activeAudioGenerationId');
    expect(settingsDialog).toContain('audioStopRequested');
    expect(settingsDialog).toContain('cancelAudioPreviewGeneration()');
    expect(settingsDialog).toContain('已完成');
    expect(settingsDialog).toContain('成功');
    expect(settingsDialog).toContain('失败');
    expect(settingsDialog).toContain('停止生成');
    expect(settingsDialog).toContain('正在停止');
    expect(settingsDialog).toContain('可能已经消耗额度');
    expect(settingsDialog).toContain('if (audioStopRequested.current)');
    expect(styles).toContain('.audio-generation-progress');
    expect(styles).toContain('.audio-stop-button');
  });
});

describe('候选音效单条试听契约', () => {
  it('设置界面登记每条播放器并在播放新候选时停止其他候选', () => {
    expect(settingsDialog).toContain('candidateAudioPlayers');
    expect(settingsDialog).toContain('pauseAndResetOtherCandidates');
    expect(settingsDialog).toContain('onPlay={() =>');
    expect(settingsDialog).toContain('onPause={() =>');
    expect(settingsDialog).toContain('onEnded={() =>');
    expect(settingsDialog).toContain('正在播放');
  });

  it('每条候选提供从头播放，并在播放器移除时停止和清理', () => {
    expect(settingsDialog).toContain('replayCandidateFromStart');
    expect(settingsDialog).toContain('removeCandidatePlayer');
    expect(settingsDialog).toContain('从头播放');
    expect(settingsDialog).toContain('audio-candidate-actions');
    expect(styles).toContain('.audio-candidate-actions');
    expect(styles).toContain('.audio-candidate-card.is-playing');
  });
});

describe('本地补齐缺少候选契约', () => {
  it('只为缺少编号生成本地WAV且不调用外部生成接口', () => {
    expect(settingsDialog).toContain('generateMissingLocalCandidates');
    expect(settingsDialog).toContain('本地补齐');
    expect(settingsDialog).toContain('不消耗 API');
    expect(settingsDialog).toContain("candidate.provider === 'liimit-local'");
    expect(settingsDialog).toContain('本地备用');
  });

  it('共享和应用契约支持来源透明的WAV候选', () => {
    expect(shared).toContain("provider: 'elevenlabs' | 'liimit-local'");
    expect(shared).toContain(
      "model: 'eleven_text_to_sound_v2' | 'local-sfx-v1'",
    );
    expect(shared).toContain("mimeType: 'audio/mpeg' | 'audio/wav'");
    const applyContract = shared.match(
      /export interface ApplyAudioPreviewInput\s*\{(?<body>[^}]*)\}/s,
    );
    expect(applyContract?.groups?.body).toMatch(
      /mimeType:\s*AudioPreviewMimeType/,
    );
    expect(main).toContain('mimeType: validateAudioPreviewMimeType');
    expect(main).toContain('input.mimeType');
    expect(projectAudioService).toContain("'assets/audio/custom/jump.wav'");
  });
});

describe('自定义音效描述契约', () => {
  it('Main 对描述做 1～300 字符和控制字符二次校验', () => {
    expect(main).toContain('validateAudioDescription(input.description)');
    expect(shared).toContain('AUDIO_DESCRIPTION_MAX_LENGTH = 300');
    expect(service).toMatch(/\\u0000-\\u001F/);
    expect(service).toMatch(/\\u007F-\\u009F/);
    expect(service).toContain('请先描述你想要的声音');
    expect(service).toContain(
      '音效描述最多 ${AUDIO_DESCRIPTION_MAX_LENGTH} 个字符',
    );
    expect(service).toContain('音效描述包含无法识别的字符');
  });

  it('界面提供六种示例、300 字计数和空描述阻止', () => {
    expect(settingsDialog).toContain('GAME_SOUND_EXAMPLES');
    expect(settingsDialog).toContain(
      'const [audioDescription, setAudioDescription]',
    );
    expect(settingsDialog).toContain('描述你想要的声音');
    expect(settingsDialog).toContain(
      'placeholder={GAME_SOUND_EXAMPLES[audioSound]}',
    );
    expect(settingsDialog).toContain(
      'maxLength={AUDIO_DESCRIPTION_MAX_LENGTH}',
    );
    expect(settingsDialog).toContain('{audioDescription.length}/300');
    expect(settingsDialog).toContain('!audioDescription.trim()');
    expect(styles).toContain('.audio-description-field');
  });

  it('描述不进入返回结果、本机用量记录或项目应用输入', () => {
    const resultContract = shared.match(
      /export interface AudioPreviewResult\s*\{(?<body>[^}]*)\}/s,
    );
    const applyContract = shared.match(
      /export interface ApplyAudioPreviewInput\s*\{(?<body>[^}]*)\}/s,
    );
    expect(resultContract?.groups?.body).not.toMatch(/description|prompt/i);
    expect(applyContract?.groups?.body).not.toMatch(/description|prompt/i);
    expect(main).not.toMatch(
      /apiUsage\.record\(\s*\{[^}]*\b(description|prompt)\b/s,
    );
  });
});

describe('项目音效恢复契约', () => {
  it('只通过项目 ID 和固定用途读取、恢复，不向 Renderer 暴露路径', () => {
    expect(shared).toMatch(
      /loadProjectAudioOverrides\(\s*projectId:\s*string,?\s*\):\s*Promise<ProjectAudioOverrideSnapshot>/,
    );
    expect(shared).toMatch(
      /restoreProjectAudio\(\s*input:\s*RestoreProjectAudioInput,?\s*\):\s*Promise<RestoreProjectAudioResult>/,
    );
    expect(preload).toContain(
      "ipcRenderer.invoke('project:audio-overrides', projectId)",
    );
    expect(preload).toContain(
      "ipcRenderer.invoke('project:restore-audio', input)",
    );
    const snapshotContract = shared.match(
      /export interface ProjectAudioOverrideSnapshot\s*\{(?<body>[^}]*)\}/s,
    );
    expect(snapshotContract?.groups?.body).not.toMatch(/path|bytes/i);
  });

  it('确认后只恢复单项配置，构建失败写回旧配置且不删除 MP3', () => {
    expect(main).toContain("secureHandle('project:restore-audio'");
    expect(main).toContain("buttons: ['取消', '确认恢复']");
    expect(main).toContain('projectAudioOverrides.restore(');
    const restoreBody = projectAudioService.match(
      /async restore\([\s\S]*?\n {2}\}\n\n {2}async apply/,
    )?.[0];
    expect(restoreBody).toContain('nextConfig[sound] = null');
    expect(restoreBody).toContain('await this.options.buildProject(project)');
    expect(restoreBody).toContain(
      'await restoreFile(configPath, previousConfig)',
    );
    expect(restoreBody).not.toContain('unlink(');
  });

  it('界面显示当前来源并只为自定义声音启用恢复按钮', () => {
    expect(settingsDialog).toContain('当前使用');
    expect(settingsDialog).toContain('AI 自定义音效');
    expect(settingsDialog).toContain('内置音效');
    expect(settingsDialog).toContain('恢复内置音效');
    expect(settingsDialog).toContain('!audioOverrides?.[audioSound]');
    expect(settingsDialog).toContain('loadProjectAudioOverrides(projectId)');
  });
});
