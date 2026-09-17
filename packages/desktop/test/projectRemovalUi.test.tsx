import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ProjectRail } from '../src/renderer/components/ProjectRail';
import type { ProjectRecord } from '../src/shared/types';
const project = { id: 'p', name: '游戏', status: 'draft' } as ProjectRecord;
function render(value: ProjectRecord) {
  return renderToStaticMarkup(
    <ProjectRail
      projects={[value]}
      onHome={() => {}}
      onSelect={() => {}}
      onCreate={() => {}}
      onSettings={() => {}}
      onRemove={() => {}}
    />,
  );
}
it('renders accessible independent menu with clear non-permanent choices', () => {
  const html = render(project);
  expect(html).toContain('管理项目：游戏');
  expect(html).toContain('从列表移除');
  expect(html).toContain('删除项目及文件');
  expect(html).toContain('移到废纸篓');
  expect(html).not.toMatch(/<button\b(?:(?!<\/button>)[\s\S])*<button\b/);
});
it('disables removal while generating or preparing', () => {
  expect(
    render({ ...project, status: 'running' }).match(/disabled=""/g),
  ).toHaveLength(2);
  expect(render({ ...project, initialGeneration: 'pending' })).toContain(
    '请先停止任务',
  );
});
it('requires trusted IPC, native cancel-default confirmation and removal mutual exclusion', () => {
  const main = readFileSync(
    new URL('../src/main/main.ts', import.meta.url),
    'utf8',
  );
  expect(main).toContain("secureHandle('project:remove'");
  expect(main).toContain('assertTrustedIpc(event)');
  expect(main).toContain('pendingIpcOperations > 0');
  expect(main).toContain('projectRemoval?.busy');
  expect(main).toMatch(/defaultId:\s*0/);
  expect(main).toContain('shell.trashItem(target)');
});
