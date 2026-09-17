# Data Model: 多游戏类型界面预览

## GameTypeChoice

- `id`: `platformer` 或 `maze`。
- `name`: 用户可见的游戏类型名称。
- `engine`: Phaser 3 或 Godot。
- `availability`: `available` 或 `ui-preview`。
- `description`: 当前能做什么及不能做什么。

## CreationMethodChoice

- `id`: `template` 或 `ai`。
- `label`: 固定模板或 AI 生成。
- `availability`: 随游戏类型展示真实可用或仅预览状态。
- `helpText`: 对创建结果和 API 依赖的说明。

## MazePreviewInput

- `name`: 新建窗口中填写的名称；空值时使用“未命名迷宫项目”。
- `creationMethod`: 用户选择的创建方式，仅用于界面说明。
- 生命周期：打开预览时创建，关闭预览时完全丢弃。

## MazePreviewLevel

- `id`: 当前会话内唯一的关卡编号。
- `name`: 示例关卡名称。
- `status`: 示例检查状态，如“可试玩”或“有建议”。
- `objects`: 本地预设的示例物体，不写入文件。
- 约束：界面说明第一版最多 8 关；本轮增删改只改变当前会话中的展示数组。

## MazePreviewObject

- `id`: 当前示例物体编号。
- `type`: 出生点、墙壁、障碍、钥匙、门、敌人、出口或装饰物。
- `label`: 右侧属性区域使用的名称。
- `x`、`y`: 仅用于界面展示的示例位置。
- `detail`: 与类型相关的示例规则说明。

## PreviewPanelState

- `activePanel`: `none`、`ai`、`playtest`、`validation` 或 `export`。
- `selectedLevelId`: 当前展示的示例关卡。
- `selectedObjectId`: 当前画布选中的示例物体。
- `notice`: 最近一次预览动作的用户可见反馈。
- 状态转换：`closed` → `preview open` → `panel open/selection changed` → `closed and discarded`。

## Persistent contracts

本功能不增加持久化实体。`ProjectRecord`、`ProductModeId`、设置、关卡文件和 Agent Session 均保持不变。
