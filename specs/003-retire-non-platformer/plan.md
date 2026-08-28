# 实施计划：退役非横版项目与模板

## 技术方案

1. 在 Desktop 共享类型中把 `productMode` 收紧为必填固定值；StateStore 使用独立的旧数据解析类型读取旧状态。
2. StateStore 初始化时识别非固定记录，在同一 userData 目录先写入带时间戳的原始状态备份，再把这些记录从活动数组移除并原子写回；项目目录不做文件操作。
3. StateStore 写入口、ProjectManager 和 AgentRunner 只接受固定项目；Renderer 流水线删除兼容分支。
4. Core 保留现有工具名和阶段 ID，避免不必要的 IPC/Agent 协议破坏，但把分类结果、脚手架、GDD 和 Tilemap 参数收敛为唯一 `platformer`。
5. 删除发布资源中的四类模板和模块文档，以及未接入产品的多 archetype 模板演化原型；更新随安装包发布的 Prompt、资产协议、调试协议和 GDD 通用文档。

## Constitution 检查（设计前）

- **I 产品事实**：界面、Prompt、工具描述与唯一横版能力一致。
- **II 信任边界**：没有新增 Renderer 权限；状态迁移仍在 Main。
- **III 显式副作用**：自动迁移只删除应用索引记录，不删除用户项目目录；原状态先备份。
- **IV 可恢复执行**：保留现有项目状态与 Agent 事件机制，固定 Runtime 策略更简单。
- **V 凭据零信任**：迁移原样保留 secrets/MCP，不输出秘密。
- **VI 兼容迁移**：旧状态可读，迁移前备份，失败时不覆盖，提供契约测试。
- **VII 证据**：执行 Desktop/Core 聚焦和全量测试、类型检查、构建及差异检查。

## 风险与控制

- **索引迁移误删固定项目**：只接受精确字符串 `phaser-platformer-web`，混合数据测试覆盖。
- **备份失败导致数据丢失**：备份必须先成功，随后才允许写新 state；失败即中止初始化。
- **直接删除模板造成隐式引用断裂**：先收窄 Core 类型/Schema/Prompt/Tilemap，再删除目录，最后执行全仓搜索与构建。
- **误删无关 legacy 兼容**：仅处理 `ProjectRecord` 和游戏 archetype；事件历史、Provider、工具别名不在范围。

## Constitution 检查（设计后）

方案没有扩大 Renderer 权限或自动删除用户文件。兼容性通过“可读旧状态 + 原始备份 + 只迁移活动索引 + 契约测试”处理，符合原则 VI；没有例外项。
