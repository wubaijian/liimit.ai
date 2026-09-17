# 原创美术方向 V1

## 预览资产

`docs/product/assets/fire-mountain-art-direction-v1.png`

## 检查结果

- 16:9 横向、严格侧视角，关卡路径清楚。
- 白色小熊、蓝黑岩石、六边形火焰晶币、金色检查点和冰蓝出口都能独立识别。
- 平台轮廓适合后续拆为普通平台和移动平台素材。
- 不含原项目的米黄色土块、白旗、原角色或原关卡构图。
- 无文字、无标志、无水印。
- 该图仅用于美术方向确认，不直接作为游戏平台或碰撞素材。

## 生成方式

使用 Codex 内置图像生成能力，未调用用户在 Limit AI 中配置的图像 API。

## 最终提示词

```text
Use case: stylized-concept
Asset type: original 2D side-scrolling platform game art-direction concept for a browser game
Primary request: Create a polished gameplay-style concept frame for an original game called Fire Mountain Escape, showing a small goofy white polar-bear explorer jumping through a volcanic cavern.
Scene/backdrop: wide side-view volcanic cave with layered dark-purple rock silhouettes, subtle heat haze, glowing coral-red and golden lava below, and a clearly readable left-to-right path.
Subject: a small full-body white polar bear wearing a simple charcoal stone-shell helmet, mid-jump between chunky blue-black basalt platforms edged with soft golden mineral crystals; include one moving platform, a few floating hexagonal flame-crystal coins, one small golden checkpoint beacon, and a luminous icy-blue cave exit in the distance.
Style/medium: original clean 2D cartoon game illustration, soft paper-cut depth, rounded chunky silhouettes, production-friendly shapes, charming and slightly silly, suitable for a Phaser platformer.
Composition/framing: 16:9 landscape gameplay frame, strict side-on camera, clear platform spacing and collision silhouettes, player readable at small size, foreground lava along the bottom, exit visible toward the right.
Lighting/mood: warm lava underlight contrasted with cool blue exit light; adventurous, playful, not frightening.
Color palette: deep indigo, blue-black basalt, coral red, amber gold, icy cyan, white hero.
Constraints: original design only; no text, no logo, no watermark, no interface, no copied characters, no resemblance to the paid Volcano Level Set artwork; do not use beige soil platforms, white flags, caveman characters, or the original project's composition. Keep every major gameplay object visually distinct and easy to later separate into sprites.
```

## 正式背景 V1

- 游戏内路径：`agent-test/templates/core/public/assets/images/fire-mountain/volcano-cavern-bg.png`
- 预览归档：`docs/product/assets/fire-mountain/volcano-cavern-bg-v1.png`
- 生成方式：Codex 内置图像生成；未调用用户配置的 API。
- 生成提示词：

```text
Create a production-ready 2D side-scrolling platform game background for a browser game called “Fire Mountain Escape”. Original art only. Cartoon adventure style, slightly goofy and friendly rather than scary. Wide volcanic cavern at dusk: layered dark navy and charcoal basalt cave walls, distant volcano silhouettes, glowing orange-red lava rivers far in the background, warm golden mineral seams, a few soft smoke clouds, subtle icy-blue light toward a distant cave exit. Strong atmospheric depth with three parallax-like layers, clean shapes, polished mobile/indie game illustration. IMPORTANT: background scenery only—no player, no enemies, no coins, no platforms, no spikes, no UI, no text, no logo. Keep the lower gameplay area relatively uncluttered and dark so foreground objects remain readable. Seamless-feeling composition suitable for covering a 16:9 game viewport, 1792x1024 landscape.
```

## 正式角色 V1

- 游戏内目录：`agent-test/templates/core/public/assets/images/fire-mountain/characters/`
- 预览归档：`docs/product/assets/fire-mountain/characters/`
- 角色：白色北极熊、岩浆史莱姆、火山蜜蜂。
- 生成方式：Codex 内置图像生成；使用方向图作为风格参考，未调用用户配置的 API。
- 共同要求：原创卡通造型、严格侧视角、单角色、透明背景、无文字和水印。
