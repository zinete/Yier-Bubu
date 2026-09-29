import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { StartScene } from '../scenes/StartScene';
import { GameScene } from '../scenes/GameScene';
import { UIScene } from '../scenes/UIScene';
import { ResultScene } from '../scenes/ResultScene';
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#9ed8ff',
  input: { activePointers: 4 },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: import.meta.env.DEV } },
  // 画布始终等于设备视口（CSS 像素）；World 视野由 CameraManager 管理，UI 由 UILayout 管理。
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    autoRound: true,
  },
  render: { roundPixels: true, antialias: true },
  scene: [BootScene, PreloadScene, StartScene, GameScene, UIScene, ResultScene],
};
