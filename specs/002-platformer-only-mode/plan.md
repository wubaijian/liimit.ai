# 实施计划：单一横版平台游戏模式

**功能标识**：`002-platformer-only-mode` | **日期**：2026-08-23 | **规格**：[spec.md](./spec.md)

**输入**：`/specs/002-platformer-only-mode/spec.md`

## 摘要

把 liimit.ai 的新项目收敛为唯一产品模式：Phaser 3 的 2D 横版平台跳跃游戏，并只提供 Web 浏览器试玩。主进程在每个新项目记录中写入不可由 Renderer 选择的固定模式标记；桌面 Runtime 只为带此标记的项目注入受控的 `platformer` 约束，Core 分类工具据此跳过模型分类并确定性复制现有 platformer 脚手架。没有标记的旧项目保持原有分类、Skill、MCP 和续跑行为。

Renderer 同步更新首页、新建弹窗、制作阶段与预览文案，隐藏插件入口和设置中的外部游戏引擎依赖入口，同时保留 Node.js/npm 构建运行环境的检测与恢复入口，不删除相关代码或本地设置。固定模板内部协议、Agent 工作流精简、可视化编辑器和 AI 试玩报告继续留给后续步骤。

## 技术上下文

**语言/版本**：TypeScript 5.8、ES Modules、Node.js 20+

**主要依赖**：Electron 43、React 19、Vite 7、现有 liimit.ai Agent Runtime 与 Core 工具系统；不新增依赖

**存储**：Electron `userData/state.json` 中的项目记录与设置；项目目录中的 `.gameagent/project.json` 和 `.qwen/system.md`

**测试**：Vitest 单元/契约测试、桌面端 Renderer/Main 两套严格 TypeScript 检查、Vite/主进程构建、Core 聚焦与全量测试

**目标平台**：当前 macOS 桌面发行基线，并保持 Windows 11 x64 已有兼容行为；生成游戏运行于现代 Web 浏览器环境

**项目类型**：npm workspaces 单体仓库中的 Electron 桌面应用、Node.js Agent Runtime 和共享 Core 工具包

**性能目标**：固定类型判定不发起额外模型请求；打开新建弹窗和预览界面不增加网络请求；项目创建时间不因产品模式判定产生可感知延迟

**约束**：保持 Renderer → Preload → IPC → Main 信任边界；Renderer 不提交模式、模板或命令；旧项目和已有插件/MCP/依赖设置不得删除或强制迁移；固定模式只能使用 `platformer` 脚手架；预览继续只服务项目内 `dist/index.html`

**规模/范围**：一个固定产品模式、一个可选兼容标记、一个受控 Runtime 环境契约、约 9 个运行文件和聚焦测试；不删除其它模板或 Core archetype，只增加固定边界所需的最小系统约束，完整提示词重写留在 1.4

## 宪章检查

### Phase 0 调研前

| 门槛                 | 状态 | 依据                                                                                              |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| 产品事实与品牌一致性 | 通过 | UI 只声明代码实际锁定的 Phaser 3 / 2D / platformer / Web 能力；不提前声明拖拽编辑或 AI 试玩。     |
| 桌面端信任边界       | 通过 | 产品模式由 Main 创建，`CreateProjectInput` 不新增可伪造的模式字段；不新增 IPC 或 Renderer 权限。  |
| 本地优先与显式副作用 | 通过 | 继续写入用户选择的项目目录；隐藏入口不会卸载依赖、删除插件或修改旧项目。                          |
| Agent 可观察与可恢复 | 通过 | 保留既有 stage/status/session/event 契约；只调整固定项目的模板判定，停止和恢复流程不变。          |
| 凭据与插件零信任     | 通过 | 固定项目不加载现有外部 Skills/MCP；保存数据原样保留，旧项目兼容行为不变。                         |
| 兼容性迁移           | 通过 | 新标记为可选字段；缺失即旧项目，不自动补写或改写旧记录；已有 archetype、stage 和 IPC 类型不收窄。 |
| 证据先于交付         | 通过 | 计划包含 Main/Core 确定性测试、旧项目兼容测试、UI 契约、桌面全量门槛与实机界面检查。              |

### Phase 1 设计后复查

设计没有新增 Renderer 权限、任意命令、远程内容或破坏性数据迁移。固定 archetype 由受信 Main 通过仅对子进程有效的环境契约传递，Core 只接受精确的 `platformer` 值；其它值不扩大能力。旧项目没有标记时继续走原有分类并加载其原有扩展，因此不会被强制转换。插件和依赖入口只从目标模式 UI 隐藏，相关设置、凭据和底层服务不删除。全部宪章门槛继续通过，无例外项。

## 项目结构

### 本功能文档

```text
specs/002-platformer-only-mode/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── product-mode.md
│   └── ui-surfaces.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### 源码

```text
packages/desktop/
├── src/shared/types.ts                     # 可选产品模式标记与固定定义
├── src/main/projectManager.ts              # 新项目标记、项目级系统约束
├── src/main/agentRunner.ts                 # 固定项目 Runtime 策略与扩展隔离
├── src/renderer/App.tsx                    # 首页文案、插件入口收敛
├── src/renderer/components/
│   ├── NewProjectDialog.tsx                # 固定模式说明与 platformer 示例
│   ├── Pipeline.tsx                        # 固定模板阶段文案
│   ├── ProjectRail.tsx                     # 隐藏插件入口
│   ├── SettingsDialog.tsx                  # 只保留 Node.js/npm 运行环境入口
│   └── Inspector.tsx                       # Web 浏览器试玩文案
├── src/renderer/styles.css                 # 固定模式说明卡样式
└── test/
    ├── projectManager.test.ts              # 新标记、元数据与系统约束
    ├── agentRunner.test.ts                 # 新旧项目 Runtime 策略
    ├── store.test.ts                       # 旧状态语义保留与可选字段兼容
    └── platformer-mode-contract.test.ts     # 产品文案与可见入口契约

packages/core/src/tools/
├── game-type-classifier.ts                 # 受控 fixed archetype 快速路径
└── game-type-classifier.test.ts             # 跳过模型并只复制 platformer
```

**结构决策**：沿用现有 npm workspaces、Electron 分层与 Core 工具边界。产品模式定义属于桌面共享契约；Core 不反向依赖 desktop，而是通过单值环境契约接收受信的固定 archetype。应用内预览继续复用现有 sandbox iframe，不打开系统浏览器。其它模板、分类能力和扩展代码保留给旧项目兼容，不在本步骤删除。

## 复杂度跟踪

本计划没有宪章例外或新增架构层。可选标记和环境契约是保护旧项目所需的最小兼容机制。
