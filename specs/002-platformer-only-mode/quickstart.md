# 快速验证：单一横版平台游戏模式

## 前置

```bash
nvm use 20
npm ci
npm run build
```

已有 `node_modules` 和根构建产物时可以跳过安装与根构建。

## 聚焦自动验证

```bash
npm test --workspace=@gameagent/desktop -- \
  test/projectManager.test.ts \
  test/agentRunner.test.ts \
  test/store.test.ts \
  test/platformer-mode-contract.test.ts

npm test --workspace=@opengame/opengame-core -- \
  src/tools/game-type-classifier.test.ts
```

预期：

- 新项目及 `.gameagent/project.json` 带固定产品模式标记。
- 旧项目缺失标记时仍被识别为 legacy。
- 固定项目 Runtime 策略只允许 platformer，不加载用户 Skills/MCP。
- 固定分类不调用模型，并且只复制 platformer 模块。
- 首页、新建、阶段和应用内预览文案满足 UI 契约，插件/外部引擎入口不可见，Node.js/npm 运行环境入口仍可用。

## 桌面质量门槛

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
```

由于 Core 分类工具发生变化，还需执行：

```bash
npm run typecheck --workspace=@opengame/opengame-core
npm test --workspace=@opengame/opengame-core
npm run build --workspace=@opengame/opengame-core
```

## 真实界面验收

```bash
env -u ELECTRON_RUN_AS_NODE npm run desktop
```

1. 在空首页确认只展示 Phaser 3 · 2D、横版平台、应用内 Web 浏览器试玩和固定模板。
2. 从首页按钮和左侧“新建游戏”分别打开弹窗，确认进入同一表单。
3. 确认弹窗没有类型、引擎和试玩目标选择，并且三个示例都是横版平台玩法。
4. 创建一个项目，检查 `.gameagent/project.json` 和 `.qwen/system.md` 的固定模式证据。
5. 侧栏不得出现“插件”；设置中只保留 Node.js/npm 运行环境检测与恢复，不得出现 Unity、Godot、Blender 等外部游戏引擎。
6. 选择一个已有旧项目，确认记录仍存在、项目目录没有被改写。
7. 对已构建测试项目点击 Web 试玩，确认应用内 sandbox iframe 可以载入且不会打开系统浏览器；未构建项目应显示明确错误。
8. 用秒表从提交有效名称和目录开始计时，确认在排除目录挑选和外部服务响应后，60 秒内进入项目制作界面，并记录实测结果。
9. 用旧版 `state.json` 测试数据启动并正常退出，确认项目、Provider、凭据、插件和外部工具配置语义不丢失；允许既有运行状态安全归一化。

## 明确不在本步骤验证的内容

- 固定模板内部场景 JSON 和关卡协议（步骤 1.3）。
- 精简后的 Agent 全流程和系统提示词重构（步骤 1.4）。
- 可视化拖拽编辑器。
- AI 自动试玩与修改建议报告。

## 2026-08-23 实际验收记录

- 在 macOS 上以 `env -u ELECTRON_RUN_AS_NODE npm run desktop` 启动真实 Electron 窗口成功；首页视觉、首页按钮与侧栏按钮均通过。
- 首页只展示 `Phaser 3 · 2D`、横版平台跳跃、应用内 Web 浏览器试玩和固定平台模板；侧栏没有插件入口。
- 两个新建入口进入同一固定表单；三个可点击示例分别为横版动作、横版解谜和横版跑酷，没有 engine、archetype、dimension 或试玩目标选择器。
- 使用隔离临时目录提交有效名称和创意，从点击“创建制作任务”到制作界面可访问实测为 **1.415 秒**，满足 SC-002 的 60 秒目标。
- 实测项目的 `.gameagent/project.json` 含 `productMode: phaser-platformer-web`；`.qwen/system.md` 含 Phaser 3 · 2D、platformer、应用内 Web 浏览器和不得切换引擎/类型的边界守卫。
- 未生成 `dist/index.html` 时，界面明确显示“游戏构建产物 dist/index.html 不存在，请先完成构建。”；实机发现并修复了原先重复追加建议造成的重复句号。
- 放入仅用于验收的 `dist/index.html` 后，测试内容成功显示在 Electron 内 `127.0.0.1` 随机端口的试玩 iframe 中，没有切换外部游戏引擎或系统浏览器。
- 设置只显示“运行环境 / Node.js 与构建工具”，实测只渲染 Node.js/npm（npx 1/1 READY），没有 Unity、Godot、Blender 或 uvx 可见项。
- 验收前真实应用状态已恢复；临时项目和状态备份已移入废纸篓，可恢复，没有保留测试项目记录。
- 本机真实状态中没有可供目测的 legacy 项目，因此旧项目视觉兼容未人工执行；由 `test/store.test.ts`、`test/projectManager.test.ts` 和 `test/agentRunner.test.ts` 覆盖旧记录语义保留、路径丢失提示及 legacy Runtime 行为。
- 当前终端实际为 Node.js 24，而仓库 `.nvmrc` 为 Node.js 20；本轮全部自动与实机检查通过，但发布前仍须在 Node.js 20 上复验。
- 没有启动真实 Agent 或调用付费模型；固定分类的无模型请求行为由 Core 测试确定性验证。
