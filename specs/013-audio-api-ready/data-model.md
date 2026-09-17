# Data Model: 音效 API 接通与测试

## Existing: ProviderEndpoint

Represents one provider configuration.

- `provider`: selected provider name
- `baseUrl`: service origin entered by the user
- `model`: configured model label
- `apiKey`: editable key; public saved settings always return an empty value
- `apiKeyConfigured`: whether Main can recover a saved key from secure storage
- `apiKeyInherited`: whether the slot is using an allowed fallback credential

No persisted fields change.

## Existing: ProviderConnectionResult

- `status`: `success | warning | error`
- `message`: fixed, user-facing and secret-free explanation
- `latencyMs`: elapsed time for the cost-free probe

ElevenLabs adds distinct states for validation success, invalid authentication, authorization/IP restriction, payment, rate limit, timeout and server failure.

## New: AudioPreviewResult

- `provider`: fixed to `elevenlabs`
- `model`: fixed to `eleven_text_to_sound_v2`
- `mimeType`: validated audio type, initially `audio/mpeg`
- `bytes`: bounded temporary audio bytes
- `latencyMs`: elapsed generation time

This object is never persisted. It contains no API key, Base URL, prompt, project identifier or project path.

## New: Audio Router Mode

- `visual`: default; image configuration remains required and video/audio remain optional fallbacks
- `audio`: image configuration is not resolved; audio configuration is resolved and visual methods use disabled stubs if accidentally called

## State Transitions

### Saved audio configuration

`editing (plaintext present in local form)` → `saving` → `saved public state (plaintext cleared, configured=true)`

Failure returns to `editing` and preserves the user's form so they can correct it.

### Temporary preview

`idle` → `generating` → `ready` or `failed`

- `generating` disables another generation.
- Starting a new generation revokes the prior Blob URL.
- Closing the dialog revokes the current Blob URL.
- No transition writes project data.
