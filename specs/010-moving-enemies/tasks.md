# Tasks: 掉落死亡与移动敌人

## Phase 1: Setup

- [x] T001 Confirm repository and sample-project baselines and preserve unrelated changes in `/Users/prom2/Desktop/项目/游戏平台/liimit.ai` and `/Users/prom2/Documents/liimit.ai Games/星光森林`

## Phase 2: Foundational

- [x] T002 Add explicit enemy types, patrol defaults, validation, and narrow legacy conversion in `packages/desktop/src/shared/levelDocument.ts`
- [x] T003 Add shared contract and migration tests in `packages/desktop/test/levelDocument.test.ts`

## Phase 3: User Story 1 - 掉出关卡立即死亡 (P1)

**Independent Test**: Walk off a platform gap and confirm one `fall` death, life decrement, and current-level respawn.

- [x] T004 [US1] Add out-of-bounds death behavior to `agent-test/templates/modules/platformer/src/scenes/VisualLevelScene.ts`
- [x] T005 [US1] Add fall-death template assertions in `packages/desktop/test/visualLevelPreviewTemplate.test.ts`
- [x] T006 [US1] Mirror fall-death behavior into `/Users/prom2/Documents/liimit.ai Games/星光森林/src/scenes/VisualLevelScene.ts`

## Phase 4: User Story 2 - 正式识别和编辑敌人 (P2)

**Independent Test**: View, drag, save, copy, and delete separate史莱姆/蜜蜂 objects in the editor.

- [x] T007 [US2] Add enemy labels and SVG shapes in `packages/desktop/src/renderer/components/LevelViewer.tsx`
- [x] T008 [P] [US2] Add enemy editor styles and legend markers in `packages/desktop/src/renderer/styles.css`
- [x] T009 [US2] Extend movable/copyable/resizable enemy behavior in `packages/desktop/src/renderer/levelEditing.ts`
- [x] T010 [US2] Add enemy editing tests in `packages/desktop/test/levelEditing.test.ts`
- [x] T011 [US2] Migrate five sample levels and fallback level in `/Users/prom2/Documents/liimit.ai Games/星光森林/src/levels.json` and `/Users/prom2/Documents/liimit.ai Games/星光森林/src/level.json`

## Phase 5: User Story 3 - 敌人按范围巡逻 (P3)

**Independent Test**: Observe both enemy types complete a patrol; verify stomp and side-contact outcomes.

- [x] T012 [US3] Add runtime enemy rendering, bounded patrol motion, and stomp/side collision behavior in `agent-test/templates/modules/platformer/src/scenes/VisualLevelScene.ts`
- [x] T013 [P] [US3] Teach the deterministic bot to recognize enemy hazards in `agent-test/templates/modules/platformer/src/playtestBot.ts`
- [x] T014 [US3] Add template contract assertions for enemy patrol and collision in `packages/desktop/test/visualLevelPreviewTemplate.test.ts`
- [x] T015 [US3] Mirror the verified runtime enemy behavior into `/Users/prom2/Documents/liimit.ai Games/星光森林/src/scenes/VisualLevelScene.ts`

## Phase 6: Polish and validation

- [x] T016 Run desktop TypeScript checks, desktop tests, and desktop build from `/Users/prom2/Desktop/项目/游戏平台/liimit.ai`
- [x] T017 Run tests and build from `/Users/prom2/Documents/liimit.ai Games/星光森林`
- [x] T018 Run editor rendering checks and real browser gameplay checks from `specs/010-moving-enemies/quickstart.md`
- [x] T019 Review implementation against `specs/010-moving-enemies/spec.md` and record final evidence in `specs/010-moving-enemies/tasks.md`

## Dependencies

- T002-T003 establish the shared contract and block enemy editor work.
- T004-T006 are the independently deliverable P1 fall-death slice.
- T007-T011 depend on T002-T003.
- T012-T015 depend on the explicit types from T002 and sample migration from T011.
- T016-T019 depend on all desired story tasks.

## Implementation Strategy

Deliver and verify the P1 fall-death rule first, then the editor truthfulness slice, then moving gameplay. Preserve ordinary spikes and old enemy-free projects throughout.

## Final Evidence

- Desktop type checks passed.
- Desktop build passed.
- Desktop tests passed: 47 files, 571 tests.
- `星光森林` build passed; 2 files and 11 tests passed.
- Real browser telemetry recorded one `{ type: 'died', objectId: 'fall' }` event followed by a same-level restart.
- With the player stationary, two browser-rendered frame checks differed after three seconds, confirming independent enemy patrol motion.
- Editor SVG rendering, labels, addition controls, movement/copy/delete data behavior, legacy migration, and save-compatible parsing are covered by passing desktop tests.
- Direct macOS capture of the already-running Electron window was unavailable because ScreenCaptureKit failed to start; no product failure was observed from that diagnostic limitation.
