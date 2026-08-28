import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { resolveProviderConfig } from '../services/providerConfig.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export type GameArchetype = 'platformer';

export interface GenerateGDDParams {
  /** Raw user's game idea or description. */
  raw_user_requirement: string;
  /** The only supported game archetype. */
  archetype: GameArchetype;
  /** Optional summary of the existing gameConfig.json. */
  config_summary?: string;
}

export interface GDDModelConfig {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature?: number;
  timeout?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message: string;
  };
}

class GenerateGDDInvocation extends BaseToolInvocation<
  GenerateGDDParams,
  ToolResult
> {
  private resolvedModelConfig?: GDDModelConfig;

  constructor(
    private config: Config,
    params: GenerateGDDParams,
    private overrideModelConfig?: GDDModelConfig,
  ) {
    super(params);
  }

  private get modelConfig(): GDDModelConfig {
    if (this.overrideModelConfig) return this.overrideModelConfig;
    if (!this.resolvedModelConfig) {
      this.resolvedModelConfig = GenerateGDDTool.resolveModelConfig(
        this.config,
      );
    }
    return this.resolvedModelConfig;
  }

  getDescription(): string {
    return '为 platformer 生成中文技术 GDD。';
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const systemPrompt = await this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt();
      const result = await this.callModel(systemPrompt, userPrompt, signal);
      const projectRoot = this.config.getProjectRoot();
      const gddPath = path.join(projectRoot, 'GAME_DESIGN.md');
      const docsRoot = path.join(projectRoot, 'docs');
      const response = this.formatResult(result);

      const llmContent = `<gdd-content>
${response}
</gdd-content>

<system-reminder>
GDD 已生成，游戏类型：**platformer**

## 现在保存 GDD
使用 \`write_file\` 把 <gdd-content> 标签之间的内容保存为 \`${gddPath}\`。\`write_file\` 的参数名必须使用 \`file_path\`，值必须是工作区内绝对路径：\`{ "file_path": ${JSON.stringify(gddPath)}, "content": "完整 GDD 内容" }\`。

## 后续步骤（严格按照 GDD Section）

### Phase 3：素材（使用 GDD Section 1）
- 使用 \`read_file\` 的 \`absolute_path\` 参数阅读 \`${path.join(docsRoot, 'asset_protocol.md')}\`
- 使用 **GDD Section 1** 的 Asset Registry 调用 \`generate_game_assets\`
- 使用 Section 4 的 platformer ASCII 地图调用 \`generate_tilemap\`
- 读取 \`${path.join(projectRoot, 'public', 'assets', 'asset-pack.json')}\` 获得真实 texture key
- 创建或更新 \`${path.join(projectRoot, 'public', 'assets', 'animations.json')}\`，并在 asset-pack 中以 \`type: "animation"\` 注册一次；每个 frame key 必须真实存在

### Phase 4：配置（使用 GDD Section 2）
- 把 Section 2 增量合并到已有 \`src/gameConfig.json\`，使用 \`{ "value": X }\` 包装；禁止删除 \`screenSize\`、\`debugConfig\`、\`renderConfig\`

### Phase 5：代码实现（使用 GDD Sections 0、3、5）
- Section 0 提供 scene key：更新 \`LevelManager.ts\` 与 \`main.ts\`
- Section 3 提供实体与场景规格：逐文件实现
- Section 5 是文件级 Roadmap：作为 todo 顺序执行
- 编码前使用绝对路径阅读 Module Manual \`${path.join(docsRoot, 'modules', 'platformer', 'platformer.md')}\` 及所有目标模板源码

### Phase 6：验证
- 阅读 \`${path.join(docsRoot, 'debug_protocol.md')}\`
- 构建、测试，并使用 \`run_shell_command\` 的 \`is_background: true\` 在后台运行开发服务器

不要停止，现在继续 Phase 3。
</system-reminder>`;

      return {
        llmContent,
        returnDisplay: this.formatDisplayOutput(response),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `生成 GDD 失败：${errorMessage}`,
        returnDisplay: `**GDD 生成失败**\n\n错误：${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  /** Combine universal GDD rules with the platformer module contracts. */
  private async buildSystemPrompt(): Promise<string> {
    const projectRoot = this.config.getProjectRoot();
    const docsDir = await this.findDocsDirectory(projectRoot);
    const coreRules = await this.readOptionalDocument(
      docsDir && path.join(docsDir, 'gdd', 'core.md'),
      'core.md',
    );
    const designRules = await this.readOptionalDocument(
      docsDir && path.join(docsDir, 'modules', 'platformer', 'design_rules.md'),
      'platformer/design_rules.md',
    );
    const templateApi = await this.readOptionalDocument(
      docsDir && path.join(docsDir, 'modules', 'platformer', 'template_api.md'),
      'platformer/template_api.md',
    );

    let prompt = `# 中文技术横版平台游戏设计文档生成器

你是一名 Phaser 3 · 2D 横版平台游戏设计工程师。请生成一份**中文 Technical Game Design Document**；每个 Section 都必须直接映射到后续工具输入或代码文件，不能停留在概念描述。

**Archetype**：platformer

**不可协商边界**：游戏必须保持侧视角、Y 轴重力、左右移动与跳跃；不得切换引擎、维度或游戏类型。

**语言规则**：所有说明、表格内容和设计理由使用简体中文；tool name、JSON key、enum、文件名、路径、类名、类型名、函数名、Hook 名与代码标识符保持英文原样。

**核心规则：**
1. **忠实需求**：在横版平台边界内满足用户明确要求，不增加未要求的功能。
2. **Config-First**：数值写入 \`gameConfig.json\`，使用 \`{ "value": X }\` 包装。
3. **零重造基础系统**：只使用 template_api.md 中已有 Behavior 与 Hook。
4. **Hook 完整性**：引用的每个 Hook 必须真实存在于 template_api.md。
5. **增量配置**：Section 2 只输出游戏专用字段；不得覆盖 \`screenSize\`、\`debugConfig\`、\`renderConfig\`。

`;

    prompt += coreRules
      ? `---\n\n## Universal GDD Rules\n\n${coreRules}\n\n`
      : this.getBuiltinCoreRules();
    prompt += designRules
      ? `---\n\n## PLATFORMER Design Guide\n\n${designRules}\n\n`
      : this.getBuiltinPlatformerRules();
    if (templateApi) {
      prompt += `---\n\n## PLATFORMER Template Capabilities\n\n${templateApi}\n\n`;
    }

    return prompt;
  }

  private async findDocsDirectory(projectRoot: string): Promise<string> {
    let searchDir = projectRoot;
    while (searchDir !== path.dirname(searchDir)) {
      const candidate = path.join(searchDir, 'docs');
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        searchDir = path.dirname(searchDir);
      }
    }
    return '';
  }

  private async readOptionalDocument(
    filePath: string,
    label: string,
  ): Promise<string> {
    if (!filePath) return '';
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`[GenerateGDD] Loaded ${label}`);
      return content;
    } catch {
      console.warn(`[GenerateGDD] ${label} not found, using built-in`);
      return '';
    }
  }

  private getBuiltinCoreRules(): string {
    return `---

## Universal GDD Rules (Built-in)

### GDD Structure (6 Sections)
| Section | Title | Downstream Consumer |
|---------|-------|-------------------|
| 0 | Technical Architecture | LevelManager.ts, main.ts |
| 1 | Visual Style & Asset Registry | generate_game_assets tool |
| 2 | Game Configuration | gameConfig.json (MERGE, not replace) |
| 3 | Entity/Scene Architecture | Platformer template files |
| 4 | Level Design | generate_tilemap tool |
| 5 | Implementation Roadmap | File-level task list |

### Asset Table Format
| type | key | description | params |
|------|-----|-------------|--------|
| background | level_bg | [description] | resolution: "1536*1024" |
| animation | player | [SIDE VIEW facing RIGHT] | idle(2), run(2) |
| audio | jump_sfx | [sound description] | audioType: "sfx" |

### Forbidden
- Implementing foundation systems from scratch instead of using the template
- Unspecified numeric values
- Inventing hook names not present in template_api.md

`;
  }

  private getBuiltinPlatformerRules(): string {
    return `---

## Platformer Rules (Built-in)

### Physics
- Gravity: ON (Y-axis), side view, Left/Right + Jump

### Available Behaviors
- PlatformerMovement (walkSpeed, jumpPower; optional: doubleJumpEnabled, coyoteTime, jumpBufferTime)
- MeleeAttack (damage, range, cooldown)
- RangedAttack (damage, projectileKey, projectileSpeed)
- PatrolAI, ChaseAI

### Level Design (ASCII)
- Legend: # = Ground, = = Platform, . = Air, P = Player, E = Enemy, B = Boss, C = Coin
- Entities FALL. Do not place enemies in mid-air.
- Copy from predefined templates A/B/C/D; never invent dimensions or the ground rows.

### Config Schema
\`\`\`json
{
  "playerConfig": {
    "maxHealth": { "value": 100 },
    "walkSpeed": { "value": 360 },
    "jumpPower": { "value": 2400 },
    "gravityY": { "value": 1200 }
  },
  "enemyConfig": {
    "maxHealth": { "value": 50 },
    "walkSpeed": { "value": 80 },
    "damage": { "value": 20 }
  }
}
\`\`\`
All values use the \`{ "value": X, "type": "...", "description": "..." }\` wrapper format.

### Hook Integrity
Every hook name must exist in template_api.md.

`;
  }

  private buildUserPrompt(): string {
    let prompt = `**用户游戏创意**：${this.params.raw_user_requirement}

**Archetype**：platformer

在固定 Phaser 3 · 2D 横版平台边界内，把创意改写为包含 **6 个 Section**（Section 0–5）的中文技术 GDD。所有关键参数、文件、场景 key、素材 key 和数值必须明确，不能让代码 Agent 猜测。

### Section 1 — Asset Registry（素材表）
${this.getAssetGuidance()}

### Section 2 — Game Configuration（配置增量）
后续会 MERGE 到已有 \`src/gameConfig.json\`。这里只写游戏专用字段，不得包含或覆盖 screenSize、debugConfig、renderConfig。

### Section 3 — Entity Architecture (Behavior Composition)
${this.getSection3Guidance()}

### Section 4 — Level Design (ASCII Blueprints)
${this.getSection4Guidance()}`;

    if (this.params.config_summary) {
      prompt += `\n\n**当前配置摘要**：\n${this.params.config_summary}`;
    }
    return prompt;
  }

  private getAssetGuidance(): string {
    return `**Platformer asset rules:**
- Characters: \`type: "animation"\`, SIDE VIEW facing RIGHT, one character per image, frames: \`idle(2), run(2), jump(2), attack_1(2), attack_2(2), die(2)\`
- Backgrounds: \`type: "background"\`, one per level, \`resolution: "1536*1024"\`; no characters or platforms
- Tilesets: \`type: "tileset"\`, \`tileset_size: 3\`
- Projectiles/effects: \`type: "image"\`
- Audio: BGM per level plus SFX for jump, attack, damage, death, coin, victory and ultimate`;
  }

  private getSection3Guidance(): string {
    return `Define every entity with its behavior composition and map it directly to code files.

**Player** (\`src/characters/Player.ts\`):
- Base class: \`BasePlayer\`
- Required behavior: \`PlatformerMovement\`
- Optional behaviors: \`MeleeAttack\`, \`RangedAttack\`, one supported ultimate skill
- Animation keys: idle, walk, jumpUp and jumpDown; add combat keys only when used

**Enemies and Bosses:**
- Base class: \`BaseEnemy\`
- List exact HP, speed, damage, AI type and phase behavior

Use only behaviors and hooks present in the design guide and template API.`;
  }

  private getSection4Guidance(): string {
    return `This section is the direct input to the \`generate_tilemap\` tool.

**Level count:**
- If the user does not specify a count, create one level.
- If the user asks for a few levels, create two or three.
- Otherwise use the requested count.

**ASCII map rules:**
- Copy predefined Template A, B, C or D verbatim.
- Only add or remove coins (C), platforms (=) and at most four enemies (E).
- Never change map dimensions, bottom two rows, player spawn side or exit/boss side.

For every level provide its name, theme, selected template, tileset key, complete ASCII map, exact dimensions and enemy placement.`;
  }

  private async callModel(
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const payload = {
      model: this.modelConfig.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'enabled' },
      temperature: this.modelConfig.temperature ?? 0.7,
      max_tokens: 10000,
      stream: false,
    };

    const response = await fetch(
      `${this.modelConfig.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.modelConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API Request Failed: ${response.status} - ${errorBody}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    if (data.error) {
      throw new Error(`Model API Error: ${data.error.message}`);
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content returned from the model');
    return content;
  }

  private formatResult(result: string): string {
    return result;
  }

  private formatDisplayOutput(result: string): string {
    return `**游戏设计文档已生成**\n\n${result}\n\n---\n\nArchetype：platformer`;
  }
}

export class GenerateGDDTool extends BaseDeclarativeTool<
  GenerateGDDParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.GENERATE_GDD;

  static resolveModelConfig(config?: Config): GDDModelConfig {
    const providers = config?.getOpenGameProviders();
    const resolved = resolveProviderConfig('reasoning', providers);
    return {
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      modelName: resolved.model,
      temperature: 0.5,
      timeout: 60000,
    };
  }

  constructor(
    private config: Config,
    private modelConfig?: GDDModelConfig,
  ) {
    super(
      GenerateGDDTool.Name,
      ToolDisplayNames.GENERATE_GDD,
      '为固定 platformer 模板生成中文技术 GDD；必须在 classify_game_type 与脚手架复制完成后调用。',
      Kind.Think,
      {
        type: 'object',
        properties: {
          raw_user_requirement: {
            type: 'string',
            description: '用户的原始游戏创意或需求描述。',
          },
          archetype: {
            type: 'string',
            description: '固定值 platformer。',
            enum: ['platformer'],
          },
          config_summary: {
            type: 'string',
            description: '可选：已经读取的 gameConfig.json 摘要。',
          },
        },
        required: ['raw_user_requirement', 'archetype'],
      },
      false,
      true,
    );
  }

  override validateToolParams(params: GenerateGDDParams): string | null {
    if ((params as { archetype?: unknown }).archetype !== 'platformer') {
      return 'archetype 只允许 platformer';
    }
    return super.validateToolParams(params);
  }

  protected override validateToolParamValues(
    params: GenerateGDDParams,
  ): string | null {
    if (
      !params.raw_user_requirement ||
      params.raw_user_requirement.trim() === ''
    ) {
      return 'raw_user_requirement 必须是非空字符串';
    }
    return null;
  }

  protected createInvocation(
    params: GenerateGDDParams,
  ): ToolInvocation<GenerateGDDParams, ToolResult> {
    return new GenerateGDDInvocation(this.config, params, this.modelConfig);
  }
}
