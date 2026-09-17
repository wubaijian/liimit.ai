# Tasks: 候选音效单条试听控制

## Phase 1: Setup

- [x] T001 完成功能规格、计划、调研、数据模型、契约和不调用 API 的验证边界

## Phase 2: Tests First

- [x] T002 [US1] 在 `packages/desktop/src/renderer/audioCandidatePlayback.test.ts` 增加互斥、暂停保留、从头播放和移除清理测试
- [x] T003 [US1] 在 `packages/desktop/test/audio-api-settings.test.ts` 增加界面播放器登记、事件和按钮契约
- [x] T004 [US1] 运行聚焦测试并确认新检查在实现前失败

## Phase 3: User Story 1 - 单条试听

- [x] T005 [US1] 在 `packages/desktop/src/renderer/audioCandidatePlayback.ts` 实现无网络播放器控制规则
- [x] T006 [US1] 在 `SettingsDialog.tsx` 登记候选播放器并在播放时停止其他候选
- [x] T007 [US1] 在 `SettingsDialog.tsx` 增加“从头播放”、当前播放状态和安全失败提示
- [x] T008 [US1] 在 `styles.css` 完成候选操作区和当前播放状态样式

## Phase 4: Verification

- [x] T009 运行聚焦测试和两个 TypeScript 检查
- [x] T010 运行完整回归、正式构建和差异检查
- [x] T011 不点击生成地检查实际 Electron AUDIO 页面并清理临时状态
- [x] T012 更新规格状态和最终证据

## Order

T001 → T002/T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012。全程不得调用 ElevenLabs。

## Final Evidence (2026-09-02)

- 实现前新增检查按预期失败：播放器控制模块不存在，界面缺少互斥事件与从头播放入口。
- 聚焦检查：播放器规则和 AUDIO 界面契约共 31 项通过。
- 本地假播放器验证：切换候选会暂停并重置其他候选；当前候选原生暂停保留位置；从头播放只播放目标；移除时暂停、归零并删除引用。
- 桌面端两个 TypeScript 配置检查通过。
- 完整回归：54 个测试文件、678 项测试全部通过。
- 正式构建和 `git diff --check` 通过。
- 实际 Electron AUDIO 页面正常打开，已有设置、描述、时长和生成入口均正常；检查后关闭设置。
- 未点击生成、未调用 ElevenLabs、未消耗 API 额度、未修改游戏项目。
- 因真实候选不持久化，本次没有为视觉检查触发真实生成；候选卡“从头播放”和单条互斥由本地播放器与界面契约检查覆盖。
