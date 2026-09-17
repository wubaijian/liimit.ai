# Implementation Plan

## Summary

共享解析器从持久事件中提取最新待确认助手回复（结构标记优先，旧中文确认结尾兼容）。新增强类型 agent:proposal-decision IPC，主进程加载真实历史验证ID并构建继续指令；取消写生命周期事件。前端独立卡片展示正文并调接口。

## Technical Context

TypeScript/Electron/React/Vitest。复用 AgentEventStore，无新持久化schema；事件标记存于已有生命周期文本。按项目加决策互斥锁，API 不接受任意方案正文。

## Constitution Check

设计前后符合：可信IPC、限制输入、用户点击授权、数据本地持久、取消不调API、无新凭据。

## Structure

shared/modificationProposal.ts; main/proposalDecision.ts; main/main.ts; preload.cts; shared/types.ts; renderer/components/ModificationProposalCard.tsx; App.tsx; styles.css; custom.md。

## Validation

解析及服务单测、卡片渲染、桌面全量/类型/构建、macOS打包验收、实际界面卡片检查（不点击付费确认）。
