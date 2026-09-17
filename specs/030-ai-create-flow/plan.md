# Implementation Plan: AI create flow

## Summary

主进程协调新项目创建、模板准备和一次性 Agent 启动；Renderer 不用 effect 自动发请求。

## Technical Context

TypeScript、Electron、React、Vitest；本地 StateStore；macOS 桌面。单执行槽位，无后台模型队列，不增加依赖。

## Constitution Check

设计前/后均通过：品牌一致；强类型 IPC 校验；模式显式授权；旧数据字段可选且默认不执行；错误脱敏；退出不自动恢复模型请求。使用现有超时、停止和最终文件变化/构建校验。

## Project Structure

packages/desktop/src/shared/types.ts 增加创建方式与首次生成状态。
packages/desktop/src/main/initialGenerationService.ts 协调与互斥；main.ts 绑定；projectManager.ts 保存；store.ts 校验与中断迁移；agentRunner.ts 首次生成上下文与完成状态。
packages/desktop/src/main/starterPreparationService.ts 可取消指定准备任务。
packages/desktop/src/renderer/components/NewProjectDialog.tsx 传递模式和费用提示；App.tsx 状态与重试；ProjectRail.tsx 显示一致。
agent-test/prompts/custom.md 区分首次创建授权和已有项目修改确认。
packages/desktop/test 下契约、协调、运行和持久化回归测试。

## Validation

先失败测试，再实现。桌面 test/typecheck/build，package:mac 运行时与模板 smoke、DMG 检验；原生 UI 检查。没有真实付费 API 测试。旧项目不写入游戏文件。
