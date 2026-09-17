# Research: 音效 API 接通与测试

## Decision 1: 用音效端点做无生成参数检查

**Decision**: ElevenLabs 基础检查改为请求官方 `/v1/sound-generation`，携带保存或当前输入的密钥，但故意发送缺少必填 `text` 的空对象。只有服务返回明确的缺失字段/参数校验错误时，才认定密钥与 Sound Effects 权限可用且没有生成音频。

**Rationale**: 当前 `/v1/user` 检查需要无关的账户读取权限，Sound-Effects-only 密钥会被误判。官方音效接口把 `text` 定义为必填字段，官方错误规范也区分参数校验、认证、授权、余额和限流，因此可以用同一能力端点做无生成检查。

**Alternatives considered**:

- 继续使用 `/v1/user` 并要求用户开放账户读取：违背最小权限，且不能证明 Sound Effects 权限。
- 使用 `/v1/models`：可能再引入模型读取权限，仍未验证音效能力。
- 基础检查直接生成声音：能验证能力，但会在用户只想测速时产生额度消耗。

**Primary sources**:

- <https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert>
- <https://elevenlabs.io/docs/eleven-api/resources/errors>
- <https://elevenlabs.io/docs/overview/administration/workspaces/api-keys>

## Decision 2: 实际试听走独立的 Main 进程服务

**Decision**: 新增一个无 Renderer 输入的 `generateAudioPreview` 白名单调用。Main 从系统安全存储读取已保存的音频设置，固定请求官方 ElevenLabs 域名、固定 0.5 秒无语音提示声和 `eleven_text_to_sound_v2`，限制 30 秒、音频 MIME 和 1 MiB，再把字节返回 Renderer 形成临时 Blob URL。

**Rationale**: 这条链路能真实验证生成权限、余额和音频响应，又不会经过当前有图像依赖的 Agent 素材工具。Renderer 不发送 URL、密钥或提示词，减少密钥外传和滥用面。0.5 秒是官方接口允许的最短时长，可以控制测试额度。

**Alternatives considered**:

- 让 Renderer 直接请求 ElevenLabs：会把保存密钥暴露给浏览器层，违反桌面信任边界。
- 通过 Agent 生成：当前会被图片配置阻断，且用户难以区分 Agent 执行问题和音效 API 问题。
- 自动保存到项目：扩大为项目素材与绑定能力，不符合本次范围。

## Decision 3: 基础检查与实际试听使用不同的额度语义

**Decision**: 基础检查按钮继续标注为不生成、不扣生成额度；试听按钮必须带“会消耗少量额度”，且只能由用户主动点击一次触发，执行期间禁用重复点击。

**Rationale**: 用户需要先获得免费的配置诊断，再自行决定是否付出第三方额度完成端到端验证。两类按钮的结果和用量记录必须可区分。

## Decision 4: 保存后使用 Main 返回的公共设置刷新弹窗

**Decision**: `onSave` 返回保存后的公共设置。弹窗用返回值替换自己的编辑副本，而不是等待关闭重开或依赖父属性异步同步。

**Rationale**: Main 返回值已经清除明文密钥并计算 `apiKeyConfigured`。立即替换既修正“未配置”显示，也缩短明文密钥在 Renderer 状态中的停留时间，同时不覆盖尚未保存的其他编辑。

## Decision 5: 视觉路由和音频路由分开缓存

**Decision**: `ModelRouter` 支持默认视觉模式和显式音频模式；音频模式不解析图片配置。素材调用分别缓存视觉路由和音频路由，`audio` 请求只使用音频路由，其他素材保持视觉路由。

**Rationale**: 仅给统一工厂增加“图片可选”但继续共用一个实例，会让混合批次受第一个并发任务的顺序影响。两个缓存实例能让每类素材只检查自己需要的配置，同时保持视觉调用的旧行为。

**Alternatives considered**:

- 给音频塞一个假的图片配置：会掩盖真实配置错误并可能把密钥发给错误服务。
- 完全重写音频生成工具：爆炸半径过大，现有专业音频服务已经可以复用。
- 全部配置都改成懒解析：范围扩大到图片、视频和所有调用者，不适合本次修复。
