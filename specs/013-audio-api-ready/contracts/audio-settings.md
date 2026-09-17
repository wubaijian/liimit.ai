# Contract: 音效 API 设置与临时试听

## Cost-free provider probe

Existing renderer contract:

```ts
testProviderConnection(
  input: ProviderConnectionInput,
): Promise<ProviderConnectionResult>
```

For `slot=audio` and `provider=elevenlabs`:

- Request only the official ElevenLabs HTTPS origin.
- Send an authenticated `POST /v1/sound-generation` with an empty JSON object.
- Never include valid generation text.
- Treat only a missing-field/validation response as successful capability validation.
- Map 401 to invalid/expired key.
- Map 403 to missing Sound Effects permission, IP restriction or unavailable capability; do not label it as an invalid key.
- Map 402 and 429 to warnings.
- Do not return raw bodies or credentials.

## Temporary audio preview

Additive Preload contract:

```ts
generateAudioPreview(): Promise<AudioPreviewResult>
```

IPC channel: `settings:generate-audio-preview`

Renderer input: none.

Main behavior:

1. Read the saved runtime audio endpoint from secure storage.
2. Require `provider=elevenlabs`, a recoverable key and the official HTTPS origin.
3. Generate one fixed 0.5-second, no-speech game confirmation sound with `eleven_text_to_sound_v2`.
4. Reject redirects, time out within 30 seconds, require `audio/mpeg`, reject empty or greater-than-1-MiB content.
5. Return only provider, model, MIME, bytes and latency.
6. Record one secret-free usage outcome; never persist the prompt, URL, key or audio bytes.

Renderer behavior:

1. Show the action only for AUDIO + ElevenLabs.
2. Require a saved configuration and label the action as consuming a small amount of ElevenLabs quota.
3. Disable repeat actions while running.
4. Convert bytes to a Blob URL and render native audio controls.
5. Revoke the prior URL before replacement and on dialog unmount.
6. Never add the preview to a project or asset pack.

## Save return contract

`SettingsDialog.onSave` returns the public `AppSettings` received from Main. The dialog replaces its local editable copy with that return value after success so that:

- `apiKeyConfigured` is current;
- the plaintext input becomes empty;
- inherited flags match runtime rules;
- unsaved fields are not overwritten before a successful save.

## Asset router contract

`createModelRouter()` keeps visual mode as the default. `createModelRouter({ requiredModality: 'audio' })` does not resolve image credentials. The asset tool owns separate visual and audio router caches, so mixed requests do not share initialization order or configuration failures.
