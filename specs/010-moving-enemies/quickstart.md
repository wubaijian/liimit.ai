# Quickstart validation: 掉落死亡与移动敌人

## Automated checks

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
```

In `星光森林`: run `npm test` and `npm run build`.

## Manual editor check

1. Open `星光森林`; confirm史莱姆 and蜜蜂 have separate names and shapes.
2. Drag one enemy, save, switch levels, and return.
3. Copy and delete an enemy; confirm both persist.

## Manual play check

1. Start each of five levels directly.
2. Walk into a gap; confirm one death and same-level restart.
3. Observe one史莱姆 and one蜜蜂 for a complete patrol.
4. Side contact kills the player; a stomp removes the enemy and bounces the player.
5. Open an older enemy-free project and confirm it still works.
