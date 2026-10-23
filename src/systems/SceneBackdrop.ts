import type { MapAsset, SceneSettings, SceneTheme } from './CustomMap';

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
/** 0 全部固定、1 全部随地图；默认 0.2 保留原有远近景滚动比例。 */
export function themeParallax(base: number, amount: number): number {
  const value = Math.max(0, Math.min(1, amount));
  if (value === 0 || value === 1) return value;
  return value <= 0.2 ? base * value / 0.2 : base + (1 - base) * (value - 0.2) / 0.8;
}
/** 同一组背景图元由 Phaser 试玩与 SVG 编辑画布分别绘制。 */
export function backdropLayers(theme: SceneTheme, amount = 0.2): BackdropLayer[] {
  const p = SCENE_PALETTES[theme];
  const shape = (kind: BackdropShape['kind'], x: number, y: number, width: number, height: number,
    color: number, alpha = 1, radius = 0): BackdropShape => ({ kind, x, y, width, height, color, alpha, radius });
  const layers: BackdropLayer[] = [{ id: 'light', parallax: themeParallax(0.1, amount), depth: -29, repeat: 0,
    shapes: [shape('circle', 780, 105, 148, 148, theme === 'night' ? 0xc9e0fc : 0xfff4ca, 0.3),
      shape('circle', 780, 105, 96, 96, theme === 'night' ? 0xe6efff : 0xfff8dc, 0.8)] }];
  const hills: BackdropShape[] = [], trees: BackdropShape[] = [];
  for (const x of [0, 260]) {
    hills.push(shape('ellipse', x, 460, 520, 380, p.hill, 0.65), shape('ellipse', x + 90, 430, 360, 260, p.hill, 0.4));
    if (theme === 'desert') {
      trees.push(shape('rect', x + 90, 320, 22, 124, p.leaf, 0.55, 10),
        shape('rect', x + 63, 355, 32, 16, p.leaf, 0.55, 7), shape('rect', x + 63, 325, 13, 43, p.leaf, 0.55, 6));
    } else {
      trees.push(shape('rect', x + 90, 140, 24, 330, p.leaf, 0.45, 12),
        shape('ellipse', x + 100, 170, 160, 240, p.leaf, 0.45),
        shape('ellipse', x + 45, 210, 135, 170, theme === 'snow' ? 0xf4fbff : p.light, 0.5));
    }
  }
  layers.push({ id: 'hills', parallax: themeParallax(0.18, amount), depth: -25, repeat: 520, shapes: hills },
    { id: 'trees', parallax: themeParallax(0.42, amount), depth: -20, repeat: 520, shapes: trees });
  if (theme === 'night') layers.push({ id: 'stars', parallax: themeParallax(0.08, amount), depth: -24, repeat: 720,
    shapes: Array.from({ length: 8 }, (_, i) => shape('circle', 35 + i * 90, 30 + ((35 + i * 90) * 7 % 170), 4, 4, 0xfff2c1, 0.7)) });
  return layers.sort((a, b) => a.depth - b.depth);
}
function shapeSvg(s: BackdropShape, offset: number): string {
  const fill = `fill="#${s.color.toString(16).padStart(6, '0')}" fill-opacity="${s.alpha}"`;
  if (s.kind === 'circle') return `<circle cx="${s.x + offset}" cy="${s.y}" r="${s.width / 2}" ${fill}/>`;
  if (s.kind === 'ellipse') return `<ellipse cx="${s.x + offset}" cy="${s.y}" rx="${s.width / 2}" ry="${s.height / 2}" ${fill}/>`;
  return `<rect x="${s.x + offset}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.radius}" ${fill}/>`;
}
export function sceneBackdropSvg(settings: SceneSettings, width: number, background?: MapAsset,
  picture?: (asset: MapAsset, width: number, height: number) => string): string {
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
  for (const layer of backdropLayers(settings.theme, settings.parallax)) {
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
