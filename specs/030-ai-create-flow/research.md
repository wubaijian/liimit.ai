# Research

Decision: 主进程一次性协调，不使用渲染 useEffect。原因：切换页面/重复渲染不能重复消费。准备服务返回 failed 状态而非总是 reject，必须显式检查 ready。
Decision: 保存可选 initialGeneration 状态；旧值缺省保持旧行为；启动中断归为 incomplete，不自动恢复。
Decision: 复用 AgentRunner 的无变化检测、最终构建、超时与脱敏；首次创建上下文通过主进程已有记录决定，不接受客户端任意绕过确认字段。
Alternative rejected: 创建后仅预填输入框不能解决二次点击；把模板准备标 completed 会造成虚假成功。
