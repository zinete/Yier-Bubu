export const SCENERY_CHUNK_WIDTH = 720;
export const SCENERY_CYCLE_CHUNKS = 9;
export const SCENERY_REPEAT_WIDTH = SCENERY_CHUNK_WIDTH * SCENERY_CYCLE_CHUNKS;
export const SCENERY_VERSION = 1 as const;

export interface SceneryHill {
  x: number; y: number; width: number; height: number; tone: number; alpha: number;
}

export interface SceneryTree {
  x: number; baseY: number; height: number; crownWidth: number; crownHeight: number;
  variant: 0 | 1 | 2 | 3; tone: number; alpha: number;
}

export interface SceneryShrub {
  x: number; y: number; width: number; height: number; tone: number; alpha: number;
}

export interface SceneryChunk {
  index: number; x: number; hills: SceneryHill[];
  farTrees: SceneryTree[]; trees: SceneryTree[]; grove: SceneryTree[]; shrubs: SceneryShrub[];
}

/** FNV-1a：只由地图数据决定，不依赖 Math.random、调用顺序或设备。 */
export function scenerySeedFromText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeScenerySeed(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value) >>> 0;
  return scenerySeedFromText(typeof value === 'string' && value ? value : 'yier-bubu-scenery');
}

function mix32(value: number): number {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

/** 编辑器“换一组景观”使用同一稳定步进，结果会被保存到地图。 */
export function nextScenerySeed(seed: string | number | undefined): number {
  return mix32((normalizeScenerySeed(seed) + 0x9e3779b9) >>> 0);
}

function sample(seed: number, chunk: number, channel: number): number {
  const value = seed ^ Math.imul(chunk + 1, 0x9e3779b1) ^ Math.imul(channel + 17, 0x85ebca6b);
  return mix32(value) / 0x100000000;
}

function range(seed: number, chunk: number, channel: number, min: number, max: number): number {
  return min + (max - min) * sample(seed, chunk, channel);
}

function treesForRow(seed: number, chunk: number, row: number, count: number, baseY: number,
  minHeight: number, maxHeight: number, alpha: number): SceneryTree[] {
  return Array.from({ length: count }, (_, slot) => {
    const channel = row * 100 + slot * 12;
    const cell = SCENERY_CHUNK_WIDTH / count;
    const x = chunk * SCENERY_CHUNK_WIDTH + cell * (slot + 0.5)
      + range(seed, chunk, channel, -cell * 0.27, cell * 0.27);
    const height = range(seed, chunk, channel + 1, minHeight, maxHeight);
    return {
      x, baseY: baseY + range(seed, chunk, channel + 2, -8, 8), height,
      crownWidth: height * range(seed, chunk, channel + 3, 0.48, 0.76),
      crownHeight: height * range(seed, chunk, channel + 4, 0.44, 0.72),
      variant: Math.floor(sample(seed, chunk, channel + 5) * 4) as SceneryTree['variant'],
      tone: range(seed, chunk, channel + 6, -0.16, 0.16),
      alpha: alpha * range(seed, chunk, channel + 7, 0.86, 1),
    };
  });
}

/**
 * 一次生成九个宽场景块。常规 4～6 千像素关卡不会重复；超长地图才按 6480px 周期复用，
 * SVG 和 Phaser 均只保存/绘制这一小段描述。
 */
export function sceneryChunks(seedValue: string | number | undefined): SceneryChunk[] {
  const seed = normalizeScenerySeed(seedValue);
  return Array.from({ length: SCENERY_CYCLE_CHUNKS }, (_, index) => {
    const x = index * SCENERY_CHUNK_WIDTH;
    const farCount = 2 + Math.floor(sample(seed, index, 1) * 2);
    const treeCount = 2 + Math.floor(sample(seed, index, 2) * 2);
    const groveCount = 1 + Math.floor(sample(seed, index, 3) * 2);
    const shrubCount = 2 + Math.floor(sample(seed, index, 4) * 3);
    const hills: SceneryHill[] = [0, 1].map((slot) => ({
      x: x + (slot + 0.22) * SCENERY_CHUNK_WIDTH / 2 + range(seed, index, 10 + slot * 6, -90, 90),
      y: range(seed, index, 11 + slot * 6, 430, 486),
      width: range(seed, index, 12 + slot * 6, 470, 760),
      height: range(seed, index, 13 + slot * 6, 260, 430),
      tone: range(seed, index, 14 + slot * 6, -0.1, 0.1),
      alpha: range(seed, index, 15 + slot * 6, 0.3, 0.58),
    }));
    const shrubs = Array.from({ length: shrubCount }, (_, slot) => ({
      x: x + SCENERY_CHUNK_WIDTH * (slot + 0.5) / shrubCount
        + range(seed, index, 500 + slot * 6, -65, 65),
      y: range(seed, index, 501 + slot * 6, 430, 466),
      width: range(seed, index, 502 + slot * 6, 90, 210),
      height: range(seed, index, 503 + slot * 6, 28, 74),
      tone: range(seed, index, 504 + slot * 6, -0.15, 0.15),
      alpha: range(seed, index, 505 + slot * 6, 0.22, 0.48),
    }));
    return {
      index, x, hills,
      farTrees: treesForRow(seed, index, 1, farCount, 468, 150, 245, 0.28),
      trees: treesForRow(seed, index, 2, treeCount, 470, 220, 345, 0.43),
      grove: treesForRow(seed, index, 3, groveCount, 448, 270, 395, 0.62),
      shrubs,
    };
  });
}
