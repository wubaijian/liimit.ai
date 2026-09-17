# AI 自主创建指南

这里没有现成游戏。现有一块地面、出生点和终点只用于验证引擎和编辑器可运行，名称“待 AI 创建”不是交付成果。

## 工作顺序

1. 理解用户要求，在简短回复中说明本次要做什么。首次创建授权允许直接制作；后续修改仍需遵守用户确认流程。
2. 先查看 levels.json、gameInfo.json、visualStyle.json 和 scenes/VisualLevelScene.ts 的数据类型。不要复制其他示例，不调用 generate_gdd 或反复 classify_game_type。不要先花时间修复 Phaser 的无界面测试环境。
3. 重新设计关卡，实际写入 levels.json；同步第一关 document 到 level.json。更新游戏名称/简介，去掉“待 AI 创建”。不要只改名字、颜色或测试文件便报告完成。
4. 用 visualStyle.json 设定自己的色彩和素材。可先用中性几何角色验证玩法，但这不代表用户要求的美术已完成。用户要求生成美术时，按已配置图片工具生成并接入；无可用服务则说明缺少什么，不得以旧示例冒充。
5. 执行现有构建检查，并检查出生点、落脚点、危险物与终点可达性。修复自己引入的错误；若遇到与需求无关的测试环境错误，说明而非无限改测试工具。桌面端还会重新构建和核验。
6. 报告真实完成内容、未完成项和需要用户试玩确认的点。构建通过不代表已经验证全部需求。

## 数据与能力边界

- levels.json: version=1，levels 数组；关卡 id 用 level-1、level-2 等，每关有 name、document、abilities。按用户要求安排关数，不默认套三关。
- document: version=1、width、height、gridSize、objects。每个对象有 id、type、x、y、width、height。保留一个 player-spawn、一个 goal 和至少一个 platform，对象放在关卡边界内。
- 基础对象和扩展字段以引擎现有类型为准，包含平台、尖刺、金币、敌人、移动平台等。不要发明编辑器无法识别的字段。
- abilities 包括 moveSpeed、jumpPower、doubleJumpEnabled、doubleJumpPower。修改布局时按跳跃范围安排距离。
- visualStyle.json 保持 mode="custom"。backgroundColor 用 #RRGGBB；colors 中各颜色用十进制数字。字段名为历史兼容名，不代表必须做火山：basalt=平台主色、basaltDeep=阴影、mineralGold/mineralLight=高亮、lava/lavaLight=危险物色、iceBlue/iceBlueDeep=角色与移动平台色。
- images 的 background、player、slime、bee 填本地 assets/... 图片路径，空字符串使用中性几何占位。不使用远程 URL 或越界路径。角色图目前是单张图；动画或新机制需要实际扩展代码，不能只写配置就声称完成。
- 当前保持 2D 横版与可视化编辑兼容。无尽关卡、新规则等超出已有能力的内容，要评估实际实现；若无法完成，向用户说明并询问，不得悄悄改成有限示例关卡。
