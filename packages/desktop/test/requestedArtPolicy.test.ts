import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';

it('permits explicitly requested art while requiring integration and honest failure reporting', async () => {
  const prompt = await readFile(
    new URL('../../../agent-test/prompts/custom.md', import.meta.url),
    'utf8',
  );
  expect(prompt).toContain('用户明确要求生成图片、换画风');
  expect(prompt).toContain('普通关卡调整不得擅自生成图片');
  expect(prompt).toContain('生成图片但未接入游戏不算完成');
  expect(prompt).toContain('保留旧素材');
  expect(prompt).not.toContain('不得调用图像生成能力');
});
