export const COST_SLOTS = [
  'main',
  'reasoning',
  'image',
  'audio',
  'video',
] as const;
export type CostSlot = (typeof COST_SLOTS)[number];
export interface CostPrice {
  input: number | null;
  output: number | null;
  cache: number | null;
  request: number | null;
}
export interface CostProfile {
  id: string;
  slot: CostSlot;
  provider: string;
  model: string;
  price: CostPrice;
}
export interface CostSettings {
  budget: number | null;
  maxRequests: number;
  profiles: CostProfile[];
}
export interface CostUsage {
  input: number;
  output: number;
  cached: number;
}
export interface CostRequest {
  id: string;
  taskId: string;
  slot: CostSlot;
  model: string;
  price: CostPrice;
  startedAt: string;
  status: 'pending' | 'success' | 'error' | 'interrupted';
  usage: CostUsage | null;
  estimatedCny: number | null;
}
export interface CostTask {
  id: string;
  projectId: string | null;
  startedAt: string;
  status: 'running' | 'finished' | 'stopped';
  budget: number | null;
  maxRequests: number;
  reason: string;
}
export interface CostTotal {
  knownCny: number;
  unknown: number;
  pending: number;
  calls: number;
  failures: number;
}
export interface CostSnapshot {
  settings: CostSettings;
  task: (CostTask & { total: CostTotal }) | null;
  project: CostTotal;
  categories: Record<CostSlot, CostTotal>;
  recent: CostRequest[];
}
export const emptyCostPrice = (): CostPrice => ({
  input: null,
  output: null,
  cache: null,
  request: null,
});
