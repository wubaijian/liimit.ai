# Implementation Plan: 本地补齐缺少音效候选

本功能在 Renderer 使用确定性波形合成器生成缺失编号的 WAV；不新增生成 IPC。共享候选类型增加本地来源和 WAV；现有项目应用 IPC增加经过校验的媒体类型，Main按签名写入白名单 `.mp3` 或 `.wav` 路径并兼容旧配置。

## Constitution Check

- 本地补齐由用户显式触发，不联网、不读凭据。
- Renderer只生成内存音频；项目写入仍经过可信Main确认和路径保护。
- 共享和持久化兼容变化包含旧MP3读取、WAV默认与契约测试。
- 先写生成、缺失编号、WAV应用和界面测试，再实现。

## Files

- `packages/desktop/src/renderer/localSfxFallback.ts`
- `packages/desktop/src/renderer/localSfxFallback.test.ts`
- `packages/desktop/src/renderer/components/SettingsDialog.tsx`
- `packages/desktop/src/shared/types.ts`
- `packages/desktop/src/main/main.ts`
- `packages/desktop/src/main/projectAudioOverrideService.ts`
- `agent-test/templates/modules/platformer/src/localSfx.ts`
- 对应测试和样式

## Post-design Check

无新增网络、密钥或任意路径入口；本地候选来源透明，应用仍需用户确认。无宪章例外。
