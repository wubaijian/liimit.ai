# Asset Generation Protocol

> **Scope**: generate_game_assets parameters, generate_tilemap ASCII rules, asset-pack.json / animations.json structure, key consistency rules.
> **NOT in scope**: Phaser implementation code (tilemap loading, collision setup) — see `modules/platformer/platformer.md`.

---

## 1. Asset Generation (Union-Type Interface)

### 1.1 Tool Call Template

```json
generate_game_assets({
  "style_anchor": "16-bit pixel art, vibrant colors, retro arcade style",
  "composition_env": "pure white background, centered, same size across frames, no position offset",
  "output_dir_name": "public/assets",
  "assets": [
    // See asset type examples below
  ]
})
```

### 1.1.1 Batch Generation (IMPORTANT)

If generating \*too many assets**, split into **2 separate tool calls\*\* to avoid timeout:

- **Call 1**: First half of animations + Backgrounds, tilesets, static images (type: background, tileset, image)
- \*_Call 2_: Remaining animations + audio

### 1.2 Asset Type Reference

| Type         | Parameters                                                         | Output Format              | Background Removal |
| ------------ | ------------------------------------------------------------------ | -------------------------- | ------------------ |
| `background` | `key`, `description`, `resolution`                                 | PNG 1536\*1024 (landscape) | No                 |
| `tileset`    | `key`, `description`, `tileset_size?` (default 3)                  | PNG 3*3 grid = 192*192px   | Yes                |
| `animation`  | `key`, `description`, `animations[]`                               | PNG 386\*560 (portrait)    | Yes                |
| `image`      | `key`, `description`                                               | PNG 386\*560 (portrait)    | Yes                |
| `audio`      | `key`, `description`, `audioType`, `duration?`, `genre?`, `tempo?` | WAV (8-bit chiptune)       | N/A                |

**CRITICAL — Parameter restrictions:**

- `type: "image"` accepts ONLY `key` and `description`. **Do NOT pass `size`, `resolution`, or any other parameter** — the output is always 386\*560 PNG. Game code scales the image via `setScale()` or `setDisplaySize()`. Icons, projectiles, and small sprites all use the same output size; scale in code.
- `type: "background"` is the ONLY type that accepts `resolution`. Format: `"1536*1024"` (use `*` asterisk, NOT `x`).
- **Dimension format**: Always use `*` (asterisk) between width and height: `"1536*1024"`, `"1024*1024"`, `"18*18"`. **Using `x` causes API errors.** This applies to `resolution`, `size`, or any dimension string.

### 1.2.1 Character Image Rules (CRITICAL)

| Rule              | Fixed platformer requirement  |
| ----------------- | ----------------------------- |
| **One Per Image** | **ONE character per image**   |
| **View Angle**    | **SIDE VIEW** (profile)       |
| **Direction**     | Face RIGHT by default         |
| **Framing**       | Full body, action-ready       |
| **Asset Type**    | `type: "animation"` (2-frame) |

**CRITICAL**: Each character image must contain **exactly one character** — no groups, no multiple figures, no background characters.

### 1.2.2 Tileset Rules (CRITICAL)

| Rule                      | Requirement                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canvas Fill**           | Tiles MUST fill the ENTIRE canvas, NO blank space, NO margins                                                                                              |
| **Grid Layout**           | Perfect 3\*3 grid with NO gaps between tiles                                                                                                               |
| **Tile Edges**            | Each tile should have clean, seamless edges                                                                                                                |
| **Ground Tileset Art**    | Solid ground needs a readable top edge and a filled body so the player can immediately identify safe landing surfaces                                      |
| **Floating Platform Art** | Floating platforms need a clear top surface, visible thickness, and strong contrast from the background                                                    |
| **Collision Readability** | Ground, platforms, and hazards must remain visually distinct at gameplay scale; avoid busy patterns that compete with characters, collectibles, or enemies |

### 1.2.3 Animation Guidelines

| Guideline                 | Fixed platformer requirement |
| ------------------------- | ---------------------------- |
| Characters with animation | **4-6**                      |
| Frame count               | **2 frames** per action      |
| Priority                  | Frame fluidity               |

**Standard Platformer Animation Set:**

| Character Type  | Required Animations                   |
| --------------- | ------------------------------------- |
| **Player/Hero** | `idle`, `run`, `jump`, `punch`, `die` |
| **Enemy**       | `idle`, `walk`, `attack`, `die`       |

**Frame Count Rule:**

- All character animations use **frameCount: 2**.

Use `type: "image"` for items that don't need animation (coins, powerups, etc.).

### 1.2.4 Animation Prompt Guidelines (CRITICAL)

**action_desc** is the most important parameter for animation quality. Write clear, specific descriptions:

| Animation | Good action_desc                                                         | Bad action_desc  |
| --------- | ------------------------------------------------------------------------ | ---------------- |
| idle      | "standing still, relaxed pose, holding weapon at side"                   | "idle"           |
| run       | "running forward, legs in full stride, arms pumping"                     | "running"        |
| jump      | "mid-air jump, crouched position, arms raised"                           | "jumping"        |
| punch     | "swinging fist/weapon in powerful horizontal arc, follow-through motion" | "punching"       |
| kick      | "kicking forward with extended leg, arms held for balance"               | "kicking"        |
| ultimate  | "raising weapon to sky, magical energy swirling around body"             | "special attack" |
| die       | "falling backward defeated, weapon dropping, body going limp"            | "dying"          |

**Key Principles for action_desc:**

1. **Be specific about body position**: Describe limb positions, body angle
2. **Include motion direction**: "forward", "overhead", "downward arc"
3. **Mention key visual elements**: "sword extended", "shield raised", "cape flowing"
4. **Keep consistency**: Same character description across all animations
5. **Include character-specific props**: "hammer raised", "armor glowing", "cape wrapping"

### 1.2.5 Audio Generation Guidelines

**Output Format**: All audio outputs as `.wav` files (8-bit chiptune style via ABC notation)

**Audio Types:**

| audioType | Purpose          | Default Duration | Typical Use               |
| --------- | ---------------- | ---------------- | ------------------------- |
| `sfx`     | Sound effects    | 1 second         | jump, hit, collect, click |
| `bgm`     | Background music | 5 seconds        | level theme, menu music   |

**Audio Parameters:**

| Parameter   | Values                                                                           | Description                                                 |
| ----------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `audioType` | `"sfx"` / `"bgm"`                                                                | **Required**                                                |
| `duration`  | Number (seconds)                                                                 | Optional. sfx: 0.5-2s, bgm: 10-30s recommended              |
| `genre`     | `"chiptune"`, `"electronic"`, `"orchestral"`, `"rock"`, `"ambient"`, `"fantasy"` | Optional. Music style                                       |
| `tempo`     | `"slow"`, `"medium"`, `"fast"`                                                   | Optional. slow=60-90 BPM, medium=100-130 BPM, fast=140+ BPM |

**Recommended Durations:**

- Jump/Hit SFX: 0.3-0.5s
- Collect/Click SFX: 0.5-1s
- Level BGM: 15-30s (for looping)
- Menu BGM: 10-20s (calm, loopable)

**Audio Prompt Guidelines:**

| Audio Type  | Good description                                            | Bad description    |
| ----------- | ----------------------------------------------------------- | ------------------ |
| Jump SFX    | "8-bit style upward rising pitch, quick bouncy sound"       | "jump sound"       |
| Collect SFX | "magical sparkle chime, ascending notes, positive feedback" | "coin sound"       |
| Hit SFX     | "punchy impact, short bass thump with crack"                | "hit"              |
| Level BGM   | "adventurous orchestral theme, heroic brass, steady rhythm" | "background music" |
| Menu BGM    | "calm ambient melody, soft synth pads, relaxing atmosphere" | "menu music"       |

**Key Principles for Audio:**

1. **Describe the sound quality**: "8-bit", "orchestral", "electronic", "chiptune"
2. **Mention emotional tone**: "heroic", "mysterious", "urgent", "peaceful"
3. **Include instrument hints**: "brass", "strings", "synth", "piano"
4. **For SFX, describe the shape**: "rising pitch", "sharp attack", "quick decay"

### 1.3 Asset Type Examples (one per type)

```json
// Background — landscape, NO background removal
{ "type": "background", "key": "city_bg",
  "description": "New York City skyline at night, retro 16-bit pixel art", "resolution": "1536*1024" }

// Tileset — 3*3 core grid, auto-expanded to 7*7 by TilesetProcessor
{ "type": "tileset", "key": "ruins_tiles",
  "description": "Ancient ruins stone blocks with platforms, 3*3 grid", "tileset_size": 3 }

// Animation — platformer style (2-frame per action, SIDE VIEW)
{ "type": "animation", "key": "thor",
  "description": "Thor with red cape, silver armor, hammer, chibi style, SIDE VIEW facing RIGHT",
  "animations": [
    { "name": "idle", "frameCount": 2,
      "action_desc": "standing still, relaxed pose, holding hammer at side, cape flowing gently" },
    { "name": "run", "frameCount": 2,
      "action_desc": "running forward, legs in full stride, hammer held ready, cape flowing backward" },
    { "name": "die", "frameCount": 2,
      "action_desc": "falling backward defeated, hammer dropping, cape wrapping around body" }
  ]
}
// (Add more actions following the same pattern: jump, punch, kick, ultimate, etc.)

// Image — ONLY key and description. Output always 386*560; game code scales.
{ "type": "image", "key": "coin", "description": "golden coin collectible item, shiny" }
{ "type": "image", "key": "bounce_pad", "description": "Side-view spring jump pad, compressed metal coil, bright landing surface, clear silhouette" }
{ "type": "image", "key": "proj_tapioca", "description": "Small side-view black tapioca projectile with a sticky glistening texture and clear travel direction" }
{ "type": "image", "key": "checkpoint_flag", "description": "Side-view checkpoint flag on a short pole, bright fabric, readable at platformer gameplay scale" }

// Audio SFX
{ "type": "audio", "key": "jump_sfx", "audioType": "sfx", "duration": 0.3,
  "description": "8-bit style upward rising pitch, quick bouncy arcade sound" }

// Audio BGM
{ "type": "audio", "key": "level1_bgm", "audioType": "bgm", "duration": 20,
  "description": "adventurous fantasy theme, heroic melody, steady rhythm, loopable",
  "genre": "fantasy", "tempo": "medium" }
```

### 1.4 Output File Naming Convention

```
public/assets/
  jungle_bg.png               <- type: "background" (1536*1024)
  jungle_tiles.png            <- type: "tileset" (7*7 = 448*448px)
  player_idle_01.png          <- type: "animation"
  player_run_01.png
  player_run_02.png
  player_run_03.png
  player_run_video.mp4        <- I2V source video (if useI2V: true)
  enemy_soldier.png           <- type: "image"
  coin.png                    <- type: "image"
  jump_sfx.wav                <- type: "audio" (sfx)
  level_bgm.wav               <- type: "audio" (bgm)
  asset-pack.json             <- auto-generated manifest
```

---

## 2. Tilemap Generation (ASCII Art to Tiled JSON)

**IMPORTANT**: Use predefined ASCII templates from the module's `design_rules.md`. Do NOT design maps from scratch.

### 2.1 Platformer Example (single tileset)

```json
generate_tilemap({
  "map_key": "level1_map",
  "tileset_key": "city_tiles",
  "tile_size": 64,
  "tileset_grid_size": 3,
  "layout_ascii": ["..P.........E..", "###############"],
  "legend": { ".": 0, "#": 1, "P": 0, "E": 0 },
  "object_markers": { "P": "player_spawn", "E": "enemy_spawn" },
  "output_dir_name": "public/assets"
})
```

### 2.2 Platformer Jump Sequence Example

```json
generate_tilemap({
  "map_key": "jump_trial_map",
  "tileset_key": "ruins_tiles",
  "tile_size": 64,
  "tileset_grid_size": 3,
  "layout_ascii": [
    "....................",
    "............C.......",
    ".........#####......",
    "....C...........E...",
    "..#####.............",
    ".P..............G...",
    "########..##########"
  ],
  "legend": { ".": 0, "#": 1, "P": 0, "E": 0, "C": 0, "G": 0 },
  "object_markers": {
    "P": "player_spawn",
    "E": "enemy_spawn",
    "C": "collectible",
    "G": "goal"
  },
  "output_dir_name": "public/assets"
})
```

Use vertical spacing from the module's `design_rules.md`. Every required jump must be reachable with the configured player jump velocity, and every landing surface must use a solid tile from the same platformer tileset.

### 2.3 Parameter Reference

| Parameter           | Description                                          | Example                   |
| ------------------- | ---------------------------------------------------- | ------------------------- |
| `map_key`           | Unique Phaser key for the output JSON                | `"level1_map"`            |
| `tileset_key`       | MUST match the asset key from `generate_game_assets` | `"jungle_tiles"`          |
| `tile_size`         | Pixel size per tile                                  | `64`                      |
| `tileset_grid_size` | Tileset grid dimension (default 3)                   | `3`                       |
| `layout_ascii`      | Platformer ASCII map from GDD Section 4              | Array of strings          |
| `legend`            | Char → Tile ID mapping (`0` = air)                   | `{ ".": 0, "#": 1 }`      |
| `object_markers`    | Char → spawn or gameplay-object type                 | `{ "P": "player_spawn" }` |

### 2.4 Legend (Platformer 9-Slice)

- `0` = Air (no tile), `1` = Solid tile (ground and floating platforms)
- `2` = Floating platform (optional)
- Characters in `object_markers` map to `0` in legend (they stand on air)
- Use one tileset and one tilemap JSON per level; express all solid platform geometry through `legend`

---

## 3. Asset Pack JSON Structure

### 3.1 Correct Format (Phaser load.pack())

```json
{
  "section_name": {
    "files": [
      { "type": "image", "key": "unique_key", "url": "path/to/asset.png" }
    ]
  }
}
```

### 3.2 Structure Example

```json
{
  "assetPack": {
    "files": [
      {
        "type": "animation",
        "key": "animations",
        "url": "assets/animations.json"
      }
    ]
  },
  "backgrounds": {
    "files": [
      { "type": "image", "key": "city_bg", "url": "assets/city_bg.png" }
    ]
  },
  "tilesets": {
    "files": [
      { "type": "image", "key": "city_tiles", "url": "assets/city_tiles.png" }
    ]
  },
  "tilemaps": {
    "files": [
      {
        "type": "tilemapTiledJSON",
        "key": "level1_map",
        "url": "assets/level1_map.json"
      }
    ]
  },
  "hero_frames": {
    "files": [
      {
        "type": "image",
        "key": "hero_idle_01",
        "url": "assets/hero_idle_01.png"
      },
      {
        "type": "image",
        "key": "hero_idle_02",
        "url": "assets/hero_idle_02.png"
      }
    ]
  },
  "audio": {
    "files": [
      { "type": "audio", "key": "jump_sfx", "url": "assets/jump_sfx.wav" }
    ]
  }
}
```

**Section naming**: Group by purpose (`backgrounds`, `tilesets`, `tilemaps`, `{char}_frames`, `audio`). Each section has a `files` array.

**Frame naming**: `{character}_{action}_{frame}.png`

**CRITICAL**: animations.json entry MUST use `type: "animation"` (NOT `type: "json"`)

- `type: "json"` only loads JSON to cache — does NOT create Phaser animations
- `type: "animation"` auto-creates Phaser animations from the JSON

**WARNING**: animations.json must be loaded with `type: "animation"` ONLY. Do NOT also add a `type: "json"` entry for the same file — this causes double-loading and runtime errors. Example of CORRECT:

```json
{
  "type": "animation",
  "key": "animations_auto",
  "url": "assets/animations.json"
}
```

---

## 3.3 animations.json Format (CRITICAL - COMMON BUG SOURCE)

**Phaser 3 REQUIRES this exact format - any other format will cause "Missing animation" errors!**

```json
{
  "anims": [
    {
      "key": "thor_idle_anim",
      "type": "frame",
      "frames": [
        { "key": "thor_idle_01", "duration": 400 },
        { "key": "thor_idle_02", "duration": 400 }
      ],
      "repeat": -1
    }
  ]
}
```

| Field    | Required | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| `anims`  | YES      | Root array containing all animations                |
| `key`    | YES      | Animation key (matches animKeys in code)            |
| `type`   | YES      | Always `"frame"`                                    |
| `frames` | YES      | Array of `{ "key": "texture_key", "duration": ms }` |
| `repeat` | YES      | `-1` = loop forever, `0` = play once                |

**Frame key naming**: `{character}_{action}_{frame}` → `thor_idle_01`, `thor_idle_02`
**Animation key naming**: `{character}_{action}_anim` → `thor_idle_anim` (base key used by FSM)

**Pre-flight check**: Before running, verify EVERY frame key in animations.json exists in asset-pack.json!

### 3.4 Common Errors

| Error                                          | Consequence                        | Solution                                                                                |
| ---------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| Missing `"type"` field                         | Asset not loaded                   | Always include type                                                                     |
| `type: "json"` for animations                  | Animations not created             | Use `type: "animation"`                                                                 |
| All frames same URL                            | Animation static                   | Each frame unique file                                                                  |
| Wrong JSON structure                           | Parse error                        | Use `{ section: { files: [...] } }`                                                     |
| Leading slash in URL                           | 404 error                          | Use relative paths                                                                      |
| Animation key mismatch                         | Animation not found                | Configure animKeys in Player.ts                                                         |
| `Tongyi wanx edit API failed: 400 - url error` | I2I mode fails, 0 assets generated | Remove `useI2V: false` from animation assets; use default I2V. Ensure FFmpeg installed. |

---

## 4. Key Consistency Rule

**CRITICAL: These keys must ALL match across files!**

### Platformer (single tileset)

```
generate_game_assets: { type: "tileset", key: "jungle_tiles" }
                                              |
generate_tilemap: { tileset_key: "jungle_tiles" }
                                 |
asset-pack.json: { "key": "jungle_tiles", "url": "assets/jungle_tiles.png" }
                           |
Scene code: this.map.addTilesetImage('jungle_tiles', 'jungle_tiles')
```

### Platformer gameplay images

```
generate_game_assets: { type: "image", key: "bounce_pad" }
                                             |
asset-pack.json: { "type": "image", "key": "bounce_pad", "url": "assets/bounce_pad.png" }
                                             |
Scene code: this.add.image(x, y, 'bounce_pad')

generate_game_assets: { type: "image", key: "proj_tapioca" }
                                             |
asset-pack.json: { "type": "image", "key": "proj_tapioca", "url": "assets/proj_tapioca.png" }
                                             |
Projectile code: this.physics.add.image(x, y, 'proj_tapioca')
```

Projectile art is a general platformer asset. Generate it as `type: "image"`, keep its key identical across generation, `asset-pack.json`, and gameplay code, then scale and orient it in Phaser.

---

## 5. Verification Checklist

### 5.1 Common AI Mistakes (CHECK BEFORE CALLING)

| Mistake                           | Wrong                                                                         | Correct                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Passing `size` for type `"image"` | `{ "type": "image", "key": "icon_x", "description": "...", "size": "32x32" }` | `{ "type": "image", "key": "icon_x", "description": "..." }` — **no size param** |
| Using `x` in dimension strings    | `"18x18"`, `"1536x1024"`                                                      | `"18*18"`, `"1536*1024"` — **use asterisk `*`**                                  |

### 5.2 Before calling `generate_game_assets`

- [ ] `resolution` / `size` use `*` not `x` (e.g. `"1536*1024"`)
- [ ] `background` resolution is one of: `"1024*1024"`, `"1536*1024"`, `"2048*2048"`
- [ ] **`type: "image"` has NO `size` parameter** — remove if present
- [ ] Every `animations[]` item has `name`, `frameCount`, `action_desc`
- [ ] No `useI2V: false` unless FFmpeg unavailable (I2I may cause OSS errors)

### 5.3 Before proceeding to code implementation

- [ ] All asset files exist at specified URLs
- [ ] asset-pack.json keys match generated file names
- [ ] Tileset key matches across all files
- [ ] Animation frame keys use format `{key}_{anim}_{frame}`
- [ ] Tilemap tile layer name is 'Ground', object layer is 'Objects'
- [ ] Each level has one platformer tileset image and one tilemap JSON
- [ ] Player spawn stands above solid ground and every required platform jump is reachable
- [ ] Collectibles, enemies, checkpoints, and goals use object markers rather than solid tile IDs
