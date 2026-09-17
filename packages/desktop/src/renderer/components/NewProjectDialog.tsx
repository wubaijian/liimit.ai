import {
  Check,
  Eye,
  Factory,
  Flame,
  FolderOpen,
  Gamepad2,
  Grid3X3,
  LayoutTemplate,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  FIRE_MOUNTAIN_BUILT_IN_EXAMPLE,
  ZERO_FACTORY_BUILT_IN_EXAMPLE,
  type BuiltInExampleId,
} from '../../shared/builtInExamples';
import { type CreateProjectInput } from '../../shared/types';
import type { GodotMazePreviewInput } from './GodotMazePreview';

interface NewProjectDialogProps {
  defaultDirectory: string;
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
  onOpenBuiltInExample: (
    exampleId: BuiltInExampleId,
    directory: string,
  ) => Promise<void>;
  builtInExampleExists: Record<BuiltInExampleId, boolean>;
  onPreviewGodot: (input: GodotMazePreviewInput) => void;
}

type GameType = 'platformer' | 'maze';
type CreationMethod =
  | GodotMazePreviewInput['creationMethod']
  | 'fire-example'
  | 'factory-example';

const PLATFORMER_EXAMPLES = [
  '制作一个横版像素动作平台游戏，主角能二段跳、冲刺并挑战三阶段 Boss。',
  '制作一个横版森林解谜平台游戏，用可推动的木箱和开关打开通往终点的道路。',
  '制作一个横版无尽跑酷平台游戏，玩家需要跨越熔岩、移动平台和不断加速的机关。',
];

const MAZE_EXAMPLES = [
  '制作一个遗迹主题的俯视角迷宫，玩家找到钥匙、打开石门并躲开巡逻敌人。',
  '制作四关逐步变难的森林迷宫，最后一关需要连续打开两道门才能到达出口。',
  '制作一个轻解谜迷宫，每关都有出生点、障碍、钥匙、上锁门和明确出口。',
];

export function NewProjectDialog({
  defaultDirectory,
  onClose,
  onCreate,
  onOpenBuiltInExample,
  builtInExampleExists,
  onPreviewGodot,
}: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState(defaultDirectory);
  const [prompt, setPrompt] = useState('');
  const [gameType, setGameType] = useState<GameType>('platformer');
  const [creationMethod, setCreationMethod] =
    useState<CreationMethod>('template');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoNotice, setDemoNotice] = useState('');

  const isMazePreview = gameType === 'maze';
  const examples = isMazePreview ? MAZE_EXAMPLES : PLATFORMER_EXAMPLES;
  const selectedBuiltInExample =
    creationMethod === 'fire-example'
      ? FIRE_MOUNTAIN_BUILT_IN_EXAMPLE
      : creationMethod === 'factory-example'
        ? ZERO_FACTORY_BUILT_IN_EXAMPLE
        : undefined;

  async function chooseDirectory() {
    const selected = await window.gameAgent.chooseDirectory();
    if (selected) setDirectory(selected);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (gameType === 'maze') {
      onPreviewGodot({
        name: name.trim() || '未命名迷宫项目',
        creationMethod: creationMethod === 'ai' ? 'ai' : 'template',
      });
      return;
    }

    setBusy(true);
    try {
      if (selectedBuiltInExample) {
        await onOpenBuiltInExample(selectedBuiltInExample.id, directory);
        return;
      }
      await onCreate({
        name,
        directory,
        prompt,
        creationMode: creationMethod === 'ai' ? 'ai' : 'template',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function selectGameType(next: GameType) {
    setGameType(next);
    setCreationMethod('template');
    setPrompt('');
    setError('');
    setDemoNotice('');
  }

  function selectCreationMethod(next: CreationMethod) {
    const currentExample = selectedBuiltInExample;
    const nextExample =
      next === 'fire-example'
        ? FIRE_MOUNTAIN_BUILT_IN_EXAMPLE
        : next === 'factory-example'
          ? ZERO_FACTORY_BUILT_IN_EXAMPLE
          : undefined;
    if (currentExample && !nextExample) {
      if (name === currentExample.name) setName('');
      if (prompt === currentExample.prompt) setPrompt('');
    }
    setCreationMethod(next);
    if (nextExample) {
      if (!name.trim() || name === currentExample?.name) {
        setName(nextExample.name);
      }
      setPrompt(nextExample.prompt);
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
            <h2 id="new-title">选择要制作的游戏</h2>
            <p className="dialog-lead">
              选择游戏类型，系统会自动匹配对应的制作工具。
            </p>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <form onSubmit={submit}>
          <fieldset className="choice-fieldset">
            <legend>1. 选择游戏类型</legend>
            <div className="game-type-grid">
              <button
                type="button"
                className={`game-type-card ${gameType === 'platformer' ? 'is-selected' : ''}`}
                aria-pressed={gameType === 'platformer'}
                onClick={() => selectGameType('platformer')}
              >
                <span className="game-type-icon is-phaser">
                  <Gamepad2 size={21} />
                </span>
                <span className="game-type-copy">
                  <span className="availability-label is-available">
                    <Check size={12} /> Phaser 3
                  </span>
                  <strong>横版平台跳跃</strong>
                  <small>Phaser 3 · 2D · Web 试玩</small>
                  <p>编辑横版关卡、保存项目，并在应用内 Web 浏览器试玩。</p>
                </span>
              </button>

              <button
                type="button"
                className={`game-type-card ${isMazePreview ? 'is-selected is-demo' : ''}`}
                aria-pressed={isMazePreview}
                onClick={() => selectGameType('maze')}
              >
                <span className="game-type-icon is-godot">
                  <Grid3X3 size={21} />
                </span>
                <span className="game-type-copy">
                  <strong>俯视角迷宫</strong>
                  <small>Godot · 2D · Web</small>
                  <p>设计迷宫关卡、配置物体规则并安排试玩流程。</p>
                </span>
              </button>
            </div>
          </fieldset>

          <fieldset className="choice-fieldset">
            <legend>2. 选择开始方式</legend>
            <div
              className={`creation-method-grid ${isMazePreview ? '' : 'has-built-in-examples'}`}
            >
              <button
                type="button"
                className={creationMethod === 'template' ? 'is-selected' : ''}
                aria-pressed={creationMethod === 'template'}
                onClick={() => selectCreationMethod('template')}
              >
                <LayoutTemplate size={18} />
                <span>
                  <strong>固定模板</strong>
                  <small>
                    {isMazePreview
                      ? '从迷宫基础模板开始搭建'
                      : '直接得到可编辑试玩的横版基础游戏'}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className={creationMethod === 'ai' ? 'is-selected' : ''}
                aria-pressed={creationMethod === 'ai'}
                onClick={() => selectCreationMethod('ai')}
              >
                <WandSparkles size={18} />
                <span>
                  <strong>AI 生成</strong>
                  <small>
                    {isMazePreview
                      ? '根据描述生成关卡方案'
                      : '按要求创建新游戏，不套用示例关卡；会使用 API'}
                  </small>
                </span>
              </button>
              {!isMazePreview ? (
                <button
                  type="button"
                  className={
                    creationMethod === 'fire-example' ? 'is-selected' : ''
                  }
                  aria-pressed={creationMethod === 'fire-example'}
                  onClick={() => selectCreationMethod('fire-example')}
                >
                  <Flame size={18} />
                  <span>
                    <strong>火山逃生示例</strong>
                    <small>直接打开已经完成的原创三关游戏</small>
                  </span>
                </button>
              ) : null}
              {!isMazePreview ? (
                <button
                  type="button"
                  className={
                    creationMethod === 'factory-example' ? 'is-selected' : ''
                  }
                  aria-pressed={creationMethod === 'factory-example'}
                  onClick={() => selectCreationMethod('factory-example')}
                >
                  <Factory size={18} />
                  <span>
                    <strong>零号工厂逃生示例</strong>
                    <small>直接打开门卡、双开关和激光门三关游戏</small>
                  </span>
                </button>
              ) : null}
            </div>
          </fieldset>

          <div className="project-basics-grid">
            <label>
              <span>3. 项目名称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  isMazePreview ? '例如：遗迹钥匙迷宫' : '例如：火山逃生'
                }
                autoFocus
              />
            </label>
            <label>
              <span>保存位置</span>
              <div className="path-input">
                <input
                  value={directory}
                  onChange={(event) => setDirectory(event.target.value)}
                  readOnly={isMazePreview}
                />
                {gameType === 'platformer' ? (
                  <button type="button" onClick={chooseDirectory}>
                    <FolderOpen size={15} />
                    选择
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setDemoNotice(
                        '演示模式：保存位置将在创建真实项目时选择。',
                      )
                    }
                  >
                    <FolderOpen size={15} />
                    选择
                  </button>
                )}
              </div>
            </label>
          </div>

          <label>
            <span>
              {creationMethod === 'ai'
                ? '4. 告诉 AI 你想做什么'
                : selectedBuiltInExample
                  ? '4. 内置示例说明'
                  : '4. 游戏主题与关卡想法'}
            </span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              readOnly={Boolean(selectedBuiltInExample)}
              placeholder={
                isMazePreview
                  ? '描述迷宫主题、关卡数量、钥匙和门、敌人以及出口规则……'
                  : selectedBuiltInExample
                    ? selectedBuiltInExample.description
                    : '描述主题、美术风格、平台机关、角色能力和你最在意的体验……'
              }
              rows={4}
            />
          </label>
          {!selectedBuiltInExample ? (
            <div className="prompt-examples">
              <span>试试这些方向</span>
              {examples.map((example, index) => (
                <button
                  type="button"
                  key={example}
                  title={example}
                  onClick={() => setPrompt(example)}
                >
                  0{index + 1}
                </button>
              ))}
            </div>
          ) : null}

          {demoNotice ? (
            <div className="demo-inline-notice" role="status">
              <Eye size={15} />
              <span>{demoNotice}</span>
            </div>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}
          <footer>
            <p>
              {creationMethod === 'ai' && !isMazePreview
                ? '创建后自动调用 AI，可能产生 API 费用；可随时停止。'
                : '填写项目信息后进入关卡工作台。'}
            </p>
            <button className="primary-button" disabled={busy} type="submit">
              {isMazePreview ? <Grid3X3 size={15} /> : <Sparkles size={15} />}
              {busy
                ? selectedBuiltInExample
                  ? '正在打开…'
                  : '正在创建…'
                : isMazePreview
                  ? '进入迷宫编辑器'
                  : selectedBuiltInExample
                    ? builtInExampleExists[selectedBuiltInExample.id]
                      ? `打开已有${selectedBuiltInExample.name}`
                      : `打开${selectedBuiltInExample.name}示例`
                    : creationMethod === 'ai'
                      ? '创建并生成'
                      : '创建横版游戏'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
