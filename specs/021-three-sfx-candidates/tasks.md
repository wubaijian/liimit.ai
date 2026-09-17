# Tasks: 三候选音效试听与选择

**Input**: Design documents from `specs/021-three-sfx-candidates/`

**Tests**: 所有生成检查使用本地假响应，不调用真实 ElevenLabs API。

## Phase 1: Setup

- [x] T001 记录单候选基线、脏工作区和“真实界面不点击生成”边界到 `specs/021-three-sfx-candidates/tasks.md`

## Phase 2: Foundational Tests

- [x] T002 [P] [US1] 在 `packages/desktop/src/main/audioPreviewService.test.ts` 增加三成功、部分失败、全部失败、稳定编号和不补发测试
- [x] T003 [P] [US1] 在 `packages/desktop/test/audio-api-settings.test.ts` 增加强类型批次、固定三次、用量记录、三卡单选和资源释放契约测试

## Phase 3: User Story 1 - 试听并选择三个候选音效 (Priority: P1) 🎯 MVP

**Goal**: 一次生成最多三个独立候选，用户逐条试听、明确单选，并只应用所选候选。

**Independent Test**: 本地假批次返回三条后选择第 2 条，确认只有第 2 条处于选中状态，应用输入只包含第 2 条字节；部分失败仍可选择成功项。

- [x] T004 [US1] 在 `packages/desktop/src/shared/types.ts` 把单条生成结果扩展为固定三候选批次契约
- [x] T005 [US1] 在 `packages/desktop/src/main/audioPreviewService.ts` 实现三次并行、稳定编号、部分成功和全部失败规则
- [x] T006 [US1] 在 `packages/desktop/src/main/main.ts` 与 `packages/desktop/src/main/preload.cts` 接入批次互斥、批次返回和 `callCount: 3` 脱敏用量记录
- [x] T007 [US1] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 管理候选数组、全部 Blob URL、明确单选和只应用所选候选
- [x] T008 [US1] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 增加三倍额度说明、三张候选卡、部分失败和未选择提示
- [x] T009 [US1] 在 `packages/desktop/src/renderer/styles.css` 增加白色三候选网格、选中态和部分失败样式

## Phase 4: Validation

- [x] T010 运行两个聚焦测试和桌面端 TypeScript 检查
- [x] T011 运行桌面端完整测试、正式构建和 `git diff --check`
- [x] T012 按 `specs/021-three-sfx-candidates/quickstart.md` 完成不调用 API 的真实界面检查
- [x] T013 收敛规格、计划、任务与实现并记录最终证据到 `specs/021-three-sfx-candidates/tasks.md`

## Dependencies & Coverage

- T001 → T002/T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013。
- FR-001～FR-003、FR-007～FR-010：T002～T006、T010～T013。
- FR-004～FR-006、FR-009、FR-011：T003、T007～T013。
- SC-001～SC-007：T002、T003、T010～T013。

## Parallel Opportunities

- T002 和 T003 修改不同测试文件，可以并行设计；实现阶段因共享契约依赖按顺序完成。

## Implementation Strategy

只交付固定三候选、部分失败和用户单选；完成后停止并等待用户确认，不增加取消、自动评分、历史或音频编辑。

## Implementation Baseline (2026-09-02)

- 开始前系统一次只返回一条 `AudioPreviewResult`，Renderer 只管理一个 Blob URL，并直接把该条结果交给现有确认应用流程。
- Main 已有全应用音效生成互斥、可信输入校验、安全存储凭据、30 秒超时、1 MiB 限制和脱敏用量记录；本功能复用这些保护。
- 工作区包含此前 V3 与音效功能的未提交修改；本功能只修改计划列出的共享契约、音效服务、Main/Preload、设置界面、样式和对应测试，不覆盖其他改动。
- 自动测试只使用本地假响应；真实 Electron 界面只检查说明、输入和布局，不点击生成，不调用 ElevenLabs、不消耗额度、不修改游戏项目。

## Final Evidence (2026-09-02)

- 聚焦测试：`audioPreviewService.test.ts` 与 `audio-api-settings.test.ts` 共 55 项通过；覆盖三成功、稳定编号、一个/两个失败、全部失败、不补发、批次契约、单选、只应用所选字节和资源释放。
- 桌面端两个 TypeScript 配置检查通过。
- 桌面端完整回归：53 个测试文件、666 项测试全部通过。
- 桌面端正式构建通过，`git diff --check` 通过。
- 真实 Electron 界面确认：明确显示“一次生成 3 条并发起 3 次请求”“ElevenLabs 额度约为单条 3 倍”；跳跃默认 0.5 秒，临时输入描述并切到 3.5 秒后，按钮正确显示“生成 3 条 3.5 秒候选”。
- 界面检查完成后关闭设置，临时描述和时长未保存；全程未点击生成，未调用 ElevenLabs、未消耗额度、未修改游戏项目。
- 本功能未增加取消、自动评分、候选历史或音频编辑。
