import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { StartScene } from '../scenes/StartScene';
import { GameScene } from '../scenes/GameScene';
import { UIScene } from '../scenes/UIScene';
import { ResultScene } from '../scenes/ResultScene';
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#9ed8ff',
  input: { activePointers: 4 },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: import.meta.env.DEV } },
  // 让画布使用设备当前可用视口，不以固定 16:9 尺寸留黑边或白边。
  scale: {
    mode: Phaser.Scale.FIT,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
  },
  render: { roundPixels: true, antialias: true },
  scene: [BootScene, PreloadScene, StartScene, GameScene, UIScene, ResultScene],
  callbacks: {
    postBoot: (game) => {
      game.registry.set('worldBounds', new Phaser.Geom.Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT));
    },
  },
};
