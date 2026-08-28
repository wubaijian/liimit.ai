# 契约：固定产品模式

## 新建输入边界

Renderer 继续只能提交：

```text
name, directory, prompt
```

不得在 `CreateProjectInput` 中增加可由 Renderer 决定的 engine、archetype、template 或 productMode。Main 完成现有长度与绝对路径校验后，统一创建 `phaser-platformer-web` 项目。

## 项目标记

```text
ProjectRecord.productMode?: "phaser-platformer-web"
```

- 新项目：必须存在且为固定值。
- 旧项目：字段缺失，保持原样。
- 未知值：不得被当作固定模式，也不得自动转换。
- Agent 状态更新：必须通过保留式更新继续携带原值。

## Agent Runtime 契约

固定项目启动时，Desktop Main 为该子进程设置：

```text
LIIMIT_FIXED_GAME_ARCHETYPE=platformer
```

Core 的行为：

1. 只接受精确值 `platformer`。
2. 命中时不访问分类模型。
3. 直接构造侧视角、重力、连续移动的 platformer 分类结果。
4. 只调用现有安全脚手架复制 `core + modules/platformer + platformer docs`。
5. 仍返回现有分类工具结果格式，保持 GDD 和事件消费者兼容。
6. 环境值缺失或不是精确允许值时，继续走现有五分类逻辑，不扩大能力。

固定项目的 `.qwen/system.md` 还必须包含相同的、不可协商的产品边界，确保后续 GDD、素材、代码和验证阶段不切换外部引擎或其它 archetype。本步骤只追加这段边界守卫；完整提示词重写留到 1.4。

## 扩展隔离

- 固定项目：不启用用户 Skills；凭据载荷中的 MCP Server 集合为空。
- 旧项目：保留当前 Skills/MCP 行为。
- 所有已保存 Skill、MCP、凭据和信任状态保持不变，不执行删除或卸载。

## 预览契约

本步骤不新增预览接口。仍使用：

```text
startPreview(projectId) -> http://127.0.0.1:<random-port>/
```

Main 只服务规范项目目录内的 `dist/index.html`；Renderer 只在已有 sandbox iframe 中展示，不打开系统浏览器。缺少构建产物时必须返回明确错误，不能尝试启动其它引擎。
