# 数据模型：新项目立即获得可玩模板

## 1. ProjectRecord 扩展

现有项目字段保持不变，新增一个可选字段：

```text
ProjectRecord
└── starterPreparation?: StarterPreparation
```

字段缺失表示“这是本功能上线前创建的历史项目”。历史项目不得因此自动复制、安装、构建或被新门禁拦截。

## 2. StarterPreparation

| 字段            | 类型     | 必填 | 说明                                     |
| --------------- | -------- | ---: | ---------------------------------------- |
| `schemaVersion` | `1`      |   是 | 为后续兼容迁移保留版本                   |
| `status`        | 状态枚举 |   是 | `queued`、`preparing`、`ready`、`failed` |
| `phase`         | 阶段枚举 |   是 | 当前或最后阶段                           |
| `attempt`       | 正整数   |   是 | 首次自动准备为 1，每次真正开始重试加 1   |
| `revision`      | 非负整数 |   是 | 每次状态落盘前递增，用于拒绝乱序旧更新   |
| `message`       | 字符串   |   是 | 用户可理解、已脱敏的中文状态             |
| `errorCode`     | 错误枚举 |   否 | 失败时的稳定分类，不保存原始日志         |
| `startedAt`     | ISO 时间 |   否 | 本次真正开始执行的时间                   |
| `finishedAt`    | ISO 时间 |   否 | ready 或 failed 的时间                   |

### 状态枚举

- `queued`：记录已创建，等待主进程开始。
- `preparing`：至少一个准备阶段正在执行。
- `ready`：真实关卡、构建产物和试玩入口都验证通过。
- `failed`：流程停止，可由用户重试。

### 阶段枚举

- `queued`
- `scaffold`
- `dependencies`
- `build`
- `level-validation`
- `preview-validation`
- `complete`

### 错误分类

- `interrupted`
- `network`
- `permission`
- `disk-space`
- `unsafe-project`
- `dependency`
- `build`
- `level-validation`
- `preview-validation`
- `persistence`
- `unknown`

错误分类用于稳定测试和选择用户提示；`message` 才是界面显示内容。不得把完整 stdout/stderr、API Key、外部 URL 或无限长度内容写入项目记录。

## 3. 状态变化

```text
新建成功
  -> queued
  -> preparing/scaffold
  -> preparing/dependencies
  -> preparing/build
  -> preparing/level-validation
  -> preparing/preview-validation
  -> ready/complete

任一执行阶段
  -> failed/<最后阶段>
  -> 用户点击重试
  -> queued
  -> preparing/...

应用重启时发现 queued 或 preparing
  -> failed + interrupted
```

`ready` 不接受重试。重复点击重试时，如果已有同项目任务，返回同一任务的已接受结果，不增加 attempt，也不并发执行。

同一项目只接受更大的 `revision`；相同或更小 revision 的创建响应或异步事件不得覆盖 Renderer 已经持有的新状态。

## 4. 持久化规则

- `state.json` 是准备状态的事实来源；每次状态更新通过 `StateStore.upsertProject()` 原子排队写入。
- `.gameagent/project.json` 保持创建快照：新项目初始快照包含 `queued`，后续进度不要求同步。
- 历史记录缺少 `starterPreparation` 时，读取默认值为 `undefined`，且初始化不得因此写项目目录。
- 旧记录如果包含无法识别的准备状态，StateStore 必须拒绝或迁移，不能把它当 ready。
- 只有状态持久化成功后才广播对应的 `project:updated`。

## 5. 业务校验

- 只有固定 `productMode` 的新项目能进入准备服务。
- `attempt` 必须是安全正整数。
- `revision` 必须是安全非负整数，并且只能由 Main 单调增加。
- `message` 和错误内容必须有长度上限。
- `ready` 必须是服务完成真实验证后产生，Renderer 无权提交该状态。
- 新项目在非 ready 时不能读取/保存关卡、启动预览或启动 Agent；Main 也应校验，不能只靠按钮禁用。
- 历史项目沿用既有 Main 行为，避免本功能造成回归。
