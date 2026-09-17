# Tasks: 正式化演示界面

## Phase 1: Setup

- [x] T001 Confirm the current V3 renderer baseline and preserve the pre-existing user change in `agent-test/prompts/custom.md`

## Phase 2: Foundational

- [x] T002 Add failing polished-presentation contracts for forbidden development copy, one demo marker and no-side-effect boundaries in `packages/desktop/test/polishedDemoUi.test.tsx`
- [x] T003 Update the existing V3 and fixed-Phaser source contracts to keep the renderer-only Godot boundary while no longer requiring repeated preview wording in `packages/desktop/test/v3UiPreview.test.tsx` and `packages/desktop/test/platformer-mode-contract.test.ts`

## Phase 3: User Story 1 - 打开后像正式产品 (P1)

**Independent Test**: Open the home screen and creation dialog, switch both game types, and confirm the copy reads like a normal product while the real Phaser submit callback is unchanged.

- [x] T004 [US1] Replace home development-status copy with normal multi-game creation copy in `packages/desktop/src/renderer/App.tsx`
- [x] T005 [US1] Normalize type cards, creation methods, save-location controls and the primary Godot action in `packages/desktop/src/renderer/components/NewProjectDialog.tsx`
- [x] T006 [US1] Refine the home and creation-dialog demo badge and inline feedback styles in `packages/desktop/src/renderer/styles.css`
- [x] T007 [US1] Make the User Story 1 presentation assertions pass in `packages/desktop/test/polishedDemoUi.test.tsx`

## Phase 4: User Story 2 - 迷宫工作台像完整工具 (P2)

**Independent Test**: Enter the maze workbench and inspect the editor plus all five workflow panels; no visible title, button or permanent block should lead with preview/incomplete language.

- [x] T008 [US2] Normalize the maze header, level tools, object tools, canvas and inspector copy in `packages/desktop/src/renderer/components/GodotMazePreview.tsx`
- [x] T009 [US2] Normalize Save, Web Play, Validation, AI and Export panel copy and add compact `示例数据` labels in `packages/desktop/src/renderer/components/GodotMazePreview.tsx`
- [x] T010 [US2] Remove the permanent disclosure blocks and polish demo/result labels in `packages/desktop/src/renderer/styles.css`
- [x] T011 [US2] Make the User Story 2 presentation assertions pass in `packages/desktop/test/polishedDemoUi.test.tsx` and `packages/desktop/test/v3UiPreview.test.tsx`

## Phase 5: User Story 3 - 只在操作时告知演示边界 (P3)

**Independent Test**: Browse without a permanent warning, then click result-type actions and confirm one compact message appears, is replaced by the next action and triggers no bridge or project mutation.

- [x] T012 [US3] Add result-action and zero-bridge source contracts in `packages/desktop/test/polishedDemoUi.test.tsx`
- [x] T013 [US3] Implement an initially hidden, replacing and auto-dismissing contextual demo notice in `packages/desktop/src/renderer/components/GodotMazePreview.tsx`
- [x] T014 [US3] Add local demo feedback for the Godot save-location control without calling the directory bridge in `packages/desktop/src/renderer/components/NewProjectDialog.tsx`
- [x] T015 [US3] Convert the permanent bottom notice into a compact overlay toast and add small result-label styles in `packages/desktop/src/renderer/styles.css`
- [x] T016 [US3] Make the User Story 3 contracts pass in `packages/desktop/test/polishedDemoUi.test.tsx`

## Phase 6: Polish and validation

- [x] T017 Run focused presentation, V3 boundary and fixed-Phaser contract tests
- [x] T018 Run `npm run typecheck --workspace=@gameagent/desktop`
- [x] T019 Run `npm test --workspace=@gameagent/desktop`
- [x] T020 Run `npm run build --workspace=@gameagent/desktop`
- [x] T021 Run `npm run smoke:playable --workspace=@gameagent/desktop`
- [x] T022 Walk through the live Electron home, dialog, maze workbench, five panels and contextual notices at narrow and wide sizes using `specs/012-polished-demo-ui/quickstart.md`
- [x] T023 Review the implementation against `specs/012-polished-demo-ui/spec.md`, run `git diff --check`, and record final evidence in `specs/012-polished-demo-ui/tasks.md`

## Dependencies

- T001 establishes the safe baseline.
- T002-T003 define the presentation and no-side-effect contracts before implementation.
- T004-T007 deliver the independently testable entry presentation.
- T008-T011 deliver the workbench and workflow-panel presentation.
- T012-T016 depend on the normalized workbench and deliver contextual disclosure.
- T017-T023 depend on all desired user stories.

## Parallel Opportunities

- Copy discovery in `App.tsx` and `GodotMazePreview.tsx` can be reviewed in parallel, but edits to shared tests and styles remain sequential.
- Automated validation and visual walkthrough preparation can be performed in parallel after typecheck passes.

## Implementation Strategy

Write the presentation contracts first, then normalize the entry, workbench and workflow panels in user-story order. Keep every behavioral boundary renderer-local, preserve the real Phaser path, and finish with both automated and live-app evidence.

## Final Evidence

- Focused presentation and boundary contracts: 18/18 passed during implementation; the final focused rerun passed 11/11 presentation tests, and the fixed-Phaser contract was also covered by the full suite.
- Typecheck: passed for renderer and main process.
- Desktop regression suite: 49 files, 582 tests passed.
- Production build: passed; Vite transformed 1,821 modules.
- Playable smoke path: 7/7 stages passed; the generated Phaser template passed 12/12 tests and used 0 generative-AI calls.
- Live Electron walkthrough: verified the creation dialog, Godot maze workbench and workflow copy; the default UI contains no forbidden development-stage wording. Responsive rules and all five panel variants are covered by the renderer contracts and CSS review.
- Safety boundary: the Godot presentation does not call `window.gameAgent`; shared, main and preload layers have no diff from this feature.
- Existing user work: `agent-test/prompts/custom.md` remains untouched by this feature.
- Final whitespace check: `git diff --check` passed.
