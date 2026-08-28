# 实施证据：新项目立即获得可玩模板

## T001 开发前基线

**日期**：2026-08-24

**基线提交**：`4f25e32`

**系统**：macOS 26.5.2（Build 25F84）

**Node.js**：v24.18.1

**npm**：11.16.0

### 检查结果

| 检查                       | 命令                                               | 结果 | 证据                                                         |
| -------------------------- | -------------------------------------------------- | ---- | ------------------------------------------------------------ |
| 桌面端两套 TypeScript 检查 | `npm run typecheck --workspace=@gameagent/desktop` | 通过 | Renderer 与 Main 两个配置均无类型错误；约 3.97 秒            |
| 桌面端全部自动测试         | `npm test --workspace=@gameagent/desktop`          | 通过 | 36 个测试文件、421 项测试全部通过；0 项失败；约 4.17 秒      |
| 桌面端构建                 | `npm run build --workspace=@gameagent/desktop`     | 通过 | 1817 个 Renderer 模块完成生产构建，Main 编译成功；约 6.14 秒 |

### 基线结论

- 开始功能 008 的代码修改前，没有发现已有的类型、自动测试或桌面构建失败。
- 后续出现的相关失败应优先与本功能的新改动对照排查，不能归入未记录的旧问题。
- 本任务没有执行 `smoke:playable`、安装包构建或人工界面验收；这些检查不属于 T001，将在对应故事检查点和最终收尾任务中执行。
- 本任务没有修改产品功能，也没有调用任何生成式 AI 服务。
- 用户拥有的未跟踪 `.dockerignore` 只做了只读核对，未修改、未暂存、未提交。

## T002 准备状态契约测试

**日期**：2026-08-24

### 新增测试范围

`packages/desktop/test/starter-preparation-contract.test.ts` 现在固定检查：

- 只允许 queued、preparing、ready、failed 四种准备状态。
- 只允许 queued、模板、依赖、构建、真实关卡验证、试玩验证和完成七个阶段。
- 只允许计划中列出的稳定错误分类，不把原始日志当作错误码。
- 状态必须包含 schemaVersion、attempt、单调 revision 和用户消息，消息长度上限固定为 1000 字符。
- `ProjectRecord.starterPreparation` 必须保持可选，使历史项目记录可以继续读取。

### 失败优先证据

运行命令：

```bash
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
```

结果：1 个测试文件按预期失败，5 项新增测试全部失败。失败原因分别是共享类型、共享接口、消息长度常量和历史项目可选字段尚未实现，与 T004 的待实现范围完全一致。

这是测试先行阶段的预期红灯，不是开发前基线回归。T002 没有修改产品功能；下一步 T003 会先为 StateStore 的真实持久化兼容行为补充另一组失败优先测试。

## T003 StateStore 持久化兼容测试

**日期**：2026-08-24

### 新增测试范围

`packages/desktop/test/store.test.ts` 现在额外检查：

- 历史项目完全缺少 `starterPreparation` 时仍可读取，初始化也不会偷偷补字段或启动迁移。
- 合法的 ready 与 failed 状态在初始化、落盘和再次打开后保持原值。
- 准备状态不是对象、缺少 schemaVersion、版本不支持、状态或阶段无效时拒绝整个损坏状态文件。
- attempt 必须是正整数，revision 必须是非负整数。
- 用户消息不能超过 1000 字符。
- errorCode 以及 startedAt/finishedAt 类型无效时必须拒绝，并保留原始 `state.json` 供用户修复。

### 失败优先证据

运行命令：

```bash
npm test --workspace=@gameagent/desktop -- --run test/store.test.ts
```

结果：50 项 StateStore 测试中 34 项通过、16 项按预期失败。

- 两项新增兼容测试已经通过：历史字段缺失不会被自动补写；合法 ready/failed 数据能够跨重启保留。这是现有“保留未知字段”行为提供的兼容基础。
- 16 项损坏状态测试全部失败，统一原因是当前 StateStore 没有检查 `starterPreparation`，错误数据被当作正常状态放行。

这些失败准确对应 T005 的待实现运行时校验，不是旧测试回归。T003 没有修改产品功能；T004 将先定义共享类型，T005 再让这 16 项安全测试转绿。

## T004 共享准备状态类型

**日期**：2026-08-24

### 已实现范围

`packages/desktop/src/shared/types.ts` 现在定义：

- 固定 schemaVersion 1 和 1000 字符用户消息上限。
- queued、preparing、ready、failed 四种准备状态。
- queued、scaffold、dependencies、build、level-validation、preview-validation、complete 七个阶段。
- interrupted、network、permission、disk-space、unsafe-project、dependency、build、level-validation、preview-validation、persistence、unknown 十一种稳定错误分类。
- 包含 attempt、revision、message 和可选错误/时间字段的 `StarterPreparation`。
- `ProjectRecord.starterPreparation?` 可选字段，保证历史项目可以完全缺失该状态。
- `StarterPreparationRetryResult` 共享结果类型。

### 验证结果

```bash
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- T002 的 5 项共享契约测试全部通过。
- Renderer 与 Main 两套 TypeScript 检查全部通过。
- T003 的 16 项损坏持久化状态测试仍是预期红灯；共享类型不会自动校验磁盘 JSON，运行时校验属于下一项 T005。

### 实施顺序说明

任务清单原本把 `GameAgentAPI.retryStarterPreparation()` 也写入 T004，但真实 Main IPC 和 Preload 要到 T027-T028 才实现。为避免现在向 Renderer 暴露一个无法工作的接口，T004 只定义重试结果类型；强类型 API 方法与真实 Preload 入口保持在 T028 同步交付。该调整不改变最终接口契约。

T004 没有启动模板准备、依赖下载或 AI 服务，也没有改变当前用户界面行为。

## T005 准备状态持久化校验

**日期**：2026-08-24

### 已实现范围

`packages/desktop/src/main/store.ts` 现在会在读取和保存项目时检查 `starterPreparation`：

- 字段完全缺失时按历史项目处理，不自动添加或改写。
- 字段存在时必须是对象，且版本、状态、阶段和错误分类必须属于固定范围。
- `attempt` 必须是安全正整数，`revision` 必须是安全非负整数。
- `message` 必须是字符串且不超过 1000 字符，可选时间字段必须是字符串。
- 损坏数据会在任何回写前被拒绝，原始 `state.json` 保持不变。

### 验证结果

```bash
npm test --workspace=@gameagent/desktop -- --run test/store.test.ts
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
npm test --workspace=@gameagent/desktop
```

- StateStore 聚焦测试 50/50 通过，包括 T003 原先预期失败的 16 项损坏状态测试。
- Renderer 和 Main 两套 TypeScript 检查通过。
- 共享契约测试 5/5 通过。
- 桌面端完整回归测试 37 个文件、444 项全部通过。

T005 没有改变界面，没有开始模板复制、依赖下载或 AI 调用。

## T006 复用准备状态测试工厂

**日期**：2026-08-24

### 已实现范围

新建 `packages/desktop/test/starterPreparationFixtures.ts`，后续测试可以统一生成：

- 带 queued 准备状态的固定横版新项目。
- queued、preparing、ready 和 failed 四种状态。
- 从 queued 到 ready、阶段完整且 revision 为 0–6 严格递增的成功序列。
- 统一的创建、开始和结束时间，避免测试因当前时间而不稳定。
- 每次调用都返回新对象，不同测试不会共用同一份可变数据。

### 验证结果

```bash
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
npx eslint packages/desktop/test/starterPreparationFixtures.ts packages/desktop/test/starter-preparation-contract.test.ts --max-warnings 0
npm test --workspace=@gameagent/desktop
npm run typecheck --workspace=@gameagent/desktop
```

- 样板自检和共享契约 7/7 通过。
- ESLint 通过。
- 桌面端完整回归测试 37 个文件、446 项全部通过。
- Renderer 和 Main 两套 TypeScript 检查通过。

T006 只增加测试工具和对应自检，没有改变真实用户界面或产品运行逻辑。

## T007 新建项目和进度转发失败优先测试

**日期**：2026-08-24

### 新增契约

`packages/desktop/test/projectManager.test.ts` 新增两项测试：

- 新建项目返回值必须包含 queued/queued、attempt 1、revision 0 的版本 1 准备状态，StateStore 接收的记录和 `.gameagent/project.json` 创建快照必须与返回值一致。
- `ProjectManager.prepareFixedProject()` 必须把阶段回调传给受信任的固定模板准备器，使上层能收到 scaffold 和 dependencies 进度。

### 验证结果

```bash
npx prettier --check packages/desktop/test/projectManager.test.ts
npx eslint packages/desktop/test/projectManager.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/projectManager.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- ProjectManager 聚焦测试共 66 项：64 项旧测试通过，2 项新测试按预期失败。
- 失败 1：新项目的 `starterPreparation` 当前为 `undefined`。
- 失败 2：阶段回调当前没有被转发，收到的阶段列表为空。

这两项是失败优先开发中的预期红灯，分别由 T012 和 T013 的实现转绿。T007 只增加测试，没有改变产品运行逻辑。

## T008 固定模板准备阶段失败优先测试

**日期**：2026-08-24

### 新增契约

`packages/desktop/test/fixedProjectProvisioner.test.ts` 新增两项测试：

- 首次准备时必须先报告 scaffold，此时项目目录仍为空；模板复制完成后再报告 dependencies，此时真实模板文件已存在、`node_modules` 尚未安装。
- 固定依赖已完好时，幂等重跑仍必须依次报告 scaffold 和 dependencies，不得因跳过安装而让界面缺少阶段。
- 阶段回调每次只能收到单个受限阶段名，不接收 npm 命令、参数、模板路径或项目路径。

### 验证结果

```bash
npx prettier --check packages/desktop/test/fixedProjectProvisioner.test.ts
npx eslint packages/desktop/test/fixedProjectProvisioner.test.ts --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/fixedProjectProvisioner.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 固定模板准备器聚焦测试共 36 项：34 项旧测试通过，2 项新测试按预期失败。
- 两项失败的共同原因是当前 `FixedProjectProvisioner.prepare()` 尚未调用阶段回调，收到的报告列表为空。

这是 T013 实现前的预期红灯。T008 只增加测试，没有改变模板复制、npm 白名单或产品运行逻辑。

## T009 严格真实关卡读取失败优先测试

**日期**：2026-08-25

### 新增契约

`packages/desktop/test/levelDocumentStore.test.ts` 新增两项测试，并为后续准备验收固定严格入口名 `readRequired()`：

- `src` 目录不存在，或 `src/level.json` 不存在时，严格读取必须拒绝默认关卡回退，明确报告真实关卡文件不存在。
- 严格读取失败不得创建 `src` 目录、`level.json` 或其他文件。
- 磁盘上存在合法关卡时，严格读取必须返回该真实内容，不能用内存默认值替换。
- 现有 `read()` 的历史项目默认回退契约保持不变。

### 验证结果

```bash
npx prettier --check packages/desktop/test/levelDocumentStore.test.ts
npx eslint packages/desktop/test/levelDocumentStore.test.ts --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/levelDocumentStore.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- LevelDocumentStore 聚焦测试共 9 项：7 项旧测试通过，2 项新测试按预期失败。
- 两项失败的共同原因是当前 `LevelDocumentStore.readRequired()` 尚未实现。

这是 T014 实现前的预期红灯。T009 只增加测试，没有改变现有关卡读取、保存或用户界面行为。

## T010 准备服务成功流程失败优先测试

**日期**：2026-08-25

### 新增契约

新建 `packages/desktop/test/starterPreparationService.test.ts`，为 T015 将实现的 `StarterPreparationService` 固定三项成功契约：

- 入队后必须严格按模板复制、固定依赖、构建、`readRequired()` 真实关卡读取、真实 Web 试玩探测的顺序执行。
- 每个阶段的 revision 必须从初始 0 严格递增到 6；每次必须先成功写入 StateStore，再发送项目更新。
- 真实试玩探测被人为暂停时，最新状态只能是 preparing/preview-validation；不得提前保存或通知 ready。
- 只有探测完成后才能持久化 ready/complete/revision 6。
- 服务依赖只包含 StateStore、ProjectManager、LevelDocumentStore、项目更新回调和可测试时钟；源码不得导入 Agent、模型配置、素材生成、MCP 或 API 用量服务。

### 验证结果

```bash
npx prettier --check packages/desktop/test/starterPreparationService.test.ts
npx eslint packages/desktop/test/starterPreparationService.test.ts --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationService.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 新服务聚焦测试共 3 项，3 项全部按预期失败。
- 两项行为测试明确报告“StarterPreparationService 尚未实现”；零模型依赖测试明确报告目标源文件不存在。

这是 T015 实现前的预期红灯。T010 只建立服务合同，没有创建服务源码，没有调用 AI、npm、构建或真实网络。

## T011 新项目准备界面失败优先测试

**日期**：2026-08-25

### 新增契约

新建 `packages/desktop/test/starterPreparationView.test.tsx`，固定以下界面行为：

- queued 和 preparing 项目只渲染持久化状态中的真实中文消息，不渲染关卡布局、默认关卡、Web 试玩或自动试玩入口。
- `Inspector` 必须在包含 `loadLevel` 和 `startPreview` 副作用的 ready 工作区之外先做准备门禁，避免只隐藏画面但后台仍读取或启动试玩。
- `App.mergeProjectUpdate()` 必须按项目 ID 隔离更新；同项目的相同或更小 revision 不得覆盖当前状态，更大 revision 才能替换。
- 新建项目的返回值和 `project:updated` 异步通知必须共用同一个合并函数，防止较旧的 queued 创建响应压回较新的 preparing/ready 通知。
- ready 后继续复用当前 Inspector 的同项目 Web 预览与 iframe 内自动控制，不从 Inspector 启动 Agent。

### 验证结果

```bash
npx prettier --check packages/desktop/test/starterPreparationView.test.tsx
npx eslint packages/desktop/test/starterPreparationView.test.tsx --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationView.test.tsx
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 界面聚焦测试共 6 项：5 项按预期失败，1 项现有能力已通过。
- 失败原因是当前 Inspector 不识别准备状态、尚未拆分 ready 工作区，App 也尚未实现带 revision 保护的项目合并函数。
- 已通过项证明现有人工试玩、自动试玩共用当前项目预览，且 Inspector 不调用 `startAgent`；这部分应在实现门禁时保留。

这 5 项红灯由 T019 的界面实现转绿。T011 只增加测试，没有改变真实页面或调用任何 AI、关卡、预览接口。

## T012 新项目初始准备状态

**日期**：2026-08-25

### 已实现范围

`packages/desktop/src/main/projectManager.ts` 现在在创建新项目对象时同时写入：

- `schemaVersion: 1`
- `status: queued`
- `phase: queued`
- `attempt: 1`
- `revision: 0`
- 一条明确表示基础游戏正在排队等待准备的中文消息

该对象仍只构造一次，然后依次用于生成系统提示、写入 `.gameagent/project.json`、保存 StateStore 和返回创建结果，因此内存、创建快照和项目记录使用同一份 queued 状态。

项目记录保存失败时，现有生成元数据安全清理和用户文件保留逻辑未改变。

### 验证结果

```bash
npm test --workspace=@gameagent/desktop -- --run test/projectManager.test.ts
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts test/store.test.ts
```

- T007 的新建 queued 状态、StateStore 写入和 `.gameagent/project.json` 快照一致测试已从红灯转绿。
- ProjectManager 聚焦测试 66 项中 65 项通过；唯一失败仍是 T013 前预期保留的阶段进度转发。
- 共享准备契约和 StateStore 聚焦测试 57/57 通过。
- Renderer 和 Main 两套 TypeScript 检查通过。

T012 没有复制模板、安装依赖、启动自动准备或调用 AI；它只让新项目记录能真实表达“等待准备”。

## T013 受控模板与依赖阶段回调

**日期**：2026-08-25

### 已实现范围

`packages/desktop/src/main/fixedProjectProvisioner.ts` 现在定义受限的 `FixedProjectPreparationReporter`：

- 回调参数只能是 `scaffold` 或 `dependencies`。
- 不包含 npm 命令、安装参数、模板路径、项目路径或子进程输出。
- 先完成中止、项目目录和受信任模板读取检查，再于任何项目文件写入前等待 `scaffold` 回调。
- 受信任固定模板复制完成后、任何依赖检查或 npm 安装前等待 `dependencies` 回调。
- 依赖已完好的幂等重跑也会如实报告两个阶段。

`packages/desktop/src/main/projectManager.ts` 的 `prepareFixedProject()` 新增可选阶段回调并原样转发。旧调用没有回调时仍使用原来的两个参数，避免改变成熟 Agent 路径的调用契约。

### 验证结果

```bash
npm test --workspace=@gameagent/desktop -- --run test/fixedProjectProvisioner.test.ts test/projectManager.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- FixedProjectProvisioner 聚焦测试 36/36 通过。
- ProjectManager 聚焦测试 66/66 通过。
- T007 和 T008 剩余的 3 项阶段转发红灯全部转绿。
- Renderer 和 Main 两套 TypeScript 检查通过。

T013 没有改变受信任模板来源、npm 白名单参数、超时、中止、文件保留或幂等规则，也没有启动真实准备或调用 AI。

## T014 严格读取真实关卡文件

**日期**：2026-08-25

### 已实现范围

`packages/desktop/src/main/levelDocumentStore.ts` 现在提供 `readRequired()`：

- `src` 目录或 `src/level.json` 不存在时明确失败，不生成默认关卡，也不写入任何文件。
- 真实文件存在时，继续复用原有的目录边界、符号链接、文件类型、2 MB 大小、JSON 内容和关卡结构校验。
- 原有 `read()` 保持不变：历史项目缺少关卡文件时仍可获得默认关卡，不受新项目严格验收影响。

### 验证结果

```bash
npx prettier --check packages/desktop/src/main/levelDocumentStore.ts packages/desktop/test/levelDocumentStore.test.ts
npx eslint packages/desktop/src/main/levelDocumentStore.ts packages/desktop/test/levelDocumentStore.test.ts --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/levelDocumentStore.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- LevelDocumentStore 聚焦测试 9/9 通过，T009 的两项严格读取红灯已经转绿。
- Renderer 和 Main 两套 TypeScript 检查通过。
- 严格读取只是后续准备验收可调用的新入口；本任务没有启动安装、构建、预览或 AI。

## T015 基础游戏准备成功流程

**日期**：2026-08-25

### 已实现范围

新建 `packages/desktop/src/main/starterPreparationService.ts`，由 `StarterPreparationService.enqueue()` 按固定顺序组织现有安全能力：

1. 通过受控阶段回调依次进入 `scaffold` 和 `dependencies`。
2. 进入 `build` 后调用固定项目构建。
3. 进入 `level-validation` 后严格读取磁盘上的真实关卡。
4. 进入 `preview-validation` 后探测真实 Web 试玩入口。
5. 以上步骤全部成功后才进入 `ready/complete`。

每次阶段改变都会从当前值递增 `revision`，先通过 StateStore 持久化完整项目记录，成功后才调用项目更新通知。首次执行阶段记录 `startedAt`，完成后记录 `finishedAt`。服务只接受固定横版项目和具有准备记录的新项目。

### 验证结果

```bash
npx prettier --check packages/desktop/src/main/starterPreparationService.ts packages/desktop/test/starterPreparationService.test.ts
npx eslint packages/desktop/src/main/starterPreparationService.ts packages/desktop/test/starterPreparationService.test.ts --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationService.test.ts test/fixedProjectProvisioner.test.ts test/projectManager.test.ts test/levelDocumentStore.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- StarterPreparationService 的 3 项成功流程测试全部通过，包括真实试玩验证完成前绝不报告 ready。
- 服务源码不依赖 Agent、模型配置、素材生成、MCP 或 API 用量服务。
- 准备服务及三个底层组件的相关测试共 114/114 通过。
- Renderer 和 Main 两套 TypeScript 检查通过。

T015 只完成成功流程编排，尚未接入项目创建入口，也未实现失败分类、重试、同项目合并、跨项目串行或应用退出中止；这些属于后续明确任务。

## T016 新建项目的准备说明

**日期**：2026-08-25

### 已实现范围

`packages/desktop/src/renderer/components/NewProjectDialog.tsx` 现在在提交按钮旁明确说明：

> 创建后会自动复制固定模板并准备本地运行环境，首次可能需要联网下载固定依赖。

原有“项目保存在独立目录中”和固定引擎、类型、模板、试玩目标的边界说明继续保留。用户在提交创建前即可知道会发生本地文件复制和可能的首次联网下载。

### 验证结果

```bash
npx prettier --check packages/desktop/src/renderer/components/NewProjectDialog.tsx
npx eslint packages/desktop/src/renderer/components/NewProjectDialog.tsx --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/platformer-mode-contract.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- 固定产品模式界面契约测试 7/7 通过。
- Renderer 和 Main 两套 TypeScript 检查通过。
- T016 只增加提交前告知，没有启动准备、联网、下载、构建或 AI。

## T017 创建成功后启动后台准备

**日期**：2026-08-25

### 已实现范围

`packages/desktop/src/main/main.ts` 现在：

- 使用 StateStore、ProjectManager、LevelDocumentStore、项目更新通知和本地时钟初始化唯一的 `StarterPreparationService`。
- `project:create` 仍先等待 `ProjectManager.create()` 完成，确保项目记录和创建快照已经安全落盘。
- 创建成功后先发送 queued 项目更新，再调用 `starterPreparation.enqueue(project)` 启动准备。
- 创建 IPC 不等待 enqueue 的长流程 Promise，因此不会等待依赖安装、构建、关卡验证和试玩验证结束才返回项目。
- 后台流程通过已有 `project:updated` 事件发送每个已经成功持久化的新状态。
- 当前成功流程之外的错误只记录到 Main 日志；面向用户的失败分类和安全重试由后续 US2 任务实现。

### 验证结果

```bash
npx prettier --check packages/desktop/src/main/main.ts packages/desktop/src/main/starterPreparationService.ts
npx eslint packages/desktop/src/main/main.ts packages/desktop/src/main/starterPreparationService.ts --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationService.test.ts test/projectManager.test.ts test/levelDocumentStore.test.ts test/platformer-mode-contract.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- 准备服务、项目管理、严格关卡读取和固定产品界面的相关测试共 85/85 通过。
- Renderer 和 Main 两套 TypeScript 检查通过。
- Main 只调用本地固定准备服务，没有接入模型、Agent 或素材生成服务。

T017 尚未开放未 ready 项目的 Main 操作门禁，也尚未显示专用准备界面；分别由 T018 和 T019 完成。

## T018 未完成新项目的后台操作门禁

**日期**：2026-08-25

### 已实现范围

新建 `packages/desktop/src/main/starterPreparationGate.ts`，并在 `packages/desktop/src/main/main.ts` 的三个受信 IPC 入口中接入：

- `project:read-level`
- `project:save-level`
- `project:start-preview`

门禁规则如下：

- 缺少 `starterPreparation` 的历史项目直接放行，保持原有兼容行为。
- 新项目只有同时满足 `status = ready` 和 `phase = complete` 才允许读取关卡、保存关卡和启动 Web 试玩。
- queued 或 preparing 项目明确提示“基础游戏尚未准备完成”并引导等待。
- failed 项目明确提示“基础游戏尚未准备完成”并引导重试。
- 状态声称 ready 但阶段并非 complete 的异常记录不能绕过门禁。

这项检查位于 Main 后台权限边界，不依赖 Renderer 是否隐藏或禁用按钮。

### 验证结果

```bash
npx prettier --check packages/desktop/src/main/main.ts packages/desktop/src/main/starterPreparationGate.ts packages/desktop/test/starterPreparationGate.test.ts
npx eslint packages/desktop/src/main/main.ts packages/desktop/src/main/starterPreparationGate.ts packages/desktop/test/starterPreparationGate.test.ts --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationGate.test.ts test/starterPreparationService.test.ts test/levelDocumentStore.test.ts test/projectManager.test.ts test/levelViewer.test.tsx
npm run typecheck --workspace=@gameagent/desktop
```

- 新增后台门禁测试 6/6 通过。
- 门禁、准备服务、关卡存储、项目管理和试玩界面相关测试共 89/89 通过。
- Renderer 和 Main 两套 TypeScript 检查通过。
- T018 没有删除、覆盖或迁移历史项目，也没有调用 AI。

T018 只完成后台强制拦截；用户可见的准备状态占位和 ready 后工作区切换由 T019 完成。

## T019 准备状态界面与 revision 合并

**日期**：2026-08-25

### 已实现范围

新建 `packages/desktop/src/renderer/components/StarterPreparationView.tsx`，并完成以下界面门禁：

- queued 和 preparing 项目只显示当前持久化的中文准备消息和活动状态，不创建关卡编辑器、试玩入口或自动试玩控件。
- failed 项目显示准备未完成及项目文件仍被保留；重试按钮留给 US2 的恢复任务。
- `Inspector` 把准备门禁放在所有关卡读取和试玩副作用之外；只有 ready/complete 或缺少准备字段的历史项目才渲染原有完整工作区。
- ready 后继续使用原有同一项目预览入口，人工试玩、自动试玩和建议复测不启动 Agent。

`packages/desktop/src/renderer/App.tsx` 新增并统一使用 `mergeProjectUpdate()`：

- 异步 `project:updated` 和 `project:create` 返回值走同一套合并规则。
- 按项目 ID 定位记录，不会把一个项目的进度写到另一个项目。
- 正在准备的项目拒绝相同或更旧 revision，避免较晚返回的 queued 创建结果覆盖更快到达的新进度。
- ready 项目在保持同一准备状态的前提下，仍允许后续正常项目字段更新，为之后的同项目 Agent 操作保留兼容性。

同时在 `styles.css` 增加准备状态卡片的布局、活动图标和失败颜色。

### 验证结果

```bash
npx prettier --check packages/desktop/src/renderer/App.tsx packages/desktop/src/renderer/components/Inspector.tsx packages/desktop/src/renderer/components/StarterPreparationView.tsx packages/desktop/src/renderer/styles.css packages/desktop/test/starterPreparationView.test.tsx
npx eslint packages/desktop/src/renderer/App.tsx packages/desktop/src/renderer/components/Inspector.tsx packages/desktop/src/renderer/components/StarterPreparationView.tsx packages/desktop/test/starterPreparationView.test.tsx --max-warnings 0
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationView.test.tsx test/levelViewer.test.tsx test/playtestTelemetry.test.ts test/playtestSuggestions.test.ts test/playtestComparison.test.ts test/platformer-mode-contract.test.ts test/starterPreparationGate.test.ts
npm run typecheck --workspace=@gameagent/desktop
```

- T011 预留的准备界面测试 6/6 通过，之前的 5 项红灯全部转绿。
- 准备界面、后台门禁、关卡编辑、人工试玩和自动试玩相关测试共 81/81 通过。
- Renderer 和 Main 两套 TypeScript 检查通过。
- T019 没有启动 Agent、模型或素材生成服务，也没有读取未完成项目的关卡。

T019 完成代码级 MVP 门禁；完整构建和真实无模型项目验收由 T020 单独执行。

## T020 US1 完整构建与无模型真实项目验收

**日期**：2026-08-25

### 桌面端完整检查

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
npm run smoke:playable --workspace=@gameagent/desktop
```

- Renderer 和 Main 两套 TypeScript 检查通过。
- 桌面端 40 个测试文件、467/467 项测试通过。
- Renderer 正式构建成功，Vite 转换 1818 个模块；Main TypeScript 正式构建成功。
- 黄金路径冒烟检查复制 56 个固定模板文件，安装锁定依赖后运行模板自身 10/10 项测试，再次准备正确跳过重复安装。
- 黄金路径的固定 TypeScript/Vite 构建、本地 HTML 和 JavaScript HTTP 入口探测通过。

### 无模型真实项目准备

在系统临时目录中通过真实 `ProjectManager.create()` 创建“T020 无模型验收游戏”，再交给真实 `StarterPreparationService`：

- 状态依次为 `scaffold:1`、`dependencies:2`、`build:3`、`level-validation:4`、`preview-validation:5`、`complete:6`。
- 最终状态为 `ready/complete`。
- 创建记录加 6 次阶段状态共持久化 7 次，6 次项目通知均发生在对应状态持久化之后。
- `LevelDocumentStore.readRequired()` 读取结果与磁盘 `src/level.json` 完全一致。
- 初始真实关卡为 2400 × 720，包含 5 个对象和 1 个金币。
- 流程没有配置或调用模型、Agent、素材生成、MCP 或第三方生成式服务。

### 真实编辑与浏览器试玩

使用隔离浏览器把该项目的真实 `dist/` 加载到同一个试玩 iframe：

- 浏览器收到真实游戏 `started` 事件，初始位置为 X 120、Y 592，金币总数为 1，与磁盘关卡一致。
- 模拟人工方向键后，角色横向位置从 X 120 移动到 X 128，证明人工控制进入真实游戏。
- 同一 iframe 和同一试玩地址收到自动试玩开始指令后，报告 `active: true`、`action: move-right`，角色继续移动到 X 135。
- 通过真实关卡保存入口新增 `t020-added-coin` 后，对象数从 5 变为 6，金币数从 1 变为 2，保存读回结果与磁盘文件完全一致。
- 重新构建并刷新同一试玩入口后，浏览器新的 `started` 事件报告金币总数为 2，证明编辑保存和试玩构建读取的是同一项目内容。

浏览器截图工具第一次请求超时，因此没有把截图作为成功证据；后续验证使用浏览器真实 iframe 状态和游戏运行事件完成。该超时属于测试工具截图，不是游戏加载失败。

### 清理与结论

- 本地临时 HTTP 服务已经停止，隔离浏览器任务空间已经关闭。
- 临时验收项目没有写入正式项目列表；因直接删除被安全规则拒绝，已移动到系统废纸篓中的 `liimit-t020-validation.XM8tl3-20260825`，可恢复。
- US1 检查点通过：新项目无需 AI 即可完成固定模板准备、真实关卡读取、编辑保存、人工试玩和自动试玩。

## T021 失败恢复与并发规则失败优先测试

**日期**：2026-08-25

### 新增契约

`packages/desktop/test/starterPreparationService.test.ts` 新增 13 项测试，固定 T025 必须实现的行为：

- 网络不可达、权限不足、磁盘空间不足、项目目录不安全、固定依赖、构建、真实关卡和真实试玩失败，都要保存稳定 `errorCode` 和可执行的中文重试说明。
- 项目状态不得包含原始 Registry URL、本地私有路径、端口、密钥样例或子进程 stderr。
- 准备过程中已经安全写入的文件在失败后保持原内容，项目 ID、名称、路径和用户想法不丢失。
- 同一项目重复 enqueue 只运行一份准备流程，结果一致且不增加 attempt。
- 不同项目按进入顺序串行准备，第二个项目不能在第一个完成前进入模板或依赖操作。
- `shutdown()` 主动中止运行中的 AbortSignal，并最终保存 `failed/interrupted`。
- 如果 StateStore 本身无法保存阶段状态，则不广播未落盘状态、不继续构建或验证，并只向调用方返回脱敏的“准备状态保存失败”。

### 验证结果

```bash
npx prettier --write packages/desktop/test/starterPreparationService.test.ts
npx eslint packages/desktop/test/starterPreparationService.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationService.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 聚焦测试共 16 项：3 项已有成功流程继续通过，13 项新增测试按预期失败。
- 8 项分类失败证明服务当前仍直接抛出原始错误，没有保存 failed、稳定分类和脱敏中文说明。
- 文件保留测试当前在失败状态返回前停止；实际安全写入内容未由测试清理以外的产品逻辑删除。
- 同项目测试记录到 2 次准备调用，证明尚未实现 single-flight。
- 跨项目测试记录到两个项目同时进入，证明尚未实现全局串行队列。
- 主动中止测试明确报告 `StarterPreparationService.shutdown` 尚未实现。
- 持久化失败测试收到原始路径和 secret 样例，证明尚未实现持久化错误脱敏。

这些是 T025 实现前的预期红灯。T021 只增加测试，没有改变当前产品运行行为、文件处理或 AI 调用。

## T022 应用重启中断恢复失败优先测试

**日期**：2026-08-25

### 新增契约

`packages/desktop/test/store.test.ts` 新增三项启动恢复测试：

- 遗留 queued 项目在 StateStore 初始化时转为 `failed/interrupted`，保留 `phase = queued` 和 attempt，revision 只增加 1，并记录脱敏中文重试说明与 finishedAt。
- 遗留 preparing 项目同样转为 `failed/interrupted`，保留最后执行阶段、attempt 和原 startedAt，revision 只增加 1。
- 转换后的状态必须写回 `state.json`；再次打开时保持完全相同，不能重复增加 revision 或改变 finishedAt。
- ready、failed 和缺少准备字段的历史项目保持原记录，不自动增加准备状态。
- StateStore 初始化不得进入任何项目目录、自动重跑模板/依赖/构建，测试项目目录中的用户文件内容和文件列表必须原样保留。

### 验证结果

```bash
npx prettier --check packages/desktop/test/store.test.ts
npx eslint packages/desktop/test/store.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/store.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- StateStore 聚焦测试共 53 项：51 项通过，2 项新增转换测试按预期失败。
- queued 项目仍以 queued/revision 0 返回，没有 `interrupted`、finishedAt 或重试说明。
- preparing 项目仍以 preparing/revision 8 返回，没有 `interrupted`、finishedAt 或重试说明。
- ready、failed、历史项目和项目目录零改写测试已通过，证明新测试没有破坏现有兼容与文件保护能力。

这两项是 T026 实现前的预期红灯。T022 只增加测试，没有改变启动恢复、项目文件或 AI 行为。

## T023 重试 IPC 与退出中止失败优先契约测试

**日期**：2026-08-25

### 新增契约

`packages/desktop/test/starter-preparation-contract.test.ts` 新增七项后台入口测试，固定 T027 必须实现的行为：

- 后台只注册一个固定的“重新准备基础游戏”入口，界面只能传项目 ID，不能传模板、命令或依赖列表。
- 项目 ID 必须先检查为非空文本且不超过 160 个字符，然后才能读取项目。
- 只允许固定横版模式的新项目使用重试；旧项目没有准备记录时必须拒绝，不能偷偷改变旧项目。
- 已经 ready 的项目不重复准备，立即返回 `accepted: false`。
- 可以重试的项目交给应用中唯一的准备服务，并立即返回 `accepted: true`，不能让界面一直等待整套安装和构建结束。
- queued、preparing 和用户快速重复点击都交由同一个服务合并，不能在入口里新建第二套准备流程。
- 应用退出时先停止准备队列及它管理的子进程，再关闭其他后台任务并保存事件。

### 验证结果

```bash
npx prettier --check packages/desktop/test/starter-preparation-contract.test.ts
npx eslint packages/desktop/test/starter-preparation-contract.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 聚焦测试共 14 项：原有 7 项继续通过，新增 7 项按预期失败。
- 其中 6 项明确报告“重试准备 IPC 尚未实现”，1 项证明应用退出时尚未调用准备服务的 `shutdown()`。
- 失败范围与 T027 将要实现的后台重试入口和退出清理完全一致，没有出现测试语法、类型或原有契约回退问题。

这些是 T027 实现前的预期红灯。T023 只增加测试和验证记录，没有改变产品运行行为、项目文件或 AI 调用。

## T024 准备失败与重试界面失败优先测试

**日期**：2026-08-25

### 新增契约

`packages/desktop/test/starterPreparationView.test.tsx` 新增八项界面检查，固定 T028/T029 必须实现的用户行为：

- failed 项目直接显示后台保存的可执行中文原因，并明确说明项目资料和已经安全写入的文件仍然保留。
- 测试渲染前后对比完整 `ProjectRecord`，确认展示失败界面本身不会改变项目名称、目录、游戏想法或准备状态。
- failed 状态只显示一个含义明确的“重试准备”按钮；queued、preparing 和 ready 都不能显示该按钮。
- 点击重试只能把当前项目 ID 交给受控 API，不能从界面传入命令、模板或其他参数；错误继续走应用已有错误提示。
- 重试请求没有返回时按钮必须禁用，避免快速重复点击；无论成功还是失败，结束后都要解除禁用。
- 切换项目时以 `project.id` 重置重试按钮的局部状态；异步项目更新继续按自身项目 ID 合并，不能覆盖另一个项目。

### 验证结果

```bash
npx prettier --write packages/desktop/test/starterPreparationView.test.tsx
npx eslint packages/desktop/test/starterPreparationView.test.tsx --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationView.test.tsx
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 聚焦测试共 14 项：10 项通过，4 项新增测试按预期失败。
- 已通过：原有 6 项准备门禁和 revision 规则，以及失败原因、文件保留提示、非 failed 状态无重试按钮、按项目 ID 合并更新。
- 预期失败：failed 尚无“重试准备”按钮；组件尚未接收项目 ID 和调用重试 API；尚无请求期间按钮禁用及结束解锁；切换项目尚未通过 key 重置重试按钮状态。

这些红灯对应 T028/T029 将要补齐的界面重试通路。T024 只增加测试和验证记录，没有改变当前界面、项目数据或 AI 行为。

## T025 后台失败恢复与安全排队服务

**日期**：2026-08-26

### 已实现行为

`packages/desktop/src/main/starterPreparationService.ts` 现在负责完整的失败恢复和任务协调：

- 同一个项目在准备期间再次 enqueue，会直接复用已经存在的任务结果，不会再复制模板、安装依赖或构建第二次。
- 不同项目共用一个按进入顺序执行的队列，前一个项目结束后下一个项目才开始修改文件和运行固定命令。
- failed 项目真正开始重试时先转回 queued，`attempt` 只增加 1，旧的 `errorCode`、开始时间和结束时间被清除；快速重复请求不重复增加次数。
- 网络、权限、磁盘空间、不安全目录、固定依赖、构建、真实关卡、真实试玩和应用中断会转换为稳定错误分类。
- 项目状态只保存固定、简短、可执行的中文说明，不保存 Registry URL、端口、本机私有路径、密钥样例或子进程 stderr。
- 任一执行阶段失败后持久化 `failed`、最后阶段、错误分类和完成时间，并保留原项目资料及已经安全写入的文件。
- `shutdown()` 会阻止新任务、向当前任务的 `AbortController` 发出中止信号，并等待运行中和已排队任务安全结束。
- 如果准备状态本身无法写入 StateStore，服务停止后续构建和验证、不广播未落盘状态，只向调用方抛出脱敏的“准备状态保存失败”。
- ready 项目不会被服务重复准备。

### 验证结果

```bash
npx prettier --write packages/desktop/src/main/starterPreparationService.ts packages/desktop/test/starterPreparationService.test.ts
npx eslint packages/desktop/src/main/starterPreparationService.ts packages/desktop/test/starterPreparationService.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationService.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 服务聚焦测试 17/17 通过；T021 的 13 项预期红灯全部转绿，原有 3 项成功流程继续通过。
- 新增 1 项实现期测试直接确认 failed 项目的重复重试只把 attempt 从 1 增加到 2，并清除上一次失败字段。
- 文件保留测试使用真实临时文件，失败后内容仍为 `safe generated content`。
- 并发测试确认同项目只调用一次准备流程，不同项目严格按 first-project、second-project 顺序进入。
- 中止测试确认活动信号变为 aborted，最终项目状态为 `failed/scaffold/interrupted`。

本项没有接入 Renderer、Preload 或新的 IPC，因此用户暂时还看不到重试按钮；入口将在 T027/T028/T029 接通。没有调用 Agent、模型、素材生成、MCP 或第三方生成服务。桌面端完整测试暂未执行，因为 T022、T023、T024 留下的恢复、IPC 和界面失败优先测试仍需后续任务逐项转绿；完整回归安排在 T030。

## T026 应用重启后的准备中断恢复

**日期**：2026-08-26

### 已实现行为

`packages/desktop/src/main/store.ts` 在读取并验证 `state.json` 后执行一次纯数据恢复：

- 上次关闭时仍为 queued 的项目转换为 `failed/queued/interrupted`。
- 上次关闭时仍为 preparing 的项目转换为 `failed/<最后阶段>/interrupted`，保留原来的 phase、attempt 和 startedAt。
- 恢复时 revision 只增加 1，写入脱敏中文说明、finishedAt 和新的项目 updatedAt。
- 转换结果通过 StateStore 原有原子写入流程保存回 `state.json`；再次打开时已经是 failed，因此不会重复转换、重复增加 revision 或改变 finishedAt。
- ready、普通 failed 和缺少 `starterPreparation` 的历史项目保持原记录。
- 原有 Agent `running/waiting -> stopped` 启动恢复仍然保留，并可与基础游戏中断恢复同时工作。
- 恢复逻辑只处理内存中的项目记录和应用状态文件，不读取、不写入、不删除项目目录内的任何文件，也不自动重新运行模板、依赖或构建。

### 验证结果

```bash
npx prettier --write packages/desktop/src/main/store.ts
npx eslint packages/desktop/src/main/store.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/store.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- StateStore 聚焦测试 53/53 全部通过。
- T022 留下的 queued 和 preparing 两项预期红灯均已转绿。
- 重开测试确认第一次恢复后的完整记录在第二次初始化时原样保持。
- 文件保护测试确认项目目录仍只有原来的 `user-level.txt`，内容完全不变。
- ready、failed、历史项目兼容测试继续通过。

本项没有启动准备服务、Agent、模型、网络请求或外部命令；用户仍需等待 T027～T029 接通重试入口和界面按钮。

## T027 后台重试入口与退出清理

**日期**：2026-08-26

### 已实现行为

`packages/desktop/src/main/main.ts` 新增受信任 IPC `project:retry-starter-preparation`：

- 继续通过 `secureHandle` 验证调用来自 liimit.ai 自己的受信页面。
- 唯一输入是项目 ID；先检查为非空字符串且不超过 160 个字符，再读取 StateStore 中的真实项目。
- 再次确认项目属于固定 Phaser 3 · 2D 横版模式。
- 缺少 `starterPreparation` 的历史项目明确拒绝，不能通过这个新入口静默复制模板或修改旧项目。
- 已经 ready 的项目立即返回 `{ accepted: false, project }`，不进入准备服务。
- queued、preparing 和 failed 项目交给应用启动时创建的唯一 `StarterPreparationService`；入口立即返回 `{ accepted: true, project }`，不等待安装和构建完成。
- Renderer 无法提供模板路径、命令、参数、包名或依赖列表；这些仍全部由可信后台固定控制。
- 应用 `before-quit` 清理现在先等待 `starterPreparation.shutdown()`，之后才停止 Agent、保存事件和 API 用量并关闭预览。

测试中的入口源码查找同时调整为兼容 Prettier 的合法换行，不再依赖通道名称必须与 `secureHandle(` 出现在同一行；契约断言本身未放宽。

### 验证结果

```bash
npx prettier --check packages/desktop/src/main/main.ts packages/desktop/test/starter-preparation-contract.test.ts
npx eslint packages/desktop/src/main/main.ts packages/desktop/test/starter-preparation-contract.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 重试 IPC 聚焦契约测试 14/14 全部通过。
- T023 留下的 7 项预期红灯全部转绿：安全固定入口、ID 先校验、固定模式、历史项目拒绝、ready 不执行、重复请求委托 single-flight、退出先中止准备。

本项只建立 Main 后台入口；Preload 尚未向 Renderer 暴露这个能力，用户界面也仍然没有按钮。它们分别属于 T028 和 T029。本项没有调用 AI、模型或任何生成服务。

## T028 Renderer 到 Main 的最小权限重试桥梁

**日期**：2026-08-26

### 已实现行为

- `GameAgentAPI` 新增强类型方法 `retryStarterPreparation(projectId: string): Promise<StarterPreparationRetryResult>`。
- `packages/desktop/src/main/preload.cts` 把该方法固定映射到 `project:retry-starter-preparation` IPC。
- Renderer 只能提交一个字符串项目 ID，并只能收到 `{ accepted, project }` 结构。
- Preload 没有暴露模板目录、文件路径、可执行命令、参数、包名或依赖列表。
- 这是对现有 Preload API 的向后兼容新增；已有方法、历史项目数据和持久化格式均未改变。
- 新增两项契约测试，分别锁定共享接口签名和 Preload 的最小参数映射。

### 验证结果

```bash
npx prettier --write packages/desktop/src/shared/types.ts packages/desktop/src/main/preload.cts packages/desktop/test/starter-preparation-contract.test.ts
npx eslint packages/desktop/src/shared/types.ts packages/desktop/src/main/preload.cts packages/desktop/test/starter-preparation-contract.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 基础游戏准备契约测试 16/16 全部通过，其中包含 2 项新增 Preload 最小权限检查。
- 强类型检查同时确认 Renderer、Preload 和 Main 对返回结果的理解一致。

本项只接通安全调用能力，尚未修改 React 界面，因此用户仍看不到“重试准备”按钮；按钮和项目切换保护属于 T029。本项没有调用 AI、模型、网络服务或外部命令。

## T029 可理解、可重试的准备失败界面

**日期**：2026-08-26

### 已实现行为

`StarterPreparationView` 现在完整展示准备与失败恢复状态：

- queued、scaffold、dependencies、build、level-validation、preview-validation 和 complete 都映射为用户可理解的中文“当前阶段”。
- failed 状态继续直接展示 Main 已脱敏的可行动中文原因，并明确说明项目资料和已经安全写入的文件仍然保留。
- 只有 failed 状态出现一个“重试准备”按钮；queued、preparing 和 ready 不出现该按钮。
- 点击按钮只调用 `window.gameAgent.retryStarterPreparation(projectId)`，不提交其他参数；IPC 错误进入应用原有错误提示并移除 Electron 包装前缀。
- 请求未返回期间按钮禁用并显示“正在提交重试…”，无论请求成功或失败都在 finally 中解除禁用。
- `Inspector` 以 `project.id` 作为准备界面的 key，并显式传入当前项目 ID；切换项目会重新建立按钮局部状态，旧项目的等待状态不会留在新项目上。
- App 原有 `mergeProjectUpdate` 继续同时用于创建返回和 `project:updated` 异步事件，并按项目 ID 与单调 revision 拒绝串写和旧更新覆盖。
- 新增当前阶段和重试按钮样式，沿用既有颜色、禁用状态和焦点可见规则。

修正了 T024 测试中一处此前被前置红灯遮住的调用错误：现在先取得 `mergeProjectUpdate` 函数，再传入两个项目和异步更新；断言内容没有放宽。

### 验证结果

```bash
npx prettier --check packages/desktop/src/renderer/components/StarterPreparationView.tsx packages/desktop/src/renderer/components/Inspector.tsx packages/desktop/src/renderer/styles.css packages/desktop/test/starterPreparationView.test.tsx
npx eslint packages/desktop/src/renderer/components/StarterPreparationView.tsx packages/desktop/src/renderer/components/Inspector.tsx packages/desktop/test/starterPreparationView.test.tsx --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starterPreparationView.test.tsx
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 准备界面聚焦测试 14/14 全部通过。
- T024 留下的 4 项界面预期红灯全部转绿：唯一重试按钮、只传项目 ID、请求期间禁用并解锁、项目切换重置且按 ID 合并。
- 原有准备门禁、ready 后编辑/试玩和 revision 防乱序测试继续通过。

本项没有改变项目文件、准备命令或 AI 行为。US2 的功能代码已接通；完整测试、构建以及断网、权限、空间、中断、文件保留和跨项目综合验收属于下一项 T030。

## T030 US2 失败恢复综合验收

**日期**：2026-08-26

### 验收环境

- 系统：macOS 26.5.2（Build 25F84）
- Node.js：v24.18.1
- npm：11.16.0
- 工作区：`packages/desktop` 0.2.2

### 专项测试

```bash
npm test --workspace=@gameagent/desktop -- --run \
  test/starterPreparationService.test.ts \
  test/store.test.ts \
  test/starter-preparation-contract.test.ts \
  test/starterPreparationView.test.tsx
```

- 4 个专项测试文件全部通过，共 100/100 项。
- 服务：17/17；StateStore：53/53；Main/Preload 契约：16/16；Renderer 界面：14/14。

### 失败与恢复矩阵

| 场景         | 受控模拟                                                                    | 实际验证结果                                                                                                    |
| ------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 断网         | dependencies 阶段抛出 `ENETUNREACH`，原始错误含 Registry URL 和 secret 样例 | 保存为 `failed/dependencies/network`；中文说明引导检查网络后重试；URL 和 secret 未进入项目状态                  |
| 权限不足     | scaffold 阶段抛出 `EACCES`，原始错误含本机私有路径                          | 保存为 `failed/scaffold/permission`；提示检查目录读写权限；私有路径未暴露                                       |
| 空间不足     | dependencies 阶段抛出 `ENOSPC`                                              | 保存为 `failed/dependencies/disk-space`；提示清理磁盘空间后重试                                                 |
| 应用中止     | 活动准备等待 AbortSignal，同时调用 `shutdown()`                             | signal 确认为 aborted；最终保存 `failed/scaffold/interrupted`；中文说明允许重试                                 |
| 重启恢复     | state.json 中分别遗留 queued 和 preparing                                   | 初始化时只转换一次为 `failed/interrupted`；保留最后阶段、attempt、startedAt；第二次打开完全不变且不自动运行命令 |
| 文件保留     | scaffold 后真实写入临时文件，再在 dependencies 模拟空间失败                 | 项目 ID、名称、目录、游戏想法不变；真实文件仍存在且内容仍为 `safe generated content`                            |
| 重复重试     | 同一项目在第一份任务阻塞时连续 enqueue                                      | 准备入口只调用 1 次；两个请求得到同一结果；首次 attempt 保持 1，失败项目重试只从 1 增为 2                       |
| 多项目       | first-project 阻塞期间 enqueue second-project                               | 第二个项目没有提前进入；顺序严格为 first-project、second-project                                                |
| 状态保存失败 | StateStore 写入抛出包含路径和 secret 的错误                                 | 不广播、不继续构建/关卡/试玩验证，只返回脱敏的“准备状态保存失败”                                                |
| 界面恢复     | failed、快速点击、项目切换和乱序 revision                                   | 只显示一个重试按钮；请求期间禁用；切换项目重置局部状态；旧或同 revision 不覆盖最新状态                          |

这些模拟均在测试替身和系统临时目录内完成。没有真实断开本机网络、修改系统目录权限或填满磁盘，因此不会破坏开发机器；错误代码、执行阶段、持久化结果和用户文案与真实系统错误进入服务后的处理路径相同。

### 桌面端完整门槛

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
```

- Renderer 和 Main 两套 TypeScript 类型检查通过。
- 桌面端完整测试 40 个文件、501/501 项通过。
- 正式 Renderer 构建成功，Vite 7.3.2 转换 1818 个模块并生成 HTML、CSS 和 JavaScript 产物。
- Main TypeScript 正式构建成功。
- 没有执行安装包制作、签名或公证；本任务改变的是应用内恢复流程，不是发行安装包，安装包验证不属于 T030 范围。
- 没有调用 Agent、文字/图片/音频/视频模型、MCP 或第三方生成式服务。

### US2 结论

US2 检查点通过：准备过程有明确阶段；失败后项目和安全文件仍在；用户无需重新填写新建表单；同项目重复请求不会并发；不同项目不会同时修改；应用中断后不会永久转圈，并能通过唯一的安全入口手动重试。完整桌面端测试与正式构建未发现回归。

## T031 可选 Agent 的 ready 门禁失败优先契约测试

**日期**：2026-08-26

### 新增契约

`packages/desktop/test/starter-preparation-contract.test.ts` 新增三项 Agent 启动规则：

- `agent:start` 必须先校验输入，再按项目 ID 读取 StateStore 中的真实项目，然后调用统一的 `requireReadyStarterProject(project, '启动 Agent')`，最后才允许进入现有 `runner.start(input)`。
- queued、preparing 和 failed 的新项目都必须由同一个后台 ready 门禁拒绝，不能只靠界面禁用按钮。
- `StarterPreparationProtectedAction` 必须明确支持“启动 Agent”，让等待和重试提示都能说明用户下一步。
- ready/complete 新项目继续允许使用；缺少 `starterPreparation` 的历史项目继续直接返回原项目，保持上线前的 Agent 行为。

### 验证结果

```bash
npx prettier --write packages/desktop/test/starter-preparation-contract.test.ts
npx eslint packages/desktop/test/starter-preparation-contract.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/starter-preparation-contract.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- 聚焦契约测试共 19 项：17 项通过，2 项新增测试按预期失败。
- 已通过：ready 新项目和历史项目都被现有通用门禁放行；queued、preparing、failed 的门禁判断本身正确；T023/T028 的重试 IPC 和 Preload 契约继续通过。
- 预期失败 1：当前 `agent:start` 仍直接调用 `runner.start(validateStartAgentInput(input))`，尚未读取项目和执行 ready 门禁。
- 预期失败 2：`StarterPreparationProtectedAction` 尚未包含“启动 Agent”。

这两项红灯对应 T034 的 Main 后台实现。T031 只增加测试和验证记录，没有改变 Agent、项目文件、模型配置或当前产品行为，也没有调用任何 AI 服务。

## T032 Agent 同项目继续与用户关卡保留回归测试

**日期**：2026-08-26

### 新增回归场景

`packages/desktop/test/agentRunner.test.ts` 新增一个使用真实临时文件、StateStore 替身和假 Runtime 子进程的 ready 项目启动场景：

- 在临时项目的真实 `src/level.json` 写入带 `user-edited-platform` 的用户关卡内容。
- 启动前同时记录文件原文和 SHA-256 指纹。
- 项目带有 `ready/complete` 准备状态，之后主动调用 `AgentRunner.start()`。
- 记录 Store 查询收到的项目 ID、每次持久化的项目 ID/路径、准备器收到的项目对象，以及 Runtime 启动的 `cwd`。
- 准备替身模拟写入 `.gameagent/dependencies.json`，并在准备动作前后分别检查用户关卡 SHA-256。
- Agent 启动成功后再次读取真实文件，并比较原文和 SHA-256；最后关闭假 Runtime 并等待状态正常收敛。

### 验证结果

```bash
npx prettier --write packages/desktop/test/agentRunner.test.ts
npx eslint packages/desktop/test/agentRunner.test.ts --max-warnings 0
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop -- --run test/agentRunner.test.ts
npm test --workspace=@gameagent/desktop -- --run test/fixedProjectProvisioner.test.ts
```

- Prettier、ESLint、Renderer/Main TypeScript 检查通过。
- AgentRunner 聚焦测试 30/30 通过，其中新增同项目回归测试直接通过。
- Store 首次查询使用 `same-ready-project`；准备器和 Runtime 工作目录都使用原项目目录；所有持久化记录的 ID 和路径保持不变。
- `src/level.json` 在 Agent 启动准备前后原文完全一致，SHA-256 完全一致。
- 真实 `FixedProjectProvisioner` 测试 36/36 通过，包含已有用户游戏文件、小文件和大文件保留规则，为准备替身的行为提供真实实现旁证。

本项没有出现新的预期红灯：现有 AgentRunner 已沿用同一项目，现有固定准备器也已保留与模板不同的用户文件。本任务把这一现有正确行为固定成回归契约，防止 T035 或以后重构时退化。测试只使用假 Runtime，没有发出模型或网络请求，也没有修改正式用户项目。

## T033 可选 Agent 界面失败优先测试

**日期**：2026-08-26

`starterPreparationView.test.tsx` 新增 3 项规则：queued、preparing、failed 禁用 Agent，ready 和历史项目启用；输入框和按钮必须同时受门禁控制；界面必须说明“基础游戏完成后可选择让 AI 继续修改”以及“AI 可能修改当前项目文件”。Prettier、ESLint 和两套 TypeScript 检查通过。聚焦测试共 17 项，原有 14 项通过，新增 3 项按预期失败，分别对应 T036 尚未实现的 `canStartAgent`、控件禁用和风险说明。本项仅增加测试，没有调用 AI 或改变产品行为。

## T034 Main Agent ready 门禁

**日期**：2026-08-26

`agent:start` 现在先校验输入、按 ID 读取真实项目、调用 `requireReadyStarterProject(project, '启动 Agent')`，通过后才进入现有单执行槽 Runner。通用门禁操作类型新增“启动 Agent”。queued/preparing 会提示等待，failed 会提示先重试，ready/complete 和缺少准备字段的历史项目继续放行；Renderer 无法绕过后台门禁。Prettier、ESLint、两套 TypeScript 以及契约/门禁聚焦测试均通过，共 25/25 项；T031 的 2 项红灯转绿。本项未调用模型，也未改变现有单 Agent 执行槽。

## T035 Agent 同项目身份加固

**日期**：2026-08-26

AgentRunner 在启动时固定原项目 ID 和路径，并在固定准备完成后再次核对；Runtime `cwd` 和系统提示准备都使用该固定目录。最终受控构建后也再次核对项目身份。如果内部步骤意外改变 ID 或目录，Runner 立即停止并提示“避免修改错误的项目”。新增身份守卫测试覆盖相同身份放行、ID 改变拒绝、路径改变拒绝。AgentRunner 与真实固定准备器聚焦测试共 69/69 通过；T032 的真实临时 `src/level.json` 原文/SHA-256 回归继续通过，固定准备器的用户文件保留测试也继续通过。该加固不复制或恢复用户文件，避免覆盖并发编辑；文件不变由固定准备器的幂等复制规则和受控 build 只生成 dist 的契约保证。没有调用真实模型或网络服务。

## T036 可选 Agent 界面门禁与风险说明

**日期**：2026-08-26

App 新增可测试的 `canStartAgent`：未选项目、queued、preparing、failed 返回 false；ready/complete 和历史项目返回 true。未 ready 时 Agent 输入框和启动按钮同时禁用，快捷键也不能绕过，输入提示改为等待基础游戏完成。ready 后界面明确显示“AI 是可选步骤；启动后 AI 可能修改当前项目文件”；未 ready 时显示“基础游戏完成后可选择让 AI 继续修改”。界面聚焦测试 17/17 通过，T033 的 3 项红灯全部转绿；Prettier、ESLint 和两套 TypeScript 检查通过。没有自动启动 Agent 或发送用户想法给模型。

## T037 US3 可选 Agent 综合验收

**日期**：2026-08-26

### 专项验证

```bash
npm test --workspace=@gameagent/desktop -- --run \
  test/starter-preparation-contract.test.ts \
  test/starterPreparationGate.test.ts \
  test/agentRunner.test.ts \
  test/fixedProjectProvisioner.test.ts \
  test/starterPreparationView.test.tsx
```

- 5 个文件、111/111 项通过。
- 后台与界面都拒绝未 ready 新项目启动 Agent，ready 和历史项目保持允许。
- ready 后关卡编辑、Web 试玩和自动试玩门禁独立开放；界面契约确认自动试玩不调用 `window.gameAgent.startAgent`。
- Agent 启动沿用同一项目 ID、同一目录和同一 Runtime `cwd`，没有创建替代项目。
- 真实临时 `src/level.json` 的用户编辑原文和 SHA-256 在启动前准备后保持一致。
- 固定准备器保留已有小文件、大文件和与模板不同的游戏文件；受控构建只生成构建产物。
- Agent 身份守卫允许相同 ID/路径，并拒绝任何 ID 或目录变化。

### 完整质量门槛

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
```

- Renderer/Main TypeScript 全部通过。
- 桌面端 40 个测试文件、511/511 项全部通过。
- Vite 7.3.2 正式构建成功，转换 1818 个模块；Renderer HTML/CSS/JavaScript 产物和 Main 编译产物均成功生成。
- 测试使用假 Runtime 和本地临时文件；没有真实模型请求、Provider 调用、素材生成、MCP 或第三方生成式服务。

### US3 结论

US3 检查点通过：不使用 AI 时，基础关卡编辑、人工试玩和自动试玩独立可用；只有用户主动选择后才启动 Agent；准备期间前后台双重禁止；启用后明确提示可能修改项目文件；Agent 在原项目继续，并保留用户已有编辑。历史项目和现有单 Agent 执行槽行为没有改变。

## T038 旧规格与当前行为对齐

**日期**：2026-08-26

已修正 `specs/004-playable-golden-path/spec.md` 中“用户必须先启动第一个 Agent，系统才准备模板”的旧描述。文档现在明确：本功能上线后创建、带 `starterPreparation` 状态的新项目，会在项目记录安全保存后自动复制固定模板、准备依赖、构建并验证试玩，不依赖 Agent；没有该字段的历史项目不会被后台自动复制、安装或改写，用户主动启动 Agent 时仍保留原有幂等准备保护。`git diff --check` 通过，本项只修正文档，没有执行模型调用或改变运行时代码。

## T039 真实新项目黄金路径冒烟扩展

**日期**：2026-08-26

`playable-golden-path-smoke.mjs` 不再用手写的临时游戏覆盖固定模板，而是走与产品相同的 `ProjectManager.create()`、`StarterPreparationService`、`LevelDocumentStore.readRequired()`、受控构建和安全预览流程。一次运行现覆盖：

- 模型、图片、视频、音频配置全部为空时创建 queued 新项目。
- 不启动 Agent，按 scaffold → dependencies → build → level-validation → preview-validation → complete 顺序进入 ready。
- 从项目磁盘严格读取 2400 × 720、5 个对象并包含出生点、地面、尖刺、金币、终点的真实 `src/level.json`。
- 固定模板 10/10 项测试通过，重复准备确认锁定依赖为 ready，没有重复安装。
- 人工试玩与自动试玩复用同一个真实本地 Web 地址，两个读取结果完全相同；`/__liimit/level.json` 与磁盘真实关卡一致，构建脚本包含自动试玩控制和状态回传协议。
- 显式统计主模型、图片、视频和音频生成式调用总数为 0。
- 模拟最终 Web 试玩验证失败，结果为 `failed/preview-validation`，所有通知中均没有 ready。

首次独立执行耗时约 19.4 秒、退出码 0；共持久化 13 次项目状态。测试产生的临时项目和预览服务均已自动清理，没有调用任何 AI 或付费服务。

## T040 最终桌面端自动检查

**日期**：2026-08-26

在仓库根目录依次完整执行以下命令，全部退出码为 0：

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
npm run smoke:playable --workspace=@gameagent/desktop
```

- TypeScript：Renderer 与 Main 全部通过，实际耗时 2.86 秒。
- 测试：40/40 个测试文件、511/511 项通过，实际耗时 3.73 秒。
- 正式构建：Vite 7.3.2 转换 1818 个模块，Renderer 与 Main 产物均成功，实际耗时 5.23 秒。
- 黄金路径 smoke：真实新项目安装 173 个锁定依赖、完成模板构建，模板 3/3 个文件、10/10 项测试通过；空模型配置、真实关卡、共用试玩入口、AI 调用 0 次和失败不误报均通过，实际耗时 18.11 秒。
- 四项合计墙钟时间约 29.93 秒。

未执行项：本任务没有构建 macOS/Windows 安装包，也没有连接真实模型或素材 Provider；它们不属于“新项目立即可玩”功能的桌面端自动门槛，且用户没有授权付费生成式调用。真实浏览器玩法与人工故障场景由 T041 单独记录。

## T041 Quickstart 人工与可复核场景验收

**日期**：2026-08-26

**环境**：macOS，Node.js/npm 使用当前仓库开发环境；所有模型与素材生成配置为空。

### 场景 A：真实浏览器成功路径

保留新版 smoke 创建的临时 `GoldenPathGame`，用只服务该项目 `dist/` 和 `src/level.json` 的本地验收服务加载真实游戏，再使用隔离 Chromium 浏览器操作同一个 iframe：

- 页面标题为“liimit.ai 浏览器验收”，iframe 地址为同一项目本地入口，检测到 1 个真实 Phaser canvas。
- 浏览器收到 `started`：初始 X=120、Y=592、金币总数=1，与真实 `src/level.json` 一致。
- 聚焦画布并实际按住右方向键后，位置由 X=120 移到 X=136，证明人工键盘控制有效。
- 不启动 Agent，在同一 iframe 发送固定自动试玩开始指令；游戏回报 `active=true/action=move-right`，角色继续移动到 X=151。
- 人工与自动阶段使用同一个 iframe、同一个 Web 地址和同一组实时事件；生成式 AI 调用为 0。

浏览器截图调用因 `Page.captureScreenshot` 在 15 秒后超时而未生成图片；游戏页面、canvas、人工坐标变化和自动试玩事件均由浏览器实时读回，构成可复核结果。截图超时是浏览器工具问题，不是游戏加载或控制失败。

### 场景 B–E：恢复、保护与真实完成门槛

按照 Quickstart 的关键操作，以真实临时文件和受控故障替身逐项重放以下聚焦场景：

```bash
npx vitest run test/starterPreparationService.test.ts test/store.test.ts \
  -t '真实试玩探测完成前|失败项目真正重试|主动关闭服务|启动时将遗留|重启恢复不改'
```

2 个测试文件通过，共 6/6 个被选场景通过：

- **失败重试**：failed 项目重试时 attempt 只增加一次，旧错误被清除；重复请求不会启动两份任务。
- **应用中断**：主动关闭会中止真实 AbortSignal 并保存 `failed/interrupted`；重新打开时 queued 与 preparing 各自一次性恢复为可重试的 interrupted，而不是永久转圈或自动重跑。
- **历史项目保护**：重启恢复不改变 ready、failed 或无准备字段的历史项目，也不改变项目目录里的用户文件。
- **假成功拦截**：真实 Web 试玩探测尚未完成时，持久化记录和页面通知都没有 ready；T039 额外确认探测抛错后最终只会是 `failed/preview-validation`。

浏览器验收服务已经停止，隔离任务空间已成功关闭。安全策略不允许直接永久删除保留的临时验收目录，因此已将它移动到废纸篓 `liimit-playable-validation-20260826-mEwrwz`，仍可恢复。整个 T041 没有连接或调用任何 AI、图片、视频、音频服务。

## T042 最终规格、计划、任务与实现差异审查

**日期**：2026-08-26

逐项对照 `spec.md`、`plan.md`、42 项任务、Main/Preload/Renderer 实现、固定模板和最终验收证据，完成以下纠正：

- 规格状态由“草案”更新为“已完成并验收”，补充完成日期。
- 历史项目需求改为准确边界：本功能保护历史项目、不自动覆盖，但目前没有提供历史项目准备或修复入口，避免把未来能力写成已支持。
- 计划中的“预计涉及源码”改为“实际涉及源码”，补入本功能真实修改过的 `agentRunner.ts`。
- Quickstart 删除“当前计划阶段不代表功能可用”的过期占位，改为指向最终验收记录。
- 保留固定产品边界：目前只有 Phaser 3、2D、横版平台跳跃、Web 浏览器试玩和一个固定模板；没有把发布、云同步、多游戏类型、独特素材生成或历史项目迁移写成已完成。
- Agent 仍是用户主动选择的后续步骤；基础编辑、人工试玩和固定规则自动试玩不需要 Agent，也没有把自动试玩描述成会自行修改项目。

最终任务计数为 42/42；阶段 6 的 T038–T042 全部有对应提交或可复核证据。`git diff --check`、文档格式检查和未完成任务扫描通过。工作区只剩用户原有、未跟踪的 `.dockerignore`，本功能没有读取、修改或提交它。
