import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  COST_SLOTS,
  emptyCostPrice,
  type CostSlot,
  type CostPrice,
  type CostProfile,
  type CostSettings,
  type CostRequest,
  type CostTask,
  type CostUsage,
  type CostTotal,
  type CostSnapshot,
} from '../shared/apiCost.js';

interface Ledger {
  version: 1;
  settings: CostSettings;
  tasks: CostTask[];
  requests: CostRequest[];
}
const defaults = (): Ledger => ({
  version: 1,
  settings: { budget: null, maxRequests: 20, profiles: [] },
  tasks: [],
  requests: [],
});
export function costProfile(
  slot: CostSlot,
  endpoint: {
    provider: string;
    model: string;
    baseUrl: string;
    apiKey?: string;
  },
): CostProfile {
  const id = createHash('sha256')
    .update(
      JSON.stringify([
        slot,
        endpoint.provider,
        endpoint.model,
        endpoint.baseUrl.replace(/\/+$/, ''),
      ]),
    )
    .digest('hex');
  return {
    id,
    slot,
    provider: endpoint.provider.slice(0, 80),
    model: endpoint.model.slice(0, 200),
    price: emptyCostPrice(),
  };
}
function amount(value: unknown, maximum = 1000000): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  )
    throw new Error('费用配置必须是有效的非负金额。');
  return value;
}
export function validateCostSettings(
  value: unknown,
  profiles: CostProfile[],
): CostSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('费用设置格式不正确。');
  const v = value as CostSettings;
  const budget = amount(v.budget, 10000);
  if (budget !== null && budget < 0.01)
    throw new Error('预算至少为 ¥0.01；留空表示不启用金额限制。');
  if (
    !Number.isInteger(v.maxRequests) ||
    v.maxRequests < 1 ||
    v.maxRequests > 100
  )
    throw new Error('单次任务调用上限须为1～100。');
  if (!Array.isArray(v.profiles) || v.profiles.length > 10)
    throw new Error('模型价格配置不正确。');
  const seen = new Set<string>();
  return {
    budget,
    maxRequests: v.maxRequests,
    profiles: v.profiles.map((p) => {
      const current = profiles.find((c) => c.id === p?.id);
      if (!current || seen.has(p.id) || !p.price)
        throw new Error('模型配置已改变，请刷新费用设置。');
      seen.add(p.id);
      return {
        ...current,
        price: {
          input: amount(p.price.input),
          output: amount(p.price.output),
          cache: amount(p.price.cache),
          request: amount(p.price.request),
        },
      };
    }),
  };
}
export function estimateCost(
  slot: CostSlot,
  price: CostPrice,
  usage: CostUsage | null,
  success: boolean,
): number | null {
  if (slot !== 'main' && slot !== 'reasoning')
    return success ? price.request : null;
  if (!usage || price.input === null || price.output === null) return null;
  if (
    ![usage.input, usage.output, usage.cached].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    usage.cached > usage.input
  )
    return null;
  return (
    ((usage.input - usage.cached) * price.input +
      usage.cached * (price.cache ?? price.input) +
      usage.output * price.output) /
    1000000
  );
}
export function costTotal(records: CostRequest[]): CostTotal {
  return records.reduce(
    (t, r) => ({
      knownCny: t.knownCny + (r.estimatedCny ?? 0),
      unknown:
        t.unknown + Number(r.estimatedCny === null && r.status !== 'pending'),
      pending: t.pending + Number(r.status === 'pending'),
      calls: t.calls + 1,
      failures:
        t.failures + Number(r.status === 'error' || r.status === 'interrupted'),
    }),
    { knownCny: 0, unknown: 0, pending: 0, calls: 0, failures: 0 },
  );
}
export class ApiCostStore {
  private data: Ledger = defaults();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly directory: string) {}
  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let raw: string;
    try {
      raw = await readFile(path.join(this.directory, 'costs.json'), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new Error('无法读取费用记录，已阻止收费任务。');
    }
    try {
      if (raw.length > 20 * 1024 * 1024) throw new Error();
      const d = JSON.parse(raw) as Ledger;
      if (
        d.version !== 1 ||
        !Array.isArray(d.tasks) ||
        !Array.isArray(d.requests) ||
        !d.settings ||
        d.tasks.length > 10000 ||
        d.requests.length > 10000
      )
        throw new Error();
      d.settings = validateCostSettings(d.settings, d.settings.profiles);
      for (const t of d.tasks) {
        if (
          typeof t.id !== 'string' ||
          !['running', 'finished', 'stopped'].includes(t.status) ||
          !Number.isInteger(t.maxRequests)
        )
          throw new Error();
        amount(t.budget, 10000);
        if (t.status === 'running') {
          t.status = 'stopped';
          t.reason = '应用上次退出，未自动继续；未结算请求的费用未知。';
        }
      }
      for (const r of d.requests) {
        if (
          !COST_SLOTS.includes(r.slot) ||
          !['pending', 'success', 'error', 'interrupted'].includes(r.status) ||
          !d.tasks.some((t) => t.id === r.taskId)
        )
          throw new Error();
        amount(r.estimatedCny, 1e12);
        if (r.status === 'pending') {
          r.status = 'interrupted';
          r.estimatedCny = null;
        }
      }
      this.data = d;
      await this.flush(d);
    } catch {
      throw new Error(
        '费用记录异常，已保留原文件并阻止收费任务；请先检查本地费用记录。',
      );
    }
  }
  private async flush(data: Ledger): Promise<void> {
    const file = path.join(this.directory, 'costs.json');
    await writeFile(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
    await rename(file + '.tmp', file);
  }
  private mutate<T>(fn: (data: Ledger) => T): Promise<T> {
    const job = this.queue.then(async () => {
      const draft = structuredClone(this.data);
      const result = fn(draft);
      await this.flush(draft);
      this.data = draft;
      return structuredClone(result);
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
  settings(profiles: CostProfile[]): CostSettings {
    return {
      ...this.data.settings,
      profiles: profiles.map((p) => ({
        ...p,
        price: {
          ...(this.data.settings.profiles.find((s) => s.id === p.id)?.price ??
            emptyCostPrice()),
        },
      })),
    };
  }
  async save(value: unknown, profiles: CostProfile[]): Promise<void> {
    const settings = validateCostSettings(value, profiles);
    await this.mutate((d) => {
      d.settings = settings;
    });
  }
  start(projectId: string | null): Promise<CostTask> {
    return this.mutate((d) => {
      if (d.tasks.length >= 10000 || d.requests.length >= 10000)
        throw new Error('费用台账已达到容量上限，请先归档；本次未调用 API。');
      const t: CostTask = {
        id: randomUUID(),
        projectId,
        startedAt: new Date().toISOString(),
        status: 'running',
        budget: d.settings.budget,
        maxRequests: d.settings.maxRequests,
        reason: '',
      };
      d.tasks.push(t);
      return t;
    });
  }
  begin(taskId: string, profile: CostProfile): Promise<CostRequest> {
    return this.mutate((d) => {
      const task = d.tasks.find((t) => t.id === taskId);
      if (!task || task.status !== 'running' || d.requests.length >= 10000)
        throw new Error('费用任务已结束或记录已满。');
      const r: CostRequest = {
        id: randomUUID(),
        taskId,
        slot: profile.slot,
        model: profile.model,
        price: { ...profile.price },
        startedAt: new Date().toISOString(),
        status: 'pending',
        usage: null,
        estimatedCny: null,
      };
      d.requests.push(r);
      return r;
    });
  }
  settle(
    id: string,
    status: CostRequest['status'],
    usage: CostUsage | null,
  ): Promise<void> {
    return this.mutate((d) => {
      const r = d.requests.find((r) => r.id === id);
      if (!r || r.status !== 'pending') return;
      r.status = status;
      r.usage = usage;
      r.estimatedCny = estimateCost(
        r.slot,
        r.price,
        usage,
        status === 'success',
      );
    });
  }
  finish(id: string, reason = ''): Promise<void> {
    return this.mutate((d) => {
      const t = d.tasks.find((t) => t.id === id);
      if (!t) return;
      t.status = reason ? 'stopped' : 'finished';
      t.reason = reason.slice(0, 300);
      for (const r of d.requests)
        if (r.taskId === id && r.status === 'pending') r.status = 'interrupted';
    });
  }
  records(id: string): CostRequest[] {
    return structuredClone(this.data.requests.filter((r) => r.taskId === id));
  }
  async flushPending(): Promise<void> {
    await this.queue;
  }
  blockReason(task: CostTask): string | null {
    const rows = this.records(task.id);
      const total = costTotal(rows);
    if (rows.length >= task.maxRequests)
      return `已达到本次 ${task.maxRequests} 次调用上限，已暂停；请检查结果后再决定是否继续。`;
    if (
      rows.length >= 3 &&
      rows
        .slice(-3)
        .every((r) => r.status === 'error' || r.status === 'interrupted')
    )
      return '连续3次 API 请求失败，已暂停，避免重复消费。';
    if (task.budget !== null) {
      if (total.unknown)
        return '有请求费用未知，已暂停后续调用；请先到服务商核对账单。';
      if (total.knownCny + 1e-9 >= task.budget)
        return '已达到本次任务的估算预算，已暂停后续调用。';
    }
    return null;
  }
  snapshot(projectId: string | null, profiles: CostProfile[]): CostSnapshot {
    const tasks = this.data.tasks.filter((t) => t.projectId === projectId);
      const ids = new Set(tasks.map((t) => t.id));
    const rows = this.data.requests.filter((r) => ids.has(r.taskId));
      const task = tasks.at(-1) ?? null;
    return structuredClone({
      settings: this.settings(profiles),
      task: task
        ? {
            ...task,
            total: costTotal(rows.filter((r) => r.taskId === task.id)),
          }
        : null,
      project: costTotal(rows),
      categories: Object.fromEntries(
        COST_SLOTS.map((s) => [s, costTotal(rows.filter((r) => r.slot === s))]),
      ) as Record<CostSlot, CostTotal>,
      recent: rows.slice(-30).reverse(),
    });
  }
}
