# Implementation Plan: AI Foundation

## Summary

新增 ai-foundation 起点，仅新 AI 创建选择它。保留共享 Phaser 运行引擎，中性视觉配置和占位工作区替代示例关卡/素材。

## Technical Context

TypeScript / Electron / React / Phaser 3 / Vitest，现有文件系统安全边界；不增加依赖。

## Constitution Check

设计前后通过：品牌及能力真实，IPC 枚举扩展兼容旧值；不迁移已有项目；复制仍走受控路径、符号链接验证；不调用用户模型验证；单任务及失败状态沿用030。

## Project Structure

desktop shared/types.ts、main/projectManager.ts 新框架选择；fixedProjectProvisioner.ts 对 AI 分支过滤示例文件、复制独立 variant；core/tools/game-type-classifier.ts 在受控 AI 模式不补示例。
agent-test/templates/variants/ai-foundation/src：中性关卡、名称、visualStyle.json；共享 VisualLevelScene.ts 支持 custom 颜色/图片和无图片图形占位。
desktop main/agentRunner.ts、foundationValidation.ts：首次生成必须写真实关卡；prompts/custom.md 与专用生成指南让 Agent 先产出关卡再检查，禁止绕去修测试框架。
renderer NewProjectDialog.tsx / App.tsx 更新解释，固定模板不变。

## Validation

桌面全部 test/typecheck/build；core classifier 聚焦测试及类型检查；真实基础框架临时目录构建与关卡解析、二次准备保持；macOS 打包烟测；原生 UI。无真实模型请求。
