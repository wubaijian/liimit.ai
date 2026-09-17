# Research

- Decision: 系统废纸篓而非永久递归删除，可恢复且无新依赖。
- Decision: 主进程原生确认，不只信任前端；默认取消，显示注册路径。
- Decision: 移除期间互斥IPC，开始前检查未结束调用、Runner及准备任务，避免晚写入。
- Decision: 核对 .gameagent/project.json 的 id/path，拒绝重要目录、共享/嵌套目标、符号链接；无法核实时仍可只移除列表。
- Alternative: 先移除记录会在trash失败时丢入口；采用先移动后移除，明确报告持久化失败。无需迁移。
