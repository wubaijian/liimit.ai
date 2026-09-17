# Validation

运行桌面 tests/typecheck/build，core classifier tests/typecheck；临时新项目真实准备 ai-foundation：零示例图片、一关3个校准物体，修改关卡后二次准备不得回退。构建校验依赖锁定环境。
运行 package:mac 并验证 DMG、运行时和可玩模板烟测。原生 UI 检查新入口及旧项目；不调用付费 API，模型创作质量不视为已验证。

## 执行结果（2026-09-17）

- 桌面端全量：65 个测试文件、763 项测试通过。包含只改辅助文件/名称时不能完成、新关卡变化允许进入构建的 Runner 回归。
- core classifier：16 项测试通过；覆盖 ai-foundation 不复制任何模板及缺失文件时拒绝回退。
- 根级 npm run typecheck：全部工作区通过。
- npm run package:mac --workspace=@gameagent/desktop：运行时打包、桌面构建、83 包隔离运行时检查、真实固定模板构建及15项模板测试、Web入口与失败路径检查、DMG验证通过。
- node packages/desktop/scripts/ai-foundation-smoke.mjs：真实新 AI 项目准备、中性数据、零示例图片、构建/Web入口、修改后重复准备保留内容通过。脚本未构造 Agent 或模型服务。
- 原生界面：更新 /Applications/liimit.ai.app 后11个原有项目仍存在；海底逃保持 stopped/incomplete，没有自动续跑。新建窗口显示“不套用示例关卡；会使用 API”，AI方式选中后按钮为“创建并生成”。仅打开窗口，没有提交生成。
- 旧版应用移至 /Users/prom2/.Trash/liimit-ai-before-ai-foundation-20260917.app，可恢复；用户游戏未删除。

## 未验证和边界

- 本次不调用用户模型、图片、音效 API，因此未验证真实模型对任意需求的遵循率、生成速度和美术质量。
- Web验证为构建产物及入口检查，不等同于逐关真实键盘通关；自定义图片仅提供本地加载入口，暂未测试真实生成图片接入。
- 完成门槛检查实际关卡/能力与校准工作区不同，不等于语义上满足用户全部要求；仍需人工试玩验收。
- 保留共享 Phaser 运行引擎，不是每次从零编写游戏引擎；旧项目不自动迁移到新起点。
- 安装包是本机 arm64 未签名开发构建，不是已公证公开发行版本。
