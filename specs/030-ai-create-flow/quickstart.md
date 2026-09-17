# Validation guide

运行 npm test --workspace=@gameagent/desktop、npm run typecheck --workspace=@gameagent/desktop、npm run build --workspace=@gameagent/desktop、npm run package:mac --workspace=@gameagent/desktop。
测试使用模拟 runner/provider：AI 创建准备完成后收到原要求一次；模板零次；准备失败、停止、重复点击、重启不启动；runner 文件未变化不完成。
原生 UI 只检查创建模式、提示、状态和旧项目打开，不发送真实模型请求。

## 2026-09-17 验证结果

- 桌面全部 64 个测试文件、758 个测试通过；两个 TypeScript 配置、桌面构建通过。
- package:mac 包含运行时 smoke、真实模板可玩流程 smoke（AI 调用 0 次）、macOS DMG 校验全部通过。本机未签名开发包，不是签名公证的公开发行版。
- 原生应用核验：10 个已有项目保留，“海底动员”要求仍在输入框中；新建横版游戏切换 AI 后显示“创建并生成”和费用提示。未点击真实生成按钮，不消耗用户 API；模型实际生成质量未做线上验收。
- 测试覆盖：一次性创建、模板零请求、配置失败、准备失败、取消准备、退出取消自动启动、启动失败保留要求与脱敏、原要求传递、持久化兼容、初始授权与后续确认边界、无文件变化不得完成。
- 应用已更新至 /Applications/liimit.ai.app；旧应用移至 /Users/prom2/.Trash/liimit-ai-before-ai-create-20260917.app，可恢复。
- 第二部分（逐项需求核对、能力缺口清单）不在本次交付范围。
