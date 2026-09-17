import { describe, expect, it, vi } from 'vitest';
import type { ProviderEndpoint } from '../shared/types.js';
import { testProviderConnection } from './providerConnection.js';

describe('testProviderConnection', () => {
  it('validates MiniMax credentials without generating music', async () => {
    let calledUrl = '';
    let calledRequest: RequestInit | undefined;
    const fetchMock: typeof fetch = async (input, request) => {
      calledUrl = String(input);
      calledRequest = request;
      return jsonResponse(200, {
        base_resp: { status_code: 2013, status_msg: 'invalid params' },
      });
    };

    const result = await testProviderConnection(
      endpoint('minimax', 'https://api.minimaxi.com', 'music-2.6-free'),
      fetchMock,
    );

    expect(result.status).toBe('success');
    expect(result.message).toContain('未触发音乐生成');
    expect(calledUrl).toBe('https://api.minimaxi.com/v1/music_generation');
    expect(JSON.parse(String(calledRequest?.body))).toMatchObject({
      model: 'music-2.6-free',
      prompt: '',
      is_instrumental: true,
      stream: false,
    });
  });

  it('reports MiniMax authentication failures embedded in a 200 response', async () => {
    const result = await testProviderConnection(
      endpoint('minimax', 'https://api.minimaxi.com', 'music-2.6-free'),
      async () =>
        jsonResponse(200, {
          base_resp: { status_code: 1004, status_msg: 'token invalid' },
        }),
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('鉴权失败');
  });

  it('validates ElevenLabs Sound Effects permission without generating audio', async () => {
    let calledUrl = '';
    let calledRequest: RequestInit | undefined;
    const fetchMock: typeof fetch = async (input, request) => {
      calledUrl = String(input);
      calledRequest = request;
      return jsonResponse(422, {
        detail: {
          type: 'validation_error',
          code: 'missing_required_field',
          message: 'The text field is required.',
        },
      });
    };
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io/v1', 'music_v2'),
      fetchMock,
    );

    expect(result.status).toBe('success');
    expect(result.message).toContain('Sound Effects');
    expect(result.message).toContain('未生成音频');
    expect(result.message).toContain('未消耗生成额度');
    expect(calledUrl).toBe('https://api.elevenlabs.io/v1/sound-generation');
    expect(calledRequest).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': 'test-secret-key',
      },
      body: '{}',
    });
  });

  it('accepts the live ElevenLabs list-shaped missing-text validation response', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () =>
        jsonResponse(422, {
          detail: [
            {
              type: 'missing',
              loc: ['body', 'text'],
              msg: 'Field required',
              input: {},
            },
          ],
        }),
    );

    expect(result.status).toBe('success');
    expect(result.message).toContain('Sound Effects');
    expect(result.message).toContain('未生成音频');
    expect(result.message).toContain('未消耗生成额度');
  });

  it('accepts the legacy Pydantic missing-text validation type', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () =>
        jsonResponse(422, {
          detail: [
            {
              type: 'value_error.missing',
              loc: ['body', 'text'],
              msg: 'field required',
            },
          ],
        }),
    );

    expect(result.status).toBe('success');
  });

  it('rejects a non-official ElevenLabs origin before sending credentials', async () => {
    const fetchMock = vi.fn();
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.example', 'music_v2'),
      fetchMock as typeof fetch,
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('官方服务地址');
    expect(result.message).not.toContain('test-secret-key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'invalid or expired key',
      status: 401,
      detail: {
        type: 'authentication_error',
        code: 'invalid_api_key',
        message: 'Invalid API key: test-secret-key',
      },
      expectedStatus: 'error',
      expectedMessage: '无效或已过期',
    },
    {
      name: 'missing permission or blocked IP',
      status: 403,
      detail: {
        type: 'authorization_error',
        code: 'insufficient_permissions',
        message: 'API key test-secret-key lacks permission',
      },
      expectedStatus: 'error',
      expectedMessage: '密钥已被识别',
    },
    {
      name: 'unavailable balance or plan',
      status: 402,
      detail: {
        type: 'payment_required',
        code: 'insufficient_credits',
        message: 'No credits for test-secret-key',
      },
      expectedStatus: 'warning',
      expectedMessage: '余额或套餐',
    },
    {
      name: 'rate limited',
      status: 429,
      detail: {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        message: 'Too many requests from test-secret-key',
      },
      expectedStatus: 'warning',
      expectedMessage: '请求频率限制',
    },
  ])(
    'classifies ElevenLabs $name without exposing the key',
    async ({ status, detail, expectedStatus, expectedMessage }) => {
      const result = await testProviderConnection(
        endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
        async () => jsonResponse(status, { detail }),
      );

      expect(result.status).toBe(expectedStatus);
      expect(result.message).toContain(expectedMessage);
      expect(result.message).not.toContain('test-secret-key');
    },
  );

  it('reports a legacy ElevenLabs 401 missing-permissions body as a permission problem', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () =>
        jsonResponse(401, {
          detail: {
            status: 'missing_permissions',
            message: 'The API key is missing the required permission.',
          },
        }),
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('Sound Effects 权限');
    expect(result.message).not.toContain('无效或已过期');
  });

  it('reports the legacy ElevenLabs needs-authorization status as a permission problem', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () =>
        jsonResponse(401, {
          detail: {
            status: 'needs_authorization',
            message: 'This key needs authorization for the endpoint.',
          },
        }),
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('Sound Effects 权限');
  });

  it('keeps an unknown ElevenLabs 401 diagnosis deliberately non-specific', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () => jsonResponse(401, { detail: { message: 'Rejected' } }),
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('密钥状态');
    expect(result.message).toContain('Sound Effects 权限');
    expect(result.message).not.toContain('无效或已过期');
  });

  it('does not accept an unrelated ElevenLabs 422 response as capability success', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () =>
        jsonResponse(422, {
          detail: {
            type: 'authorization_error',
            code: 'insufficient_permissions',
            message: 'Permission denied',
          },
        }),
    );

    expect(result.status).toBe('error');
    expect(result.message).not.toContain('音效能力可用');
  });

  it('does not accept a generic ElevenLabs validation type without a missing-text signal', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () =>
        jsonResponse(422, {
          detail: {
            type: 'validation_error',
            code: 'invalid_model',
            message: 'Model is not available',
          },
        }),
    );

    expect(result.status).toBe('error');
    expect(result.message).not.toContain('音效能力可用');
  });

  it('redacts the API key from ElevenLabs network errors', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () => {
        throw new Error('socket failed while using test-secret-key');
      },
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('socket failed');
    expect(result.message).not.toContain('test-secret-key');
  });

  it('reports ElevenLabs aborts as a finite timeout result', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () => {
        throw new DOMException('aborted', 'AbortError');
      },
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('连接超时');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports an ElevenLabs service failure separately from credential errors', async () => {
    const result = await testProviderConnection(
      endpoint('elevenlabs', 'https://api.elevenlabs.io', 'music_v2'),
      async () => jsonResponse(503, { detail: { message: 'Unavailable' } }),
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('服务暂时不可用');
    expect(result.message).not.toContain('API Key 无效');
  });

  it('distinguishes valid credentials with unavailable billing', async () => {
    const result = await testProviderConnection(
      endpoint('stability', 'https://api.stability.ai', 'stable-audio-3'),
      async () => jsonResponse(402, { message: 'payment required' }),
    );

    expect(result.status).toBe('warning');
    expect(result.message).toContain('余额或套餐');
  });

  it('treats validation errors from generation probes as connected', async () => {
    const result = await testProviderConnection(
      endpoint('mureka', 'https://api.mureka.ai', 'mureka-9'),
      async () => jsonResponse(422, { detail: 'n must be greater than zero' }),
    );

    expect(result.status).toBe('success');
    expect(result.message).toContain('未触发素材生成');
  });

  it('rejects an unconfigured Google Lyria project URL before networking', async () => {
    const fetchMock = vi.fn();
    const result = await testProviderConnection(
      endpoint(
        'google-lyria',
        'https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models',
        'lyria-002',
      ),
      fetchMock as typeof fetch,
    );

    expect(result.status).toBe('error');
    expect(result.message).toContain('PROJECT_ID');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function endpoint(
  provider: ProviderEndpoint['provider'],
  baseUrl: string,
  model: string,
): ProviderEndpoint {
  return {
    provider,
    baseUrl,
    model,
    apiKey: 'test-secret-key',
  };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
