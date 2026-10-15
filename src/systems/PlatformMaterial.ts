import type { AssetGeometry } from './AssetGeometry';

/** 坐标均为比例：surfaceY 相对于原图高度，收边相对于去透明留白后的宽度。 */
export interface PlatformMaterial {
  mode: 'repeat' | 'stretch';
  surfaceY?: number;
  leftCap: number;
  rightCap: number;
}
export interface PlatformSlice {
  sx: number; sy: number; sw: number; sh: number;
  x: number; y: number; width: number; drawWidth: number; height: number; flipX: boolean;
}
export const MOSS_MATERIAL: PlatformMaterial = {
  mode: 'repeat', surfaceY: 286 / 724, leftCap: 0.12, rightCap: 0.12,
};
export function materialFor(id: string, overrides?: Record<string, PlatformMaterial>): PlatformMaterial {
  return (overrides && Object.hasOwn(overrides, id) ? overrides[id] : undefined) ?? (id === 'builtin-moss-platform' ? MOSS_MATERIAL
    : { mode: 'stretch', leftCap: 0.12, rightCap: 0.12 });
}
export function platformGeometry(g: AssetGeometry, material: PlatformMaterial): AssetGeometry {
  return { ...g, surfaceY: material.surfaceY === undefined ? g.surfaceY
    : Math.max(g.y, Math.min(g.y + g.height - 1, material.surfaceY * g.sourceHeight)) };
}
/** 编辑器、放置预览与运行时共用。奇数个正反交替中段使两端与原图收边连续。 */
export function platformSlices(g: AssetGeometry, material: PlatformMaterial,
  x: number, y: number, width: number, height: number): PlatformSlice[] {
  if (width <= 0 || height <= 0) return [];
  const surface = platformGeometry(g, material).surfaceY;
  const scale = height / Math.max(1, g.y + g.height - surface);
  const top = y - (surface - g.y) * scale;
  const displayHeight = g.height * scale;
  const part = (sx: number, sw: number, dx: number, dw: number, flipX = false): PlatformSlice =>
    ({ sx, sy: g.y, sw, sh: g.height, x: dx, y: top, width: dw, drawWidth: dw, height: displayHeight, flipX });
  if (material.mode === 'stretch') return [part(g.x, g.width, x, width)];
  const left = Math.floor(g.width * material.leftCap), right = Math.floor(g.width * material.rightCap);
  const middle = g.width - left - right;
  // 极短平台优先保留中段；只压缩收边，不让收边相互覆盖。
  const capScale = Math.min(scale, width * 0.4 / Math.max(1, left + right));
  const leftWidth = left * capScale, rightWidth = right * capScale;
  const middleWidth = width - leftWidth - rightWidth;
  const naturalWidth = middle * scale;
  const count = Math.max(1, 2 * Math.round((middleWidth / naturalWidth - 1) / 2) + 1);
  const pieces: PlatformSlice[] = [];
  if (left) pieces.push(part(g.x, left, x, leftWidth));
  for (let i = 0; i < count; i += 1) {
    const start = leftWidth + middleWidth * i / count;
    const end = leftWidth + middleWidth * (i + 1) / count;
    pieces.push(part(g.x + left, middle, x + start, end - start, i % 2 === 1));
  }
  if (right) pieces.push(part(g.x + g.width - right, right, x + width - rightWidth, rightWidth));
  // 给内部接缝半像素采样冗余，避免缩放/像素取整出现细缝；最右边缘不扩张。
  for (let i = 0; i < pieces.length - 1; i += 1) pieces[i].drawWidth += Math.min(0.5, pieces[i + 1].width);
  return pieces;
}
let svgSourceId = 0;
export function platformSvg(source: string, g: AssetGeometry, material: PlatformMaterial,
  x: number, y: number, width: number, height: number): string {
  const id = `platform-source-${svgSourceId++}`;
  // 上传图片通常是大段 base64，只定义一次，不能随拼片数重复复制数据。
  return `<defs><image id="${id}" href="${source}" width="${g.sourceWidth}" height="${g.sourceHeight}"/></defs>` + platformSlices(g, material, x, y, width, height).map((p) => {
    const transform = p.flipX ? ` transform="translate(${2 * p.sx + p.sw} 0) scale(-1 1)"` : '';
    return `<svg x="${p.x}" y="${p.y}" width="${p.drawWidth}" height="${p.height}" viewBox="${p.sx} ${p.sy} ${p.sw} ${p.sh}" preserveAspectRatio="none"><use href="#${id}"${transform}/></svg>`;
  }).join('');
}
