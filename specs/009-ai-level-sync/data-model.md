# Data Model: AI 关卡修改同步

## LevelCampaign

- `version`: 必须为 1。
- `levels`: 至少一个关卡，顺序必须保留。

## CampaignLevel

- `id`、`name`、`document`、`abilities`。
- 局部修改只更新指定关卡的 `document` 或明确要求的 `abilities`。

## LevelDocument / LevelObject

- 文档包含 `version`、`width`、`height`、`gridSize`、`objects`。
- 对象支持 `player-spawn`、`platform`、`moving-platform`、`spike`、`coin`、`checkpoint`、`goal`、`pit`。
- AI 新增对象必须使用唯一 ID，位置尺寸必须通过现有解析校验。

## State transition

`Agent running` → `level file written` → `editor reloads` → `build/test` → `Agent non-running` → `open preview reloads`
