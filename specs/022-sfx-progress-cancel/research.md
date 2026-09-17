# Research: 音效生成进度与主动停止

## Decision 1: 外部停止和单请求超时使用不同语义

- **Decision**: 每条请求同时响应批次停止信号和自己的 30 秒超时，但对用户返回不同的安全错误。
- **Rationale**: 用户主动停止不应被误报为网络超时；真实超时也不应显示为用户操作。
- **Alternatives considered**: 共用一个控制器实现更短，但无法可靠解释任务为什么结束。

## Decision 2: 进度由批次服务在请求落定时产生

- **Decision**: 每条成功或失败后更新 `completed/success/failed`，再由 Main 发送脱敏事件。
- **Rationale**: Renderer 无法知道真实网络请求是否完成，自行计时会产生假进度。
- **Alternatives considered**: 动画进度条只能表示等待，不能满足准确计数要求。

## Decision 3: Main 持有唯一活动停止控制器

- **Decision**: Main 在现有单批次锁旁保存当前批次控制器；停止 IPC 不接受批次、URL 或其他用户参数。
- **Rationale**: 信任边界简单，无法从 Renderer 停止任意任务或注入请求信息。
- **Alternatives considered**: 由 Renderer 传批次 ID 更灵活，但当前只有一个活动批次，没有必要扩大接口。

## Decision 4: 停止后整批作废

- **Decision**: 服务在外部停止后不返回部分成功；Renderer 也记录停止意图并丢弃同时到达的结果。
- **Rationale**: 双层保护覆盖“请求完成”和“点击停止”几乎同时发生的竞态，确保用户意图优先。
- **Alternatives considered**: 保留停止前成功结果会让“停止”含义不明确，也可能被用户误应用。

## Decision 5: 关闭设置不自动停止

- **Decision**: 只释放页面订阅和临时显示状态，不主动中断外部请求。
- **Rationale**: 停止可能影响第三方请求和额度，是需要用户明确触发的操作。
- **Alternatives considered**: 关闭即停止看似节省资源，但属于隐藏副作用。

## Decision 6: 不承诺额度退款

- **Decision**: 界面说明已完成或已经到达服务商的请求仍可能计费。
- **Rationale**: 本地中断不能撤销服务商已处理的请求，不能误导用户。
- **Alternatives considered**: 不说明会让用户把停止误解为一定不会消耗额度。
