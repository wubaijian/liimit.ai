# Tasks

## Phase 1 Setup

- [x] T001 建立 specs/031-ai-foundation 规格、计划和契约。

## Phase 2 Foundation

- [x] T002 在 packages/desktop/test/aiFoundation.test.ts 建立新起点及完成门槛回归测试。

## Phase 3 US1

- [x] T003 [US1] 在 shared/types.ts、main/projectManager.ts、main/fixedProjectProvisioner.ts 和 agent-test/templates/variants/ai-foundation 实现独立起点（FR-001、002、004）。
- [x] T004 [US1] 在模板 VisualLevelScene.ts 和 visualStyle.json 增加中性渲染及自有素材入口；NewProjectDialog.tsx、App.tsx 文案区分（FR-002、003）。
- [x] T005 [US1] 在 core/tools/game-type-classifier.ts 与 desktop/main/agentRunner.ts 防止再次补入示例；增加核心工具测试（FR-004）。

## Phase 4 US2

- [x] T006 [US2] 在 main/foundationValidation.ts、agentRunner.ts 添加关卡完成门槛；prompts/custom.md 与基础指南限制测试绕路（FR-005、006）。

## Phase 5 Validation

- [x] T007 完成聚焦和完整验证、真实基础项目构建、安装包和 UI 验证，记录 specs/031-ai-foundation/quickstart.md（SC-001～003）。

## Dependencies / Strategy

T001→T002→T003→T004→T005→T006→T007。US1 新项目起点与 US2 完成门槛分别验收；文案和独立测试可并行审阅，本次顺序实施。
