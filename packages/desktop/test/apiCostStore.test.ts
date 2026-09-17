import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ApiCostStore,
  costProfile,
  estimateCost,
  validateCostSettings,
} from '../src/main/apiCostStore.js';
import { emptyCostPrice } from '../src/shared/apiCost.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
describe('API cost ledger', () => {
  it('estimates text/cache and leaves unknown price or usage unknown', () => {
    const price = { input: 2, output: 8, cache: 1, request: null };
    expect(
      estimateCost(
        'main',
        price,
        { input: 1000000, output: 100000, cached: 500000 },
        true,
      ),
    ).toBeCloseTo(2.3);
    expect(estimateCost('main', price, null, true)).toBeNull();
    expect(estimateCost('image', emptyCostPrice(), null, true)).toBeNull();
    expect(
      estimateCost('image', { ...price, request: 0.2 }, null, false),
    ).toBeNull();
  });
  it('validates limits and disallows mismatched profiles', () => {
    expect(() =>
      validateCostSettings({ budget: -1, maxRequests: 20, profiles: [] }, []),
    ).toThrow();
    expect(() =>
      validateCostSettings(
        { budget: null, maxRequests: Infinity, profiles: [] },
        [],
      ),
    ).toThrow();
    expect(() =>
      validateCostSettings(
        { budget: 1, maxRequests: 20, profiles: [{ id: 'bad' }] },
        [],
      ),
    ).toThrow();
  });
  it('persists pending before sending, recovers interruption and never stores URLs or keys', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'liimit-cost-'));
    dirs.push(dir);
    const ledger = new ApiCostStore(dir);
    await ledger.initialize();
    const profile = costProfile('main', {
      provider: 'openai-compat',
      model: 'test',
      baseUrl: 'https://private.test/v1',
      apiKey: 'secret-key',
    });
    const task = await ledger.start('project');
    await ledger.begin(task.id, profile);
    const raw = await readFile(path.join(dir, 'costs.json'), 'utf8');
    expect(raw).not.toContain('private.test');
    expect(raw).not.toContain('secret-key');
    const recovered = new ApiCostStore(dir);
    await recovered.initialize();
    const snapshot = recovered.snapshot('project', [profile]);
    expect(snapshot.task?.status).toBe('stopped');
    expect(snapshot.project.unknown).toBe(1);
    expect(snapshot.project.pending).toBe(0);
  });
  it('freezes request prices and separates project totals', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'liimit-cost-'));
    dirs.push(dir);
    const ledger = new ApiCostStore(dir);
    await ledger.initialize();
    const profile = costProfile('main', {
      provider: 'openai-compat',
      model: 'test',
      baseUrl: 'https://example.test/v1',
    });
    profile.price = { input: 1, output: 2, cache: null, request: null };
    await ledger.save({ budget: 1, maxRequests: 20, profiles: [profile] }, [
      profile,
    ]);
    const task = await ledger.start('one');
    const call = await ledger.begin(task.id, profile);
    await ledger.settle(call.id, 'success', {
      input: 1000000,
      output: 0,
      cached: 0,
    });
    await ledger.finish(task.id);
    profile.price.input = 100;
    await ledger.save({ budget: 2, maxRequests: 20, profiles: [profile] }, [
      profile,
    ]);
    expect(ledger.snapshot('one', [profile]).project.knownCny).toBe(1);
    expect(ledger.snapshot('two', [profile]).project.calls).toBe(0);
    const changed = costProfile('main', {
      provider: 'openai-compat',
      model: 'new',
      baseUrl: 'https://example.test/v1',
    });
    expect(ledger.settings([changed]).profiles[0].price.input).toBeNull();
  });
});
