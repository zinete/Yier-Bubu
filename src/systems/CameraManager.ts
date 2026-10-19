// c:\Users\gyc\Documents\trae_projects\ss\Yier&Bubu\src\systems\CameraManager.ts
import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/constants';
import { worldCameraView } from './CameraViewport';

type FollowTarget = Phaser.GameObjects.GameObject & { x: number; y: number };

export class CameraManager {
  static attach(scene: Phaser.Scene, target: FollowTarget, worldWidth = WORLD_WIDTH): void {
    const camera = scene.cameras.main;

    const apply = (): void => {
      const width = scene.scale.width;
      const height = scene.scale.height;
      // 保留至少 960×540 的基准视野，宽屏增加横向、窄屏增加纵向范围；World 坐标不变。
      const { zoom, width: viewWidth, height: viewHeight } = worldCameraView(width, height);
      camera
        .setBounds(0, 0, worldWidth, WORLD_HEIGHT)
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
