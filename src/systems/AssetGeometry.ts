export interface AssetGeometry {
  sourceWidth: number;
  sourceHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  surfaceY: number;
}

/** 透明留白不属于实体尺寸；零散花叶不作为整个平台的站立表面。 */
export function analyzeAssetPixels(pixels: ArrayLike<number>, width: number, height: number): AssetGeometry {
  let left = width, top = height, right = -1, bottom = -1;
  const rows = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 32) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      rows[y] += 1;
    }
  }
  if (right < 0) return { sourceWidth: width, sourceHeight: height, x: 0, y: 0, width, height, surfaceY: 0 };
  const contentWidth = right - left + 1;
  let surfaceY = top;
  for (let y = top; y <= bottom; y += 1) {
    if (rows[y] >= contentWidth * 0.6) { surfaceY = y; break; }
  }
  return { sourceWidth: width, sourceHeight: height, x: left, y: top,
    width: contentWidth, height: bottom - top + 1, surfaceY };
}

export function assetLayout(geometry: AssetGeometry, x: number, y: number, width: number, height: number, platform = false) {
  if (!platform) return { x, y, width, height };
  // 平台碰撞框顶部对应草地连续表面，顶部装饰允许延伸至碰撞面之上。
  const overhang = geometry.surfaceY - geometry.y;
  const scale = height / Math.max(1, geometry.height - overhang);
  return { x, y: y - overhang * scale, width, height: geometry.height * scale };
}

const cache = new Map<string, AssetGeometry>();
const pending = new Map<string, Set<() => void>>();
export function cachedAssetGeometry(source: string): AssetGeometry | undefined { return cache.get(source); }
export function readAssetGeometry(source: string, image: CanvasImageSource, width: number, height: number): AssetGeometry {
  const existing = cache.get(source); if (existing) return existing;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法读取素材透明边界');
  context.drawImage(image, 0, 0, width, height);
  const geometry = analyzeAssetPixels(context.getImageData(0, 0, width, height).data, width, height);
  cache.set(source, geometry);
  return geometry;
}
/** 编辑器异步测量，试玩则直接从已加载纹理测量；二者共用结果。 */
export function ensureAssetGeometry(source: string, onReady: () => void): void {
  if (cache.has(source)) return;
  const listeners = pending.get(source);
  if (listeners) { listeners.add(onReady); return; }
  pending.set(source, new Set([onReady]));
  const image = new Image();
  image.onload = () => {
    try { readAssetGeometry(source, image, image.naturalWidth, image.naturalHeight); }
    catch {
      cache.set(source, { sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight,
        x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight, surfaceY: 0 });
    }
    finally {
      const callbacks = pending.get(source); pending.delete(source);
      callbacks?.forEach((callback) => callback());
    }
  };
  image.onerror = () => { pending.delete(source); };
  image.src = source;
}
