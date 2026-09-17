import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  ProjectRecord,
  StartAgentInput,
} from '../shared/types.js';
import {
  pendingModificationProposal,
  PROPOSAL_DECIDED,
  type ProposalDecisionInput,
} from '../shared/modificationProposal.js';

export function validateProposalDecision(
  value: unknown,
): ProposalDecisionInput {
  if (!value || typeof value !== 'object')
    throw new Error('修改方案参数无效。');
  const input = value as Record<string, unknown>;
  for (const key of ['projectId', 'proposalId']) {
    if (
      typeof input[key] !== 'string' ||
      !input[key].trim() ||
      input[key].length > 160
    )
      throw new Error('方案标识无效。');
  }
  if (
    typeof input.action !== 'string' ||
    !['confirm', 'revise', 'cancel'].includes(input.action)
  )
    throw new Error('方案操作无效。');
  if (
    input.action === 'revise' &&
    (typeof input.revision !== 'string' ||
      !input.revision.trim() ||
      input.revision.length > 4000)
  )
    throw new Error('请填写调整要求（最多4000字）。');
  return {
    projectId: input.projectId as string,
    proposalId: input.proposalId as string,
    action: input.action as ProposalDecisionInput['action'],
    revision:
      input.action === 'revise' ? (input.revision as string).trim() : undefined,
  };
}

export class ProposalDecisionService {
  private busy = new Set<string>();
  constructor(
    private options: {
      getProject(id: string): ProjectRecord;
      loadEvents(project: ProjectRecord): Promise<AgentEvent[]>;
      start(input: StartAgentInput): Promise<{ accepted: boolean }>;
      record(event: AgentEvent): Promise<void>;
    },
  ) {}

  async decide(value: unknown): Promise<{ accepted: boolean }> {
    const input = validateProposalDecision(value);
    if (this.busy.has(input.projectId))
      throw new Error('正在处理这份方案，请勿重复点击。');
    this.busy.add(input.projectId);
    try {
      const project = this.options.getProject(input.projectId);
      if (project.status === 'running')
        throw new Error('任务仍在运行，请等待结束。');
      const proposal = pendingModificationProposal(
        await this.options.loadEvents(project),
        project.id,
      );
      if (!proposal || proposal.id !== input.proposalId)
        throw new Error('这份方案已失效，请查看最新方案。');
      if (this.options.getProject(input.projectId).status === 'running')
        throw new Error('任务已启动，请等待结束。');
      if (input.action !== 'cancel') {
        if (!project.sessionId)
          throw new Error('方案会话已不可用，请重新提出修改需求。');
        const prompt =
          input.action === 'confirm'
            ? `用户已在界面点击“确认修改”。以下是用户确认的完整方案（方案ID：${proposal.id}）。严格按此方案执行并保存、验证，不要重复请求同一确认；若包含互斥选项且没有明确推荐方案，先询问具体选择。不得扩大范围。\n\n${proposal.text}`
            : `用户选择“调整方案”，尚未授权执行。原方案如下：\n${proposal.text}\n\n用户的调整要求：${input.revision}\n只给出新的修改方案等待用户点击确认，不执行旧方案。`;
        const result = await this.options.start({
          projectId: project.id,
          prompt,
          resume: true,
        });
        if (!result.accepted) return result;
      }
      await this.options.record({
        id: randomUUID(),
        projectId: project.id,
        type: 'lifecycle',
        stage: project.stage,
        title: PROPOSAL_DECIDED,
        message: proposal.id,
        timestamp: new Date().toISOString(),
      });
      return { accepted: true };
    } finally {
      this.busy.delete(input.projectId);
    }
  }
}
