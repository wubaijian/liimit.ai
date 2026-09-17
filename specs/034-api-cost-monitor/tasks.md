# Tasks: API 费用监测

**Input**: spec.md、plan.md。测试为明确要求，仅本地假服务。

## Phase 1: Setup

- [x] T001 确认既有调用边界与宪章，形成 specs/034-api-cost-monitor/spec.md、plan.md。

## Phase 2: Foundational

- [x] T002 在 packages/desktop/src/shared/apiCost.ts 定义费用契约与兼容默认值。

## Phase 3: US1 看懂费用

独立验证：假用量记账，暂停与重启保留，未知不归零。

- [x] T003 [US1] 在 packages/desktop/test/apiCostStore.test.ts 先写计价、恢复和校验测试。
- [x] T004 [US1] 实现 packages/desktop/src/main/apiCostStore.ts 台账与费率快照（FR-001/002/004）。

## Phase 4: US2 预算保护

独立验证：上游收到的请求数证明预算、连续失败、次数和取消拦截。

- [x] T005 [US2] 在 packages/desktop/test/apiCostGateway.test.ts 先写假HTTP和流式测试。
- [x] T006 [US2] 实现 packages/desktop/src/main/apiCostGateway.ts 串行请求门控与失败关闭（FR-001/003/004/006）。
- [x] T007 [US2] 在 packages/desktop/src/main/agentRunner.ts 接入创建、停止、结束与安全凭据转发（FR-004）。

## Phase 5: US3 设置与呈现

独立验证：静态面板、无凭据IPC、音效取消和重复确认。

- [x] T008 [US3] 在 packages/desktop/src/main/main.ts、preload.cts、shared/types.ts 接入可信IPC、音效试听与素材确认（FR-006/007）。
- [x] T009 [US3] 在 packages/desktop/src/renderer/components/ApiCostPanel.tsx、App.tsx、styles.css 实现紧凑费用面板及测试（FR-005）。

## Phase 6: Polish

- [x] T010 执行 packages/desktop/package.json 的全量test/typecheck/build、补边界测试（FR-008/SC-001/002/003）。
- [x] T011 完成mac打包烟测、安装验证；记录 specs/034-api-cost-monitor/verification.md（FR-008）。

## Dependencies & Execution Order

T001→T002→T003/T004→T005/T006→T007→T008/T009→T010→T011。顺序执行，不委派。

## Parallel Opportunities

US1的价格单测与恢复单测可独立；US2假服务各场景可并行；US3界面测试与IPC契约检查可独立运行，不并发编辑同文件。

## Implementation Strategy

先请求账本MVP，再保护与运行接线，再界面/音效，最后整体验证。完成任务逐项标记；未完成不宣称交付。
