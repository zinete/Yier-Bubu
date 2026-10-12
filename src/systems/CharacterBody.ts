import Phaser from 'phaser';
import type { CharacterId } from '../types/game';

// 合并同一角色所有动画帧的非透明区域，生成固定的纹理坐标碰撞框。
// 不逐帧改变物理尺寸，以免跑跳动画造成碰撞框和落地点抖动。
export function characterBodyBounds(
  texture: Phaser.Textures.Texture,
  character: CharacterId,
): { x: number; y: number; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const firstFrame = character === 'yier' ? 0 : 16;
  const frame = texture.get(firstFrame);
  canvas.width = frame.cutWidth;
  canvas.height = frame.cutHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法计算角色碰撞范围');
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = firstFrame; index < firstFrame + 16; index += 1) {
    const current = texture.get(index);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      current.source.image as CanvasImageSource,
      current.cutX, current.cutY, current.cutWidth, current.cutHeight,
      0, 0, canvas.width, canvas.height,
    );
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
