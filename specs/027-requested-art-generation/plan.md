# Implementation Plan: 用户请求美术生成

## Summary

更新 custom.md 固定素材限制；比较 Agent 启动前后 src/public 和入口配置内容摘要，无变化进入 waiting，无法核验不报完成。保留构建、取消和失败流程。

## Technical Context

TypeScript/Electron/Node/Vitest；流式 SHA256，不跟随符号链接，不读取凭据、依赖和构建产物。摘要只在内存保存。

## Constitution Check

设计前后均符合 I–VII；无新 IPC、凭据、持久化字段，不消费 API。文件变化不等于语义需求已满足。

## Project Structure

agent-test/prompts/custom.md；packages/desktop/src/main/projectContentSnapshot.ts；agentRunner.ts；对应测试。

## Validation

摘要测试、Agent 无修改/完成/取消测试、全量桌面测试及类型检查、打包与 DMG 验证、安装重启。外部图片能力另行实测。
