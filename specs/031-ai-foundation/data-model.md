# Data model

StarterTemplateId 增加 ai-foundation，只在新创建 creationMode=ai 选用；旧记录保持原值。
visualStyle.json：mode builtin/custom；backgroundColor、八个配色字段；images.background/player/slime/bee 可为空或同项目相对素材路径。
初始化 campaign 一关“待 AI 创建”，3个引擎校准物体，非完成游戏；首次生成必须替换关卡标记并改变实际几何或能力。
