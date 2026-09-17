# Tasks: 音效 API 接通与测试

## Phase 1: Setup

- [x] T001 Record the dirty-worktree baseline in `specs/013-audio-api-ready/tasks.md` and preserve existing V3 UI, prompt and documentation changes while implementing this feature
- [x] T002 Confirm the current audio settings, probe, secure-store and asset-router behavior against `specs/013-audio-api-ready/quickstart.md`

**Implementation baseline**: Before this feature, the worktree already contained the user's V3/Godot presentation changes in `agent-test/prompts/custom.md`, `packages/desktop/src/renderer/App.tsx`, `packages/desktop/src/renderer/components/NewProjectDialog.tsx`, `packages/desktop/src/renderer/components/ProjectRail.tsx`, `packages/desktop/src/renderer/styles.css`, related desktop tests, `docs/product/Limit_AI_V3.1_AI音效生成增补需求.md`, and `specs/011-v3-ui-preview/` plus `specs/012-polished-demo-ui/`. This feature preserves those edits and applies only targeted additions where files overlap.

## Phase 2: Foundational contracts

- [x] T003 [P] Add the additive `AudioPreviewResult` and `GameAgentAPI.generateAudioPreview` contract in `packages/desktop/src/shared/types.ts`
- [x] T004 [P] Add failing ElevenLabs probe classification tests in `packages/desktop/src/main/providerConnection.test.ts`
- [x] T005 [P] Add failing Main-only audio preview security and response tests in `packages/desktop/src/main/audioPreviewService.test.ts`
- [x] T006 [P] Add failing audio-mode router tests in `packages/core/src/services/assetModelRouter.test.ts`
- [x] T007 Add failing full-chain settings, IPC, temporary-player and secret-absence contracts in `packages/desktop/test/audio-api-settings.test.ts`

## Phase 3: User Story 1 - 看懂音效 API 是否可用 (P1)

**Goal**: Saving immediately shows a secured configuration, and the cost-free check accurately validates Sound Effects permission without generating audio.

**Independent Test**: Mock ElevenLabs validation, authentication, authorization, billing and rate-limit responses; save an audio key and verify the still-open dialog changes to configured with its plaintext field cleared.

- [x] T008 [US1] Replace the ElevenLabs account probe with an official-origin empty-body Sound Effects capability probe in `packages/desktop/src/main/providerConnection.ts`
- [x] T009 [US1] Parse nested ElevenLabs error details and map 401, 403, 402, 429 and validation outcomes to fixed secret-free messages in `packages/desktop/src/main/providerConnection.ts`
- [x] T010 [US1] Return saved public settings from the renderer save callback in `packages/desktop/src/renderer/App.tsx`
- [x] T011 [US1] Replace the Settings dialog edit copy with the saved public result and clear transient audio state in `packages/desktop/src/renderer/components/SettingsDialog.tsx`
- [x] T012 [US1] Extend encrypted audio save regression coverage in `packages/desktop/test/store.test.ts`
- [x] T013 [US1] Make all User Story 1 provider, save and settings contracts pass in `packages/desktop/src/main/providerConnection.test.ts`, `packages/desktop/test/store.test.ts` and `packages/desktop/test/audio-api-settings.test.ts`

## Phase 4: User Story 2 - 只配音效 API 也能生成声音 (P2)

**Goal**: Pure audio and the audio portion of mixed batches use an audio router that never requires an image credential, while visual requests keep their old checks.

**Independent Test**: Construct audio mode with only an ElevenLabs endpoint and run a pure audio request; verify an accidental visual call fails clearly and default visual mode still rejects missing image configuration.

- [x] T014 [US2] Allow optional image configuration with a disabled visual service while keeping visual mode as the default in `packages/core/src/services/assetModelRouter.ts`
- [x] T015 [US2] Add explicit visual/audio construction modes and prevent legacy model hints from injecting unrelated visual/video providers in audio mode in `packages/core/src/services/assetModelRouter.ts`
- [x] T016 [US2] Split visual and audio router caches and route `audio` assets directly to audio mode in `packages/core/src/tools/generate-assets.ts`
- [x] T017 [US2] Add pure-audio and mixed-batch regression coverage in `packages/core/src/tools/generate-assets.test.ts`
- [x] T018 [US2] Make all User Story 2 router, asset tool and existing professional audio tests pass in `packages/core/src/services/assetModelRouter.test.ts`, `packages/core/src/tools/generate-assets.test.ts` and `packages/core/src/services/assetAudioService.test.ts`

## Phase 5: User Story 3 - 生成并试听一个测试音效 (P3)

**Goal**: A saved ElevenLabs configuration can generate one bounded 0.5-second temporary sound and play it in Settings after an explicit quota warning.

**Independent Test**: Mock a valid MP3 response through the complete shared→Preload→IPC→Main→Renderer contract, then verify playback URL creation/revocation, duplicate-click prevention and no project writes.

- [x] T019 [US3] Implement official-origin, fixed-prompt, 30-second and 1-MiB-bounded preview generation in `packages/desktop/src/main/audioPreviewService.ts`
- [x] T020 [US3] Add the no-input preview bridge in `packages/desktop/src/main/preload.cts` and secure IPC handler with secret-free usage recording in `packages/desktop/src/main/main.ts`
- [x] T021 [US3] Add preview progress, explicit quota warning, native audio player and Blob URL cleanup in `packages/desktop/src/renderer/components/SettingsDialog.tsx`
- [x] T022 [US3] Add the compact audio-test card and responsive player styles in `packages/desktop/src/renderer/styles.css`
- [x] T023 [US3] Correct recent-activity labels so preview asset tests are not displayed as Agent calls in `packages/desktop/src/renderer/components/SettingsDialog.tsx`
- [x] T024 [US3] Make all User Story 3 service, IPC, UI, security and no-write contracts pass in `packages/desktop/src/main/audioPreviewService.test.ts` and `packages/desktop/test/audio-api-settings.test.ts`

## Phase 6: Polish and validation

- [x] T025 Run the focused desktop and core checks from `specs/013-audio-api-ready/quickstart.md`
- [x] T026 Run `npm run typecheck --workspace=@gameagent/desktop` and `npm run typecheck --workspace=@opengame/opengame-core`
- [x] T027 Run `npm test --workspace=@gameagent/desktop` and `npm test --workspace=@opengame/opengame-core`
- [x] T028 Run `npm run build --workspace=@gameagent/desktop`
- [x] T029 Walk through save refresh, cost-free probe and the visible quota warning without triggering paid generation using `specs/013-audio-api-ready/quickstart.md`
- [x] T030 Review the implementation against `specs/013-audio-api-ready/spec.md`, run `git diff --check`, verify no secret or project output was added, and record final evidence in `specs/013-audio-api-ready/tasks.md`

## Dependencies

- T001-T002 establish the safe baseline around existing user changes.
- T003-T007 define additive contracts and failing tests before behavior changes.
- T008-T013 deliver the independently testable cost-free configuration path.
- T014-T018 are independent of the UI path after foundation and deliver core audio-only routing.
- T019-T024 depend on T003 and the secure saved-key behavior from User Story 1.
- T025-T030 depend on all desired user stories.

## Parallel Opportunities

- Desktop provider/save work and core audio-router work touch different packages and can proceed in parallel after foundational contracts.
- Preview service tests and core router tests are parallelizable because they share no files.
- Final desktop and core test suites can run in parallel after both TypeScript checks pass.

## Implementation Strategy

Complete the no-cost configuration path first, then independently remove the core image dependency, and only then expose the user-triggered preview. Keep the paid live preview for the user to trigger after automated and no-cost walkthroughs pass.

## Final Evidence (2026-09-01)

- Focused desktop checks: 4 files, 99 tests passed (`providerConnection` 21, `audioPreviewService` 14, settings/IPC contract 10, encrypted store 54).
- Focused core checks: 3 files, 17 tests passed (`assetModelRouter` 3, professional audio service 8, `generate-assets` 6).
- TypeScript: desktop renderer/Main and core typechecks passed.
- Full regressions: desktop 51 files / 622 tests passed; core 3202 tests passed and 2 pre-existing tests skipped.
- Production build: desktop Vite renderer and Electron Main build passed (1821 renderer modules transformed).
- Live no-cost walkthrough: saved ElevenLabs settings remained marked `已配置`, the password field remained cleared, and the capability probe completed in 867 ms with `Sound Effects 音效能力可用`, `未生成音频`, and `未消耗生成额度`.
- The paid preview stayed idle (`尚未生成测试音效`). Its button visibly warned that it would consume a small amount of ElevenLabs quota; it was deliberately not clicked.
- Project no-write evidence: the `星光森林` project digest before and after saving plus the cost-free probe was identical: `fcaf84c105a8d30f5ecef6c8f9c9620537fa4798`.
- Security and repository checks: `git diff --check` passed; no new MP3/WAV/OGG output appeared; saved credentials are absent from renderer inputs, preview parameters, usage records and error text; final read-only review found no blocking issue.
- Spec convergence: all FR-001 through FR-015 and SC-001 through SC-007 have implementation or test/walkthrough evidence. The only intentionally deferred step is the user-triggered paid live preview described in `quickstart.md`; game-event binding remains outside this feature by design.
