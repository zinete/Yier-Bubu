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
export const GEOMETRY_CACHE_LIMIT = 64;
export const GEOMETRY_CACHE_CHARS = 4 * 1024 * 1024;
let cachedChars = 0;
interface GeometryRequest { image: HTMLImageElement; listeners: Set<() => void> }
const pending = new Map<string, GeometryRequest>();
function cacheGeometry(source: string, value: AssetGeometry): void {
  if (cache.has(source)) { cache.delete(source); cachedChars -= source.length; }
  // 过大外部图片可测量但不长驻；正常地图内嵌图片上限为 350KB。
  if (source.length > GEOMETRY_CACHE_CHARS) return;
  cache.set(source, value); cachedChars += source.length;
  while (cache.size > GEOMETRY_CACHE_LIMIT || cachedChars > GEOMETRY_CACHE_CHARS) {
    const oldest = cache.keys().next().value!;
    cache.delete(oldest); cachedChars -= oldest.length;
  }
}
export function cachedAssetGeometry(source: string): AssetGeometry | undefined {
  const value = cache.get(source);
  if (value) { cache.delete(source); cache.set(source, value); }
  return value;
}
export function assetGeometryCacheStats(): { entries: number; sourceChars: number; pending: number } {
  return { entries: cache.size, sourceChars: cachedChars, pending: pending.size };
}
export function readAssetGeometry(source: string, image: CanvasImageSource, width: number, height: number): AssetGeometry {
  const existing = cachedAssetGeometry(source); if (existing) return existing;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法读取素材透明边界');
  context.drawImage(image, 0, 0, width, height);
  const geometry = analyzeAssetPixels(context.getImageData(0, 0, width, height).data, width, height);
  cacheGeometry(source, geometry);
  return geometry;
}
/** 编辑器异步测量，试玩则直接从已加载纹理测量；二者共用结果。 */
export function ensureAssetGeometry(source: string, onReady: () => void): () => void {
  if (cachedAssetGeometry(source)) return () => {};
  const unsubscribe = (request: GeometryRequest): (() => void) => () => {
    request.listeners.delete(onReady);
    if (!request.listeners.size && pending.get(source) === request) {
      pending.delete(source); request.image.onload = null; request.image.onerror = null;
      request.image.src = '';
    }
  };
  const existing = pending.get(source);
  if (existing) { existing.listeners.add(onReady); return unsubscribe(existing); }
  const image = new Image();
  const request: GeometryRequest = { image, listeners: new Set([onReady]) };
  pending.set(source, request);
  image.onload = () => {
    if (pending.get(source) !== request) return;
    try { readAssetGeometry(source, image, image.naturalWidth, image.naturalHeight); }
    catch {
      cacheGeometry(source, { sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight,
        x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight, surfaceY: 0 });
    }
    finally {
      pending.delete(source); image.onload = null; image.onerror = null;
      request.listeners.forEach((callback) => callback()); request.listeners.clear();
    }
  };
  image.onerror = () => {
    if (pending.get(source) === request) pending.delete(source);
    request.listeners.clear(); image.onload = null; image.onerror = null;
  };
  image.src = source;
  return unsubscribe(request);
}
