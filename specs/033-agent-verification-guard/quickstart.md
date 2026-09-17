# Validation

桌面 test/typecheck/build；聚焦 Guard/runner/projectManager。假运行时覆盖重复失败、成功穿插、停止竞态、恢复与脱敏。临时预览覆盖 JSON 正常与 HTML/失败响应。
package:mac 验证本地包。无任务时更新应用，备份旧应用；不启动真实 AI，记录实际结果和边界。

## 实际结果（2026-09-17）

- 桌面全量：68 个测试文件、789 项通过；新建/恢复提示规则、错误去重、命令栈报错识别、失败停止、迟到成功不覆盖、脱敏、预算和素材在途保护通过。
- 正式预览：实际临时服务器通过页面、脚本、关卡和游戏信息校验；模拟 HTML、非法 JSON、空关卡、不完整游戏信息及 HTTP 500 均拒绝。
- 两个 TypeScript 配置、桌面 build、package:mac、runtime smoke、playable smoke 与 macOS DMG 验证通过。最终素材在途保护补充后再次 build、electron-builder、verify:mac-installer 通过；检查 app.asar 包含最终 Guard。
- 已更新并重新打开 /Applications/liimit.ai.app；旧版保留在 /Users/prom2/.Trash/liimit-ai-before-verification-guard-20260917.app。
- 原生界面显示 8 个项目，“海底逃生”仍为 AI 制作已停止；没有恢复生成，没有调用用户 API。更新前后 levels.json、gameInfo.json、visualStyle.json 哈希一致。
- 边界：没有真实模型端到端重跑，因此不声称模型必然遵循全部指引；路径规则没有扩大系统权限，也不是新增操作系统沙箱。错误分类基于运行时标志及已覆盖命令输出特征，并非能识别所有工具内隐错误。实际关卡通关未验证。Windows、公开签名/公证和干净机器安装未做，本包为 arm64 本地未签名构建。
- 三次同类错误按本轮累计，不因普通成功读取清零；构建后预算由首次识别到的成功构建输出起算，15秒监控周期；任何素材工具在途暂缓预算停止，原有无输出监控继续生效。
