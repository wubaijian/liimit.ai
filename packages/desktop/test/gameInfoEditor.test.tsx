import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
const editorSource = readFileSync(
  new URL('../src/renderer/components/GameInfoEditor.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);

describe('游戏基本信息可视化编辑', () => {
  it('只通过受信主进程读写当前项目的 gameInfo.json', () => {
    expect(mainSource).toContain("secureHandle('project:read-game-info'");
    expect(mainSource).toContain('levelDocuments.readGameInfo(project)');
    expect(mainSource).toContain("'project:save-game-info'");
    expect(mainSource).toContain('levelDocuments.saveGameInfo(project');
    expect(preloadSource).toContain('loadGameInfo: (projectId: string) =>');
    expect(preloadSource).toContain("'project:read-game-info', projectId");
    expect(preloadSource).toContain(
      'saveGameInfo: (projectId: string, gameInfo: GameInfo) =>',
    );
    expect(sharedTypes).toContain(
      'loadGameInfo(projectId: string): Promise<GameInfo>',
    );
    expect(sharedTypes).toContain(
      'saveGameInfo(projectId: string, gameInfo: GameInfo): Promise<GameInfo>',
    );
  });

  it('提供小白可理解的表单和真实玩家首页预览', () => {
    expect(inspectorSource).toContain('游戏信息');
    expect(inspectorSource).toContain('<GameInfoEditor');
    expect(editorSource).toContain('游戏名称');
    expect(editorSource).toContain('一句话简介');
    expect(editorSource).toContain('保存并刷新首页');
    expect(editorSource).toContain('放弃修改');
    expect(editorSource).toContain('这是真实游戏，不是示意图');
    expect(editorSource).toContain(
      "url.searchParams.delete('liimitStartLevel')",
    );
    expect(editorSource).toContain('window.gameAgent.saveGameInfo(');
    expect(editorSource).toContain('window.gameAgent.startPreview(');
    expect(editorSource).toContain('sandbox="allow-scripts allow-same-origin');
    expect(styles).toContain('.game-info-editor');
    expect(styles).toContain('.game-info-preview iframe');
  });
});
