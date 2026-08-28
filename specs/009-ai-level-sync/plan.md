# Implementation Plan: AI 关卡修改同步

**Branch**: `codex/platformer-only-baseline` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

## Summary

将“编辑器拥有关卡数据”改为“编辑器和 AI 共享受控关卡数据”：AI 对已支持关卡物体的局部调整直接更新关卡集，保留其他关卡与固定运行文件。复用现有关卡解析校验、Renderer 刷新令牌和预览服务。

## Technical Context

**Language/Version**: TypeScript strict mode, Node.js 20+

**Primary Dependencies**: Electron, React, Phaser 3, Vitest

**Storage**: 用户项目中的 `src/levels.json`

**Testing**: Vitest 契约测试、类型检查、构建、真实 Electron UI 验收

**Target Platform**: macOS Electron desktop，保留 Windows 兼容路径

**Project Type**: npm workspaces desktop application + Agent runtime

**Performance Goals**: AI 写入关卡文件后 5 秒内在画布可见

**Constraints**: Renderer 不直接读写文件；不改固定 Phaser 入口；不修改兼容用 `src/level.json`；自动试玩不隐藏 AI 物体

**Scale/Scope**: 8 种现有关卡物体、多关卡集合、已有和新建项目

## Constitution Check

### 设计前

- **产品事实**: 只包含现有编辑器已支持的物体。通过。
- **信任边界**: Renderer 继续通过 Preload/IPC 重读关卡。通过。
- **本地优先**: 只修改用户已放入 Agent 范围的项目。通过。
- **可观察可恢复**: 保留工具记录、停止和会话恢复。通过。
- **兼容性**: 不改数据格式，旧项目可原地使用。通过。
- **验证**: 覆盖提示契约、刷新逻辑和真实 UI。通过。

### 设计后

数据契约不变，没有新增 IPC 或凭据边界；提示规则与刷新逻辑都有契约测试。全部通过，无例外。

## Project Structure

```text
agent-test/prompts/custom.md
agent-test/docs/modules/platformer/{platformer.md,template_api.md}
packages/desktop/src/renderer/{App.tsx,components/Inspector.tsx}
packages/desktop/test/{visualLevelPreviewTemplate.test.ts,prompt-contract.test.ts}
specs/009-ai-level-sync/
```

**Structure Decision**: 只修改已有 Agent 提示契约、玩法文档、桌面刷新与对应测试，不新增文件系统或 IPC。

## Complexity Tracking

无宪章例外。
