# Tasks: 多游戏类型界面预览

## Phase 1: Setup

- [x] T001 Confirm the renderer baseline, preserve the existing change in `agent-test/prompts/custom.md`, and record the current fixed-mode contract in `packages/desktop/test/platformer-mode-contract.test.ts`

## Phase 2: Foundational

- [x] T002 Add failing renderer contract coverage for the UI-only boundary and privileged-call prohibition in `packages/desktop/test/v3UiPreview.test.tsx`
- [x] T003 Update the fixed-mode assertions to preserve Phaser as the only real creatable product while permitting a disposable Godot UI preview in `packages/desktop/test/platformer-mode-contract.test.ts`

## Phase 3: User Story 1 - 新建时看懂两种游戏方向 (P1)

**Independent Test**: Open the new-project dialog, switch between the two type cards, and verify that only the Phaser path submits to the existing real creation callback.

- [x] T004 [US1] Add game-type and creation-method selection with truthful availability copy in `packages/desktop/src/renderer/components/NewProjectDialog.tsx`
- [x] T005 [US1] Add local Godot-preview routing while preserving the existing Phaser create callback in `packages/desktop/src/renderer/App.tsx`
- [x] T006 [P] [US1] Add Phaser type/engine labels to existing projects in `packages/desktop/src/renderer/components/ProjectRail.tsx`
- [x] T007 [US1] Add responsive type-card, creation-method and project-label styles in `packages/desktop/src/renderer/styles.css`
- [x] T008 [US1] Make the User Story 1 assertions pass in `packages/desktop/test/v3UiPreview.test.tsx` and `packages/desktop/test/platformer-mode-contract.test.ts`

## Phase 4: User Story 2 - 查看迷宫编辑器完整外观 (P2)

**Independent Test**: Enter the maze preview and locate the toolbar, 1-8 level area, object palette, example canvas and property panel; switch a level and select a canvas object without any persistent call.

- [x] T009 [US2] Build the disposable maze workbench shell, example levels, object palette, canvas selection and property panel in `packages/desktop/src/renderer/components/GodotMazePreview.tsx`
- [x] T010 [US2] Add the full-screen responsive workbench, maze grid, objects, panels and disclosure styles in `packages/desktop/src/renderer/styles.css`
- [x] T011 [US2] Add static-render and source-contract coverage for all editor regions and zero `window.gameAgent` use in `packages/desktop/test/v3UiPreview.test.tsx`

## Phase 5: User Story 3 - 预览制作闭环的关键状态 (P3)

**Independent Test**: Open AI, Web playtest, validation and export panels and confirm every action shows a preview-only notice without starting work.

- [x] T012 [US3] Add AI workflow states and the user-confirmation mock panel in `packages/desktop/src/renderer/components/GodotMazePreview.tsx`
- [x] T013 [US3] Add start-level Web-playtest, validation-result and export-plan mock panels in `packages/desktop/src/renderer/components/GodotMazePreview.tsx`
- [x] T014 [US3] Add modal, result-card, state-timeline and preview-notice styles in `packages/desktop/src/renderer/styles.css`
- [x] T015 [US3] Extend the UI-only contract tests for all planned workflow states and no-op feedback in `packages/desktop/test/v3UiPreview.test.tsx`

## Phase 6: Polish and validation

- [x] T016 Run the focused V3 and fixed-Phaser contract tests in `packages/desktop/test/v3UiPreview.test.tsx` and `packages/desktop/test/platformer-mode-contract.test.ts`
- [x] T017 Run both desktop TypeScript checks with `npm run typecheck --workspace=@gameagent/desktop`
- [x] T018 Run the complete desktop test suite with `npm test --workspace=@gameagent/desktop`
- [x] T019 Run the desktop production build with `npm run build --workspace=@gameagent/desktop`
- [x] T020 Run the real desktop walkthrough from `specs/011-v3-ui-preview/quickstart.md`, including minimum-window and Phaser regression checks
- [x] T021 Review the final implementation against `specs/011-v3-ui-preview/spec.md`, run `git diff --check`, and record evidence in `specs/011-v3-ui-preview/tasks.md`

## Dependencies

- T001 establishes the safe baseline.
- T002-T003 define the no-side-effect and fixed-Phaser boundary before implementation.
- T004-T008 deliver the independently testable P1 creation entry.
- T009-T011 depend on the preview route from T005 and deliver the editor shell.
- T012-T015 depend on the workbench shell from T009.
- T016-T021 depend on all desired user-story tasks.

## Parallel Opportunities

- T006 can run in parallel with T004-T005 because it changes a separate component.
- After the P1 route exists, T009 component structure and the initial T010 style work can be prepared in parallel, then verified together.
- Test review and visual review can be split after the implementation is type-safe.

## Implementation Strategy

Deliver P1 first so users can distinguish the real Phaser path from the planned Godot path. Then add the editor shell as a self-contained local preview, followed by the AI/playtest/validation/export state panels. Keep the shared project contract and every privileged layer untouched throughout.

## Final Evidence

- Focused contracts: 2 test files, 13 tests passed.
- Desktop TypeScript check: passed.
- Complete desktop suite: 48 test files, 577 tests passed.
- Desktop production build: passed; the renderer completed a full Vite production build.
- Real Phaser golden path: all 7 smoke stages passed; the generated template also passed 12 tests, used the same Web URL for manual and automatic playtest, and made 0 generative-AI calls.
- UI walkthrough: verified the new-project choices, disposable maze preview, 1-8 level area, object palette, example canvas, inspector, AI confirmation, Web playtest, validation, save and export panels at narrow and wide viewport sizes. Returning to the home screen left the project count at `00`.
- Safety boundary: no shared project type, main-process, preload, IPC, persistence or Godot runtime path was added. `GodotMazePreview.tsx` contains no `window.gameAgent` access.
- Repository hygiene: `git diff --check` passed, and the pre-existing user change in `agent-test/prompts/custom.md` was preserved.
