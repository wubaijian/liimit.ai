# Implementation Plan: 将生成音效应用到当前游戏

## Approach

把现有固定测试音改为“六种固定用途的安全测试音”：Renderer 只传用途枚举，Main 将用途映射为固定提示词后调用 ElevenLabs。试听字节仍只临时保存在界面内。

新增独立的项目音效覆盖服务。用户确认后，服务在真实项目根目录下写入固定名称 MP3，并更新 `src/audioOverrides.json`，随后调用现有固定项目构建能力。写文件和配置更新前保留内存副本；构建失败时恢复旧文件或清理本次新文件。

模板 `localSfx.ts` 读取受校验的覆盖 JSON：某一项存在合法固定路径时使用 MP3，否则继续使用已验收 WAV。当前 `星光森林` 同步这两个小文件，不修改森林场景代码。

## Constitution Check - Before Design

- Renderer 不接触文件路径、Node 或密钥；只传项目 ID、用途枚举和临时音频字节。
- Main 从本机安全设置读取密钥，从项目记录解析真实根目录。
- 文件写入有固定目录、大小限制、类型检查、路径包含校验和用户确认。
- 失败可回滚，不会因为一次音效替换破坏可玩的旧版本。

## Contracts

- `generateAudioPreview(sound)`：输入固定用途，返回用途、模型、MP3 字节和耗时。
- `applyAudioPreview({ projectId, sound, bytes })`：主进程验证并弹出确认；返回 `applied` 或 `cancelled` 与项目内相对路径。
- `audioOverrides.json`：仅允许六个键，值只能是对应的 `assets/audio/custom/<sound>.mp3` 或空值。

## Constitution Check - After Design

- 新 IPC 包含运行时校验和契约测试；不接受 Renderer 提供的绝对路径或提示词。
- 项目文件仍保存在用户选择的目录并可独立构建。
- 旧项目没有覆盖 JSON 时安全回退，模板新项目显式携带空配置。
- 应用动作在用户确认后执行，构建失败恢复原状。

## Validation

- 六用途提示词与现有网络安全测试。
- 项目音效服务的成功、取消由 Main 契约覆盖，服务测试覆盖路径/字节/回滚。
- 覆盖配置纯逻辑和模板契约测试。
- 固定模板 smoke、当前 `星光森林` typecheck/test/build。
- 桌面端完整 typecheck/test/build。
- 应用内验证选择、试听和应用界面；不实际消耗额度，应用流程用测试字节验证。
