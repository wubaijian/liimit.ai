import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findFireMountainExampleProject,
  FIRE_MOUNTAIN_BUILT_IN_EXAMPLE,
} from '../src/shared/builtInExamples.js';
import type { ProjectRecord } from '../src/shared/types.js';
import { parseLevelCampaign } from '../src/shared/levelCampaign.js';
import { parseLevelDocument } from '../src/shared/levelDocument.js';
import { moveLevelObject } from '../src/renderer/levelEditing.js';

const app = readFileSync(
  new URL('../src/renderer/App.tsx', import.meta.url),
  'utf8',
);
const dialog = readFileSync(
  new URL('../src/renderer/components/NewProjectDialog.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/renderer/styles.css', import.meta.url),
  'utf8',
);
const campaign = parseLevelCampaign(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../agent-test/templates/modules/platformer/src/levels.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

describe('火山逃生正式内置示例', () => {
  it('提供稳定的示例身份、说明和本地缩略图', () => {
    expect(FIRE_MOUNTAIN_BUILT_IN_EXAMPLE).toMatchObject({
      id: 'fire-mountain-escape',
      name: '火山逃生',
      label: '正式内置示例',
    });
    const preview = new URL(
      '../src/renderer/assets/fire-mountain-example.png',
      import.meta.url,
    );
    expect(existsSync(preview)).toBe(true);
    expect(readFileSync(preview).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });

  it('在主页提供一键打开入口且只走本地项目创建流程', () => {
    expect(app).toContain('built-in-example-card');
    expect(app).toContain('onOpenBuiltInExample');
    expect(app).toContain('BUILT_IN_PLATFORMER_EXAMPLES.map');
    expect(app).toContain('getBuiltInExample(exampleId)');
    expect(app).toContain('directory: directory ?? settings.defaultWorkspace');
    expect(styles).toContain('.home-game-types > .built-in-example-card');
  });

  it('示例已经存在时直接打开原项目，不重复创建或覆盖关卡', () => {
    const existing = {
      id: 'existing-fire-mountain',
      name: '火山逃生',
      path: '/Users/test/liimit.ai Games/火山逃生',
    } as ProjectRecord;
    expect(
      findFireMountainExampleProject(
        [existing],
        '/Users/test/liimit.ai Games/',
      ),
    ).toBe(existing);
    expect(
      findFireMountainExampleProject(
        [existing],
        '/Users/test/another-workspace',
      ),
    ).toBeUndefined();
    expect(app).toContain('if (existing)');
    expect(app).toContain('setSelectedId(existing.id)');
    expect(dialog).toContain(
      'await onOpenBuiltInExample(selectedBuiltInExample.id, directory)',
    );
    expect(dialog).toContain('`打开已有${selectedBuiltInExample.name}`');
  });

  it('在新建窗口提供独立的内置示例开始方式', () => {
    expect(dialog).toContain("| 'fire-example'");
    expect(dialog).toContain('火山逃生示例');
    expect(dialog).toContain('直接打开已经完成的原创三关游戏');
    expect(dialog).toContain('readOnly={Boolean(selectedBuiltInExample)}');
    expect(styles).toContain('.creation-method-grid.has-built-in-examples');
  });

  it('三关数据经过拖动、保存文本和重新读取后仍然有效', () => {
    expect(campaign.levels).toHaveLength(3);
    const firstLevel = campaign.levels[0]!.document;
    const moved = moveLevelObject(firstLevel, 'l1-platform-a', {
      x: 384,
      y: 496,
    });
    const reopened = parseLevelDocument(
      JSON.parse(JSON.stringify(moved)) as unknown,
    );
    expect(
      reopened.objects.find((object) => object.id === 'l1-platform-a'),
    ).toMatchObject({
      x: 384,
      y: 512,
    });
  });
});
