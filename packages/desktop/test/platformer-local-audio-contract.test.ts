import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_SFX,
  mayPlayLocalSfx,
} from '../../../agent-test/templates/modules/platformer/src/localSfx.js';

const scene = readFileSync(
  new URL(
    '../../../agent-test/templates/modules/platformer/src/scenes/VisualLevelScene.ts',
    import.meta.url,
  ),
  'utf8',
);
const config = readFileSync(
  new URL(
    '../../../agent-test/templates/modules/platformer/src/localSfx.ts',
    import.meta.url,
  ),
  'utf8',
);
const templateAudioDirectory = new URL(
  '../../../agent-test/templates/core/public/assets/audio/',
  import.meta.url,
);
const previewAudioDirectory = new URL(
  '../../../preview-assets/local-sfx/',
  import.meta.url,
);

const audioFiles = [
  'jump.wav',
  'coin.wav',
  'death.wav',
  'level-clear.wav',
  'enemy-hit.wav',
  'checkpoint.wav',
];

describe('固定横版模板本地音效契约', () => {
  it('打包六个已经确认且内容未改变的 WAV', () => {
    for (const file of audioFiles) {
      const templateUrl = new URL(file, templateAudioDirectory);
      const previewUrl = new URL(file, previewAudioDirectory);
      expect(existsSync(templateUrl), `${file} 缺少模板文件`).toBe(true);
      const templateBytes = readFileSync(templateUrl);
      const previewBytes = readFileSync(previewUrl);
      expect(templateBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(templateBytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
      expect({
        file: basename(templateUrl.pathname),
        hash: sha256(templateBytes),
      }).toEqual({
        file: basename(templateUrl.pathname),
        hash: sha256(previewBytes),
      });
    }
  });

  it('只使用本地相对路径并为六个声音设置受控音量和间隔', () => {
    expect(config).not.toMatch(/https?:\/\/|fetch\(|apiKey|API_KEY/);
    expect(config.match(/assetKey:/g)).toHaveLength(6);
    expect(config.match(/resolveLocalSfxPath\('/g)).toHaveLength(6);
    expect(config).toContain("'assets/audio/custom/jump.mp3'");
    expect(config).toContain("'assets/audio/custom/jump.wav'");
    expect(config).toContain('mayPlayLocalSfx');
    expect(Object.values(LOCAL_SFX)).toHaveLength(6);
    for (const sound of Object.values(LOCAL_SFX)) {
      expect(sound.path).toMatch(/^assets\/audio\/[a-z-]+\.wav$/);
      expect(sound.volume).toBeGreaterThan(0);
      expect(sound.volume).toBeLessThanOrEqual(0.6);
      expect(sound.minimumIntervalMs).toBeGreaterThanOrEqual(60);
    }
    expect(mayPlayLocalSfx(undefined, 1_000, 100)).toBe(true);
    expect(mayPlayLocalSfx(1_000, 1_099, 100)).toBe(false);
    expect(mayPlayLocalSfx(1_000, 1_100, 100)).toBe(true);
  });

  it('在场景预加载六个声音并通过单一安全入口播放', () => {
    expect(scene).toContain("from '../localSfx'");
    expect(scene).toContain('Object.values(LOCAL_SFX)');
    expect(scene).toContain('this.load.audio(sound.assetKey, sound.path)');
    expect(scene).toContain('private playLocalSfx(name: LocalSfxName)');
    expect(scene).toContain('if (this.sound.locked) return;');
    expect(scene).toContain('this.cache.audio.exists(sound.assetKey)');
    expect(scene).toContain('mayPlayLocalSfx(');
  });

  it('提供可保存的总开关和四档音量控制', () => {
    expect(scene).toContain(
      "`游戏音效：${this.preferences.soundEnabled ? '开启' : '关闭'}`",
    );
    expect(scene).toContain(
      '`音效音量：${Math.round(this.preferences.soundVolume * 100)}%`',
    );
    expect(scene).toContain("this.togglePreference('soundEnabled')");
    expect(scene).toContain('getNextSoundVolume(this.preferences.soundVolume)');
    expect(scene).toContain('if (!this.preferences.soundEnabled) return;');
    expect(scene).toContain('sound.volume * this.preferences.soundVolume');
  });

  it('分别绑定跳跃、金币、死亡、通关、踩敌人和检查点', () => {
    for (const name of [
      'jump',
      'coin',
      'death',
      'levelClear',
      'enemyHit',
      'checkpoint',
    ]) {
      expect(scene).toContain(`this.playLocalSfx('${name}')`);
    }
  });
});

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
