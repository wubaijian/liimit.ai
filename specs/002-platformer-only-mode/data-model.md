# 数据模型：单一横版平台游戏模式

## FixedProductMode

桌面端内置的唯一新项目产品定义。它是代码常量，不来自 Renderer、用户设置或持久化配置。

| 字段            | 类型           | 固定值/约束             |
| --------------- | -------------- | ----------------------- |
| `id`            | string literal | `phaser-platformer-web` |
| `engine`        | string         | Phaser 3                |
| `dimension`     | string         | 2D                      |
| `archetype`     | string         | `platformer`            |
| `previewTarget` | string         | Web browser             |

该实体没有用户可编辑状态，也不存在模式列表。

## ProjectRecord

沿用现有项目记录，只新增一个兼容字段：

| 字段          | 类型                           | 规则                                                      |
| ------------- | ------------------------------ | --------------------------------------------------------- |
| `productMode` | `phaser-platformer-web` 或缺失 | 新项目必须写固定值；旧项目缺失时视为 legacy，不能自动补写 |

其余字段 `id/name/path/prompt/status/stage/sessionId/createdAt/updatedAt` 保持原契约。

### 状态规则

- **新建**：Main 创建安全目录后，把 `productMode` 固定写入内存记录、`.gameagent/project.json` 和 StateStore。
- **运行/停止/恢复/完成**：状态更新通过对象扩展保留 `productMode`，不得丢失或改值。
- **旧项目**：没有 `productMode` 时不补写、不转换；仍可按现有能力打开和续跑。
- **未知模式**：当前 UI 不把它当作固定模式，也不得将其自动改为目标模式；按 legacy/不支持兼容路径处理。

## RuntimeProductPolicy

由受信 Main 根据 ProjectRecord 临时派生，不持久化。

| 字段               | 固定项目                                    | 旧项目         |
| ------------------ | ------------------------------------------- | -------------- |
| `fixedArchetype`   | `platformer`                                | 无             |
| `loadSkills`       | false                                       | true           |
| `mcpServers`       | 空集合                                      | 现有已启用集合 |
| `systemConstraint` | 固定 Phaser 3 · 2D / 横版 / 应用内 Web 约束 | 现有系统提示词 |

运行策略只影响当前 Agent 子进程。它不能删除或改写全局 Skill/MCP 数据。

## 持久化关系

```text
FixedProductMode (代码常量)
        |
        | Main 在新建时赋值
        v
ProjectRecord.productMode? ----> userData/state.json
        |
        +-----------------------> <project>/.gameagent/project.json（创建快照）
        |
        +-----------------------> RuntimeProductPolicy（临时派生）
```

`.gameagent/project.json` 继续只是创建快照；本步骤不改变它与 StateStore 的既有同步语义。
