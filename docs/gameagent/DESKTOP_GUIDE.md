# liimit.ai 桌面客户端使用说明

## 支持平台

- macOS Apple Silicon：DMG 安装版。
- Windows 11 x64：NSIS Setup EXE 候选版；须通过 Windows 原生 CI、安装/卸载与签名验收后才作为
  正式发行版发布。Windows on ARM、32 位 Windows 和便携版尚未支持。

普通用户打开客户端不需要源码开发环境。当前固定制作流程只使用 Phaser 3
与 Web 工具链；不需要 3D 游戏引擎或外部编辑器。但当前打包版尚未内置项目依赖准备所需的
Node.js/npm，宿主机仍需安装 Node.js 20+ 和 npm；这是当前候选版的已知发行风险。

## 首次启动

1. 打开“设置 → API 管理”。
2. 至少配置主 Agent 的 Provider、Base URL、Model 与 API Key。
3. 点击“基础测速”，确认当前服务可访问。
4. 新建项目，选择一个专用本地目录并输入游戏创意。

API Key 由当前操作系统的安全存储加密。macOS 使用 Keychain 相关能力，Windows 使用当前
Windows 用户的系统凭据保护；把配置文件复制到另一台电脑或另一系统后，需要重新输入密钥。

## 创建游戏

1. 点击“新建游戏”。
2. 输入项目名、保存目录与游戏创意。
3. 创建后点击“启动 Agent”。
4. 中央区域查看制作阶段与真实工具调用。
5. 右侧“文件”查看生成产物；Web 构建与预览入口探测都通过后，在“预览”中试玩。

当前唯一内置流程是 Phaser 3 的 2D 横版平台跳跃 Web 游戏，构建后直接在 liimit.ai 应用内
浏览器试玩。其他游戏类型、3D 引擎和外部编辑器不属于当前固定制作模式。

liimit.ai 会在 Agent 启动前通过受控流程，按照项目随附的 `package-lock.json` 准备固定版本的
Phaser、构建和测试依赖。普通用户不需要打开终端运行 `npm install`；如果依赖准备失败，应用会
停止启动 Agent 并提示重试，而不是让 Agent 临时修改依赖版本。

## 固定模板与自动依赖

每个新项目都使用同一类起点：

- 引擎：Phaser 3。
- 类型：2D 横版平台跳跃。
- 运行环境：Web 浏览器。
- 工程：内置固定模板，不向用户提供引擎或游戏类型选择。

点击“启动 Agent”后，liimit.ai 会先复制模板，再比对项目中的 `package.json` 和
`package-lock.json`。两个文件符合固定模板后，桌面主进程才会用受控的 `npm ci`
命令安装确切的依赖树。命令不经过系统 Shell，有明确的工作目录和超时限制。依赖已经准备好且锁定文件没有变化时，再次启动可以跳过重复安装。

以下情况会在 Agent 启动前直接失败：

- 项目清单或锁定文件被换成与模板不匹配的内容。
- 项目目录或 `node_modules` 是不可信的符号链接。
- 本机找不到可用的 Node.js/npm、安装命令超时，或者依赖安装返回错误。

这时不要让 Agent 运行 `npm install`、`npm update` 或修改版本号。先根据桌面端的依赖准备错误排查，修复后重新启动。

为了避免项目在构建工具内部文件损坏后永久卡住，受控最终构建只要出现非零退出、超时或启动异常，就会废弃本次依赖就绪标记。用户下次点击“继续执行”时，liimit.ai 会先按锁定文件重新执行一次干净依赖准备。这是保守的自修复策略：即使失败原因最后证明是源码错误，下一轮也会多做一次依赖准备。

打包过程内置了 Agent Runtime，但项目的 `npm ci` 和 Agent 结束后的最终受控
`npm run build` 目前都会解析并使用宿主机上的 Node.js/npm。
因此“安装包能启动”不等于“干净系统能创建游戏”。正式发布前还需在不预装 Node.js/npm
的干净机器上验证恢复指引，或将可控的 Node.js/npm 随应用交付。

## 什么时候才算“完成”

Agent 输出一句“已完成”不等于游戏真的可以试玩。liimit.ai 在 Agent 成功结束且 Runtime 正常退出后，还会运行独立门槛：

1. 桌面端使用固定模板的构建脚本，重新构建本轮的当前源码，不复用上一次的旧 `dist`。
2. 项目必须已生成 `dist/index.html`，且 liimit.ai 能为 `dist` 启动本地 Web 预览。
3. HTML 必须非空、包含 `#game-container`，并引用同源的本地 `type="module"` JavaScript 入口。
4. 对 HTML 和 JavaScript 的 HTTP 请求都必须成功，且返回正确的响应类型。

四项都通过后，项目才标记为完成。如果探测失败，项目会保持等待修复状态，界面告诉用户还需要继续构建或修改。

这个门槛证明“当前源码可构建，且 Web 的 HTML/JS 入口可读”，不能证明 JavaScript 运行后不会报错、关卡一定能通关、手感一定好或所有内容都正确。用户仍需要在“预览”中亲自试玩。

## 不属于当前生产流程的历史能力

仓库中可能仍然保留 Unity、Godot、Unreal、Blender、Skills 或 MCP 相关的历史兼容代码和开发者研究入口。它们不是当前向用户开放的游戏制作能力，不会把固定横版流程变成任意引擎或任意游戏类型生成器。

## 停止与恢复

- macOS 会先发送终止信号；Windows 会终止 Agent 对应的进程树，超时后强制结束。
- 会话记录与已经写入的项目文件不会删除。
- 再次输入要求并点击“继续执行”，应用会使用保存的 `sessionId` 恢复。
- 如果超大历史会话无法恢复，可新建会话，并要求 Agent 先审计 `GAME_DESIGN.md` 与现有文件。

桌面调度器当前在整个应用中只有一个执行槽位，不支持隐藏的多项目后台队列。

## 权限与安全边界

桌面版的完整游戏流程使用“完整自动化 / yolo”，允许 Agent 在当前项目目录写文件并运行项目
命令。请使用专用工作目录，不要选择已有重要资料目录；建议用 Git 或其他方式备份。

- 不要把 API Key 写进提示词、项目 `.env` 或代码。
- 密钥只通过受控 fd 通道传给 Agent Runtime，不放进命令行、常规环境变量或调用历史。
- 已在聊天、截图或日志中公开的 Key 应立即在服务商后台吊销并重建。
- Web 游戏预览运行在没有 Node 权限的 iframe sandbox 中。

## 从源码启动

```bash
# 在当前 liimit.ai 仓库根目录执行
cd liimit.ai
npm install
npm run bundle
npm run desktop
```

源码开发要求 Node.js 20+、npm 与 Git。Windows 建议在 PowerShell 中执行；目录可以包含空格或
中文，但不要使用 `CON`、`PRN`、`AUX`、`NUL`、`COM0`—`COM9`、`LPT0`—`LPT9` 等 Windows
保留设备名。

## 无付费模型的基础设施冒烟检查

开发者可以在仓库根目录运行：

```bash
npm run smoke:playable --workspace=@gameagent/desktop
```

这条命令不调用 Agent 模型 API，因此不产生 AI Provider 费用。它会在临时目录中：

1. 复制固定 Phaser 3 横版模板。
2. 用提交的锁定文件真实执行 `npm ci`。
3. 写入确定性的最小横版样板源码，并执行 Web 构建。
4. 确认 `dist/index.html` 和浏览器 JavaScript 已生成，再执行同一套本地 HTTP 入口探测。
5. 删除临时项目。

这个自动检查不会启动真实浏览器，也不会按键操作角色。检查通过只能证明固定模板、真实
`npm ci`、Web 构建和 HTML/JavaScript HTTP 入口基础设施可用；左右移动、跳跃、危险物恢复和到达终点必须
另行在 liimit.ai 应用内预览中做人工 QA。首次执行可能访问 npm 软件包源；这是依赖下载，
不是付费模型调用。

## 本机打包

当前平台通用入口：

```bash
npm run desktop:package
```

macOS DMG：

```text
packages/desktop/release/liimit.ai-<version>-arm64.dmg
```

Windows 11 x64 Setup EXE：

```powershell
npm run desktop:package:win
npm run desktop:verify:win
```

```text
packages/desktop/release/liimit.ai-<version>-windows-x64-setup.exe
```

普通本地构建默认未签名，只能用于开发验证。Windows 正式版必须通过 Authenticode 验证，macOS
正式版必须完成 Developer ID 签名与公证。

## 升级与卸载

当前没有内置自动更新。安装器配置为在手动覆盖安装和卸载时保留应用数据，也不以用户主动选择
的游戏项目目录为目标。正式发布前仍必须在干净系统执行 N→N+1 覆盖安装和卸载测试，确认兼容
配置、凭据与项目保持可用。
