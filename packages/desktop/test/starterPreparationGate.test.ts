import { describe, expect, it } from 'vitest';
import { requireReadyStarterProject } from '../src/main/starterPreparationGate.js';
import {
  makeFailedStarterPreparation,
  makePreparingStarterPreparation,
  makeQueuedStarterPreparation,
  makeReadyStarterPreparation,
  makeStarterProject,
} from './starterPreparationFixtures.js';

describe('基础游戏准备后台门禁', () => {
  it('允许没有准备字段的历史项目保持原有行为', () => {
    const project = makeStarterProject({ starterPreparation: undefined });

    expect(requireReadyStarterProject(project, '读取关卡')).toBe(project);
  });

  it('允许完整准备成功的新项目操作真实关卡和试玩', () => {
    const project = makeStarterProject({
      starterPreparation: makeReadyStarterPreparation(),
    });

    expect(requireReadyStarterProject(project, '读取关卡')).toBe(project);
    expect(requireReadyStarterProject(project, '保存关卡')).toBe(project);
    expect(requireReadyStarterProject(project, '启动 Web 试玩')).toBe(project);
  });

  it.each([
    ['排队', makeQueuedStarterPreparation()],
    ['准备中', makePreparingStarterPreparation()],
  ])('拒绝%s的新项目并提示用户等待', (_label, starterPreparation) => {
    const project = makeStarterProject({ starterPreparation });

    expect(() => requireReadyStarterProject(project, '读取关卡')).toThrow(
      /基础游戏尚未准备完成.*等待/,
    );
  });

  it('拒绝失败的新项目并提示用户重试', () => {
    const project = makeStarterProject({
      starterPreparation: makeFailedStarterPreparation(),
    });

    expect(() => requireReadyStarterProject(project, '保存关卡')).toThrow(
      /基础游戏尚未准备完成.*重试/,
    );
  });

  it('拒绝状态声称 ready 但流程阶段尚未 complete 的异常记录', () => {
    const project = makeStarterProject({
      starterPreparation: makeReadyStarterPreparation({ phase: 'build' }),
    });

    expect(() => requireReadyStarterProject(project, '启动 Web 试玩')).toThrow(
      /基础游戏尚未准备完成/,
    );
  });
});
