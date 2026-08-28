# 任务清单：新项目立即获得可玩模板

**输入**：`specs/008-instant-playable-project/` 中的规格、计划、调研、数据模型、接口契约和验收指南

**测试原则**：本功能涉及持久化、IPC、文件、子进程和真实试玩门禁。每个故事先补会失败的聚焦测试，再实现功能；每一阶段结束后单独验证，不一次性完成全部阶段。

**组织方式**：任务按用户能感知的结果分组。每完成一个任务或一个明确的小检查点，都先汇报结果并等待用户确认。

## 格式：`[ID] [P?] [Story] 任务说明`

- **[P]**：在前置任务完成后，可以与同阶段其他标记任务并行，因为主要修改不同文件。
- **[US1] / [US2] / [US3]**：对应功能规格中的三个用户故事。

---

## 阶段 1：准备与基线

**目的**：在改代码前记录当前健康状态，避免把原有问题误认为本功能造成的问题。

- [x] T001 运行桌面端现有类型检查、测试和构建，并把命令、结果与任何原有失败记录到 `specs/008-instant-playable-project/implementation-evidence.md`

**检查点**：已经知道改动前哪些检查通过、哪些问题原本就存在。

---

## 阶段 2：所有故事共用的安全基础

**目的**：先建立准备状态、旧数据兼容和测试工具，后续故事才能安全实现。

**⚠️ 阻塞条件**：本阶段没有完成前，不开始任何用户故事实现。

- [x] T002 [P] 为 `StarterPreparation` 的合法状态、阶段、错误码、revision 单调版本、长度上限和历史字段缺失行为编写失败优先契约测试，文件为 `packages/desktop/test/starter-preparation-contract.test.ts`
- [x] T003 [P] 为 StateStore 读取历史记录、拒绝损坏准备状态、保留 ready/failed 状态编写失败优先测试，文件为 `packages/desktop/test/store.test.ts`
- [x] T004 在 `packages/desktop/src/shared/types.ts` 定义带单调 revision 的版本化 `StarterPreparation` 和重试结果类型，并让 T002 的共享类型契约通过；`GameAgentAPI.retryStarterPreparation()` 与真实 Preload 入口一起留到 T028，避免提前暴露不可用接口
- [x] T005 在 `packages/desktop/src/main/store.ts` 增加准备状态运行时校验和历史字段缺失兼容读取，并让 T003 的持久化契约通过
- [x] T006 在 T004 完成后建立新项目、各准备状态、单调 revision 和固定时间戳的复用测试工厂，文件为 `packages/desktop/test/starterPreparationFixtures.ts`

**检查点**：新状态能被安全保存和读取，旧项目不会被自动改写或误判为新项目。

---

## 阶段 3：用户故事 1——新建后直接获得可玩项目（P1，MVP）

**目标**：用户不配置模型、不启动 Agent、不打开终端；新建项目后自动得到真实关卡和可运行的 Web 游戏。准备未完成前不展示虚假默认关卡。

**独立测试**：清空模型配置，在新的可写目录创建项目；确认自动经历准备、构建和真实试玩验证，最后关卡编辑器与 Web 试玩读取同一项目内容，模型调用数为 0。

### 先写测试

- [x] T007 [P] [US1] 为新建项目写入 queued 准备状态、`.gameagent/project.json` 创建快照一致以及 ProjectManager 继续转发 scaffold/dependencies 进度编写失败优先测试，文件为 `packages/desktop/test/projectManager.test.ts`
- [x] T008 [P] [US1] 为固定模板准备器准确报告 scaffold 与 dependencies 阶段且不开放任意命令参数编写失败优先测试，文件为 `packages/desktop/test/fixedProjectProvisioner.test.ts`
- [x] T009 [P] [US1] 为“关卡文件必须真实存在”的严格读取路径编写失败优先测试，文件为 `packages/desktop/test/levelDocumentStore.test.ts`
- [x] T010 [P] [US1] 为准备服务的成功顺序、逐阶段递增 revision 并持久化、真实验证后才 ready 和零模型依赖编写失败优先测试，文件为 `packages/desktop/test/starterPreparationService.test.ts`
- [x] T011 [P] [US1] 为 queued/preparing 时不调用 loadLevel/startPreview、乱序旧 revision 不覆盖新状态、ready 后人工与自动试玩读取同一真实游戏且不启动 Agent 编写失败优先界面测试，文件为 `packages/desktop/test/starterPreparationView.test.tsx`

### 实现 MVP

- [x] T012 [US1] 在 `packages/desktop/src/main/projectManager.ts` 让新项目初始记录和创建快照包含 queued 准备状态，同时保持创建记录失败时的现有安全清理
- [x] T013 [P] [US1] 在 `packages/desktop/src/main/fixedProjectProvisioner.ts` 增加仅报告固定阶段的回调，并在 `packages/desktop/src/main/projectManager.ts` 把该回调继续传给准备服务，同时保持受信任模板、白名单 npm 参数、超时和幂等规则不变
- [x] T014 [P] [US1] 在 `packages/desktop/src/main/levelDocumentStore.ts` 增加供准备验收使用的严格真实关卡读取，不改变历史项目现有默认回退读取
- [x] T015 [US1] 新建 `packages/desktop/src/main/starterPreparationService.ts`，按模板/依赖、构建、严格关卡读取、真实试玩探测的顺序编排成功流程，每次状态落盘前递增 revision，落盘成功后才通知更新
- [x] T016 [US1] 在 `packages/desktop/src/renderer/components/NewProjectDialog.tsx` 先明确说明创建会复制固定模板且首次可能联网下载固定依赖，使提交创建成为清楚的用户触发
- [x] T017 [US1] 在 T016 完成后于 `packages/desktop/src/main/main.ts` 初始化准备服务，并在 `project:create` 成功保存项目后自动加入准备队列，保证创建 IPC 只等待记录落盘、不等待安装和构建
- [x] T018 [US1] 在 `packages/desktop/src/main/main.ts` 为带准备状态但尚未 ready 的新项目拦截关卡读取、关卡保存和 Web 试玩，同时让字段缺失的历史项目维持旧行为
- [x] T019 [US1] 新建 `packages/desktop/src/renderer/components/StarterPreparationView.tsx`，在 `packages/desktop/src/renderer/components/Inspector.tsx` 接入准备门禁，并在 `packages/desktop/src/renderer/App.tsx` 按项目 ID 和 revision 拒绝乱序旧更新；ready 后人工与自动试玩都开放同一真实预览
- [x] T020 [US1] 运行 US1 聚焦测试、桌面端完整 typecheck/test/build，并真实创建一个无模型项目验证编辑、人工试玩和自动试玩，把结果补充到 `specs/008-instant-playable-project/implementation-evidence.md`

**检查点**：最小可用版本成立——新项目无需 AI 就能自动成为真实可编辑、可试玩的固定横版游戏。

---

## 阶段 4：用户故事 2——看懂进度、失败后重试（P1）

**目标**：用户能看见复制、依赖、构建和验证阶段；断网、空间、权限、构建或中断失败后项目仍在，并能通过一个按钮安全重试。

**独立测试**：分别模拟依赖失败、空间不足、权限不足、验证失败、快速重复重试和应用中途退出；确认中文状态正确、项目资料保留、同项目只有一个流程、重启后可手动重试。

### 先写测试

- [x] T021 [P] [US2] 为失败分类、中文脱敏摘要、失败后安全写入文件内容不变、同项目 single-flight、不同项目串行、主动中止和状态持久化失败编写失败优先测试，文件为 `packages/desktop/test/starterPreparationService.test.ts`
- [x] T022 [P] [US2] 为应用重启时 queued/preparing 转为 failed/interrupted 且不自动重跑、历史记录不变编写失败优先测试，文件为 `packages/desktop/test/store.test.ts`
- [x] T023 [P] [US2] 为重试 IPC 的 ID 校验、固定模式校验、历史项目拒绝、ready 不执行、重复请求合并和应用退出触发准备中止编写失败优先契约测试，文件为 `packages/desktop/test/starter-preparation-contract.test.ts`
- [x] T024 [P] [US2] 为失败原因、项目仍保留、重试按钮、防重复点击和项目切换不串写编写失败优先界面测试，文件为 `packages/desktop/test/starterPreparationView.test.tsx`

### 实现恢复能力

- [x] T025 [US2] 在 `packages/desktop/src/main/starterPreparationService.ts` 实现同项目请求合并、不同项目串行队列、attempt 规则、失败分类、中文脱敏错误、AbortController 中止和最终 failed 持久化，失败或中止不得删除已经安全写入的文件
- [x] T026 [P] [US2] 在 `packages/desktop/src/main/store.ts` 把启动时遗留的 queued/preparing 规范化为 failed/interrupted，并确保 ready、failed 和历史项目兼容行为不变
- [x] T027 [US2] 在 `packages/desktop/src/main/main.ts` 注册并校验 `project:retry-starter-preparation`，只允许用户重试本功能管理且尚未 ready 的固定横版项目，并在应用退出生命周期中中止队列和正在运行的受控子进程
- [x] T028 [US2] 在 `packages/desktop/src/main/preload.cts` 暴露强类型 `retryStarterPreparation(projectId)`，不暴露模板路径、命令、包名或参数
- [x] T029 [US2] 在 `packages/desktop/src/renderer/components/StarterPreparationView.tsx` 显示当前阶段、可行动失败说明和单一重试按钮，并在 `packages/desktop/src/renderer/App.tsx` 按项目 ID 与 revision 合并创建响应和异步更新
- [x] T030 [US2] 运行 US2 聚焦测试及桌面端完整 typecheck/test/build，并验证断网、权限、空间、中断、文件保留、重复重试和跨项目行为，把结果补充到 `specs/008-instant-playable-project/implementation-evidence.md`

**检查点**：准备流程不再像“卡死”；失败不会丢项目，用户不需要重新填写表单即可恢复。

---

## 阶段 5：用户故事 3——AI 只作为可选后续步骤（P2）

**目标**：基础编辑、人工试玩和自动试玩不依赖 Agent；用户以后主动启动 Agent 时仍在同一项目继续，并保留已经做过的关卡编辑。

**独立测试**：先不启动 Agent，编辑并试玩基础游戏；保存一个关卡改动后再主动启动 Agent，确认使用相同项目路径、没有重新创建项目、准备器的幂等保护不覆盖该改动。

### 先写测试

- [x] T031 [P] [US3] 为未 ready 的新项目禁止启动 Agent、ready 项目允许启动、历史项目保持旧行为编写失败优先契约测试，文件为 `packages/desktop/test/starter-preparation-contract.test.ts`
- [x] T032 [P] [US3] 为 Agent 在 ready 项目继续使用同一项目 ID 和路径且固定准备器运行前后既有关卡文件内容或哈希不变增加回归测试，文件为 `packages/desktop/test/agentRunner.test.ts`
- [x] T033 [P] [US3] 为 Agent 按钮在准备期间禁用、ready 后启用并明确提示可能修改项目文件编写失败优先界面测试，文件为 `packages/desktop/test/starterPreparationView.test.tsx`

### 实现可选 Agent 衔接

- [x] T034 [US3] 在 `packages/desktop/src/main/main.ts` 为带准备状态的新项目增加 Agent 启动 ready 门禁，同时保持历史项目和现有单 Agent 执行槽行为
- [x] T035 [US3] 在 `packages/desktop/src/main/agentRunner.ts` 保持同一项目 ID 和路径继续执行，并让固定准备/构建幂等步骤不改写 T032 已记录的既有关卡内容或哈希
- [x] T036 [US3] 在 `packages/desktop/src/renderer/App.tsx` 禁用未 ready 新项目的 Agent 输入和启动操作，并显示“基础游戏完成后可选择让 AI 继续修改”的非强制说明
- [x] T037 [US3] 运行 US3 聚焦测试及桌面端完整 typecheck/test/build，并验证无 Agent 编辑试玩、同项目继续和已有编辑保留，把结果补充到 `specs/008-instant-playable-project/implementation-evidence.md`

**检查点**：不用 AI 时产品完整可用；使用 AI 时，它是用户主动选择的同项目后续修改工具。

---

## 阶段 6：整体收尾与交付证据

**目的**：消除旧文档冲突，完成自动和人工验收，并确保没有把规划能力误写成已交付能力。

- [x] T038 [P] 修正 `specs/004-playable-golden-path/spec.md` 中“首次启动 Agent 才准备基础模板”的旧描述，并明确新行为只适用于本功能上线后创建的新项目
- [x] T039 扩展 `packages/desktop/scripts/playable-golden-path-smoke.mjs`，覆盖空模型配置创建、真实关卡、人工与自动试玩读取同一真实 Web 入口、生成式 AI 调用数为 0 和失败不误报 ready
- [x] T040 运行桌面端完整 typecheck、test、build、smoke:playable，并把命令、通过数量、耗时和未执行项记录到 `specs/008-instant-playable-project/implementation-evidence.md`
- [x] T041 按 `specs/008-instant-playable-project/quickstart.md` 人工验证成功、失败重试、应用中断、历史项目保护和假成功拦截，并把截图或可复核结果写入 `specs/008-instant-playable-project/implementation-evidence.md`
- [x] T042 检查 `specs/008-instant-playable-project/spec.md`、`plan.md`、`tasks.md` 与实际实现一致，清除未完成占位和不准确的“已支持”描述，并在 `specs/008-instant-playable-project/implementation-evidence.md` 记录最终差异审查

**最终检查点**：只有自动检查和真实验收都有证据时，才可以向用户声明本功能完成。

---

## 依赖关系与执行顺序

### 阶段依赖

- **阶段 1**：立即执行，建立改动前证据。
- **阶段 2**：依赖阶段 1，完成后才允许进入用户故事。
- **US1（阶段 3）**：依赖阶段 2，是最小可用版本和后续故事的基础。
- **US2（阶段 4）**：依赖 US1 的准备服务，但失败与恢复场景可独立验收。
- **US3（阶段 5）**：依赖 US1 的 ready 状态；不依赖 US2 的错误界面即可测试 Agent 衔接。
- **阶段 6**：依赖本次计划要交付的全部用户故事。

### 用户故事关系

```text
安全基础
   └── US1：自动得到可玩模板（MVP）
         ├── US2：进度、失败和重试
         └── US3：可选 Agent 继续修改
               └── 整体验收与交付证据
```

### 每个故事内部顺序

1. 先写对应的失败优先测试，并确认它确实能发现尚未实现的行为。
2. 再实现 Main/服务层，确保状态和磁盘事实正确。
3. 然后接入 Preload/IPC 和 Renderer，不绕过信任边界。
4. 最后运行该故事的聚焦测试并停下来验收。

## 可并行机会

- 阶段 2 中，共享契约测试和 StateStore 测试修改不同文件，可以并行；测试工厂 T006 必须等待 T004 的共享类型完成。
- US1 的 ProjectManager、FixedProjectProvisioner、LevelDocumentStore 和 Renderer 测试可先并行编写；三个底层实现修改不同文件，也可在共享类型完成后并行。
- US2 的服务失败测试、重启恢复测试、IPC 契约测试和界面测试修改不同文件，可并行编写。
- US3 的 Main 契约、AgentRunner 回归和 Renderer 行为测试修改不同文件，可并行编写。
- 用户要求逐项确认，因此实际执行默认仍按任务编号推进；只有用户另行允许并行时才同时实施。

## 分故事并行示例

### US1

```text
T007 ProjectManager 创建快照测试
T008 FixedProjectProvisioner 阶段回调测试
T009 LevelDocumentStore 严格真实关卡测试
T011 Renderer 准备门禁测试
```

### US2

```text
T021 服务失败与并发测试
T022 StateStore 中断恢复测试
T023 重试 IPC 契约测试
T024 Renderer 失败重试测试
```

### US3

```text
T031 Agent ready 门禁契约测试
T032 AgentRunner 同项目保留编辑回归测试
T033 Renderer 可选 Agent 界面测试
```

## 实施策略

### 最小可用版本优先

1. 完成 T001-T006，建立安全数据基础。
2. 完成 T007-T020，只交付 US1。
3. 停止并真实创建一个无模型项目验收。
4. 用户确认后再进入失败重试 US2。

### 增量交付

1. **US1**：新建后自动可玩，先解决“空项目不能用”。
2. **US2**：补进度和恢复，解决“失败像卡死”。
3. **US3**：补可选 Agent 衔接，解决“基础能力和付费 AI 混在一起”。
4. **整体收尾**：完成真实冒烟、历史兼容和证据记录。

## 执行注意事项

- 不自动调用任何付费模型或生成式服务。
- 不修改或提交用户拥有的未跟踪 `.dockerignore`。
- 不提交项目生成的 `node_modules/`、`dist/`、`.runtime-deps/`、应用包或临时验收目录。
- 每个任务描述的是目标，不代表当前已经实现。
- 每完成一个任务或阶段检查点，先汇报实际改动、检查结果、遗留风险，再等待用户确认。
