# Tasks: 音效时长选择

**Input**: Design documents from `specs/020-sfx-duration-selection/`

**Tests**: 所有服务检查使用本地假响应，不调用真实 API。

## Phase 1: Setup

- [x] T001 记录功能开始前的自定义描述链路、脏工作区和不调用真实 API 边界到 `specs/020-sfx-duration-selection/tasks.md`

## Phase 2: Foundational Tests

- [x] T002 [P] [US1] 在 `packages/desktop/src/main/audioPreviewService.test.ts` 增加 0.5/3.5/8 秒有效值和 0/8.5/0.7/非数字不联网测试
- [x] T003 [P] [US1] 在 `packages/desktop/test/audio-api-settings.test.ts` 增加 16 档、六种推荐值、Main 校验、界面选择和结果回传契约测试

## Phase 3: User Story 1 - 用户选择音效持续时间 (Priority: P1) 🎯 MVP

**Goal**: 用户可以从 16 个档位中选择时长，生成请求和试听信息使用实际选择。

**Independent Test**: 本地假请求验证边界与代表值；真实界面验证推荐值、切换和清除旧试听，不点击生成。

- [x] T004 [US1] 在 `packages/desktop/src/shared/types.ts` 定义 16 个时长档位、六种推荐值，并扩充生成输入和结果
- [x] T005 [US1] 在 `packages/desktop/src/main/audioPreviewService.ts` 与 `packages/desktop/src/main/main.ts` 增加时长校验、请求使用和结果回传
- [x] T006 [US1] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 增加推荐时长状态、选择框、用途切换重置和试听时长显示
- [x] T007 [US1] 在 `packages/desktop/src/renderer/styles.css` 增加紧凑白色时长选择样式

## Phase 4: Validation

- [x] T008 运行两个聚焦测试和桌面端 TypeScript 检查
- [x] T009 运行桌面端完整测试、正式构建和 `git diff --check`
- [x] T010 按 `specs/020-sfx-duration-selection/quickstart.md` 完成不调用 API 的真实界面检查
- [x] T011 收敛规格、计划、任务与实现并记录最终证据到 `specs/020-sfx-duration-selection/tasks.md`

## Dependencies & Coverage

- T001 → T002/T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011。
- FR-001～FR-004: T003、T004、T006、T007。
- FR-005～FR-009: T002～T006、T008～T011。
- SC-001～SC-005: T002、T003、T008～T011。

## Implementation Strategy

只交付时长选择，完成后停止并等待用户确认；不提前实现三候选。

## Implementation Baseline (2026-09-02)

- 功能开始前，自定义描述、单条试听、确认应用和恢复内置音效已经完成；请求时长仍固定为 0.5 秒，输入和结果没有时长字段。
- 工作区已有此前 V3 与音效功能未提交修改；本功能只修改计划列出的共享契约、音效服务、Main 校验、设置界面、样式和对应测试。
- 自动检查全部使用本地假响应；真实界面只调整临时选择，不点击生成，不调用 ElevenLabs，不修改游戏项目。

## Final Evidence (2026-09-02)

- 聚焦测试：`audioPreviewService.test.ts` 与 `audio-api-settings.test.ts` 共 48 项通过；覆盖 0.5/3.5/8 秒、非法时长不联网、16 档和六种推荐值。
- 桌面端 TypeScript 检查通过。
- 桌面端完整回归：53 个测试文件、659 项测试全部通过。
- 桌面端正式构建通过，`git diff --check` 通过。
- 真实 Electron 界面确认：跳跃默认 0.5 秒（推荐）；手动切到 3.5 秒后按钮同步显示 3.5 秒；切到完成关卡后自动变为 2 秒（推荐），临时描述保持不变。
- 界面检查完成后关闭设置，临时描述和时长未保存；全程未点击生成，未调用 ElevenLabs、未消耗额度、未修改游戏项目。
- 本功能严格保持单候选；三候选不在本功能范围内。
