import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  ApiCostPanel,
  costLabel,
} from '../src/renderer/components/ApiCostPanel';
it('unknown or pending cost is never presented as free', () => {
  expect(
    costLabel({ calls: 1, knownCny: 0, unknown: 1, pending: 0, failures: 1 }),
  ).toBe('1 笔费用未知');
  expect(
    costLabel({ calls: 1, knownCny: 0, unknown: 0, pending: 1, failures: 0 }),
  ).toBe('1 笔待结算');
});
it('compact panel has no auto-start and trusted bridge is wired', () => {
  const html = renderToStaticMarkup(<ApiCostPanel projectId="p" />);
  expect(html).toContain('费用与预算');
  expect(html).toContain('金额预算未启用');
  const preload = readFileSync(
    new URL('../src/main/preload.cts', import.meta.url),
    'utf8',
  );
  const main = readFileSync(
    new URL('../src/main/main.ts', import.meta.url),
    'utf8',
  );
  expect(preload).toContain("ipcRenderer.invoke('settings:save-api-costs'");
  expect(main).toContain("secureHandle('settings:api-costs'");
  expect(main).toContain(
    'apiCosts.save(value,costProfiles(currentCostEndpoints()))',
  );
});
