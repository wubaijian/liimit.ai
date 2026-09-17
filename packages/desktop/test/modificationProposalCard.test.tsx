import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ModificationProposalCard } from '../src/renderer/components/ModificationProposalCard';
it('shows full proposal and three actions, disabling them while running', () => {
  const html = renderToStaticMarkup(
    <ModificationProposalCard
      proposal={{ id: 'a', projectId: 'p', text: '第一关平台向上16像素' }}
      disabled
      onDecide={async () => ({ accepted: true })}
    />,
  );
  expect(html).toContain('第一关平台向上16像素');
  for (const label of ['确认修改', '调整方案', '取消'])
    expect(html).toContain(label);
  expect(html.match(/disabled=""/g)?.length).toBe(3);
});
