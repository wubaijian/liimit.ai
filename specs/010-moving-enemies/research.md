# Research: 掉落死亡与移动敌人

## Universal fall death

**Decision**: Detect the player below the level plus a small margin and route the outcome through `handleDeath('fall')`.

**Rationale**: Every gap works without invisible traps while preserving lives, checkpoints, telemetry, and restarts.

**Alternatives considered**: Generate pits below every gap; rely only on world bounds.

## Enemy data contract

**Decision**: Add `slime` and `bee` types with optional patrol movement and safe parsed defaults.

**Rationale**: Explicit types make editor and preview agree while keeping hand-authored files simple.

**Alternatives considered**: Encode by spike ID; use one generic enemy subtype.

## Compatibility

**Decision**: Convert only spikes whose IDs begin `yandeu-slime-` or `yandeu-bee-`.

**Rationale**: The affected sample already uses these prefixes, so the migration is precise.

**Alternatives considered**: Rewrite projects on disk; reinterpret every spike.

## Patrol and collision

**Decision**: Use bounded horizontal patrols. Slimes patrol on ground and bees fly in air. A descending player whose feet were above the enemy top stomps it; other contact is lethal.

**Rationale**: Bounded motion is editable, testable, and matches the chosen game's core behavior without pathfinding.

**Alternatives considered**: Physics edge detection alone; player-chasing AI.
