import type { Server } from 'node:http';
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mapProjectCreationError,
  ProjectManager,
  type ProjectManagerOptions,
} from '../src/main/projectManager.js';
import type { StateStore } from '../src/main/store.js';
import { createDefaultLevelDocument } from '../src/shared/levelDocument.js';
import { DEFAULT_GAME_INFO } from '../src/shared/gameInfo.js';
import {
  FIXED_PRODUCT_MODE,
  STARTER_PREPARATION_SCHEMA_VERSION,
  type ProjectRecord,
  type StarterPreparationPhase,
} from '../src/shared/types.js';

const temporaryRoots: string[] = [];
const managers: ProjectManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.stopAllPreviews();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ProjectManager project boundaries', () => {
  it('prepares only the resolved fixed project directory through the trusted provisioner', async () => {
    const prepare = vi.fn(async () => ({
      scaffoldedFiles: 12,
      preservedFiles: 2,
      dependencies: 'installed' as const,
    }));
    const build = vi.fn(async () => undefined);
    const fixture = await createFixture({
      fixedProjectProvisioner: { prepare, build },
    });
    const projectPath = path.join(fixture.root, 'fixed-project');
    await mkdir(projectPath);
    const project = makeProject(projectPath);

    await expect(fixture.manager.prepareFixedProject(project)).resolves.toEqual(
      expect.objectContaining({ dependencies: 'installed' }),
    );
    expect(prepare).toHaveBeenCalledWith(
      await realpath(projectPath),
      undefined,
    );

    await fixture.manager.buildFixedProject(project);
    expect(build).toHaveBeenCalledWith(await realpath(projectPath), undefined);
  });

  it('forwards scaffold and dependencies preparation progress from the trusted provisioner', async () => {
    type ReportPhase = (
      phase: Extract<StarterPreparationPhase, 'scaffold' | 'dependencies'>,
    ) => Promise<void>;
    const prepare = vi.fn(
      async (
        _projectRoot: string,
        _signal?: AbortSignal,
        reportPhase?: ReportPhase,
      ) => {
        await reportPhase?.('scaffold');
        await reportPhase?.('dependencies');
        return {
          scaffoldedFiles: 12,
          preservedFiles: 2,
          dependencies: 'installed' as const,
        };
      },
    );
    const fixture = await createFixture({
      fixedProjectProvisioner: {
        prepare,
        build: vi.fn(async () => undefined),
      },
    });
    const projectPath = path.join(fixture.root, 'progress-project');
    await mkdir(projectPath);
    const project = makeProject(projectPath);
    const phases: StarterPreparationPhase[] = [];
    const reportPhase: ReportPhase = async (phase) => {
      phases.push(phase);
    };
    const prepareWithProgress = fixture.manager.prepareFixedProject.bind(
      fixture.manager,
    ) as (
      project: ProjectRecord,
      signal: AbortSignal | undefined,
      reportPhase: ReportPhase,
    ) => Promise<unknown>;

    await prepareWithProgress(project, undefined, reportPhase);

    expect(phases).toEqual(['scaffold', 'dependencies']);
    expect(prepare).toHaveBeenCalledWith(
      await realpath(projectPath),
      undefined,
      reportPhase,
    );
  });

  it.each(['.', '..'])('rejects the unsafe project name %s', async (name) => {
    const fixture = await createFixture();

    await expect(
      fixture.manager.create({
        name,
        directory: fixture.workspace,
        prompt: '制作一个测试游戏',
      }),
    ).rejects.toThrow('安全的目录名');
    expect(await readdir(fixture.workspace)).toEqual([]);
  });

  it.each(['CON', 'con.txt', 'COM0', 'LPT1'])(
    'rejects the Windows-unsafe project name %s on every host',
    async (name) => {
      const fixture = await createFixture();

      await expect(
        fixture.manager.create({
          name,
          directory: fixture.workspace,
          prompt: '制作一个测试游戏',
        }),
      ).rejects.toThrow('安全的目录名');
      expect(await readdir(fixture.workspace)).toEqual([]);
    },
  );

  it('removes Windows control characters from the project directory', async () => {
    const fixture = await createFixture();
    const project = await fixture.manager.create({
      name: 'Game\u0001Name',
      directory: fixture.workspace,
      prompt: '制作一个测试游戏',
    });

    expect(path.basename(project.path)).toBe('Game-Name');
  });

  it.each([
    ['Game.', 'Game'],
    ['Game ', 'Game'],
  ])(
    'removes Windows-unsafe trailing punctuation from %s',
    async (name, expected) => {
      const fixture = await createFixture();

      const project = await fixture.manager.create({
        name,
        directory: fixture.workspace,
        prompt: '制作一个测试游戏',
      });

      expect(path.basename(project.path)).toBe(expected);
    },
  );

  it('removes a trailing dot created by project-name truncation', async () => {
    const fixture = await createFixture();
    const project = await fixture.manager.create({
      name: `${'A'.repeat(79)}.suffix`,
      directory: fixture.workspace,
      prompt: '制作一个测试游戏',
    });

    expect(path.basename(project.path)).toBe('A'.repeat(79));
  });

  it('does not silently reuse a non-empty project directory', async () => {
    const fixture = await createFixture();
    const existingProject = path.join(fixture.workspace, 'Existing-Game');
    const sentinel = path.join(existingProject, 'keep.txt');
    await mkdir(existingProject);
    await writeFile(sentinel, 'do-not-overwrite', 'utf8');

    await expect(
      fixture.manager.create({
        name: 'Existing Game',
        directory: fixture.workspace,
        prompt: '制作一个测试游戏',
      }),
    ).rejects.toThrow('不是空目录');
    expect(await readFile(sentinel, 'utf8')).toBe('do-not-overwrite');
  });

  it('blocks direct and intermediate symlinks that escape the project', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'project');
    const outsidePath = path.join(fixture.root, 'outside');
    await mkdir(projectPath);
    await mkdir(outsidePath);
    await writeFile(
      path.join(outsidePath, 'secret.txt'),
      'outside-secret',
      'utf8',
    );
    await symlink(
      path.join(outsidePath, 'secret.txt'),
      path.join(projectPath, 'direct-secret.txt'),
    );
    await symlink(outsidePath, path.join(projectPath, 'escape'));
    const project = makeProject(projectPath);

    await expect(
      fixture.manager.readProjectFile(project, 'direct-secret.txt'),
    ).rejects.toThrow('符号链接');
    await expect(
      fixture.manager.readProjectFile(project, 'escape/secret.txt'),
    ).rejects.toThrow('路径超出项目目录');
  });

  it('reads at most the file-view limit from a large sparse project file', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'large-file-project');
    const largeFile = path.join(projectPath, 'large.txt');
    await mkdir(projectPath);
    await writeFile(largeFile, 'visible-prefix', 'utf8');
    await truncate(largeFile, 128 * 1024 * 1024);

    await expect(
      fixture.manager.readProjectFile(makeProject(projectPath), 'large.txt'),
    ).resolves.toMatchObject({
      content: expect.stringMatching(/^visible-prefix/),
      truncated: true,
    });
  });

  it('does not follow a symlinked .qwen directory while writing the system prompt', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'project');
    const outsidePath = path.join(fixture.root, 'outside');
    await mkdir(projectPath);
    await mkdir(outsidePath);
    await symlink(outsidePath, path.join(projectPath, '.qwen'));

    await expect(
      fixture.manager.prepareSystemPrompt(
        projectPath,
        makeProject(projectPath),
      ),
    ).rejects.toThrow('符号链接');
    await expect(
      readFile(path.join(outsidePath, 'system.md'), 'utf8'),
    ).rejects.toThrow();
  });

  it('marks every new project with the fixed product mode in memory, the snapshot, and the system prompt', async () => {
    const fixture = await createFixture();

    const project = await fixture.manager.create({
      name: 'Fixed Platformer',
      directory: fixture.workspace,
      prompt: '制作一个横版平台跳跃游戏',
    });

    expect(project.productMode).toBe(FIXED_PRODUCT_MODE.id);
    expect(fixture.upsertProject).toHaveBeenCalledTimes(1);
    expect(fixture.upsertProject).toHaveBeenCalledWith(project);

    const snapshot = JSON.parse(
      await readFile(
        path.join(project.path, '.gameagent', 'project.json'),
        'utf8',
      ),
    ) as ProjectRecord;
    expect(snapshot).toEqual(project);
    expect(snapshot.productMode).toBe(FIXED_PRODUCT_MODE.id);

    const systemPromptPath = path.join(project.path, '.qwen', 'system.md');
    const createdPrompt = await readFile(systemPromptPath, 'utf8');
    expect(createdPrompt).toContain(FIXED_PRODUCT_MODE.engine);
    expect(createdPrompt).toContain(FIXED_PRODUCT_MODE.dimension);
    expect(createdPrompt).toContain(FIXED_PRODUCT_MODE.archetype);
    expect(createdPrompt).toContain('应用内 Web');
    expect(createdPrompt).toContain('不得切换到其他游戏引擎');
    expect(createdPrompt).toContain('不得切换到其他游戏类型');

    await fixture.manager.prepareSystemPrompt(project.path, project);
    expect(await readFile(systemPromptPath, 'utf8')).toBe(createdPrompt);
  });

  it('creates and persists the same queued starter preparation in memory and the project snapshot', async () => {
    const fixture = await createFixture();

    const project = await fixture.manager.create({
      name: 'Queued Starter',
      directory: fixture.workspace,
      prompt: '制作一个刚创建就开始准备的横版游戏',
    });
    const snapshot = JSON.parse(
      await readFile(
        path.join(project.path, '.gameagent', 'project.json'),
        'utf8',
      ),
    ) as ProjectRecord;

    expect(project.starterPreparation).toEqual({
      schemaVersion: STARTER_PREPARATION_SCHEMA_VERSION,
      status: 'queued',
      phase: 'queued',
      attempt: 1,
      revision: 0,
      message: expect.stringMatching(/排队|等待|准备/),
    });
    expect(fixture.upsertProject).toHaveBeenCalledWith(project);
    expect(snapshot).toEqual(project);
    expect(snapshot.starterPreparation).toEqual(project.starterPreparation);
  });

  it('rejects a legacy project without rewriting its system prompt', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'legacy-project');
    const { productMode: _productMode, ...legacyProject } =
      makeProject(projectPath);
    await mkdir(path.join(projectPath, '.gameagent'), { recursive: true });
    await writeFile(
      path.join(projectPath, '.gameagent', 'project.json'),
      JSON.stringify(legacyProject, null, 2),
      'utf8',
    );

    await expect(
      fixture.manager.prepareSystemPrompt(
        projectPath,
        legacyProject as ProjectRecord,
      ),
    ).rejects.toThrow('只允许操作 Phaser 3 · 2D 横版平台项目');

    await expect(
      readFile(path.join(projectPath, '.qwen', 'system.md'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects legacy projects before file, preview, or prompt operations', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'legacy-operations');
    await mkdir(projectPath);
    const { productMode: _productMode, ...legacyProject } =
      makeProject(projectPath);
    const unsupported = legacyProject as ProjectRecord;

    await expect(fixture.manager.listFiles(unsupported)).rejects.toThrow(
      '只允许操作 Phaser 3 · 2D 横版平台项目',
    );
    await expect(
      fixture.manager.readProjectFile(unsupported, 'index.html'),
    ).rejects.toThrow('只允许操作 Phaser 3 · 2D 横版平台项目');
    await expect(fixture.manager.startPreview(unsupported)).rejects.toThrow(
      '只允许操作 Phaser 3 · 2D 横版平台项目',
    );
  });

  it('reports a moved fixed project clearly without recreating or persisting it', async () => {
    const fixture = await createFixture();
    const missingPath = path.join(fixture.root, 'moved-legacy-project');
    const legacyProject = makeProject(missingPath);

    await expect(fixture.manager.listFiles(legacyProject)).rejects.toThrow(
      '项目目录不存在，可能已被移动或删除。',
    );
    expect(fixture.upsertProject).not.toHaveBeenCalled();
    await expect(lstat(missingPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not persist a project when the workspace path is unavailable', async () => {
    const fixture = await createFixture();
    const unavailableWorkspace = path.join(fixture.root, 'workspace-file');
    await writeFile(unavailableWorkspace, 'not-a-directory', 'utf8');

    await expect(
      fixture.manager.create({
        name: 'Unavailable Workspace',
        directory: unavailableWorkspace,
        prompt: '制作一个测试游戏',
      }),
    ).rejects.toThrow('项目保存位置不是文件夹，请重新选择一个文件夹。');
    expect(fixture.upsertProject).not.toHaveBeenCalled();
  });

  it('does not persist a project when the workspace path is invalid', async () => {
    const fixture = await createFixture();

    await expect(
      fixture.manager.create({
        name: 'Invalid Workspace',
        directory: path.join(fixture.root, 'invalid\0workspace'),
        prompt: '制作一个测试游戏',
      }),
    ).rejects.toThrow('项目保存路径无效，请重新选择一个有效文件夹。');
    expect(fixture.upsertProject).not.toHaveBeenCalled();
  });

  it('does not persist a project when prompt generation fails mid-creation', async () => {
    const fixture = await createFixture();
    await rm(fixture.promptPath);

    await expect(
      fixture.manager.create({
        name: 'Prompt Failure',
        directory: fixture.workspace,
        prompt: '制作一个测试游戏',
      }),
    ).rejects.toThrow();
    expect(fixture.upsertProject).not.toHaveBeenCalled();
  });

  it('cleans only generated metadata after store persistence fails and allows the same-name retry', async () => {
    const fixture = await createFixture();
    const storeError = Object.assign(new Error('state persistence failed'), {
      code: 'EIO',
    });
    fixture.upsertProject
      .mockRejectedValueOnce(storeError)
      .mockResolvedValueOnce(undefined);
    const input = {
      name: 'Retryable Game',
      directory: fixture.workspace,
      prompt: '制作一个可重试的游戏',
    };
    const projectPath = path.join(fixture.workspace, 'Retryable-Game');

    await expect(fixture.manager.create(input)).rejects.toMatchObject({
      message:
        '项目记录保存失败，本次初始化文件已清理。请检查应用数据目录权限或可用空间后，使用相同项目名称重试。',
      cause: storeError,
    });

    await expect(lstat(projectPath)).resolves.toMatchObject({});
    await expect(readdir(projectPath)).resolves.toEqual([]);
    await expect(
      lstat(path.join(projectPath, '.qwen', 'system.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      lstat(path.join(projectPath, '.gameagent', 'project.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const retriedProject = await fixture.manager.create(input);

    expect(retriedProject.path).toBe(await realpath(projectPath));
    expect(fixture.upsertProject).toHaveBeenCalledTimes(2);
    await expect(
      readFile(path.join(projectPath, '.qwen', 'system.md'), 'utf8'),
    ).resolves.toContain(FIXED_PRODUCT_MODE.engine);
    await expect(
      readFile(path.join(projectPath, '.gameagent', 'project.json'), 'utf8'),
    ).resolves.toContain(FIXED_PRODUCT_MODE.id);
  });

  it('preserves unrelated files if they appear before store persistence fails', async () => {
    const fixture = await createFixture();
    const storeError = new Error('state persistence failed');
    const projectPath = path.join(
      await realpath(fixture.workspace),
      'Preserve-User-Files',
    );
    fixture.upsertProject.mockImplementationOnce(async (project) => {
      await Promise.all([
        writeFile(path.join(project.path, 'keep.txt'), 'keep root', 'utf8'),
        writeFile(
          path.join(project.path, '.qwen', 'keep.txt'),
          'keep qwen',
          'utf8',
        ),
        writeFile(
          path.join(project.path, '.gameagent', 'keep.json'),
          'keep gameagent',
          'utf8',
        ),
      ]);
      throw storeError;
    });

    await expect(
      fixture.manager.create({
        name: 'Preserve User Files',
        directory: fixture.workspace,
        prompt: '不删除其它文件',
      }),
    ).rejects.toMatchObject({
      message: `项目记录保存失败，且项目目录中仍有文件。请检查“${projectPath}”，保留需要的内容后清理该目录，或使用其他项目名称重试。`,
      cause: storeError,
    });

    await expect(
      readFile(path.join(projectPath, 'keep.txt'), 'utf8'),
    ).resolves.toBe('keep root');
    await expect(
      readFile(path.join(projectPath, '.qwen', 'keep.txt'), 'utf8'),
    ).resolves.toBe('keep qwen');
    await expect(
      readFile(path.join(projectPath, '.gameagent', 'keep.json'), 'utf8'),
    ).resolves.toBe('keep gameagent');
    await expect(
      lstat(path.join(projectPath, '.qwen', 'system.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      lstat(path.join(projectPath, '.gameagent', 'project.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('ProjectManager full creation error mapping', () => {
  it.each([
    [
      'EACCES',
      '没有权限写入项目保存位置，请选择可写文件夹或调整目录权限后重试。',
    ],
    [
      'EPERM',
      '没有权限写入项目保存位置，请选择可写文件夹或调整目录权限后重试。',
    ],
    ['EROFS', '项目保存位置位于只读文件系统，请选择可写文件夹后重试。'],
    ['ENOSPC', '项目保存位置空间不足，请释放空间或选择其他文件夹后重试。'],
    ['EDQUOT', '项目保存位置空间不足，请释放空间或选择其他文件夹后重试。'],
  ])(
    'maps an injected %s file initialization failure through create()',
    async (code, message) => {
      const fixture = await createFixture();
      const source = Object.assign(new Error('raw filesystem error'), { code });
      mockProjectFileFailure(fixture.manager, source);

      await expect(
        fixture.manager.create({
          name: 'Mapped Failure',
          directory: fixture.workspace,
          prompt: '验证完整创建路径',
        }),
      ).rejects.toMatchObject({ message, cause: source });
      expect(fixture.upsertProject).not.toHaveBeenCalled();
    },
  );
});

describe('ProjectManager project creation error mapping', () => {
  it.each(['EACCES', 'EPERM'])(
    'maps %s to an actionable permission message',
    (code) => {
      const source = Object.assign(new Error('raw filesystem error'), {
        code,
      });

      const mapped = mapProjectCreationError(source);

      expect(mapped.message).toBe(
        '没有权限写入项目保存位置，请选择可写文件夹或调整目录权限后重试。',
      );
      expect(mapped.cause).toBe(source);
    },
  );

  it('maps a read-only filesystem to an actionable location message', () => {
    const source = Object.assign(new Error('raw filesystem error'), {
      code: 'EROFS',
    });

    const mapped = mapProjectCreationError(source);

    expect(mapped.message).toBe(
      '项目保存位置位于只读文件系统，请选择可写文件夹后重试。',
    );
    expect(mapped.cause).toBe(source);
  });

  it('does not replace an existing explicit business error', () => {
    const source = new Error(
      '同名项目目录已存在且不是空目录，请更换项目名称。',
    );

    expect(mapProjectCreationError(source)).toBe(source);
  });
});

describe('ProjectManager preview server', () => {
  it('requires dist/index.html and never falls back to source or external-engine outputs', async () => {
    const fixture = await createFixture();
    const projectPath = path.join(fixture.root, 'project');
    const alternateBuild = path.join(projectPath, 'build');
    await mkdir(alternateBuild, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(projectPath, 'index.html'),
        '<h1>source only</h1>',
        'utf8',
      ),
      writeFile(
        path.join(alternateBuild, 'index.html'),
        '<h1>alternate build</h1>',
        'utf8',
      ),
      writeFile(
        path.join(projectPath, 'project.godot'),
        '[application]',
        'utf8',
      ),
      writeFile(
        path.join(projectPath, 'Game.exe'),
        'external engine output',
        'utf8',
      ),
    ]);

    const project = makeProject(projectPath);

    await expect(fixture.manager.startPreview(project)).rejects.toThrow(
      'dist/index.html',
    );
    expect(getPreviewMap(fixture.manager).has(project.id)).toBe(false);
  });

  it('rebuilds the preview server when preview is requested again', async () => {
    const fixture = await createPreviewFixture();
    await fixture.manager.startPreview(fixture.project);
    const previews = getPreviewMap(fixture.manager);
    const firstServer = previews.get(fixture.project.id)!.server;

    await fixture.manager.startPreview(fixture.project);
    const secondServer = previews.get(fixture.project.id)!.server;

    expect(secondServer).not.toBe(firstServer);
    expect(firstServer.listening).toBe(false);
    expect(secondServer.listening).toBe(true);
  });

  it('finishes concurrent preview reloads in request order', async () => {
    const fixture = await createPreviewFixture();
    await fixture.manager.startPreview(fixture.project);
    const previews = getPreviewMap(fixture.manager);
    const initialServer = previews.get(fixture.project.id)!.server;
    const managerInternals = fixture.manager as unknown as {
      closePreviewServer(server: Server): Promise<void>;
    };
    const closePreviewServer = managerInternals.closePreviewServer.bind(
      fixture.manager,
    );
    let releaseInitialClose!: () => void;
    const initialCloseReleased = new Promise<void>((resolve) => {
      releaseInitialClose = resolve;
    });
    let markInitialCloseStarted!: () => void;
    const initialCloseStarted = new Promise<void>((resolve) => {
      markInitialCloseStarted = resolve;
    });
    vi.spyOn(managerInternals, 'closePreviewServer').mockImplementation(
      async (server) => {
        if (server === initialServer) {
          markInitialCloseStarted();
          await initialCloseReleased;
        }
        await closePreviewServer(server);
      },
    );

    const completionOrder: string[] = [];
    const firstReload = fixture.manager
      .startPreview(fixture.project)
      .then((url) => {
        completionOrder.push('first');
        return url;
      });
    await initialCloseStarted;
    const secondReload = fixture.manager
      .startPreview(fixture.project)
      .then((url) => {
        completionOrder.push('second');
        return url;
      });

    releaseInitialClose();
    const [firstUrl, secondUrl] = await Promise.all([
      firstReload,
      secondReload,
    ]);

    expect(completionOrder).toEqual(['first', 'second']);
    expect(secondUrl).not.toBe(firstUrl);
    expect(previews.get(fixture.project.id)?.url).toBe(secondUrl);
    await expect(
      fetch(secondUrl).then((response) => response.ok),
    ).resolves.toBe(true);
  });

  it('serves the latest validated editor level through a fixed preview address', async () => {
    const fixture = await createPreviewFixture();
    const url = await fixture.manager.startPreview(fixture.project);
    const levelUrl = new URL('/__liimit/level.json', url);

    const initial = await fetch(levelUrl);
    expect(initial.status).toBe(200);
    expect(initial.headers.get('cache-control')).toBe('no-store');
    await expect(initial.json()).resolves.toEqual(createDefaultLevelDocument());

    const updated = createDefaultLevelDocument();
    updated.objects = updated.objects.map((object) =>
      object.id === 'first-coin' ? { ...object, x: 512 } : object,
    );
    await mkdir(path.join(fixture.project.path, 'src'));
    await writeFile(
      path.join(fixture.project.path, 'src', 'level.json'),
      JSON.stringify(updated),
      'utf8',
    );

    await expect(
      fetch(levelUrl).then((response) => response.json()),
    ).resolves.toEqual(updated);
  });

  it('serves the ordered multi-level campaign through a fixed preview address', async () => {
    const fixture = await createPreviewFixture();
    const url = await fixture.manager.startPreview(fixture.project);
    const campaignUrl = new URL('/__liimit/levels.json', url);

    const response = await fetch(campaignUrl);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      version: 1,
      levels: [{ id: 'level-1', name: '第 1 关' }],
    });
  });

  it('serves the latest saved player game information without rebuilding', async () => {
    const fixture = await createPreviewFixture();
    const url = await fixture.manager.startPreview(fixture.project);
    const gameInfoUrl = new URL('/__liimit/game-info.json', url);

    const initial = await fetch(gameInfoUrl);
    expect(initial.status).toBe(200);
    expect(initial.headers.get('cache-control')).toBe('no-store');
    await expect(initial.json()).resolves.toEqual(DEFAULT_GAME_INFO);

    await mkdir(path.join(fixture.project.path, 'src'));
    const changed = {
      version: 1,
      title: '新的游戏名称',
      subtitle: '保存后直接出现在玩家首页。',
    };
    await writeFile(
      path.join(fixture.project.path, 'src', 'gameInfo.json'),
      JSON.stringify(changed),
      'utf8',
    );

    await expect(
      fetch(gameInfoUrl).then((response) => response.json()),
    ).resolves.toEqual(changed);
  });

  it('does not expose invalid editor level contents through preview', async () => {
    const fixture = await createPreviewFixture();
    await mkdir(path.join(fixture.project.path, 'src'));
    await writeFile(
      path.join(fixture.project.path, 'src', 'level.json'),
      '{"secret":"must-not-leak"}',
      'utf8',
    );
    const url = await fixture.manager.startPreview(fixture.project);
    const response = await fetch(new URL('/__liimit/level.json', url));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('预览文件不存在');
  });

  it('verifies a playable build through the local preview server and closes the probe', async () => {
    const fixture = await createPreviewFixture();

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).resolves.toBeUndefined();

    expect(getPreviewMap(fixture.manager).has(fixture.project.id)).toBe(false);
  });

  it('rejects an empty HTML entry and closes the failed probe', async () => {
    const fixture = await createPreviewFixture();
    await writeFile(path.join(fixture.dist, 'index.html'), '  \n', 'utf8');

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).rejects.toThrow(/内容为空/);

    expect(getPreviewMap(fixture.manager).has(fixture.project.id)).toBe(false);
  });

  it.each([
    {
      name: 'game container',
      html: '<!doctype html><script type="module" src="/assets/game.js"></script>',
      message: '#game-container',
    },
    {
      name: 'local module entry',
      html: '<!doctype html><div id="game-container"></div>',
      message: 'type="module"',
    },
    {
      name: 'local rather than remote module entry',
      html: '<div id="game-container"></div><script type="module" src="https://example.com/game.js"></script>',
      message: 'type="module"',
    },
    {
      name: 'local module entry when an external base URL is declared',
      html: '<base href="https://example.com/"><div id="game-container"></div><script type="module" src="assets/game.js"></script>',
      message: 'type="module"',
    },
    {
      name: 'real game container rather than script text',
      html: '<script>globalThis.fixture = \'<div id="game-container"></div>\';</script><script type="module" src="/assets/game.js"></script>',
      message: '#game-container',
    },
    {
      name: 'real module entry rather than inline script text',
      html: '<div id="game-container"></div><script>globalThis.fixture = \'<script type="module" src="/assets/game.js">\';</script>',
      message: 'type="module"',
    },
    {
      name: 'active game elements rather than inert template content',
      html: '<template><div id="game-container"></div><script type="module" src="/assets/game.js"></script></template>',
      message: '#game-container',
    },
    {
      name: 'game container rather than text inside another attribute',
      html: '<div data-fixture=\'id="game-container"\'></div><script type="module" src="/assets/game.js"></script>',
      message: '#game-container',
    },
    {
      name: 'module entry rather than text inside another script attribute',
      html: '<div id="game-container"></div><script data-fixture=\'type="module" src="/assets/game.js"\'></script>',
      message: 'type="module"',
    },
    {
      name: 'active module entry rather than plaintext content',
      html: '<div id="game-container"></div><plaintext><script type="module" src="/assets/game.js"></script>',
      message: 'type="module"',
    },
    {
      name: 'browser elements rather than malformed space-prefixed tags',
      html: '< div id="game-container">< script type="module" src="/assets/game.js"></script>',
      message: '#game-container',
    },
    {
      name: 'local rather than entity-encoded external module URL',
      html: '<div id="game-container"></div><script type="module" src="https&colon;//example.com/game.js"></script>',
      message: 'type="module"',
    },
    {
      name: 'HTML module entry rather than an SVG script element',
      html: '<div id="game-container"></div><svg><script type="module" src="/assets/game.js"></script></svg>',
      message: 'type="module"',
    },
    {
      name: 'real elements rather than text inside a bogus comment',
      html: '<?fixture <div id="game-container"><script type="module" src="/assets/game.js">><script type="module" src="/assets/game.js"></script>',
      message: '#game-container',
    },
  ])('rejects HTML without a valid $name', async ({ html, message }) => {
    const fixture = await createPreviewFixture();
    await writeFile(path.join(fixture.dist, 'index.html'), html, 'utf8');

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).rejects.toThrow(message);
  });

  it('rejects a missing local module entry script', async () => {
    const fixture = await createPreviewFixture();
    await writeFile(
      path.join(fixture.dist, 'index.html'),
      '<div id="game-container"></div><script type="module" src="/assets/missing.js"></script>',
      'utf8',
    );

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).rejects.toThrow(/入口脚本无法安全读取（HTTP 404）/);
  });

  it('rejects a module entry whose response is not JavaScript', async () => {
    const fixture = await createPreviewFixture();
    await writeFile(
      path.join(fixture.dist, 'index.html'),
      '<div id="game-container"></div><script type="module" src="/assets/sound.ogg"></script>',
      'utf8',
    );

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).rejects.toThrow('入口脚本不是 JavaScript 响应');
  });

  it('rejects an empty JavaScript module entry', async () => {
    const fixture = await createPreviewFixture();
    await writeFile(path.join(fixture.dist, 'assets', 'game.js'), '', 'utf8');

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).rejects.toThrow('入口脚本不是有效的 JavaScript');
  });

  it('rejects an oversized sparse HTML entry before buffering it', async () => {
    const fixture = await createPreviewFixture();
    await truncate(path.join(fixture.dist, 'index.html'), 2 * 1024 * 1024 + 1);

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).rejects.toThrow('HTML 入口超过安全大小上限（2 MiB）');
  });

  it('rejects an oversized sparse JavaScript entry before buffering it', async () => {
    const fixture = await createPreviewFixture();
    await truncate(
      path.join(fixture.dist, 'assets', 'game.js'),
      32 * 1024 * 1024 + 1,
    );

    await expect(
      fixture.manager.verifyPlayableBuild(fixture.project),
    ).rejects.toThrow('JavaScript 入口超过安全大小上限（32 MiB）');
  });

  it('keeps an existing user preview alive while an independent completion probe runs', async () => {
    const fixture = await createPreviewFixture();
    const userUrl = await fixture.manager.startPreview(fixture.project);
    const userPreview = getPreviewMap(fixture.manager).get(fixture.project.id);

    await fixture.manager.verifyPlayableBuild(fixture.project);

    expect(getPreviewMap(fixture.manager).get(fixture.project.id)).toBe(
      userPreview,
    );
    expect(userPreview?.server.listening).toBe(true);
    await expect(
      fetch(userUrl).then((response) => response.status),
    ).resolves.toBe(200);
  });

  it('uses SPA fallback only for HTML navigation and sets safe response headers', async () => {
    const fixture = await createPreviewFixture();
    const url = await fixture.manager.startPreview(fixture.project);

    const navigation = await fetch(new URL('/play/level-one', url), {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    expect(navigation.status).toBe(200);
    expect(await navigation.text()).toContain('preview-index');

    const missingAsset = await fetch(new URL('/assets/missing.js', url), {
      headers: { Accept: '*/*' },
    });
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await missingAsset.text()).not.toContain('preview-index');

    const audio = await fetch(new URL('/assets/sound.ogg', url));
    expect(audio.status).toBe(200);
    expect(audio.headers.get('content-type')).toBe('audio/ogg');
    expect(audio.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('does not serve a dist symlink that points outside the project', async () => {
    const fixture = await createPreviewFixture();
    const outsideScript = path.join(fixture.root, 'outside.js');
    await writeFile(outsideScript, 'globalThis.outsideSecret = true;', 'utf8');
    await symlink(outsideScript, path.join(fixture.dist, 'escape.js'));
    const url = await fixture.manager.startPreview(fixture.project);

    const response = await fetch(new URL('/escape.js', url), {
      headers: { Accept: '*/*' },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('outsideSecret');
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a dist directory symlink that points outside the project',
    async () => {
      const fixture = await createFixture();
      const projectPath = path.join(fixture.root, 'dist-link-project');
      const outsideDist = path.join(fixture.root, 'outside-dist');
      await Promise.all([mkdir(projectPath), mkdir(outsideDist)]);
      await symlink(outsideDist, path.join(projectPath, 'dist'));
      const project = makeProject(projectPath);

      await expect(
        fixture.manager.verifyPlayableBuild(project),
      ).rejects.toThrow('符号链接');
      expect(getPreviewMap(fixture.manager).has(project.id)).toBe(false);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects an index.html symlink that points outside dist',
    async () => {
      const fixture = await createPreviewFixture();
      const indexPath = path.join(fixture.dist, 'index.html');
      const outsideIndex = path.join(fixture.root, 'outside-index.html');
      await Promise.all([
        rm(indexPath),
        writeFile(
          outsideIndex,
          '<div id="game-container"></div><script type="module" src="/assets/game.js"></script>',
          'utf8',
        ),
      ]);
      await symlink(outsideIndex, indexPath);

      await expect(
        fixture.manager.verifyPlayableBuild(fixture.project),
      ).rejects.toThrow('符号链接');
      expect(getPreviewMap(fixture.manager).has(fixture.project.id)).toBe(
        false,
      );
    },
  );
});

async function createFixture(options: ProjectManagerOptions = {}): Promise<{
  root: string;
  workspace: string;
  promptPath: string;
  templatesDir: string;
  docsDir: string;
  upsertProject: ReturnType<typeof vi.fn>;
  manager: ProjectManager;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'gameagent-project-manager-'));
  temporaryRoots.push(root);
  const workspace = path.join(root, 'workspace');
  const templatesDir = path.join(root, 'templates');
  const docsDir = path.join(root, 'docs');
  const promptPath = path.join(root, 'custom.md');
  await Promise.all([
    mkdir(workspace),
    mkdir(templatesDir),
    mkdir(docsDir),
    writeFile(
      promptPath,
      '模板：{TEMPLATES_DIR}\n文档：{DOCS_DIR}\n项目：{PROJECT_ROOT}',
      'utf8',
    ),
  ]);
  const upsertProject = vi.fn(async () => undefined);
  const store = {
    upsertProject,
  } as unknown as StateStore;
  const manager = new ProjectManager(
    store,
    {
      promptPath,
      templatesDir,
      docsDir,
    },
    options,
  );
  managers.push(manager);
  return {
    root,
    workspace,
    promptPath,
    templatesDir,
    docsDir,
    upsertProject,
    manager,
  };
}

async function createPreviewFixture(): Promise<{
  root: string;
  dist: string;
  manager: ProjectManager;
  project: ProjectRecord;
}> {
  const fixture = await createFixture();
  const projectPath = path.join(fixture.root, 'project');
  const dist = path.join(projectPath, 'dist');
  const assets = path.join(dist, 'assets');
  await mkdir(assets, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(dist, 'index.html'),
      '<!doctype html><title>preview-index</title><div id="game-container"></div><script type="module" src="/assets/game.js"></script>',
      'utf8',
    ),
    writeFile(
      path.join(assets, 'game.js'),
      'globalThis.__LIIMIT_PREVIEW_READY__ = true;',
      'utf8',
    ),
    writeFile(
      path.join(assets, 'sound.ogg'),
      Buffer.from([0x4f, 0x67, 0x67, 0x53]),
    ),
  ]);
  return {
    root: fixture.root,
    dist,
    manager: fixture.manager,
    project: makeProject(projectPath),
  };
}

function makeProject(projectPath: string): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: `project-${path.basename(projectPath)}`,
    name: 'Test Project',
    path: projectPath,
    prompt: '制作一个测试游戏',
    status: 'completed',
    stage: 'verify',
    productMode: FIXED_PRODUCT_MODE.id,
    createdAt: now,
    updatedAt: now,
  };
}

function getPreviewMap(
  manager: ProjectManager,
): Map<string, { server: Server; url: string }> {
  return (
    manager as unknown as {
      previews: Map<string, { server: Server; url: string }>;
    }
  ).previews;
}

function mockProjectFileFailure(manager: ProjectManager, error: Error): void {
  vi.spyOn(
    manager as unknown as {
      createProjectFiles(input: {
        directory: string;
        folderName: string;
        name: string;
        prompt: string;
      }): Promise<ProjectRecord>;
    },
    'createProjectFiles',
  ).mockRejectedValue(error);
}
