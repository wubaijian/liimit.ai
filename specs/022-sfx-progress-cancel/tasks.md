# Tasks: 音效生成进度与主动停止

**Input**: `specs/022-sfx-progress-cancel/` 下的规格、计划、调研、数据模型和契约

**Tests**: 按项目宪章先写失败测试，再实现。

## Phase 1: Setup

- [x] T001 完成 `specs/022-sfx-progress-cancel/` 规格、计划、调研、数据模型、契约与快速验证说明
- [x] T002 核对 Constitution 前置和设计后门槛，无例外

## Phase 2: Foundational

- [x] T003 在 `packages/desktop/src/shared/types.ts` 定义脱敏进度、停止结果和桥接契约
- [x] T004 在 `packages/desktop/test/audio-api-settings.test.ts` 增加共享契约、Main、Preload 和 Renderer 的失败测试

## Phase 3: User Story 1 - 查看三候选生成进度 (P1)

**Goal**: 用户看到可信的 0/3 到 3/3，以及成功和失败数量。

**Independent Test**: 三个本地假请求按顺序结束，进度数字每次准确变化。

- [x] T005 [US1] 在 `packages/desktop/src/main/audioPreviewService.test.ts` 先增加逐条落定进度测试并确认失败
- [x] T006 [US1] 在 `packages/desktop/src/main/audioPreviewService.ts` 实现批次进度回调
- [x] T007 [US1] 在 `packages/desktop/src/main/main.ts` 生成批次标识并发送脱敏进度事件
- [x] T008 [US1] 在 `packages/desktop/src/main/preload.cts` 实现带清理函数的进度订阅
- [x] T009 [US1] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 和 `styles.css` 显示真实进度并忽略旧批次事件
- [x] T010 [US1] 运行聚焦测试与桌面端两个 TypeScript 检查

## Phase 4: User Story 2 - 主动停止正在生成的批次 (P1)

**Goal**: 用户一次点击即可停止未完成请求，整批作废并保留输入重试。

**Independent Test**: 本地假请求启动后停止，所有未完成请求收到信号，已有成功也不返回，迟到结果不展示。

- [x] T011 [US2] 在 `packages/desktop/src/main/audioPreviewService.test.ts` 先增加全未完成停止、部分成功后停止与超时区分测试并确认失败
- [x] T012 [US2] 在 `packages/desktop/src/main/audioPreviewService.ts` 实现批次外部停止和整批作废
- [x] T013 [US2] 在 `packages/desktop/src/main/main.ts` 实现当前批次控制器和安全空闲停止处理
- [x] T014 [US2] 在 `packages/desktop/src/main/preload.cts` 暴露无参数停止方法
- [x] T015 [US2] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 和 `styles.css` 实现停止、停止中、已停止与竞态丢弃
- [x] T016 [US2] 验证用途、描述、时长保留，停止后可重试且没有候选

## Phase 5: Polish & Verification

- [x] T017 运行聚焦测试、完整桌面端测试、两个 TypeScript 检查、正式构建和 `git diff --check`
- [x] T018 不调用真实 API 地检查 Electron AUDIO 页面文案、输入和生成入口
- [x] T019 更新规格状态、任务证据和未执行检查说明

## Dependencies & Execution Order

- T003-T004 是两条用户故事的共享基础。
- US1 先建立进度契约，US2 再复用同一批次标识和生命周期完成停止。
- 所有请求、进度和停止测试使用本地假响应，不允许调用 ElevenLabs。
- T017-T019 仅在两条用户故事完成后执行。

## Final Evidence (2026-09-02)

- 先运行新增检查并确认 6 项失败，分别证明旧版缺少可信进度、停止通道和迟到结果保护。
- 聚焦检查：`audioPreviewService.test.ts` 与 `audio-api-settings.test.ts` 共 61 项通过；覆盖逐条进度、一条失败、全部未完成停止、部分成功后停止、共享桥接、Main 控制器和 Renderer 竞态保护。
- 桌面端两个 TypeScript 配置检查通过。
- 桌面端完整回归：53 个测试文件、672 项测试全部通过。
- 桌面端正式构建与 `git diff --check` 通过。
- 真实 Electron 界面确认：AUDIO 页面显示固定三候选、约三倍额度、真实进度与主动停止说明；临时描述输入后生成按钮正确启用。
- 界面检查完成后已清空临时描述并关闭设置；未点击生成、未调用 ElevenLabs、未消耗额度、未修改游戏项目。
- 未执行真实 ElevenLabs 请求中的停止操作；外部请求中断、部分成功作废和完成/停止竞态由本地可控假请求验证。
