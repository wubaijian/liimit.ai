# Data Model: 正式化演示界面

本功能不新增持久化数据。下列状态全部只存在于当前 Renderer 会话。

## Demo Workspace Session

- `projectName`: 工作台显示的项目名称。
- `creationMethod`: 固定模板或 AI 生成，仅用于显示当前起点。
- `levels`: 1～8 个本地示例关卡。
- `selectedLevelId`: 当前选中的示例关卡。
- `selectedObjectId`: 当前选中的画布物体。
- `activePanel`: 保存、试玩、验证、AI、导出或无。
- `demoNotice`: 当前一条演示操作提示，默认为空，新消息替换旧消息。

## Demo Notice

- `message`: 简短的操作结果说明。
- `action`: 用户刚才点击的结果型操作。
- `visible`: 是否当前显示。

### State transitions

1. 进入工作台：`demoNotice = null`。
2. 浏览关卡或选择物体：不创建演示提示。
3. 点击保存、AI 确认、试玩、验证或导出：用新的简短提示替换 `demoNotice`。
4. 超时或离开工作台：清空 `demoNotice`。

## Persistence boundary

- 不写入 `ProjectRecord`。
- 不改动 Phaser 项目或关卡文件。
- 不新增任何共享类型、IPC 载荷或设置字段。
