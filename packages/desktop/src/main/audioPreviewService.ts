import type {
  AudioDurationSeconds,
  AudioPreviewBatchResult,
  AudioPreviewCandidate,
  AudioPreviewResult,
  GenerateAudioPreviewInput,
  ProviderEndpoint,
} from '../shared/types.js';
import {
  AUDIO_DESCRIPTION_MAX_LENGTH,
  AUDIO_DURATION_OPTIONS,
  AUDIO_PREVIEW_CANDIDATE_COUNT,
  AUDIO_PREVIEW_CANDIDATE_NUMBERS,
} from '../shared/types.js';

export {
  AUDIO_DESCRIPTION_MAX_LENGTH,
  AUDIO_PREVIEW_CANDIDATE_COUNT,
} from '../shared/types.js';

const ELEVENLABS_ORIGIN = 'https://api.elevenlabs.io';
const ELEVENLABS_PREVIEW_URL =
  `${ELEVENLABS_ORIGIN}/v1/sound-generation` + '?output_format=mp3_44100_128';

export const AUDIO_PREVIEW_MODEL = 'eleven_text_to_sound_v2' as const;
export const AUDIO_PREVIEW_PURPOSE_CONTEXT: Record<
  GenerateAudioPreviewInput['sound'],
  string
> = {
  jump: 'The sound is for a platform game character jumping',
  coin: 'The sound is for collecting a coin in a platform game',
  death: 'The sound is for a platform game character being defeated',
  levelClear: 'The sound is for completing a platform game level',
  enemyHit:
    'The sound is for defeating an enemy by stomping in a platform game',
  checkpoint: 'The sound is for activating a checkpoint in a platform game',
};
export const AUDIO_PROMPT_SAFETY_SUFFIX =
  'Create one short, clean game sound effect with no speech, no vocals, no background music, no ambience, and minimal silence';
export const AUDIO_PREVIEW_TIMEOUT_MS = 30_000;
export const AUDIO_PREVIEW_MAX_BYTES = 1024 * 1024;

interface AudioPreviewOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  signal?: AbortSignal;
  onProgress?: (progress: AudioPreviewBatchProgress) => void;
}

export interface AudioPreviewBatchProgress {
  completedCount: number;
  successCount: number;
  failedCount: number;
}

class AudioPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioPreviewError';
  }
}

export async function generateElevenLabsAudioPreview(
  endpoint: ProviderEndpoint,
  input: GenerateAudioPreviewInput,
  options: AudioPreviewOptions = {},
): Promise<AudioPreviewResult> {
  const description = validateAudioDescription(input.description);
  const durationSeconds = validateAudioDurationSeconds(input.durationSeconds);
  const sound = input.sound;
  const purposeContext = AUDIO_PREVIEW_PURPOSE_CONTEXT[sound];
  if (!purposeContext) {
    throw new AudioPreviewError('音效用途无效。');
  }
  assertSavedElevenLabsEndpoint(endpoint);

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? AUDIO_PREVIEW_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const controller = new AbortController();
  let timedOut = false;
  const stopFromBatch = () => controller.abort();
  if (options.signal?.aborted) stopFromBatch();
  else options.signal?.addEventListener('abort', stopFromBatch, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(ELEVENLABS_PREVIEW_URL, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': endpoint.apiKey.trim(),
      },
      body: JSON.stringify({
        text: `${description}. ${purposeContext}. ${AUDIO_PROMPT_SAFETY_SUFFIX}`,
        duration_seconds: durationSeconds,
        prompt_influence: 0.45,
        loop: false,
        model_id: AUDIO_PREVIEW_MODEL,
      }),
      signal: controller.signal,
    });

    if (response.redirected) {
      throw new AudioPreviewError(
        'ElevenLabs 返回了不安全的跳转，已停止测试音效。',
      );
    }
    if (!response.ok) throw responseError(response.status);

    const mimeType = normalizedMimeType(response.headers.get('content-type'));
    if (mimeType !== 'audio/mpeg') {
      throw new AudioPreviewError(
        'ElevenLabs 未返回预期的 audio/mpeg 音频，已拒绝试听。',
      );
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > AUDIO_PREVIEW_MAX_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw oversizedAudioError();
    }

    const bytes = await readBoundedBytes(response, AUDIO_PREVIEW_MAX_BYTES);
    if (bytes.byteLength === 0) {
      throw new AudioPreviewError('ElevenLabs 返回了空音频，请稍后重新生成。');
    }

    return {
      provider: 'elevenlabs',
      model: AUDIO_PREVIEW_MODEL,
      sound,
      durationSeconds,
      mimeType: 'audio/mpeg',
      bytes,
      latencyMs: Math.max(0, now() - startedAt),
    };
  } catch (error) {
    if (error instanceof AudioPreviewError) throw error;
    if (options.signal?.aborted) {
      throw cancelledAudioPreviewError();
    }
    if (timedOut || controller.signal.aborted || isAbortError(error)) {
      throw new AudioPreviewError(
        '音效生成超过 30 秒，已自动停止。请检查网络后重试。',
      );
    }
    throw new AudioPreviewError(
      '无法连接 ElevenLabs 音效服务，请检查网络后重试。',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', stopFromBatch);
  }
}

export async function generateElevenLabsAudioPreviewBatch(
  endpoint: ProviderEndpoint,
  input: GenerateAudioPreviewInput,
  options: AudioPreviewOptions = {},
): Promise<AudioPreviewBatchResult> {
  const description = validateAudioDescription(input.description);
  const durationSeconds = validateAudioDurationSeconds(input.durationSeconds);
  if (!AUDIO_PREVIEW_PURPOSE_CONTEXT[input.sound]) {
    throw new AudioPreviewError('音效用途无效。');
  }
  assertSavedElevenLabsEndpoint(endpoint);

  const normalizedInput: GenerateAudioPreviewInput = {
    sound: input.sound,
    description,
    durationSeconds,
  };
  const now = options.now ?? Date.now;
  const startedAt = now();
  let completedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  const reportProgress = (succeeded: boolean) => {
    completedCount += 1;
    if (succeeded) successCount += 1;
    else failedCount += 1;
    try {
      options.onProgress?.({ completedCount, successCount, failedCount });
    } catch {
      // UI progress reporting must never change the external request result.
    }
  };
  const settled = await Promise.allSettled(
    AUDIO_PREVIEW_CANDIDATE_NUMBERS.map(async (candidateNumber) => {
      try {
        const result = await generateElevenLabsAudioPreview(
          endpoint,
          normalizedInput,
          options,
        );
        reportProgress(true);
        return { ...result, candidateNumber } satisfies AudioPreviewCandidate;
      } catch (error) {
        reportProgress(false);
        throw error;
      }
    }),
  );
  if (options.signal?.aborted) throw cancelledAudioPreviewError();
  const candidates = settled
    .filter(
      (item): item is PromiseFulfilledResult<AudioPreviewCandidate> =>
        item.status === 'fulfilled',
    )
    .map((item) => item.value);

  if (candidates.length === 0) {
    throw new AudioPreviewError(
      '3 条候选音效都生成失败，请检查网络或额度后重新生成。',
    );
  }

  return {
    candidates,
    failedCount: AUDIO_PREVIEW_CANDIDATE_COUNT - candidates.length,
    attemptedCount: AUDIO_PREVIEW_CANDIDATE_COUNT,
    latencyMs: Math.max(0, now() - startedAt),
  };
}

function cancelledAudioPreviewError(): AudioPreviewError {
  return new AudioPreviewError(
    '本次音效生成已停止。已完成的请求可能已经消耗额度。',
  );
}

export function validateAudioDurationSeconds(
  value: unknown,
): AudioDurationSeconds {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !AUDIO_DURATION_OPTIONS.some((duration) => duration === value)
  ) {
    throw new AudioPreviewError('音效时长必须选择 0.5～8 秒的半秒档位。');
  }
  return value as AudioDurationSeconds;
}

export function validateAudioDescription(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AudioPreviewError('请先描述你想要的声音。');
  }
  const description = value.trim();
  if (description.length > AUDIO_DESCRIPTION_MAX_LENGTH) {
    throw new AudioPreviewError(
      `音效描述最多 ${AUDIO_DESCRIPTION_MAX_LENGTH} 个字符，请精简后重试。`,
    );
  }
  // Reject control characters in user-provided descriptions.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F]/u.test(description)) {
    throw new AudioPreviewError('音效描述包含无法识别的字符，请重新输入。');
  }
  return description;
}

function assertSavedElevenLabsEndpoint(endpoint: ProviderEndpoint): void {
  if (endpoint.provider !== 'elevenlabs') {
    throw new AudioPreviewError(
      '测试音效目前仅支持 ElevenLabs，请先切换音频服务。',
    );
  }
  if (!endpoint.apiKey.trim()) {
    throw new AudioPreviewError(
      '请先保存 ElevenLabs API Key，再生成测试音效。',
    );
  }

  let configuredUrl: URL;
  try {
    configuredUrl = new URL(endpoint.baseUrl);
  } catch {
    throw invalidOriginError();
  }
  if (
    configuredUrl.origin !== ELEVENLABS_ORIGIN ||
    configuredUrl.protocol !== 'https:' ||
    configuredUrl.username !== '' ||
    configuredUrl.password !== ''
  ) {
    throw invalidOriginError();
  }
}

function invalidOriginError(): AudioPreviewError {
  return new AudioPreviewError(
    '测试音效只会访问 ElevenLabs 官方 HTTPS 地址，请先恢复默认 Base URL。',
  );
}

function responseError(status: number): AudioPreviewError {
  switch (status) {
    case 401:
      return new AudioPreviewError(
        'ElevenLabs API Key 无效或已过期，请重新复制或新建密钥。',
      );
    case 403:
      return new AudioPreviewError(
        'ElevenLabs 已拒绝生成，请检查 Sound Effects 权限或 IP 限制。',
      );
    case 402:
      return new AudioPreviewError(
        'ElevenLabs 已识别密钥，但当前余额或套餐不可用。',
      );
    case 429:
      return new AudioPreviewError(
        'ElevenLabs 当前触发了频率限制，请稍后重试。',
      );
    default:
      if (status >= 500) {
        return new AudioPreviewError('ElevenLabs 服务暂时不可用，请稍后重试。');
      }
      return new AudioPreviewError(
        `ElevenLabs 音效生成失败（HTTP ${status}），请检查套餐和音效权限。`,
      );
  }
}

function normalizedMimeType(value: string | null): string {
  return (value ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

async function readBoundedBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw oversizedAudioError();
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw oversizedAudioError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function oversizedAudioError(): AudioPreviewError {
  return new AudioPreviewError(
    'ElevenLabs 返回的音频超过 1 MiB 安全上限，已拒绝试听。',
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
