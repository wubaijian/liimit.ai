import { FolderOpen, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import {
  FIXED_PRODUCT_MODE,
  type CreateProjectInput,
} from '../../shared/types';

interface NewProjectDialogProps {
  defaultDirectory: string;
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
}

const EXAMPLES = [
  '制作一个横版像素动作平台游戏，主角能二段跳、冲刺并挑战三阶段 Boss。',
  '制作一个横版森林解谜平台游戏，用可推动的木箱和开关打开通往终点的道路。',
  '制作一个横版无尽跑酷平台游戏，玩家需要跨越熔岩、移动平台和不断加速的机关。',
];

export function NewProjectDialog({
  defaultDirectory,
  onClose,
  onCreate,
}: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState(defaultDirectory);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function chooseDirectory() {
    const selected = await window.gameAgent.chooseDirectory();
    if (selected) setDirectory(selected);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onCreate({ name, directory, prompt });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog new-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-title"
      >
        <header>
          <div>
            <span className="dialog-index">NEW / GAME</span>
            <h2 id="new-title">把一句想法变成游戏</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="fixed-mode-card" aria-label="固定产品模式">
            <div>
              <span>固定产品模式</span>
              <strong>
                {FIXED_PRODUCT_MODE.engine} · {FIXED_PRODUCT_MODE.dimension}{' '}
                横版平台跳跃
              </strong>
            </div>
            <p>使用固定平台模板生成，完成构建后在应用内 Web 浏览器试玩。</p>
            <div className="fixed-mode-tags" aria-hidden="true">
              <span>PHASER 3</span>
              <span>2D</span>
              <span>PLATFORMER</span>
              <span>WEB</span>
            </div>
          </div>
          <label>
            <span>项目名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：Dead City"
              autoFocus
            />
          </label>
          <label>
            <span>保存位置</span>
            <div className="path-input">
              <input
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
              />
              <button type="button" onClick={chooseDirectory}>
                <FolderOpen size={15} />
                选择
              </button>
            </div>
          </label>
          <label>
            <span>主题与关卡创意</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述主题、美术风格、平台机关、角色能力和你最在意的体验……"
              rows={7}
            />
          </label>
          <div className="prompt-examples">
            <span>试试这些方向</span>
            {EXAMPLES.map((example, index) => (
              <button
                type="button"
                key={example}
                onClick={() => setPrompt(example)}
              >
                0{index + 1}
              </button>
            ))}
          </div>
          {error ? <div className="form-error">{error}</div> : null}
          <footer>
            <p>
              创建后会自动复制固定模板并准备本地运行环境，首次可能需要联网下载固定依赖。项目会保存在独立目录中；引擎、类型、模板和试玩目标不可切换。
            </p>
            <button className="primary-button" disabled={busy} type="submit">
              <Sparkles size={15} />
              {busy ? '正在创建…' : '创建制作任务'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
