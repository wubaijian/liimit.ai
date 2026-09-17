import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);
const eventStream = readFileSync(
  new URL('../src/renderer/components/EventStream.tsx', import.meta.url),
  'utf8',
);
const settingsDialog = readFileSync(
  new URL('../src/renderer/components/SettingsDialog.tsx', import.meta.url),
  'utf8',
);
const app = readFileSync(
  new URL('../src/renderer/App.tsx', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  if (!match) throw new Error(`找不到样式规则：${selector}`);
  return match[1] ?? '';
}

describe('桌面工作台滚动边界', () => {
  it('把应用外壳固定在窗口内', () => {
    expect(rule('.app-shell')).toMatch(/height:\s*100%/);
    expect(rule('.app-shell')).toMatch(/overflow:\s*hidden/);
    expect(rule('.workspace')).toMatch(/overflow:\s*hidden/);
    expect(rule('.production-layout')).toMatch(
      /overscroll-behavior:\s*contain/,
    );
  });

  it('只允许 Agent 日志区纵向滚动', () => {
    expect(rule('.event-stream')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.event-stream')).toMatch(/overscroll-behavior:\s*contain/);
    expect(rule('.production-center')).toMatch(/overflow:\s*hidden/);
  });

  it('AI 助手固定底部输入框，历史独立滚动', () => {
    expect(app.indexOf('className="composer"')).toBeGreaterThan(
      app.indexOf('<EventStream'),
    );
    expect(rule('.composer')).toMatch(/border-top:\s*1px/);
  });

  it('自动跟随输出时不会滚动页面根节点', () => {
    expect(eventStream).not.toContain('scrollIntoView');
    expect(eventStream).toContain('stream.scrollTop = stream.scrollHeight');
  });

  it('API 设置页锁定外层滚动并占满可用高度', () => {
    expect(settingsDialog).toContain(
      "section === 'api' ? 'is-api-scroll-locked' : ''",
    );
    expect(rule('.settings-center-content.is-api-scroll-locked')).toMatch(
      /overflow:\s*hidden/,
    );
    expect(rule('.api-settings-page')).toMatch(/height:\s*100%/);
    expect(rule('.api-settings-page')).toMatch(/min-height:\s*0/);
    expect(rule('.api-settings-page')).toMatch(/overflow:\s*hidden/);
    expect(rule('.api-control-grid')).toMatch(/min-height:\s*0/);
    expect(rule('.api-control-grid')).toMatch(/flex:\s*1 1 0/);
  });

  it('最近调用列表是可聚焦的独立滚动区域', () => {
    for (const selector of ['.work-call-list', '.api-call-list']) {
      expect(rule(selector)).toMatch(/overflow-y:\s*auto/);
      expect(rule(selector)).toMatch(/overscroll-behavior:\s*contain/);
      expect(rule(selector)).toMatch(/scrollbar-gutter:\s*stable/);
    }
    expect(settingsDialog).toContain('aria-label="实际工作调用记录"');
    expect(settingsDialog).toContain('aria-label="API 计量记录"');
    expect(settingsDialog.match(/tabIndex=\{0\}/g)).toHaveLength(2);
  });
});

describe('白色产品工作台', () => {
  it('默认使用白色浅色主题', () => {
    expect(rule(':root')).toMatch(/color-scheme:\s*light/);
    expect(rule(':root')).toMatch(/--panel:\s*#ffffff/);
    expect(app).not.toContain('切换主题');
  });

  it('把关卡和试玩作为主区域', () => {
    expect(app.indexOf('<Inspector')).toBeLessThan(
      app.indexOf('className="production-center"'),
    );
    expect(app).not.toContain('<Pipeline');
    expect(styles).toContain(
      'grid-template-columns: minmax(0, 1fr) clamp(400px, 36vw, 560px)',
    );
  });

  it('把 AI 修改明确标记为可选工具', () => {
    expect(app).toContain('AI 修改助手');
    expect(app).toContain('可选 · 需要 API');
    expect(app).toContain('不接 API 也可以编辑和试玩基础游戏');
  });
});
