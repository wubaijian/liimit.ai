# Implementation Plan: 三候选音效试听与选择

**Branch**: `main` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-three-sfx-candidates/spec.md`

## Summary

把现有“一次生成一条音效”扩展为可信主进程控制的一次三候选批次。三个请求使用同一份已校验用途、描述和时长并同时执行；批次返回按原始编号排列的成功候选和失败数量。Renderer 为每条成功候选建立独立临时播放地址，要求用户明确单选后，才把所选字节交给现有确认应用流程。

## Technical Context

**Language/Version**: TypeScript 5.8，Node.js 20+

**Primary Dependencies**: Electron 43、React 19、Vite 7；继续使用原生 `fetch`、`Blob` 和 `<audio>`，不增加依赖

**Storage**: 候选批次、临时播放地址和当前选择只保存在设置窗口内存；不增加持久化字段

**Testing**: Vitest 单元/契约测试、两个桌面端 TypeScript 配置、正式构建、真实 Electron 界面检查

**Target Platform**: macOS 桌面端开发基线；保持现有 Windows 兼容契约

**Project Type**: Electron 桌面应用

**Performance Goals**: 三个请求同时执行；总等待时间由最慢候选决定，而不是三个请求耗时相加

**Constraints**: 单批固定 3 次；每条沿用 30 秒超时和 1 MiB 上限；不自动补发、不自动选择、不自动应用；测试不调用真实 API

**Scale/Scope**: 一个设置窗口、一个全应用音效生成锁、最多 3 个临时 Blob URL

## Constitution Check

_GATE: Phase 0 前通过；Phase 1 设计后再次通过。_

- **I 产品事实与品牌一致性**: 界面只使用 liimit.ai；只声明本次真实交付的三候选能力。通过。
- **II 桌面端信任边界**: Renderer 只提交用途、描述、时长；三请求数量、凭据读取、联网和批次整理都在 Main/服务层完成。通过。
- **III 本地优先与显式副作用**: 候选仅临时存在；只有用户选择、点击应用并通过现有系统确认后才写当前项目。通过。
- **IV 可观察与单任务**: 复用全应用单批次锁，显示生成中、部分成功、全部失败和完成状态，不声明后台队列。通过。
- **V 凭据零信任**: 密钥继续从安全存储读取；批次返回和用量记录不含密钥、URL、描述或路径。通过。
- **VI 兼容性**: 内部生成返回契约从单条升级为批次；Preload、Main、Renderer 和契约测试同改。没有持久化数据迁移；旧项目、凭据和已应用音效不受影响。通过。
- **VII 证据先于交付**: 先写批次/部分失败/选择测试，再实现；执行聚焦测试、类型检查、完整测试、构建和真实界面验收。通过。

## Project Structure

### Documentation (this feature)

```text
specs/021-three-sfx-candidates/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── audio-candidate-batch.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/desktop/
├── src/shared/types.ts
├── src/main/audioPreviewService.ts
├── src/main/audioPreviewService.test.ts
├── src/main/main.ts
├── src/main/preload.cts
├── src/renderer/components/SettingsDialog.tsx
├── src/renderer/styles.css
└── test/audio-api-settings.test.ts
```

**Structure Decision**: 延续当前 `Renderer -> Preload -> IPC -> Main 服务` 路径。批次生成逻辑放在可注入、可测试的 `audioPreviewService.ts`，Main 只处理安全校验、互斥和用量记录；Renderer 只管理临时播放与单选界面。

## Phase 0: Research Decisions

见 [research.md](./research.md)。核心决策为：Main 端固定三请求并行、`Promise.allSettled` 支持部分成功、候选编号稳定、无自动补发、无默认选择。

## Phase 1: Design

- 数据和状态见 [data-model.md](./data-model.md)。
- IPC/界面契约见 [audio-candidate-batch.md](./contracts/audio-candidate-batch.md)。
- 验证流程见 [quickstart.md](./quickstart.md)。

## Post-Design Constitution Check

- 设计没有新增 Renderer 特权、路径或持久化入口。
- 批次上限由可信端固定，Renderer 不能请求任意数量。
- 部分失败只返回失败数量，不返回第三方错误正文或敏感请求数据。
- 应用仍复用现有二次确认和项目目录保护。
- 所有 Constitution 门槛保持通过，无需例外或复杂度豁免。

## Complexity Tracking

无 Constitution 违规，无需记录例外。
