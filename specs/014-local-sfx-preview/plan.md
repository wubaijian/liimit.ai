# Implementation Plan: 本地游戏音效试听包

## Approach

新增一个可重复执行的 Node.js 本地合成脚本。脚本使用振荡器、频率滑动、包络、确定性噪声和轻量回声生成六个短音效，写入独立的 `preview-assets/local-sfx/` 目录。试听目录不属于任何游戏项目，后续只有在用户确认风格后才会选择性接入。

## Safety Boundary

- 不使用 `fetch`、HTTP 客户端、环境密钥或桌面安全存储。
- 输出位置固定在仓库试听目录，不接触 `~/Documents/liimit.ai Games`。
- 只生成 WAV、清单和本地 HTML，不修改 Phaser 关卡与项目配置。

## Validation

- 重新运行脚本时结果哈希保持一致。
- 解析每个 WAV 的 RIFF/WAVE/fmt/data 信息与时长。
- 检查全部样本绝对峰值、文件非空和六个哈希唯一。
- 打开本地试听页检查六个播放器和中文说明。
