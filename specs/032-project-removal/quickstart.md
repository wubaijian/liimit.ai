# Validation

执行桌面test/typecheck/build、package:mac。服务测试用临时目录和注入trash替身验证取消、并发、安全和失败回收。
原生界面检查菜单与取消；只用临时fixture验证真实废纸篓。不删除用户项目，不调用API。

## 实际结果（2026-09-17）

- 最终桌面测试：70 个文件、788 项通过；类型检查、构建、package:mac 及 DMG 验证通过，arm64 本地未签名构建。
- scripts/project-removal-smoke.cjs 使用真实 Electron shell.trashItem，将独立临时 fixture liimit-removal-smoke-bC1gMH 移入废纸篓，验证成功；未加载用户状态、未使用模型 API。
- 已更新 /Applications/liimit.ai.app；旧应用保留在 /Users/prom2/.Trash/liimit-ai-before-project-removal-20260917.app。
- 原生界面已观察到每个项目的管理菜单、两种移除按钮，以及包含名称/完整路径的列表移除确认框。
- 尝试点击“取消”时工具报告用户改变了界面，重新读取发现“海底逃”已从列表消失（11→10）；检查原目录仍存在。停止进一步 UI 操作，未自动恢复或继续删除。不能将本次交互算作原生取消验证；取消无副作用由服务自动测试覆盖。
- 尚未完成：原生两种弹窗的完整取消回归、不同窗口尺寸的视觉检查、Windows 及公开签名/公证/干净机器验证。可在用户空闲时补做；不影响已有服务和持久化自动验证的结论。
