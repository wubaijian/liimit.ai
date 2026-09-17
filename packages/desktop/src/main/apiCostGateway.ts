import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { ApiCostStore} from './apiCostStore.js';
import { costProfile, costTotal } from './apiCostStore.js';
import {
  emptyCostPrice,
  type CostSlot,
  type CostProfile,
  type CostTask,
  type CostUsage,
} from '../shared/apiCost.js';

export interface CostEndpoint {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}
export type CostEndpoints = Partial<Record<CostSlot, CostEndpoint>>;
export function costProfiles(endpoints: CostEndpoints): CostProfile[] {
  const profiles = Object.entries(endpoints)
    .filter(([, e]) => !!e)
    .map(([s, e]) => costProfile(s as CostSlot, e));
  const audio = endpoints.audio;
  if (
    audio?.provider === 'elevenlabs' &&
    audio.model !== 'eleven_text_to_sound_v2'
  )
    profiles.push(
      costProfile('audio', { ...audio, model: 'eleven_text_to_sound_v2' }),
    );
  return profiles;
}
interface Options {
  ledger: ApiCostStore;
  projectId: string | null;
  endpoints: CostEndpoints;
  onBlock: (reason: string) => void;
  onWarning?: (message: string) => void;
  confirmAsset?: (
    slot: CostSlot,
    estimatedCny: number | null,
  ) => Promise<boolean>;
}
// Only usage counters are retained; payload and response text never enter the ledger.
export class UsageCollector {
  private buffer = '';
  private usage: CostUsage | null = null;
  constructor(private readonly streaming: boolean) {}
  push(text: string): void {
    this.buffer += text;
    if (this.streaming) {
      let end: number;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end).trim();
        this.buffer = this.buffer.slice(end + 1);
        if (line.startsWith('data:')) this.parse(line.slice(5));
      }
    }
    if (this.buffer.length > 1024 * 1024) this.buffer = '';
  }
  private parse(text: string): void {
    try {
      const v = JSON.parse(text);
      const u = v.usage;
      if (!u) return;
      // Separate cache-write billing is not represented by these three rates.
      if (u.cache_creation_input_tokens > 0) {
        this.usage = null;
        return;
      }
      const input = u.prompt_tokens ?? u.input_tokens;
        const output = u.completion_tokens ?? u.output_tokens;
      const cached =
        u.prompt_cache_hit_tokens ??
        u.prompt_tokens_details?.cached_tokens ??
        u.input_tokens_details?.cached_tokens ??
        0;
      if (
        [input, output, cached].every(
          (n) => Number.isSafeInteger(n) && n >= 0,
        ) &&
        cached <= input
      )
        this.usage = { input, output, cached };
    } catch {
      /* Not a complete usage object. */
    }
  }
  finish(): CostUsage | null {
    this.parse(
      this.streaming ? this.buffer.replace(/^data:\s*/, '') : this.buffer,
    );
    return this.usage;
  }
}
export class ApiCostGateway {
  private server: Server;
  private token = randomBytes(24).toString('hex');
  private port = 0;
  private closed = false;
  private blocked = '';
  private warned = false;
  private controller = new AbortController();
  private queue: Promise<unknown> = Promise.resolve();
  private profiles: CostProfile[];
  private task!: CostTask;
  private closePromise?: Promise<void>;
  private constructor(private readonly options: Options) {
    this.profiles = options.ledger.settings(
      costProfiles(options.endpoints),
    ).profiles;
    this.server = createServer((req, res) => {
      const job = this.queue
        .then(() => this.handle(req, res))
        .catch(() => {
          this.block('费用监测或记录失败，已停止后续调用。');
          if (!res.headersSent) res.writeHead(502);
          res.end('请求已停止，请查看费用监测。');
        });
      this.queue = job;
    });
    this.server.requestTimeout = 180000;
    this.server.headersTimeout = 15000;
  }
  static async create(options: Options): Promise<ApiCostGateway> {
    options = {
      ...options,
      endpoints: Object.fromEntries(
        Object.entries(options.endpoints).filter(([, e]) => !!e),
      ),
    };
    const gateway = new ApiCostGateway(options);
    for (const endpoint of Object.values(options.endpoints)) {
      let url: URL;
      try {
        url = new URL(endpoint.baseUrl);
      } catch {
        throw new Error('费用监测需要完整的模型接口地址，请检查模型设置。');
      }
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('费用监测不支持包含账号、查询参数或片段的接口地址。');
    }
    await new Promise<void>((resolve, reject) => {
      gateway.server.once('error', reject);
      gateway.server.listen(0, '127.0.0.1', resolve);
    });
    gateway.port = (gateway.server.address() as { port: number }).port;
    try {
      gateway.task = await options.ledger.start(options.projectId);
    } catch (e) {
      gateway.server.close();
      throw e;
    }
    return gateway;
  }
  baseUrl(slot: CostSlot): string {
    const endpoint = this.options.endpoints[slot];
    if (!endpoint) throw new Error('未配置此模型。');
    const upstream = new URL(endpoint.baseUrl);
    // Preserve provider hostname marker for existing runtime adapter selection.
    return `http://127.0.0.1:${this.port}/${this.token}/${slot}/${upstream.hostname}${upstream.pathname.replace(/\/+$/, '')}`;
  }
  redactions(): string[] {
    return [this.token];
  }
  requestCount(): number {
    return this.options.ledger.records(this.task.id).length;
  }
  private block(reason: string): void {
    if (this.blocked || this.closed) return;
    this.blocked = reason;
    this.options.onBlock(reason);
  }
  private deny(res: ServerResponse, reason: string): void {
    this.block(reason);
    res.writeHead(402, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: reason, type: 'liimit_budget_stop' },
      }),
    );
  }
  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const raw = req.url ?? '';
    if (this.closed || this.blocked) {
      res.writeHead(402);
      res.end('费用保护已暂停。');
      return;
    }
    if (
      req.headers.origin ||
      !['POST', 'GET'].includes(req.method ?? '') ||
      raw.includes('..') ||
      /%2e|%2f|%5c|\\/i.test(raw)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let slot: CostSlot | undefined;
      let endpoint: CostEndpoint | undefined;
      let prefix = '';
    for (const [s, e] of Object.entries(this.options.endpoints)) {
      const p = `/${this.token}/${s}/${new URL(e.baseUrl).hostname}`;
      if (raw.startsWith(p + '/') || raw === p) {
        slot = s as CostSlot;
        endpoint = e;
        prefix = p;
        break;
      }
    }
    if (!slot || !endpoint) {
      res.writeHead(403);
      res.end();
      return;
    }
    const upstream = new URL(endpoint.baseUrl);
      const target = new URL(upstream.origin + raw.slice(prefix.length));
    const root = upstream.pathname.replace(/\/+$/, '');
    if (
      target.origin !== upstream.origin ||
      (root &&
        target.pathname !== root &&
        !target.pathname.startsWith(root + '/'))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    if (req.aborted || res.destroyed || this.closed) return;
    let body = Buffer.concat(chunks);
    const billable = req.method === 'POST';
    let profile = this.profiles.find((p) => p.slot === slot)!;
    if (
      billable &&
      String(req.headers['content-type']).includes('application/json')
    ) {
      try {
        const payload = JSON.parse(body.toString());
        const model = payload.model ?? payload.model_id;
        if (typeof model === 'string' && model !== profile.model)
          profile = this.profiles.find(
            (p) => p.id === costProfile(slot!, { ...endpoint!, model }).id,
          ) ?? {
            ...profile,
            model: model.slice(0, 200),
            price: emptyCostPrice(),
          };
        if (
          (slot === 'main' || slot === 'reasoning') &&
          payload.stream === true &&
          target.pathname.endsWith('/chat/completions')
        ) {
          payload.stream_options = {
            ...payload.stream_options,
            include_usage: true,
          };
          body = Buffer.from(JSON.stringify(payload));
        }
      } catch {
        /* Forward non-JSON as-is; it cannot provide a model override. */
      }
    } else if (billable && (slot === 'main' || slot === 'reasoning'))
      profile = { ...profile, price: emptyCostPrice() };
    if (billable) {
      const reason = this.options.ledger.blockReason(this.task);
      if (reason) {
        this.deny(res, reason);
        return;
      }
      const text = slot === 'main' || slot === 'reasoning';
      if (
        this.task.budget !== null &&
        (text
          ? profile.price.input === null || profile.price.output === null
          : profile.price.request === null)
      ) {
        this.deny(
          res,
          '当前模型未填写匹配的价格，预算保护已阻止调用；请先设置费用。',
        );
        return;
      }
      const previous = this.options.ledger
        .records(this.task.id)
        .some((r) => r.slot === slot);
      if (!text && previous) {
        const approved = await Promise.race([
          this.options.confirmAsset?.(slot, profile.price.request) ??
            Promise.resolve(false),
          new Promise<boolean>((r) =>
            this.controller.signal.addEventListener('abort', () => r(false), {
              once: true,
            }),
          ),
        ]);
        if (!approved || this.closed || res.destroyed) {
          this.deny(res, '再次生成素材未获确认，已暂停。');
          return;
        }
      }
    }
    if (this.closed || res.destroyed) return;
    const record = billable
      ? await this.options.ledger.begin(this.task.id, profile)
      : null;
    if (this.closed || res.destroyed) {
      if (record)
        await this.options.ledger.settle(record.id, 'interrupted', null);
      return;
    }
    const abort = new AbortController();
    const cancel = () => abort.abort();
    this.controller.signal.addEventListener('abort', cancel, { once: true });
    const disconnect = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on('close', disconnect);
    const timer = setTimeout(cancel, 180000);
    timer.unref();
    let collector: UsageCollector | undefined;
    let status: 'success' | 'error' | 'interrupted' = 'error';
    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (
          [
            'authorization',
            'x-api-key',
            'xi-api-key',
            'content-type',
            'accept',
            'openai-organization',
            'openai-project',
            'x-dashscope-async',
          ].includes(key) &&
          typeof value === 'string'
        )
          headers[key] = value;
      }
      const response = await fetch(target, {
        method: req.method,
        headers,
        body: billable ? body : undefined,
        signal: abort.signal,
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400)
        throw new Error('Redirect rejected');
      collector = new UsageCollector(
        (response.headers.get('content-type') ?? '').includes('event-stream'),
      );
      res.writeHead(response.status, {
        'content-type':
          response.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      const decoder = new TextDecoder();
      if (response.body)
        for await (const chunk of response.body) {
          collector.push(decoder.decode(chunk, { stream: true }));
          if (!res.write(chunk))
            await Promise.race([once(res, 'drain'), once(res, 'close')]);
          if (res.destroyed) throw new Error('Disconnected');
        }
      collector.push(decoder.decode());
      status = response.ok ? 'success' : 'error';
    } catch {
      status = abort.signal.aborted ? 'interrupted' : 'error';
      if (!res.headersSent)
        res.writeHead(502, { 'content-type': 'application/json' });
    } finally {
      clearTimeout(timer);
      this.controller.signal.removeEventListener('abort', cancel);
      res.off('close', disconnect);
      if (record)
        await this.options.ledger.settle(
          record.id,
          status,
          collector?.finish() ?? null,
        );
      res.end();
      const total = costTotal(this.options.ledger.records(this.task.id));
      const reason = this.options.ledger.blockReason(this.task);
      if (reason) this.block(reason);
      else if (
        !this.warned &&
        this.task.budget !== null &&
        total.knownCny + 1e-9 >= this.task.budget * 0.8
      ) {
        this.warned = true;
        this.options.onWarning?.(
          '本次任务已用到估算预算的80%，请留意剩余费用。',
        );
      }
    }
  }
  close(reason = ''): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.controller.abort();
    this.server.closeAllConnections();
    this.closePromise = (async () => {
      await new Promise<void>((r) => this.server.close(() => r()));
      await this.queue;
      await this.options.ledger.finish(this.task.id, this.blocked || reason);
    })();
    return this.closePromise;
  }
}
