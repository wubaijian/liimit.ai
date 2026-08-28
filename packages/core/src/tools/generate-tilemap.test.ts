import { describe, expect, it } from 'vitest';
import type { Config } from '../config/config.js';
import { GenerateTilemapTool } from './generate-tilemap.js';

describe('GenerateTilemapTool platformer-only contract', () => {
  it('advertises only side-view platformer maps', () => {
    const contract = JSON.stringify(buildTool().schema);

    expect(contract).toContain('side-view platformer');
    expect(contract).not.toMatch(/top-down|floor|walls/);
  });

  it('rejects a retired mode before resolving a workspace or writing files', async () => {
    let workspaceWasResolved = false;
    const tool = new GenerateTilemapTool({
      getWorkspaceContext: () => {
        workspaceWasResolved = true;
        throw new Error('workspace must not be resolved');
      },
    } as unknown as Config);

    const result = await tool
      .build({
        tileset_key: 'platform_tiles',
        map_key: 'level1',
        layout_ascii: ['..P...', '######'],
        legend: { '.': 0, P: 0, '#': 1 },
        mode: 'floor',
      } as never)
      .execute(new AbortController().signal);

    expect(workspaceWasResolved).toBe(false);
    expect(result.error?.message).toContain('不再接受 mode 参数');
  });
});

function buildTool(): GenerateTilemapTool {
  return new GenerateTilemapTool({} as Config);
}
