# Quickstart Validation: 音效 API 接通与测试

## 1. Automated focused checks

From the repository root:

```bash
npm exec --workspace=@gameagent/desktop vitest run -- src/main/providerConnection.test.ts src/main/audioPreviewService.test.ts test/audio-api-settings.test.ts test/store.test.ts
npm exec --workspace=@opengame/opengame-core vitest run -- src/services/assetModelRouter.test.ts src/tools/generate-assets.test.ts src/services/assetAudioService.test.ts
```

Expected:

- Empty-body ElevenLabs probe is classified as cost-free success only for validation errors.
- 401, 403, 402, 429, timeout and service failures have distinct, secret-free messages.
- Preview accepts valid MP3 bytes and rejects invalid origin, redirects, content type, empty body and oversized body.
- Saved settings immediately return `apiKeyConfigured=true` with `apiKey=''`.
- Audio mode constructs without image configuration; visual mode still requires it.
- A pure audio request and the audio portion of a mixed batch are not blocked by missing image configuration.

## 2. Required regression gates

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
npm run typecheck --workspace=@opengame/opengame-core
npm test --workspace=@opengame/opengame-core
git diff --check
```

## 3. Desktop walkthrough without spending preview quota

1. Open Settings → API 与用量 → AUDIO.
2. Confirm ElevenLabs, official Base URL and the saved-key status.
3. Click Save Settings and confirm the same open dialog immediately changes to “已配置” and clears the password field.
4. Click 基础测速.
5. Confirm the result says the Sound Effects capability is available and explicitly says no audio was generated.
6. Do not click the preview button yet; confirm it visibly warns about small quota use.

## 4. User-triggered live preview

This is the only validation step that consumes third-party generation quota and must be triggered by the user in the UI.

1. Click “生成测试音效（会消耗少量额度）” once.
2. Confirm the button enters a finite progress state and cannot be clicked twice.
3. Within 30 seconds, confirm a native player appears or a specific error is shown.
4. Play the sound.
5. Generate once more only if desired; confirm the previous preview is replaced.
6. Close Settings and confirm no MP3/WAV file, asset-pack entry or level change was created.

## 5. Product boundary

Passing this guide proves configuration, generation and temporary playback only. It does not prove that jump, coin, death or completion events play project audio; that binding remains a later feature.
