# Tasks: AI creation

## Phase 1 Setup

- [x] T001 建立 specs/030-ai-create-flow 规格、计划、契约与验证说明。

## Phase 2 Foundation

- [x] T002 在 packages/desktop/test/initialGeneration.test.ts、store.test.ts 增加契约、协调及兼容测试（FR-001、005、006）。

## Phase 3 US1

- [x] T003 [US1] 在 shared/types.ts、main/projectManager.ts、main/initialGenerationService.ts、main/main.ts 实现模式传递与一次性启动；renderer/components/NewProjectDialog.tsx 提交正确模式（FR-001、002）。
- [x] T004 [US1] 在 main/agentRunner.ts、agent-test/prompts/custom.md 区分首次创建授权、实际变化验证和后续确认（FR-003、004）。

## Phase 4 US2

- [x] T005 [US2] 在 main/store.ts、main/starterPreparationService.ts、main/initialGenerationService.ts 实现中断、取消、互斥和手动重试（FR-005、006）。
- [x] T006 [US2] 在 renderer/App.tsx、renderer/components/ProjectRail.tsx 展示真实状态和重试入口（FR-004、005）。

## Phase 5 Validation

- [x] T007 完成测试、类型、构建、打包和原生界面检查，记录 specs/030-ai-create-flow/quickstart.md（SC-001～003）。

## Dependencies and strategy

T001→T002→T003→T004→T005→T006→T007。US1 先闭环，US2 补故障安全；协调测试与 UI 展示可独立审阅，本次顺序执行。无外部付费请求。
