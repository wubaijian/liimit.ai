# Implementation Plan: 候选音效单条试听控制

**Branch**: `main` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

## Summary

为三候选播放器增加本地互斥控制：HTML 音频开始播放时暂停并重置其他候选；提供显式“从头播放”；候选移除时停止并清理播放器引用。全部逻辑位于 Renderer，不新增 IPC、持久化或 API 调用。

## Technical Context

**Language/Version**: TypeScript 5.8，React 19，浏览器 HTMLAudioElement

**Dependencies**: 复用原生 `<audio>`、React ref/state 和现有图标，不新增依赖

**Storage**: 只保存当前窗口的播放器引用和播放编号

**Testing**: Vitest 本地假播放器、界面契约、两个 TypeScript 配置、完整回归、正式构建、Electron 界面检查

**Target Platform**: Electron 桌面端

**Constraints**: 不联网、不生成音效、不修改项目；只控制当前候选播放器

## Constitution Check

- **I 产品事实**: 只描述真实本地试听能力。通过。
- **II 信任边界**: 不增加特权或 IPC；全部是 Renderer 音频元素控制。通过。
- **III 显式副作用**: 只有用户播放/暂停/从头播放触发本地音频；不联网。通过。
- **IV 可观察**: 显示当前播放候选和明确从头播放入口。通过。
- **V 凭据零信任**: 不读取、不传输凭据。通过。
- **VI 兼容性**: 不修改共享数据和持久化；现有候选契约不变。通过。
- **VII 证据**: 先写互斥、重置、重新播放测试，再实现并完整回归。通过。

## Project Structure

```text
packages/desktop/
├── src/renderer/audioCandidatePlayback.ts
├── src/renderer/audioCandidatePlayback.test.ts
├── src/renderer/components/SettingsDialog.tsx
├── src/renderer/styles.css
└── test/audio-api-settings.test.ts
```

**Structure Decision**: 可复用的播放器互斥和从头播放规则放入无网络、可注入测试的小模块；设置界面只管理播放器引用和显示。

## Research & Design

- 决策见 [research.md](./research.md)。
- 状态见 [data-model.md](./data-model.md)。
- 界面契约见 [exclusive-playback.md](./contracts/exclusive-playback.md)。
- 验证见 [quickstart.md](./quickstart.md)。

## Post-Design Constitution Check

设计没有新增 Renderer 特权、网络、IPC、文件或持久化入口；播放器引用只在当前窗口内生效，候选移除时清理。所有门槛继续通过。

## Complexity Tracking

无 Constitution 违规。
