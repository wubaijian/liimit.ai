# Contract: 自定义音效描述

## Renderer → Preload → Main

```ts
interface GenerateAudioPreviewInput {
  sound: GameSoundSlot;
  description: string;
}
```

输入规则：

- `sound` 必须是当前六种固定用途之一。
- `description.trim()` 长度必须为 1～300。
- 不允许 C0/C1 控制字符；换行、制表等也不接受，保持一句话输入。
- 不得携带密钥、接口地址、项目路径或任意输出路径。

## Main → Renderer

继续返回现有 `AudioPreviewResult`，不增加 `description` 字段。

## 错误

- 空描述：`请先描述你想要的声音。`
- 超长描述：`音效描述最多 300 个字符，请精简后重试。`
- 控制字符：`音效描述包含无法识别的字符，请重新输入。`

错误不得包含用户原文、API Key、服务返回正文或接口地址。
