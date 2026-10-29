import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Events, runtime } from './helpers/runtime.mjs';

function load(file, require = () => ({})) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require });
  return module.exports;
}

const scenery = load('src/systems/SceneryGenerator.ts');
const Phaser = { Scenes: { Events: { SHUTDOWN: 'shutdown' } } };
const theme = load('src/systems/ThemeBackground.ts', (name) => name === 'phaser'
  ? { default: Phaser } : name.endsWith('/SceneryGenerator') ? scenery
    : name.endsWith('.svg') ? { default: name } : {});
const themes = ['forest', 'snow', 'desert', 'night'];
const allUrls = new Set();
for (const name of themes) {
  const layers = theme.themeBackgroundLayers(name, 0.2, 123);
  assert.equal(JSON.stringify(layers.map((layer) => layer.id)), JSON.stringify(['sky', 'far', 'mid', 'front']));
  assert.equal(JSON.stringify(layers.map((layer) => layer.parallax)), JSON.stringify([0, 0.12, 0.32, 0.62]));
  assert.ok(layers.every((layer) => layer.depth < -18), '四层背景必须位于玩法和用户背景图层之后');
  layers.forEach((layer) => allUrls.add(layer.url));
  assert.ok(theme.themeBackgroundLayers(name, 0).every((layer) => layer.parallax === 0));
  assert.ok(theme.themeBackgroundLayers(name, 1).every((layer) => layer.parallax === 1));
  const svg = theme.themeBackgroundSvg(name, 0.2, 1920, 123);
  assert.equal([...svg.matchAll(/data-theme-layer=/g)].length, 4);
  assert.ok(svg.includes(`backgrounds/${name}/sky.svg`) && svg.includes(`backgrounds/${name}/front.svg`));
  assert.ok(Math.abs(theme.themeBackgroundSvg(name, 0.2, 1000000, 123).length - svg.length) < 20,
    '长地图只能改变承载矩形宽度，不能复制大量 SVG 节点');
}
assert.equal(allUrls.size, 16, '四个主题必须使用各自独立的四层素材，不能只换色复用结构');

const camera = Object.assign(new Events(), { scrollX: 0, width: 960, zoom: 1 });
const events = new Events(), images = [];
const image = () => {
  const value = { scene: true, positions: 0, destroy() { this.scene = false; }, setVisible(v) { this.visible = v; return this; },
    setPosition(x, y) { this.x = x; this.y = y; this.positions++; return this; } };
  for (const method of ['setOrigin', 'setDisplaySize', 'setScrollFactor', 'setDepth', 'setAlpha', 'setFlipX'])
    value[method] = (...args) => { value[method.slice(3).toLowerCase()] = args; return value; };
  images.push(value); return value;
};
const scene = { cameras: { main: camera }, events, textures: { exists: () => true }, add: { image } };
assert.equal(theme.mountThemeBackground(scene, 'forest', 0.2, 123), true);
assert.equal(images.length, 16, '每层只创建覆盖视口所需的四张循环图片');
assert.deepEqual([...new Set(images.map((entry) => entry.scrollfactor[0]))], [0, 0.12, 0.32, 0.62]);
const firstPositions = images.reduce((sum, entry) => sum + entry.positions, 0);
events.emit('prerender'); events.emit('prerender');
assert.equal(images.reduce((sum, entry) => sum + entry.positions, 0), firstPositions,
  '镜头没有跨块时不得逐帧重新布局静态背景');
for (const x of [2000, 8000, 1000000]) { camera.scrollX = x; camera.emit('followupdate'); }
assert.equal(images.length, 16, '百万像素滚动仍复用同一个图片池');
events.emit('shutdown');
assert.ok(images.every((entry) => !entry.scene)); assert.equal(camera.entries.length, 0); assert.equal(events.entries.length, 0);

const queued = [];
const preloadScene = { textures: { exists: () => false }, load: { image: (key, url) => queued.push({ key, url }) } };
theme.preloadThemeBackgrounds(preloadScene);
assert.equal(queued.length, 16); assert.equal(new Set(queued.map((item) => item.key)).size, 16);
assert.ok(queued.every((item) => item.url.includes('.svg')), 'SVG 应由浏览器图片解码，兼容 Vite data URI 与 PNG 替换');

// ForestArt must keep its generated fallback when one or more optional SVGs fail to load.
const forestLoad = runtime({}, { './ThemeBackground': { mountThemeBackground: () => false } });
assert.equal(typeof forestLoad('src/systems/ForestArt.ts').buildForest, 'function');
