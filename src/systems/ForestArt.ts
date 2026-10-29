import Phaser from 'phaser';
import type { LevelData } from '../types/game';
import type { SceneTheme } from './CustomMap';
import { SCENE_PALETTES, backdropLayers } from './SceneBackdrop';
import { mountViewportDrawing, visibleRepeats, visibleSequence } from './ViewportArt';
import { mountThemeBackground } from './ThemeBackground';

/** 绘本森林：代码绘制的分层场景，碰撞仍由关卡数据管理。 */
export function buildForest(scene: Phaser.Scene, level: LevelData, title?: string, theme: SceneTheme = 'forest', customBackground = false,
  parallax = 0.2, editableLayers = false, scenerySeed?: number): void {
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
  const backgroundSeed = scenerySeed ?? `${level.id}:${title ?? ''}`;
  const mountedArtwork = !customBackground && mountThemeBackground(scene, theme, parallax, backgroundSeed);
  if (!customBackground && !mountedArtwork) {
    for (const layer of backdropLayers(theme, parallax, backgroundSeed)) {
      const minX = Math.min(...layer.shapes.map((s) => s.kind === 'rect' ? s.x : s.x - s.width / 2));
      const maxX = Math.max(...layer.shapes.map((s) => s.kind === 'rect' ? s.x + s.width : s.x + s.width / 2));
      mountViewportDrawing(scene, layer.parallax, (graphics, view) => {
      for (const offset of visibleRepeats(view, layer.repeat, minX, maxX)) {
        for (const shape of layer.shapes) {
          const left = shape.kind === 'rect' ? shape.x + offset : shape.x + offset - shape.width / 2;
          const right = shape.kind === 'rect' ? left + shape.width : shape.x + offset + shape.width / 2;
          if (right < view.x || left > view.x + view.width) continue;
          graphics.fillStyle(shape.color, shape.alpha);
          if (shape.kind === 'circle') graphics.fillCircle(shape.x + offset, shape.y, shape.width / 2);
          else if (shape.kind === 'ellipse') graphics.fillEllipse(shape.x + offset, shape.y, shape.width, shape.height);
          else graphics.fillRoundedRect(shape.x + offset, shape.y, shape.width, shape.height, shape.radius ?? 0);
        }
      }
      }).setDepth(layer.depth);
    }
  }
  mountViewportDrawing(scene, 1, (art, view) => {
  for (const platform of level.platforms) {
    if (level.id === 'custom' || platform.awakening) continue;
    const { x, y, width, height, kind } = platform;
    if (x + width < view.x || x > view.x + view.width) continue;
    art.fillStyle(0x715847).fillRoundedRect(x, y + 5, width, height, 10);
    art.fillStyle(palette.earth).fillRoundedRect(x, y + 8, width, height - 8, 10);
    art.fillStyle(0xdeb587).fillRoundedRect(x + 5, y + 10, width - 10, 10, 4);
    art.fillStyle(palette.top).fillRoundedRect(x - 2, y, width + 4, 13, 6);
    art.fillStyle(palette.light).fillRoundedRect(x, y, width, 5, 3);
    if (kind === 'ground' && theme === 'forest') {
      for (const px of visibleSequence(x + 16, x + width - 10, 55, view)) {
        art.fillStyle(0xa17a56, 0.5).fillEllipse(px, y + 43 + (px % 23), 18, 10);
        art.lineStyle(2, 0x71964e).lineBetween(px, y, px - 4, y - 8);
        art.lineBetween(px, y, px + 5, y - 11);
      }
      for (const px of visibleSequence(x + 45, x + width - 20, 145, view)) {
        art.fillStyle(0x80a75a).fillEllipse(px, y - 7, 36, 17);
        for (let petal = 0; petal < 5; petal += 1)
          art.fillStyle(0xfff5d7).fillCircle(px + Math.cos(petal * 1.256) * 5, y - 15 + Math.sin(petal * 1.256) * 5, 4);
        art.fillStyle(0xefbc69).fillCircle(px, y - 15, 3);
      }
    }
  }
  }).setDepth(-2);
  // 近景树已经并入共享场景块，编辑器与试玩不再各画一套不同装饰。
  // 分层地图不再注入编辑器中不存在的路牌和章节文字。
  if (editableLayers) return;
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
