import path from 'node:path';

export function verificationWorkflowInstructions(projectRoot: string): string {
  return `\n\n【liimit.ai 验证流程约束：新建和恢复会话均适用】
辅助检查文件只放当前项目内 ${path.join(projectRoot, '.liimit-checks')}，先检查目录不是符号链接；不写 /tmp，不读取应用安装目录。已有项目说明和当前系统规则足够时不要追查安装包。
文件工具报告目录权限错误时，修正为当前项目内路径；不得改用 shell 绕过文件工具的限制。
制作完成后只做必要的数据检查、npm run build 和已有相关测试。不要运行 npm run dev、vite preview、另开服务器或用 curl 检查 /__liimit/*。这些数据入口由桌面应用提供，独立开发服务可能返回 HTML，不代表用户关卡损坏。
检查程序本身出错最多修正一次，仍失败就报告，禁止反复研究引擎/重建测试环境。
完成必要检查后立即给出中文结果并结束本轮，将 Web 入口验证交给 liimit.ai 的受控构建与正式预览服务。平台会核验页面、脚本及关卡/游戏信息数据。
同类工具错误三次或构建通过后五分钟仍不收尾，平台会停止本轮，保留文件与会话。不得自动重试收费服务。
分别说明“内容已写入”“构建/测试结果”“试玩待验证”。入口可读取不代表已经实际玩通，不能声称已完成用户尚未验证的效果。
以上规则不改变用户确认要求，不授予额外修改权限，不允许覆盖用户未授权的内容。\n`;
}

interface Observation {
  id?: string;
  tool?: string;
  input?: unknown;
  text: string;
  isError?: boolean;
}

export interface ToolFailureObservation {
  failed: boolean;
  stop: boolean;
  category?: string;
  count?: number;
  explanation?: string;
}

/** Per-run guard. Ordinary logs/reads must not reset the verification budget. */
export class AgentVerificationGuard {
  private readonly seen = new Set<string>();
  private readonly failures = new Map<string, number>();
  private firstBuildPassedAt: number | undefined;

  observe(result: Observation, now = Date.now()): ToolFailureObservation {
    if (result.id && this.seen.has(result.id))
      return { failed: false, stop: false };
    if (result.id) this.seen.add(result.id);
    const command =
      result.input && typeof result.input === 'object'
        ? String((result.input as { command?: unknown }).command ?? '')
        : '';
    const shell = /shell|run.*command/i.test(result.tool ?? '');
    // Inspect execution output, not source text printed by grep/cat/sed.
    const executes =
      shell &&
      /(?:^|[;&|]\s*|\s)(?:npm|npx|node|python3?|tsc|vitest|vite)\s/.test(
        command,
      );
    // Strip ANSI terminal escapes before examining execution errors.
    // eslint-disable-next-line no-control-regex
    const text = result.text.replace(/\u001b\[[0-9;]*m/g, '');
    const commandFailed =
      executes &&
      (/(?:^|\n)\s*(?:TypeError|ReferenceError|SyntaxError|RangeError):[^\n]+\n\s+at\s/.test(
        text,
      ) ||
        /(?:^|\n)\s*Exit Code:\s*(?!0(?:\s|$))\d+/.test(text) ||
        /(?:^|\n).*error TS\d+:/.test(text) ||
        /(?:^|\n)\s*(?:Test Files|Tests)\s+\d+ failed\b/.test(text) ||
        /(?:^|\n)\s*(?:npm ERR!|error during build:|Traceback \(most recent call last\):)/.test(
          text,
        ));
    const failed = Boolean(result.isError || commandFailed);
    if (!failed) {
      if (
        executes &&
        /\b(?:npm run build|vite build)\b/.test(command) &&
        /(?:✓\s*)?built in\s+[\d.]+\s*(?:ms|s)/.test(text)
      )
        this.firstBuildPassedAt ??= now;
      return { failed: false, stop: false };
    }
    const workspace =
      /File path must be within|outside (?:the )?workspace|outside.*project.*directory/i.test(
        text,
      );
    const category = workspace
      ? 'workspace'
      : shell
        ? 'command'
        : `tool:${result.tool ?? 'unknown'}`;
    const count = (this.failures.get(category) ?? 0) + 1;
    this.failures.set(category, count);
    const explanation = workspace
      ? 'AI 尝试读写项目范围以外的文件，被安全限制拦截；应使用当前项目内的辅助文件，不应绕过限制。'
      : shell
        ? '检查命令执行失败，可能是检查程序、构建或测试报错；这不等于整个游戏都没有生成。'
        : '工具返回失败，本轮尚不能确认相关操作完成。';
    return { failed: true, stop: count >= 3, category, count, explanation };
  }

  inspect(now = Date.now(), generatingAssets = false): string | undefined {
    if (
      !generatingAssets &&
      this.firstBuildPassedAt !== undefined &&
      now - this.firstBuildPassedAt >= 5 * 60_000
    )
      return '构建通过后已持续检查超过 5 分钟，仍未结束本轮。为避免反复检查继续消耗 API，已停止本轮；已有文件和会话保留，实际试玩尚未确认。';
    return undefined;
  }
}
