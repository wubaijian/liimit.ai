import {
  Coins,
  Copy,
  Flag,
  Minus,
  Move,
  MoveDown,
  MoveHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  LevelDocument,
  LevelObject,
  LevelObjectType,
} from '../../shared/levelDocument';
import type {
  LevelCampaign,
  PlayerAbilities,
} from '../../shared/levelCampaign';
import type { ProjectRecord } from '../../shared/types';
import {
  addCoinToLevel,
  addEnemyToLevel,
  addCheckpointToLevel,
  addMovingPlatformToLevel,
  addPlatformToLevel,
  addPitToLevel,
  addSpikeToLevel,
  clientPointToLevel,
  copyLevelObject,
  getCoinOrSpikeResizeBlockReason,
  getLevelObjectDeletionBlockReason,
  getLevelObjectCopyBlockReason,
  getPlatformHeightResizeBlockReason,
  getPlatformWidthResizeBlockReason,
  moveLevelObject,
  persistLevelAddition,
  persistLevelCopy,
  persistLevelDeletion,
  persistLevelObjectMove,
  persistLevelObjectResize,
  persistLevelUndo,
  persistPlatformResize,
  removeLevelObject,
  resizeCoinOrSpike,
  resizePlatformHeight,
  resizePlatformWidth,
  updateMovingPlatformMovement,
  type CoinOrSpikeResizeDirection,
  type PlatformHeightResizeDirection,
  type PlatformWidthResizeDirection,
} from '../levelEditing';

interface LevelViewerProps {
  project: ProjectRecord;
  refreshToken: number;
  onError: (message: string) => void;
  preferredLevelId?: string;
  onActiveLevelChange?: (levelId: string) => void;
}

const OBJECT_LABELS: Record<LevelObjectType, string> = {
  'player-spawn': '出生点',
  platform: '平台',
  'moving-platform': '移动平台',
  spike: '尖刺',
  slime: '史莱姆',
  bee: '蜜蜂',
  coin: '金币',
  keycard: '门卡',
  'security-door': '安全门',
  'floor-switch': '地面开关',
  'laser-gate': '激光门',
  checkpoint: '检查点',
  goal: '终点',
  pit: '坑洞',
};

interface ActiveDrag {
  pointerId: number;
  objectId: string;
  offsetX: number;
  offsetY: number;
  originalLevel: LevelDocument;
  previousSelectionId?: string;
}

interface UndoEntry {
  level: LevelDocument;
  selectedObjectId?: string;
  label: string;
}

export function LevelViewer({
  project,
  refreshToken,
  onError,
  preferredLevelId,
  onActiveLevelChange,
}: LevelViewerProps) {
  const [level, setLevel] = useState<LevelDocument | null>(null);
  const [campaign, setCampaign] = useState<LevelCampaign | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [undoEntry, setUndoEntry] = useState<UndoEntry>();
  const [editStatus, setEditStatus] = useState('拖动物体后自动保存');
  const levelRef = useRef<LevelDocument | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const projectIdRef = useRef(project.id);
  const activeLevelIdRef = useRef<string | undefined>(undefined);
  projectIdRef.current = project.id;
  activeLevelIdRef.current = activeLevelId;

  const loadLevel = useCallback(async () => {
    setLoading(true);
    setError('');
    setSaving(false);
    setSelectedObjectId(undefined);
    setUndoEntry(undefined);
    dragRef.current = null;
    try {
      const loaded = await window.gameAgent.loadLevelCampaign(project.id);
      const selected =
        loaded.levels.find((item) => item.id === activeLevelIdRef.current) ??
        loaded.levels.find((item) => item.id === preferredLevelId) ??
        loaded.levels[0];
      if (!selected) throw new Error('游戏里还没有可编辑的关卡。');
      setCampaign(loaded);
      setActiveLevelId(selected.id);
      onActiveLevelChange?.(selected.id);
      levelRef.current = selected.document;
      setLevel(selected.document);
      setEditStatus('拖动物体后自动保存');
    } catch (reason) {
      const message = toMessage(reason);
      levelRef.current = null;
      setLevel(null);
      setError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  }, [onActiveLevelChange, onError, preferredLevelId, project.id]);

  async function saveActiveLevel(
    activeProjectId: string,
    next: LevelDocument,
  ): Promise<LevelDocument> {
    const levelId = activeLevelIdRef.current;
    if (!levelId) throw new Error('请先选择要保存的关卡。');
    const saved = await window.gameAgent.saveCampaignLevel(
      activeProjectId,
      levelId,
      next,
    );
    if (projectIdRef.current === activeProjectId) {
      setCampaign((current) =>
        current
          ? {
              ...current,
              levels: current.levels.map((item) =>
                item.id === levelId ? { ...item, document: saved } : item,
              ),
            }
          : current,
      );
    }
    return saved;
  }

  function selectLevel(levelId: string) {
    if (saving || !campaign) return;
    const selected = campaign.levels.find((item) => item.id === levelId);
    if (!selected) return;
    setActiveLevelId(selected.id);
    onActiveLevelChange?.(selected.id);
    activeLevelIdRef.current = selected.id;
    levelRef.current = selected.document;
    setLevel(selected.document);
    setSelectedObjectId(undefined);
    setUndoEntry(undefined);
    setEditStatus(`${selected.name}已打开`);
  }

  async function addLevel(sourceLevelId?: string) {
    if (saving) return;
    const activeProjectId = project.id;
    setSaving(true);
    setEditStatus(sourceLevelId ? '正在复制关卡…' : '正在新增关卡…');
    try {
      const next = await window.gameAgent.addLevel(
        activeProjectId,
        sourceLevelId,
      );
      if (projectIdRef.current !== activeProjectId) return;
      const created = next.levels.at(-1);
      if (!created) throw new Error('新关卡创建后没有找到。');
      setCampaign(next);
      setActiveLevelId(created.id);
      onActiveLevelChange?.(created.id);
      activeLevelIdRef.current = created.id;
      levelRef.current = created.document;
      setLevel(created.document);
      setSelectedObjectId(undefined);
      setUndoEntry(undefined);
      setEditStatus(`${created.name}已创建并打开`);
    } catch (reason) {
      if (projectIdRef.current !== activeProjectId) return;
      const message = toMessage(reason);
      setEditStatus('新建关卡失败');
      onError(message);
    } finally {
      if (projectIdRef.current === activeProjectId) setSaving(false);
    }
  }

  async function changeAbilities(patch: Partial<PlayerAbilities>) {
    if (saving || !campaign || !activeLevelId) return;
    const selected = campaign.levels.find((item) => item.id === activeLevelId);
    if (!selected) return;
    const activeProjectId = project.id;
    const levelId = activeLevelId;
    const next = { ...selected.abilities, ...patch };
    setSaving(true);
    setEditStatus('正在保存角色能力…');
    try {
      const saved = await window.gameAgent.saveLevelAbilities(
        activeProjectId,
        levelId,
        next,
      );
      if (projectIdRef.current !== activeProjectId) return;
      setCampaign((current) =>
        current
          ? {
              ...current,
              levels: current.levels.map((item) =>
                item.id === levelId ? { ...item, abilities: saved } : item,
              ),
            }
          : current,
      );
      setEditStatus('角色能力已保存');
    } catch (reason) {
      if (projectIdRef.current !== activeProjectId) return;
      const message = toMessage(reason);
      setEditStatus('角色能力保存失败');
      onError(message);
    } finally {
      if (projectIdRef.current === activeProjectId) setSaving(false);
    }
  }

  useEffect(() => {
    void loadLevel();
  }, [loadLevel, refreshToken]);

  function beginDrag(
    event: ReactPointerEvent<SVGElement>,
    object: LevelObject,
  ) {
    const currentLevel = levelRef.current;
    const svg = event.currentTarget.ownerSVGElement;
    if (!currentLevel || !svg || saving) return;
    const point = clientPointToLevel(
      { x: event.clientX, y: event.clientY },
      svg.getBoundingClientRect(),
      currentLevel,
    );
    dragRef.current = {
      pointerId: event.pointerId,
      objectId: object.id,
      offsetX: point.x - object.x,
      offsetY: point.y - object.y,
      originalLevel: currentLevel,
      previousSelectionId: selectedObjectId,
    };
    setSelectedObjectId(object.id);
    setEditStatus(`已选中：${OBJECT_LABELS[object.type]}`);
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function continueDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const currentLevel = levelRef.current;
    if (!drag || !currentLevel || drag.pointerId !== event.pointerId) return;
    const point = clientPointToLevel(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      currentLevel,
    );
    const next = moveLevelObject(currentLevel, drag.objectId, {
      x: point.x - drag.offsetX,
      y: point.y - drag.offsetY,
    });
    levelRef.current = next;
    setLevel(next);
  }

  async function finishDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const currentLevel = levelRef.current;
    if (!drag || !currentLevel || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const activeProjectId = project.id;
    setSaving(true);
    setEditStatus('正在保存新位置…');
    const result = await persistLevelObjectMove(
      drag.originalLevel,
      currentLevel,
      drag.objectId,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      const movedObject = drag.originalLevel.objects.find(
        (object) => object.id === drag.objectId,
      );
      setUndoEntry({
        level: drag.originalLevel,
        selectedObjectId: drag.previousSelectionId,
        label: `移动${movedObject ? OBJECT_LABELS[movedObject.type] : '物体'}`,
      });
      setEditStatus('新位置已保存');
    } else if (result.status === 'unchanged') {
      setEditStatus('位置没有变化，无需保存');
    } else {
      const message = toMessage(result.error);
      setEditStatus('保存失败，已恢复原位置');
      onError(message);
    }
  }

  function cancelDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    levelRef.current = drag.originalLevel;
    setLevel(drag.originalLevel);
    setEditStatus('已取消拖动，保留原位置');
  }

  async function addPlatform() {
    const currentLevel = levelRef.current;
    if (!currentLevel || saving) return;
    const previousSelection = selectedObjectId;
    const activeProjectId = project.id;
    const addition = addPlatformToLevel(currentLevel);
    levelRef.current = addition.level;
    setLevel(addition.level);
    setSelectedObjectId(addition.platform.id);
    setSaving(true);
    setEditStatus('正在新增平台…');
    const result = await persistLevelAddition(
      currentLevel,
      addition.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: previousSelection,
        label: '新增平台',
      });
      setEditStatus(`平台 ${addition.platform.id} 已新增并保存`);
    } else {
      setSelectedObjectId(previousSelection);
      setEditStatus('新增失败，已恢复原关卡');
      onError(toMessage(result.error));
    }
  }

  async function addMovingPlatform() {
    const currentLevel = levelRef.current;
    if (!currentLevel || saving) return;
    const previousSelection = selectedObjectId;
    const activeProjectId = project.id;
    const addition = addMovingPlatformToLevel(currentLevel);
    levelRef.current = addition.level;
    setLevel(addition.level);
    setSelectedObjectId(addition.platform.id);
    setSaving(true);
    setEditStatus('正在新增移动平台…');
    const result = await persistLevelAddition(
      currentLevel,
      addition.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: previousSelection,
        label: '新增移动平台',
      });
      setEditStatus(`移动平台 ${addition.platform.id} 已新增并保存`);
    } else {
      setSelectedObjectId(previousSelection);
      setEditStatus('新增移动平台失败，已恢复原关卡');
      onError(toMessage(result.error));
    }
  }

  async function addCoin() {
    const currentLevel = levelRef.current;
    if (!currentLevel || saving) return;
    const previousSelection = selectedObjectId;
    const activeProjectId = project.id;
    const addition = addCoinToLevel(currentLevel);
    levelRef.current = addition.level;
    setLevel(addition.level);
    setSelectedObjectId(addition.coin.id);
    setSaving(true);
    setEditStatus('正在新增金币…');
    const result = await persistLevelAddition(
      currentLevel,
      addition.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: previousSelection,
        label: '新增金币',
      });
      setEditStatus(`金币 ${addition.coin.id} 已新增并保存`);
    } else {
      setSelectedObjectId(previousSelection);
      setEditStatus('新增金币失败，已恢复原关卡');
      onError(toMessage(result.error));
    }
  }

  async function addCheckpoint() {
    const currentLevel = levelRef.current;
    if (!currentLevel || saving) return;
    const previousSelection = selectedObjectId;
    const activeProjectId = project.id;
    let addition;
    try {
      addition = addCheckpointToLevel(currentLevel);
    } catch (reason) {
      onError(toMessage(reason));
      return;
    }
    levelRef.current = addition.level;
    setLevel(addition.level);
    setSelectedObjectId(addition.checkpoint.id);
    setSaving(true);
    setEditStatus('正在新增检查点…');
    const result = await persistLevelAddition(
      currentLevel,
      addition.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: previousSelection,
        label: '新增检查点',
      });
      setEditStatus(`检查点 ${addition.checkpoint.id} 已新增并保存`);
    } else {
      setSelectedObjectId(previousSelection);
      setEditStatus('新增检查点失败，已恢复原关卡');
      onError(toMessage(result.error));
    }
  }

  async function addSpike() {
    const currentLevel = levelRef.current;
    if (!currentLevel || saving) return;
    const previousSelection = selectedObjectId;
    const activeProjectId = project.id;
    const addition = addSpikeToLevel(currentLevel);
    levelRef.current = addition.level;
    setLevel(addition.level);
    setSelectedObjectId(addition.spike.id);
    setSaving(true);
    setEditStatus('正在新增尖刺…');
    const result = await persistLevelAddition(
      currentLevel,
      addition.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: previousSelection,
        label: '新增尖刺',
      });
      setEditStatus(`尖刺 ${addition.spike.id} 已新增并保存`);
    } else {
      setSelectedObjectId(previousSelection);
      setEditStatus('新增尖刺失败，已恢复原关卡');
      onError(toMessage(result.error));
    }
  }

  async function addEnemy(type: 'slime' | 'bee') {
    const currentLevel = levelRef.current;
    if (!currentLevel || saving) return;
    const previousSelection = selectedObjectId;
    const activeProjectId = project.id;
    const addition = addEnemyToLevel(currentLevel, type);
    const label = type === 'slime' ? '史莱姆' : '蜜蜂';
    levelRef.current = addition.level;
    setLevel(addition.level);
    setSelectedObjectId(addition.enemy.id);
    setSaving(true);
    setEditStatus(`正在新增${label}…`);
    const result = await persistLevelAddition(
      currentLevel,
      addition.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: previousSelection,
        label: `新增${label}`,
      });
      setEditStatus(`${label} ${addition.enemy.id} 已新增并保存`);
    } else {
      setSelectedObjectId(previousSelection);
      setEditStatus(`新增${label}失败，已恢复原关卡`);
      onError(toMessage(result.error));
    }
  }

  async function addPit() {
    const currentLevel = levelRef.current;
    if (!currentLevel || saving) return;
    const previousSelection = selectedObjectId;
    const activeProjectId = project.id;
    let addition;
    try {
      addition = addPitToLevel(currentLevel);
    } catch (reason) {
      onError(toMessage(reason));
      return;
    }
    levelRef.current = addition.level;
    setLevel(addition.level);
    setSelectedObjectId(addition.pit.id);
    setSaving(true);
    setEditStatus('正在新增坑洞…');
    const result = await persistLevelAddition(
      currentLevel,
      addition.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: previousSelection,
        label: '新增坑洞',
      });
      setEditStatus(`坑洞 ${addition.pit.id} 已新增并保存`);
    } else {
      setSelectedObjectId(previousSelection);
      setEditStatus('新增坑洞失败，已恢复原关卡');
      onError(toMessage(result.error));
    }
  }

  async function deleteSelectedObject() {
    const currentLevel = levelRef.current;
    const objectId = selectedObjectId;
    if (!currentLevel || !objectId || saving) return;
    const removal = removeLevelObject(currentLevel, objectId);
    const activeProjectId = project.id;
    levelRef.current = removal.level;
    setLevel(removal.level);
    setSelectedObjectId(undefined);
    setSaving(true);
    setEditStatus(`正在删除${OBJECT_LABELS[removal.object.type]}…`);
    const result = await persistLevelDeletion(
      currentLevel,
      removal.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: objectId,
        label: `删除${OBJECT_LABELS[removal.object.type]}`,
      });
      setEditStatus(`${OBJECT_LABELS[removal.object.type]}已删除并保存`);
    } else {
      setSelectedObjectId(objectId);
      setEditStatus('删除失败，已恢复原物体');
      onError(toMessage(result.error));
    }
  }

  async function copySelectedObject() {
    const currentLevel = levelRef.current;
    const objectId = selectedObjectId;
    if (!currentLevel || !objectId || saving) return;
    const copy = copyLevelObject(currentLevel, objectId);
    const activeProjectId = project.id;
    levelRef.current = copy.level;
    setLevel(copy.level);
    setSelectedObjectId(copy.object.id);
    setSaving(true);
    setEditStatus(`正在复制${OBJECT_LABELS[copy.object.type]}…`);
    const result = await persistLevelCopy(currentLevel, copy.level, (next) =>
      saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: objectId,
        label: `复制${OBJECT_LABELS[copy.object.type]}`,
      });
      setEditStatus(`${OBJECT_LABELS[copy.object.type]}已复制并保存`);
    } else {
      setSelectedObjectId(objectId);
      setEditStatus('复制失败，已恢复原关卡');
      onError(toMessage(result.error));
    }
  }

  async function resizeSelectedPlatform(
    direction: PlatformWidthResizeDirection,
  ) {
    const currentLevel = levelRef.current;
    const objectId = selectedObjectId;
    if (!currentLevel || !objectId || saving) return;
    const target = currentLevel.objects.find(
      (object) => object.id === objectId,
    );
    const label =
      target?.type === 'pit'
        ? '坑洞'
        : target?.type === 'moving-platform'
          ? '移动平台'
          : '平台';
    const resize = resizePlatformWidth(currentLevel, objectId, direction);
    const activeProjectId = project.id;
    levelRef.current = resize.level;
    setLevel(resize.level);
    setSaving(true);
    setEditStatus(`正在${direction === 'expand' ? '加宽' : '缩短'}${label}…`);
    const result = await persistPlatformResize(
      currentLevel,
      resize.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: objectId,
        label: `${direction === 'expand' ? '加宽' : '缩短'}${label}`,
      });
      setEditStatus(
        `${label}已${direction === 'expand' ? '加宽' : '缩短'}并保存`,
      );
    } else {
      setEditStatus('宽度保存失败，已恢复原尺寸');
      onError(toMessage(result.error));
    }
  }

  async function resizeSelectedPlatformHeight(
    direction: PlatformHeightResizeDirection,
  ) {
    const currentLevel = levelRef.current;
    const objectId = selectedObjectId;
    if (!currentLevel || !objectId || saving) return;
    const target = currentLevel.objects.find(
      (object) => object.id === objectId,
    );
    const label = target?.type === 'moving-platform' ? '移动平台' : '平台';
    const resize = resizePlatformHeight(currentLevel, objectId, direction);
    const activeProjectId = project.id;
    levelRef.current = resize.level;
    setLevel(resize.level);
    setSaving(true);
    setEditStatus(`正在让${label}${direction === 'expand' ? '变高' : '变矮'}…`);
    const result = await persistPlatformResize(
      currentLevel,
      resize.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: objectId,
        label: `${label}${direction === 'expand' ? '变高' : '变矮'}`,
      });
      setEditStatus(
        `${label}已${direction === 'expand' ? '变高' : '变矮'}并保存`,
      );
    } else {
      setEditStatus('高度保存失败，已恢复原尺寸');
      onError(toMessage(result.error));
    }
  }

  async function resizeSelectedCoinOrSpike(
    direction: CoinOrSpikeResizeDirection,
  ) {
    const currentLevel = levelRef.current;
    const objectId = selectedObjectId;
    if (!currentLevel || !objectId || saving) return;
    const resize = resizeCoinOrSpike(currentLevel, objectId, direction);
    const activeProjectId = project.id;
    levelRef.current = resize.level;
    setLevel(resize.level);
    setSaving(true);
    setEditStatus(`正在${direction === 'expand' ? '放大' : '缩小'}物体…`);
    const result = await persistLevelObjectResize(
      currentLevel,
      resize.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: objectId,
        label: `${direction === 'expand' ? '放大' : '缩小'}${OBJECT_LABELS[resize.object.type]}`,
      });
      setEditStatus(
        `${OBJECT_LABELS[resize.object.type]}已${direction === 'expand' ? '放大' : '缩小'}并保存`,
      );
    } else {
      setEditStatus('大小保存失败，已恢复原尺寸');
      onError(toMessage(result.error));
    }
  }

  async function changeMovingPlatformMovement(
    patch: Parameters<typeof updateMovingPlatformMovement>[2],
    label: string,
  ) {
    const currentLevel = levelRef.current;
    const objectId = selectedObjectId;
    if (!currentLevel || !objectId || saving) return;
    let update;
    try {
      update = updateMovingPlatformMovement(currentLevel, objectId, patch);
    } catch (reason) {
      onError(toMessage(reason));
      return;
    }
    const activeProjectId = project.id;
    levelRef.current = update.level;
    setLevel(update.level);
    setSaving(true);
    setEditStatus(`正在${label}…`);
    const result = await persistLevelObjectResize(
      currentLevel,
      update.level,
      (next) => saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setUndoEntry({
        level: currentLevel,
        selectedObjectId: objectId,
        label,
      });
      setEditStatus(`${label}已保存`);
    } else {
      setEditStatus(`${label}保存失败，已恢复原设置`);
      onError(toMessage(result.error));
    }
  }

  async function undoLastEdit() {
    const currentLevel = levelRef.current;
    const entry = undoEntry;
    if (!currentLevel || !entry || saving) return;
    const currentSelection = selectedObjectId;
    const activeProjectId = project.id;
    levelRef.current = entry.level;
    setLevel(entry.level);
    setSelectedObjectId(entry.selectedObjectId);
    setSaving(true);
    setEditStatus(`正在撤销：${entry.label}…`);
    const result = await persistLevelUndo(currentLevel, entry.level, (next) =>
      saveActiveLevel(activeProjectId, next),
    );
    if (projectIdRef.current !== activeProjectId) {
      setSaving(false);
      return;
    }
    levelRef.current = result.level;
    setLevel(result.level);
    setSaving(false);
    if (result.status === 'saved') {
      setSelectedObjectId(
        entry.selectedObjectId &&
          result.level.objects.some(
            (object) => object.id === entry.selectedObjectId,
          )
          ? entry.selectedObjectId
          : undefined,
      );
      setUndoEntry(undefined);
      setEditStatus(`已撤销：${entry.label}`);
    } else {
      setSelectedObjectId(currentSelection);
      setEditStatus('撤销保存失败，已恢复撤销前状态');
      onError(toMessage(result.error));
    }
  }

  const deleteDisabledReason = getDeleteDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
  );
  const copyDisabledReason = getCopyDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
  );
  const shrinkDisabledReason = getResizeDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
    'shrink',
  );
  const expandDisabledReason = getResizeDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
    'expand',
  );
  const shrinkHeightDisabledReason = getHeightResizeDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
    'shrink',
  );
  const expandHeightDisabledReason = getHeightResizeDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
    'expand',
  );
  const shrinkCoinOrSpikeDisabledReason = getCoinOrSpikeResizeDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
    'shrink',
  );
  const expandCoinOrSpikeDisabledReason = getCoinOrSpikeResizeDisabledReason(
    level,
    selectedObjectId,
    loading,
    saving,
    'expand',
  );
  const widthTargetLabel =
    level?.objects.find((object) => object.id === selectedObjectId)?.type ===
    'pit'
      ? '坑洞'
      : level?.objects.find((object) => object.id === selectedObjectId)
            ?.type === 'moving-platform'
        ? '移动平台'
        : '平台';
  const heightTargetLabel =
    level?.objects.find((object) => object.id === selectedObjectId)?.type ===
    'moving-platform'
      ? '移动平台'
      : '平台';
  const selectedMovingPlatform = level?.objects.find(
    (object) =>
      object.id === selectedObjectId && object.type === 'moving-platform',
  );
  const movingPlatformMovement = selectedMovingPlatform?.movement ?? {
    axis: 'horizontal' as const,
    distance: (level?.gridSize ?? 32) * 4,
    speed: 90,
  };

  return (
    <div className="level-viewer">
      <div className="level-switcher" aria-label="游戏关卡">
        <div className="level-switcher-list">
          {campaign?.levels.map((item, index) => (
            <button
              key={item.id}
              className={item.id === activeLevelId ? 'is-active' : ''}
              disabled={saving}
              onClick={() => selectLevel(item.id)}
            >
              <span>{index + 1}</span>
              {item.name}
            </button>
          ))}
        </div>
        <div className="level-switcher-actions">
          <button
            disabled={loading || saving || !campaign}
            onClick={() => void addLevel()}
          >
            <Plus size={13} /> 新增关卡
          </button>
          <button
            disabled={loading || saving || !activeLevelId}
            onClick={() => void addLevel(activeLevelId)}
          >
            <Copy size={13} /> 复制当前关
          </button>
        </div>
        {campaign && activeLevelId ? (
          <div className="level-ability-panel">
            <div className="level-ability-heading">
              <strong>本关角色能力</strong>
              <small>只影响当前这一关</small>
            </div>
            <label>
              移动速度
              <select
                disabled={saving}
                value={
                  campaign.levels.find((item) => item.id === activeLevelId)
                    ?.abilities.moveSpeed
                }
                onChange={(event) =>
                  void changeAbilities({
                    moveSpeed: Number(event.target.value),
                  })
                }
              >
                <option value={180}>慢</option>
                <option value={240}>标准</option>
                <option value={300}>快</option>
              </select>
            </label>
            <label>
              第一次跳跃
              <select
                disabled={saving}
                value={
                  campaign.levels.find((item) => item.id === activeLevelId)
                    ?.abilities.jumpPower
                }
                onChange={(event) =>
                  void changeAbilities({
                    jumpPower: Number(event.target.value),
                  })
                }
              >
                <option value={520}>低</option>
                <option value={620}>标准</option>
                <option value={720}>高</option>
              </select>
            </label>
            <label className="level-ability-toggle">
              <input
                type="checkbox"
                disabled={saving}
                checked={
                  campaign.levels.find((item) => item.id === activeLevelId)
                    ?.abilities.doubleJumpEnabled ?? false
                }
                onChange={(event) =>
                  void changeAbilities({
                    doubleJumpEnabled: event.target.checked,
                  })
                }
              />
              开启二连跳
            </label>
            <label>
              第二次跳跃
              <select
                disabled={
                  saving ||
                  !campaign.levels.find((item) => item.id === activeLevelId)
                    ?.abilities.doubleJumpEnabled
                }
                value={
                  campaign.levels.find((item) => item.id === activeLevelId)
                    ?.abilities.doubleJumpPower
                }
                onChange={(event) =>
                  void changeAbilities({
                    doubleJumpPower: Number(event.target.value),
                  })
                }
              >
                <option value={480}>低</option>
                <option value={560}>标准</option>
                <option value={660}>高</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>
      <div className="level-toolbar">
        <div>
          <strong>关卡布局</strong>
          <span className={`edit-mode-badge ${saving ? 'is-saving' : ''}`}>
            {saving ? (
              <RefreshCw className="spin" size={11} />
            ) : (
              <Move size={11} />
            )}
            {saving ? '正在保存' : '位置编辑'}
          </span>
          <small className="level-edit-status">{editStatus}</small>
        </div>
        <div className="level-toolbar-actions">
          <button
            className="level-undo"
            title={
              undoEntry ? `撤销：${undoEntry.label}` : '当前没有可撤销的编辑'
            }
            disabled={loading || saving || !level || !undoEntry}
            onClick={() => void undoLastEdit()}
          >
            <Undo2 size={13} /> 撤销
          </button>
          <button
            className="level-add-platform"
            disabled={loading || saving || !level}
            onClick={() => void addPlatform()}
          >
            <Plus size={13} /> 新增平台
          </button>
          <button
            className="level-add-moving-platform"
            disabled={loading || saving || !level}
            onClick={() => void addMovingPlatform()}
          >
            <MoveHorizontal size={13} /> 新增移动平台
          </button>
          <button
            className="level-add-coin"
            disabled={loading || saving || !level}
            onClick={() => void addCoin()}
          >
            <Coins size={13} /> 新增金币
          </button>
          <button
            className="level-add-checkpoint"
            disabled={loading || saving || !level}
            onClick={() => void addCheckpoint()}
          >
            <Flag size={13} /> 新增检查点
          </button>
          <button
            className="level-add-spike"
            disabled={loading || saving || !level}
            onClick={() => void addSpike()}
          >
            <TriangleAlert size={13} /> 新增尖刺
          </button>
          <button
            className="level-add-slime"
            disabled={loading || saving || !level}
            onClick={() => void addEnemy('slime')}
          >
            ● 新增史莱姆
          </button>
          <button
            className="level-add-bee"
            disabled={loading || saving || !level}
            onClick={() => void addEnemy('bee')}
          >
            ◆ 新增蜜蜂
          </button>
          <button
            className="level-add-pit"
            disabled={loading || saving || !level}
            onClick={() => void addPit()}
          >
            <MoveDown size={13} /> 新增坑洞
          </button>
          <button
            className="level-copy-object"
            title={copyDisabledReason ?? '复制当前选中的物体'}
            disabled={Boolean(copyDisabledReason)}
            onClick={() => void copySelectedObject()}
          >
            <Copy size={13} /> 复制
          </button>
          <button
            className="level-resize-platform"
            title={shrinkDisabledReason ?? `把${widthTargetLabel}缩短一个网格`}
            disabled={Boolean(shrinkDisabledReason)}
            onClick={() => void resizeSelectedPlatform('shrink')}
          >
            <Minus size={13} /> 缩短
          </button>
          <button
            className="level-resize-platform"
            title={expandDisabledReason ?? `把${widthTargetLabel}加宽一个网格`}
            disabled={Boolean(expandDisabledReason)}
            onClick={() => void resizeSelectedPlatform('expand')}
          >
            <Plus size={13} /> 加宽
          </button>
          <button
            className="level-resize-platform"
            title={
              shrinkHeightDisabledReason ?? `把${heightTargetLabel}变矮一个网格`
            }
            disabled={Boolean(shrinkHeightDisabledReason)}
            onClick={() => void resizeSelectedPlatformHeight('shrink')}
          >
            <Minus size={13} /> 变矮
          </button>
          <button
            className="level-resize-platform"
            title={
              expandHeightDisabledReason ?? `把${heightTargetLabel}变高一个网格`
            }
            disabled={Boolean(expandHeightDisabledReason)}
            onClick={() => void resizeSelectedPlatformHeight('expand')}
          >
            <Plus size={13} /> 变高
          </button>
          <button
            className="level-resize-object"
            title={
              shrinkCoinOrSpikeDisabledReason ?? '把金币或尖刺缩小一个网格'
            }
            disabled={Boolean(shrinkCoinOrSpikeDisabledReason)}
            onClick={() => void resizeSelectedCoinOrSpike('shrink')}
          >
            <Minus size={13} /> 缩小
          </button>
          <button
            className="level-resize-object"
            title={
              expandCoinOrSpikeDisabledReason ?? '把金币或尖刺放大一个网格'
            }
            disabled={Boolean(expandCoinOrSpikeDisabledReason)}
            onClick={() => void resizeSelectedCoinOrSpike('expand')}
          >
            <Plus size={13} /> 放大
          </button>
          <button
            className="level-delete-object"
            title={deleteDisabledReason ?? '删除当前选中的物体'}
            disabled={Boolean(deleteDisabledReason)}
            onClick={() => void deleteSelectedObject()}
          >
            <Trash2 size={13} /> 删除
          </button>
          <button
            className="level-refresh"
            aria-label="刷新关卡"
            title="刷新关卡"
            disabled={loading || saving}
            onClick={() => void loadLevel()}
          >
            <RefreshCw className={loading ? 'spin' : ''} size={13} />
          </button>
        </div>
      </div>

      {selectedMovingPlatform && level ? (
        <div className="moving-platform-settings">
          <div>
            <strong>移动平台设置</strong>
            <small>{selectedMovingPlatform.id}</small>
          </div>
          <label>
            移动方向
            <select
              disabled={saving}
              value={movingPlatformMovement.axis}
              onChange={(event) =>
                void changeMovingPlatformMovement(
                  {
                    axis: event.target.value as 'horizontal' | 'vertical',
                  },
                  '修改移动方向',
                )
              }
            >
              <option value="horizontal">左右移动</option>
              <option value="vertical">上下移动</option>
            </select>
          </label>
          <label>
            移动距离
            <select
              disabled={saving}
              value={movingPlatformMovement.distance}
              onChange={(event) =>
                void changeMovingPlatformMovement(
                  { distance: Number(event.target.value) },
                  '修改移动距离',
                )
              }
            >
              {[2, 4, 6, 8].map((grids) => (
                <option key={grids} value={level.gridSize * grids}>
                  {grids} 格
                </option>
              ))}
            </select>
          </label>
          <label>
            移动速度
            <select
              disabled={saving}
              value={movingPlatformMovement.speed}
              onChange={(event) =>
                void changeMovingPlatformMovement(
                  { speed: Number(event.target.value) },
                  '修改移动速度',
                )
              }
            >
              <option value={60}>慢</option>
              <option value={90}>标准</option>
              <option value={140}>快</option>
            </select>
          </label>
          <small>设置只影响当前选中的移动平台</small>
        </div>
      ) : null}

      {loading ? (
        <div className="level-viewer-state">
          <RefreshCw className="spin" size={20} />
          <strong>正在读取关卡…</strong>
        </div>
      ) : error ? (
        <div className="level-viewer-state is-error" role="alert">
          <strong>关卡暂时无法显示</strong>
          <p>{error}</p>
          <button onClick={() => void loadLevel()}>重新读取</button>
        </div>
      ) : level ? (
        <>
          <LevelCanvas
            level={level}
            interactive={!saving}
            selectedObjectId={selectedObjectId}
            onClearSelection={() => setSelectedObjectId(undefined)}
            onObjectPointerDown={beginDrag}
            onPointerMove={continueDrag}
            onPointerUp={(event) => void finishDrag(event)}
            onPointerCancel={cancelDrag}
          />
          <LevelLegend level={level} />
          <div className="level-readonly-note">
            可撤销当前会话最近一次成功编辑。撤销成功后记录会清空，不支持重做。
          </div>
        </>
      ) : null}
    </div>
  );
}

interface LevelCanvasProps {
  level: LevelDocument;
  interactive?: boolean;
  selectedObjectId?: string;
  onClearSelection?: () => void;
  onObjectPointerDown?: (
    event: ReactPointerEvent<SVGElement>,
    object: LevelObject,
  ) => void;
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<SVGSVGElement>) => void;
}

export function LevelCanvas({
  level,
  interactive = false,
  selectedObjectId,
  onClearSelection,
  onObjectPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: LevelCanvasProps) {
  const minimumCanvasWidth = Math.max(960, Math.ceil(level.width * 0.5));
  return (
    <div
      className="level-canvas-scroll"
      tabIndex={0}
      aria-label={`${interactive ? '可拖动' : '只读'}关卡画布，可横向滚动`}
    >
      <svg
        className={`level-canvas ${interactive ? 'is-interactive' : 'is-readonly'}`}
        viewBox={`0 0 ${level.width} ${level.height}`}
        style={{ minWidth: `${minimumCanvasWidth}px` }}
        role="img"
        aria-label={`关卡宽 ${level.width}，高 ${level.height}，共 ${level.objects.length} 个物体`}
        onPointerDown={(event) => {
          if (!(event.target as Element).closest('.level-object')) {
            onClearSelection?.();
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <title>
          {interactive ? '横版平台关卡位置编辑' : '横版平台关卡只读预览'}
        </title>
        <defs>
          <pattern
            id="level-grid"
            width={level.gridSize}
            height={level.gridSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${level.gridSize} 0 L 0 0 0 ${level.gridSize}`}
              className="level-grid-line"
              fill="none"
            />
          </pattern>
        </defs>
        <rect
          className="level-canvas-background"
          width={level.width}
          height={level.height}
        />
        <rect
          width={level.width}
          height={level.height}
          fill="url(#level-grid)"
        />
        {level.objects.map((object) => (
          <LevelObjectShape
            key={object.id}
            object={object}
            interactive={interactive}
            selected={selectedObjectId === object.id}
            onPointerDown={onObjectPointerDown}
          />
        ))}
      </svg>
    </div>
  );
}

function LevelObjectShape({
  object,
  interactive,
  selected,
  onPointerDown,
}: {
  object: LevelObject;
  interactive: boolean;
  selected: boolean;
  onPointerDown?: (
    event: ReactPointerEvent<SVGElement>,
    object: LevelObject,
  ) => void;
}) {
  const common = {
    'data-object-id': object.id,
    'data-object-type': object.type,
    className: `level-object level-${object.type === 'player-spawn' ? 'spawn' : object.type} ${selected ? 'is-selected' : ''}`,
    onPointerDown: interactive
      ? (event: ReactPointerEvent<SVGElement>) => onPointerDown?.(event, object)
      : undefined,
  };
  switch (object.type) {
    case 'player-spawn':
      return (
        <g {...common}>
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            rx={Math.min(12, object.width / 4)}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y - 10}
            textAnchor="middle"
          >
            出生
          </text>
        </g>
      );
    case 'platform':
      return (
        <g {...common}>
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
          />
          <line
            x1={object.x}
            y1={object.y}
            x2={object.x + object.width}
            y2={object.y}
          />
        </g>
      );
    case 'moving-platform':
      return (
        <g {...common}>
          <line
            className="level-moving-track"
            x1={
              object.movement?.axis === 'vertical'
                ? object.x + object.width / 2
                : object.x +
                  object.width / 2 -
                  (object.movement?.distance ?? 128)
            }
            y1={
              object.movement?.axis === 'vertical'
                ? object.y +
                  object.height / 2 -
                  (object.movement?.distance ?? 128)
                : object.y + object.height / 2
            }
            x2={
              object.movement?.axis === 'vertical'
                ? object.x + object.width / 2
                : object.x +
                  object.width / 2 +
                  (object.movement?.distance ?? 128)
            }
            y2={
              object.movement?.axis === 'vertical'
                ? object.y +
                  object.height / 2 +
                  (object.movement?.distance ?? 128)
                : object.y + object.height / 2
            }
          />
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
          />
          <line
            x1={object.x}
            y1={object.y}
            x2={object.x + object.width}
            y2={object.y}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y + object.height / 2}
            dominantBaseline="central"
            textAnchor="middle"
          >
            {object.movement?.axis === 'vertical' ? '↕' : '↔'}
          </text>
          <text
            className="level-moving-label"
            x={object.x + object.width / 2}
            y={object.y - 12}
            textAnchor="middle"
          >
            移动平台
          </text>
        </g>
      );
    case 'spike':
      return (
        <polygon
          {...common}
          points={`${object.x},${object.y + object.height} ${object.x + object.width / 2},${object.y} ${object.x + object.width},${object.y + object.height}`}
        />
      );
    case 'slime':
      return (
        <g {...common}>
          <ellipse
            cx={object.x + object.width / 2}
            cy={object.y + object.height * 0.62}
            rx={object.width * 0.44}
            ry={object.height * 0.36}
          />
          <circle
            cx={object.x + object.width * 0.36}
            cy={object.y + object.height * 0.48}
            r={Math.max(2, object.width * 0.06)}
          />
          <circle
            cx={object.x + object.width * 0.64}
            cy={object.y + object.height * 0.48}
            r={Math.max(2, object.width * 0.06)}
          />
        </g>
      );
    case 'bee':
      return (
        <g {...common}>
          <ellipse
            cx={object.x + object.width * 0.32}
            cy={object.y + object.height * 0.28}
            rx={object.width * 0.2}
            ry={object.height * 0.2}
            className="level-bee-wing"
          />
          <ellipse
            cx={object.x + object.width * 0.68}
            cy={object.y + object.height * 0.28}
            rx={object.width * 0.2}
            ry={object.height * 0.2}
            className="level-bee-wing"
          />
          <ellipse
            cx={object.x + object.width / 2}
            cy={object.y + object.height * 0.58}
            rx={object.width * 0.36}
            ry={object.height * 0.26}
          />
          <line
            x1={object.x + object.width * 0.42}
            y1={object.y + object.height * 0.34}
            x2={object.x + object.width * 0.42}
            y2={object.y + object.height * 0.81}
          />
          <line
            x1={object.x + object.width * 0.58}
            y1={object.y + object.height * 0.34}
            x2={object.x + object.width * 0.58}
            y2={object.y + object.height * 0.81}
          />
        </g>
      );
    case 'coin':
      return (
        <g {...common}>
          <circle
            cx={object.x + object.width / 2}
            cy={object.y + object.height / 2}
            r={Math.min(object.width, object.height) / 2}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y + object.height / 2}
            dominantBaseline="central"
            textAnchor="middle"
          >
            ·
          </text>
        </g>
      );
    case 'keycard':
      return (
        <g {...common}>
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            rx={Math.min(8, object.height / 4)}
          />
          <circle
            cx={object.x + object.width * 0.78}
            cy={object.y + object.height / 2}
            r={Math.max(2, object.height * 0.14)}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y - 10}
            textAnchor="middle"
          >
            蓝色门卡
          </text>
        </g>
      );
    case 'security-door':
      return (
        <g {...common}>
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            rx={Math.min(10, object.width / 5)}
          />
          <line
            x1={object.x + object.width / 2}
            y1={object.y + 8}
            x2={object.x + object.width / 2}
            y2={object.y + object.height - 8}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y - 10}
            textAnchor="middle"
          >
            安全门
          </text>
        </g>
      );
    case 'floor-switch':
      return (
        <g {...common}>
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            rx={Math.min(8, object.height / 3)}
          />
          <circle
            cx={object.x + object.width / 2}
            cy={object.y + object.height / 2}
            r={Math.max(3, Math.min(object.height, object.width) * 0.18)}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y - 10}
            textAnchor="middle"
          >
            控制开关
          </text>
        </g>
      );
    case 'laser-gate':
      return (
        <g {...common}>
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
          />
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={object.x + object.width * ratio}
              y1={object.y + 8}
              x2={object.x + object.width * ratio}
              y2={object.y + object.height - 8}
            />
          ))}
          <text
            x={object.x + object.width / 2}
            y={object.y - 10}
            textAnchor="middle"
          >
            激光门
          </text>
        </g>
      );
    case 'checkpoint':
      return (
        <g {...common}>
          <line
            x1={object.x + object.width * 0.25}
            y1={object.y}
            x2={object.x + object.width * 0.25}
            y2={object.y + object.height}
          />
          <path
            d={`M ${object.x + object.width * 0.25} ${object.y} H ${object.x + object.width} L ${object.x + object.width * 0.72} ${object.y + object.height * 0.32} H ${object.x + object.width * 0.25} Z`}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y - 10}
            textAnchor="middle"
          >
            检查点
          </text>
        </g>
      );
    case 'goal':
      return (
        <g {...common}>
          <line
            x1={object.x + 8}
            y1={object.y}
            x2={object.x + 8}
            y2={object.y + object.height}
          />
          <path
            d={`M ${object.x + 8} ${object.y} H ${object.x + object.width} L ${object.x + object.width * 0.72} ${object.y + object.height * 0.3} H ${object.x + 8} Z`}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y - 10}
            textAnchor="middle"
          >
            终点
          </text>
        </g>
      );
    case 'pit':
      return (
        <g {...common}>
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
          />
          <text
            x={object.x + object.width / 2}
            y={object.y + 30}
            textAnchor="middle"
          >
            坑洞
          </text>
        </g>
      );
    default:
      return null;
  }
}

function LevelLegend({ level }: { level: LevelDocument }) {
  return (
    <div className="level-legend" aria-label="关卡图例">
      {Object.entries(OBJECT_LABELS).map(([type, label]) => (
        <span key={type}>
          <i className={`legend-${type}`} />
          {label}
          <small>
            {level.objects.filter((object) => object.type === type).length}
          </small>
        </span>
      ))}
    </div>
  );
}

function toMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    '',
  );
}

function getDeleteDisabledReason(
  level: LevelDocument | null,
  selectedObjectId: string | undefined,
  loading: boolean,
  saving: boolean,
): string | undefined {
  if (loading) return '正在读取关卡';
  if (saving) return '正在保存，请稍候';
  if (!level) return '关卡暂时不可用';
  if (!selectedObjectId) return '请先在画布中选择一个物体';
  return getLevelObjectDeletionBlockReason(level, selectedObjectId);
}

function getCopyDisabledReason(
  level: LevelDocument | null,
  selectedObjectId: string | undefined,
  loading: boolean,
  saving: boolean,
): string | undefined {
  if (loading) return '正在读取关卡';
  if (saving) return '正在保存，请稍候';
  if (!level) return '关卡暂时不可用';
  if (!selectedObjectId) return '请先在画布中选择一个物体';
  return getLevelObjectCopyBlockReason(level, selectedObjectId);
}

function getResizeDisabledReason(
  level: LevelDocument | null,
  selectedObjectId: string | undefined,
  loading: boolean,
  saving: boolean,
  direction: PlatformWidthResizeDirection,
): string | undefined {
  if (loading) return '正在读取关卡';
  if (saving) return '正在保存，请稍候';
  if (!level) return '关卡暂时不可用';
  if (!selectedObjectId) return '请先在画布中选择一个普通平台';
  return getPlatformWidthResizeBlockReason(level, selectedObjectId, direction);
}

function getHeightResizeDisabledReason(
  level: LevelDocument | null,
  selectedObjectId: string | undefined,
  loading: boolean,
  saving: boolean,
  direction: PlatformHeightResizeDirection,
): string | undefined {
  if (loading) return '正在读取关卡';
  if (saving) return '正在保存，请稍候';
  if (!level) return '关卡暂时不可用';
  if (!selectedObjectId) return '请先在画布中选择一个普通平台';
  return getPlatformHeightResizeBlockReason(level, selectedObjectId, direction);
}

function getCoinOrSpikeResizeDisabledReason(
  level: LevelDocument | null,
  selectedObjectId: string | undefined,
  loading: boolean,
  saving: boolean,
  direction: CoinOrSpikeResizeDirection,
): string | undefined {
  if (loading) return '正在读取关卡';
  if (saving) return '正在保存，请稍候';
  if (!level) return '关卡暂时不可用';
  if (!selectedObjectId) return '请先在画布中选择金币或尖刺';
  return getCoinOrSpikeResizeBlockReason(level, selectedObjectId, direction);
}
