# Tasks: AI 关卡修改同步

## Phase 1: Setup

- [x] T001 备份并记录当前“测试”项目中的错误运行时注入与关卡数据现状，路径 `/Users/prom2/Documents/liimit.ai Games/测试`
- [x] T002 确认现有关卡解析和 Renderer 刷新路径，路径 `packages/desktop/src/main/levelDocumentStore.ts` 和 `packages/desktop/src/renderer/App.tsx`

## Phase 2: Foundational

- [x] T003 更新 Agent 关卡所有权契约测试，路径 `packages/desktop/test/visualLevelPreviewTemplate.test.ts`
- [x] T004 [P] 增加局部修改不重新生成 GDD/素材的提示契约测试，路径 `packages/desktop/tests/prompt-contract.test.ts`

## Phase 3: User Story 1 - AI 修改后立即可见 (P1)

- [x] T005 [US1] 把新增对象写入“测试”项目第 1 关并移除错误运行时注入，路径 `/Users/prom2/Documents/liimit.ai Games/测试/src/levels.json` 和 `/Users/prom2/Documents/liimit.ai Games/测试/src/scenes/VisualLevelScene.ts`
- [x] T006 [US1] 允许 Agent 受控修改 `src/levels.json` 且保护其他关卡和兼容文件，路径 `agent-test/prompts/custom.md`

## Phase 4: User Story 2 - 编辑与试玩一致 (P1)

- [x] T007 [US2] 在 Agent 从运行转为结束后重载已打开的 Web 试玩，路径 `packages/desktop/src/renderer/components/Inspector.tsx`
- [x] T008 [P] [US2] 更新玩法文档中的关卡真实来源和验收清单，路径 `agent-test/docs/modules/platformer/platformer.md`
- [x] T009 [P] [US2] 更新模板操作表，禁止隐藏注入但允许关卡集局部修改，路径 `agent-test/docs/modules/platformer/template_api.md`

## Phase 5: User Story 3 - 局部任务保持局部 (P2)

- [x] T010 [US3] 在 Agent 提示中增加局部关卡任务快速路径和中止条件，路径 `agent-test/prompts/custom.md`
- [x] T011 [US3] 对“测试”项目重新生成最新 Agent 系统规则，路径 `/Users/prom2/Documents/liimit.ai Games/测试/.qwen/system.md`

## Phase 6: Validation

- [x] T012 运行关卡解析、提示契约和刷新聚焦测试，路径 `packages/desktop/test` 与 `packages/desktop/tests`
- [x] T013 运行桌面端类型检查、完整测试和构建，路径 `packages/desktop`
- [x] T014 在真实 liimit.ai 窗口中确认第 1 关图例变为平台 7、尖刺 7、坑洞 2，并打开 Web 试玩验收，对应界面路径 `packages/desktop/src/renderer/components/LevelViewer.tsx`

## Dependencies

`T001–T004` → `T005–T006` → `T007–T011` → `T012–T014`

## Independent tests

- **US1**: 第 1 关画布和图例显示 AI 新增对象，其他关不变。
- **US2**: 画布、手动试玩和自动试玩显示同一份第 1 关。
- **US3**: 提示契约证明局部任务不生成 GDD/素材，不修改固定运行文件。

## MVP

T001–T006 是最小可用修复；本次同时完成预览同步和回归验证。

## Phase 7: Convergence

- [x] T015 在局部关卡快速路径中要求写入前保留原内容，并在数据校验、构建或测试失败时恢复修改前的 `src/levels.json`，增加提示契约测试 per FR-007 / SC-005 (partial)
