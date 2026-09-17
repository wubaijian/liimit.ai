import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(
  new URL('../src/renderer/App.tsx', import.meta.url),
  'utf8',
);
const newProjectDialog = readFileSync(
  new URL('../src/renderer/components/NewProjectDialog.tsx', import.meta.url),
  'utf8',
);
const projectRail = readFileSync(
  new URL('../src/renderer/components/ProjectRail.tsx', import.meta.url),
  'utf8',
);
const mazePreview = readFileSync(
  new URL('../src/renderer/components/GodotMazePreview.tsx', import.meta.url),
  'utf8',
);
const sharedTypes = readFileSync(
  new URL('../src/shared/types.ts', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);

describe('第三版多游戏类型工作台', () => {
  it('让新建入口区分 Phaser 和 Godot 游戏方向', () => {
    expect(newProjectDialog).toContain('横版平台跳跃');
    expect(newProjectDialog).toContain('Phaser 3');
    expect(newProjectDialog).toContain('俯视角迷宫');
    expect(newProjectDialog).toContain('Godot');
    expect(newProjectDialog).not.toContain('<Eye size={12} /> 演示模式');
    expect(newProjectDialog).toContain('固定模板');
    expect(newProjectDialog).toContain('AI 生成');
  });

  it('保留唯一真实项目契约，把迷宫演示留在 Renderer 内存中', () => {
    expect(sharedTypes).toContain("id: 'phaser-platformer-web'");
    expect(sharedTypes).not.toMatch(/godot-maze|GodotMazePreviewInput/);
    expect(app).toContain('<GodotMazePreview');
    expect(app).toContain('onPreviewGodot');
    expect(newProjectDialog).toContain("gameType === 'maze'");
    expect(newProjectDialog).toContain('onPreviewGodot');
    expect(mazePreview).not.toContain('window.gameAgent');
  });

  it('为现有真实项目继续显示 Phaser 横版标识', () => {
    expect(projectRail).toContain('PHASER 3 · 横版跳跃');
    expect(app).toContain('PHASER 3 · 横版跳跃');
    expect(projectRail).not.toContain('<time>');
    expect(projectRail).not.toContain('formatRelative');
  });

  it('迷宫工作台包含全部主要编辑区域', () => {
    for (const label of [
      '关卡管理',
      '物体工具',
      '迷宫画布',
      '属性设置',
      '玩家出生点',
      '墙壁',
      '障碍',
      '钥匙',
      '门',
      '敌人',
      '出口',
      '装饰物',
      '最多 8 关',
    ]) {
      expect(mazePreview).toContain(label);
    }
    expect(styles).toContain('.maze-preview-workspace');
    expect(styles).toContain('.maze-editor-layout');
  });

  it('展示 AI、试玩、验证和导出完整状态', () => {
    for (const label of [
      'AI 助手',
      'Web 试玩',
      '自动验证',
      '保存',
      '导出',
      '等待指令',
      '分析中',
      '待用户确认',
      '执行中',
      '验证中',
      '已完成',
      '失败',
      '已停止',
      '演示模式：本次操作仅用于体验',
    ]) {
      expect(mazePreview).toContain(label);
    }
  });

  it('在较小桌面窗口提供可访问的滚动和换行边界', () => {
    expect(styles).toMatch(
      /\.maze-preview-workspace\s*\{[^}]*overflow:\s*hidden/s,
    );
    expect(styles).toMatch(
      /\.maze-preview-toolbar\s*\{[^}]*flex-wrap:\s*wrap/s,
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*1159px\)[\s\S]*\.maze-editor-layout/s,
    );
  });
});
