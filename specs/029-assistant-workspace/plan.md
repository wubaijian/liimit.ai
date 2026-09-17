# Implementation Plan

## Summary

App.tsx压缩进度，助手改为常驻section；EventStream.tsx容纳确认卡、折叠简介及底部跟随；styles.css定义固定高度flex布局。

## Technical Context

Electron/React/TypeScript/CSS/Vitest，无新依赖、IPC、数据迁移。

## Constitution Check

设计前及设计后均通过：仅Renderer布局，保留信任边界和用户控制。类型、测试、构建、安装包验证均执行，不消耗API。

## Structure

packages/desktop/src/renderer/App.tsx、components/EventStream.tsx、styles.css；packages/desktop/test/layout-contract.test.ts及assistantWorkspace.test.tsx。

## Decisions

对话上、输入下；方案在对话底部，避免挤没日志。1100px及以上双栏，右侧clamp(400px,36vw,560px)。窄窗口助手固定可用高度。近底部自动跟随，新项目定位最新。
