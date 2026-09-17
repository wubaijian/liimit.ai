# Implementation Plan: 正式化演示界面

**Branch**: `012-polished-demo-ui` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

## Summary

将第三版 Godot 迷宫 UI 从“开发说明稿”收敛为可直接展示的正式产品界面：首页、新建窗口、工作台和五个功能面板使用正常产品文案；每个 Godot 页面最多保留一个弱化的“演示模式”标识；不执行真实操作的结果型按钮只在点击后显示一条不写入真实项目的轻提示。所有变更仅限渲染层，真实 Phaser 创建链路与特权边界保持不变。

## Technical Context

**Language/Version**: TypeScript 5.8, ES Modules, Node.js 20+

**Primary Dependencies**: React 19, Electron 43, lucide-react, existing renderer design system

**Storage**: No new storage; demo state and feedback remain component-local and in memory

**Testing**: Vitest source/render contracts, desktop TypeScript checks, Vite/Electron build, existing Phaser golden-path smoke

**Target Platform**: liimit.ai desktop renderer on macOS and Windows

**Project Type**: Electron desktop application; renderer-only copy and visual polish

**Performance Goals**: Copy/selection/panel changes render within one animation frame; contextual feedback appears immediately and does not stack

**Constraints**: No new IPC, no ProjectRecord changes, no filesystem side effects, no Godot dependency, no Agent call, no remote content, existing Phaser behavior unchanged

**Scale/Scope**: One home state, one creation dialog, one maze workbench, five workflow panels, one shared contextual-notice pattern

## Constitution Check

_GATE: Passed before research and re-checked after design._

- **Product truth**: Pass. Repetitive development copy is removed, but each Godot screen retains one understated demo marker and every result-type no-op discloses that it does not write real data.
- **Desktop trust boundary**: Pass. All changes remain in existing Renderer components and CSS; no Node, Preload, IPC, WebView, navigation or credential access is added.
- **Local-first/side effects**: Pass. The maze route still creates no project record, directory, file, export, Agent task or Godot process.
- **Agent observability**: Pass. The AI panel keeps visible workflow states and user confirmation, exposes no hidden reasoning and starts no Agent.
- **Credentials/plugins**: Pass. API settings, secrets, Skills and MCP configuration are untouched.
- **Compatibility/migration**: Pass. Shared types, IPC, persistent state, app identity and existing project data are unchanged, so no migration is required.
- **Evidence gate**: Focused UI contracts, desktop TypeScript checks, full desktop tests, production build, real desktop walkthrough and Phaser playable smoke are required.

**Post-design check**: Pass. The only new runtime state is a renderer-local contextual notice. Normalizing copy does not broaden capabilities or cross a privileged boundary.

## Project Structure

```text
specs/012-polished-demo-ui/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── demo-presentation.md
└── tasks.md

packages/desktop/
├── src/renderer/App.tsx
├── src/renderer/components/NewProjectDialog.tsx
├── src/renderer/components/GodotMazePreview.tsx
├── src/renderer/styles.css
└── test/
    ├── v3UiPreview.test.tsx
    ├── polishedDemoUi.test.tsx
    └── platformer-mode-contract.test.ts
```

**Structure Decision**: Reuse the current V3 renderer components and keep internal preview-oriented class/component names when they are not user-visible. Change only visible copy, local feedback behavior and styles needed to remove permanent warning blocks. This avoids a cosmetic rename expanding into a risky refactor.

## Complexity Tracking

No constitution violations require exceptions.
