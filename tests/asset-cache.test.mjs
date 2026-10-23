import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime } from './helpers/runtime.mjs';
const images = [];
class Image {
  naturalWidth = 1; naturalHeight = 1;
  constructor() { images.push(this); }
}
const load = runtime({ Image, document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8Array([0, 0, 0, 255]) }) }) }) } });
const { readAssetGeometry, cachedAssetGeometry, ensureAssetGeometry, assetGeometryCacheStats, GEOMETRY_CACHE_LIMIT, GEOMETRY_CACHE_CHARS } = load('src/systems/AssetGeometry.ts');
for (let i = 0; i < 100; i++) readAssetGeometry(`source-${i}`, {}, 1, 1);
assert.equal(assetGeometryCacheStats().entries, GEOMETRY_CACHE_LIMIT);
assert.equal(cachedAssetGeometry('source-0'), undefined);
assert.ok(cachedAssetGeometry('source-36'));
readAssetGeometry('last', {}, 1, 1); assert.ok(cachedAssetGeometry('source-36'), '访问后保留近期素材');
for (let i = 0; i < 25; i++) readAssetGeometry(`${i}:` + 'A'.repeat(320000), {}, 1, 1);
assert.ok(assetGeometryCacheStats().sourceChars <= GEOMETRY_CACHE_CHARS, '不同地图的大图不能无限保留');
let first = 0, second = 0;
const cancelFirst = ensureAssetGeometry('pending', () => first++);
const cancelSecond = ensureAssetGeometry('pending', () => second++);
assert.equal(images.length, 1); cancelFirst(); images[0].onload();
assert.equal(first, 0); assert.equal(second, 1); cancelSecond();
const cancel = ensureAssetGeometry('cancelled', () => assert.fail('离开编辑器后不能刷新旧画布'));
const queued = images[1].onload; cancel(); assert.equal(images[1].src, ''); queued();
assert.equal(assetGeometryCacheStats().pending, 0);
ensureAssetGeometry('failed', () => assert.fail('失败不触发重绘重试循环')); images[2].onerror();
assert.equal(assetGeometryCacheStats().pending, 0); assert.equal(images[2].onload, null);
log('asset geometry: bounded LRU/source bytes, shared requests, cancel and failure cleanup passed');
