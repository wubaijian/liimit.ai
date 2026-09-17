import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApiCostStore, costProfile } from '../src/main/apiCostStore.js';
import { ApiCostGateway, UsageCollector } from '../src/main/apiCostGateway.js';
import { generateElevenLabsAudioPreview } from '../src/main/audioPreviewService.js';
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function fixture(
  options: {
    budget?: number | null;
    priced?: boolean;
    fail?: boolean;
    max?: number;
    slot?: 'main' | 'image' | 'audio';
    approve?: boolean;
    missing?: boolean;
    hang?: boolean;
    redirect?: string;
  } = {},
) {
  let calls = 0;
  const warnings: string[] = [];
  const server = createServer((_req, res) => {
    calls++;
    if (options.slot === 'audio') {
      res.setHeader('content-type', 'audio/mpeg');
      res.end(Buffer.from([73, 68, 51, 1, 2, 3]));
      return;
    }
    if (options.hang) return;
    if (options.redirect) {
      res.writeHead(307, { location: options.redirect });
      res.end();
      return;
    }
    if (options.fail) {
      res.writeHead(500);
      res.end('{}');
      return;
    }
    res.setHeader('content-type', 'text/event-stream');
    res.end(
      options.missing
        ? 'data: {"choices":[]}\n\ndata: [DONE]\n\n'
        : 'data: {"usage":{"prompt_tokens":1000,"completion_tokens":1000}}\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  cleanup.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  );
  const address = server.address() as { port: number };
  const endpoint = {
    provider: options.slot === 'audio' ? 'elevenlabs' : 'openai-compat',
    model: options.slot === 'audio' ? 'eleven_text_to_sound_v2' : 'test',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'fake-key',
  };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'liimit-gateway-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const ledger = new ApiCostStore(dir);
  await ledger.initialize();
  const slot = options.slot ?? 'main';
  const profile = costProfile(slot, endpoint);
  if (options.priced !== false)
    profile.price = { input: 10, output: 10, cache: 1, request: 0.02 };
  await ledger.save(
    {
      budget: options.budget ?? null,
      maxRequests: options.max ?? 20,
      profiles: [profile],
    },
    [profile],
  );
  const gateway = await ApiCostGateway.create({
    ledger,
    projectId: 'p',
    endpoints: { [slot]: endpoint },
    onBlock: () => {},
    onWarning: (m) => warnings.push(m),
    confirmAsset: async () => options.approve ?? true,
  });
  cleanup.push(() => gateway.close());
  const url = gateway.baseUrl(slot) + '/chat/completions';
  const call = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"model":"test","stream":true}',
    }).then(async (r) => ({ status: r.status, body: await r.text() }));
  return { calls: () => calls, ledger, gateway, call, url, warnings };
}
describe('request-level cost protection (localhost only)', () => {
  it('routes the real audio service through local monitoring without any paid API', async () => {
    const f = await fixture({ slot: 'audio' });
    const result = await generateElevenLabsAudioPreview(
      {
        provider: 'elevenlabs',
        model: 'eleven_text_to_sound_v2',
        baseUrl: 'https://api.elevenlabs.io',
        apiKey: 'fake-test-key',
      },
      { sound: 'jump', durationSeconds: 1, description: '短促的跳跃声' },
      {
        fetchImpl: (_url, init) =>
          fetch(f.gateway.baseUrl('audio') + '/sound-generation', init),
      },
    );
    expect(result.bytes.byteLength).toBe(6);
    expect(f.calls()).toBe(1);
    expect(f.ledger.snapshot('p', []).project.knownCny).toBeCloseTo(0.02);
  });
  it('fails closed if pre-request persistence fails', async () => {
    const f = await fixture();
    vi.spyOn(f.ledger, 'begin').mockRejectedValueOnce(new Error('disk full'));
    await f.call();
    await f.call();
    expect(f.calls()).toBe(0);
  });
  it('parses split SSE and does not sum cumulative usage twice', () => {
    const c = new UsageCollector(true);
    c.push('data: {"usa');
    c.push('ge":{"prompt_tokens":5,"completion_tokens":2}}\n\n');
    c.push('data: {"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n');
    expect(c.finish()).toEqual({ input: 5, output: 2, cached: 0 });
  });
  it('blocks the next concurrent request once budget reached', async () => {
    const f = await fixture({ budget: 0.02 });
    await Promise.all([f.call(), f.call()]);
    expect(f.calls()).toBe(1);
    expect(f.ledger.snapshot('p', []).project.knownCny).toBeCloseTo(0.02);
  });
  it('missing price blocks BEFORE upstream when budget enabled', async () => {
    const f = await fixture({ budget: 1, priced: false });
    expect((await f.call()).status).toBe(402);
    expect(f.calls()).toBe(0);
  });
  it('stops after three errors even with no money budget', async () => {
    const f = await fixture({ fail: true });
    for (let i = 0; i < 4; i++) await f.call();
    expect(f.calls()).toBe(3);
    expect(f.ledger.snapshot('p', []).project.unknown).toBe(3);
  });
  it('enforces count and refuses repeated asset without approval', async () => {
    const f = await fixture({ slot: 'image', approve: false });
    await f.call();
    await f.call();
    expect(f.calls()).toBe(1);
    const g = await fixture({ max: 1 });
    await g.call();
    await g.call();
    expect(g.calls()).toBe(1);
  });
  it('rejects foreign routes', async () => {
    const f = await fixture();
    const u = new URL(f.url);
    expect((await fetch(u.origin + '/wrong', { method: 'POST' })).status).toBe(
      403,
    );
    expect(f.calls()).toBe(0);
  });
  it('does not follow redirects or forward credentials to another endpoint', async () => {
    const target = await fixture();
    const f = await fixture({ redirect: target.url });
    await f.call();
    expect(target.calls()).toBe(0);
    expect(f.calls()).toBe(1);
    expect(f.ledger.snapshot('p', []).project.unknown).toBe(1);
  });
  it('pauses on unknown usage instead of allowing free retries', async () => {
    const f = await fixture({ budget: 1, missing: true });
    await f.call();
    await f.call();
    expect(f.calls()).toBe(1);
    expect(f.ledger.snapshot('p', []).project.unknown).toBe(1);
  });
  it('warns at 80 percent only once', async () => {
    const f = await fixture({ budget: 0.025 });
    await f.call();
    expect(f.warnings).toHaveLength(1);
    await f.call();
    expect(f.warnings).toHaveLength(1);
    await f.call();
    expect(f.calls()).toBe(2);
  });
  it('cancels an in-flight request and persists unknown cost', async () => {
    const f = await fixture({ hang: true });
    const request = f.call().catch(() => null);
    for (let i = 0; i < 100 && !f.calls(); i++)
      await new Promise((r) => setTimeout(r, 5));
    expect(f.calls()).toBe(1);
    await f.gateway.close('用户停止');
    await request;
    const result = f.ledger.snapshot('p', []);
    expect(result.project.unknown).toBe(1);
    expect(result.task?.status).toBe('stopped');
  });
  it('model override cannot reuse a different price', async () => {
    const f = await fixture({ budget: 1 });
    await fetch(f.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"model":"different"}',
    });
    expect(f.calls()).toBe(0);
  });
});
