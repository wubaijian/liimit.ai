import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FIXED_PRODUCT_MODE,
  isFixedProductMode,
  type CreateProjectInput,
} from '../src/shared/types.js';

const sharedTypes = readFileSync(
  new URL('../src/shared/types.ts', import.meta.url),
  'utf8',
);
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
const pipeline = readFileSync(
  new URL('../src/renderer/components/Pipeline.tsx', import.meta.url),
  'utf8',
);
const inspector = readFileSync(
  new URL('../src/renderer/components/Inspector.tsx', import.meta.url),
  'utf8',
);
const settingsDialog = readFileSync(
  new URL('../src/renderer/components/SettingsDialog.tsx', import.meta.url),
  'utf8',
);

describe('固定横版平台产品模式契约', () => {
  it('加载所有需要审查的共享契约与 UI 表面', () => {
    for (const source of [
      sharedTypes,
      app,
      newProjectDialog,
      projectRail,
      pipeline,
      inspector,
      settingsDialog,
    ]) {
      expect(source.length).toBeGreaterThan(0);
    }
  });

  it('只定义一个完整且不可由用户切换的产品模式', () => {
    expect(FIXED_PRODUCT_MODE).toEqual({
      id: 'phaser-platformer-web',
      engine: 'Phaser 3',
      dimension: '2D',
      archetype: 'platformer',
      previewTarget: 'embedded-web-browser',
    });

    expect(isFixedProductMode({ productMode: FIXED_PRODUCT_MODE.id })).toBe(
      true,
    );
    expect(isFixedProductMode({})).toBe(false);
    expect(isFixedProductMode({ productMode: 'unknown-mode' })).toBe(false);
    expect(sharedTypes).toMatch(/productMode:\s*ProductModeId;/);
    expect(sharedTypes).not.toMatch(/productMode\?:\s*ProductModeId;/);
  });

  it('制作流水线只有固定横版阶段，不再接收产品模式分派', () => {
    expect(pipeline).toContain("label: '平台模板'");
    expect(pipeline).toContain("detail: 'Phaser 3 · 2D 横版'");
    expect(pipeline).toContain("label: '固定骨架'");
    expect(pipeline).toContain("detail: '加载横版平台模板'");
    expect(pipeline).toContain("label: '横版关卡'");
    expect(pipeline).toContain("detail: '生成平台跳跃 Tilemap'");
    expect(pipeline).not.toMatch(/COMPATIBLE_STAGES|productMode/);
    expect(pipeline).not.toMatch(/类型识别|物理与视角分类|选择稳定模板/);
  });

  it('CreateProjectInput 不向 Renderer 暴露产品模式选择', () => {
    const input: CreateProjectInput = {
      name: '森林跳跃',
      directory: '/tmp/liimit-projects',
      prompt: '在树梢之间横向跳跃',
    };
    expect(input).not.toHaveProperty('productMode');

    const contract = sharedTypes.match(
      /export interface CreateProjectInput\s*\{(?<body>[^}]*)\}/s,
    );
    expect(contract?.groups?.body).toBeDefined();
    expect(contract?.groups?.body).not.toMatch(
      /productMode|engine|archetype|dimension|previewTarget/,
    );
  });

  it('首页和新建弹窗保留真实横版入口，并把 Godot 限定为演示工作台', () => {
    for (const label of [
      'Phaser 3 · 2D',
      '横版平台跳跃',
      '应用内 Web 浏览器试玩',
      '固定平台模板',
    ]) {
      expect(`${app}\n${newProjectDialog}`).toContain(label);
    }
    expect(app).not.toMatch(/5 种游戏架构|4 类生成模型|会选择模板/);
    expect(newProjectDialog).not.toContain('<select');
    expect(newProjectDialog).toContain('俯视角迷宫');
    expect(newProjectDialog).toContain('Godot');
    expect(newProjectDialog).not.toContain('<Eye size={12} /> 演示模式');
    expect(newProjectDialog).not.toMatch(/塔防|卡牌|回合制|3D 游戏/);

    const examples = newProjectDialog.match(
      /const PLATFORMER_EXAMPLES = \[(?<body>[^\]]+)\]/s,
    );
    expect(examples?.groups?.body?.match(/横版/g)).toHaveLength(3);
    expect(newProjectDialog).toContain('onPreviewGodot');
    expect(newProjectDialog).toContain("gameType === 'maze'");
    expect(newProjectDialog).toContain('if (selected) setDirectory(selected);');
    expect(newProjectDialog).toContain(
      '<button type="button" onClick={chooseDirectory}>',
    );
  });

  it('制作区只展示固定模板和应用内 Web 试玩', () => {
    expect(pipeline).toContain("label: '平台模板'");
    expect(pipeline).toContain("detail: 'Phaser 3 · 2D 横版'");
    expect(pipeline).toContain("label: '固定骨架'");
    expect(pipeline).toContain("detail: '加载横版平台模板'");

    expect(inspector).toContain('Web 试玩');
    expect(inspector).toContain('应用内 Web 浏览器');
    expect(inspector).toContain(
      'sandbox="allow-scripts allow-same-origin allow-pointer-lock"',
    );
    expect(inspector).not.toMatch(/Chrome|Safari|系统浏览器/);

    expect(app).not.toMatch(/ExtensionsDialog|showExtensions|onExtensions/);
    expect(projectRail).not.toMatch(/Blocks|onExtensions|插件/);
    expect(settingsDialog).toContain("label: '运行环境'");
    expect(settingsDialog).toContain("description: 'Node.js 与构建工具'");
    expect(settingsDialog).toMatch(
      /const runtimeDependencies =\s*dependencies\?\.filter\(\(item\) => item\.id === 'npx'\);/,
    );
    expect(settingsDialog).toContain('Node.js / npm');
  });

  it('不再按旧项目模式分派 UI，且不删除无关隐藏配置', () => {
    expect(app).toContain('projects={projects}');
    expect(projectRail).toContain('projects.map((project) =>');
    expect(app).not.toContain('projects.filter(');
    expect(app).not.toContain('productMode={selected.productMode}');

    for (const source of [app, projectRail, settingsDialog]) {
      expect(source).not.toMatch(/removeSkill|deleteSkill|uninstallSkill/);
    }
    expect(
      `${app}\n${newProjectDialog}\n${pipeline}\n${inspector}`,
    ).not.toMatch(/可视化拖拽编辑|AI 自动试玩/);
  });
});
