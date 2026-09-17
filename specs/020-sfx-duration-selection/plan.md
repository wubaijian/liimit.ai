# Implementation Plan: 音效时长选择

**Branch**: `020-sfx-duration-selection` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

## Summary

在现有自定义描述请求中增加受限的 `durationSeconds`。共享层集中定义 16 个半秒档位和六种用途推荐值；Renderer 使用选择框展示，切换用途时恢复推荐值；Main 再次校验；音效服务把时长交给现有 ElevenLabs 请求并在结果中回传。时长和描述继续只存在于当前弹窗和一次请求，不新增项目或用量持久化。

## Technical Context

**Language/Version**: TypeScript 5.8, Node.js 20+

**Primary Dependencies**: Electron 43, React 19, Vite 7, Vitest 3

**Storage**: 无新增持久化；时长只存在于 Renderer 内存和单次 IPC/网络请求

**Testing**: Vitest 服务测试、源码契约测试、桌面 TypeScript 检查、完整测试和正式构建

**Target Platform**: liimit.ai macOS/Windows Electron 桌面端

**Project Type**: npm workspaces 中的桌面应用

**Performance Goals**: 切换用途后即时显示推荐值；不增加额外网络请求

**Constraints**: 0.5～8 秒、0.5 秒步长、单条 MP3、30 秒超时、1 MiB 上限

**Scale/Scope**: 16 个可选值、6 个推荐映射、1 个共享输入字段、1 个返回字段、1 个 Main 校验点

## Constitution Check

_GATE: Passed before research and after design._

- **I 产品事实**: 只宣称时长选择，不描述三候选已完成。
- **II 信任边界**: Renderer 只传固定用途、描述和受限数字；Main 做有限值、范围和步长校验。
- **III 显式副作用**: 调整时长只清除临时试听，不写项目。
- **V 零信任**: 时长不是凭据，仍不记录描述、密钥、URL 或音频正文。
- **VI 兼容性**: 输入和结果增加必填数值，当前唯一调用方同批迁移；项目格式和存储结构不变，契约测试覆盖默认值与边界。
- **VII 证据**: 使用本地假响应覆盖三个有效值和四类无效值，再执行完整桌面门槛。

后设计复查：未增加 IPC 通道、持久化、文件写入或依赖，所有宪章门槛继续通过。

## Project Structure

```text
specs/020-sfx-duration-selection/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/audio-duration.md
├── checklists/requirements.md
└── tasks.md

packages/desktop/
├── src/shared/types.ts
├── src/main/main.ts
├── src/main/audioPreviewService.ts
├── src/main/audioPreviewService.test.ts
├── src/renderer/components/SettingsDialog.tsx
├── src/renderer/styles.css
└── test/audio-api-settings.test.ts
```

**Structure Decision**: 扩充现有 Renderer → Preload → Main → 服务链路，不新增方法或 IPC 通道。

## Complexity Tracking

无宪章例外。
