import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requireReadyStarterProject } from '../src/main/starterPreparationGate.js';
import {
  STARTER_PREPARATION_FIXTURE_TIMESTAMPS,
  makeFailedStarterPreparation,
  makeQueuedStarterPreparation,
  makeReadyStarterPreparation,
  makeStarterPreparationSequence,
  makeStarterProject,
} from './starterPreparationFixtures.js';

const sharedTypes = readFileSync(
  new URL('../src/shared/types.ts', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../src/main/main.ts', import.meta.url),
  'utf8',
);
const preloadSource = readFileSync(
  new URL('../src/main/preload.cts', import.meta.url),
  'utf8',
);
const gateSource = readFileSync(
  new URL('../src/main/starterPreparationGate.ts', import.meta.url),
  'utf8',
);

function unionMembers(typeName: string): string[] {
  const match = sharedTypes.match(
    new RegExp(`export type ${typeName}\\s*=\\s*(?<body>[\\s\\S]*?);`),
  );
  expect(match, `缺少共享类型 ${typeName}`).not.toBeNull();
  return [...(match?.groups?.body ?? '').matchAll(/'([^']+)'/g)].map(
    (item) => item[1] ?? '',
  );
}

function interfaceBody(interfaceName: string): string {
  const match = sharedTypes.match(
    new RegExp(
      `export interface ${interfaceName}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`,
    ),
  );
  expect(match, `缺少共享接口 ${interfaceName}`).not.toBeNull();
  return match?.groups?.body ?? '';
}

describe('新项目基础游戏准备状态契约', () => {
  it('只允许四种准备状态', () => {
    expect(unionMembers('StarterPreparationStatus')).toEqual([
      'queued',
      'preparing',
      'ready',
      'failed',
    ]);
  });

  it('只允许固定且可展示的准备阶段', () => {
    expect(unionMembers('StarterPreparationPhase')).toEqual([
      'queued',
      'scaffold',
      'dependencies',
      'build',
      'level-validation',
      'preview-validation',
      'complete',
    ]);
  });

  it('只允许稳定且不包含原始日志的错误分类', () => {
    expect(unionMembers('StarterPreparationErrorCode')).toEqual([
      'interrupted',
      'network',
      'permission',
      'disk-space',
      'unsafe-project',
      'dependency',
      'build',
      'level-validation',
      'preview-validation',
      'persistence',
      'unknown',
    ]);
  });

  it('要求版本、次数、单调 revision 和长度受限的用户消息', () => {
    const body = interfaceBody('StarterPreparation');
    expect(body).toMatch(/schemaVersion:\s*1;/);
    expect(body).toMatch(/status:\s*StarterPreparationStatus;/);
    expect(body).toMatch(/phase:\s*StarterPreparationPhase;/);
    expect(body).toMatch(/attempt:\s*number;/);
    expect(body).toMatch(/revision:\s*number;/);
    expect(body).toMatch(/message:\s*string;/);
    expect(body).toMatch(/errorCode\?:\s*StarterPreparationErrorCode;/);
    expect(body).toMatch(/startedAt\?:\s*string;/);
    expect(body).toMatch(/finishedAt\?:\s*string;/);
    expect(sharedTypes).toMatch(
      /export const STARTER_PREPARATION_MESSAGE_MAX_LENGTH\s*=\s*1_000;/,
    );
  });

  it('让历史 ProjectRecord 可以缺少准备状态字段', () => {
    const body = interfaceBody('ProjectRecord');
    expect(body).toMatch(/starterPreparation\?:\s*StarterPreparation;/);
    expect(body).not.toMatch(/starterPreparation:\s*StarterPreparation;/);
  });

  it('生成互不共享的固定时间新项目样板', () => {
    const first = makeStarterProject({ id: 'first-project' });
    const second = makeStarterProject({ id: 'second-project' });

    expect(first).toMatchObject({
      id: 'first-project',
      createdAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.createdAt,
      updatedAt: STARTER_PREPARATION_FIXTURE_TIMESTAMPS.createdAt,
      starterPreparation: {
        status: 'queued',
        phase: 'queued',
        attempt: 1,
        revision: 0,
      },
    });
    expect(first.starterPreparation).not.toBe(second.starterPreparation);
  });

  it('覆盖四种状态并生成 revision 严格递增的成功序列', () => {
    expect([
      makeQueuedStarterPreparation().status,
      makeStarterPreparationSequence()[1]?.status,
      makeReadyStarterPreparation().status,
      makeFailedStarterPreparation().status,
    ]).toEqual(['queued', 'preparing', 'ready', 'failed']);

    const sequence = makeStarterPreparationSequence();
    expect(sequence.map((item) => item.phase)).toEqual([
      'queued',
      'scaffold',
      'dependencies',
      'build',
      'level-validation',
      'preview-validation',
      'complete',
    ]);
    expect(sequence.map((item) => item.revision)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(
      sequence.every(
        (item, index) =>
          index === 0 || item.revision > sequence[index - 1]!.revision,
      ),
    ).toBe(true);
  });
});

describe('基础游戏重试后台入口契约', () => {
  it('只注册受信任的固定重试 IPC 且只接收项目 ID', () => {
    const handler = retryHandlerSource();

    expect(handler).toMatch(
      /secureHandle\(\s*'project:retry-starter-preparation',\s*async \(projectId: unknown\)/,
    );
    expect(handler).not.toMatch(
      /template|templatesDir|command|args|packageName|dependencies/,
    );
  });

  it('在读取项目之前验证 ID 为非空且不超过 160 字符', () => {
    const handler = retryHandlerSource();
    const validation = "requireString(projectId, '项目 ID', 160)";

    expect(handler).toContain(validation);
    expect(handler.indexOf(validation)).toBeLessThan(
      handler.indexOf('getProject('),
    );
  });

  it('拒绝非固定模式和没有准备记录的历史项目', () => {
    const handler = retryHandlerSource();

    expect(handler).toMatch(/isFixedProductMode\(project\)/);
    expect(handler).toMatch(
      /!project\.starterPreparation[\s\S]*(?:历史项目|没有基础游戏准备记录)/,
    );
  });

  it('ready 项目返回 accepted false 且不进入准备服务', () => {
    const handler = retryHandlerSource();
    const readyCheck = handler.indexOf("starterPreparation.status === 'ready'");
    const notAccepted = handler.indexOf('accepted: false');
    const enqueue = handler.indexOf('starterPreparation.enqueue(project)');

    expect(readyCheck).toBeGreaterThan(-1);
    expect(notAccepted).toBeGreaterThan(readyCheck);
    expect(enqueue).toBeGreaterThan(notAccepted);
  });

  it('可重试项目交给唯一准备服务并立即返回 accepted true', () => {
    const handler = retryHandlerSource();

    expect(handler).toContain('void starterPreparation.enqueue(project)');
    expect(handler).toMatch(/return\s*\{\s*accepted: true,\s*project\s*\}/);
    expect(handler).not.toContain('await starterPreparation.enqueue(project)');
    expect(handler).not.toContain('new StarterPreparationService');
  });

  it('queued、preparing 和快速重复请求都委托给服务的 single-flight', () => {
    const handler = retryHandlerSource();

    expect(handler).not.toMatch(
      /status === 'queued'[\s\S]*accepted: false|status === 'preparing'[\s\S]*accepted: false/,
    );
    expect(
      handler.match(/starterPreparation\.enqueue\(project\)/g),
    ).toHaveLength(1);
  });

  it('应用退出时先中止准备队列和受控子进程，再继续其他清理', () => {
    const beforeQuitStart = mainSource.indexOf("app.on('before-quit'");
    const beforeQuitSource = mainSource.slice(beforeQuitStart);
    const starterShutdown = beforeQuitSource.indexOf(
      'await starterPreparation?.shutdown()',
    );
    const runnerShutdown = beforeQuitSource.indexOf('await runner?.shutdown()');
    const flushEvents = beforeQuitSource.indexOf('await agentEvents?.flush()');

    expect(beforeQuitStart).toBeGreaterThan(-1);
    expect(starterShutdown).toBeGreaterThan(-1);
    expect(starterShutdown).toBeLessThan(runnerShutdown);
    expect(starterShutdown).toBeLessThan(flushEvents);
  });
});

describe('基础游戏重试 Preload 最小权限契约', () => {
  it('公开接口只接收项目 ID 并返回固定重试结果', () => {
    const body = interfaceBody('GameAgentAPI');

    expect(body).toMatch(
      /retryStarterPreparation\(\s*projectId:\s*string,?\s*\):\s*Promise<StarterPreparationRetryResult>;/,
    );
  });

  it('Preload 只把项目 ID 映射到固定 IPC，不暴露命令或模板参数', () => {
    const start = preloadSource.indexOf('retryStarterPreparation:');
    const end = preloadSource.indexOf('\n  saveSettings:', start);
    const bridge = preloadSource.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(bridge).toMatch(
      /retryStarterPreparation:\s*\(projectId:\s*string\)[\s\S]*invoke\(\s*'project:retry-starter-preparation',\s*projectId\s*\)/,
    );
    expect(bridge).not.toMatch(
      /template|templatesDir|command|args|packageName|dependencies|filePath/,
    );
  });
});

describe('可选 Agent 的基础游戏 ready 门禁契约', () => {
  it('启动 Agent 前先读取真实项目并检查基础游戏 ready', () => {
    const handler = ipcHandlerSource('agent:start');
    const validation = handler.indexOf('validateStartAgentInput(');
    const projectLookup = handler.indexOf('getProject(input.projectId)');
    const readyGate = handler.indexOf(
      "requireReadyStarterProject(project, '启动 Agent')",
    );
    const runnerStart = handler.indexOf('runner.start(input)');

    expect(validation).toBeGreaterThan(-1);
    expect(projectLookup).toBeGreaterThan(validation);
    expect(readyGate).toBeGreaterThan(projectLookup);
    expect(runnerStart).toBeGreaterThan(readyGate);
  });

  it('queued、preparing 和 failed 新项目都由同一门禁拒绝', () => {
    expect(gateSource).toMatch(
      /StarterPreparationProtectedAction[\s\S]*'启动 Agent'/,
    );
    for (const preparation of [
      makeQueuedStarterPreparation(),
      makeStarterPreparationSequence()[1]!,
      makeFailedStarterPreparation(),
    ]) {
      const project = makeStarterProject({ starterPreparation: preparation });
      expect(() => requireReadyStarterProject(project, '读取关卡')).toThrow(
        /基础游戏尚未准备完成/,
      );
    }
  });

  it('ready 新项目和没有准备字段的历史项目保持允许', () => {
    const ready = makeStarterProject({
      starterPreparation: makeReadyStarterPreparation(),
    });
    const historical = makeStarterProject({ starterPreparation: undefined });

    expect(requireReadyStarterProject(ready, '读取关卡')).toBe(ready);
    expect(requireReadyStarterProject(historical, '读取关卡')).toBe(historical);
    expect(gateSource).toContain('if (!preparation) return project;');
    expect(gateSource).toMatch(
      /status === 'ready'[\s\S]*phase === 'complete'[\s\S]*return project/,
    );
  });
});

function retryHandlerSource(): string {
  try {
    return ipcHandlerSource('project:retry-starter-preparation');
  } catch {
    throw new Error('重试准备 IPC 尚未实现；这是 T027 前的预期失败。');
  }
}

function ipcHandlerSource(channelName: string): string {
  const channel = mainSource.indexOf(`'${channelName}'`);
  const start = mainSource.lastIndexOf('secureHandle(', channel);
  if (channel < 0 || start < 0) {
    throw new Error(`IPC ${channelName} 尚未实现。`);
  }
  const end = mainSource.indexOf('\n  secureHandle(', start + 1);
  return mainSource.slice(start, end < 0 ? undefined : end);
}
