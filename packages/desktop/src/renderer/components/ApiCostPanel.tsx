import { useEffect, useState } from 'react';
import type {
  CostSettings,
  CostSnapshot,
  CostTotal,
} from '../../shared/apiCost';

const labels = {
  main: '主模型',
  reasoning: '推理',
  image: '图片',
  audio: '音效',
  video: '视频',
};
export function costLabel(total: CostTotal): string {
  if (!total.calls) return '暂无调用';
  const known =
    total.knownCny > 0
      ? `约 ¥${total.knownCny.toFixed(4)}`
      : total.unknown || total.pending
        ? ''
        : '约 ¥0.0000';
  return [
    known,
    total.unknown ? `${total.unknown} 笔费用未知` : '',
    total.pending ? `${total.pending} 笔待结算` : '',
  ]
    .filter(Boolean)
    .join(' ＋ ');
}
export function ApiCostPanel({ projectId }: { projectId: string | null }) {
  const [snapshot, setSnapshot] = useState<CostSnapshot | null>(null);
  const [draft, setDraft] = useState<CostSettings | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
      let polling = false;
    const refresh = async () => {
      if (polling || !window.gameAgent.loadApiCosts) return;
      polling = true;
      try {
        const data = await window.gameAgent.loadApiCosts(projectId);
        if (!disposed) {
          setSnapshot(data);
          setLoadError('');
        }
      } catch {
        if (!disposed)
          setLoadError('费用记录暂时无法读取，请先停止任务并检查。');
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [projectId]);
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await window.gameAgent.saveApiCostSettings(draft);
      setSnapshot(await window.gameAgent.loadApiCosts(projectId));
      setDraft(null);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '费用设置保存失败。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="api-cost-panel" aria-label="API 费用监测">
      <div className="api-cost-strip">
        <span>
          <strong>{projectId === null ? '音效试听' : '本次任务'}</strong>{' '}
          {snapshot?.task ? costLabel(snapshot.task.total) : '暂无调用记录'}
        </span>
        <button
          type="button"
          disabled={!snapshot}
          onClick={() => {
            if (snapshot) setDraft(structuredClone(snapshot.settings));
          }}
        >
          费用与预算
        </button>
      </div>
      <small>
        {snapshot?.task?.status === 'running'
          ? snapshot.task.budget === null
            ? '本次金额预算未启用'
            : `本次预算 ¥${snapshot.task.budget}`
          : snapshot?.settings.budget == null
            ? '金额预算未启用'
            : `下次预算 ¥${snapshot.settings.budget}`}{' '}
        · {snapshot?.task?.total.calls ?? 0} 次调用 ·{' '}
        {snapshot?.task?.total.failures ?? 0} 次失败
      </small>
      {snapshot?.task?.status === 'running' &&
        snapshot.task.budget !== null &&
        snapshot.task.total.knownCny + 1e-9 >= snapshot.task.budget * 0.8 && (
          <small className="api-cost-notice">
            已用到预算的80%以上；达到预算后暂停后续请求。
          </small>
        )}
      {snapshot?.task?.reason && (
        <small className="api-cost-notice">{snapshot.task.reason}</small>
      )}
      {(error || loadError) && (
        <p role="alert" className="api-cost-notice">
          {error || loadError}
        </p>
      )}
      {draft && snapshot && (
        <div
          className="api-cost-backdrop"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape' && !busy) setDraft(null);
            if (e.key === 'Tab') {
              const fields = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input:not(:disabled)',
                ),
              );
              const first = fields[0];
                const last = fields.at(-1);
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <section
            className="api-cost-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="费用与预算设置"
          >
            <header>
              <h2>费用与预算</h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                关闭
              </button>
            </header>
            <p>
              {projectId === null ? '音效试听累计' : '此项目累计'}：
              {costLabel(snapshot.project)}
            </p>
            <p className="api-cost-notice">
              这是本机估算，不是服务商账单。旧版本费用未补记；插件、外部脚本与连接测试不计入此预算。已发出的单笔请求可能超出预算。
            </p>
            <div className="api-cost-fields">
              <label>
                每次任务预算（人民币，留空仅监测）
                <input
                  autoFocus
                  type="number"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  value={draft.budget ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      budget:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                每次任务最多调用次数
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={draft.maxRequests}
                  onChange={(e) =>
                    setDraft({ ...draft, maxRequests: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <p>
              预算到80%提醒，到100%暂停下一次调用；缺价格或用量时也暂停。连续3次接口失败自动停止。设置只对下次任务生效，保存不会自动重试。
            </p>
            <h3>模型价格（请按实际服务商价格填写）</h3>
            <p>
              全部金额使用人民币。文本按每百万
              Token；素材按每次请求的参考总价（含张数、尺寸或时长），不是固定官方报价。未填写显示未知。
            </p>
            {draft.profiles.map((p, index) => (
              <fieldset key={p.id}>
                <legend>
                  {labels[p.slot]} · {p.model || '模型未填写'}
                </legend>
                <div className="api-cost-fields">
                  {(p.slot === 'main' || p.slot === 'reasoning'
                    ? ['input', 'output', 'cache']
                    : ['request']
                  ).map((key) => {
                    const field = key as keyof typeof p.price;
                    const name = {
                      input: '输入 / 百万 Token',
                      output: '输出 / 百万 Token',
                      cache: '缓存命中 / 百万 Token',
                      request: '每次请求参考金额',
                    }[field];
                    return (
                      <label key={key}>
                        {name}
                        <input
                          type="number"
                          min="0"
                          max="1000000"
                          step="any"
                          placeholder="未知"
                          value={p.price[field] ?? ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              profiles: draft.profiles.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      price: {
                                        ...row.price,
                                        [field]:
                                          e.target.value === ''
                                            ? null
                                            : Number(e.target.value),
                                      },
                                    }
                                  : row,
                              ),
                            })
                          }
                        />
                      </label>
                    );
                  })}
                </div>
                {(p.slot === 'main' || p.slot === 'reasoning') && (
                  <small>
                    缓存价留空时按普通输入价估算；服务商未返回用量则费用未知。
                  </small>
                )}
              </fieldset>
            ))}
            <h3>费用分类与最近调用</h3>
            <ul>
              {Object.entries(snapshot.categories)
                .filter(([, v]) => v.calls > 0)
                .map(([key, v]) => (
                  <li key={key}>
                    {labels[key as keyof typeof labels]}：{costLabel(v)}
                  </li>
                ))}
            </ul>
            {snapshot.recent.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>类别 / 模型</th>
                    <th>状态</th>
                    <th>估算</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.recent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {labels[r.slot]} / {r.model}
                      </td>
                      <td>
                        {
                          {
                            pending: '待结算',
                            success: '请求成功',
                            error: '请求失败',
                            interrupted: '已中断',
                          }[r.status]
                        }
                      </td>
                      <td>
                        {r.estimatedCny === null
                          ? '费用未知'
                          : `¥${r.estimatedCny.toFixed(4)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {error && <p role="alert">{error}</p>}
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                取消
              </button>
              <button type="button" disabled={busy} onClick={() => void save()}>
                {busy ? '保存中…' : '保存，下次任务生效'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
