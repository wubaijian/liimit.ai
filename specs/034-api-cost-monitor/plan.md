# Implementation Plan: API 费用监测

**Branch**: `034-api-cost-monitor` | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

## Summary

桌面主进程建立每任务本机请求监测器，凭据通过既有 FD 通道传入带随机令牌的本机固定路由。请求发出前写本地台账，响应 usage 估算费用；预算串行放行且失败关闭。不会修改 core 协议或用户游戏。

## Technical Context

Node20+、TypeScript、Electron、React、Vitest；不新增依赖。新 cost-monitor/v1 文件与旧 api-usage/v1 并存，不回填历史。人民币单一币种；文本输入/输出/缓存每百万单价，素材单次参考价；费率按真实配置指纹匹配。最多一个计费请求在途，队列在关闭后拒绝。响应流只解析有界 usage，不存提示词/密钥/URL；请求超32MiB拒绝，JSON/SSE解析缓存限1MiB。账本保存失败不得继续请求。

## Constitution Check

调研前：I-VII通过。不得宣称实际账单、严格不超支、自动纠错或插件费用全覆盖。
设计后：I-VII通过。IPC可信调用方沿用 secureHandle；新增输入校验；历史状态不改；密钥只经FD；localhost代理只固定配置上游、拒绝重定向和路径越界。停止及重启不续跑。测试仅localhost，打包无收费调用。无宪章例外。

## Project Structure

- shared/apiCost.ts：契约
- main/apiCostStore.ts：持久化、校验、价格与汇总
- main/apiCostGateway.ts：请求转发、SSE用量、预算/次数/失败保护
- main/agentRunner.ts、main.ts、preload.cts：运行与可信IPC、音效试听集成
- renderer/components/ApiCostPanel.tsx、App.tsx、styles.css：紧凑费用条与设置
- test/apiCost\*.test.ts(x)：假服务、持久化、桥接与界面验证

## Design

费用未知是null而非0。新任务记录冻结配置，文本缺缓存细分按普通输入价保守估算并标估算；模型覆写不套原价。崩溃pending转interrupted，任务转stopped。新任务预算不累加旧任务但项目总额累加所有记录。默认预算null不代表免费，界面提示未启用；次数保护始终启用。素材重复请求由主进程默认取消确认。中断后已知用量仍保留，缺用量显示未知。配置变更仅下次任务生效；重试通过用户明确的新启动。

## Verification

先编写账本/网关测试再实现。桌面全量test、两份tsconfig、build；流式、取消、重启、无价格、次数、并发、HTTP失败、密钥泄漏、IPC非法值、旧数据与界面静态测试。最后打包mac与内置烟测，无真实付费网络请求。安装前确认无活动任务，旧app移入废纸篓备份。不做签名公证/干净机认证。

## Complexity Tracking

无需例外。费用代理必要性：只等Runtime最终汇总会漏记中途暂停，无法在下一次网络请求前强制停止。
