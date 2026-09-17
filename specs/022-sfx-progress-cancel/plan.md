# Implementation Plan: 音效生成进度与主动停止

**Branch**: `main` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-sfx-progress-cancel/spec.md`

## Summary

在现有固定三候选音效批次上增加可信进度和主动停止能力。Main 为当前批次建立唯一标识与停止控制器；服务层在每条请求结束时回报完成、成功、失败数量；Preload 仅开放最小化的停止方法和只读进度订阅；Renderer 显示真实进度，并在用户发出停止后始终丢弃这一批的所有迟到结果。

## Technical Context

**Language/Version**: TypeScript 5.8，Node.js 20+

**Primary Dependencies**: Electron 43、React 19、Vite 7；继续使用原生 `AbortController`、`fetch` 和 IPC，不增加依赖

**Storage**: 进度、批次标识和停止状态只保存在进程内存；不新增项目或设置持久化字段

**Testing**: Vitest 单元/契约测试、两个桌面端 TypeScript 配置、正式构建、真实 Electron 界面检查

**Target Platform**: macOS 桌面端开发基线；保持现有 Windows 兼容契约

**Project Type**: Electron 桌面应用

**Performance Goals**: 每条候选结束后 1 秒内更新进度；点击停止后立即进入不可重复点击状态

**Constraints**: 总数固定 3；只有一个活动批次；停止后整批作废；测试和界面检查不调用真实 API

**Scale/Scope**: 一个 Main 端活动控制器、一条进度事件通道、一个设置窗口进度区域

## Constitution Check

_GATE: Phase 0 前通过；Phase 1 设计后再次通过。_

- **I 产品事实与品牌一致性**: 只声明真实的进度和停止能力；停止说明不承诺额度退款。通过。
- **II 桌面端信任边界**: 停止控制器和真实请求状态只在 Main/服务层；Renderer 只能发最小化停止请求和接收脱敏进度。通过。
- **III 本地优先与显式副作用**: 只有用户点击停止才中断外部请求；关闭设置不会隐藏触发停止。通过。
- **IV 可观察与单任务**: 延续全应用唯一音效批次，并显示真实计数、停止中和已停止状态。通过。
- **V 凭据零信任**: 进度事件只含批次标识和数字，不含密钥、URL、描述、音频或项目数据。通过。
- **VI 兼容性**: 为共享桥接增加方法和事件；现有生成结果、项目与凭据不迁移，契约测试同步更新。通过。
- **VII 证据先于交付**: 先写进度、取消和竞态测试，再实现；执行聚焦测试、类型检查、完整测试、构建和界面验收。通过。

## Project Structure

### Documentation (this feature)

```text
specs/022-sfx-progress-cancel/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── audio-progress-cancel.md
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

**Structure Decision**: 延续 `Renderer -> Preload -> IPC -> Main 服务`。请求停止和进度产生在可信端；Renderer 只管理显示、用户意图和迟到结果丢弃。

## Phase 0: Research Decisions

见 [research.md](./research.md)。核心决策为：外部停止信号与单请求超时分离；进度由批次服务在每条请求落定时产生；Main 使用批次标识隔离旧事件；用户停止意图在 Renderer 端优先于迟到完成结果。

## Phase 1: Design

- 数据和状态见 [data-model.md](./data-model.md)。
- IPC/界面契约见 [audio-progress-cancel.md](./contracts/audio-progress-cancel.md)。
- 验证流程见 [quickstart.md](./quickstart.md)。

## Post-Design Constitution Check

- Renderer 没有得到凭据、联网或直接控制器权限。
- 停止通道没有用户数据参数，只作用于可信端当前唯一批次。
- 进度事件只含允许字段，并用批次标识防止迟到污染。
- 停止后的迟到结果在 Main 服务和 Renderer 两层作废。
- 关闭窗口不自动产生外部副作用。
- 所有 Constitution 门槛保持通过，无需例外或复杂度豁免。

## Complexity Tracking

无 Constitution 违规，无需记录例外。
