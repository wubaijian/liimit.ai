# Implementation Plan: 掉落死亡与移动敌人

**Branch**: `010-moving-enemies` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

## Summary

Extend the shared level contract with explicit slime and bee objects, keep old projects readable through a narrow legacy-ID migration, render and edit the new types in the desktop editor, and make the fixed preview apply bounded patrol motion plus directional stomp collisions. A universal out-of-bounds check routes falls through the existing death/lives/checkpoint flow without hidden hazards.

## Technical Context

**Language/Version**: TypeScript 5.8, ES Modules, Node.js 20+

**Primary Dependencies**: React 19, Electron 43, Phaser 3 template runtime

**Storage**: Local `src/level.json` and `src/levels.json` project files

**Testing**: Vitest, TypeScript checks, Vite builds, playable smoke checks

**Target Platform**: liimit.ai desktop editor on macOS/Windows; generated games in modern web browsers

**Project Type**: Electron desktop application plus generated Phaser web-game template

**Performance Goals**: Smooth 60 fps preview at the supported 2,000-object level limit

**Constraints**: Offline-capable; no renderer filesystem access; old files remain readable; death emitted once per outcome

**Scale/Scope**: Two enemy types, one shared schema, one editor, fixed preview template, existing five-level sample

## Constitution Check

_GATE: Passed before research and re-checked after design._

- **Brand/product truth**: Pass. New UI copy uses liimit.ai terminology and only describes verified behavior.
- **Desktop trust boundary**: Pass. Existing validated level saving is reused; no privileged renderer access or IPC is added.
- **Local-first/side effects**: Pass. Enemy data remains in portable local level files.
- **Observable/recoverable execution**: Pass. Falls and collisions use the existing structured death event and restart path.
- **Credentials/plugins**: Not affected.
- **Compatibility/migration**: Pass. New types have defaults; only legacy `yandeu-slime-*` and `yandeu-bee-*` spike markers are converted.
- **Evidence gate**: Shared-contract, editor, template, TypeScript, build, sample-game, and browser checks are required.

**Post-design check**: Pass. The design preserves Renderer → Preload → IPC → Main and specifies migration/default behavior.

## Project Structure

```text
specs/010-moving-enemies/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/level-document.md
└── tasks.md

packages/desktop/
├── src/shared/levelDocument.ts
├── src/renderer/components/LevelViewer.tsx
├── src/renderer/levelEditing.ts
├── src/renderer/styles.css
└── test/

agent-test/templates/modules/platformer/src/
├── scenes/VisualLevelScene.ts
├── playtestBot.ts
└── test/

/Users/prom2/Documents/liimit.ai Games/星光森林/src/
├── levels.json
├── level.json
└── scenes/VisualLevelScene.ts
```

**Structure Decision**: Extend the shared contract and renderer; keep gameplay in the protected fixed preview. Mirror the result into the sample project for immediate testing.

## Complexity Tracking

No constitution violations require exceptions.
