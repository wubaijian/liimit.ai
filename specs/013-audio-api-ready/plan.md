# Implementation Plan: 音效 API 接通与测试

**Branch**: `013-audio-api-ready` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

## Summary

修正 ElevenLabs 基础检查对受限密钥的误判，保存后立即刷新“已配置”状态；为设置页增加一条不经过 Agent、只从主进程安全存储读取密钥的短音效试听链路；同时把素材工具的视觉路由和音频路由分开，让纯音效和混合批次中的音效不再被图片配置阻断。测试音效只保存在内存，不写入项目，也不绑定游戏事件。

## Technical Context

**Language/Version**: TypeScript 5.8, ES Modules, Node.js 20+

**Primary Dependencies**: Electron 43, React 19, native `fetch`, existing API usage store and operating-system `safeStorage`

**Storage**: Existing encrypted settings and non-secret API usage records; preview audio remains in renderer memory only

**Testing**: Vitest unit and source-contract tests, desktop renderer/main TypeScript checks, core TypeScript check, desktop/core regression suites, Vite/Electron production build

**Target Platform**: liimit.ai Electron desktop client on macOS and Windows

**Project Type**: npm-workspaces monorepo with desktop application and shared Agent/core runtime

**Performance Goals**: Cost-free probe completes or times out within 15 seconds; real 0.5-second preview completes or reports a fixed error within 30 seconds; preview response is at most 1 MiB

**Constraints**: Renderer never receives a saved API key; preview accepts no renderer-provided URL, key or prompt; only the official ElevenLabs HTTPS origin is allowed; no project write; no game binding; no concurrent preview generation

**Scale/Scope**: One audio provider capability probe, one temporary preview, one additive IPC method, and one visual/audio router split

## Constitution Check

_GATE: Passed before research and re-checked after design._

- **Product truth**: Pass. UI calls this a temporary API test and explicitly says it is not project audio or a game binding.
- **Desktop trust boundary**: Pass. Renderer uses one typed Preload method with no input; the Main process validates saved provider, official origin, response type and size before returning audio bytes.
- **Local-first/side effects**: Pass. The preview is memory-only, user-triggered and does not touch project paths, asset packs or level documents.
- **Agent observability**: Pass. The preview bypasses the Agent intentionally, exposes progress and a 30-second terminal outcome, and records a non-secret usage result.
- **Credentials/plugins**: Pass. Saved keys remain encrypted and are decrypted only in Main; keys, URLs, prompts and audio bodies are excluded from usage history and renderer inputs.
- **Compatibility/migration**: Pass. The Preload contract is additive. The router keeps visual mode as its default and adds an explicit audio mode, so existing image callers retain their old validation behavior. No persistent schema migration is required.
- **Evidence gate**: Provider classification, response validation, IPC shape, save refresh, audio-only routing, mixed-batch behavior, secret absence, TypeScript checks, regression suites and desktop build all require evidence.

**Post-design check**: Pass. The final design keeps all network and credential access in Main/core services, bounds third-party response data, preserves default visual routing and adds no hidden persistent state.

## Project Structure

```text
specs/013-audio-api-ready/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── audio-settings.md
└── tasks.md

packages/desktop/
├── src/shared/types.ts
├── src/main/
│   ├── providerConnection.ts
│   ├── providerConnection.test.ts
│   ├── audioPreviewService.ts
│   ├── audioPreviewService.test.ts
│   ├── preload.cts
│   └── main.ts
├── src/renderer/
│   ├── App.tsx
│   ├── components/SettingsDialog.tsx
│   └── styles.css
└── test/
    ├── store.test.ts
    └── audio-api-settings.test.ts

packages/core/src/
├── services/
│   ├── assetModelRouter.ts
│   └── assetModelRouter.test.ts
└── tools/
    ├── generate-assets.ts
    └── generate-assets.test.ts
```

**Structure Decision**: Keep cost-free connection classification in the existing desktop provider probe. Add a small Main-only preview service instead of sending saved credentials to Renderer or routing a settings test through the Agent. In core, retain the existing `ModelRouter` API but add explicit visual/audio construction modes and separate cached routers in the asset tool so mixed batches do not depend on processing order.

## Complexity Tracking

No constitution violations require exceptions.
