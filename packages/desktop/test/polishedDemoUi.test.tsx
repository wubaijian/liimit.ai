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
const mazeWorkspace = readFileSync(
  new URL('../src/renderer/components/GodotMazePreview.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);

const visibleProductSource = `${app}\n${newProjectDialog}\n${mazeWorkspace}`;

describe('正式化演示界面', () => {
  it('首页和新建窗口使用正常产品文案', () => {
    expect(app).toContain('PHASER 3 · GODOT');
    expect(app).toContain('选择适合的游戏类型');
    expect(newProjectDialog).toContain('系统会自动匹配对应的制作工具');
    expect(newProjectDialog).toContain('进入迷宫编辑器');
    expect(app).not.toContain('演示模式');
    expect(newProjectDialog).not.toContain('<Eye size={12} /> 演示模式');
    expect(mazeWorkspace).not.toContain(
      '<span className="is-demo">演示模式</span>',
    );
  });

  it('迷宫工作台和功能面板使用正常操作语气', () => {
    for (const copy of [
      'GODOT MAZE EDITOR',
      '项目操作',
      '关卡操作',
      '保存项目',
      '开始试玩',
      '自动验证结果',
      'AI 修改助手',
      '导出交付文件',
      '示例数据',
    ]) {
      expect(mazeWorkspace).toContain(copy);
    }
  });

  it('去掉常驻的半成品和开发状态文案', () => {
    for (const forbiddenCopy of [
      '界面预览',
      '尚未接入',
      '当前只做 UI',
      '界面样稿',
      '仅展示',
      '界面占位',
      '将在后续接入',
      '本轮不会',
      '不会执行真实操作',
      '计划状态',
      '计划交付物',
      '（预览）',
      'UI PREVIEW',
    ]) {
      expect(visibleProductSource).not.toContain(forbiddenCopy);
    }
    expect(mazeWorkspace).not.toContain('maze-preview-disclosure');
    expect(mazeWorkspace).not.toContain('maze-workflow-boundary');
  });

  it('默认不显示提示，结果操作后只显示一条演示消息', () => {
    expect(mazeWorkspace).toContain('useState<string | null>(null)');
    expect(mazeWorkspace).toContain(
      '演示模式：本次操作仅用于体验，不会写入真实项目数据。',
    );
    expect(mazeWorkspace).toMatch(/\{notice \? \([\s\S]*maze-preview-notice/);
    expect(styles).toMatch(/\.maze-preview-notice\s*\{[^}]*position:\s*fixed/s);
  });

  it('保留无副作用边界和真实 Phaser 创建路径', () => {
    expect(mazeWorkspace).not.toContain('window.gameAgent');
    expect(newProjectDialog).toContain('await onCreate({');
    expect(newProjectDialog).toContain('onPreviewGodot({');
    expect(newProjectDialog).toContain("if (gameType === 'maze')");
  });
});
