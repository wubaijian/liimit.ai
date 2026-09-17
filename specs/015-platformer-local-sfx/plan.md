# Implementation Plan: 横版试玩内置本地音效

## Approach

把已验收 WAV 复制到固定模板的 `public/assets/audio/`。新增纯配置模块，集中定义文件路径、音量和防重复间隔；`VisualLevelScene` 在 preload 阶段统一加载，并通过一个安全播放方法绑定六种现有事件。当前演示项目采用同样的配置和最小补丁，保留其森林美术改造。

## Safety and Compatibility

- 只播放随游戏打包的本地文件，不读取音频 API 配置。
- 缓存不存在或浏览器音频尚未解锁时直接跳过，不阻塞物理、关卡和自动试玩。
- 默认音量小于 0.6；按声音种类设置 60–1200 ms 的最短重复间隔。
- 不覆盖 `星光森林` 的定制美术代码，只插入声音加载与事件调用。

## Validation

- 纯配置单元测试与模板源码契约测试。
- 模板项目 typecheck/test/build。
- 当前 `星光森林` typecheck/test/build。
- 桌面端完整回归及应用内试玩资源检查。
