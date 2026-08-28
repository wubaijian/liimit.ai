# Data Model: 掉落死亡与移动敌人

## Level object types

`LevelObjectType` gains `slime` and `bee`. Existing values and document version 1 remain valid.

## Enemy movement

An enemy may contain `movement` with `axis`, positive `distance`, and positive `speed`. Slime defaults to horizontal/192/70; bee defaults to horizontal/256/95. Patrol is clamped to the level boundary and does not modify the authored position.

## Compatibility conversion

- A `spike` whose ID starts `yandeu-slime-` becomes `slime` with defaults.
- A `spike` whose ID starts `yandeu-bee-` becomes `bee` with defaults.
- Every other spike remains a spike.

The next normal save persists the normalized explicit type.

## Runtime enemy state

Runtime state contains object ID, kind, body, axis, minimum, maximum, speed, and direction. It is recreated per level and is not saved.

## Fall death transition

`playing` → below margin → `dying` → counters updated → checkpoint/spawn selected → restart. The existing guard prevents duplicates.
