import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config/constants';

/**
 * 为菜单类场景提供统一的设计坐标视口。
 * Canvas 使用设备实际尺寸，场景保持 960×540 的设计比例；宽高比不同时展示额外背景区域。
 */
export class ViewportManager {
  static attach(
    scene: Phaser.Scene,
    backgroundColor = 0x9ed8ff,
    designWidth = DESIGN_WIDTH,
    designHeight = DESIGN_HEIGHT,
  ): void {
    const resize = (): void => {
      const width = scene.scale.width;
      const height = scene.scale.height;
      const zoom = Math.min(width / designWidth, height / designHeight);
      const camera = scene.cameras.main;
      camera
        .setViewport(0, 0, width, height)
        .setZoom(zoom)
        .setBackgroundColor(backgroundColor)
        .centerOn(designWidth / 2, designHeight / 2);
    };

    resize();
    scene.scale.on(Phaser.Scale.Events.RESIZE, resize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, resize);
    });
  }
}
