import { useRef, useState } from 'react';
import type {
  ModificationProposal,
  ProposalDecisionInput,
} from '../../shared/modificationProposal';

export function ModificationProposalCard({
  proposal,
  disabled,
  onDecide,
}: {
  proposal: ModificationProposal;
  disabled: boolean;
  onDecide(input: ProposalDecisionInput): Promise<{ accepted: boolean }>;
}) {
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function decide(action: ProposalDecisionInput['action']) {
    if (lock.current || disabled || done) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await onDecide({
        projectId: proposal.projectId,
        proposalId: proposal.id,
        action,
        revision: action === 'revise' ? revision : undefined,
      });
      if (result.accepted) setDone(true);
      else setError('未提交成功，请重试。');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="modification-proposal-card" role="status">
        方案操作已提交。
      </div>
    );
  return (
    <section className="modification-proposal-card" aria-label="AI修改确认方案">
      <strong>请确认修改方案</strong>
      <p>
        确认后将按下方方案修改当前游戏。若包含多个选项，请先通过“调整方案”明确选择。
      </p>
      <div className="modification-proposal-text">{proposal.text}</div>
      {editing && (
        <label>
          你希望怎样调整？
          <textarea
            aria-label="调整方案要求"
            value={revision}
            maxLength={4000}
            onChange={(e) => setRevision(e.target.value)}
            disabled={busy || disabled}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="modification-proposal-actions">
        {editing ? (
          <button
            disabled={busy || disabled || !revision.trim()}
            onClick={() => void decide('revise')}
          >
            提交调整
          </button>
        ) : (
          <button
            disabled={busy || disabled}
            onClick={() => void decide('confirm')}
          >
            {busy ? '正在提交…' : '确认修改'}
          </button>
        )}
        <button
          disabled={busy || disabled}
          onClick={() => setEditing(!editing)}
        >
          {editing ? '返回方案' : '调整方案'}
        </button>
        <button
          disabled={busy || disabled}
          onClick={() => void decide('cancel')}
        >
          取消
        </button>
      </div>
    </section>
  );
}
