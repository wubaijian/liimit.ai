import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import { GenerateGDDTool } from './generate-gdd.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GenerateGDDTool platformer-only contract', () => {
  it('exposes only platformer in its schema and description', () => {
    const tool = buildTool();
    const contract = JSON.stringify(tool.schema);

    expect(contract).toContain('platformer');
    expect(contract).not.toMatch(/top_down|grid_logic|tower_defense|ui_heavy/);
  });

  it('rejects a non-platformer archetype even when TypeScript is bypassed', () => {
    const tool = buildTool();

    expect(() =>
      tool.build({
        raw_user_requirement: '制作俯视角游戏',
        archetype: 'top_down',
      } as never),
    ).toThrow(/platformer/);
  });

  it('keeps model-backed GDD generation for platformer', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(
        payload.messages.map((message) => message.content).join('\n'),
      ).toContain('**Archetype**：platformer');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '# 横版平台 GDD' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await buildTool()
      .build({
        raw_user_requirement: '制作森林横版跳跃游戏',
        archetype: 'platformer',
      })
      .execute(new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
    expect(String(result.llmContent)).toContain('# 横版平台 GDD');
    expect(String(result.llmContent)).toContain('游戏类型：**platformer**');
  });
});

function buildTool(): GenerateGDDTool {
  return new GenerateGDDTool(
    {
      getProjectRoot: () => '/tmp/liimit-platformer-gdd-test',
    } as Config,
    {
      apiKey: 'test-key',
      baseUrl: 'https://example.invalid',
      modelName: 'test-model',
    },
  );
}
