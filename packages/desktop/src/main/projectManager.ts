import { createReadStream, type Stats } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { verificationWorkflowInstructions } from './agentVerificationGuard.js';
import { parseGameInfo } from '../shared/gameInfo.js';
import { parseLevelCampaign } from '../shared/levelCampaign.js';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import {
  FIXED_PRODUCT_MODE,
  STARTER_PREPARATION_SCHEMA_VERSION,
  isFixedProductMode,
  type CreateProjectInput,
  type FileContent,
  type FileNode,
  type ProjectRecord,
} from '../shared/types.js';
import type { StateStore } from './store.js';
import {
  FixedProjectProvisioner,
  type FixedProjectPreparationReporter,
  type FixedProjectProvisionResult,
} from './fixedProjectProvisioner.js';
import { LevelDocumentStore } from './levelDocumentStore.js';

const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.cache',
  'coverage',
]);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TREE_ENTRIES = 1500;
const PREVIEW_CLOSE_TIMEOUT_MS = 2_000;
const PREVIEW_PROBE_TIMEOUT_MS = 10_000;
const MAX_PREVIEW_HTML_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_ENTRY_JS_BYTES = 32 * 1024 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
};

const NOT_FOUND_CODES = new Set(['ENOENT', 'ENOTDIR']);
const INVALID_PROJECT_PATH_CODES = new Set([
  'EINVAL',
  'ENAMETOOLONG',
  'ERR_INVALID_ARG_TYPE',
  'ERR_INVALID_ARG_VALUE',
]);
const PROJECT_PATH_PERMISSION_CODES = new Set(['EACCES', 'EPERM']);
const PROMPT_JSON_FENCE = /(```json[^\S\r\n]*\r?\n)([\s\S]*?)(\r?\n```)/g;
const PROMPT_PLACEHOLDER =
  /(\{(?:TEMPLATES_DIR|DOCS_DIR|PROJECT_ROOT)\})(\/?)/g;
const PROMPT_JSON_PATH =
  /^(\{(?:TEMPLATES_DIR|DOCS_DIR|PROJECT_ROOT)\})(?:\/(.*))?$/;
const FIXED_PRODUCT_MODE_SYSTEM_GUARD = [
  '',
  '---',
  '',
  '## 不可协商的固定产品边界',
  '',
  `- 本项目固定为 ${FIXED_PRODUCT_MODE.engine} · ${FIXED_PRODUCT_MODE.dimension} · ${FIXED_PRODUCT_MODE.archetype}（横版平台跳跃）游戏。`,
  '- 只允许构建为可在 liimit.ai 应用内 Web 浏览器试玩的 Web 游戏。',
  '- 不得切换到其他游戏引擎。',
  '- 不得切换到其他游戏类型或 archetype，也不得改为 3D 或外部运行目标。',
].join('\n');

type PromptPlaceholder = '{TEMPLATES_DIR}' | '{DOCS_DIR}' | '{PROJECT_ROOT}';
type PreviewServer = { server: Server; url: string };

export interface GameSkillLocations {
  promptPath: string;
  templatesDir: string;
  docsDir: string;
}

export interface ProjectManagerOptions {
  fixedProjectProvisioner?: Pick<FixedProjectProvisioner, 'prepare' | 'build'>;
}

function assertFixedProject(project: Pick<ProjectRecord, 'productMode'>): void {
  if (!isFixedProductMode(project)) {
    throw new Error('只允许操作 Phaser 3 · 2D 横版平台项目。');
  }
}

export function mapProjectCreationError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error));

  const code = (error as NodeJS.ErrnoException).code;
  if (code && INVALID_PROJECT_PATH_CODES.has(code)) {
    return new Error('项目保存路径无效，请重新选择一个有效文件夹。', {
      cause: error,
    });
  }
  if (code === 'EEXIST' || code === 'ENOTDIR') {
    return new Error('项目保存位置不是文件夹，请重新选择一个文件夹。', {
      cause: error,
    });
  }
  if (code && PROJECT_PATH_PERMISSION_CODES.has(code)) {
    return new Error(
      '没有权限写入项目保存位置，请选择可写文件夹或调整目录权限后重试。',
      { cause: error },
    );
  }
  if (code === 'EROFS') {
    return new Error('项目保存位置位于只读文件系统，请选择可写文件夹后重试。', {
      cause: error,
    });
  }
  if (code === 'ENOSPC' || code === 'EDQUOT') {
    return new Error(
      '项目保存位置空间不足，请释放空间或选择其他文件夹后重试。',
      { cause: error },
    );
  }

  return error;
}

export class ProjectManager {
  private previews = new Map<string, PreviewServer>();
  private previewStartQueues = new Map<string, Promise<void>>();
  private readonly levelDocuments = new LevelDocumentStore();
  private readonly fixedProjectProvisioner: Pick<
    FixedProjectProvisioner,
    'prepare' | 'build'
  >;

  constructor(
    private readonly store: StateStore,
    private readonly locations: GameSkillLocations,
    options: ProjectManagerOptions = {},
  ) {
    this.fixedProjectProvisioner =
      options.fixedProjectProvisioner ??
      new FixedProjectProvisioner({
        templatesDir: locations.templatesDir,
        docsDir: locations.docsDir,
      });
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const name = input.name.trim();
    const prompt = input.prompt.trim();
    if (!name) throw new Error('请输入项目名称。');
    if (!prompt) throw new Error('请输入游戏创意。');
    if (!input.directory.trim()) throw new Error('请选择项目保存目录。');

    const folderName = name
      .normalize('NFKC')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\p{Cc}/gu, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      .replace(/[. ]+$/g, '');
    if (
      !folderName ||
      folderName === '.' ||
      folderName === '..' ||
      isWindowsReservedBasename(folderName)
    ) {
      throw new Error('项目名称无法生成安全的目录名，请更换名称。');
    }

    let project: ProjectRecord;
    try {
      project = await this.createProjectFiles({
        directory: input.directory.trim(),
        folderName,
        name,
        prompt,
        starterTemplateId: input.starterTemplateId,
        creationMode: input.creationMode,
      });
    } catch (error) {
      throw mapProjectCreationError(error);
    }

    try {
      await this.store.upsertProject(project);
    } catch (error) {
      const canRetryWithSameName = await this.cleanupCreatedProjectFiles(
        project.path,
      );
      throw new Error(
        canRetryWithSameName
          ? '项目记录保存失败，本次初始化文件已清理。请检查应用数据目录权限或可用空间后，使用相同项目名称重试。'
          : `项目记录保存失败，且项目目录中仍有文件。请检查“${project.path}”，保留需要的内容后清理该目录，或使用其他项目名称重试。`,
        { cause: error },
      );
    }
    return project;
  }

  private async createProjectFiles(input: {
    directory: string;
    folderName: string;
    name: string;
    prompt: string;
    starterTemplateId?: CreateProjectInput['starterTemplateId'];
    creationMode?: CreateProjectInput['creationMode'];
  }): Promise<ProjectRecord> {
    const requestedWorkspace = path.resolve(input.directory);
    await mkdir(requestedWorkspace, { recursive: true });
    const workspaceRoot = await realpath(requestedWorkspace);
    const workspaceInfo = await lstat(workspaceRoot);
    if (!workspaceInfo.isDirectory()) {
      throw new Error('项目保存位置不是文件夹，请重新选择一个文件夹。');
    }

    const requestedProjectPath = path.resolve(workspaceRoot, input.folderName);
    this.assertContained(workspaceRoot, requestedProjectPath, false);
    const projectPath = await this.prepareEmptyProjectDirectory(
      workspaceRoot,
      requestedProjectPath,
    );

    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: randomUUID(),
      name: input.name,
      path: projectPath,
      prompt: input.prompt,
      creationMode: input.creationMode ?? 'template',
      ...(input.creationMode === 'ai'
        ? { initialGeneration: 'pending' as const }
        : {}),
      status: 'draft',
      stage: 'brief',
      productMode: FIXED_PRODUCT_MODE.id,
      starterTemplateId:
        input.creationMode === 'ai'
          ? 'ai-foundation'
          : (input.starterTemplateId ?? 'platformer-base'),
      createdAt: now,
      updatedAt: now,
      starterPreparation: {
        schemaVersion: STARTER_PREPARATION_SCHEMA_VERSION,
        status: 'queued',
        phase: 'queued',
        attempt: 1,
        revision: 0,
        message: '基础游戏已排队，等待准备。',
      },
    };

    await this.prepareSystemPrompt(projectPath, project);

    const gameAgentDir = await this.ensureDirectoryInside(
      projectPath,
      '.gameagent',
    );
    const projectMetadataPath = path.join(gameAgentDir, 'project.json');
    await this.assertSafeWritableFile(projectPath, projectMetadataPath);
    await writeFile(
      projectMetadataPath,
      JSON.stringify(project, null, 2),
      'utf8',
    );
    return project;
  }

  async prepareSystemPrompt(
    projectPath: string,
    project: Pick<ProjectRecord, 'productMode' | 'starterTemplateId'>,
  ): Promise<void> {
    assertFixedProject(project);
    const projectRoot = await this.resolveProjectRoot(projectPath);
    const source = await readFile(this.locations.promptPath, 'utf8');
    let localized = localizeSystemPrompt(source, {
      '{TEMPLATES_DIR}': this.locations.templatesDir,
      '{DOCS_DIR}': this.locations.docsDir,
      '{PROJECT_ROOT}': projectRoot,
    });
    localized += FIXED_PRODUCT_MODE_SYSTEM_GUARD;
    if (project.starterTemplateId === 'ai-foundation') {
      localized += `\n\n## AI 自主创建流程（优先于上文固定模板阶段）\n本项目仅复用 Phaser 引擎与编辑、保存、试玩基础能力，没有现成游戏。先读 src/AI_CREATION.md。不要复制示例关卡和美术，不必调用 classify_game_type 或 generate_gdd；不要先搭建或修复测试框架。首次创建应先按用户要求写 src/levels.json、src/level.json、src/gameInfo.json、src/visualStyle.json，再验证。待 AI 创建的校准工作区不算交付。后续修改保留用户已有内容并遵守修改确认机制。能力不足或需求歧义须明确询问，不得悄悄换成现成游戏。\n`;
    }
    localized += verificationWorkflowInstructions(projectRoot);
    const qwenDir = await this.ensureDirectoryInside(projectRoot, '.qwen');
    const systemPromptPath = path.join(qwenDir, 'system.md');
    await this.assertSafeWritableFile(projectRoot, systemPromptPath);
    await writeFile(systemPromptPath, localized, 'utf8');
  }

  async prepareFixedProject(
    project: ProjectRecord,
    signal?: AbortSignal,
    reportPhase?: FixedProjectPreparationReporter,
  ): Promise<FixedProjectProvisionResult> {
    assertFixedProject(project);
    const projectRoot = await this.resolveProjectRoot(project.path);
    if (!reportPhase) {
      if (!project.starterTemplateId) {
        return this.fixedProjectProvisioner.prepare(projectRoot, signal);
      }
      return this.fixedProjectProvisioner.prepare(
        projectRoot,
        signal,
        undefined,
        project.starterTemplateId,
      );
    }
    if (!project.starterTemplateId) {
      return this.fixedProjectProvisioner.prepare(
        projectRoot,
        signal,
        reportPhase,
      );
    }
    return this.fixedProjectProvisioner.prepare(
      projectRoot,
      signal,
      reportPhase,
      project.starterTemplateId,
    );
  }

  async buildFixedProject(
    project: ProjectRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    assertFixedProject(project);
    const projectRoot = await this.resolveProjectRoot(project.path);
    await this.fixedProjectProvisioner.build(projectRoot, signal);
  }

  async listFiles(project: ProjectRecord): Promise<FileNode[]> {
    assertFixedProject(project);
    const projectRoot = await this.resolveProjectRoot(project.path);
    let count = 0;
    const walk = async (directory: string): Promise<FileNode[]> => {
      const entries = await readdir(directory, { withFileTypes: true });
      const result: FileNode[] = [];
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (count >= MAX_TREE_ENTRIES) break;
        if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
        count++;
        const absolutePath = path.join(directory, entry.name);
        const entryInfo = await lstat(absolutePath);
        if (entryInfo.isSymbolicLink()) continue;
        const realEntryPath = await realpath(absolutePath);
        this.assertContained(projectRoot, realEntryPath);
        const relativePath = path.relative(projectRoot, realEntryPath);
        if (entryInfo.isDirectory()) {
          result.push({
            name: entry.name,
            path: relativePath,
            type: 'directory',
            children: await walk(realEntryPath),
          });
        } else if (entryInfo.isFile()) {
          result.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            size: entryInfo.size,
          });
        }
      }
      return result;
    };

    return walk(projectRoot);
  }

  async readProjectFile(
    project: ProjectRecord,
    relativePath: string,
  ): Promise<FileContent> {
    assertFixedProject(project);
    const { absolutePath, info } = await this.resolveExistingInside(
      project.path,
      relativePath,
    );
    if (!info.isFile()) throw new Error('只能读取文件。');
    const handle = await open(absolutePath, 'r');
    const buffer = Buffer.allocUnsafe(MAX_FILE_BYTES + 1);
    let bytesRead: number;
    try {
      ({ bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0));
    } finally {
      await handle.close();
    }
    const truncated = bytesRead > MAX_FILE_BYTES;
    return {
      path: relativePath,
      content: buffer
        .subarray(0, Math.min(bytesRead, MAX_FILE_BYTES))
        .toString('utf8'),
      truncated,
    };
  }

  async startPreview(project: ProjectRecord): Promise<string> {
    const previousStart = this.previewStartQueues.get(project.id);
    const operation = (previousStart ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => this.replacePreview(project));
    const settled = operation.then(
      () => undefined,
      () => undefined,
    );
    this.previewStartQueues.set(project.id, settled);
    try {
      return await operation;
    } finally {
      if (this.previewStartQueues.get(project.id) === settled) {
        this.previewStartQueues.delete(project.id);
      }
    }
  }

  private async replacePreview(project: ProjectRecord): Promise<string> {
    const preview = await this.createPreviewServer(project);
    const previous = this.previews.get(project.id);
    this.previews.set(project.id, preview);
    if (previous) await this.closePreviewServer(previous.server);
    return preview.url;
  }

  async verifyPlayableBuild(
    project: ProjectRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    const probe = await this.createPreviewServer(project);
    try {
      const response = await fetch(probe.url, {
        method: 'GET',
        headers: { Accept: 'text/html' },
        signal: previewProbeSignal(signal),
      });
      if (!response.ok) {
        throw new Error(
          `本地 Web 试玩入口无法安全读取（HTTP ${response.status}）。`,
        );
      }
      const contentType =
        response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.startsWith('text/html')) {
        throw new Error('本地 Web 试玩入口不是有效的 HTML 页面。');
      }
      const html = await readBoundedResponseText(
        response,
        MAX_PREVIEW_HTML_BYTES,
        'HTML 入口',
      );
      if (!html.trim()) {
        throw new Error('本地 Web 试玩入口不是有效的 HTML 页面：内容为空。');
      }
      const htmlEntry = inspectPlayableHtml(html, probe.url);
      if (!htmlEntry.hasGameContainer) {
        throw new Error(
          '本地 Web 试玩入口不是有效的 HTML 游戏页面：缺少 #game-container。',
        );
      }

      const entryScript = htmlEntry.moduleScript;
      if (!entryScript) {
        throw new Error(
          '本地 Web 试玩入口不是有效的 HTML 游戏页面：缺少本地 type="module" 入口脚本。',
        );
      }

      const scriptResponse = await fetch(entryScript, {
        method: 'GET',
        headers: { Accept: 'text/javascript, application/javascript' },
        signal: previewProbeSignal(signal),
      });
      if (!scriptResponse.ok) {
        throw new Error(
          `本地 Web 试玩入口脚本无法安全读取（HTTP ${scriptResponse.status}）。`,
        );
      }
      const scriptContentType =
        scriptResponse.headers.get('content-type')?.toLowerCase() ?? '';
      if (!isJavaScriptContentType(scriptContentType)) {
        throw new Error('本地 Web 试玩入口脚本不是 JavaScript 响应。');
      }
      const script = await readBoundedResponseText(
        scriptResponse,
        MAX_PREVIEW_ENTRY_JS_BYTES,
        'JavaScript 入口',
      );
      if (!script.trim() || /^\s*(?:<!doctype\s+html|<html\b)/i.test(script)) {
        throw new Error('本地 Web 试玩入口脚本不是有效的 JavaScript。');
      }
      for (const endpoint of ['levels', 'game-info'] as const) {
        const dataResponse = await fetch(
          new URL(`/__liimit/${endpoint}.json`, probe.url),
          {
            headers: { Accept: 'application/json' },
            signal: previewProbeSignal(signal),
          },
        );
        if (
          !dataResponse.ok ||
          !dataResponse.headers
            .get('content-type')
            ?.toLowerCase()
            .startsWith('application/json')
        )
          throw new Error(
            `正式试玩数据 ${endpoint} 读取失败或不是 JSON（HTTP ${dataResponse.status}）。`,
          );
        const body = await readBoundedResponseText(
          dataResponse,
          MAX_PREVIEW_HTML_BYTES,
          `试玩数据 ${endpoint}`,
        );
        let data: unknown;
        try {
          data = JSON.parse(body);
        } catch {
          throw new Error(`正式试玩数据 ${endpoint} 不是有效 JSON。`);
        }
        try {
          if (endpoint === 'levels') parseLevelCampaign(data);
          else parseGameInfo(data);
        } catch {
          throw new Error(`正式试玩数据 ${endpoint} 结构不完整。`);
        }
      }
    } finally {
      await this.closePreviewServer(probe.server);
    }
  }

  stopAllPreviews(): void {
    for (const { server } of this.previews.values()) {
      server.closeAllConnections?.();
      server.close();
    }
    this.previews.clear();
  }

  get locationsInfo(): GameSkillLocations {
    return this.locations;
  }

  private async createPreviewServer(
    project: ProjectRecord,
  ): Promise<PreviewServer> {
    assertFixedProject(project);
    let distResult: { absolutePath: string; info: Stats };
    try {
      distResult = await this.resolveExistingInside(project.path, 'dist');
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('游戏构建产物 dist/index.html 不存在，请先完成构建。');
      }
      throw error;
    }
    const { absolutePath: serveRoot, info: distInfo } = distResult;
    if (!distInfo.isDirectory()) throw new Error('游戏构建目录 dist 不存在。');
    let indexInfo: Stats;
    try {
      ({ info: indexInfo } = await this.resolveExistingInside(
        serveRoot,
        'index.html',
      ));
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('游戏构建产物 dist/index.html 不存在，请先完成构建。');
      }
      throw error;
    }
    if (!indexInfo.isFile())
      throw new Error('游戏构建产物 dist/index.html 不存在。');

    const server = createServer(async (request, response) => {
      try {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405, {
            Allow: 'GET, HEAD',
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end('Method Not Allowed');
          return;
        }

        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
        const decodedPath = decodeURIComponent(requestUrl.pathname);
        if (decodedPath === '/__liimit/level.json') {
          const payload = Buffer.from(
            JSON.stringify(await this.levelDocuments.read(project)),
            'utf8',
          );
          response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payload.byteLength,
            'Cache-Control': 'no-store',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
          });
          response.end(request.method === 'HEAD' ? undefined : payload);
          return;
        }
        if (decodedPath === '/__liimit/levels.json') {
          const payload = Buffer.from(
            JSON.stringify(await this.levelDocuments.readCampaign(project)),
            'utf8',
          );
          response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payload.byteLength,
            'Cache-Control': 'no-store',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
          });
          response.end(request.method === 'HEAD' ? undefined : payload);
          return;
        }
        if (decodedPath === '/__liimit/game-info.json') {
          const payload = Buffer.from(
            JSON.stringify(await this.levelDocuments.readGameInfo(project)),
            'utf8',
          );
          response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payload.byteLength,
            'Cache-Control': 'no-store',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
          });
          response.end(request.method === 'HEAD' ? undefined : payload);
          return;
        }
        const relativePath =
          decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
        let resolvedFile: { absolutePath: string; info: Stats };
        try {
          resolvedFile = await this.resolveExistingInside(
            serveRoot,
            relativePath,
          );
          if (resolvedFile.info.isDirectory()) {
            resolvedFile = await this.resolveExistingInside(
              resolvedFile.absolutePath,
              'index.html',
            );
          }
          if (!resolvedFile.info.isFile())
            throw new Error('预览目标不是文件。');
        } catch (error) {
          if (!isHtmlNavigation(request) || !isNotFoundError(error))
            throw error;
          resolvedFile = await this.resolveExistingInside(
            serveRoot,
            'index.html',
          );
        }

        response.writeHead(200, {
          'Content-Type':
            MIME[path.extname(resolvedFile.absolutePath).toLowerCase()] ??
            'application/octet-stream',
          'Content-Length': resolvedFile.info.size,
          'Cache-Control': 'no-cache',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        const stream = createReadStream(resolvedFile.absolutePath);
        stream.once('error', () => response.destroy());
        response.once('close', () => stream.destroy());
        stream.pipe(response);
      } catch {
        response.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end('预览文件不存在');
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('无法创建预览服务。');
    const url = `http://127.0.0.1:${address.port}/`;
    return { server, url };
  }

  private async cleanupCreatedProjectFiles(
    projectPath: string,
  ): Promise<boolean> {
    const projectRoot = await this.resolveProjectRoot(projectPath).catch(
      () => undefined,
    );
    if (!projectRoot) return false;

    for (const relativePath of [
      path.join('.qwen', 'system.md'),
      path.join('.gameagent', 'project.json'),
    ]) {
      await this.removeCreatedProjectFile(projectRoot, relativePath);
    }

    for (const relativePath of ['.qwen', '.gameagent']) {
      await this.removeEmptyCreatedDirectory(projectRoot, relativePath);
    }

    try {
      return (await readdir(projectRoot)).length === 0;
    } catch {
      return false;
    }
  }

  private async removeCreatedProjectFile(
    projectRoot: string,
    relativePath: string,
  ): Promise<void> {
    try {
      const { absolutePath, info } = await this.resolveExistingInside(
        projectRoot,
        relativePath,
      );
      if (!info.isFile()) return;
      await unlink(absolutePath);
    } catch {
      // Cleanup is best-effort and must never hide the Store persistence error.
    }
  }

  private async removeEmptyCreatedDirectory(
    projectRoot: string,
    relativePath: string,
  ): Promise<void> {
    try {
      const { absolutePath, info } = await this.resolveExistingInside(
        projectRoot,
        relativePath,
      );
      if (!info.isDirectory()) return;
      // rmdir is intentionally non-recursive: unrelated user files survive.
      await rmdir(absolutePath);
    } catch {
      // Missing, non-empty or concurrently changed directories are preserved.
    }
  }

  private async prepareEmptyProjectDirectory(
    workspaceRoot: string,
    requestedProjectPath: string,
  ): Promise<string> {
    try {
      await mkdir(requestedProjectPath);
    } catch (error) {
      if (!isErrorCode(error, 'EEXIST')) throw error;
    }

    const info = await lstat(requestedProjectPath);
    if (info.isSymbolicLink()) throw new Error('项目目录不能是符号链接。');
    if (!info.isDirectory()) throw new Error('同名路径已存在，且不是目录。');

    const projectRoot = await realpath(requestedProjectPath);
    this.assertContained(workspaceRoot, projectRoot, false);
    if ((await readdir(projectRoot)).length > 0) {
      throw new Error('同名项目目录已存在且不是空目录，请更换项目名称。');
    }
    return projectRoot;
  }

  private async ensureDirectoryInside(
    root: string,
    relativePath: string,
  ): Promise<string> {
    const rootPath = await this.resolveProjectRoot(root);
    const directoryPath = this.resolveInside(rootPath, relativePath);
    try {
      await mkdir(directoryPath);
    } catch (error) {
      if (!isErrorCode(error, 'EEXIST')) throw error;
    }

    const info = await lstat(directoryPath);
    if (info.isSymbolicLink()) throw new Error('项目内目录不能是符号链接。');
    if (!info.isDirectory()) throw new Error('项目内目标路径不是目录。');
    const realDirectoryPath = await realpath(directoryPath);
    this.assertContained(rootPath, realDirectoryPath);
    return realDirectoryPath;
  }

  private async assertSafeWritableFile(
    root: string,
    filePath: string,
  ): Promise<void> {
    this.assertContained(root, filePath);
    try {
      const info = await lstat(filePath);
      if (info.isSymbolicLink()) throw new Error('项目内文件不能是符号链接。');
      if (!info.isFile()) throw new Error('项目内目标路径不是文件。');
      const realFilePath = await realpath(filePath);
      this.assertContained(root, realFilePath);
    } catch (error) {
      if (!isErrorCode(error, 'ENOENT')) throw error;
    }
  }

  private async resolveProjectRoot(root: string): Promise<string> {
    const resolvedRoot = path.resolve(root);
    let info: Stats;
    try {
      info = await lstat(resolvedRoot);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error('项目目录不存在，可能已被移动或删除。', {
          cause: error,
        });
      }
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error('项目目录不能是符号链接。');
    if (!info.isDirectory()) throw new Error('项目路径不是目录。');
    return realpath(resolvedRoot);
  }

  private async resolveExistingInside(
    root: string,
    relativePath: string,
  ): Promise<{ absolutePath: string; info: Stats }> {
    const realRoot = await this.resolveProjectRoot(root);
    const lexicalPath = this.resolveInside(path.resolve(root), relativePath);
    const info = await lstat(lexicalPath);
    if (info.isSymbolicLink())
      throw new Error('不允许通过符号链接访问项目文件。');
    const absolutePath = await realpath(lexicalPath);
    this.assertContained(realRoot, absolutePath);
    return { absolutePath, info };
  }

  async stopPreview(projectId: string): Promise<void> {
    const active = this.previews.get(projectId);
    if (!active) return;
    this.previews.delete(projectId);
    await this.closePreviewServer(active.server);
  }

  private async closePreviewServer(server: Server): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };

      const timeout = setTimeout(() => {
        server.closeAllConnections?.();
        finish();
      }, PREVIEW_CLOSE_TIMEOUT_MS);
      timeout.unref();

      try {
        server.close(finish);
        server.closeAllConnections?.();
      } catch {
        finish();
      }
    });
  }

  private resolveInside(root: string, relativePath: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, relativePath);
    this.assertContained(resolvedRoot, resolved);
    return resolved;
  }

  private assertContained(
    root: string,
    target: string,
    allowRoot = true,
  ): void {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    if (
      (!allowRoot && relative === '') ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('路径超出项目目录。');
    }
  }
}

function localizeSystemPrompt(
  source: string,
  replacements: Record<PromptPlaceholder, string>,
): string {
  const localizedJson = source.replace(
    PROMPT_JSON_FENCE,
    (_match, opening: string, json: string, closing: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json) as unknown;
      } catch (error) {
        throw new Error('系统提示词中的 fenced JSON 示例无效。', {
          cause: error,
        });
      }
      const body = JSON.stringify(
        localizePromptJsonValue(parsed, replacements),
        null,
        2,
      );
      if (body === undefined) {
        throw new Error('系统提示词中的 fenced JSON 示例无法序列化。');
      }
      return `${opening}${body}${closing}`;
    },
  );

  return replacePromptPlaceholders(
    localizedJson,
    replacements,
    (value) => value,
  );
}

function localizePromptJsonValue(
  value: unknown,
  replacements: Record<PromptPlaceholder, string>,
): unknown {
  if (typeof value === 'string') {
    const pathMatch = PROMPT_JSON_PATH.exec(value);
    if (pathMatch) {
      const placeholder = pathMatch[1] as PromptPlaceholder;
      const suffix = pathMatch[2];
      return suffix
        ? path.join(
            replacements[placeholder],
            ...suffix.split('/').filter(Boolean),
          )
        : replacements[placeholder];
    }
    return replacePromptPlaceholders(value, replacements, (item) => item);
  }
  if (Array.isArray(value)) {
    return value.map((item) => localizePromptJsonValue(item, replacements));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        localizePromptJsonValue(item, replacements),
      ]),
    );
  }
  return value;
}

function replacePromptPlaceholders(
  source: string,
  replacements: Record<PromptPlaceholder, string>,
  encode: (value: string) => string,
): string {
  return source.replace(
    PROMPT_PLACEHOLDER,
    (_match, placeholder: PromptPlaceholder, trailingSlash: string) => {
      const value = replacements[placeholder];
      const localizedPath = trailingSlash
        ? `${value.replace(/[\\/]+$/, '')}${path.sep}`
        : value;
      return encode(localizedPath);
    },
  );
}

function isWindowsReservedBasename(value: string): boolean {
  const stem = value.split('.')[0]?.toUpperCase() ?? '';
  return /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/.test(stem);
}

function isHtmlNavigation(request: IncomingMessage): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (request.headers['sec-fetch-mode'] === 'navigate') return true;
  return (request.headers.accept ?? '')
    .split(',')
    .some((value) => value.trim().toLowerCase().startsWith('text/html'));
}

function previewProbeSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PREVIEW_PROBE_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw previewSizeLimitError(label, maxBytes);
    }
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw previewSizeLimitError(label, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

function previewSizeLimitError(label: string, maxBytes: number): Error {
  const mebibytes = maxBytes / (1024 * 1024);
  return new Error(`${label}超过安全大小上限（${mebibytes} MiB）。`);
}

type HtmlElement = DefaultTreeAdapterMap['element'];
type HtmlNode = DefaultTreeAdapterMap['node'];

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function inspectPlayableHtml(
  html: string,
  previewUrl: string,
): { hasGameContainer: boolean; moduleScript?: URL } {
  const preview = new URL(previewUrl);
  const elements = htmlDocumentElements(html);
  const hasGameContainer = elements.some(
    (element) =>
      element.tagName === 'div' &&
      readElementAttribute(element, 'id') === 'game-container',
  );
  const documentBase = findHtmlBaseUrl(elements, preview) ?? preview;
  for (const element of elements) {
    if (element.tagName !== 'script') continue;
    if (
      readElementAttribute(element, 'type')?.trim().toLowerCase() !== 'module'
    ) {
      continue;
    }
    const sourceAttribute = readElementAttribute(element, 'src')?.trim();
    if (!sourceAttribute) continue;
    let candidate: URL;
    try {
      candidate = new URL(sourceAttribute, documentBase);
    } catch {
      continue;
    }
    if (
      candidate.protocol === preview.protocol &&
      candidate.origin === preview.origin &&
      !candidate.username &&
      !candidate.password
    ) {
      return { hasGameContainer, moduleScript: candidate };
    }
  }
  return { hasGameContainer };
}

function htmlDocumentElements(html: string): HtmlElement[] {
  const document = parse(html);
  const elements: HtmlElement[] = [];
  const visit = (node: HtmlNode): void => {
    if ('tagName' in node) {
      if (node.namespaceURI === HTML_NAMESPACE) elements.push(node);
      // Template contents are inert and live in `content`, not `childNodes`.
      if (node.tagName === 'template') return;
    }
    if ('childNodes' in node) {
      for (const child of node.childNodes) visit(child);
    }
  };
  visit(document);
  return elements;
}

function findHtmlBaseUrl(
  elements: HtmlElement[],
  previewUrl: URL,
): URL | undefined {
  for (const element of elements) {
    if (element.tagName !== 'base') continue;
    const href = readElementAttribute(element, 'href')?.trim();
    if (!href) continue;
    try {
      return new URL(href, previewUrl);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readElementAttribute(
  element: HtmlElement,
  name: string,
): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function isJavaScriptContentType(contentType: string): boolean {
  const mime = contentType.split(';', 1)[0]?.trim();
  return (
    mime === 'text/javascript' ||
    mime === 'application/javascript' ||
    mime === 'text/ecmascript' ||
    mime === 'application/ecmascript'
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    NOT_FOUND_CODES.has((error as NodeJS.ErrnoException).code!)
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === code
  );
}
