# Contract: 音效生成进度与主动停止

## Main → Preload → Renderer Progress

每个事件只允许包含：

- `generationId`
- `status`
- `totalCount`
- `completedCount`
- `successCount`
- `failedCount`

批次开始先发送 0/3；每条请求结束发送一次；正常结束发送 `complete`，用户停止发送 `cancelled`。Renderer 只接受当前生成流程的第一条运行事件及其后相同批次标识的事件。

## Renderer → Preload → Main Stop

- 方法无参数。
- Main 验证调用来源。
- 有活动批次：触发停止并返回 `{ status: 'cancelling' }`。
- 无活动批次：返回 `{ status: 'idle' }`，无其他副作用。
- 重复请求安全，不触发其他功能。

## Service Cancellation

- 批次级停止信号传递到三个外部请求。
- 单请求仍保留自己的超时控制。
- 用户停止后，批次必须拒绝返回候选，即使已有候选成功。
- 超时归类为请求失败；外部停止归类为用户取消。

## Renderer Race Rule

Renderer 在调用停止 IPC 之前先记录停止意图。此后该次生成 Promise 即使成功返回，也必须释放音频临时资源并丢弃结果，不得展示、保存或应用。

## Sensitive-data Boundary

进度事件和停止结果不得包含密钥、Base URL、描述、音频字节、项目 ID 或路径。第三方错误正文仍不透传。
