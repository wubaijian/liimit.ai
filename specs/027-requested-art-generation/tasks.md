# Tasks

## Phase 1: Setup

- [x] T001 明确规格、计划及宪章符合性于 specs/027-requested-art-generation/

## Phase 2: User Story 1

- [x] T002 [US1] 更新 agent-test/prompts/custom.md 图片策略及对应测试（FR-001/002/004）

## Phase 3: User Story 2

- [x] T003 [US2] 测试并实现 packages/desktop/src/main/projectContentSnapshot.ts（FR-003）
- [x] T004 [US2] 接入 packages/desktop/src/main/agentRunner.ts 并验证 waiting/完成路径（FR-003）

## Phase 4: Validation

- [x] T005 执行桌面测试、类型检查、打包与安装验证；记录 quickstart.md

## Dependencies

T001 -> T002/T003 -> T004 -> T005。US1 提示词测试与 US2 摘要测试可独立执行。先规则再状态，最后安装。
