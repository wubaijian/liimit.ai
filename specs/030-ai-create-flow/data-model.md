# Data Model

CreateProjectInput.creationMode?: template | ai，缺省 template；未知值拒绝。
ProjectRecord.creationMode?: template | ai。
ProjectRecord.initialGeneration?: pending | active | incomplete | completed。仅 AI 新项目有此字段。
pending → active → completed/incomplete。失败/停止/退出 → incomplete；重试为用户显式动作，不在应用启动时自动执行。ProjectRecord.status 继续记录 running/failed/waiting/stopped 等执行状态。
原要求继续使用 project.prompt；启动上下文前缀不写回 prompt。修改已完成项目遵循原确认机制。
