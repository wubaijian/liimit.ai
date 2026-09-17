import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  LEVEL_OBJECT_TYPES,
  createDefaultLevelDocument,
} from '../src/shared/levelDocument.js';
import { PlaytestSummary } from '../src/renderer/components/Inspector.js';
import { LevelCanvas } from '../src/renderer/components/LevelViewer.js';
import { createEmptyPlaytestReport } from '../src/renderer/playtestTelemetry.js';

const mainSource = readFileSync(
  new URL('../src/main/main.ts', import.meta.url),
  'utf8',
);
const preloadSource = readFileSync(
  new URL('../src/main/preload.cts', import.meta.url),
  'utf8',
);
const sharedTypes = readFileSync(
  new URL('../src/shared/types.ts', import.meta.url),
  'utf8',
);
const inspectorSource = readFileSync(
  new URL('../src/renderer/components/Inspector.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);
const playtestTelemetrySource = readFileSync(
  new URL('../src/renderer/playtestTelemetry.ts', import.meta.url),
  'utf8',
);

describe('只读关卡画布', () => {
  it('通过受信主进程读写已存在项目的固定关卡文件', () => {
    expect(mainSource).toContain("secureHandle('project:read-level'");
    expect(mainSource).toContain('levelDocuments.read(');
    expect(mainSource).toContain('getProject(requireString(projectId');
    expect(preloadSource).toContain('loadLevel: (projectId: string) =>');
    expect(preloadSource).toContain("invoke('project:read-level', projectId)");
    expect(sharedTypes).toContain(
      'loadLevel(projectId: string): Promise<LevelDocument>',
    );
    expect(mainSource).toContain("secureHandle('project:save-level'");
    expect(mainSource).toContain('levelDocuments.save(');
    expect(mainSource).toContain('getProject(requireString(projectId');
    expect(preloadSource).toContain(
      'saveLevel: (projectId: string, level: LevelDocument) =>',
    );
    expect(preloadSource).toContain(
      "invoke('project:save-level', projectId, level)",
    );
    expect(sharedTypes).toContain(
      'saveLevel(projectId: string, level: LevelDocument): Promise<LevelDocument>',
    );
  });

  it('默认基础物体、移动平台和可选坑洞都会被绘制', () => {
    const level = createDefaultLevelDocument();
    level.objects.push({
      id: 'moving-platform-1',
      type: 'moving-platform',
      x: 320,
      y: 480,
      width: 128,
      height: 32,
    });
    level.objects.push({
      id: 'pit-1',
      type: 'pit',
      x: 1_152,
      y: 656,
      width: 96,
      height: 64,
    });
    level.objects.push({
      id: 'checkpoint-1',
      type: 'checkpoint',
      x: 384,
      y: 592,
      width: 32,
      height: 64,
    });
    level.objects.push({
      id: 'slime-1',
      type: 'slime',
      x: 512,
      y: 624,
      width: 48,
      height: 32,
    });
    level.objects.push({
      id: 'bee-1',
      type: 'bee',
      x: 768,
      y: 416,
      width: 48,
      height: 48,
    });
    level.objects.push({
      id: 'keycard-1',
      type: 'keycard',
      x: 896,
      y: 512,
      width: 48,
      height: 32,
    });
    level.objects.push({
      id: 'security-door-1',
      type: 'security-door',
      x: 1_280,
      y: 336,
      width: 64,
      height: 320,
    });
    level.objects.push({
      id: 'floor-switch-1',
      type: 'floor-switch',
      x: 1_440,
      y: 636,
      width: 160,
      height: 20,
    });
    level.objects.push({
      id: 'laser-gate-1',
      type: 'laser-gate',
      x: 1_760,
      y: 240,
      width: 64,
      height: 416,
    });
    const markup = renderToStaticMarkup(<LevelCanvas level={level} />);

    for (const type of LEVEL_OBJECT_TYPES) {
      expect(markup).toContain(`data-object-type="${type}"`);
    }
    expect(markup).toContain('只读关卡画布');
    expect(markup).toContain('坑洞');
    expect(markup).toContain('检查点');
    expect(markup).toContain('蓝色门卡');
    expect(markup).toContain('安全门');
    expect(markup).toContain('控制开关');
    expect(markup).toContain('激光门');
    expect(markup).toContain('↔');
    expect(markup).not.toContain('draggable');
  });

  it('关卡默认开放新增平台金币尖刺、复制、删除、平台尺寸和位置编辑', () => {
    expect(inspectorSource).toContain("useState<InspectorTab>('level')");
    expect(inspectorSource).toContain('<LevelViewer');
    const viewerSource = readFileSync(
      new URL('../src/renderer/components/LevelViewer.tsx', import.meta.url),
      'utf8',
    );
    expect(viewerSource).toContain('位置编辑');
    expect(viewerSource).toContain('新增平台');
    expect(viewerSource).toContain('addPlatformToLevel');
    expect(viewerSource).toContain('新增移动平台');
    expect(viewerSource).toContain('addMovingPlatformToLevel');
    expect(viewerSource).toContain('移动平台设置');
    expect(viewerSource).toContain('左右移动');
    expect(viewerSource).toContain('上下移动');
    expect(viewerSource).toContain('移动距离');
    expect(viewerSource).toContain('移动速度');
    expect(viewerSource).toContain('updateMovingPlatformMovement');
    expect(viewerSource).toContain("object.movement?.axis === 'vertical'");
    expect(viewerSource).toContain('新增金币');
    expect(viewerSource).toContain('addCoinToLevel');
    expect(viewerSource).toContain('新增检查点');
    expect(viewerSource).toContain('addCheckpointToLevel');
    expect(viewerSource).toContain('新增尖刺');
    expect(viewerSource).toContain('新增史莱姆');
    expect(viewerSource).toContain('新增蜜蜂');
    expect(viewerSource).toContain('addEnemyToLevel');
    expect(viewerSource).toContain('addSpikeToLevel');
    expect(viewerSource).toContain('新增坑洞');
    expect(viewerSource).toContain('addPitToLevel');
    expect(viewerSource).toContain('删除当前选中的物体');
    expect(viewerSource).toContain('getLevelObjectDeletionBlockReason');
    expect(viewerSource).toContain('复制当前选中的物体');
    expect(viewerSource).toContain('getLevelObjectCopyBlockReason');
    expect(viewerSource).toContain('`把${widthTargetLabel}缩短一个网格`');
    expect(viewerSource).toContain('`把${widthTargetLabel}加宽一个网格`');
    expect(viewerSource).toContain('getPlatformWidthResizeBlockReason');
    expect(viewerSource).toContain('`把${heightTargetLabel}变矮一个网格`');
    expect(viewerSource).toContain('`把${heightTargetLabel}变高一个网格`');
    expect(viewerSource).toContain('getPlatformHeightResizeBlockReason');
    expect(viewerSource).toContain('resizePlatformHeight');
    expect(viewerSource).toContain('label: `${label}${');
    expect(viewerSource).toContain('把金币或尖刺缩小一个网格');
    expect(viewerSource).toContain('把金币或尖刺放大一个网格');
    expect(viewerSource).toContain('getCoinOrSpikeResizeBlockReason');
    expect(viewerSource).toContain('resizeCoinOrSpike');
    expect(viewerSource).toContain('persistLevelObjectResize');
    expect(viewerSource).toContain('撤销：${undoEntry.label}');
    expect(viewerSource).toContain('persistLevelUndo');
    expect(viewerSource).toContain("label: '新增平台'");
    expect(viewerSource).toContain("label: '新增移动平台'");
    expect(viewerSource).toContain("label: '新增金币'");
    expect(viewerSource).toContain("label: '新增检查点'");
    expect(viewerSource).toContain("label: '新增尖刺'");
    expect(viewerSource).toContain('label: `移动');
    expect(viewerSource).toContain('label: `删除');
    expect(viewerSource).toContain('label: `复制');
    expect(viewerSource).toContain('setUndoEntry(undefined)');
    expect(viewerSource).toContain('onObjectPointerDown={beginDrag}');
    expect(viewerSource).not.toContain('新增物体');
    expect(viewerSource).not.toContain('onResize');
    expect(viewerSource).not.toContain('onDrag');
  });

  it('支持切换、新增和复制多个关卡', () => {
    const viewerSource = readFileSync(
      new URL('../src/renderer/components/LevelViewer.tsx', import.meta.url),
      'utf8',
    );

    expect(viewerSource).toContain('loadLevelCampaign(project.id)');
    expect(viewerSource).toContain('saveCampaignLevel(');
    expect(viewerSource).toContain('新增关卡');
    expect(viewerSource).toContain('复制当前关');
    expect(viewerSource).toContain('selectLevel(item.id)');
  });

  it('每一关可以单独设置速度、跳跃和二连跳', () => {
    const viewerSource = readFileSync(
      new URL('../src/renderer/components/LevelViewer.tsx', import.meta.url),
      'utf8',
    );

    expect(viewerSource).toContain('本关角色能力');
    expect(viewerSource).toContain('只影响当前这一关');
    expect(viewerSource).toContain('移动速度');
    expect(viewerSource).toContain('第一次跳跃');
    expect(viewerSource).toContain('开启二连跳');
    expect(viewerSource).toContain('第二次跳跃');
    expect(viewerSource).toContain('saveLevelAbilities(');
  });

  it('画布自身承担滚动，只在编辑模式接受物体指针操作', () => {
    expect(rule('.level-toolbar')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.level-toolbar-actions')).toMatch(
      /justify-content:\s*flex-end/,
    );
    expect(rule('.level-toolbar-actions')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.level-toolbar-actions')).toMatch(/max-width:\s*100%/);
    expect(rule('.level-canvas-scroll')).toMatch(/overflow-x:\s*auto/);
    expect(rule('.level-canvas-scroll')).toMatch(
      /overscroll-behavior:\s*contain/,
    );
    expect(rule('.level-canvas.is-readonly .level-object')).toMatch(
      /pointer-events:\s*none/,
    );
    expect(rule('.level-canvas.is-interactive .level-object')).toMatch(
      /pointer-events:\s*all/,
    );
    expect(rule('.level-canvas.is-interactive')).toMatch(
      /touch-action:\s*none/,
    );
  });

  it('Web 试玩只接收当前 iframe 的固定消息并显示人工试玩记录', () => {
    expect(inspectorSource).toContain('从第几关开始试玩');
    expect(inspectorSource).toContain('liimitStartLevel');
    expect(inspectorSource).toContain('preferredLevelId={previewStartLevelId}');
    expect(inspectorSource).toContain(
      'onActiveLevelChange={setPreviewStartLevelId}',
    );
    expect(inspectorSource).toContain('event.origin !== previewOrigin');
    expect(inspectorSource).toContain(
      'event.source !== previewFrameRef.current?.contentWindow',
    );
    expect(inspectorSource).toContain('parsePlaytestMessage(event.data)');
    expect(inspectorSource).toContain('createPlaytestControlMessage(command)');
    expect(inspectorSource).toContain('new URL(previewUrl).origin');
    expect(inspectorSource).toContain('previousProjectStatusRef');
    expect(inspectorSource).toContain("previousStatus === 'running'");
    expect(inspectorSource).toContain("searchParams.set('liimitRefresh'");
    expect(inspectorSource).toContain(
      'setPreviewUrl(refreshedPreviewUrl.toString())',
    );
    expect(inspectorSource).toContain('isFailedPlaytestEvaluation');
    expect(inspectorSource).toContain('getPlaytestEvaluationDelay(');
    expect(inspectorSource).toContain('evaluatePlaytestResult(previous');
    expect(inspectorSource).toContain("sendPlaytestControl('stop')");
    expect(inspectorSource).toContain('.loadLevelCampaign(project.id)');
    expect(inspectorSource).toContain('createPlaytestSuggestions(');
    expect(inspectorSource).toContain('if (cancelled) return');
    expect(inspectorSource).toContain('试玩记录与自动控制');
    expect(inspectorSource).toContain('自动试玩判断：');
    expect(inspectorSource).toContain('最远位置');
    expect(inspectorSource).toContain('最后碰到');
    expect(inspectorSource).toContain(
      'setPlaytestReport(createEmptyPlaytestReport())',
    );
    expect(playtestTelemetrySource).toContain(
      "export const PLAYTEST_MESSAGE_SOURCE = 'liimit.ai'",
    );
    expect(rule('.playtest-metrics')).toMatch(
      /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
    );

    const markup = renderToStaticMarkup(
      <PlaytestSummary
        report={{
          ...createEmptyPlaytestReport(),
          status: 'completed',
          attempts: 2,
          lastX: 2_240,
          lastY: 560,
          farthestX: 2_240,
          jumps: 7,
          collectedCoinIds: ['coin-1'],
          totalCoins: 2,
          deaths: 1,
          lastHazardId: 'spike-1',
          startedAt: 1_000,
          updatedAt: 3_500,
        }}
      />,
    );
    expect(markup).toContain('已完成全部关卡');
    expect(markup).toContain('2.5s');
    expect(markup).toContain('X 2240');
    expect(markup).toContain('spike-1');
    expect(markup).toContain('开始自动试玩');
    expect(markup).toContain('停止');
    expect(markup).toContain('机器人：等待');
    expect(markup).toContain('自动试玩判断：尚未开始');
    expect(rule('.playtest-controls')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.playtest-evaluation')).toMatch(/border-left:\s*3px/);

    const deleteSuggestion = {
      id: 'delete-spike-2',
      title: '移除反复导致死亡的尖刺',
      target: '尖刺 spike-2',
      currentValue: 'X 640，Y 624，宽 32，高 32',
      suggestedValue: '删除这个尖刺',
      reason: '机器人已经在这里死亡 3 次。',
      impact: '这一处会明显变简单。',
      change: {
        kind: 'delete' as const,
        objectId: 'spike-2',
        expected: {
          id: 'spike-2',
          type: 'spike' as const,
          x: 640,
          y: 624,
          width: 32,
          height: 32,
        },
      },
    };
    const failureReport = {
      ...createEmptyPlaytestReport(),
      evaluationStatus: 'repeated-death' as const,
      automationDeaths: 3,
      lastHazardId: 'spike-2',
    };
    const failureMarkup = renderToStaticMarkup(
      <PlaytestSummary
        report={failureReport}
        suggestions={[deleteSuggestion]}
      />,
    );
    expect(failureMarkup).toContain('自动试玩判断：反复死亡');
    expect(failureMarkup).toContain('死亡 3 次');
    expect(failureMarkup).toContain('spike-2');
    expect(failureMarkup).toContain('具体修改建议');
    expect(failureMarkup).toContain('仅建议，尚未修改关卡');
    expect(failureMarkup).toContain('当前值');
    expect(failureMarkup).toContain('建议值');
    expect(failureMarkup).toContain('可能影响');
    expect(failureMarkup).toContain('删除这个尖刺');
    expect(failureMarkup).toContain('采用这个建议');
    expect(failureMarkup).not.toContain('确认修改');
    expect(rule('.playtest-summary')).toMatch(/overflow-y:\s*auto/);

    const confirmationMarkup = renderToStaticMarkup(
      <PlaytestSummary
        report={failureReport}
        suggestions={[deleteSuggestion]}
        pendingSuggestionId="delete-spike-2"
      />,
    );
    expect(confirmationMarkup).toContain('确认后会修改并保存当前关卡');
    expect(confirmationMarkup).toContain('确认修改');
    expect(confirmationMarkup).toContain('取消');

    const savedMarkup = renderToStaticMarkup(
      <PlaytestSummary
        report={failureReport}
        suggestions={[deleteSuggestion]}
        appliedSuggestionId="delete-spike-2"
      />,
    );
    expect(savedMarkup).toContain('已按你的确认修改');
    expect(savedMarkup).toContain('修改已保存，但尚未重新试玩');
    expect(inspectorSource).toContain('persistPlaytestSuggestion(');
    expect(inspectorSource).toContain('.saveLevel(activeProjectId, level)');
    expect(inspectorSource).toContain('projectIdRef.current');
    expect(inspectorSource).toContain("playtestEvent.type === 'started'");
    expect(inspectorSource).toContain('pendingReplayStartRef.current');
    expect(inspectorSource).toContain(
      'pendingReplayUrlRef.current === previewUrl',
    );
    expect(inspectorSource).toContain('replayLoadTimeoutRef.current');
    expect(inspectorSource).toContain('replayAutomationTimeoutRef.current');
    expect(inspectorSource).toContain('awaitingReplayAutomationRef.current');
    expect(inspectorSource).toContain('最新版游戏在 10 秒内没有准备好');
    expect(inspectorSource).toContain('机器人在 10 秒内没有确认开始自动试玩');
    expect(inspectorSource).toContain(
      "replayUrl.searchParams.set('liimitReplay'",
    );
    expect(inspectorSource).toContain("createPlaytestControlMessage('start')");
    expect(
      inspectorSource.match(/createPlaytestControlMessage\('start'\)/g),
    ).toHaveLength(1);
    expect(inspectorSource).toContain(
      "playtestEvent.type === 'automation-state'",
    );
    expect(inspectorSource).toContain('playtestEvent.active');
    expect(inspectorSource).toContain("phase: 'starting'");
    expect(inspectorSource).toContain('createPlaytestResultSnapshot(');
    expect(inspectorSource).toContain('comparePlaytestResults(');
    expect(rule('.suggestion-confirmation')).toMatch(/border-top:\s*1px/);

    const replayStartingMarkup = renderToStaticMarkup(
      <PlaytestSummary
        report={createEmptyPlaytestReport()}
        replayState={{
          phase: 'starting',
          suggestionTitle: '移除尖刺',
          before: {
            evaluationStatus: 'repeated-death',
            automationDeaths: 3,
            farthestDistance: 500,
            elapsedMs: 4_000,
          },
        }}
      />,
    );
    expect(replayStartingMarkup).toContain('最新版关卡已载入');
    expect(replayStartingMarkup).toContain('收到机器人确认后');

    const comparisonMarkup = renderToStaticMarkup(
      <PlaytestSummary
        report={failureReport}
        replayState={{
          phase: 'completed',
          suggestionTitle: '移除反复导致死亡的尖刺',
          before: {
            evaluationStatus: 'repeated-death',
            automationDeaths: 3,
            farthestDistance: 500,
            elapsedMs: 4_000,
          },
          after: {
            evaluationStatus: 'success',
            automationDeaths: 0,
            farthestDistance: 2_000,
            elapsedMs: 8_000,
          },
          comparison: {
            verdict: 'improved',
            reason: '修改后机器人成功到达了终点。',
          },
        }}
      />,
    );
    expect(comparisonMarkup).toContain('修改后复测：有改善');
    expect(comparisonMarkup).toContain('对比项目');
    expect(comparisonMarkup).toContain('反复死亡');
    expect(comparisonMarkup).toContain('成功');
    expect(comparisonMarkup).toContain('500 px');
    expect(comparisonMarkup).toContain('2000 px');
    expect(comparisonMarkup).toContain('4.0s');
    expect(comparisonMarkup).toContain('8.0s');

    const replayErrorMarkup = renderToStaticMarkup(
      <PlaytestSummary
        report={failureReport}
        replayState={{
          phase: 'error',
          suggestionTitle: '移除尖刺',
          before: {
            evaluationStatus: 'repeated-death',
            automationDeaths: 3,
            farthestDistance: 500,
            elapsedMs: 4_000,
          },
          error: '预览启动失败',
        }}
      />,
    );
    expect(replayErrorMarkup).toContain('修改已保存，但复测没有启动');
    expect(replayErrorMarkup).toContain('预览启动失败');
    expect(rule('.playtest-comparison')).toMatch(/border-left:\s*3px/);
  });
});

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  if (!match) throw new Error(`找不到样式规则：${selector}`);
  return match[1] ?? '';
}
