# 实施计划：新项目立即获得可玩模板

**分支**：`codex/platformer-only-baseline` | **日期**：2026-08-24 | **规格**：[spec.md](./spec.md)

**输入**：`specs/008-instant-playable-project/spec.md`

## 摘要

新建固定横版项目时，先保存项目名称、目录和游戏想法，再由主进程自动执行一条不使用生成式 AI 的固定准备流程：复制受信任模板、准备固定依赖、构建 Web 游戏、读取真实关卡并探测真实试玩入口。准备状态单独持久化并实时通知界面；失败时保留项目和已安全写入的文件，用户可明确重试。只有完整验证通过的新项目才开放关卡编辑、人工试玩、自动试玩和 Agent 入口。

## 技术背景

**语言/版本**：Node.js 20+、TypeScript 5.8、ES Modules、React 19

**主要依赖**：Electron 43、Vite 7、Phaser 3 固定模板、npm workspaces

**存储**：Electron `userData/state.json` 是运行状态事实来源；项目目录保存 `.gameagent/project.json` 创建快照、`src/level.json`、固定模板、依赖和 `dist/`

**测试**：Vitest 3；桌面端两个严格 TypeScript 配置；固定模板构建和可玩冒烟脚本

**目标平台**：macOS 桌面端为当前发行基线；实现保持 Windows 兼容，不新增浏览器云端服务

**项目类型**：Electron 桌面应用 + 本地 Phaser Web 游戏

**性能目标**：创建请求只等待项目记录安全落盘，不等待模板复制、依赖安装、构建或试玩验证；长时间安装和构建不阻塞 Renderer；同一项目任意时刻最多一个准备流程

**约束**：零模型调用；Renderer 不直接访问文件或进程；只执行固定模板和白名单 npm 参数；准备可观察、失败可重试；不静默覆盖历史项目；不把状态文字当作成功证据

**范围**：新增一个主进程准备服务、一组共享准备状态、一个重试 IPC、创建后的状态界面和相应测试；不增加模板种类、发布、云同步或历史项目自动迁移

## 宪章检查（调研前）

| 宪章要求             | 计划中的满足方式                                                                                       | 结果 |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 产品事实与品牌一致   | 只使用 liimit.ai；完成提示必须来自关卡读取、构建和实际 HTTP 试玩探测                                   | 通过 |
| 桌面端信任边界       | Renderer 只调用强类型 Preload API；准备、文件、命令和验证全部在 Main                                   | 通过 |
| 本地优先与显式副作用 | 新建表单明确说明首次创建会准备固定运行环境；提交创建即为该项目的显式触发，失败后的再次执行必须点“重试” | 通过 |
| 可观察、可恢复       | 状态分为排队、复制、依赖、构建、验证、成功和失败；进程中断在重启后变为可重试失败                       | 通过 |
| 凭据与插件零信任     | 不读取模型凭据、不调用模型或插件；只复用受控固定模板命令                                               | 通过 |
| 兼容性与迁移         | 新字段可选；历史记录缺少字段时按“历史项目”读取，保持旧行为且不自动写文件；增加默认值和契约测试         | 通过 |
| 证据先于交付         | 聚焦测试、双 TypeScript 检查、桌面全测/构建和真实无模型可玩冒烟均列入验收                              | 通过 |

调研前无需要豁免的宪章冲突。

## 设计

### 1. 创建与准备分离

`ProjectManager.create()` 继续负责输入校验、安全目录创建、系统提示和项目记录首次落盘。新项目记录同时带有 `starterPreparation.status = queued`。IPC 把记录返回 Renderer 后，主进程立即把该项目交给新的 `StarterPreparationService`，因此界面不会等待最长可达数分钟的依赖安装才出现项目。

创建记录本身失败时，沿用现有的安全清理；记录创建成功之后发生的模板、网络、磁盘或构建失败，不删除项目，也不清理已经安全写入的模板文件。

### 2. 单一职责的准备服务

新增可注入、可测试的 `StarterPreparationService`，按顺序调用现有能力：

1. `ProjectManager.prepareFixedProject()`：复制受信任固定模板并以受控方式准备依赖；为现有 `FixedProjectProvisioner` 增加受控阶段回调，让服务能准确区分复制和依赖阶段，但不把命令参数交给 Renderer。
2. `ProjectManager.buildFixedProject()`：执行固定构建命令并生成 `dist/`。
3. 严格读取 `src/level.json`：确认不是内存生成的默认关卡。
4. `ProjectManager.verifyPlayableBuild()`：启动临时本地服务器，真实读取 HTML 和关键游戏资源。
5. 只有四步全部成功才持久化 `ready` 并广播更新。

服务为每个项目维护 single-flight Promise。相同项目的自动开始和多次重试合并为同一次工作；不同项目的准备进入一个进程内队列，避免同时运行多个依赖安装和构建。这个队列不是后台 Agent 队列，也不改变当前 Agent 的单执行槽事实。

### 3. 状态持久化与中断恢复

准备状态作为 `ProjectRecord` 的可选子对象写入 `state.json`。`.gameagent/project.json` 保持现有“创建快照”语义，不升级为实时状态数据库。

- 新项目：创建时为 `queued`，运行时依次更新阶段。
- 新项目准备成功：`ready`。
- 可恢复错误：`failed`，保存安全、简短、中文错误和失败阶段。
- 应用关闭或崩溃：下次 `StateStore.initialize()` 把遗留的 `queued/preparing` 规范化为 `failed + interrupted`，不自动重新执行有副作用的命令。
- 历史项目：缺少 `starterPreparation` 即视为旧记录；不自动准备、不覆盖，并保持现有访问行为。

每次状态改变先增加准备状态中的单调 `revision`，再写入 StateStore，成功后才发送 `project:updated`。Renderer 只接受 revision 更新的状态，避免创建响应中的旧 queued 状态覆盖稍早收到的 preparing/ready 事件。写状态失败时不得在界面报告成功。

服务持有当前准备任务的 AbortController。应用正常退出时，Main 必须先中止队列和正在运行的准备任务，并让现有受控子进程终止逻辑收尾；异常崩溃后则依靠下次启动的 interrupted 规范化恢复，不能留下“仍在处理”的假状态。

### 4. IPC 与安全边界

Preload 新增 `retryStarterPreparation(projectId)`，映射到固定 IPC `project:retry-starter-preparation`。Main 必须验证调用来源、项目 ID 长度、项目存在、固定产品模式和当前状态；Renderer 不提供命令、包名、模板路径或参数。

自动准备由成功的 `project:create` 在 Main 内触发，不新增 Renderer 可控的“任意准备”入口。新建弹窗必须先展示依赖准备说明，用户提交后才允许 Main 启动自动准备。重试只针对已经具有准备记录且未 ready 的新项目。历史项目的主动修复入口留给后续独立功能。

### 5. Renderer 用户体验

创建弹窗在提交按钮附近说明：“创建后会自动复制固定模板并准备本地运行环境，首次可能需要联网下载固定依赖。”这让创建提交同时成为明确的依赖准备触发。

项目被选中后：

- `queued/preparing`：显示当前中文阶段和活动提示；关卡与试玩区显示准备占位，不调用 `loadLevel`，不显示默认关卡。
- `failed`：显示失败原因、失败阶段和“重试准备”按钮；保留项目资料。
- `ready`：开放真实关卡、Web 试玩、人工试玩、自动试玩和 Agent。
- 历史项目（字段缺失）：保持当前界面行为，不自动修改磁盘。

Agent 按钮对具有准备记录但尚未 ready 的新项目禁用。`AgentRunner` 现有 prepare/build 调用暂时保留为幂等防线，避免本功能改变成熟项目的 Agent 恢复路径；它不得覆盖用户已经编辑的文件。

### 6. 错误映射

服务只向 Renderer 暴露安全、可行动的中文摘要，例如网络/依赖源不可达、权限不足、空间不足、目录冲突、构建失败、验证失败和应用中断。完整子进程输出只进入受控诊断路径，不写入项目状态，不暴露路径外内容或秘密。

## 项目结构

### 本功能文档

```text
specs/008-instant-playable-project/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── starter-preparation.md
└── checklists/
    └── requirements.md
```

`tasks.md` 已在任务拆分步骤创建；实现必须按其中的阶段检查点逐项推进。

### 实际涉及的源码

```text
packages/desktop/
├── src/
│   ├── shared/types.ts
│   ├── main/
│   │   ├── agentRunner.ts
│   │   ├── main.ts
│   │   ├── preload.cts
│   │   ├── store.ts
│   │   ├── projectManager.ts
│   │   ├── fixedProjectProvisioner.ts
│   │   ├── levelDocumentStore.ts
│   │   └── starterPreparationService.ts
│   └── renderer/
│       ├── App.tsx
│       ├── styles.css
│       └── components/
│           ├── Inspector.tsx
│           ├── NewProjectDialog.tsx
│           └── StarterPreparationView.tsx
├── test/
│   ├── store.test.ts
│   ├── projectManager.test.ts
│   ├── fixedProjectProvisioner.test.ts
│   ├── levelDocumentStore.test.ts
│   ├── starterPreparationService.test.ts
│   ├── starterPreparationView.test.tsx
│   └── starter-preparation-contract.test.ts
└── scripts/
    └── playable-golden-path-smoke.mjs
```

**结构决定**：沿用现有 Electron 分层。准备编排放在 Main 的独立服务；现有 `ProjectManager` 继续封装安全文件、固定模板、构建和试玩验证；Renderer 只展示共享状态并调用 Preload。

## 验证策略

1. 共享契约：新字段类型、旧记录默认行为、非法状态拒绝、IPC 暴露面。
2. 服务单元测试：完整成功、每阶段失败、同项目去重、跨项目串行、状态落盘失败、项目切换不串写。
3. 恢复测试：遗留 `queued/preparing` 重启后变为可重试中断；`ready/failed` 保持；历史记录不被自动改写。
4. Renderer 测试：准备中无 `loadLevel/startPreview`；失败原因与重试；ready 后开放；历史项目不受新门禁影响。
5. 无模型端到端：空模型配置创建临时项目，确认调用计数为 0、磁盘存在真实关卡、构建可由真实 HTTP 入口加载。
6. 质量门槛：

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
npm run smoke:playable --workspace=@gameagent/desktop
```

若实现影响根级共享包或运行时，再补充对应根级类型检查、测试和构建；本功能不改变安装包配置，因此不默认执行 DMG 打包验证。

## 宪章检查（设计后复核）

- 没有把文件、命令或 Node 权限交给 Renderer。
- 新建表单披露依赖准备，重试需要用户主动点击；命令仍由可信固定标识映射。
- `starterPreparation` 与 Agent `status/stage` 分离，不虚构多 Agent 并发能力。
- 历史记录使用明确的兼容默认，不自动覆盖历史目录。
- ready 必须同时拥有真实关卡、成功构建和实际可读取的试玩入口。
- 计划包含契约、迁移、失败、恢复、并发和真实冒烟证据。

设计后所有门槛通过，无宪章豁免。

## 复杂度记录

无。新增独立服务和一个可选状态对象是为了遵守职责分离与兼容性要求，不引入新的应用、数据库、运行时或外部服务。
