# Data model

ActiveRunState 增加内存摘要字符串或 null，无持久化迁移。摘要一致或不可用进入 waiting；有变化且验证通过进入 completed；失败取消保持原状。
