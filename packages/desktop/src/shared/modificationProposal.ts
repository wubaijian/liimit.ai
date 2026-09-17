import type { AgentEvent } from './types.js';

export interface ModificationProposal {
  id: string;
  projectId: string;
  text: string;
}
export interface ProposalDecisionInput {
  projectId: string;
  proposalId: string;
  action: 'confirm' | 'revise' | 'cancel';
  revision?: string;
}
export const PROPOSAL_DECIDED = '修改方案已处理';

export function pendingModificationProposal(
  events: AgentEvent[],
  projectId: string,
): ModificationProposal | undefined {
  const relevant = events.filter((e) => e.projectId === projectId);
  const last = [...relevant]
    .reverse()
    .find((e) => e.type === 'assistant' || e.type === 'user');
  if (!last || last.type !== 'assistant' || last.isError) return;
  const text = last.message.trim();
  const structured = text.match(
    /<liimit-proposal>([\s\S]*?)<\/liimit-proposal>/,
  );
  if (text.includes('<liimit-proposal') && !structured) return;
  const legacy =
    /(?:请确认|等待.{0,8}确认|确认后.{0,8}执行)/.test(text) &&
    /(?:方案|修改前|改后|修改内容)/.test(text);
  if (!structured && !legacy) return;
  if (
    relevant.some(
      (e) =>
        e.type === 'lifecycle' &&
        e.title === PROPOSAL_DECIDED &&
        e.message === last.id,
    )
  )
    return;
  const body = (structured?.[1] ?? text).trim();
  if (!body || body.length > 12000) return;
  return { id: last.id, projectId, text: body };
}
