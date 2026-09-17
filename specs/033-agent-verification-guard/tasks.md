# Tasks: Agent Verification Guard

## Phase 1: Setup

- [x] T001 定义 specs/033-agent-verification-guard 规格、计划及契约。

## Phase 2: Foundation

- [x] T002 在 packages/desktop/test/agentVerificationGuard.test.ts 编写 Guard 与流程契约测试（FR-001、003、004）。

## Phase 3: US1 正确验证

- [x] T003 [US1] 在 packages/desktop/src/main/agentVerificationGuard.ts 定义统一规则，并接入 projectManager.ts、agentRunner.ts 启动/恢复（FR-001）。
- [x] T004 [US1] 在 packages/desktop/test/projectManager.test.ts 增加正式数据接口回归，修改 src/main/projectManager.ts 验证逻辑（FR-002）。

## Phase 4: US2 止损

- [x] T005 [US2] 在 packages/desktop/src/main/agentVerificationGuard.ts 实现计数、去重和预算；在 test/agentRunner.test.ts 加假运行时回归（FR-003～006）。
- [x] T006 [US2] 在 packages/desktop/src/main/agentRunner.ts 接入错误提示、终止、等待状态和完成守卫（FR-003～005）。

## Phase 5: Validation

- [x] T007 执行桌面测试/类型/构建/打包，安全更新应用并在 specs/033-agent-verification-guard/quickstart.md 记录边界（FR-006、SC-001～003）。

## Dependencies & Strategy

T001→T002→T003→T004→T005→T006→T007。US1先统一流程再US2硬性止损。Guard单测与预览测试可并行运行；本次顺序实现、不委派。每项均本地验证，不启动真实模型。
