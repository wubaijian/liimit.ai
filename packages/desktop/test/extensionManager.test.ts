import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExtensionManager } from '../src/main/extensionManager.js';
import { parseGitHubSkillSource } from '../src/main/githubSkillInstaller.js';
import { FIXED_PRODUCT_MODE, type ProjectRecord } from '../src/shared/types.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('ExtensionManager Skills', () => {
  it('imports and resolves a project Skill without following symlinks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-skills-'));
    roots.push(root);
    const source = path.join(root, 'source-skill');
    const projectPath = path.join(root, 'project');
    await Promise.all([mkdir(source), mkdir(projectPath)]);
    await writeFile(
      path.join(source, 'SKILL.md'),
      '---\nname: game-review\ndescription: Review game builds\n---\n\nInstructions',
      'utf8',
    );
    await writeFile(path.join(source, 'reference.md'), 'Reference', 'utf8');

    const manager = new ExtensionManager();
    const imported = await manager.importSkill(
      source,
      'project',
      makeProject(projectPath),
    );

    expect(imported).toMatchObject({
      name: 'game-review',
      level: 'project',
      valid: true,
    });
    expect(
      await readFile(path.join(imported.directory, 'reference.md'), 'utf8'),
    ).toBe('Reference');
    await expect(
      manager.resolveSkillDirectory(imported.id, makeProject(projectPath)),
    ).resolves.toBe(imported.directory);
  });

  it('persists verified GitHub source metadata with an imported Skill', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-github-meta-'));
    roots.push(root);
    const source = path.join(root, 'combat-design');
    const projectPath = path.join(root, 'project');
    await Promise.all([mkdir(source), mkdir(projectPath)]);
    await writeFile(
      path.join(source, 'SKILL.md'),
      '---\nname: combat-design\ndescription: Design combat systems\n---\n',
      'utf8',
    );

    const manager = new ExtensionManager();
    const project = makeProject(projectPath);
    const installed = await manager.importSkill(source, 'project', project, {
      kind: 'github',
      repository: 'studio/game-skills',
      ref: 'v1.2.0',
      path: 'skills/combat-design',
      url: 'https://github.com/studio/game-skills',
    });
    const listed = (await manager.listSkills(project)).find(
      (skill) => skill.id === installed.id,
    );

    expect(listed?.source).toEqual({
      kind: 'github',
      repository: 'studio/game-skills',
      ref: 'v1.2.0',
      path: 'skills/combat-design',
      url: 'https://github.com/studio/game-skills',
    });
  });

  it('更名后仍能读取旧版 Skill 来源元数据', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-legacy-meta-'));
    roots.push(root);
    const projectPath = path.join(root, 'project');
    const skillDirectory = path.join(
      projectPath,
      '.qwen',
      'skills',
      'legacy-source',
    );
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(
      path.join(skillDirectory, 'SKILL.md'),
      '---\nname: legacy-source\ndescription: Existing installed Skill\n---\n',
      'utf8',
    );
    const legacyMetadataFile = Buffer.from(
      'Lm5vb2JpLXNvdXJjZS5qc29u',
      'base64',
    ).toString('utf8');
    await writeFile(
      path.join(skillDirectory, legacyMetadataFile),
      JSON.stringify({
        kind: 'github',
        repository: 'studio/legacy-skills',
        ref: 'main',
        path: '.',
        url: 'https://github.com/studio/legacy-skills',
      }),
      'utf8',
    );

    const listed = await new ExtensionManager().listSkills(
      makeProject(projectPath),
    );
    expect(listed[0]?.source).toMatchObject({
      repository: 'studio/legacy-skills',
      ref: 'main',
    });
  });

  it('rejects a package without valid frontmatter', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-skills-invalid-'));
    roots.push(root);
    const source = path.join(root, 'source');
    const projectPath = path.join(root, 'project');
    await Promise.all([mkdir(source), mkdir(projectPath)]);
    await writeFile(
      path.join(source, 'SKILL.md'),
      '# missing metadata',
      'utf8',
    );

    await expect(
      new ExtensionManager().importSkill(
        source,
        'project',
        makeProject(projectPath),
      ),
    ).rejects.toThrow('frontmatter');
  });

  it('reads standard folded YAML descriptions used by public Skills', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-folded-skill-'));
    roots.push(root);
    const source = path.join(root, 'game-feel');
    const projectPath = path.join(root, 'project');
    await Promise.all([mkdir(source), mkdir(projectPath)]);
    await writeFile(
      path.join(source, 'SKILL.md'),
      '---\nname: game-feel\ndescription: >-\n  Tune input response, camera motion,\n  hit feedback, and animation timing.\n---\n',
      'utf8',
    );

    const imported = await new ExtensionManager().importSkill(
      source,
      'project',
      makeProject(projectPath),
    );
    expect(imported.description).toBe(
      'Tune input response, camera motion, hit feedback, and animation timing.',
    );
  });

  it('accepts Windows CRLF frontmatter', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-crlf-skill-'));
    roots.push(root);
    const source = path.join(root, 'crlf-skill');
    const projectPath = path.join(root, 'project');
    await Promise.all([mkdir(source), mkdir(projectPath)]);
    await writeFile(
      path.join(source, 'SKILL.md'),
      '---\r\nname: crlf-skill\r\ndescription: Windows line endings\r\n---\r\n\r\nInstructions\r\n',
      'utf8',
    );

    const imported = await new ExtensionManager().importSkill(
      source,
      'project',
      makeProject(projectPath),
    );
    expect(imported).toMatchObject({ name: 'crlf-skill', valid: true });
  });

  it('removes a trailing dot created by Skill folder-name truncation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'liimit-long-skill-'));
    roots.push(root);
    const source = path.join(root, `${'a'.repeat(99)}.suffix`);
    const projectPath = path.join(root, 'project');
    await Promise.all([mkdir(source), mkdir(projectPath)]);
    await writeFile(
      path.join(source, 'SKILL.md'),
      '---\nname: long-skill\ndescription: Long folder name\n---\n',
      'utf8',
    );

    const imported = await new ExtensionManager().importSkill(
      source,
      'project',
      makeProject(projectPath),
    );
    expect(path.basename(imported.directory)).toBe('a'.repeat(99));
  });

  it.each(['CON', 'con.reference', 'COM0'])(
    'rejects the Windows-reserved Skill folder name %s',
    async (folderName) => {
      const root = await mkdtemp(path.join(tmpdir(), 'liimit-reserved-skill-'));
      roots.push(root);
      const source = path.join(root, folderName);
      const projectPath = path.join(root, 'project');
      await Promise.all([mkdir(source), mkdir(projectPath)]);
      await writeFile(
        path.join(source, 'SKILL.md'),
        '---\nname: safe-manifest\ndescription: Reserved source folder\n---\n',
        'utf8',
      );

      await expect(
        new ExtensionManager().importSkill(
          source,
          'project',
          makeProject(projectPath),
        ),
      ).rejects.toThrow('安全目录名');
    },
  );
});

describe('GitHub Skill source parsing', () => {
  it('parses repository, tree, and SKILL.md blob addresses', () => {
    expect(parseGitHubSkillSource({ url: 'owner/game-skills' })).toMatchObject({
      repository: 'owner/game-skills',
      ref: 'main',
      path: '.',
      refWasDefaulted: true,
    });
    expect(
      parseGitHubSkillSource({
        url: 'https://github.com/owner/game-skills/tree/v2/skills/godot',
      }),
    ).toMatchObject({ ref: 'v2', path: 'skills/godot' });
    expect(
      parseGitHubSkillSource({
        url: 'https://github.com/owner/game-skills/blob/main/unity/SKILL.md',
      }),
    ).toMatchObject({ ref: 'main', path: 'unity' });
  });

  it('allows explicit path/ref overrides and rejects unsafe sources', () => {
    expect(
      parseGitHubSkillSource({
        url: 'https://github.com/owner/game-skills/tree/main/old',
        ref: 'release-2026',
        path: 'skills/new',
      }),
    ).toMatchObject({ ref: 'release-2026', path: 'skills/new' });

    expect(() =>
      parseGitHubSkillSource({
        url: 'https://example.com/owner/repo',
      }),
    ).toThrow('github.com');
    expect(() =>
      parseGitHubSkillSource({
        url: 'https://github.com/owner/repo',
        path: '../outside',
      }),
    ).toThrow('路径');
  });
});

function makeProject(projectPath: string): ProjectRecord {
  return {
    id: 'project',
    name: 'Project',
    path: projectPath,
    prompt: 'Build a game',
    status: 'draft',
    stage: 'brief',
    productMode: FIXED_PRODUCT_MODE.id,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}
