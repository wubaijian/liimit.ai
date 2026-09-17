# Implementation Plan: 多游戏类型界面预览

**Branch**: `011-v3-ui-preview` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

## Summary

在现有 liimit.ai 桌面工作台中增加第三版多游戏类型的界面预览：扩展新建项目窗口，让用户看见 Phaser 横版平台跳跃与 Godot 俯视角迷宫两条产品方向；保留 Phaser 的真实创建链路；为 Godot 路径增加完全位于渲染层内存中的工作台、AI、试玩、验证和导出示意界面。预览不得调用 Preload、IPC、文件、Agent、构建或外部程序，并在所有关键位置明确标注“界面预览，尚未接入”。

## Technical Context

**Language/Version**: TypeScript 5.8, ES Modules, Node.js 20+

**Primary Dependencies**: React 19, Electron 43, lucide-react, existing renderer design system

**Storage**: No new storage; the Godot preview uses component-local in-memory state only

**Testing**: Vitest, React server rendering/source contracts, desktop TypeScript checks, Vite/Electron build

**Target Platform**: liimit.ai desktop renderer on macOS and Windows

**Project Type**: Electron desktop application; renderer-only feature

**Performance Goals**: Preview opens immediately after submit and local panel/selection changes are visually reflected within one animation frame

**Constraints**: No new IPC, no ProjectRecord changes, no filesystem side effects, no Godot dependency, no Agent call, no remote content, existing Phaser behavior unchanged

**Scale/Scope**: One expanded creation dialog, one full-screen maze preview, five planned workflow panels, up to eight local example levels, desktop responsive states

## Constitution Check

_GATE: Passed before research and re-checked after design._

- **Brand/product truth**: Pass. All new product copy uses liimit.ai and labels Godot as an unimplemented UI preview rather than a delivered engine integration.
- **Desktop trust boundary**: Pass. The preview is renderer-local and adds no Node access, Preload API, IPC handler, WebView, remote navigation, or privileged operation.
- **Local-first/side effects**: Pass. No real Godot project, folder, export or saved record is created; the real Phaser creation path remains explicit.
- **Observable/recoverable Agent execution**: Pass. No Agent execution is added. The AI panel presents only user-visible workflow states and does not expose hidden reasoning.
- **Credentials/plugins**: Pass. API settings and credentials are not read or changed; the preview states that AI is not connected.
- **Compatibility/migration**: Pass. `ProjectRecord`, `ProductModeId`, persistent settings, project files, app identity and existing IPC contracts are unchanged.
- **Evidence gate**: Renderer contract tests, desktop TypeScript checks, focused tests, production build and a visual desktop walkthrough are required.

**Post-design check**: Pass. The design isolates future-product state in `GodotMazePreview`, passes only a plain local preview input from `NewProjectDialog`, and preserves the current Renderer → Preload → IPC path for Phaser without extending it.

## Project Structure

```text
specs/011-v3-ui-preview/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-preview.md
└── tasks.md

packages/desktop/
├── src/renderer/App.tsx
├── src/renderer/components/NewProjectDialog.tsx
├── src/renderer/components/ProjectRail.tsx
├── src/renderer/components/GodotMazePreview.tsx
├── src/renderer/styles.css
└── test/v3UiPreview.test.tsx
```

**Structure Decision**: Keep every new state and interaction inside renderer components. `App.tsx` owns only whether the preview is open; `NewProjectDialog` selects the path; `GodotMazePreview.tsx` owns disposable example levels, selections and panels. No shared persistent type or privileged layer changes are permitted.

## Complexity Tracking

No constitution violations require exceptions.
