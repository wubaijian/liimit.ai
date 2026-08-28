# 契约：基础游戏准备

## 1. 创建项目

### Renderer → Preload → Main

```text
createProject(CreateProjectInput) -> Promise<ProjectRecord>
IPC: project:create
```

既有输入契约不变。成功返回的新项目必须带 `starterPreparation.status = queued`。返回只证明项目记录和创建快照安全落盘，不代表游戏已经可玩。

Main 在返回记录后自动把项目加入准备队列。Renderer 不提供模板路径、命令、依赖包或构建参数。

## 2. 重试准备

### Renderer → Preload → Main

```text
retryStarterPreparation(projectId: string)
  -> Promise<{ accepted: boolean; project: ProjectRecord }>
IPC: project:retry-starter-preparation
```

Main 校验：

- IPC 来自受信任应用页面。
- `projectId` 是非空字符串且不超过 160 字符。
- 项目存在且属于固定横版产品模式。
- 项目具有本功能的 `starterPreparation`；历史项目不通过此入口自动修复。
- `ready` 项目返回 `accepted: false`。
- 同项目已经排队或执行时返回 `accepted: true` 和当前项目，但不启动第二份任务。
- `failed` 项目转为 queued 并进入队列。

失败通过受控 IPC 错误返回，不暴露完整子进程输出。

## 3. 状态通知

### Main → Renderer

```text
onProjectUpdated((project: ProjectRecord) => void) -> unsubscribe
IPC event: project:updated
```

沿用既有事件。Main 只在状态成功持久化后发送。Renderer 按 `project.id` 和 `starterPreparation.revision` 合并：不同项目不能串写，同一项目的相同或更旧 revision 不能覆盖新状态。这条规则同时适用于 `project:create` 的返回值和异步事件。

至少应通知以下节点：queued、每个 preparing phase、ready 或 failed。

## 4. 功能门禁

对带有 `starterPreparation` 的新项目：

| 调用                      | queued/preparing | failed |  ready |
| ------------------------- | ---------------: | -----: | -----: |
| `loadLevel`               |             拒绝 |   拒绝 |   允许 |
| `saveLevel`               |             拒绝 |   拒绝 |   允许 |
| `startPreview`            |             拒绝 |   拒绝 |   允许 |
| `startAgent`              |             拒绝 |   拒绝 |   允许 |
| `retryStarterPreparation` |     合并当前任务 |   允许 | 不执行 |

拒绝文案必须说明“基础游戏尚未准备完成”并引导等待或重试。历史项目缺少字段时沿用现有契约。

## 5. UI 契约

- 新建弹窗明确说明创建会复制固定模板、可能联网下载固定依赖。
- queued/preparing 显示阶段，不渲染 `LevelViewer`，不创建预览 iframe。
- failed 显示项目仍已保留、简明失败原因和唯一明确的重试按钮。
- ready 才显示真实关卡和试玩能力。
- ready 后，人工试玩和自动试玩都必须使用同一个真实预览入口；自动试玩不得要求先启动 Agent。
- 页面重载或项目切换后，展示必须以最新 `ProjectRecord` 为准。
- UI 不声称自动生成了独特内容；用户的游戏想法只被保存，除非之后主动启动 Agent。

## 6. 零模型调用契约

创建和准备链路不得调用 provider connection、模型 Runner、素材生成、MCP 或第三方生成式服务。验收测试应以替身记录这些调用并断言总数为 0。
