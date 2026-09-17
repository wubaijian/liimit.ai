import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseLevelCampaign } from '../src/shared/levelCampaign.js';
import { isStarterTemplateId } from '../src/shared/types.js';
import { foundationGameIsReady } from '../src/main/foundationValidation.js';
const variant = new URL(
  '../../../agent-test/templates/variants/ai-foundation/src/',
  import.meta.url,
);
const read = (file: string) =>
  JSON.parse(readFileSync(new URL(file, variant), 'utf8'));
describe('AI foundation', () => {
  it('uses a neutral calibration workspace, not a finished example', () => {
    expect(isStarterTemplateId('ai-foundation')).toBe(true);
    const campaign = parseLevelCampaign(read('levels.json'));
    expect(campaign.levels).toHaveLength(1);
    expect(campaign.levels[0].name).toContain('待 AI 创建');
    expect(
      campaign.levels[0].document.objects.map((o) => o.type).sort(),
    ).toEqual(['goal', 'platform', 'player-spawn']);
    expect(read('visualStyle.json').mode).toBe('custom');
    expect(JSON.stringify(read('visualStyle.json'))).not.toMatch(
      /fire-mountain|北极熊|火山/,
    );
    expect(read('gameInfo.json').title).not.toBe('火山逃生');
  });
  it('does not consider renamed placeholder or test-only edits to be game creation', () => {
    const original = read('levels.json');
    const info = { version: 1, title: '海底冒险', subtitle: '新关卡' };
    expect(foundationGameIsReady(original, original, info)).toBe(false);
    const renamed = structuredClone(original);
    renamed.levels[0].name = '深海入口';
    renamed.levels[0].id = 'level-1';
    expect(foundationGameIsReady(original, renamed, info)).toBe(false);
    renamed.levels[0].abilities.doubleJumpEnabled = true;
    expect(foundationGameIsReady(original, renamed, info)).toBe(true);
    expect(
      foundationGameIsReady(original, renamed, read('gameInfo.json')),
    ).toBe(false);
  });
});
