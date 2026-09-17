# Data Model: 自定义音效描述

## AudioDescriptionDraft

只存在于当前设置窗口的临时输入。

| 字段          | 类型            | 规则                                                |
| ------------- | --------------- | --------------------------------------------------- |
| `sound`       | `GameSoundSlot` | 六种固定用途之一                                    |
| `description` | string          | 去除首尾空格后 1～300 个字符；不允许 C0/C1 控制字符 |

生命周期：空白 → 用户输入 → 本地有效/无效 → 发起一次生成 → 成功或失败。失败后原输入保留；关闭设置窗口后丢弃。

## GenerateAudioPreviewInput

从 Renderer 经 Preload 交给 Main 的输入。

| 字段          | 类型            | 规则                                |
| ------------- | --------------- | ----------------------------------- |
| `sound`       | `GameSoundSlot` | Main 再次检查枚举                   |
| `description` | string          | Main 规范化并再次检查长度和控制字符 |

该对象不得包含 API Key、Base URL、项目 ID、文件路径或音频字节。

## AudioPreviewResult

保持现有返回结构不变。结果不回显用户描述，避免它进入后续项目应用输入或用量界面。

## 持久化影响

无。项目 `audioOverrides.json`、自定义 MP3、设置存储和 API 用量记录的数据结构均不改变。
