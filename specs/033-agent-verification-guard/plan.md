# Implementation Plan: Agent Verification Guard

Date: 2026-09-17; Spec: spec.md

## Summary

桌面端注入统一验证指引，复用受控预览服务校验 JSON，加入每轮失败/验证预算保护。

## Technical Context

Electron、严格 TypeScript、Node 20+、Vitest；无新依赖。仅内存运行计数，沿用项目状态与历史，macOS 为交付基线。单 Agent 槽位。15 秒监控周期允许预算到达后最多约15秒触发。

## Constitution Check

设计前后均通过7项原则：品牌不变，主进程处理，权限不放宽，停止保留文件/会话，不记录秘密，不改旧数据契约，假进程/临时项目测试及本地打包。未承诺系统沙箱或通关。

## Project Structure

- packages/desktop/src/main/agentVerificationGuard.ts：错误分类、结果去重、三次阈值、五分钟预算、中文提示与工作流规则。
- agentRunner.ts：每轮实例、命令输入关联、结果处理和监控终止、最终状态；启动/恢复均注入规则。
- projectManager.ts：系统规则末尾追加；verifyPlayableBuild 复用真实服务核验关卡与游戏信息响应。
- packages/desktop/test/agentVerificationGuard.test.ts、agentRunner.test.ts、projectManager.test.ts：逻辑、假进程、临时预览与提示词契约。

## Validation

聚焦及全量桌面测试、两个 TS 配置、build、package:mac（runtime smoke 与 DMG 验证）。不重跑用户生成任务；有正在运行任务则不强制更新。
