// c:\Users\gyc\Documents\trae_projects\ss\Yier&Bubu\src\systems\CameraManager.ts
import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';

type FollowTarget = Phaser.GameObjects.GameObject & { x: number; y: number };

export class CameraManager {
  static attach(scene: Phaser.Scene, target: FollowTarget): void {
    const camera = scene.cameras.main;

    const apply = (): void => {
      const width = scene.scale.width;
      const height = scene.scale.height;
      // 纵向视野锁定 540 世界单位，宽屏只增加横向可视范围；World 单位永不缩放。
      const zoom = Math.min(height / DESIGN_HEIGHT, width / DESIGN_WIDTH);
      const viewWidth = width / zoom;
      const viewHeight = height / zoom;
      camera
        .setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
        .setZoom(zoom)
        .setDeadzone(Math.min(300, viewWidth * 0.42), Math.min(100, viewHeight * 0.24));
    };

    apply();
    camera.startFollow(target, true, 0.1, 0.1, -110, 70).setRoundPixels(true);
    scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, apply);
    });
  }
}
