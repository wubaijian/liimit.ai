# Research: AI 关卡修改同步

## 决策 1：关卡集是唯一真实来源

**Decision**: 局部关卡修改写入 `src/levels.json`；`VisualLevelScene.ts` 不得注入只在部分模式生效的障碍。

**Rationale**: 可视化画布、预览服务和选关都已从该文件读取。

**Alternatives considered**: 运行时注入（编辑器不可见）；第二份 AI 关卡文件（产生分叉）。

## 决策 2：局部任务不走全量生成

**Decision**: Agent 明确区分现有对象调整和新玩法/素材生成；前者只读目标关卡与数据契约。

**Rationale**: 全量 GDD 和大文件扫描带来不必要等待和错误落点。

**Alternatives considered**: 依赖用户把提示词写得更严格。

## 决策 3：复用现有刷新机制

**Decision**: 工具结果触发画布重读；Agent 从 running 转为非 running 后，已打开的 Web 试玩也重载。

**Rationale**: 现有 `refreshToken` 已能让 LevelViewer 重读，只缺预览最终同步。

**Alternatives considered**: 新增文件监视服务（当前过度设计）。
