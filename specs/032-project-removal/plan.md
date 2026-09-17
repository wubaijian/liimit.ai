# Implementation Plan: Project Removal

## Summary

主进程负责确认、安全校验、停止预览、废纸篓及记录移除。Renderer 仅传ID和方式，不传任意路径。

## Technical Context

Electron/TypeScript/React/Vitest，沿用 StateStore 原子写入。系统 shell.trashItem，无新依赖；本地单用户桌面。

## Constitution Check

设计前后通过：可信IPC、输入校验、路径/符号链接检查、确认默认取消、保留旧格式和其他配置、不自动删除或消费API、临时目录测试及打包验证。

## Project Structure

packages/desktop/src/main/projectRemovalService.ts：注入确认/废纸篓/持久化/活动检查，核验元数据与保护路径；store.ts 原子移除；main.ts 移除期间IPC互斥，检查并发调用及后台任务；projectManager.ts 暴露停止单项目预览。
shared/types.ts 和 main/preload.cts 类型化删除接口；renderer/components/ProjectRail.tsx 菜单与 App.tsx 更新列表，styles.css 项目行。
test/projectRemoval.test.ts、store.test.ts、projectRemovalUi.test.tsx 覆盖安全、取消、成功/失败、锁、持久化、界面。

## Validation

聚焦/全量桌面测试、类型检查、构建、package:mac及运行时/模板/DMG检查；原生菜单与取消验证，不确认删除用户项目。
