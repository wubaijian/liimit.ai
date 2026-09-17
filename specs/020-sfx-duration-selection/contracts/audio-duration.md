# Contract: 音效时长选择

```ts
interface GenerateAudioPreviewInput {
  sound: GameSoundSlot;
  description: string;
  durationSeconds: AudioDurationSeconds;
}

interface AudioPreviewResult {
  // existing fields unchanged
  durationSeconds: AudioDurationSeconds;
}
```

输入必须是有限数字，并且属于 0.5～8 秒的 16 个固定档位。Main 不接受字符串数字、`NaN`、无穷、0、8.5 或 0.7。

错误使用固定文案：`音效时长必须选择 0.5～8 秒的半秒档位。`

返回结果不包含描述、凭据、接口地址或项目字段。
