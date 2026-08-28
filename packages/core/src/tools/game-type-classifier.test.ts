import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GameTypeClassifierTool,
  scaffoldGameProject,
  validateTemplateDependencyContract,
} from './game-type-classifier.js';
import { Kind } from './tools.js';
import type { Config } from '../config/config.js';

describe('GameTypeClassifierTool mutation contract', () => {
  it('declares project writes and requires confirmation outside automatic modes', async () => {
    const projectRoot = path.resolve('project');
    const tool = new GameTypeClassifierTool({
      getTargetDir: () => projectRoot,
    } as Config);
    const invocation = tool.build({ game_description: '平台跳跃游戏' });

    expect(tool.kind).toBe(Kind.Edit);
    expect(invocation.toolLocations()).toEqual([{ path: projectRoot }]);
    await expect(
      invocation.shouldConfirmExecute(new AbortController().signal),
    ).resolves.toMatchObject({
      type: 'info',
      title: expect.stringContaining('脚手架'),
      prompt: expect.stringContaining(projectRoot),
    });
  });
});

describe('GameTypeClassifierTool platformer-only mode', () => {
  let root: string;
  let projectRoot: string;
  let templatesDir: string;
  let docsDir: string;
  let originalFixedArchetype: string | undefined;
  let originalTemplatesDir: string | undefined;
  let originalDocsDir: string | undefined;

  beforeEach(async () => {
    originalFixedArchetype = process.env.LIIMIT_FIXED_GAME_ARCHETYPE;
    originalTemplatesDir = process.env.GAME_TEMPLATES_DIR;
    originalDocsDir = process.env.GAME_DOCS_DIR;

    root = await fs.mkdtemp(path.join(os.tmpdir(), 'liimit-classifier-'));
    projectRoot = path.join(root, 'project');
    templatesDir = path.join(root, 'templates');
    docsDir = path.join(root, 'docs');
    process.env.GAME_TEMPLATES_DIR = templatesDir;
    process.env.GAME_DOCS_DIR = docsDir;

    await Promise.all([
      fs.mkdir(projectRoot, { recursive: true }),
      write(path.join(templatesDir, 'core', '.gitignore'), 'dist\n'),
      write(
        path.join(templatesDir, 'core', 'package.json'),
        dependencyManifest(),
      ),
      write(
        path.join(templatesDir, 'core', 'package-lock.json'),
        dependencyLock(),
      ),
      write(path.join(templatesDir, 'core', 'src', 'main.ts'), 'core'),
      write(
        path.join(templatesDir, 'core', 'src', 'gameConfig.json'),
        'core config',
      ),
      write(
        path.join(templatesDir, 'modules', 'platformer', 'src', 'player.ts'),
        'platformer player',
      ),
      write(
        path.join(
          templatesDir,
          'modules',
          'platformer',
          'src',
          'gameConfig.json',
        ),
        'platformer config',
      ),
      write(path.join(docsDir, 'gdd', 'core.md'), 'gdd'),
      write(path.join(docsDir, 'asset_protocol.md'), 'asset'),
      write(path.join(docsDir, 'debug_protocol.md'), 'debug'),
      write(
        path.join(docsDir, 'modules', 'platformer', 'design_rules.md'),
        'platformer rules',
      ),
    ]);
  });

  afterEach(async () => {
    restoreEnvironment('LIIMIT_FIXED_GAME_ARCHETYPE', originalFixedArchetype);
    restoreEnvironment('GAME_TEMPLATES_DIR', originalTemplatesDir);
    restoreEnvironment('GAME_DOCS_DIR', originalDocsDir);
    vi.unstubAllGlobals();
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    ['a missing environment value', undefined, 'make a tower defense game'],
    ['a retired environment value', 'top_down', 'make a top-down game'],
    ['the former fixed value', 'platformer', 'make a card battle game'],
  ])(
    'never calls a classifier model for %s and always scaffolds platformer',
    async (_label, value, description) => {
      if (value === undefined) {
        delete process.env.LIIMIT_FIXED_GAME_ARCHETYPE;
      } else {
        process.env.LIIMIT_FIXED_GAME_ARCHETYPE = value;
      }
      const fetchMock = vi.fn(() => {
        throw new Error('classifier model must not be called');
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await buildClassifier(projectRoot, description).execute(
        new AbortController().signal,
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(String(result.llmContent)).toContain('游戏类型：platformer');
      expect(String(result.llmContent)).toContain('Has Gravity：true');
      expect(String(result.llmContent)).toContain('Perspective：side');
      expect(String(result.llmContent)).toContain('Movement Type：continuous');
      await expect(
        fs.readFile(path.join(projectRoot, 'src', 'player.ts'), 'utf8'),
      ).resolves.toBe('platformer player');
    },
  );

  it('advertises only the deterministic platformer result', () => {
    const tool = new GameTypeClassifierTool({
      getTargetDir: () => projectRoot,
    } as Config);
    const contract = JSON.stringify(tool.schema);

    expect(contract).toContain('platformer');
    expect(contract).not.toMatch(/top_down|grid_logic|tower_defense|ui_heavy/);
  });
});

describe('scaffoldGameProject', () => {
  let root: string;
  let projectRoot: string;
  let templatesDir: string;
  let docsDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'liimit-scaffold-'));
    projectRoot = path.join(root, '含 空格的项目');
    templatesDir = path.join(root, '模板');
    docsDir = path.join(root, '文档');
    await Promise.all([
      fs.mkdir(projectRoot, { recursive: true }),
      write(path.join(templatesDir, 'core', '.gitignore'), 'dist\n'),
      write(
        path.join(templatesDir, 'core', 'package.json'),
        dependencyManifest(),
      ),
      write(
        path.join(templatesDir, 'core', 'package-lock.json'),
        dependencyLock(),
      ),
      write(path.join(templatesDir, 'core', 'src', 'main.ts'), 'core'),
      write(
        path.join(templatesDir, 'core', 'src', 'gameConfig.json'),
        'core config',
      ),
      write(
        path.join(templatesDir, 'modules', 'platformer', 'src', 'player.ts'),
        'player',
      ),
      write(
        path.join(
          templatesDir,
          'modules',
          'platformer',
          'src',
          'gameConfig.json',
        ),
        'platformer config',
      ),
      write(path.join(docsDir, 'gdd', 'core.md'), 'gdd'),
      write(path.join(docsDir, 'asset_protocol.md'), 'asset'),
      write(path.join(docsDir, 'debug_protocol.md'), 'debug'),
      write(
        path.join(docsDir, 'modules', 'platformer', 'design_rules.md'),
        'rules',
      ),
    ]);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('copies the fixed template and docs without shell commands', async () => {
    const result = await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });

    expect(result).toEqual({ copiedFiles: 10, preservedFiles: 0 });
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'player.ts'), 'utf8'),
    ).resolves.toBe('player');
    await expect(
      fs.readFile(
        path.join(
          projectRoot,
          'docs',
          'modules',
          'platformer',
          'design_rules.md',
        ),
        'utf8',
      ),
    ).resolves.toBe('rules');
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'gameConfig.json'), 'utf8'),
    ).resolves.toBe('platformer config');
  });

  it('rejects a non-platformer archetype before writing any scaffold files', async () => {
    await expect(
      scaffoldGameProject({
        projectRoot,
        templatesDir,
        docsDir,
        archetype: 'top_down' as never,
      }),
    ).rejects.toThrow('脚手架只支持 platformer');

    await expect(fs.readdir(projectRoot)).resolves.toEqual([]);
  });

  it('is repeatable and preserves files already edited by the user', async () => {
    await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });
    await fs.writeFile(path.join(projectRoot, 'src', 'main.ts'), 'user edit');

    const result = await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });

    expect(result).toEqual({ copiedFiles: 0, preservedFiles: 10 });
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'main.ts'), 'utf8'),
    ).resolves.toBe('user edit');
  });

  it('recovers a core-only partial scaffold by applying the platformer overlay', async () => {
    await write(
      path.join(projectRoot, 'src', 'gameConfig.json'),
      'core config',
    );

    const result = await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });

    expect(result).toEqual({ copiedFiles: 10, preservedFiles: 0 });
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'gameConfig.json'), 'utf8'),
    ).resolves.toBe('platformer config');
  });

  it('does not recover over a user-modified core destination', async () => {
    await write(
      path.join(projectRoot, 'src', 'gameConfig.json'),
      'user config edit',
    );

    const result = await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });

    expect(result).toEqual({ copiedFiles: 9, preservedFiles: 1 });
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'gameConfig.json'), 'utf8'),
    ).resolves.toBe('user config edit');
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a symlink in the scaffold corpus',
    async () => {
      const outside = path.join(root, 'outside.txt');
      await fs.writeFile(outside, 'outside');
      await fs.symlink(outside, path.join(templatesDir, 'core', 'unsafe-link'));

      await expect(
        scaffoldGameProject({
          projectRoot,
          templatesDir,
          docsDir,
          archetype: 'platformer',
        }),
      ).rejects.toThrow('不允许符号链接');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a symlinked destination directory instead of writing outside the project',
    async () => {
      const outside = path.join(root, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(projectRoot, 'src'));

      await expect(
        scaffoldGameProject({
          projectRoot,
          templatesDir,
          docsDir,
          archetype: 'platformer',
        }),
      ).rejects.toThrow('不安全的脚手架目录');
      await expect(fs.readdir(outside)).resolves.toEqual([]);
    },
  );

  it('rejects ranged template dependencies before writing scaffold files', async () => {
    await fs.writeFile(
      path.join(templatesDir, 'core', 'package.json'),
      dependencyManifest({ phaser: '^3.90.0' }),
    );

    await expect(
      scaffoldGameProject({
        projectRoot,
        templatesDir,
        docsDir,
        archetype: 'platformer',
      }),
    ).rejects.toThrow('必须固定为精确版本');
    await expect(fs.readdir(projectRoot)).resolves.toEqual([]);
  });

  it('rejects a lockfile that does not match the pinned manifest', async () => {
    await fs.writeFile(
      path.join(templatesDir, 'core', 'package-lock.json'),
      dependencyLock({ phaser: '3.89.0' }),
    );

    await expect(
      scaffoldGameProject({
        projectRoot,
        templatesDir,
        docsDir,
        archetype: 'platformer',
      }),
    ).rejects.toThrow('package-lock.json 与 package.json 不一致');
    await expect(fs.readdir(projectRoot)).resolves.toEqual([]);
  });
});

describe('shipped template dependency contract', () => {
  it('pins every direct dependency and includes a matching npm lockfile', async () => {
    const templateDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../agent-test/templates/core',
    );

    await expect(
      validateTemplateDependencyContract(templateDir),
    ).resolves.toBeUndefined();
  });
});

async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

function buildClassifier(projectRoot: string, gameDescription: string) {
  return new GameTypeClassifierTool({
    getTargetDir: () => projectRoot,
  } as Config).build({ game_description: gameDescription });
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function dependencyManifest(
  dependencies: Record<string, string> = { phaser: '3.90.0' },
): string {
  return JSON.stringify({
    name: 'fixture-game',
    private: true,
    version: '0.0.0',
    dependencies,
    devDependencies: { vite: '6.2.6' },
  });
}

function dependencyLock(
  dependencies: Record<string, string> = { phaser: '3.90.0' },
): string {
  const packages: Record<string, unknown> = {
    '': {
      name: 'fixture-game',
      version: '0.0.0',
      dependencies,
      devDependencies: { vite: '6.2.6' },
    },
    'node_modules/vite': { version: '6.2.6', dev: true },
  };
  for (const [name, version] of Object.entries(dependencies)) {
    packages[`node_modules/${name}`] = { version };
  }
  return JSON.stringify({
    name: 'fixture-game',
    version: '0.0.0',
    lockfileVersion: 3,
    requires: true,
    packages,
  });
}
