import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Box,
  CheckCircle2,
  CircleDot,
  Copy,
  DoorOpen,
  Download,
  Eye,
  FileArchive,
  Flag,
  Gamepad2,
  Grid3X3,
  KeyRound,
  Layers3,
  Map,
  Move,
  Palette,
  Pencil,
  Play,
  Plus,
  Route,
  Save,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface GodotMazePreviewInput {
  name: string;
  creationMethod: 'template' | 'ai';
}

interface GodotMazePreviewProps {
  input: GodotMazePreviewInput;
  onClose: () => void;
}

type PreviewPanel =
  | 'none'
  | 'save'
  | 'playtest'
  | 'validation'
  | 'ai'
  | 'export';

type MazeObjectType =
  | 'spawn'
  | 'wall'
  | 'obstacle'
  | 'key'
  | 'door'
  | 'enemy'
  | 'exit'
  | 'decoration';

interface MazePreviewObject {
  id: string;
  type: MazeObjectType;
  label: string;
  x: number;
  y: number;
  detail: string;
  marker: string;
}

interface MazePreviewLevel {
  id: string;
  name: string;
  status: '可试玩' | '有建议' | '待检查';
}

const INITIAL_LEVELS: MazePreviewLevel[] = [
  { id: 'maze-01', name: '入口大厅', status: '可试玩' },
  { id: 'maze-02', name: '钥匙回廊', status: '有建议' },
  { id: 'maze-03', name: '巡逻花园', status: '可试玩' },
  { id: 'maze-04', name: '双门密室', status: '待检查' },
];

const MAZE_OBJECTS: MazePreviewObject[] = [
  {
    id: 'spawn-01',
    type: 'spawn',
    label: '玩家出生点',
    x: 11,
    y: 80,
    detail: '玩家进入本关时从这里开始。每关必须有 1 个。',
    marker: '起',
  },
  {
    id: 'key-01',
    type: 'key',
    label: '铜钥匙',
    x: 46,
    y: 73,
    detail: '拾取后可以打开编号为 A 的门。',
    marker: '钥',
  },
  {
    id: 'door-01',
    type: 'door',
    label: '上锁门 A',
    x: 65,
    y: 48,
    detail: '需要铜钥匙才能通过；验证时会检查钥匙是否可到达。',
    marker: '门',
  },
  {
    id: 'enemy-01',
    type: 'enemy',
    label: '巡逻史莱姆',
    x: 37,
    y: 31,
    detail: '移动方式：沿设置路线来回巡逻。',
    marker: '敌',
  },
  {
    id: 'obstacle-01',
    type: 'obstacle',
    label: '石柱障碍',
    x: 78,
    y: 72,
    detail: '阻挡玩家移动，可用于改变行走路线。',
    marker: '障',
  },
  {
    id: 'exit-01',
    type: 'exit',
    label: '关卡出口',
    x: 88,
    y: 17,
    detail: '玩家到达这里后完成本关。每关必须至少有 1 个。',
    marker: '终',
  },
];

const OBJECT_TOOLS: Array<{
  type: MazeObjectType;
  label: string;
  icon: ReactNode;
}> = [
  { type: 'spawn', label: '玩家出生点', icon: <UserRound size={15} /> },
  { type: 'wall', label: '墙壁', icon: <Square size={15} /> },
  { type: 'obstacle', label: '障碍', icon: <Box size={15} /> },
  { type: 'key', label: '钥匙', icon: <KeyRound size={15} /> },
  { type: 'door', label: '门', icon: <DoorOpen size={15} /> },
  { type: 'enemy', label: '敌人', icon: <ShieldAlert size={15} /> },
  { type: 'exit', label: '出口', icon: <Flag size={15} /> },
  { type: 'decoration', label: '装饰物', icon: <Palette size={15} /> },
];

const AI_STATES = [
  '等待指令',
  '分析中',
  '待用户确认',
  '执行中',
  '验证中',
  '已完成',
  '失败',
  '已停止',
];

const PLAYTEST_STATES = ['加载中', '试玩中', '死亡', '通关', '失败'];

export function GodotMazePreview({ input, onClose }: GodotMazePreviewProps) {
  const [levels, setLevels] = useState(INITIAL_LEVELS);
  const [selectedLevelId, setSelectedLevelId] = useState(INITIAL_LEVELS[0].id);
  const [selectedObjectId, setSelectedObjectId] = useState(MAZE_OBJECTS[0].id);
  const [selectedTool, setSelectedTool] = useState<MazeObjectType>('spawn');
  const [panel, setPanel] = useState<PreviewPanel>('none');
  const [notice, setNotice] = useState<string | null>(null);

  const selectedLevel = useMemo(
    () => levels.find((level) => level.id === selectedLevelId) ?? levels[0],
    [levels, selectedLevelId],
  );
  const selectedObject = useMemo(
    () =>
      MAZE_OBJECTS.find((object) => object.id === selectedObjectId) ??
      MAZE_OBJECTS[0],
    [selectedObjectId],
  );

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function showDemoNotice(action: string) {
    setNotice(`演示模式：本次操作仅用于体验，不会写入真实项目数据。${action}`);
  }

  function addPreviewLevel() {
    if (levels.length >= 8) {
      setNotice('最多支持 8 个关卡。');
      return;
    }
    const index = levels.length + 1;
    const next = {
      id: `maze-${String(index).padStart(2, '0')}`,
      name: `新关卡 ${index}`,
      status: '待检查' as const,
    };
    setLevels((current) => [...current, next]);
    setSelectedLevelId(next.id);
    showDemoNotice(`已在当前页面添加“${next.name}”。`);
  }

  function chooseTool(type: MazeObjectType) {
    setSelectedTool(type);
    const example = MAZE_OBJECTS.find((object) => object.type === type);
    if (example) setSelectedObjectId(example.id);
  }

  return (
    <div className="maze-preview-layer" role="dialog" aria-modal="true">
      <section className="maze-preview-workspace" aria-label="Godot 迷宫编辑器">
        <header className="maze-preview-header">
          <div className="maze-preview-identity">
            <button
              type="button"
              className="maze-back-button"
              onClick={onClose}
            >
              <ArrowLeft size={16} />
              返回 liimit.ai
            </button>
            <div>
              <span>GODOT MAZE EDITOR</span>
              <strong>{input.name}</strong>
            </div>
            <div className="maze-preview-badges">
              <span>俯视角迷宫</span>
              <span>Godot · 2D</span>
              <span>
                {input.creationMethod === 'ai' ? 'AI 生成' : '固定模板'}
              </span>
            </div>
          </div>

          <nav className="maze-preview-toolbar" aria-label="项目操作">
            <button type="button" onClick={() => setPanel('save')}>
              <Save size={15} />
              保存
            </button>
            <button type="button" onClick={() => setPanel('playtest')}>
              <Play size={15} />
              Web 试玩
            </button>
            <button type="button" onClick={() => setPanel('validation')}>
              <Route size={15} />
              自动验证
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => setPanel('ai')}
            >
              <Sparkles size={15} />
              AI 助手
            </button>
            <button type="button" onClick={() => setPanel('export')}>
              <Download size={15} />
              导出
            </button>
          </nav>
        </header>

        <main className="maze-editor-layout">
          <aside className="maze-left-panel">
            <section className="maze-panel-section">
              <header>
                <div>
                  <span>LEVELS</span>
                  <strong>关卡管理</strong>
                </div>
                <small>{levels.length} / 最多 8 关</small>
              </header>

              <div className="maze-level-actions" aria-label="关卡操作">
                <button
                  type="button"
                  onClick={addPreviewLevel}
                  title="新建关卡"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => showDemoNotice('复制上一关。')}
                  title="复制上一关"
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => showDemoNotice('修改关卡名称。')}
                  title="修改名字"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => showDemoNotice('上移关卡顺序。')}
                  title="上移"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => showDemoNotice('下移关卡顺序。')}
                  title="下移"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => showDemoNotice('删除关卡。')}
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="maze-level-list">
                {levels.map((level, index) => (
                  <button
                    type="button"
                    key={level.id}
                    className={
                      level.id === selectedLevelId ? 'is-selected' : ''
                    }
                    onClick={() => {
                      setSelectedLevelId(level.id);
                    }}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{level.name}</strong>
                      <small>{level.status}</small>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="maze-panel-section maze-object-palette">
              <header>
                <div>
                  <span>OBJECTS</span>
                  <strong>物体工具</strong>
                </div>
                <small>点击选择</small>
              </header>
              <div className="maze-tool-grid">
                {OBJECT_TOOLS.map((tool) => (
                  <button
                    type="button"
                    key={tool.type}
                    className={selectedTool === tool.type ? 'is-selected' : ''}
                    onClick={() => chooseTool(tool.type)}
                  >
                    {tool.icon}
                    <span>{tool.label}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="maze-canvas-panel">
            <header className="maze-canvas-toolbar">
              <div>
                <Map size={16} />
                <strong>迷宫画布</strong>
                <span>{selectedLevel.name}</span>
              </div>
              <div>
                <span className="maze-grid-chip">
                  <Grid3X3 size={13} /> 32 px 网格
                </span>
                <button
                  type="button"
                  onClick={() => showDemoNotice('已适应画布大小。')}
                >
                  <Move size={14} />
                  适应画布
                </button>
              </div>
            </header>

            <div className="maze-canvas-wrap">
              <div className="maze-canvas" aria-label="迷宫画布">
                <div className="maze-room-label">ROOM / {selectedLevel.id}</div>
                <div className="maze-wall wall-top-left" />
                <div className="maze-wall wall-top-right" />
                <div className="maze-wall wall-center" />
                <div className="maze-wall wall-bottom-left" />
                <div className="maze-wall wall-bottom-right" />
                <div className="maze-wall wall-vertical-a" />
                <div className="maze-wall wall-vertical-b" />

                {MAZE_OBJECTS.map((object) => (
                  <button
                    type="button"
                    key={object.id}
                    className={`maze-object is-${object.type} ${
                      object.id === selectedObjectId ? 'is-selected' : ''
                    }`}
                    style={{ left: `${object.x}%`, top: `${object.y}%` }}
                    title={object.label}
                    aria-label={`选择${object.label}`}
                    onClick={() => {
                      setSelectedObjectId(object.id);
                      setSelectedTool(object.type);
                    }}
                  >
                    <span>{object.marker}</span>
                    <small>{object.label}</small>
                  </button>
                ))}

                <div className="maze-route-preview" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>

            <footer className="maze-canvas-footer">
              <span>
                <CircleDot size={12} /> 点击物体查看属性
              </span>
              <span>
                <Layers3 size={12} /> 当前共 {MAZE_OBJECTS.length} 个物体
              </span>
            </footer>
          </section>

          <aside className="maze-properties-panel">
            <header>
              <div>
                <span>INSPECTOR</span>
                <strong>属性设置</strong>
              </div>
              <small>当前对象</small>
            </header>

            <div className={`maze-selected-object is-${selectedObject.type}`}>
              <span>{selectedObject.marker}</span>
              <div>
                <strong>{selectedObject.label}</strong>
                <small>{objectTypeLabel(selectedObject.type)}</small>
              </div>
            </div>

            <label>
              <span>物体名称</span>
              <input value={selectedObject.label} readOnly />
            </label>
            <div className="maze-coordinate-grid">
              <label>
                <span>位置 X</span>
                <input value={`${selectedObject.x}%`} readOnly />
              </label>
              <label>
                <span>位置 Y</span>
                <input value={`${selectedObject.y}%`} readOnly />
              </label>
            </div>
            <label>
              <span>物体类型</span>
              <select value={selectedObject.type} disabled>
                <option value={selectedObject.type}>
                  {objectTypeLabel(selectedObject.type)}
                </option>
              </select>
            </label>

            {selectedObject.type === 'door' ? (
              <label>
                <span>需要的钥匙</span>
                <input value="铜钥匙 / A" readOnly />
              </label>
            ) : null}
            {selectedObject.type === 'enemy' ? (
              <label>
                <span>移动方式</span>
                <input value="水平巡逻" readOnly />
              </label>
            ) : null}

            <div className="maze-object-explanation">
              <strong>规则说明</strong>
              <p>{selectedObject.detail}</p>
            </div>

            <button
              type="button"
              className="maze-property-action"
              onClick={() =>
                showDemoNotice(`保存${selectedObject.label}属性。`)
              }
            >
              <Save size={14} />
              保存属性
            </button>
          </aside>
        </main>

        {notice ? (
          <div className="maze-preview-notice" role="status">
            <Eye size={14} />
            <span>{notice}</span>
          </div>
        ) : null}

        {panel !== 'none' ? (
          <WorkflowPreviewPanel
            panel={panel}
            levels={levels}
            selectedLevelId={selectedLevelId}
            onSelectLevel={setSelectedLevelId}
            onClose={() => setPanel('none')}
            onPreviewAction={showDemoNotice}
          />
        ) : null}
      </section>
    </div>
  );
}

interface WorkflowPreviewPanelProps {
  panel: Exclude<PreviewPanel, 'none'>;
  levels: MazePreviewLevel[];
  selectedLevelId: string;
  onSelectLevel: (levelId: string) => void;
  onClose: () => void;
  onPreviewAction: (action: string) => void;
}

function WorkflowPreviewPanel({
  panel,
  levels,
  selectedLevelId,
  onSelectLevel,
  onClose,
  onPreviewAction,
}: WorkflowPreviewPanelProps) {
  const copy = {
    save: {
      index: 'PROJECT / SAVE',
      title: '保存项目',
      description: '保存关卡、规则和项目配置，保留当前编辑进度。',
      icon: <Save size={18} />,
    },
    playtest: {
      index: 'WEB / PLAYTEST',
      title: '从指定关卡开始试玩',
      description: '选择起始关卡，在应用内 Web 浏览器查看游戏效果。',
      icon: <Gamepad2 size={18} />,
    },
    validation: {
      index: 'LEVEL / VALIDATION',
      title: '自动验证结果',
      description: '检查关卡路线、钥匙门关系和敌人位置，并给出调整建议。',
      icon: <Route size={18} />,
    },
    ai: {
      index: 'AI / ASSISTANT',
      title: 'AI 修改助手',
      description: '先查看修改方案，确认后再执行修改和路线验证。',
      icon: <Bot size={18} />,
    },
    export: {
      index: 'PROJECT / EXPORT',
      title: '导出交付文件',
      description: '将完整工程或 Web 文件交给程序员和其他同事。',
      icon: <Download size={18} />,
    },
  }[panel];

  return (
    <div className="maze-workflow-backdrop" role="presentation">
      <section
        className="maze-workflow-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`maze-${panel}-title`}
      >
        <header>
          <div className="maze-workflow-heading">
            <span className="maze-workflow-icon">{copy.icon}</span>
            <div>
              <small>{copy.index}</small>
              <h2 id={`maze-${panel}-title`}>{copy.title}</h2>
              <p>{copy.description}</p>
            </div>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="maze-workflow-content">
          {panel === 'save' ? (
            <SavePreview onPreviewAction={onPreviewAction} />
          ) : null}
          {panel === 'playtest' ? (
            <PlaytestPreview
              levels={levels}
              selectedLevelId={selectedLevelId}
              onSelectLevel={onSelectLevel}
              onPreviewAction={onPreviewAction}
            />
          ) : null}
          {panel === 'validation' ? (
            <ValidationPreview onPreviewAction={onPreviewAction} />
          ) : null}
          {panel === 'ai' ? (
            <AiPreview onPreviewAction={onPreviewAction} />
          ) : null}
          {panel === 'export' ? (
            <ExportPreview onPreviewAction={onPreviewAction} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SavePreview({
  onPreviewAction,
}: Pick<WorkflowPreviewPanelProps, 'onPreviewAction'>) {
  return (
    <div className="maze-save-preview">
      <div className="maze-state-card is-success">
        <CheckCircle2 size={20} />
        <div>
          <strong>本地保存</strong>
          <span>保存当前关卡、规则和项目配置。</span>
        </div>
      </div>
      <div className="maze-state-card is-protected">
        <ShieldAlert size={20} />
        <div>
          <strong>版本保护</strong>
          <span>保存遇到问题时，保留上一个可用版本。</span>
        </div>
      </div>
      <button type="button" onClick={() => onPreviewAction('保存迷宫项目')}>
        <Save size={15} />
        保存项目
      </button>
    </div>
  );
}

function PlaytestPreview({
  levels,
  selectedLevelId,
  onSelectLevel,
  onPreviewAction,
}: Pick<
  WorkflowPreviewPanelProps,
  'levels' | 'selectedLevelId' | 'onSelectLevel' | 'onPreviewAction'
>) {
  return (
    <div className="maze-playtest-preview">
      <div className="maze-panel-form-row">
        <label>
          <span>从哪一关开始</span>
          <select
            value={selectedLevelId}
            onChange={(event) => onSelectLevel(event.target.value)}
          >
            {levels.map((level, index) => (
              <option value={level.id} key={level.id}>
                第 {index + 1} 关 · {level.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => onPreviewAction('启动 Web 试玩')}>
          <Play size={15} />
          开始试玩
        </button>
      </div>

      <div className="maze-browser-mock">
        <div className="maze-browser-bar">
          <i />
          <i />
          <i />
          <span>liimit.ai / Web 试玩</span>
        </div>
        <div className="maze-browser-stage">
          <Grid3X3 size={42} />
          <strong>选择关卡后，在这里进入 Web 试玩</strong>
          <span>使用方向键移动，按空格键执行动作。</span>
        </div>
      </div>

      <div className="maze-state-strip" aria-label="试玩状态">
        {PLAYTEST_STATES.map((state, index) => (
          <span className={index === 1 ? 'is-active' : ''} key={state}>
            {state}
          </span>
        ))}
      </div>
    </div>
  );
}

function ValidationPreview({
  onPreviewAction,
}: Pick<WorkflowPreviewPanelProps, 'onPreviewAction'>) {
  const checks = [
    { label: '玩家出生点', result: '已找到 1 个', ok: true },
    { label: '关卡出口', result: '已找到 1 个', ok: true },
    { label: '起点到出口路线', result: '有 1 段路线过窄', ok: false },
    { label: '钥匙与门', result: '铜钥匙可在开门前取得', ok: true },
    { label: '敌人位置', result: '不会堵住唯一通路', ok: true },
  ];
  return (
    <div className="maze-validation-preview">
      <div className="maze-validation-summary">
        <div>
          <Route size={22} />
          <span>
            <strong>4 项通过，1 项有建议</strong>
            <small className="maze-example-label">示例数据</small>
          </span>
        </div>
        <span className="is-warning">需要用户决定</span>
      </div>
      <div className="maze-validation-list">
        {checks.map((check) => (
          <div className={check.ok ? 'is-ok' : 'is-warning'} key={check.label}>
            {check.ok ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <strong>{check.label}</strong>
            <span>{check.result}</span>
          </div>
        ))}
      </div>
      <div className="maze-suggestion-card">
        <Sparkles size={17} />
        <div>
          <strong>AI 建议：把中间通道加宽一格</strong>
          <p>只影响第 2 关的两段墙壁，不改钥匙、门、敌人和其他关卡。</p>
        </div>
        <button
          type="button"
          onClick={() => onPreviewAction('确认采用验证建议')}
        >
          确认修改
        </button>
      </div>
    </div>
  );
}

function AiPreview({
  onPreviewAction,
}: Pick<WorkflowPreviewPanelProps, 'onPreviewAction'>) {
  return (
    <div className="maze-ai-preview">
      <div className="maze-ai-state-timeline" aria-label="AI 执行状态">
        {AI_STATES.map((state, index) => (
          <div className={index === 2 ? 'is-active' : ''} key={state}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{state}</strong>
          </div>
        ))}
      </div>

      <label className="maze-ai-input">
        <span>告诉 AI 想修改什么</span>
        <textarea
          rows={3}
          defaultValue="把第 2 关变复杂一点，增加一把钥匙和一扇门，但不要改其他关。"
        />
      </label>

      <div className="maze-ai-plan-card">
        <div className="maze-ai-plan-heading">
          <Bot size={18} />
          <span>
            <small>修改方案 · 等待用户确认</small>
            <strong>只调整第 2 关“钥匙回廊”</strong>
          </span>
          <em className="maze-example-label">示例数据</em>
        </div>
        <ol>
          <li>在右侧支路放置 1 把铜钥匙。</li>
          <li>在出口前增加 1 扇需要铜钥匙的门。</li>
          <li>保留现有敌人，并在修改后重新验证路线。</li>
        </ol>
        <div className="maze-ai-plan-actions">
          <button
            type="button"
            className="is-secondary"
            onClick={() => onPreviewAction('拒绝 AI 修改方案')}
          >
            不采用
          </button>
          <button
            type="button"
            onClick={() => onPreviewAction('确认 AI 修改方案')}
          >
            <Sparkles size={14} />
            确认并修改
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportPreview({
  onPreviewAction,
}: Pick<WorkflowPreviewPanelProps, 'onPreviewAction'>) {
  return (
    <div className="maze-export-preview">
      <button
        type="button"
        className="maze-export-card"
        onClick={() => onPreviewAction('导出 Godot 完整工程')}
      >
        <FileArchive size={28} />
        <span>
          <small>导出格式 01</small>
          <strong>Godot 完整工程</strong>
          <p>交给程序员继续打开、修改和接入其他系统。</p>
        </span>
        <Download size={17} />
      </button>
      <button
        type="button"
        className="maze-export-card"
        onClick={() => onPreviewAction('导出 Web 试玩文件')}
      >
        <Eye size={28} />
        <span>
          <small>导出格式 02</small>
          <strong>Web 试玩文件</strong>
          <p>生成可放到浏览器或内部服务器查看的文件夹。</p>
        </span>
        <Download size={17} />
      </button>
    </div>
  );
}

function objectTypeLabel(type: MazeObjectType): string {
  return {
    spawn: '玩家出生点',
    wall: '墙壁',
    obstacle: '障碍',
    key: '钥匙',
    door: '门',
    enemy: '敌人',
    exit: '出口',
    decoration: '装饰物',
  }[type];
}
