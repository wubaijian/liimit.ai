# Contracts

每轮启动消息和 .qwen/system.md 附加工作流规则，保留原要求与修改确认规则。
正式入口 GET /**liimit/levels.json 和 /**liimit/game-info.json 要求成功 HTTP、application/json、受限体积、可解析且基本结构有效。失败归入未通过门槛，不标完成。
结果按工具 ID 去重，仅已知 shell 调用可做输出失败检测；非 shell 读取异常文本不误判。停止不输出原始工具秘密，不重新调用模型。
