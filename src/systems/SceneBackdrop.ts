import type { MapAsset, SceneSettings, SceneTheme } from './CustomMap';
import { SCENERY_REPEAT_WIDTH, normalizeScenerySeed, sceneryChunks, scenerySeedFromText,
  type SceneryTree } from './SceneryGenerator';

export const DEFAULT_SCENE: SceneSettings = { theme: 'forest', backgroundMode: 'stretch', parallax: 0.2 };
export const SCENE_PALETTES = {
  forest: { name: '绘本森林', sky: ['#a5dcd6', '#d7e9bc', '#fff0c8'], hill: 0x97c8a8, leaf: 0x80ac74, earth: 0xb18963, top: 0x71964e, light: 0xb4cd72 },
  snow: { name: '雪地', sky: ['#8fbbd8', '#d7e9f4', '#f5faff'], hill: 0xb2ccdd, leaf: 0x659b9a, earth: 0x819aaa, top: 0xe5f3ff, light: 0xffffff },
  desert: { name: '沙漠', sky: ['#edc7a2', '#f4d99b', '#ffedbc'], hill: 0xdbb179, leaf: 0x92a368, earth: 0xc89559, top: 0xf1cf83, light: 0xffe6a7 },
  night: { name: '星空夜晚', sky: ['#182c48', '#345371', '#68808c'], hill: 0x3c6270, leaf: 0x436f69, earth: 0x657268, top: 0x6f9b84, light: 0xa6c7a1 },
};
export interface BackdropShape {
  kind: 'circle' | 'ellipse' | 'rect'; x: number; y: number;
  width: number; height: number; color: number; alpha: number; radius?: number;
}
export interface BackdropLayer {
  id: string; parallax: number; depth: number; repeat: number; shapes: BackdropShape[];
}
function blendColor(color: number, target: number, amount: number): number {
  const mix = (shift: number) => Math.round(((color >> shift) & 255) * (1 - amount) + ((target >> shift) & 255) * amount);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
function toneColor(color: number, amount: number): number {
  return blendColor(color, amount < 0 ? 0x1d2b27 : 0xffffff, Math.min(0.55, Math.abs(amount)));
}
/** 0 全部固定、1 全部随地图；默认 0.2 保留原有远近景滚动比例。 */
export function themeParallax(base: number, amount: number): number {
  const value = Math.max(0, Math.min(1, amount));
  if (value === 0 || value === 1) return value;
  return value <= 0.2 ? base * value / 0.2 : base + (1 - base) * (value - 0.2) / 0.8;
}
/** 同一份确定性场景块由 Phaser 试玩与 SVG 编辑画布分别绘制。 */
export function backdropLayers(theme: SceneTheme, amount = 0.2, seedValue: string | number = 'default'): BackdropLayer[] {
  const p = SCENE_PALETTES[theme];
  const shape = (kind: BackdropShape['kind'], x: number, y: number, width: number, height: number,
    color: number, alpha = 1, radius = 0): BackdropShape => ({ kind, x, y, width, height, color, alpha, radius });
  const seed = normalizeScenerySeed(seedValue);
  const chunks = sceneryChunks(seed);
  const lightX = 600 + seed % 330;
  const layers: BackdropLayer[] = [{ id: 'light', parallax: themeParallax(0.1, amount), depth: -29, repeat: 0,
    shapes: [shape('circle', lightX, 105, 148, 148, theme === 'night' ? 0xc9e0fc : 0xfff4ca, 0.3),
      shape('circle', lightX, 105, 96, 96, theme === 'night' ? 0xe6efff : 0xfff8dc, 0.8)] }];
  const hills: BackdropShape[] = [], farTrees: BackdropShape[] = [], trees: BackdropShape[] = [], grove: BackdropShape[] = [];
  const addTree = (target: BackdropShape[], tree: SceneryTree): void => {
    const { x, baseY, height, crownWidth, crownHeight, variant, tone, alpha } = tree;
    const leaf = toneColor(p.leaf, tone), light = toneColor(theme === 'snow' ? 0xe9f6ff : p.light, tone * 0.55);
    const trunk = toneColor(p.earth, -0.2 + tone * 0.25);
    if (theme === 'desert') {
      const width = Math.max(12, height * 0.085), top = baseY - height * 0.76;
      target.push(shape('rect', x - width / 2, top, width, baseY - top, leaf, alpha, width / 2),
        shape('ellipse', x, top, width, width * 1.15, light, alpha * 0.7));
      const side = variant % 2 ? 1 : -1;
      target.push(shape('rect', x + side * width * 0.35, top + height * 0.24, width * 2.4, width * 0.72, leaf, alpha, width / 3),
        shape('rect', x + side * width * 1.65, top + height * 0.13, width * 0.72, height * (0.16 + variant * 0.018), leaf, alpha, width / 3));
      return;
    }
    const trunkWidth = Math.max(10, height * 0.075), trunkY = baseY - height * 0.64;
    const crownY = baseY - height * 0.72;
    target.push(shape('rect', x - trunkWidth / 2, trunkY, trunkWidth, baseY - trunkY, trunk, alpha * 0.84, trunkWidth / 2));
    if (variant === 0) {
      target.push(shape('ellipse', x, crownY, crownWidth * 0.82, crownHeight, leaf, alpha),
        shape('ellipse', x - crownWidth * 0.27, crownY + crownHeight * 0.12, crownWidth * 0.58, crownHeight * 0.6, light, alpha * 0.72));
    } else if (variant === 1) {
      const size = crownWidth * 0.58;
      target.push(shape('circle', x, crownY - crownHeight * 0.12, size, size, leaf, alpha),
        shape('circle', x - crownWidth * 0.28, crownY + crownHeight * 0.13, size * 0.88, size * 0.88, light, alpha * 0.74),
        shape('circle', x + crownWidth * 0.27, crownY + crownHeight * 0.16, size * 0.82, size * 0.82, leaf, alpha * 0.9));
    } else if (variant === 2) {
      target.push(shape('ellipse', x, crownY + crownHeight * 0.08, crownWidth * 1.12, crownHeight * 0.62, leaf, alpha),
        shape('ellipse', x + crownWidth * 0.12, crownY - crownHeight * 0.2, crownWidth * 0.66, crownHeight * 0.58, light, alpha * 0.7));
    } else {
      target.push(shape('ellipse', x, crownY, crownWidth * 0.7, crownHeight * 1.06, leaf, alpha),
        shape('ellipse', x - crownWidth * 0.3, crownY + crownHeight * 0.16, crownWidth * 0.52, crownHeight * 0.48, light, alpha * 0.72),
        shape('ellipse', x + crownWidth * 0.27, crownY + crownHeight * 0.12, crownWidth * 0.54, crownHeight * 0.5, leaf, alpha * 0.9));
    }
    if (theme === 'snow') target.push(shape('ellipse', x - crownWidth * 0.05, crownY - crownHeight * 0.28,
      crownWidth * 0.62, Math.max(9, crownHeight * 0.14), 0xf7fcff, alpha * 0.76));
  };
  for (const chunk of chunks) {
    for (const hill of chunk.hills) hills.push(shape('ellipse', hill.x, hill.y, hill.width, hill.height,
      toneColor(p.hill, hill.tone), hill.alpha));
    chunk.farTrees.forEach((tree) => addTree(farTrees, tree));
    chunk.trees.forEach((tree) => addTree(trees, tree));
    chunk.grove.forEach((tree) => addTree(grove, tree));
    for (const shrub of chunk.shrubs) grove.push(shape('ellipse', shrub.x, shrub.y, shrub.width, shrub.height,
      toneColor(p.leaf, shrub.tone), shrub.alpha));
  }
  layers.push({ id: 'hills', parallax: themeParallax(0.18, amount), depth: -25, repeat: SCENERY_REPEAT_WIDTH, shapes: hills },
    { id: 'trees-far', parallax: themeParallax(0.3, amount), depth: -23, repeat: SCENERY_REPEAT_WIDTH, shapes: farTrees },
    { id: 'trees', parallax: themeParallax(0.46, amount), depth: -20, repeat: SCENERY_REPEAT_WIDTH, shapes: trees },
    // 主题底图始终位于用户添加的背景图层（-18 起）之后；编辑器与试玩排序一致。
    { id: 'grove', parallax: themeParallax(0.82, amount), depth: -19, repeat: SCENERY_REPEAT_WIDTH, shapes: grove });
  if (theme === 'night') layers.push({ id: 'stars', parallax: themeParallax(0.08, amount), depth: -24,
    repeat: SCENERY_REPEAT_WIDTH, shapes: Array.from({ length: 42 }, (_, i) => {
      const starSeed = normalizeScenerySeed(`${seed}:star:${i}`);
      const size = 2 + starSeed % 4;
      return shape('circle', i * SCENERY_REPEAT_WIDTH / 42 + starSeed % 93, 24 + (starSeed >>> 8) % 205,
        size, size, 0xfff2c1, 0.45 + ((starSeed >>> 16) % 40) / 100);
    }) });
  return layers.sort((a, b) => a.depth - b.depth);
}
function shapeSvg(s: BackdropShape, offset: number): string {
  const fill = `fill="#${s.color.toString(16).padStart(6, '0')}" fill-opacity="${s.alpha}"`;
  if (s.kind === 'circle') return `<circle cx="${s.x + offset}" cy="${s.y}" r="${s.width / 2}" ${fill}/>`;
  if (s.kind === 'ellipse') return `<ellipse cx="${s.x + offset}" cy="${s.y}" rx="${s.width / 2}" ry="${s.height / 2}" ${fill}/>`;
  return `<rect x="${s.x + offset}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.radius}" ${fill}/>`;
}
export function sceneBackdropSvg(settings: SceneSettings, width: number, background?: MapAsset,
  picture?: (asset: MapAsset, width: number, height: number) => string, fallbackSeed = 'default'): string {
  const palette = SCENE_PALETTES[settings.theme];
  let html = `<defs><linearGradient id="scene-preview-sky" x2="0" y2="1">${palette.sky.map((color, i) =>
    `<stop offset="${[0, 0.55, 1][i]}" stop-color="${color}"/>`).join('')}</linearGradient></defs>`
    + `<rect width="${width}" height="540" fill="url(#scene-preview-sky)"/>`;
  if (background) {
    const tileWidth = background.width * 540 / background.height;
    const imageMarkup = (w: number) => picture ? picture(background, w, 540)
      : `<image href="${background.data}" width="${w}" height="540" preserveAspectRatio="none"/>`;
    const image = settings.backgroundMode === 'repeat'
      ? `<defs><pattern id="scene-preview-image" width="${tileWidth}" height="540" patternUnits="userSpaceOnUse">${imageMarkup(tileWidth)}</pattern></defs><rect width="${width}" height="540" fill="url(#scene-preview-image)"/>`
      : imageMarkup(width);
    return html + `<g data-preview-parallax="${settings.parallax}">${image}</g>`;
  }
  if (settings.baseMode === 'sky') return html;
  const seed = settings.scenerySeed ?? scenerySeedFromText(fallbackSeed);
  for (const layer of backdropLayers(settings.theme, settings.parallax, seed)) {
    if (layer.repeat) {
      const id = `scene-preview-${layer.id}`;
      // 把跨越图块边界的图元也画入相邻块，避免背景平铺接缝。
      const shapes = [-layer.repeat, 0, layer.repeat].flatMap((offset) => layer.shapes.map((s) => shapeSvg(s, offset))).join('');
      html += `<defs><pattern id="${id}" width="${layer.repeat}" height="540" patternUnits="userSpaceOnUse">${shapes}</pattern></defs>`
        + `<g data-preview-parallax="${layer.parallax}"><rect width="${width}" height="540" fill="url(#${id})"/></g>`;
    } else html += `<g data-preview-parallax="${layer.parallax}">${layer.shapes.map((s) => shapeSvg(s, 0)).join('')}</g>`;
  }
  return html;
}
