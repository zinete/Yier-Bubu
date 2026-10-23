import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime, Events } from './helpers/runtime.mjs';
const load = runtime();
const { platformSlices, MOSS_MATERIAL } = load('src/systems/PlatformMaterial.ts');
const { platformSlicesInView, ViewportPlatformRenderer } = load('src/systems/ViewportArt.ts');
const g = { sourceWidth: 2172, sourceHeight: 724, x: 50, y: 190, width: 2070, height: 371, surfaceY: 238 };
const canonical = (value) => JSON.parse(JSON.stringify(value));
for (const width of [16, 160, 1920, 100000, 1000000]) for (const height of [8, 32, 96]) {
  for (const caps of [[0, 0], [.12, .12], [.4, .1]]) {
    const material = { ...MOSS_MATERIAL, leftCap: caps[0], rightCap: caps[1] };
    const all = platformSlices(g, material, 123, 400, width, height);
    for (const x of [-1000, 0, width / 2, width - 800, width + 1000]) {
      const view = { x, width: 960 };
      const expected = all.filter((p) => p.x + p.drawWidth >= x - 96 && p.x <= x + 1056);
      const actual = platformSlicesInView(g, material, 123, 400, width, height, view);
      assert.equal(actual.length, expected.length);
      actual.forEach((p, i) => {
        for (const key of Object.keys(p)) if (typeof p[key] === 'number') assert.ok(Math.abs(p[key] - expected[i][key]) < 1e-7, key);
        else assert.equal(p[key], expected[i][key]);
      });
      assert.ok(actual.length < 60, '百万像素平台也只创建镜头附近拼片');
    }
  }
}
const camera = Object.assign(new Events(), { scrollX: 0, width: 960, zoom: 1 });
const images = [], events = new Events();
const scene = { cameras: { main: camera }, events,
  textures: { get: () => ({ has: () => true }) }, add: { image: () => {
    const image = { scene: true, destroy() { this.scene = false; }, setVisible(value) { this.visible = value; return this; } };
    for (const name of ['setOrigin', 'setTexture', 'setPosition', 'setDisplaySize', 'setFlipX', 'setDepth', 'setAlpha']) image[name] = () => image;
    images.push(image); return image;
  } } };
const pool = new ViewportPlatformRenderer(scene);
const handle = pool.add({ key: 'moss', geometry: g, material: MOSS_MATERIAL, x: 0, y: 444, width: 1000000, height: 32, depth: -2 });
for (let x = 0; x < 1000000; x += 7919) { camera.scrollX = x; pool.sync(); }
assert.ok(images.length < 12, '镜头移动复用同一个 Image 池');
handle.setVisible(false); pool.sync(); assert.ok(images.every((image) => !image.visible), '休眠跳台能隐藏池中的全部拼片');
handle.setVisible(true); pool.sync(); assert.ok(images.some((image) => image.visible));
handle.destroy(); pool.sync(); assert.ok(images.every((image) => !image.visible));
const queued = pool.sync; scene.cameras.main = undefined; events.emit('shutdown');
assert.equal(camera.entries.length, 0); assert.equal(events.entries.length, 0);
assert.ok(images.every((image) => !image.scene)); assert.doesNotThrow(queued);

const { buildForest } = load('src/systems/ForestArt.ts');
const counts = [];
for (const width of [1920, 100000, 1000000]) {
  const camera = Object.assign(new Events(), { scrollX: 0, width: 960, zoom: 1 });
  const events = new Events(), graphics = [];
  const visual = () => {
    const object = { count: 0, clear() { this.count = 0; return this; } };
    for (const key of ['setOrigin', 'setDisplaySize', 'setScrollFactor', 'setDepth', 'lineStyle', 'fillStyle']) object[key] = () => object;
    for (const key of ['fillCircle', 'fillEllipse', 'fillRoundedRect', 'lineBetween', 'strokeRoundedRect']) object[key] = () => { object.count++; return object; };
    return object;
  };
  const scene = { events, cameras: { main: camera }, textures: { exists: () => true }, add: {
    image: visual, text: visual, graphics: () => { const v = visual(); graphics.push(v); return v; },
  } };
  buildForest(scene, { id: 'test', width, platforms: [{ x: 0, y: 444, width, height: 96, kind: 'ground' }] });
  counts.push(graphics.reduce((sum, value) => sum + value.count, 0));
  camera.scrollX = width / 2; camera.emit('followupdate');
  assert.ok(graphics.reduce((sum, value) => sum + value.count, 0) < 700);
  const queued = events.entries.find((entry) => entry.event === 'prerender').fn;
  events.emit('shutdown'); assert.equal(camera.entries.length, 0); assert.equal(events.entries.length, 0);
  assert.doesNotThrow(queued);
}
assert.deepEqual(canonical(counts), [counts[0], counts[0], counts[0]], '首屏绘制量不随地图长度增加');
log(`viewport art: 1920/100000/1000000px first-frame primitives ${counts.join('/')}; seams, pooling and cleanup passed`);
