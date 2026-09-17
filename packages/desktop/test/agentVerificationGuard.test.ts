import { describe, expect, it } from 'vitest';
import {
  AgentVerificationGuard,
  verificationWorkflowInstructions,
} from '../src/main/agentVerificationGuard.js';

describe('verification loop protection', () => {
  it('counts repeated workspace errors across successful reads and deduplicates IDs', () => {
    const guard = new AgentVerificationGuard();
    const fail = (id: string) =>
      guard.observe(
        {
          id,
          tool: 'write_file',
          text: 'File path must be within one of the workspace directories: /private',
          isError: true,
        },
        0,
      );
    expect(fail('1').stop).toBe(false);
    expect(fail('1').stop).toBe(false);
    guard.observe({ id: 'read', tool: 'read_file', text: 'ok' }, 1);
    expect(fail('2').stop).toBe(false);
    expect(fail('3')).toMatchObject({
      stop: true,
      category: 'workspace',
      count: 3,
    });
  });
  it('detects command exceptions even when runtime says success, not source reads', () => {
    const guard = new AgentVerificationGuard();
    const text =
      "TypeError: Cannot read properties of undefined (reading 'length')\n    at file:///tmp/check.mjs:2:1";
    expect(guard.observe({ tool: 'read_file', text }, 0).failed).toBe(false);
    expect(
      guard.observe(
        {
          tool: 'run_shell_command',
          input: { command: 'node check.mjs' },
          text,
        },
        0,
      ),
    ).toMatchObject({ failed: true, category: 'command' });
    expect(
      guard.observe(
        {
          tool: 'run_shell_command',
          input: { command: 'grep Error file.ts' },
          text,
        },
        0,
      ).failed,
    ).toBe(false);
  });
  it('does not mistake successful output or quoted error strings for a failure', () => {
    const guard = new AgentVerificationGuard();
    for (const text of [
      'Error: (none)\nExit Code: 0',
      'No matches found',
      "const x = 'TypeError: bad'",
      'Tests 14 passed (14)',
    ])
      expect(
        guard.observe(
          { tool: 'run_shell_command', input: { command: 'npm test' }, text },
          0,
        ).failed,
      ).toBe(false);
  });
  it('bounds post-build verification despite repeated successful output', () => {
    const guard = new AgentVerificationGuard();
    guard.observe(
      {
        tool: 'run_shell_command',
        input: { command: 'npm run build' },
        text: '✓ built in 3.09s',
      },
      100,
    );
    guard.observe({ tool: 'read_file', text: 'ok' }, 299_000);
    expect(guard.inspect(300_099, false)).toBeUndefined();
    expect(guard.inspect(300_100, true)).toBeUndefined();
    expect(guard.inspect(300_100, false)).toContain('5 分钟');
    guard.observe(
      {
        tool: 'run_shell_command',
        input: { command: 'npm run build' },
        text: '✓ built in 1s',
      },
      301_000,
    );
    expect(guard.inspect(301_000, false)).toBeDefined();
    expect(
      new AgentVerificationGuard().inspect(900_000, false),
    ).toBeUndefined();
  });
  it('provides a safe common workflow without granting modification permission', () => {
    const text = verificationWorkflowInstructions('/projects/game');
    expect(text).toContain('/projects/game/.liimit-checks');
    expect(text).toContain('不要运行 npm run dev');
    expect(text).toContain('不得改用 shell');
    expect(text).toContain('不代表已经实际玩通');
    expect(text).toContain('不改变用户确认');
  });
});
