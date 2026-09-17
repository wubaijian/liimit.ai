# Data Model: 音效生成进度与主动停止

## Audio Preview Progress

- `generationId`: Main 为当前批次生成的非敏感唯一标识。
- `status`: `running | complete | cancelled`。
- `totalCount`: 固定为 3。
- `completedCount`: 0～3。
- `successCount`: 0～3。
- `failedCount`: 0～3。
- 始终满足 `completedCount = successCount + failedCount`。
- 不包含密钥、接口地址、描述、音频、项目或路径。

## Cancel Result

- `status`: `cancelling | idle`。
- 活动批次存在时触发其停止控制器并返回 `cancelling`。
- 没有活动批次时返回 `idle`，无其他副作用。

## Main Active Batch

- 一个 `generationId`。
- 一个批次级停止控制器。
- 生命周期从可信端接受生成开始，到批次成功、失败或停止后的清理结束。
- 同一时间最多存在一个。

## Renderer Generation State

- `progress`: 当前接受的进度或空。
- `activeGenerationId`: 接受第一条当前运行事件后绑定，结束后清空。
- `stopRequested`: 用户一点击停止立即为真，用于作废迟到返回。
- `stopBusy`: 控制“正在停止”和防重复点击。
- 原有用途、描述、时长不属于批次临时结果，停止时不清空。

## State Transitions

```text
IDLE -> GENERATING (0/3)
GENERATING -> GENERATING (1/3 或 2/3)
GENERATING -> READY (3/3，至少一个成功)
GENERATING -> ERROR (3/3，全部失败)

GENERATING --点击停止--> STOPPING
STOPPING --可信端取消--> STOPPED -> IDLE/可重试
STOPPING --完成结果竞态返回--> STOPPED（丢弃结果）

IDLE --迟到进度或停止--> IDLE
```
