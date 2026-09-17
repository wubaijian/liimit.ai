import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EventStream } from '../src/renderer/components/EventStream';
import type { ProjectRecord } from '../src/shared/types';
const app = readFileSync(
  new URL('../src/renderer/App.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);
it('keeps conversation height bounded and lets readers opt out of following', () => {
  const stream = readFileSync(
    new URL('../src/renderer/components/EventStream.tsx', import.meta.url),
    'utf8',
  );
  expect(stream).toContain('!followRef.current');
  expect(stream).toContain('followRef.current = nearBottom');
  expect(stream).toContain('回到最新');
  expect(app).toContain('key={selected.id}');
  expect(css).toMatch(/\.conversation-pane\s*\{[^}]*min-height:\s*0/);
  expect(css).toMatch(/\.agent-workspace-body\s*\{[^}]*overflow:\s*hidden/);
  expect(css).toMatch(/\.composer\s*\{[^}]*flex:\s*0 0 auto/);
});
it('keeps the assistant visible and progress compact', () => {
  expect(app).toMatch(/<section\s+className="optional-agent-panel"/);
  expect(app).not.toContain('当前可以做什么');
  expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
});
it('collapses the brief and renders proposals inside the accessible conversation', () => {
  const html = renderToStaticMarkup(
    <EventStream
      project={
        {
          id: 'p',
          name: '游戏',
          prompt: '需求',
          path: '/game',
          createdAt: '2026-09-17',
          status: 'draft',
        } as ProjectRecord
      }
      events={[]}
      liveText=""
      history={{ loading: false, hasMore: false, source: 'empty' }}
    >
      <div>待确认方案</div>
    </EventStream>,
  );
  expect(html).toContain('<details class="brief-card">');
  expect(html).toContain('aria-label="AI 对话记录"');
  expect(html).toContain('待确认方案');
  expect(html).not.toContain('01 / BRIEF');
});
