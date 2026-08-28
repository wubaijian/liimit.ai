import type { ProjectRecord } from '../shared/types.js';

export type StarterPreparationProtectedAction =
  | '读取关卡'
  | '保存关卡'
  | '读取多关卡'
  | '保存多关卡'
  | '新增关卡'
  | '保存角色能力'
  | '读取游戏信息'
  | '保存游戏信息'
  | '启动 Web 试玩'
  | '启动 Agent';

export function requireReadyStarterProject(
  project: ProjectRecord,
  action: StarterPreparationProtectedAction,
): ProjectRecord {
  const preparation = project.starterPreparation;
  if (!preparation) return project;
  if (preparation.status === 'ready' && preparation.phase === 'complete') {
    return project;
  }
  if (preparation.status === 'failed') {
    throw new Error(`基础游戏尚未准备完成，请先重试准备，再${action}。`);
  }
  throw new Error(`基础游戏尚未准备完成，请等待准备结束后再${action}。`);
}
