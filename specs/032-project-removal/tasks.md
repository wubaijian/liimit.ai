# Tasks: Project Removal

## Phase 1 Setup

- [x] T001 编写 specs/032-project-removal 规格、计划、契约和验收。

## Phase 2 Foundation

- [x] T002 建立 packages/desktop/test/projectRemoval.test.ts 的取消/并发/安全/失败回归（FR-003～006）。

## Phase 3 US1 列表清理

- [x] T003 [US1] 实现 main/projectRemovalService.ts 与 main/store.ts 列表移除，补 test/store.test.ts 持久化测试（FR-002、005）。
- [x] T004 [US1] 实现 shared/types.ts、main/preload.cts、main/main.ts 确认和互斥、后台活动检查（FR-001、004）。
- [x] T005 [US1] 实现 renderer/components/ProjectRail.tsx 菜单及 renderer/App.tsx 更新，styles.css 和 test/projectRemovalUi.test.tsx（FR-001、005）。

## Phase 4 US2 文件清理

- [x] T006 [US2] 实现 main/projectRemovalService.ts 安全核验、废纸篓、失败处理和 projectManager.ts 停止预览（FR-003、004、005）。

## Phase 5 Validation

- [x] T007 执行测试/类型/打包/原生UI检查，记录 specs/032-project-removal/quickstart.md（FR-006、SC-001～003）。

## Dependencies and Strategy

T001→T002→T003→T004→T005→T006→T007。先验收列表移除，再验收废纸篓。UI静态测试与安全测试可并行检查，本次顺序实现，不委派。

## Phase 6: Convergence

- [ ] T008 在用户不操作界面时，补做已安装应用两种移除确认框的取消验证（核验列表/文件不变），并检查菜单视觉布局，更新 quickstart.md；依据 plan: 原生菜单与取消验证、SC-001（partial，MEDIUM）。当前已有取消自动测试，原生交互因用户操作中断而未完整验证。

核对统计：6 项 FR、3 项 SC、2 项用户故事，4 项计划决策及 7 项宪章原则；missing 0 / partial 1 / contradicts 0 / unrequested 0。实现无新缺口，MEDIUM 验证缺口 1 项，已追加 T008。
