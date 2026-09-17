# Data Model: 三候选音效试听与选择

## Candidate Number

- 允许值：`1 | 2 | 3`。
- 由可信批次服务在启动请求前分配。
- 部分失败时编号不重新排列。

## Audio Preview Candidate

- `candidateNumber`: 候选编号。
- `sound`: 固定声音用途。
- `durationSeconds`: 已校验时长。
- `model`: 固定音效模型标识。
- `mimeType`: 固定为可接受的音频类型。
- `bytes`: 受大小限制的临时音频字节。
- `latencyMs`: 本候选生成耗时。
- 不包含描述、密钥、接口地址或项目字段。

## Audio Preview Batch Result

- `candidates`: 0～3 条成功候选，按 `candidateNumber` 升序。
- `failedCount`: 0～3，满足 `candidates.length + failedCount = 3`。
- `attemptedCount`: 固定为 3。
- `latencyMs`: 整个并行批次的墙钟耗时。
- 当 `candidates` 为空时服务抛出用户可理解错误，不向 Renderer 返回可应用批次。

## Renderer Candidate

- 包含安全批次候选字段。
- `url`: Renderer 为该候选建立的临时 Blob URL。
- 生命周期只限当前设置窗口和当前输入组合。

## Candidate Selection

- `selectedCandidateNumber`: 未选择时为空；选择后只能是当前成功候选之一。
- 新批次开始或当前批次失效时清空。
- 应用时通过编号找到当前候选，传递其用途和字节。

## State Transitions

```text
EMPTY
  -> GENERATING
  -> READY_UNSELECTED (至少一条成功)
  -> READY_SELECTED (用户单选)
  -> APPLYING -> EMPTY（应用成功）

GENERATING -> PARTIAL_UNSELECTED（1～2 条失败）
GENERATING -> ERROR（三条全部失败）

任意非 APPLYING 状态 --输入/服务变化或关闭--> EMPTY
```
