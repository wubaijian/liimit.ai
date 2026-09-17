import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import * as appModule from '../src/renderer/App.js';
import { Inspector } from '../src/renderer/components/Inspector.js';
import type { ProjectRecord } from '../src/shared/types.js';
import {
  makeFailedStarterPreparation,
  makePreparingStarterPreparation,
  makeReadyStarterPreparation,
  makeStarterProject,
} from './starterPreparationFixtures.js';

const appSource = readFileSync(
  new URL('../src/renderer/App.tsx', import.meta.url),
  'utf8',
);
const inspectorSource = readFileSync(
  new URL('../src/renderer/components/Inspector.tsx', import.meta.url),
  'utf8',
);
const preparationViewSource = readFileSync(
  new URL(
    '../src/renderer/components/StarterPreparationView.tsx',
    import.meta.url,
  ),
  'utf8',
);

type MergeProjectUpdate = (
  projects: ProjectRecord[],
  incoming: ProjectRecord,
) => ProjectRecord[];
type CanStartAgent = (project: ProjectRecord | undefined) => boolean;

describe('新项目准备界面', () => {
  it.each([
    ['queued', makeStarterProject(), '基础游戏已排队，等待准备。'],
    [
      'preparing',
      makeStarterProject({
        starterPreparation: makePreparingStarterPreparation({
          phase: 'dependencies',
          revision: 2,
          message: '正在准备固定运行环境。',
        }),
      }),
      '正在准备固定运行环境。',
    ],
  ] as const)(
    '%s 时只显示真实准备状态，不渲染关卡或试玩入口',
    (_status, project, expectedMessage) => {
      const markup = renderToStaticMarkup(
        <Inspector project={project} refreshToken={0} onError={vi.fn()} />,
      );

      expect(markup).toContain(expectedMessage);
      expect(markup).not.toContain('关卡布局');
      expect(markup).not.toContain('正在读取关卡');
      expect(markup).not.toContain('Web 试玩');
      expect(markup).not.toContain('载入 Web 试玩');
      expect(markup).not.toContain('开始自动试玩');
    },
  );

  it('准备门禁在任何关卡读取和试玩副作用之外', () => {
    const readyInspectorStart = inspectorSource.indexOf(
      'function ReadyProjectInspector',
    );
    expect(readyInspectorStart).toBeGreaterThan(0);

    const gateSource = inspectorSource.slice(0, readyInspectorStart);
    const readySource = inspectorSource.slice(readyInspectorStart);
    expect(gateSource).toContain('StarterPreparationView');
    expect(gateSource).toMatch(/starterPreparation[\s\S]*status[\s\S]*ready/);
    expect(gateSource).not.toContain('window.gameAgent.loadLevel');
    expect(gateSource).not.toContain('window.gameAgent.startPreview');
    expect(readySource).toContain('window.gameAgent.loadLevel');
    expect(readySource).toContain('window.gameAgent.startPreview');
  });

  it('同项目的相同或更旧 revision 不能覆盖最新状态', () => {
    const mergeProjectUpdate = getMergeProjectUpdate();
    const current = makeStarterProject({
      id: 'revision-project',
      starterPreparation: makePreparingStarterPreparation({
        phase: 'preview-validation',
        revision: 5,
      }),
    });
    const unrelated = makeStarterProject({ id: 'unrelated-project' });
    const stale = makeStarterProject({
      id: current.id,
      updatedAt: '2026-08-25T10:00:00.000Z',
      starterPreparation: makePreparingStarterPreparation({
        phase: 'dependencies',
        revision: 3,
      }),
    });
    const sameRevision = makeStarterProject({
      id: current.id,
      updatedAt: '2026-08-25T11:00:00.000Z',
      starterPreparation: makePreparingStarterPreparation({
        phase: 'build',
        revision: 5,
      }),
    });
    const newer = makeStarterProject({
      id: current.id,
      starterPreparation: makeReadyStarterPreparation({ revision: 6 }),
    });

    expect(
      mergeProjectUpdate([current, unrelated], stale).find(
        (project) => project.id === current.id,
      ),
    ).toBe(current);
    expect(
      mergeProjectUpdate([current, unrelated], sameRevision).find(
        (project) => project.id === current.id,
      ),
    ).toBe(current);
    expect(
      mergeProjectUpdate([current, unrelated], newer).find(
        (project) => project.id === current.id,
      ),
    ).toEqual(newer);
    expect(
      mergeProjectUpdate([current, unrelated], newer).find(
        (project) => project.id === unrelated.id,
      ),
    ).toBe(unrelated);
  });

  it('创建返回和异步项目更新共用同一套 revision 合并规则', () => {
    expect(
      appSource.match(/mergeProjectUpdate\(previous, project\)/g) ?? [],
    ).toHaveLength(2);
  });

  it('ready 后人工与自动试玩共用当前项目预览，不启动 Agent', () => {
    const readyProject = makeStarterProject({
      starterPreparation: makeReadyStarterPreparation(),
    });
    const markup = renderToStaticMarkup(
      <Inspector project={readyProject} refreshToken={0} onError={vi.fn()} />,
    );

    expect(markup).toContain('>关卡<');
    expect(markup).toContain('Web 试玩');
    expect(inspectorSource).toContain('const activeProjectId = project.id;');
    expect(inspectorSource).toContain(
      'window.gameAgent.startPreview(activeProjectId)',
    );
    expect(inspectorSource).toContain(
      'window.gameAgent.startPreview(project.id)',
    );
    expect(inspectorSource).toContain("sendPlaytestControl('start')");
    expect(inspectorSource).not.toContain('window.gameAgent.startAgent');
  });
});

describe('基础游戏准备失败与重试界面', () => {
  it('直接显示可执行的中文失败原因，并明确说明原项目和文件仍然保留', () => {
    const failedProject = makeStarterProject({
      name: '不要删除的游戏',
      path: 'test-workspace/keep-this-project',
      prompt: '保留我填写的横版游戏想法。',
      starterPreparation: makeFailedStarterPreparation({
        message: '网络暂时不可用，请检查连接后重试。',
      }),
    });
    const before = structuredClone(failedProject);

    const markup = renderToStaticMarkup(
      <Inspector project={failedProject} refreshToken={0} onError={vi.fn()} />,
    );

    expect(markup).toContain('网络暂时不可用，请检查连接后重试。');
    expect(markup).toContain('项目资料和已经安全写入的文件仍然保留。');
    expect(failedProject).toEqual(before);
  });

  it('failed 时只显示一个明确的“重试准备”按钮', () => {
    const failedProject = makeStarterProject({
      starterPreparation: makeFailedStarterPreparation(),
    });
    const markup = renderToStaticMarkup(
      <Inspector project={failedProject} refreshToken={0} onError={vi.fn()} />,
    );

    expect(markup.match(/<button/g) ?? []).toHaveLength(1);
    expect(markup).toContain('重试准备');
  });

  it.each([
    ['queued', makeStarterProject()],
    [
      'preparing',
      makeStarterProject({
        starterPreparation: makePreparingStarterPreparation(),
      }),
    ],
    [
      'ready',
      makeStarterProject({
        starterPreparation: makeReadyStarterPreparation(),
      }),
    ],
  ] as const)('%s 状态不显示重试准备按钮', (_status, project) => {
    const markup = renderToStaticMarkup(
      <Inspector project={project} refreshToken={0} onError={vi.fn()} />,
    );

    expect(markup).not.toContain('重试准备');
  });

  it('点击重试只传当前项目 ID，并把后台错误交给现有错误提示', () => {
    expect(preparationViewSource).toMatch(/projectId\s*:\s*string/);
    expect(preparationViewSource).toContain(
      'window.gameAgent.retryStarterPreparation(projectId)',
    );
    expect(preparationViewSource).toMatch(/catch[\s\S]*onError/);
    expect(preparationViewSource).not.toMatch(
      /retryStarterPreparation\([^)]*,/,
    );
  });

  it('重试请求未返回时禁用按钮，结束后无论成功失败都解除禁用', () => {
    expect(preparationViewSource).toMatch(
      /useState\s*\(\s*false\s*\)[\s\S]*retryStarterPreparation/,
    );
    expect(preparationViewSource).toMatch(/disabled=\{[^}]+\}/);
    expect(preparationViewSource).toMatch(/finally[\s\S]*false/);
  });

  it('切换项目会重置按钮状态，异步项目更新仍只按自身 ID 合并', () => {
    expect(inspectorSource).toContain('key={project.id}');
    expect(inspectorSource).toContain('projectId={project.id}');

    const first = makeStarterProject({ id: 'failed-project-a' });
    const second = makeStarterProject({ id: 'failed-project-b' });
    const secondFailed = makeStarterProject({
      id: second.id,
      starterPreparation: makeFailedStarterPreparation({ revision: 4 }),
    });
    const merged = getMergeProjectUpdate()([first, second], secondFailed);

    expect(merged.find((project) => project.id === first.id)).toBe(first);
    expect(merged.find((project) => project.id === second.id)).toEqual(
      secondFailed,
    );
  });
});

describe('可选 Agent 的界面门禁', () => {
  it('queued、preparing、failed 禁用，ready 和历史项目启用', () => {
    const canStartAgent = getCanStartAgent();

    expect(canStartAgent(makeStarterProject())).toBe(false);
    expect(
      canStartAgent(
        makeStarterProject({
          starterPreparation: makePreparingStarterPreparation(),
        }),
      ),
    ).toBe(false);
    expect(
      canStartAgent(
        makeStarterProject({
          starterPreparation: makeFailedStarterPreparation(),
        }),
      ),
    ).toBe(false);
    expect(
      canStartAgent(
        makeStarterProject({
          starterPreparation: makeReadyStarterPreparation(),
        }),
      ),
    ).toBe(true);
    expect(
      canStartAgent(makeStarterProject({ starterPreparation: undefined })),
    ).toBe(true);
    expect(canStartAgent(undefined)).toBe(false);
  });

  it('准备未完成时同时禁用 Agent 输入框和启动按钮', () => {
    expect(appSource).toContain(
      'const agentAvailable = canStartAgent(selected);',
    );
    expect(appSource).toMatch(
      /disabled=\{\s*selected\.status === 'running'\s*\|\|\s*creationPending\s*\|\|\s*!agentAvailable\s*\}/,
    );
    expect(appSource).toContain('disabled={!agentAvailable}');
  });

  it('明确说明 AI 是可选步骤且可能修改当前项目文件', () => {
    expect(appSource).toContain('基础游戏完成后可选择让 AI 继续修改');
    expect(appSource).toContain('AI 可能修改当前项目文件');
  });
});

function getMergeProjectUpdate(): MergeProjectUpdate {
  const candidate = (appModule as unknown as Record<string, unknown>)[
    'mergeProjectUpdate'
  ];
  if (typeof candidate !== 'function') {
    throw new Error(
      'App.mergeProjectUpdate 尚未实现；这是 T019 前的预期失败。',
    );
  }
  return candidate as MergeProjectUpdate;
}

function getCanStartAgent(): CanStartAgent {
  const candidate = (appModule as unknown as Record<string, unknown>)[
    'canStartAgent'
  ];
  if (typeof candidate !== 'function') {
    throw new Error('App.canStartAgent 尚未实现；这是 T036 前的预期失败。');
  }
  return candidate as CanStartAgent;
}
