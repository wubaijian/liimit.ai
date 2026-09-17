# Data Model: 音效时长选择

## AudioDurationSeconds

有效值集合：`0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8`。

## RecommendedDurationBySound

| 用途       | 推荐秒数 |
| ---------- | -------: |
| 跳跃       |      0.5 |
| 拾取金币   |      0.5 |
| 角色死亡   |        1 |
| 完成关卡   |        2 |
| 踩中敌人   |      0.5 |
| 激活检查点 |        1 |

## GenerateAudioPreviewInput

在现有 `sound` 和 `description` 基础上新增 `durationSeconds`。不得增加凭据、地址或路径。

## AudioPreviewResult

新增 `durationSeconds`，表示服务实际使用的受校验时长。其他字段不变，不回显描述。

## 持久化影响

无。项目覆盖配置、MP3 应用输入、安全设置和 API 用量结构均不改变。
