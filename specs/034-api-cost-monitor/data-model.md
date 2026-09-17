# Data model

共享契约：packages/desktop/src/shared/apiCost.ts。
cost-monitor/v1/costs.json：version=1，settings、tasks、requests。
settings预算null默认只监测，maxRequests默认20，最多100。价格字段null表示未知，0只表示用户明确填写零。模型/提供方/地址指纹区分配置，URL不落台账。
tasks按每次主动运行分组，状态running→finished/stopped；用户新运行才建立新任务预算；同项目累计跨任务。
requests在向上游发送前持久化pending，随后success/error/interrupted；usage和estimatedCny可null。暂停不删除。重启pending转interrupted且running转stopped，不发起网络请求。
单价冻结在请求中，运行时保存新设置不改变正在执行任务的费率与预算。旧api-usage记录保持原格式，不强行迁移金额。
记录最多10000条，超限阻止继续调用而非悄悄丢掉历史。文件异常保留原文件并失败关闭。
