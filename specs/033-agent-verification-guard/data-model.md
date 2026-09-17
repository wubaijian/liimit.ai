# Data Model

Guard 每轮保存 seen IDs、category->count、firstBuildPassedAt，停止原因在 ActiveRunState 内。错误类别 workspace / command / tool；持久化格式无变化。
running -> guardStopped -> waiting（initialGeneration incomplete）；用户停止保持 stopped。阻止后续成功结果覆盖停止原因。下一轮新 Guard，不自动续跑。
