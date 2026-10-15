import Phaser from 'phaser';
import type { LevelData } from '../types/game';
import type { SceneTheme } from './CustomMap';
import { SCENE_PALETTES, backdropLayers } from './SceneBackdrop';

/** 绘本森林：代码绘制的分层场景，碰撞仍由关卡数据管理。 */
export function buildForest(scene: Phaser.Scene, level: LevelData, title?: string, theme: SceneTheme = 'forest', customBackground = false, parallax = 0.2): void {
  const palette = SCENE_PALETTES[theme];
  const skyKey = `scene-sky-${theme}`;
  if (!scene.textures.exists(skyKey)) {
    const texture = scene.textures.createCanvas(skyKey, 32, 540)!;
    const gradient = texture.context.createLinearGradient(0, 0, 0, 540);
    gradient.addColorStop(0, palette.sky[0]);
    gradient.addColorStop(0.55, palette.sky[1]);
    gradient.addColorStop(1, palette.sky[2]);
    texture.context.fillStyle = gradient;
    texture.context.fillRect(0, 0, 32, 540);
    texture.refresh();
  }
  scene.add.image(0, 0, skyKey).setOrigin(0).setDisplaySize(level.width + 2000, 540).setScrollFactor(0).setDepth(-30);
  if (!customBackground) {
    for (const layer of backdropLayers(theme, parallax)) {
      const graphics = scene.add.graphics().setScrollFactor(layer.parallax).setDepth(layer.depth);
      const start = layer.repeat ? -layer.repeat : 0;
      const end = layer.repeat ? level.width + 1800 : 1;
      for (let offset = start; offset < end; offset += layer.repeat || 1) {
        for (const shape of layer.shapes) {
          graphics.fillStyle(shape.color, shape.alpha);
          if (shape.kind === 'circle') graphics.fillCircle(shape.x + offset, shape.y, shape.width / 2);
          else if (shape.kind === 'ellipse') graphics.fillEllipse(shape.x + offset, shape.y, shape.width, shape.height);
          else graphics.fillRoundedRect(shape.x + offset, shape.y, shape.width, shape.height, shape.radius ?? 0);
        }
      }
    }
  }
  const art = scene.add.graphics().setDepth(-2);
  for (const platform of level.platforms) {
    if (level.id === 'custom') continue;
    const { x, y, width, height, kind } = platform;
    art.fillStyle(0x715847).fillRoundedRect(x, y + 5, width, height, 10);
    art.fillStyle(palette.earth).fillRoundedRect(x, y + 8, width, height - 8, 10);
    art.fillStyle(0xdeb587).fillRoundedRect(x + 5, y + 10, width - 10, 10, 4);
    art.fillStyle(palette.top).fillRoundedRect(x - 2, y, width + 4, 13, 6);
    art.fillStyle(palette.light).fillRoundedRect(x, y, width, 5, 3);
    if (kind === 'ground' && theme === 'forest') {
      for (let px = x + 16; px < x + width - 10; px += 55) {
        art.fillStyle(0xa17a56, 0.5).fillEllipse(px, y + 43 + (px % 23), 18, 10);
        art.lineStyle(2, 0x71964e).lineBetween(px, y, px - 4, y - 8);
        art.lineBetween(px, y, px + 5, y - 11);
      }
      for (let px = x + 45; px < x + width - 20; px += 145) {
        art.fillStyle(0x80a75a).fillEllipse(px, y - 7, 36, 17);
        for (let petal = 0; petal < 5; petal += 1)
          art.fillStyle(0xfff5d7).fillCircle(px + Math.cos(petal * 1.256) * 5, y - 15 + Math.sin(petal * 1.256) * 5, 4);
        art.fillStyle(0xefbc69).fillCircle(px, y - 15, 3);
      }
    }
  }
  // 首屏树与路牌属于装饰，不改变主线路径。
  for (const x of customBackground ? [] : [25, 695, 1470, 2330, 3065, 3910]) {
    const tree = scene.add.graphics().setDepth(-3);
    if (theme === 'desert') {
      tree.fillStyle(palette.leaf).fillRoundedRect(x, 320, 22, 124, 10);
      tree.fillRoundedRect(x - 27, 355, 32, 16, 7).fillRoundedRect(x - 27, 325, 13, 43, 6);
      tree.fillRoundedRect(x + 12, 378, 32, 16, 7).fillRoundedRect(x + 32, 345, 13, 45, 6);
      continue;
    }
    tree.fillStyle(0x927451).fillRoundedRect(x, 225, 38, 219, 15);
    tree.lineStyle(3, 0xb39765).lineBetween(x + 12, 270, x + 10, 415);
    tree.fillStyle(0x679466).fillCircle(x + 18, 212, 80);
    tree.fillStyle(palette.leaf).fillCircle(x - 20, 180, 64);
    tree.fillStyle(theme === 'snow' ? 0xe6f3ff : palette.light).fillCircle(x + 42, 162, 62);
    tree.fillStyle(0xc2d795, 0.5).fillEllipse(x + 30, 139, 58, 26);
  }
  const sign = scene.add.graphics().setDepth(1);
  sign.fillStyle(0x8d7452).fillRoundedRect(170, 364, 8, 80, 3);
  sign.fillStyle(0xfff1cc).fillRoundedRect(125, 350, 100, 37, 8);
  sign.lineStyle(2, 0xb29264).strokeRoundedRect(125, 350, 100, 37, 8);
  const themeTitle = { forest: '星光森林', snow: '雪境漫步', desert: '沙丘旅程', night: '星夜奇遇' }[theme];
  scene.add.text(175, 368, `${themeTitle} →`, { fontSize: '14px', color: '#72563b', fontStyle: 'bold' }).setOrigin(0.5).setDepth(2);
  scene.add.text(105, 225, 'CHAPTER ' + level.id, { fontSize: '12px', color: '#557960', letterSpacing: 3 }).setDepth(1);
  scene.add.text(103, 247, title ?? (level.id === '1-1' ? themeTitle : '林间的约定'), { fontSize: '30px', color: theme === 'night' ? '#fff1ce' : '#3b654d', fontStyle: 'bold', wordWrap: { width: 350 } }).setDepth(1);
  scene.add.text(105, 286, '拾起星光，和你一起向前', { fontSize: '13px', color: '#69806a' }).setDepth(1);
}
