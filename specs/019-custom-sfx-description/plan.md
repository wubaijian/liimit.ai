# Implementation Plan: 自定义音效描述

**Branch**: `019-custom-sfx-description` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/019-custom-sfx-description/spec.md`

## Summary

在现有 AI 音效单条试听流程中增加临时描述输入。Renderer 只传固定声音用途和最长 300 字符的描述；Main 再次校验并从安全存储读取服务凭据；音效服务把经过校验的描述与固定的“短游戏音效、无语音”约束组合后发送给现有 ElevenLabs 官方端点。描述不进入用量记录、项目配置或错误文本。现有试听、确认应用和恢复流程保持不变。

## Technical Context

**Language/Version**: TypeScript 5.8, Node.js 20+

**Primary Dependencies**: Electron 43, React 19, Vite 7, Vitest 3

**Storage**: 描述只保存在当前 Renderer 内存；不新增持久化字段

**Testing**: Vitest 服务单测、源码契约测试、桌面端 TypeScript 检查与正式构建

**Target Platform**: liimit.ai macOS/Windows Electron 桌面端

**Project Type**: npm workspaces 中的桌面应用

**Performance Goals**: 本地输入校验即时完成；外部生成继续沿用 30 秒超时

**Constraints**: 单条约 0.5 秒 MP3、最大 1 MiB、只访问 ElevenLabs 官方 HTTPS 地址、全局一次只允许一个预览请求

**Scale/Scope**: 一个输入字段、六个用途示例、一个共享请求契约、一个 Main 校验点、一个服务调用路径

## Constitution Check

_GATE: Passed before research and passed again after design._

- **I 产品事实与品牌一致性**: 只描述真实交付的单条候选，不声称三候选或编辑器内入口已完成。
- **II 桌面端信任边界**: Renderer 不接触凭据；Preload 只暴露用途和描述；Main 校验枚举、长度和控制字符。
- **III 本地优先与显式副作用**: 临时生成不写项目，只有既有的用户确认应用流程才写入。
- **V 凭据与插件零信任**: 描述不写入用量记录、错误、项目或日志；凭据继续只在 Main 使用。
- **VI 兼容性**: `GenerateAudioPreviewInput` 增加必填描述，现有客户端界面同批更新；返回契约和项目格式不变，并用契约测试保护。
- **VII 证据先于交付**: 先补失败测试，再实现；执行聚焦测试、桌面端类型检查、完整测试和构建。

后设计复查：数据只在 Renderer 当前弹窗和一次受控请求内存在；没有新增持久化、文件路径、协议或权限例外，所有门槛继续通过。

## Project Structure

### Documentation (this feature)

```text
specs/019-custom-sfx-description/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── audio-description.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/desktop/
├── src/shared/types.ts
├── src/main/main.ts
├── src/main/audioPreviewService.ts
├── src/main/audioPreviewService.test.ts
├── src/renderer/components/SettingsDialog.tsx
├── src/renderer/styles.css
└── test/audio-api-settings.test.ts
```

**Structure Decision**: 沿用现有 Renderer → Preload → Main → 音效服务链路；Preload 的方法名和 IPC 通道不变，只扩充强类型输入，避免增加第二条并行生成路径。

## Complexity Tracking

无宪章例外。
