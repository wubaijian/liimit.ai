# Tasks: 自定义音效描述

**Input**: Design documents from `specs/019-custom-sfx-description/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/audio-description.md`

**Tests**: 先增加失败测试，再修改实现；所有音效服务调用使用本地假响应，不消耗 API 额度。

## Phase 1: Setup

**Purpose**: 固定当前边界并保护已有未提交工作。

- [x] T001 记录现有音效链路、脏工作区和不调用真实 API 的验证边界到 `specs/019-custom-sfx-description/tasks.md`

---

## Phase 2: Foundational Tests

**Purpose**: 先让新契约和安全要求在现有实现上失败。

- [x] T002 [P] [US1] 在 `packages/desktop/src/main/audioPreviewService.test.ts` 增加中文、英文、去空格、固定安全后缀和无效描述不联网测试
- [x] T003 [P] [US1] 在 `packages/desktop/test/audio-api-settings.test.ts` 增加共享输入、Main 二次校验、界面示例/字数/空值阻止和用量不保存描述的契约测试

**Checkpoint**: 新测试准确指出当前仍使用固定提示词且没有描述输入。

---

## Phase 3: User Story 1 - 用户描述自己想要的声音 (Priority: P1) 🎯 MVP

**Goal**: 用户能输入中文或英文描述，经过双层校验后生成现有的一条临时试听音效。

**Independent Test**: 使用本地假响应输入中文和英文描述，确认发送规范化描述；空值、超长和控制字符不发起网络请求；关闭前不写项目。

- [x] T004 [US1] 扩充 `packages/desktop/src/shared/types.ts` 的 `GenerateAudioPreviewInput`，并在 `packages/desktop/src/main/main.ts` 增加 1～300 字符和控制字符校验
- [x] T005 [US1] 修改 `packages/desktop/src/main/audioPreviewService.ts`，使用用户描述与固定短音效安全约束生成一条 0.5 秒试听结果
- [x] T006 [US1] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 增加描述输入、六种用途示例、字数、空值提示和请求传递
- [x] T007 [US1] 在 `packages/desktop/src/renderer/styles.css` 增加描述区域的白色界面样式与窄窗口适配

**Checkpoint**: User Story 1 可独立使用，现有应用与恢复能力不变。

---

## Phase 4: Polish & Validation

**Purpose**: 证明功能符合规格且没有把描述写入记录或项目。

- [x] T008 运行两个聚焦测试文件和桌面端两个 TypeScript 配置检查
- [x] T009 运行桌面端完整测试、正式构建与 `git diff --check`
- [x] T010 按 `specs/019-custom-sfx-description/quickstart.md` 在真实界面检查输入、示例、字数和按钮状态，全程不点击生成
- [x] T011 对照 `specs/019-custom-sfx-description/spec.md` 收敛实现并记录最终证据到 `specs/019-custom-sfx-description/tasks.md`

---

## Dependencies & Execution Order

- T001 先记录基线。
- T002 与 T003 可分别编写，但必须先于 T004～T007，并先确认在旧实现上失败。
- T004 → T005 → T006 → T007 按共享契约、可信服务、界面、样式顺序完成。
- T008 → T009 → T010 → T011 依次验收。

## Requirement Coverage

- FR-001～FR-004: T003、T006、T007
- FR-005～FR-007: T002～T005
- FR-008～FR-009: T002、T003、T005、T008～T011
- SC-001～SC-005: T002、T003、T008～T011

## Implementation Strategy

只交付 User Story 1。完成后停止，向用户汇报并等待确认；不提前开始三候选音效。

## Implementation Baseline (2026-09-02)

- 工作区在本功能开始前已有 V3 UI、音效 API、本地音效、应用和恢复等未提交改动；本功能只对计划中列出的音效描述文件做目标修改，不覆盖或清理既有工作。
- 原链路只传 `sound` 并使用六条固定英文提示词；Renderer 没有描述状态或输入框。
- 所有自动测试使用本地假响应；真实界面验收不点击生成按钮，因此本功能开发与验收不调用 ElevenLabs、不消耗额度、不修改当前游戏项目。
- 红灯证据：契约测试在旧实现上准确失败 5 项，分别对应共享描述字段、安全描述合成、Renderer 请求、Main 二次校验和描述界面缺失；随后停止了因旧服务签名误走网络分支的假密钥测试进程，未使用真实凭据或产生音效。

## Final Evidence (2026-09-02)

- Renderer 增加临时描述状态、六种用途示例、`0/300` 字数、空值说明和生成按钮阻止；切换用途时示例改变，用户已输入文字保留。
- Preload 方法和 IPC 通道保持不变；共享输入只增加 `description`，Main 使用与服务相同的校验规则再次检查，Renderer 不接触凭据、地址或路径。
- 音效服务去除首尾空格，接受中文和英文，附加固定短游戏音效/无语音约束；空描述、301 字符和 C0/C1 控制字符均在网络前拒绝。
- 返回结果、项目应用输入和 API 用量记录均不包含描述；失败或关闭窗口不会写项目。
- 聚焦验证：2 个测试文件、35 项测试通过；桌面 Renderer 与 Main 两个 TypeScript 配置检查通过。
- 完整验证：53 个测试文件、646 项测试全部通过；桌面正式构建通过；`git diff --check` 通过。
- 真实界面检查：输入框、中文输入、`16/300` 计数、空值禁用按钮、用途示例切换和输入保留均可见；检查后清空临时文字并恢复到跳跃用途。
- 未点击“生成所选音效”，未使用真实 API、未消耗 ElevenLabs 额度、未修改当前游戏项目；三候选和时长选择仍明确属于后续步骤。
