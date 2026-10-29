import Phaser from 'phaser';
import type { SceneTheme } from './CustomMap';
import { normalizeScenerySeed } from './SceneryGenerator';
import forestSky from '../assets/backgrounds/forest/sky.svg';
import forestFar from '../assets/backgrounds/forest/far.svg';
import forestMid from '../assets/backgrounds/forest/mid.svg';
import forestFront from '../assets/backgrounds/forest/front.svg';
import snowSky from '../assets/backgrounds/snow/sky.svg';
import snowFar from '../assets/backgrounds/snow/far.svg';
import snowMid from '../assets/backgrounds/snow/mid.svg';
import snowFront from '../assets/backgrounds/snow/front.svg';
import desertSky from '../assets/backgrounds/desert/sky.svg';
import desertFar from '../assets/backgrounds/desert/far.svg';
import desertMid from '../assets/backgrounds/desert/mid.svg';
import desertFront from '../assets/backgrounds/desert/front.svg';
import nightSky from '../assets/backgrounds/night/sky.svg';
import nightFar from '../assets/backgrounds/night/far.svg';
import nightMid from '../assets/backgrounds/night/mid.svg';
import nightFront from '../assets/backgrounds/night/front.svg';

export const THEME_BACKGROUND_SIZE = { width: 1920, height: 540 } as const;

export interface ThemeBackgroundLayer {
  id: 'sky' | 'far' | 'mid' | 'front'; key: string; url: string;
  width: number; height: number; baseParallax: number; parallax: number; depth: number; alpha: number;
  phase: number; mirror: boolean;
}

const SOURCES: Record<SceneTheme, Record<ThemeBackgroundLayer['id'], string>> = {
  forest: { sky: forestSky, far: forestFar, mid: forestMid, front: forestFront },
  snow: { sky: snowSky, far: snowFar, mid: snowMid, front: snowFront },
  desert: { sky: desertSky, far: desertFar, mid: desertMid, front: desertFront },
  night: { sky: nightSky, far: nightFar, mid: nightMid, front: nightFront },
};

const LAYERS = [
  { id: 'sky', baseParallax: 0, depth: -30, alpha: 1, mirror: true },
  { id: 'far', baseParallax: 0.12, depth: -27, alpha: 1, mirror: true },
  { id: 'mid', baseParallax: 0.32, depth: -23, alpha: 1, mirror: true },
  // “前景”仍在所有玩法对象和用户背景图层之后，绝不遮挡角色或碰撞提示。
  { id: 'front', baseParallax: 0.62, depth: -19, alpha: 1, mirror: true },
] as const;

/** 0 全部固定、1 全部随地图；0.2 保持舒缓的默认视差。 */
export function scaledThemeParallax(base: number, amount: number): number {
  const value = Math.max(0, Math.min(1, amount));
  if (value === 0 || value === 1 || base === 0) return value === 1 ? 1 : 0;
  return value <= 0.2 ? base * value / 0.2 : base + (1 - base) * (value - 0.2) / 0.8;
}

export function themeBackgroundLayers(theme: SceneTheme, amount = 0.2,
  seedValue: string | number = 'default'): ThemeBackgroundLayer[] {
  const seed = normalizeScenerySeed(seedValue);
  return LAYERS.map((layer, index) => ({
    ...layer, key: `theme-bg-${theme}-${layer.id}`, url: SOURCES[theme][layer.id],
    width: THEME_BACKGROUND_SIZE.width, height: THEME_BACKGROUND_SIZE.height,
    parallax: scaledThemeParallax(layer.baseParallax, amount),
    phase: layer.id === 'sky' ? 0 : normalizeScenerySeed(`${seed}:${theme}:${layer.id}:${index}`) % THEME_BACKGROUND_SIZE.width,
  }));
}

export function preloadThemeBackgrounds(scene: Phaser.Scene): void {
  for (const theme of Object.keys(SOURCES) as SceneTheme[])
    for (const layer of themeBackgroundLayers(theme))
      // Vite 会把较小 SVG 内联成 URL 编码的 data URI；Phaser SVGFile 会误按 Base64 解码。
      // ImageFile 交给浏览器原生解码，同样生成普通纹理，并兼容后续直接替换为 PNG。
      if (!scene.textures.exists(layer.key)) scene.load.image(layer.key, layer.url);
}

export function themeBackgroundReady(scene: Phaser.Scene, theme: SceneTheme): boolean {
  return themeBackgroundLayers(theme).every((layer) => scene.textures.exists(layer.key));
}

function mirroredImage(layer: ThemeBackgroundLayer, x: number, mirrored: boolean): string {
  if (!mirrored) return `<image href="${layer.url}" x="${x}" y="0" width="${layer.width}" height="${layer.height}" preserveAspectRatio="none"/>`;
  return `<image href="${layer.url}" x="0" y="0" width="${layer.width}" height="${layer.height}" preserveAspectRatio="none" transform="translate(${x + layer.width} 0) scale(-1 1)"/>`;
}

/** 编辑器直接引用同一批 SVG 文件，视差数学和 Phaser setScrollFactor 保持一致。 */
export function themeBackgroundSvg(theme: SceneTheme, amount: number, mapWidth: number,
  seedValue: string | number): string {
  return themeBackgroundLayers(theme, amount, seedValue).map((layer) => {
    const period = layer.mirror ? layer.width * 2 : layer.width;
    const id = `theme-${theme}-${layer.id}`;
    const images = mirroredImage(layer, 0, false) + (layer.mirror ? mirroredImage(layer, layer.width, true) : '');
    return `<defs><pattern id="${id}" x="${-layer.phase}" width="${period}" height="${layer.height}" patternUnits="userSpaceOnUse">${images}</pattern></defs>`
      + `<g data-theme-layer="${layer.id}" data-preview-parallax="${layer.parallax}"><rect width="${mapWidth}" height="${layer.height}" fill="url(#${id})"/></g>`;
  }).join('');
}

/**
 * 每层只维护覆盖视口所需的少量 Image。prerender 仅检查块编号，镜头未跨块时不改任何节点，
 * 因此长地图不会创建整张地图宽度的纹理，也不会逐帧重绘 SVG/Graphics。
 */
export function mountThemeBackground(scene: Phaser.Scene, theme: SceneTheme, amount: number,
  seedValue: string | number): boolean {
  if (!themeBackgroundReady(scene, theme)) return false;
  const camera = scene.cameras.main, events = scene.events;
  let disposed = false;
  const syncLayers: Array<() => void> = [];
  for (const layer of themeBackgroundLayers(theme, amount, seedValue)) {
    const images: Phaser.GameObjects.Image[] = [];
    let signature = '';
    const sync = (): void => {
      if (disposed) return;
      const viewWidth = camera.width / Math.max(0.01, camera.zoom);
      const left = camera.scrollX * layer.parallax + layer.phase;
      const first = Math.floor(left / layer.width) - 1;
      const count = Math.max(3, Math.ceil(viewWidth / layer.width) + 3);
      const next = `${first}:${count}:${viewWidth}`;
      if (next === signature) return;
      signature = next;
      while (images.length < count) images.push(scene.add.image(0, 0, layer.key).setOrigin(0)
        .setDisplaySize(layer.width, layer.height).setScrollFactor(layer.parallax, 1)
        .setDepth(layer.depth).setAlpha(layer.alpha));
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        if (index >= count) { image.setVisible(false); continue; }
        const tile = first + index, start = tile * layer.width - layer.phase;
        const flip = layer.mirror && Math.abs(tile % 2) === 1;
        image.setVisible(true).setOrigin(flip ? 1 : 0, 0).setFlipX(flip)
          .setPosition(start + (flip ? layer.width : 0), 0);
      }
    };
    sync(); syncLayers.push(sync);
    events.once(Phaser.Scenes.Events.SHUTDOWN, () => images.forEach((image) => image.destroy()));
  }
  const sync = () => syncLayers.forEach((update) => update());
  camera.on('followupdate', sync); events.on('prerender', sync);
  events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    disposed = true; camera.off('followupdate', sync); events.off('prerender', sync);
  });
  return true;
}
