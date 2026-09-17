# Contract

project:create 校验 creationMode，缺省 template；AI 模式先检查模型配置与执行槽位，再创建并启动后台准备协调。返回项目，不阻塞 UI 等待整轮模型。
agent:start 手动重试保留原有契约，拒绝与准备中的 AI 创建并发。
agent:stop 同时覆盖 AI 创建准备阶段；退出先取消自动启动意图，再关闭准备与 Agent。
原有事件/项目更新通道展示进度，错误使用固定安全文案或现有脱敏通道，不序列化凭据。
创建 UI：AI 模式按钮“创建并生成”，提示消耗已配置 API；模板模式不调用模型。
