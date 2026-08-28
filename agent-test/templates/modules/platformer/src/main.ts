import Phaser from 'phaser';
import { screenSize, debugConfig, renderConfig } from './gameConfig.json';
import { VisualLevelScene } from './scenes/VisualLevelScene';
import './styles/tailwind.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: screenSize.width.value,
  height: screenSize.height.value,
  backgroundColor: '#101820',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1200 },
      debug: debugConfig.debug.value,
    },
  },
  pixelArt: renderConfig.pixelArt.value,
  scene: [VisualLevelScene],
};

new Phaser.Game(config);
