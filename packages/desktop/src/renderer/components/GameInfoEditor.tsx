import { RefreshCw, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GAME_SUBTITLE_MAX_LENGTH,
  GAME_TITLE_MAX_LENGTH,
  parseGameInfo,
  type GameInfo,
} from '../../shared/gameInfo';
import type { ProjectRecord } from '../../shared/types';

interface GameInfoEditorProps {
  project: ProjectRecord;
  refreshToken: number;
  onError: (message: string) => void;
}

export function GameInfoEditor({
  project,
  refreshToken,
  onError,
}: GameInfoEditorProps) {
  const [savedInfo, setSavedInfo] = useState<GameInfo>();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('正在读取游戏信息…');
  const projectIdRef = useRef(project.id);
  projectIdRef.current = project.id;

  const dirty = useMemo(
    () =>
      savedInfo !== undefined &&
      (title !== savedInfo.title || subtitle !== savedInfo.subtitle),
    [savedInfo, subtitle, title],
  );

  useEffect(() => {
    let cancelled = false;
    const activeProjectId = project.id;
    setLoading(true);
    setSaving(false);
    setSavedInfo(undefined);
    setTitle('');
    setSubtitle('');
    setPreviewUrl('');
    setStatus('正在读取游戏信息…');
    void Promise.all([
      window.gameAgent.loadGameInfo(activeProjectId),
      window.gameAgent.startPreview(activeProjectId),
    ])
      .then(([gameInfo, url]) => {
        if (cancelled || projectIdRef.current !== activeProjectId) return;
        setSavedInfo(gameInfo);
        setTitle(gameInfo.title);
        setSubtitle(gameInfo.subtitle);
        setPreviewUrl(withFreshGameHome(url));
        setStatus('右侧显示的是玩家真正打开游戏时看到的首页');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = toMessage(error);
        setStatus('游戏信息载入失败');
        onError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onError, project.id, refreshToken]);

  async function save() {
    if (saving || loading) return;
    const activeProjectId = project.id;
    let next: GameInfo;
    try {
      next = parseGameInfo({ version: 1, title, subtitle });
    } catch (error) {
      const message = toMessage(error);
      setStatus(message);
      onError(message);
      return;
    }
    setSaving(true);
    setStatus('正在保存并刷新玩家首页…');
    try {
      const saved = await window.gameAgent.saveGameInfo(activeProjectId, next);
      const url = await window.gameAgent.startPreview(activeProjectId);
      if (projectIdRef.current !== activeProjectId) return;
      setSavedInfo(saved);
      setTitle(saved.title);
      setSubtitle(saved.subtitle);
      setPreviewUrl(withFreshGameHome(url));
      setStatus('已保存，右侧玩家首页已经刷新');
    } catch (error) {
      if (projectIdRef.current !== activeProjectId) return;
      const message = toMessage(error);
      setStatus('保存失败，原来的游戏信息没有改变');
      onError(message);
    } finally {
      if (projectIdRef.current === activeProjectId) setSaving(false);
    }
  }

  function restore() {
    if (!savedInfo || saving) return;
    setTitle(savedInfo.title);
    setSubtitle(savedInfo.subtitle);
    setStatus('已经恢复为上次保存的内容');
  }

  return (
    <div className="game-info-editor">
      <section className="game-info-form" aria-label="编辑游戏信息">
        <header>
          <div>
            <span>PLAYER HOME</span>
            <strong>游戏名称和简介</strong>
          </div>
          <small>这里修改的是玩家看到的内容，不会改变关卡。</small>
        </header>

        <label>
          <span>
            游戏名称
            <small>
              {title.length} / {GAME_TITLE_MAX_LENGTH}
            </small>
          </span>
          <input
            value={title}
            maxLength={GAME_TITLE_MAX_LENGTH}
            disabled={loading || saving}
            placeholder="例如：小蓝的天空冒险"
            onChange={(event) => {
              setTitle(event.target.value);
              setStatus('内容有修改，点击保存后玩家才能看到');
            }}
          />
        </label>

        <label>
          <span>
            一句话简介
            <small>
              {subtitle.length} / {GAME_SUBTITLE_MAX_LENGTH}
            </small>
          </span>
          <textarea
            value={subtitle}
            maxLength={GAME_SUBTITLE_MAX_LENGTH}
            rows={4}
            disabled={loading || saving}
            placeholder="简单告诉玩家要做什么"
            onChange={(event) => {
              setSubtitle(event.target.value);
              setStatus('内容有修改，点击保存后玩家才能看到');
            }}
          />
        </label>

        <div className="game-info-help">
          <strong>怎么写比较好？</strong>
          <p>名称尽量短、容易记；简介只说清楚玩家要做什么。</p>
        </div>

        <div className="game-info-actions">
          <button disabled={!dirty || saving || loading} onClick={restore}>
            <RotateCcw size={14} />
            放弃修改
          </button>
          <button
            className="is-primary"
            disabled={!dirty || saving || loading}
            onClick={() => void save()}
          >
            {saving ? (
              <RefreshCw className="spin" size={14} />
            ) : (
              <Save size={14} />
            )}
            {saving ? '正在保存' : '保存并刷新首页'}
          </button>
        </div>
        <p className={dirty ? 'game-info-status is-dirty' : 'game-info-status'}>
          {status}
        </p>
      </section>

      <section className="game-info-preview" aria-label="玩家首页预览">
        <header>
          <div>
            <strong>玩家首页预览</strong>
            <small>这是真实游戏，不是示意图</small>
          </div>
          <button
            aria-label="刷新玩家首页预览"
            title="刷新玩家首页预览"
            disabled={!previewUrl || loading || saving}
            onClick={() =>
              setPreviewUrl((current) =>
                current ? withFreshGameHome(current) : current,
              )
            }
          >
            <RefreshCw size={14} />
          </button>
        </header>
        {previewUrl ? (
          <iframe
            key={previewUrl}
            src={previewUrl}
            title={`${project.name} 玩家首页预览`}
            sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          />
        ) : (
          <div className="game-info-preview-loading">
            <RefreshCw className={loading ? 'spin' : ''} size={22} />
            <span>
              {loading ? '正在打开玩家首页…' : '玩家首页暂时无法显示'}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function withFreshGameHome(value: string): string {
  const url = new URL(value);
  url.searchParams.delete('liimitStartLevel');
  url.searchParams.set('liimitGameHomePreview', String(Date.now()));
  return url.toString();
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
