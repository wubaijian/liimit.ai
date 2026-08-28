# 任务：单一横版平台游戏模式

**输入**：`specs/002-platformer-only-mode/` 中的规格、计划、调研、数据模型、契约和快速验证文档

**组织方式**：任务按用户故事分组；由于本功能涉及产品真实性、共享项目记录和 Core 模板选择，聚焦测试为必需项，并在实现前先写失败测试。

## 格式：`[ID] [P?] [Story] 描述`

- **[P]**：可以并行执行，且不修改同一文件或依赖未完成任务
- **[Story]**：对应 `spec.md` 的用户故事

## Phase 1：Setup

**目的**：建立跨 Renderer/Main/Core 的可重复产品契约测试入口。

- [x] T001 在 `packages/desktop/test/platformer-mode-contract.test.ts` 建立读取目标 UI 源码片段与固定模式常量的测试骨架

---

## Phase 2：Foundational

**目的**：建立所有故事共用、且兼容旧项目的产品模式数据契约。

- [x] T002 在 `packages/desktop/src/shared/types.ts` 定义唯一 `phaser-platformer-web` 产品模式常量、类型、判定函数，并为 `ProjectRecord` 增加可选 `productMode` 字段
- [x] T003 在 `packages/desktop/test/platformer-mode-contract.test.ts` 验证固定值完整、缺失或未知值不被当作固定模式，且 `CreateProjectInput` 不暴露模式选择

**检查点**：模式来源固定在受信代码中，旧项目无需数据迁移即可继续读取。

---

## Phase 3：用户故事 1——不用选技术路线就能开始做游戏（P1）🎯 MVP

**目标**：所有新建入口创建同一种 Phaser 3 / 2D / platformer / Web 项目，用户不能选择或诱导生成另一种 archetype。

**独立测试**：从首页和侧栏打开新建弹窗，确认只有名称、目录和创意输入；即使创意提到塔防或俯视角，新项目记录与 Core 脚手架仍固定为 platformer，且不请求分类模型。

### 测试

- [x] T004 [P] [US1] 在 `packages/desktop/test/projectManager.test.ts` 增加新项目固定标记、`.gameagent/project.json` 一致性、固定 `.qwen/system.md` 约束以及无效/不可写目录失败后不留记录的测试
- [x] T005 [P] [US1] 在 `packages/desktop/test/agentRunner.test.ts` 增加固定项目 Runtime policy（platformer、禁用 Skills、空 MCP）测试
- [x] T006 [P] [US1] 在 `packages/core/src/tools/game-type-classifier.test.ts` 增加固定环境下不调用模型、忽略非 platformer 描述并只复制 platformer 模块的测试
- [x] T007 [US1] 在 `packages/desktop/test/platformer-mode-contract.test.ts` 增加首页与新建弹窗只展示固定模式、三个示例均为横版平台、不存在其它类型引导以及取消目录选择不会提交项目的契约测试

### 实现

- [x] T008 [US1] 在 `packages/desktop/src/main/projectManager.ts` 为所有新项目赋固定 `productMode`，同步写入项目快照，并只为固定项目生成不可切换引擎/archetype 的系统约束
- [x] T009 [US1] 在 `packages/desktop/src/main/agentRunner.ts` 实现可测试的 RuntimeProductPolicy：固定项目注入 `platformer` 环境、跳过用户 Skills、不给 Runtime 注入 MCP；旧项目分支保持原状
- [x] T010 [US1] 在 `packages/core/src/tools/game-type-classifier.ts` 实现精确 allowlist 的 fixed archetype 快速路径，复用现有安全脚手架和结果格式并跳过分类模型
- [x] T011 [P] [US1] 在 `packages/desktop/src/renderer/components/NewProjectDialog.tsx` 增加不可编辑的固定模式说明，把输入聚焦到主题/关卡创意并替换为三个横版平台示例
- [x] T012 [US1] 在 `packages/desktop/src/renderer/App.tsx` 和 `packages/desktop/src/renderer/components/ProjectRail.tsx` 统一两个新建入口、更新首页四项产品边界，并隐藏插件入口而保留底层数据
- [x] T013 [P] [US1] 在 `packages/desktop/src/renderer/styles.css` 增加固定模式说明卡和窄窗口适配样式

**检查点**：新建项目的模式、Runtime 和脚手架均已确定性锁定，US1 可独立演示。

---

## Phase 4：用户故事 2——始终获得一致的浏览器试玩预期（P1）

**目标**：制作界面只描述固定平台模板和 Web 浏览器试玩，不展示外部引擎或工具入口。

**独立测试**：创建并选择固定项目，检查制作阶段、设置分类和预览区域；只能看到固定 platformer 模板与 Web 试玩，未构建时返回现有明确错误。

### 测试

- [x] T014 [US2] 在 `packages/desktop/test/platformer-mode-contract.test.ts` 增加制作阶段、应用内 Web 预览文案、插件隐藏、外部引擎隐藏及 Node.js/npm 运行环境入口保留的 UI 契约测试
- [x] T015 [P] [US2] 在 `packages/desktop/test/projectManager.test.ts` 保留并补强仅从 `dist/index.html` 提供浏览器预览、缺失产物不尝试其它目标的断言

### 实现

- [x] T016 [P] [US2] 在 `packages/desktop/src/renderer/components/Pipeline.tsx` 保留兼容 stage ID，但把“类型识别/选择模板”改为固定平台模板语义
- [x] T017 [P] [US2] 在 `packages/desktop/src/renderer/components/Inspector.tsx` 把预览区明确为 Web 浏览器试玩，并保持现有 sandbox iframe 与错误路径
- [x] T018 [US2] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 把可见依赖分类收敛为 Node.js/npm 构建运行环境入口，隐藏 Unity/Godot/Blender 等外部引擎及无关工具，不删除依赖服务、设置或已有数据

**检查点**：US2 可在不运行真实模型的情况下通过 UI 与预览后端独立验收。

---

## Phase 5：用户故事 3——产品收敛时不丢失已有项目和设置（P2）

**目标**：缺少新标记的旧项目继续打开和续跑；其文件、记录、Skills、MCP、依赖和凭据不被迁移或删除。

**独立测试**：用缺少 `productMode` 的项目记录启动兼容路径，确认系统提示词、五分类与扩展策略保持原状，并确认 UI 仍渲染全部已有项目记录。

### 测试与兼容收口

- [x] T019 [P] [US3] 在 `packages/desktop/test/projectManager.test.ts` 增加旧项目生成原系统提示词时不追加固定模式约束的测试
- [x] T020 [P] [US3] 在 `packages/desktop/test/agentRunner.test.ts` 增加旧项目继续加载 Skills/MCP、且不注入 fixed archetype 环境的策略测试
- [x] T021 [P] [US3] 在 `packages/core/src/tools/game-type-classifier.test.ts` 增加缺失或非法固定值时继续使用现有模型分类路径的测试
- [x] T022 [US3] 在 `packages/desktop/test/platformer-mode-contract.test.ts` 验证 `App.tsx` 不过滤已有项目、隐藏入口不调用删除/卸载接口，且产品文案不提前承诺拖拽编辑或 AI 试玩
- [x] T023 [US3] 在 `packages/desktop/test/store.test.ts` 用旧版状态数据验证一次初始化与落盘后项目、Provider、凭据、插件和外部工具配置语义保留，且旧项目不会被补写 `productMode`

**检查点**：新旧项目策略在测试中明确分离，全部用户数据保持兼容。

---

## Phase 6：Polish 与跨故事验证

**目的**：完成全量质量门槛、真实界面检查和规格证据回填。

- [x] T024 [P] 对照 `specs/002-platformer-only-mode/contracts/product-mode.md` 与 `specs/002-platformer-only-mode/contracts/ui-surfaces.md` 完成代码审查并运行 `git diff --check`
- [x] T025 执行 `packages/desktop/package.json` 的 `typecheck`、完整 `test` 和 `build` 三项桌面质量门槛
- [x] T026 执行 `packages/core/package.json` 的 `typecheck`、完整 `test` 和 `build`，确认通用 CLI 的旧五分类没有回归
- [x] T027 按 `specs/002-platformer-only-mode/quickstart.md` 启动真实 Electron，验证首页、新建弹窗、侧栏、设置、项目兼容、应用内 Web 预览视觉状态和 60 秒进入制作界面的计时目标
- [x] T028 根据实际结果更新 `specs/002-platformer-only-mode/tasks.md` 勾选状态，并在 `specs/002-platformer-only-mode/quickstart.md` 记录任何未执行或受环境限制的验证

---

## 依赖与执行顺序

### Phase 依赖

- **Phase 1 → Phase 2**：测试入口先建立，再定义共享契约。
- **Phase 2 → US1**：固定模式常量与可选字段阻塞新项目行为。
- **US1 → US2**：产品模式实际锁定后，才能展示真实的固定模板和 Web 能力。
- **US3**：可与 US2 的 UI 实现并行，但必须在最终全量验证前完成。
- **Polish**：依赖三个用户故事全部完成。

### 用户故事依赖

- **US1（P1）**：MVP，建立新项目固定模式，无其它故事依赖。
- **US2（P1）**：依赖 US1 的真实固定模式，预览后端本身可独立测试。
- **US3（P2）**：共享数据定义完成后即可并行编写兼容测试；最终验证依赖 US1 的条件分支实现。

### 并行机会

- T004、T005、T006 可以分别在 Desktop Main、AgentRunner 和 Core 中并行写失败测试。
- T011 与 T013 可并行完成组件和样式；T012 在二者之后整合 App/侧栏。
- T016、T017 可以并行；T018 修改独立设置组件。
- T019、T020、T021 可分别验证 ProjectManager、Runtime 和 Core 的旧项目兼容路径。
- T025 与 T026 的测试可在代码完成后并行运行；T027 需使用已通过 build 的桌面产物。

## 并行示例：用户故事 1

```text
Task: "在 packages/desktop/test/projectManager.test.ts 编写新项目标记与系统约束测试"
Task: "在 packages/desktop/test/agentRunner.test.ts 编写固定 Runtime policy 测试"
Task: "在 packages/core/src/tools/game-type-classifier.test.ts 编写跳过分类模型测试"
```

## 实施策略

### MVP 优先

1. 完成 Setup 与 Foundational。
2. 先写 US1 的 Main、Runtime、Core 和 UI 失败测试。
3. 实现固定模式直到 US1 独立通过。
4. 再补 US2 的准确预览表面和 US3 的兼容证据。

### 增量交付

1. 共享可选标记确保旧数据可读。
2. Main 固定新项目，Core 确定性 platformer，形成行为闭环。
3. UI 只展示已有真实能力。
4. 兼容测试证明旧项目没有被转换或删除。
5. 通过 desktop + core 全量门槛和真实 Electron 验收后才报告完成。

## 备注

- 不删除其它 archetype、模板、插件、MCP、依赖服务或持久化设置。
- 不把 `.gameagent/project.json` 升级为完整版本化项目协议；该工作属于步骤 1.3。
- 不重写完整 Agent 流程或合并 stage；该工作属于步骤 1.4。
- 不调用付费模型做验收；固定分类测试必须证明不会发起分类模型请求。

## Phase 7: Convergence

- [x] T029 [HIGH] 为固定项目的 Agent spawn 参数显式追加空 `--allowed-mcp-server-names`，并补测试证明用户、项目和 Extension MCP 均不能进入固定 Runtime、旧项目参数保持不变 per FR-013 (partial)
- [x] T030 [MEDIUM] 将 `StateStore.upsertProject()` 改为 copy-on-write 或失败回滚，并以写入/重命名故障测试证明落盘失败后内存与后续落盘均不存在 ghost project per FR-010 (partial)
- [x] T031 [MEDIUM] 将无效、非目录、不可写或无权限的项目保存位置错误映射为可执行的中文提示，并在 ProjectManager 测试中断言具体文案且不生成项目记录 per FR-010、SC-005 (partial)
- [x] T032 [MEDIUM] 修复失败项目 upsert 与并发 `saveSettings()` / `saveMcpServers()` 的快照竞态，并用可控延迟故障及重新初始化测试证明 ghost project 不会被后续快照写回 per FR-010 (partial)
- [x] T033 [MEDIUM] 在项目文件已生成但 StateStore 落盘失败时，给出可执行的中文恢复提示，仅清理本次生成文件并保持同名重试可行，补 ProjectManager 恢复测试 per FR-010、SC-005 (partial)
- [x] T034 [LOW] 通过 `ProjectManager.create()` 注入 `EACCES` / `EPERM` / `EROFS` / `ENOSPC` / `EDQUOT` 失败，补齐具体中文文案与不调用 `upsertProject()` 的集成回归证据 per T031 (missing)
- [x] T035 [MEDIUM] 仅对带固定产品标记的项目显示“Phaser 3 · 2D 横版 / 固定骨架”阶段，legacy/未知项目继续显示原通用阶段文案，并补双分支 UI 契约测试 per US3、FR-011 (contradicts)
- [x] T036 [HIGH] 将 `StateStore.initialize()` 的读取/解析失败与规范化回写失败分离：有效旧状态遇到启动 `writeFile` / `rename` 故障时必须传播错误且不得以默认空状态覆盖原文件，故障解除后重新初始化仍完整保留项目、设置和凭据 per FR-008、SC-004 (partial)
- [x] T037 [HIGH] 将启动默认状态的触发条件限定为 `state.json` 确实 `ENOENT`；其它读取错误、JSON 解析错误或规范化错误必须传播且保持原文件字节不变，并补瞬时 `EACCES` / `EIO` 与 malformed JSON 恢复测试 per FR-008、SC-004 (partial)
- [x] T038 [MEDIUM] 在状态规范化前增加兼容型结构校验：真正缺失的旧字段仍允许走默认值，但已存在的 `projects` / `settings` / `secrets` 及关键子字段类型错误时必须拒绝初始化、不 flush 且保留原文件，补非数组项目、非对象设置/凭据与缺失旧字段的回归测试 per FR-008、SC-004 (partial)
