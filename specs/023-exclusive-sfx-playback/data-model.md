# Data Model: 候选音效单条试听控制

## Candidate Player Map

- Key: 候选编号 1、2 或 3。
- Value: 当前挂载的音频播放器。
- 候选移除时对应条目立即删除。

## Active Candidate

- 当前正在播放的候选编号或空。
- `play` 时更新；`pause`、`ended`、移除时清空。

## Transitions

```text
IDLE -> PLAYING_1
PLAYING_1 --播放候选2--> PLAYING_2（候选1暂停并归零）
PLAYING_2 --暂停--> PAUSED_2
PAUSED_2 --继续--> PLAYING_2（保留位置）
任意候选 --从头播放N--> PLAYING_N（其他归零，N 从0开始）
任意状态 --候选移除--> IDLE
```
