import { describe, expect, it, vi } from 'vitest';
import type {
  AudioDurationSeconds,
  GenerateAudioPreviewInput,
  ProviderEndpoint,
} from '../shared/types.js';
import { AUDIO_DURATION_OPTIONS } from '../shared/types.js';
import {
  AUDIO_DESCRIPTION_MAX_LENGTH,
  AUDIO_PROMPT_SAFETY_SUFFIX,
  AUDIO_PREVIEW_CANDIDATE_COUNT,
  AUDIO_PREVIEW_MAX_BYTES,
  AUDIO_PREVIEW_MODEL,
  AUDIO_PREVIEW_PURPOSE_CONTEXT,
  AUDIO_PREVIEW_TIMEOUT_MS,
  generateElevenLabsAudioPreview,
  generateElevenLabsAudioPreviewBatch,
} from './audioPreviewService.js';

const SECRET = 'elevenlabs-secret-that-must-never-leak';

function endpoint(patch: Partial<ProviderEndpoint> = {}): ProviderEndpoint {
  return {
    provider: 'elevenlabs',
    baseUrl: 'https://api.elevenlabs.io',
    model: 'music_v2',
    apiKey: SECRET,
    ...patch,
  };
}

function input(
  description = '轻快、短促的跳跃声',
  sound: keyof typeof AUDIO_PREVIEW_PURPOSE_CONTEXT = 'jump',
  durationSeconds: AudioDurationSeconds = 0.5,
): GenerateAudioPreviewInput {
  return { sound, description, durationSeconds };
}

describe('generateElevenLabsAudioPreview', () => {
  it('uses the saved credential only against the fixed official preview endpoint', async () => {
    const bytes = Uint8Array.from([0x49, 0x44, 0x33, 0x04]);
    const fetchMock = vi.fn<typeof fetch>(async (_input, _init) =>
      audioResponse(bytes),
    );

    const result = await generateElevenLabsAudioPreview(
      endpoint(),
      input('  轻快、短促的卡通跳跃声  '),
      { fetchImpl: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
    );
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': SECRET,
      },
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      text: `轻快、短促的卡通跳跃声. ${AUDIO_PREVIEW_PURPOSE_CONTEXT.jump}. ${AUDIO_PROMPT_SAFETY_SUFFIX}`,
      duration_seconds: 0.5,
      prompt_influence: 0.45,
      loop: false,
      model_id: AUDIO_PREVIEW_MODEL,
    });
    expect(result).toMatchObject({
      provider: 'elevenlabs',
      model: 'eleven_text_to_sound_v2',
      sound: 'jump',
      durationSeconds: 0.5,
      mimeType: 'audio/mpeg',
    });
    expect([...result.bytes]).toEqual([...bytes]);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it.each([0.5, 3.5, 8])(
    'uses and returns the selected %s-second duration',
    async (durationSeconds) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        audioResponse(Uint8Array.from([0x49, 0x44, 0x33, 0x04])),
      );
      const result = await generateElevenLabsAudioPreview(
        endpoint(),
        input(
          'Short reward sound',
          'coin',
          durationSeconds as AudioDurationSeconds,
        ),
        { fetchImpl: fetchMock },
      );
      const request = fetchMock.mock.calls[0]?.[1];
      expect(JSON.parse(String(request?.body)).duration_seconds).toBe(
        durationSeconds,
      );
      expect(result.durationSeconds).toBe(durationSeconds);
    },
  );

  it.each([0, 8.5, 0.7, Number.NaN, Number.POSITIVE_INFINITY, '1'])(
    'rejects invalid duration %s before networking',
    async (durationSeconds) => {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        generateElevenLabsAudioPreview(
          endpoint(),
          input(
            'Short jump sound',
            'jump',
            durationSeconds as unknown as AudioDurationSeconds,
          ),
          { fetchImpl: fetchMock },
        ),
      ).rejects.toThrow('0.5～8 秒的半秒档位');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('declares all 16 half-second duration options', () => {
    expect(AUDIO_DURATION_OPTIONS).toHaveLength(16);
    expect(AUDIO_DURATION_OPTIONS[0]).toBe(0.5);
    expect(AUDIO_DURATION_OPTIONS.at(-1)).toBe(8);
  });

  it('accepts English and adds distinct trusted context for each sound purpose', async () => {
    expect(new Set(Object.values(AUDIO_PREVIEW_PURPOSE_CONTEXT)).size).toBe(6);
    for (const [sound, context] of Object.entries(
      AUDIO_PREVIEW_PURPOSE_CONTEXT,
    )) {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        audioResponse(Uint8Array.from([0x49, 0x44, 0x33, 0x04])),
      );
      const result = await generateElevenLabsAudioPreview(
        endpoint(),
        input(
          'Bright glass-like reward chime',
          sound as keyof typeof AUDIO_PREVIEW_PURPOSE_CONTEXT,
        ),
        { fetchImpl: fetchMock },
      );
      const request = fetchMock.mock.calls[0]?.[1];
      const text = JSON.parse(String(request?.body)).text as string;
      expect(text).toContain('Bright glass-like reward chime');
      expect(text).toContain(context);
      expect(text).toContain(AUDIO_PROMPT_SAFETY_SUFFIX);
      expect(result.sound).toBe(sound);
    }
  });

  it.each([
    { description: '   ', expected: '请先描述' },
    {
      description: 'a'.repeat(AUDIO_DESCRIPTION_MAX_LENGTH + 1),
      expected: '最多 300 个字符',
    },
    { description: 'jump\nvoice', expected: '无法识别的字符' },
    { description: 'jump\u007fvoice', expected: '无法识别的字符' },
  ])(
    'rejects an invalid description before networking',
    async ({ description, expected }) => {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        generateElevenLabsAudioPreview(endpoint(), input(description), {
          fetchImpl: fetchMock,
        }),
      ).rejects.toThrow(expected);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      status: 401,
      expected: '无效或已过期',
    },
    {
      status: 403,
      expected: 'Sound Effects 权限或 IP 限制',
    },
    {
      status: 402,
      expected: '余额或套餐',
    },
    {
      status: 429,
      expected: '频率限制',
    },
    {
      status: 503,
      expected: '服务暂时不可用',
    },
  ])(
    'maps HTTP $status to a fixed secret-free error',
    async ({ status, expected }) => {
      const fetchMock = vi.fn<typeof fetch>(
        async () =>
          new Response(`provider detail accidentally echoed ${SECRET}`, {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      );

      await expect(
        generateElevenLabsAudioPreview(endpoint(), input(), {
          fetchImpl: fetchMock,
        }),
      ).rejects.toThrow(expected);
      await expect(
        generateElevenLabsAudioPreview(endpoint(), input(), {
          fetchImpl: fetchMock,
        }),
      ).rejects.not.toThrow(SECRET);
    },
  );

  it.each([
    {
      name: '非 ElevenLabs 服务',
      endpoint: endpoint({ provider: 'stability' }),
      expected: '仅支持 ElevenLabs',
    },
    {
      name: '未保存密钥',
      endpoint: endpoint({ apiKey: '' }),
      expected: '先保存 ElevenLabs API Key',
    },
    {
      name: '非官方地址',
      endpoint: endpoint({ baseUrl: 'https://example.com' }),
      expected: '官方 HTTPS 地址',
    },
    {
      name: '嵌入账户信息的地址',
      endpoint: endpoint({
        baseUrl: 'https://user:password@api.elevenlabs.io',
      }),
      expected: '官方 HTTPS 地址',
    },
  ])(
    'rejects $name before networking',
    async ({ endpoint: value, expected }) => {
      const fetchMock = vi.fn<typeof fetch>();

      await expect(
        generateElevenLabsAudioPreview(value, input(), {
          fetchImpl: fetchMock,
        }),
      ).rejects.toThrow(expected);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('requires a non-empty audio/mpeg response', async () => {
    await expect(
      generateElevenLabsAudioPreview(endpoint(), input(), {
        fetchImpl: async () => audioResponse(new Uint8Array()),
      }),
    ).rejects.toThrow('空音频');

    await expect(
      generateElevenLabsAudioPreview(endpoint(), input(), {
        fetchImpl: async () =>
          new Response('not audio', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }),
      }),
    ).rejects.toThrow('audio/mpeg');
  });

  it('rejects a redirected response before reading or playing audio', async () => {
    const redirected = audioResponse(Uint8Array.from([0x49, 0x44, 0x33]));
    Object.defineProperty(redirected, 'redirected', { value: true });

    await expect(
      generateElevenLabsAudioPreview(endpoint(), input(), {
        fetchImpl: async () => redirected,
      }),
    ).rejects.toThrow('不安全的跳转');
  });

  it('rejects declared and streamed responses above one MiB', async () => {
    const declared = new Response(Uint8Array.from([1]), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(AUDIO_PREVIEW_MAX_BYTES + 1),
      },
    });
    await expect(
      generateElevenLabsAudioPreview(endpoint(), input(), {
        fetchImpl: async () => declared,
      }),
    ).rejects.toThrow('1 MiB');

    const oversized = new Uint8Array(AUDIO_PREVIEW_MAX_BYTES + 1);
    await expect(
      generateElevenLabsAudioPreview(endpoint(), input(), {
        fetchImpl: async () => audioResponse(oversized),
      }),
    ).rejects.toThrow('1 MiB');
  });

  it('has a fixed 30-second production timeout and reports aborts safely', async () => {
    expect(AUDIO_PREVIEW_TIMEOUT_MS).toBe(30_000);
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }));

    await expect(
      generateElevenLabsAudioPreview(endpoint(), input(), {
        fetchImpl: fetchMock,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('超过 30 秒');
  });
});

describe('generateElevenLabsAudioPreviewBatch', () => {
  it('reports trusted completed, success, and failure counts after each candidate settles', async () => {
    const pending: Array<{
      resolve: (response: Response) => void;
    }> = [];
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        await new Promise<Response>((resolve) => pending.push({ resolve })),
    );
    const progress: Array<{
      completedCount: number;
      successCount: number;
      failedCount: number;
    }> = [];

    const batch = generateElevenLabsAudioPreviewBatch(endpoint(), input(), {
      fetchImpl: fetchMock,
      onProgress: (value) => progress.push(value),
    });
    await vi.waitFor(() => expect(pending).toHaveLength(3));

    pending[0]?.resolve(audioResponse(Uint8Array.from([1])));
    await vi.waitFor(() => expect(progress).toHaveLength(1));
    pending[1]?.resolve(new Response('', { status: 503 }));
    await vi.waitFor(() => expect(progress).toHaveLength(2));
    pending[2]?.resolve(audioResponse(Uint8Array.from([3])));

    const result = await batch;
    expect(progress).toEqual([
      { completedCount: 1, successCount: 1, failedCount: 0 },
      { completedCount: 2, successCount: 1, failedCount: 1 },
      { completedCount: 3, successCount: 2, failedCount: 1 },
    ]);
    expect(result.candidates).toHaveLength(2);
  });

  it('aborts every unfinished candidate and rejects the whole batch when the user stops', async () => {
    const controller = new AbortController();
    const receivedSignals: AbortSignal[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error('missing signal');
      receivedSignals.push(signal);
      return await new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const batch = generateElevenLabsAudioPreviewBatch(endpoint(), input(), {
      fetchImpl: fetchMock,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    controller.abort();

    await expect(batch).rejects.toThrow('已停止');
    expect(receivedSignals).toHaveLength(3);
    expect(receivedSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it('invalidates an already successful candidate when the remaining batch is stopped', async () => {
    const controller = new AbortController();
    let call = 0;
    const progress: Array<{
      completedCount: number;
      successCount: number;
      failedCount: number;
    }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      call += 1;
      if (call === 1) return audioResponse(Uint8Array.from([1]));
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const batch = generateElevenLabsAudioPreviewBatch(endpoint(), input(), {
      fetchImpl: fetchMock,
      signal: controller.signal,
      onProgress: (value) => progress.push(value),
    });
    await vi.waitFor(() =>
      expect(progress).toContainEqual({
        completedCount: 1,
        successCount: 1,
        failedCount: 0,
      }),
    );
    controller.abort();

    await expect(batch).rejects.toThrow('已停止');
  });

  it('starts exactly three candidates and returns stable 1-2-3 numbering', async () => {
    const responses = [
      Uint8Array.from([1, 11]),
      Uint8Array.from([2, 22]),
      Uint8Array.from([3, 33]),
    ];
    const fetchMock = vi.fn<typeof fetch>(async () =>
      audioResponse(responses.shift() ?? new Uint8Array()),
    );

    const result = await generateElevenLabsAudioPreviewBatch(
      endpoint(),
      input('Three bright reward chimes', 'coin', 1.5),
      { fetchImpl: fetchMock },
    );

    expect(AUDIO_PREVIEW_CANDIDATE_COUNT).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.attemptedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(result.candidates.map((item) => item.candidateNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(result.candidates.map((item) => [...item.bytes])).toEqual([
      [1, 11],
      [2, 22],
      [3, 33],
    ]);
    expect(
      result.candidates.every((item) => item.durationSeconds === 1.5),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain('Three bright reward chimes');
  });

  it('keeps successful candidate numbers when one request fails and never refills', async () => {
    let call = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      call += 1;
      if (call === 2) {
        return new Response('provider detail', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return audioResponse(Uint8Array.from([call]));
    });

    const result = await generateElevenLabsAudioPreviewBatch(
      endpoint(),
      input(),
      { fetchImpl: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.failedCount).toBe(1);
    expect(result.candidates.map((item) => item.candidateNumber)).toEqual([
      1, 3,
    ]);
  });

  it('keeps the one successful candidate when two requests fail', async () => {
    let call = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      call += 1;
      return call === 2
        ? audioResponse(Uint8Array.from([2]))
        : new Response('', { status: 429 });
    });

    const result = await generateElevenLabsAudioPreviewBatch(
      endpoint(),
      input(),
      { fetchImpl: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.failedCount).toBe(2);
    expect(result.candidates.map((item) => item.candidateNumber)).toEqual([2]);
  });

  it('returns no applicable batch when all three requests fail', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('', { status: 503 }),
    );

    await expect(
      generateElevenLabsAudioPreviewBatch(endpoint(), input(), {
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow('3 条候选音效都生成失败');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function audioResponse(bytes: Uint8Array): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}
