# Research

Decision: 复用运行引擎而不是复用现成游戏内容。中性起点仅3个校准物体，无主题素材；独立视觉配置支持用户主题。不新造不兼容编辑器的引擎。
Decision: 新 starterTemplateId 区分，不根据旧 creationMode 推断迁移。准备过滤 images，优先复制 ai variant，不让模块覆盖。
Decision: classify_game_type 接受 Desktop 受控环境标志，仅验证已有基础文件不再次复制。否则 Agent 仍可把火山素材补回来。
Decision: 首次完成独立校验关卡真实变化，测试文件不算生成内容；仅靠通用源码 hash 会误判。
