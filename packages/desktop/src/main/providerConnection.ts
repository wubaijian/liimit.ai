import type {
  ProviderConnectionResult,
  ProviderEndpoint,
} from '../shared/types.js';

const AUTH_ERROR_CODES = new Set([401, 403, 1004, 2049]);
const ELEVENLABS_ORIGIN = 'https://api.elevenlabs.io';
const ELEVENLABS_VALIDATION_CODES = new Set([
  'empty_text',
  'missing_required_field',
]);

export async function testProviderConnection(
  endpoint: ProviderEndpoint,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderConnectionResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await sendProbe(endpoint, fetchImpl, controller.signal);
    const payload = await readPayload(response);
    return classifyResponse(
      endpoint,
      response,
      payload,
      Date.now() - startedAt,
    );
  } catch (error) {
    const safeError = redactSecret(
      error instanceof Error ? error.message : String(error),
      endpoint.apiKey,
    );
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? '连接超时（15 秒），请检查 Base URL、网络或代理设置。'
        : `无法连接服务：${safeError}`;
    return { status: 'error', message, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendProbe(
  endpoint: ProviderEndpoint,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  const bearerHeaders = {
    Authorization: `Bearer ${endpoint.apiKey}`,
  };

  switch (endpoint.provider) {
    case 'elevenlabs':
      return fetchImpl(elevenLabsProbeUrl(endpoint.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': endpoint.apiKey,
        },
        body: JSON.stringify({}),
        redirect: 'error',
        signal,
      });
    case 'stability':
      return fetchImpl(joinApiUrl(endpoint.baseUrl, '/v1/user/account'), {
        method: 'GET',
        headers: bearerHeaders,
        signal,
      });
    case 'minimax':
      return fetchImpl(joinApiUrl(endpoint.baseUrl, '/v1/music_generation'), {
        method: 'POST',
        headers: { ...bearerHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: endpoint.model,
          prompt: '',
          is_instrumental: true,
          stream: false,
        }),
        signal,
      });
    case 'google-lyria': {
      if (endpoint.baseUrl.includes('PROJECT_ID')) {
        throw new Error(
          '请先将 Base URL 中的 PROJECT_ID 替换为 Google Cloud 项目 ID。',
        );
      }
      const url = googlePredictUrl(endpoint);
      const credential = endpoint.apiKey.replace(/^Bearer\s+/i, '');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (credential.startsWith('AIza')) headers['x-goog-api-key'] = credential;
      else headers.Authorization = `Bearer ${credential}`;
      return fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          instances: [],
          parameters: { sample_count: 0 },
        }),
        signal,
      });
    }
    case 'mureka':
      return fetchImpl(
        joinApiUrl(endpoint.baseUrl, '/v1/instrumental/generate'),
        {
          method: 'POST',
          headers: { ...bearerHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: endpoint.model,
            n: 0,
            prompt: '',
            stream: false,
          }),
          signal,
        },
      );
    case 'tongyi': {
      const pathName = endpoint.baseUrl.includes('/compatible-mode/')
        ? '/models'
        : '/compatible-mode/v1/models';
      return fetchImpl(joinApiUrl(endpoint.baseUrl, pathName), {
        method: 'GET',
        headers: bearerHeaders,
        signal,
      });
    }
    case 'doubao':
    case 'openai-compat':
      return fetchImpl(joinApiUrl(endpoint.baseUrl, '/models'), {
        method: 'GET',
        headers: bearerHeaders,
        signal,
      });
    default:
      throw new Error(`不支持测试 Provider：${String(endpoint.provider)}`);
  }
}

function classifyResponse(
  endpoint: ProviderEndpoint,
  response: Response,
  payload: unknown,
  latencyMs: number,
): ProviderConnectionResult {
  const embeddedCode = findNumericCode(payload);
  const detail = redactSecret(findMessage(payload), endpoint.apiKey);

  if (endpoint.provider === 'elevenlabs') {
    return classifyElevenLabsResponse(response, payload, latencyMs);
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    (embeddedCode !== undefined && AUTH_ERROR_CODES.has(embeddedCode)) ||
    /unauthori[sz]ed|invalid api.?key|authentication failed|鉴权失败|未授权/i.test(
      detail,
    )
  ) {
    return {
      status: 'error',
      message: `API Key 鉴权失败${detail ? `：${detail}` : '。'}`,
      latencyMs,
    };
  }

  if (endpoint.provider === 'minimax') {
    if (embeddedCode === 1008) {
      return {
        status: 'warning',
        message: 'MiniMax 鉴权成功，但账户余额不足，充值后才能生成音乐。',
        latencyMs,
      };
    }
    if (embeddedCode === 1002 || response.status === 429) {
      return {
        status: 'warning',
        message: 'MiniMax 鉴权成功，但当前触发了请求频率限制。',
        latencyMs,
      };
    }
    if (
      embeddedCode === 2013 ||
      response.status === 400 ||
      response.status === 422
    ) {
      return success(
        'MiniMax API Key 与地址有效；测试未触发音乐生成或费用。',
        latencyMs,
      );
    }
  }

  const validationProbe =
    endpoint.provider === 'google-lyria' || endpoint.provider === 'mureka';
  if (
    validationProbe &&
    (response.status === 400 ||
      response.status === 409 ||
      response.status === 422)
  ) {
    return success('服务已连接且鉴权通过；测试未触发素材生成。', latencyMs);
  }

  if (response.ok && (embeddedCode === undefined || embeddedCode === 0)) {
    return success('连接成功，API Key 鉴权有效。', latencyMs);
  }

  if (response.status === 402 || embeddedCode === 1008) {
    return {
      status: 'warning',
      message: '服务与 API Key 均可识别，但账户余额或套餐不可用。',
      latencyMs,
    };
  }

  if (response.status === 429 || embeddedCode === 1002) {
    return {
      status: 'warning',
      message: '服务已连接，但当前触发请求频率限制，请稍后再试。',
      latencyMs,
    };
  }

  return {
    status: 'error',
    message: `连接测试失败（HTTP ${response.status}${embeddedCode !== undefined ? ` / ${embeddedCode}` : ''}）${detail ? `：${detail}` : '。'}`,
    latencyMs,
  };
}

function classifyElevenLabsResponse(
  response: Response,
  payload: unknown,
  latencyMs: number,
): ProviderConnectionResult {
  const error = findNestedError(payload);

  if (response.status === 401) {
    if (
      error.code === 'missing_permissions' ||
      error.code === 'insufficient_permissions' ||
      error.code === 'needs_authorization'
    ) {
      return {
        status: 'error',
        message:
          'ElevenLabs 密钥已被识别，但缺少 Sound Effects 权限。请在 ElevenLabs 密钥设置中开启 Sound Effects 后再试。',
        latencyMs,
      };
    }
    if (
      error.code === 'invalid_api_key' ||
      error.code === 'unauthorized' ||
      error.type === 'authentication_error'
    ) {
      return {
        status: 'error',
        message:
          'ElevenLabs API Key 无效或已过期，请重新复制完整密钥，或在官网新建密钥后再试。',
        latencyMs,
      };
    }
    return {
      status: 'error',
      message:
        'ElevenLabs 拒绝了鉴权（HTTP 401）。请确认完整密钥、密钥状态和 Sound Effects 权限后再试。',
      latencyMs,
    };
  }

  if (response.status === 403) {
    return {
      status: 'error',
      message:
        'ElevenLabs 密钥已被识别，但可能缺少 Sound Effects 权限、当前 IP 不在白名单中，或套餐暂不支持该能力。',
      latencyMs,
    };
  }

  if (response.status === 402) {
    return {
      status: 'warning',
      message: 'ElevenLabs 密钥已被识别，但账户余额或套餐不可用。',
      latencyMs,
    };
  }

  if (response.status === 429) {
    return {
      status: 'warning',
      message: 'ElevenLabs 服务已连接，但当前触发了请求频率限制，请稍后再试。',
      latencyMs,
    };
  }

  const validationResponse =
    (response.status === 400 || response.status === 422) &&
    (ELEVENLABS_VALIDATION_CODES.has(error.code) ||
      hasElevenLabsMissingTextValidation(payload));
  if (validationResponse) {
    return success(
      'ElevenLabs Sound Effects 音效能力可用；本次只检查密钥与权限，未生成音频，也未消耗生成额度。',
      latencyMs,
    );
  }

  if (response.status >= 500) {
    return {
      status: 'error',
      message: `ElevenLabs 服务暂时不可用（HTTP ${response.status}），请稍后再试。`,
      latencyMs,
    };
  }

  return {
    status: 'error',
    message: `ElevenLabs 基础检查返回了未预期结果（HTTP ${response.status}），未能确认 Sound Effects 权限。`,
    latencyMs,
  };
}

function success(message: string, latencyMs: number): ProviderConnectionResult {
  return { status: 'success', message, latencyMs };
}

async function readPayload(response: Response): Promise<unknown> {
  const text = (await response.text()).slice(0, 8_000);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function findNumericCode(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const baseResponse =
    record.base_resp && typeof record.base_resp === 'object'
      ? (record.base_resp as Record<string, unknown>)
      : undefined;
  const candidates = [
    baseResponse?.status_code,
    record.status_code,
    record.code,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function findMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const baseResponse =
    record.base_resp && typeof record.base_resp === 'object'
      ? (record.base_resp as Record<string, unknown>)
      : undefined;
  const nestedError =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : undefined;
  const value =
    baseResponse?.status_msg ??
    nestedError?.message ??
    record.message ??
    record.detail ??
    '';
  return typeof value === 'string' ? value.slice(0, 500) : '';
}

function findNestedError(payload: unknown): { type: string; code: string } {
  if (!payload || typeof payload !== 'object') return { type: '', code: '' };
  const record = payload as Record<string, unknown>;
  const detail =
    record.detail && typeof record.detail === 'object'
      ? (record.detail as Record<string, unknown>)
      : undefined;
  const error =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : undefined;
  return {
    type: firstString(detail?.type, error?.type, record.type).toLowerCase(),
    code: firstString(
      detail?.code,
      detail?.status,
      error?.code,
      error?.status,
      record.code,
      record.status,
    ).toLowerCase(),
  };
}

function hasElevenLabsMissingTextValidation(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const detail = (payload as Record<string, unknown>).detail;
  if (!Array.isArray(detail)) return false;

  return detail.some((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const record = candidate as Record<string, unknown>;
    const type = firstString(record.type, record.code).toLowerCase();
    const location = Array.isArray(record.loc)
      ? record.loc.map((part) => String(part).toLowerCase())
      : [];
    return (
      (type === 'missing' ||
        type === 'missing_required_field' ||
        type === 'value_error.missing') &&
      location.includes('body') &&
      location.includes('text')
    );
  });
}

function firstString(...values: unknown[]): string {
  const value = values.find(
    (candidate): candidate is string => typeof candidate === 'string',
  );
  return value?.trim() ?? '';
}

function redactSecret(value: string, secret: string): string {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) return value;
  return value.split(normalizedSecret).join('[已隐藏]');
}

function elevenLabsProbeUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      `ElevenLabs 基础检查只允许官方服务地址 ${ELEVENLABS_ORIGIN}。`,
    );
  }
  if (
    parsed.origin !== ELEVENLABS_ORIGIN ||
    Boolean(parsed.username) ||
    Boolean(parsed.password)
  ) {
    throw new Error(
      `ElevenLabs 基础检查只允许官方服务地址 ${ELEVENLABS_ORIGIN}。`,
    );
  }
  return `${ELEVENLABS_ORIGIN}/v1/sound-generation`;
}

function joinApiUrl(baseUrl: string, pathName: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const path = pathName.startsWith('/') ? pathName : `/${pathName}`;
  if (base.endsWith('/v1') && path.startsWith('/v1/')) {
    return `${base}${path.slice(3)}`;
  }
  return `${base}${path}`;
}

function googlePredictUrl(endpoint: ProviderEndpoint): string {
  const model = endpoint.model || 'lyria-002';
  const baseUrl = endpoint.baseUrl.replace(/\/+$/, '');
  if (baseUrl.endsWith(':predict')) return baseUrl;
  if (baseUrl.endsWith(`/${model}`)) return `${baseUrl}:predict`;
  return `${baseUrl}/${model}:predict`;
}
