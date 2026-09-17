# IPC contracts

- settings:api-costs(projectId: string|null) → CostSnapshot。可信renderer；字符串≤160且项目存在。null为设置中的音效试听账本。
- settings:save-api-costs(CostSettings) → void。预算null或0.01～10000元；maxRequests整数1～100；最多10个有效当前模型价格；费率null或0～1000000，拒绝NaN/Infinity/负数/旧模型指纹/重复配置。
- 仅main持有台账与网络能力，preload暴露强类型接口；轮询2秒只读不调用模型。
- 主进程本机网关：127.0.0.1动态端口，192位随机令牌固定上游映射。拒绝跨域Origin、路由猜测、目录穿越、超32MiB正文、重定向；请求正文不持久化。
- 重复素材确认由主进程显示默认取消对话框；停止后晚到的确认不产生请求。
