import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectManager } from '../dist/main/projectManager.js';
import { foundationGameIsReady } from '../dist/main/foundationValidation.js';

// No Agent or provider is constructed: this test cannot call a model API.
const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const root = await mkdtemp(path.join(tmpdir(), 'liimit-ai-foundation-'));
const manager = new ProjectManager(
  { upsertProject: async () => {} },
  {
    promptPath: path.join(repository, 'agent-test/prompts/custom.md'),
    templatesDir: path.join(repository, 'agent-test/templates'),
    docsDir: path.join(repository, 'agent-test/docs'),
  },
);
try {
  const project = await manager.create({
    name: 'FoundationSmoke',
    directory: root,
    prompt: '新关卡',
    creationMode: 'ai',
  });
  assert.equal(project.starterTemplateId, 'ai-foundation');
  await manager.prepareFixedProject(project);
  const read = async (name) =>
    JSON.parse(await readFile(path.join(project.path, 'src', name), 'utf8'));
  const original = await read('levels.json');
  assert.equal(original.levels.length, 1);
  assert.equal(original.levels[0].document.objects.length, 3);
  assert.equal((await read('visualStyle.json')).mode, 'custom');
  assert.equal(
    foundationGameIsReady(original, original, await read('gameInfo.json')),
    false,
  );
  assert.equal(
    (await readdir(path.join(project.path, 'public/assets'))).includes(
      'images',
    ),
    false,
  );
  await manager.buildFixedProject(project);
  await manager.verifyPlayableBuild(project);
  const custom = structuredClone(original);
  custom.levels[0].name = '烟雾测试关卡';
  custom.levels[0].document.objects[1].height = 80;
  custom.levels[0].document.objects[1].y = 640;
  const info = {
    version: 1,
    title: '新的关卡',
    subtitle: '本地检查，无模型调用',
  };
  await writeFile(
    path.join(project.path, 'src/levels.json'),
    JSON.stringify(custom),
  );
  await writeFile(
    path.join(project.path, 'src/level.json'),
    JSON.stringify(custom.levels[0].document),
  );
  await writeFile(
    path.join(project.path, 'src/gameInfo.json'),
    JSON.stringify(info),
  );
  await manager.prepareFixedProject(project);
  assert.deepEqual(await read('levels.json'), custom);
  assert.equal(foundationGameIsReady(original, custom, info), true);
  await manager.buildFixedProject(project);
  await manager.verifyPlayableBuild(project);
  console.log(
    'AI foundation smoke passed: neutral content, no example art, build/Web validation, retry preservation. No model APIs used.',
  );
} finally {
  manager.stopAllPreviews();
  await rm(root, { recursive: true, force: true });
}
