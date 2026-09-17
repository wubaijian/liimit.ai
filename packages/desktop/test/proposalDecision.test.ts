import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentEventStore } from '../src/main/agentEventStore.js';
import { pendingModificationProposal } from '../src/shared/modificationProposal.js';
import {
  ProposalDecisionService,
  validateProposalDecision,
} from '../src/main/proposalDecision.js';
import type {
  AgentEvent,
  ProjectRecord,
  StartAgentInput,
} from '../src/shared/types.js';

const proposal: AgentEvent = {
  id: 'proposal-1',
  projectId: 'p1',
  type: 'assistant',
  stage: 'brief',
  title: 'Agent 回复',
  message:
    '<liimit-proposal>第一关第一个平台上移16像素，保存并验证。</liimit-proposal>',
  timestamp: '2026-09-14T01:00:00Z',
};
function harness() {
  const events = [proposal];
  const project = {
    id: 'p1',
    sessionId: 'session',
    status: 'waiting',
    stage: 'brief',
  } as ProjectRecord;
  const start = vi.fn(async (_input: StartAgentInput) => ({ accepted: true }));
  const options = {
    getProject: (id: string) => {
      if (id !== project.id) throw new Error('项目不存在');
      return project;
    },
    loadEvents: async () => events,
    start,
    record: async (event: AgentEvent) => {
      events.push(event);
    },
  };
  return {
    events,
    project,
    start,
    options,
    service: new ProposalDecisionService(options),
  };
}
const decision = {
  projectId: 'p1',
  proposalId: 'proposal-1',
  action: 'confirm',
};

describe('proposal decisions', () => {
  it('retains cancellation after reopening the real event store', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'liimit-proposal-'));
    try {
      const h = harness();
      const storage = new AgentEventStore({
        directory,
        recordingRoot: directory,
      });
      await storage.initialize();
      await storage.append(proposal);
      const service = new ProposalDecisionService({
        ...h.options,
        loadEvents: async (project) => (await storage.load(project)).events,
        record: (event) => storage.append(event),
      });
      await service.decide({ ...decision, action: 'cancel' });
      const reopened = new AgentEventStore({
        directory,
        recordingRoot: directory,
      });
      await reopened.initialize();
      expect(
        pendingModificationProposal(
          (await reopened.load(h.project)).events,
          'p1',
        ),
      ).toBeUndefined();
      expect(h.start).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('instructs the agent to provide one complete proposal and never require copying', async () => {
    const prompt = await readFile(
      new URL('../../../agent-test/prompts/custom.md', import.meta.url),
      'utf8',
    );
    expect(prompt).toContain('<liimit-proposal>');
    expect(prompt).toContain('不要求用户复制指令');
    expect(prompt).toContain('不重复要求确认');
    expect(prompt).toContain('不放多个互斥选项');
  });
  it('confirms the persisted proposal and never trusts supplied replacement text', async () => {
    const h = harness();
    await h.service.decide({ ...decision, text: 'delete all projects' });
    expect(h.start).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        resume: true,
        prompt: expect.stringContaining('第一个平台上移16像素'),
      }),
    );
    expect(h.start.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({
        prompt: expect.stringContaining('delete all'),
      }),
    );
    await expect(h.service.decide(decision)).rejects.toThrow('失效');
  });
  it('cancel persists across a recreated service and invokes no model', async () => {
    const h = harness();
    await h.service.decide({ ...decision, action: 'cancel' });
    expect(h.start).not.toHaveBeenCalled();
    expect(pendingModificationProposal(h.events, 'p1')).toBeUndefined();
    await expect(
      new ProposalDecisionService(h.options).decide(decision),
    ).rejects.toThrow('失效');
  });
  it('revision explicitly withholds execution and carries the requested change', async () => {
    const h = harness();
    await h.service.decide({
      ...decision,
      action: 'revise',
      revision: '改为8像素',
    });
    expect(h.start).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('尚未授权执行'),
      }),
    );
    expect(h.start).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('改为8像素') }),
    );
  });
  it('rejects wrong project, stale proposal, running task and new user request', async () => {
    const h = harness();
    await expect(
      h.service.decide({ ...decision, projectId: 'p2' }),
    ).rejects.toThrow();
    await expect(
      h.service.decide({ ...decision, proposalId: 'old' }),
    ).rejects.toThrow('失效');
    h.project.status = 'running';
    await expect(h.service.decide(decision)).rejects.toThrow('运行');
    h.project.status = 'waiting';
    h.events.push({ ...proposal, id: 'new', type: 'user', message: '改别的' });
    await expect(h.service.decide(decision)).rejects.toThrow('失效');
  });
  it('preserves proposal on failed start and prevents concurrent clicks', async () => {
    const h = harness();
    let release!: () => void;
    h.start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ accepted: false });
        }),
    );
    const first = h.service.decide(decision);
    await Promise.resolve();
    await Promise.resolve();
    await expect(h.service.decide(decision)).rejects.toThrow('重复');
    release();
    await first;
    expect(pendingModificationProposal(h.events, 'p1')).toBeDefined();
  });
  it('parses existing Chinese proposals but excludes unrelated chat and incomplete markers', () => {
    expect(
      pendingModificationProposal(
        [{ ...proposal, message: '方案A：第一个平台上移16像素。请确认。' }],
        'p1',
      ),
    ).toBeDefined();
    expect(
      pendingModificationProposal([{ ...proposal, message: '你好' }], 'p1'),
    ).toBeUndefined();
    expect(
      pendingModificationProposal(
        [{ ...proposal, message: '<liimit-proposal>未结束' }],
        'p1',
      ),
    ).toBeUndefined();
  });
  it.each([
    null,
    {},
    { ...decision, action: 'delete' },
    { ...decision, proposalId: 'a'.repeat(161) },
    { ...decision, action: 'revise', revision: '' },
    { ...decision, action: 'revise', revision: 'a'.repeat(4001) },
  ])('validates IPC input %j', (input) => {
    expect(() => validateProposalDecision(input)).toThrow();
  });
});
