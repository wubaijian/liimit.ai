import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptDirectory, '..');
const repositoryRoot = path.resolve(desktopDirectory, '../..');
const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), 'liimit-playable-golden-path-'),
);
const keepTemporaryProject = process.env.LIIMIT_PLAYABLE_SMOKE_KEEP === '1';
const emptyModelConfiguration = Object.freeze({
  provider: '',
  model: '',
  apiKey: '',
});
const generativeCalls = { model: 0, image: 0, video: 0, audio: 0 };
let projects;
let projectDirectory;

try {
  const [
    dependencyManagerModule,
    levelDocumentModule,
    projectModule,
    provisionerModule,
    starterPreparationModule,
  ] = await Promise.all([
    import('../dist/main/dependencyManager.js'),
    import('../dist/main/levelDocumentStore.js'),
    import('../dist/main/projectManager.js'),
    import('../dist/main/fixedProjectProvisioner.js'),
    import('../dist/main/starterPreparationService.js'),
  ]);

  const persistedProjects = [];
  const emittedProjects = [];
  const store = {
    async upsertProject(project) {
      persistedProjects.push(structuredClone(project));
    },
  };
  const locations = {
    promptPath: path.join(repositoryRoot, 'agent-test', 'prompts', 'custom.md'),
    templatesDir: path.join(repositoryRoot, 'agent-test', 'templates'),
    docsDir: path.join(repositoryRoot, 'agent-test', 'docs'),
  };
  const relayOutput = ({ stream, text }) => {
    const target = stream === 'stderr' ? process.stderr : process.stdout;
    target.write(text);
  };
  const provisioner = new provisionerModule.FixedProjectProvisioner(locations, {
    onOutput: relayOutput,
  });
  projects = new projectModule.ProjectManager(store, locations, {
    fixedProjectProvisioner: provisioner,
  });

  process.stdout.write(
    '1/7 在模型、图片、视频和音频配置全部为空时创建真实新项目…\n',
  );
  if (Object.values(emptyModelConfiguration).some(Boolean)) {
    throw new Error('冒烟测试的模型配置不是空配置。');
  }
  const createdProject = await projects.create({
    name: 'GoldenPathGame',
    directory: temporaryRoot,
    prompt: '创建一个固定 Phaser 2D 横版平台跳跃关卡',
  });
  projectDirectory = createdProject.path;
  if (
    createdProject.starterPreparation?.status !== 'queued' ||
    createdProject.starterPreparation.phase !== 'queued'
  ) {
    throw new Error('新项目没有以 queued 准备状态安全创建。');
  }

  process.stdout.write(
    '2/7 不启动 Agent，自动复制固定模板、准备锁定依赖并构建 Web 游戏…\n',
  );
  const levelDocuments = new levelDocumentModule.LevelDocumentStore();
  let clock = Date.now();
  const preparationService =
    new starterPreparationModule.StarterPreparationService({
      store,
      projects,
      levelDocuments,
      emitProject(project) {
        emittedProjects.push(structuredClone(project));
      },
      now: () => new Date(++clock).toISOString(),
    });
  const readyProject = await preparationService.enqueue(createdProject);
  if (
    readyProject.starterPreparation?.status !== 'ready' ||
    readyProject.starterPreparation.phase !== 'complete'
  ) {
    throw new Error('真实准备流程没有进入 ready/complete。');
  }
  const expectedPhases = [
    'scaffold',
    'dependencies',
    'build',
    'level-validation',
    'preview-validation',
    'complete',
  ];
  const actualPhases = emittedProjects.map(
    (project) => project.starterPreparation?.phase,
  );
  if (JSON.stringify(actualPhases) !== JSON.stringify(expectedPhases)) {
    throw new Error(`准备阶段顺序错误：${actualPhases.join(' → ')}`);
  }

  process.stdout.write('3/7 严格读取项目磁盘上的真实 src/level.json…\n');
  const diskLevelText = await readFile(
    path.join(projectDirectory, 'src', 'level.json'),
    'utf8',
  );
  const diskLevel = JSON.parse(diskLevelText);
  const requiredLevel = await levelDocuments.readRequired(readyProject);
  const requiredObjectTypes = new Set(
    requiredLevel.objects.map((object) => object.type),
  );
  if (
    JSON.stringify(requiredLevel) !== JSON.stringify(diskLevel) ||
    !['player-spawn', 'platform', 'spike', 'coin', 'goal'].every((type) =>
      requiredObjectTypes.has(type),
    )
  ) {
    throw new Error('严格读取结果不是固定横版模板的真实完整关卡。');
  }

  process.stdout.write('4/7 运行模板测试，并确认相同锁文件不会重复安装依赖…\n');
  await writeFile(
    path.join(projectDirectory, 'src', 'test', 'golden-path.test.ts'),
    `import { describe, expect, it } from 'vitest';

describe('golden path environment', () => {
  it('can run the fixed template test command', () => {
    expect(1 + 1).toBe(2);
  });
});
`,
    'utf8',
  );
  const npm = await provisionerModule.resolveNpmProcess();
  const testResult = await dependencyManagerModule.createProcessCommandRunner()(
    {
      executable: npm.executable,
      args: [...npm.prefixArgs, 'run', 'test', '--ignore-scripts'],
      timeoutMs: 5 * 60_000,
      cwd: projectDirectory,
      terminateProcessGroup: true,
    },
    relayOutput,
  );
  if (testResult.aborted || testResult.timedOut || testResult.exitCode !== 0) {
    throw new Error(
      `固定模板测试命令失败（退出码 ${testResult.exitCode ?? '未知'}）。`,
    );
  }
  const repeatedPreparation = await projects.prepareFixedProject(readyProject);
  if (repeatedPreparation.dependencies !== 'ready') {
    throw new Error('相同锁文件的第二次准备没有跳过重复安装。');
  }

  process.stdout.write(
    '5/7 让人工试玩与自动试玩读取同一个真实 Web 地址和同一份关卡…\n',
  );
  const sharedPreviewUrl = await projects.startPreview(readyProject);
  const manualPreviewUrl = sharedPreviewUrl;
  const automaticPreviewUrl = sharedPreviewUrl;
  const [manualResponse, automaticResponse, liveLevelResponse] =
    await Promise.all([
      fetch(manualPreviewUrl, { headers: { Accept: 'text/html' } }),
      fetch(automaticPreviewUrl, { headers: { Accept: 'text/html' } }),
      fetch(new URL('/__liimit/level.json', sharedPreviewUrl)),
    ]);
  if (
    manualPreviewUrl !== automaticPreviewUrl ||
    !manualResponse.ok ||
    !automaticResponse.ok ||
    !liveLevelResponse.ok
  ) {
    throw new Error('人工与自动试玩没有共用同一个可读取的 Web 入口。');
  }
  const [manualHtml, automaticHtml, liveLevel] = await Promise.all([
    manualResponse.text(),
    automaticResponse.text(),
    liveLevelResponse.json(),
  ]);
  if (
    manualHtml !== automaticHtml ||
    JSON.stringify(liveLevel) !== JSON.stringify(requiredLevel)
  ) {
    throw new Error('人工与自动试玩读取的页面或关卡内容不一致。');
  }
  const moduleSource = readModuleSource(manualHtml, sharedPreviewUrl);
  const gameScriptResponse = await fetch(moduleSource);
  const gameScript = await gameScriptResponse.text();
  if (
    !gameScriptResponse.ok ||
    !gameScript.includes('liimit.ai') ||
    !gameScript.includes('playtest-control') ||
    !gameScript.includes('automation-state')
  ) {
    throw new Error('真实 Web 入口缺少人工/自动试玩共用控制协议。');
  }

  process.stdout.write('6/7 确认整个成功流程的生成式 AI 调用数为 0…\n');
  const totalGenerativeCalls = Object.values(generativeCalls).reduce(
    (total, count) => total + count,
    0,
  );
  if (totalGenerativeCalls !== 0) {
    throw new Error(`生成式 AI 调用数应为 0，实际为 ${totalGenerativeCalls}。`);
  }

  process.stdout.write(
    '7/7 模拟 Web 试玩验证失败，确认系统进入 failed 且绝不误报 ready…\n',
  );
  const failedUpdates = [];
  const failureCandidate = {
    ...readyProject,
    id: 'playable-golden-path-failure-check',
    starterPreparation: {
      ...readyProject.starterPreparation,
      status: 'queued',
      phase: 'queued',
      revision: 0,
      message: '基础游戏已排队，等待准备。',
      startedAt: undefined,
      finishedAt: undefined,
    },
  };
  const failureService = new starterPreparationModule.StarterPreparationService(
    {
      store,
      projects: {
        async prepareFixedProject(_project, _signal, reportPhase) {
          await reportPhase('scaffold');
          await reportPhase('dependencies');
        },
        async buildFixedProject() {},
        async verifyPlayableBuild() {
          throw new Error('模拟：Web 试玩入口无法读取。');
        },
      },
      levelDocuments,
      emitProject(project) {
        failedUpdates.push(structuredClone(project));
      },
      now: () => new Date(++clock).toISOString(),
    },
  );
  const failedProject = await failureService.enqueue(failureCandidate);
  if (
    failedProject.starterPreparation?.status !== 'failed' ||
    failedProject.starterPreparation.phase !== 'preview-validation' ||
    failedProject.starterPreparation.errorCode !== 'preview-validation' ||
    failedUpdates.some(
      (project) => project.starterPreparation?.status === 'ready',
    )
  ) {
    throw new Error('Web 试玩失败被错误标记为 ready。');
  }

  process.stdout.write(
    `通过：空模型配置创建；真实关卡 ${requiredLevel.width}×${requiredLevel.height}、${requiredLevel.objects.length} 个对象；人工/自动试玩共用 ${sharedPreviewUrl}；生成式 AI 调用 0 次；失败路径保持 failed。共持久化 ${persistedProjects.length} 次状态。\n`,
  );
} catch (error) {
  process.stderr.write(
    `黄金路径冒烟测试失败：${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  projects?.stopAllPreviews();
  if (keepTemporaryProject && projectDirectory) {
    process.stdout.write(`调试项目已保留：${projectDirectory}\n`);
  } else {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function readModuleSource(html, previewUrl) {
  const match = html.match(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/i,
  );
  if (!match) throw new Error('构建后的入口缺少本地 module 脚本。');
  return new URL(match[1], previewUrl);
}
