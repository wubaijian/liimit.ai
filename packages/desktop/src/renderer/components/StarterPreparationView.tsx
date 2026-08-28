import { LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { StarterPreparation } from '../../shared/types';

const PHASE_LABELS: Record<StarterPreparation['phase'], string> = {
  queued: '等待开始',
  scaffold: '复制固定模板',
  dependencies: '准备运行环境',
  build: '构建 Web 游戏',
  'level-validation': '检查真实关卡',
  'preview-validation': '检查 Web 试玩',
  complete: '准备完成',
};

export function StarterPreparationView({
  preparation,
  projectId,
  onError,
}: {
  preparation: StarterPreparation;
  projectId: string;
  onError: (message: string) => void;
}) {
  const failed = preparation.status === 'failed';
  const [retrying, setRetrying] = useState(false);

  async function retryPreparation(): Promise<void> {
    if (retrying) return;
    setRetrying(true);
    try {
      await window.gameAgent.retryStarterPreparation(projectId);
    } catch (error) {
      onError(toMessage(error));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <aside className="inspector starter-preparation-view" aria-live="polite">
      <section
        className={`starter-preparation-state ${failed ? 'is-failed' : ''}`}
      >
        <span className="starter-preparation-kicker">BASE GAME</span>
        <div className="starter-preparation-icon" aria-hidden="true">
          {failed ? (
            <TriangleAlert size={24} />
          ) : (
            <LoaderCircle className="spin" size={24} />
          )}
        </div>
        <strong>{failed ? '基础游戏准备没有完成' : '正在准备基础游戏'}</strong>
        <span className="starter-preparation-phase">
          当前阶段：{PHASE_LABELS[preparation.phase]}
        </span>
        <p>{preparation.message}</p>
        <small>
          {failed
            ? '项目资料和已经安全写入的文件仍然保留。'
            : '完成真实文件和运行检查后，制作区会自动开放。'}
        </small>
        {failed ? (
          <button
            className="starter-preparation-retry"
            disabled={retrying}
            onClick={() => void retryPreparation()}
          >
            {retrying ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <RotateCcw size={15} />
            )}
            {retrying ? '正在提交重试…' : '重试准备'}
          </button>
        ) : null}
      </section>
    </aside>
  );
}

function toMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    '',
  );
}
