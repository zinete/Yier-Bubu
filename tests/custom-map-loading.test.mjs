import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { log } from 'node:console';
import { JSDOM } from 'jsdom';
import { runtime, Events } from './helpers/runtime.mjs';
const dom = new JSDOM('<div id="app"></div>');
const document = dom.window.document;
const assets = ['floor', 'star', 'enemy', 'marker', 'flowers', 'hidden', 'unused'].map((id) => ({ id, name: id, data: `${id}.png`, width: 32, height: 32 }));
const defaults = { platform: 'floor', coin: 'star', enemy: 'enemy', spawn: 'marker', checkpoint: 'marker', flag: 'marker' };
const resources = runtime({}, { './DefaultAssets': { DEFAULT_OBJECT_SKINS: defaults, runtimeMapAssets: () => assets } })('src/systems/CustomMapResources.ts');
const map = runtime()('src/systems/CustomMap.ts').newMap();
map.level.enemies = [{ x: 500, y: 444, min: 400, max: 600 }];
map.decorations = [{ assetId: 'flowers', x: 10, y: 20, width: 32, height: 32 }];
map.scene = { theme: 'forest', layers: [{ assetId: 'hidden', visible: false }] };
const selected = resources.customMapResources(map);
assert.deepEqual(Array.from(selected.assets, (a) => a.id), ['floor', 'star', 'enemy', 'marker', 'flowers']);
assert.ok(selected.required.has('floor')); assert.ok(!selected.required.has('flowers'));
map.decorations[0].solid = true;
assert.ok(resources.customMapResources(map).required.has('flowers')); map.decorations[0].solid = false;
const source = readFileSync('src/scenes/GameScene.ts', 'utf8');
const mocks = Object.fromEntries([...source.matchAll(/from '([^']+)'/g)].map((match) => [match[1], {}]));
let geometryError = '';
const load = runtime({ document }, { ...mocks,
  phaser: { default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Loader: { Events: { COMPLETE: 'complete' } } } },
  '../config/constants': { SCENE: { GAME: 'game', EDITOR: 'editor' } },
  '../levels': { getLevel: () => map.level },
  '../systems/BubbleShield': { BubbleShield: class {} },
  '../systems/CustomMapResources': resources,
  '../systems/CustomMapLoadScreen': runtime({ document })('src/systems/CustomMapLoadScreen.ts'),
  '../systems/AssetGeometry': { readAssetGeometry(source) { if (source === geometryError) throw new Error('unreadable pixels');
    return { x: 0, y: 0, width: 32, height: 32 }; } },
});
const { GameScene } = load('src/scenes/GameScene.ts');
function setup() {
  const scene = new GameScene(), textures = new Map();
  Object.assign(scene, { customMap: map, status: 'paused', events: new Events(), load: new Events(),
    sys: { isActive: () => true }, starts: [], launches: 0 });
  scene.queued = [];
  scene.load.image = (key, data) => scene.queued.push({ key, data }); scene.load.start = () => {};
  scene.textures = { exists: (key) => textures.has(key), get: (key) => textures.get(key), remove: (key) => textures.delete(key) };
  scene.scene = { start: (key) => scene.starts.push(key) };
  scene.startPlayableMap = () => { scene.launches++; scene.status = 'playing'; };
  scene.preload();
  return { scene, complete(id) { textures.set(scene.customTextures.get(id), { get: () => ({ cutWidth: 32, cutHeight: 32 }), add() {}, getSourceImage() {} }); },
    close() { scene.events.emit('shutdown'); assert.equal(document.querySelector('.custom-map-load'), null); assert.equal(scene.load.entries.length, 0); } };
}
let run = setup();
for (const id of ['star', 'enemy', 'marker']) run.complete(id);
run.scene.create(); run.scene.update(0, 16);
assert.equal(run.scene.launches, 0); assert.equal(run.scene.status, 'paused');
assert.match(document.querySelector('.custom-map-load').textContent, /floor/);
run.scene.queued = []; run.scene.retryMapLoading(); run.scene.retryMapLoading();
assert.deepEqual(run.scene.queued.map((a) => a.data), ['floor.png', 'flowers.png'], '重试仅请求失败素材');
assert.equal(run.scene.load.entries.length, 1, '连续点击不重复注册完成回调');
run.complete('floor'); run.scene.load.emit('complete');
assert.equal(run.scene.launches, 1); assert.equal(run.scene.mapReady, true);
assert.match(document.querySelector('.custom-map-load').textContent, /部分场景装饰未加载/);
run.scene.retryMapLoading(); assert.equal(run.scene.launches, 1);
run.close();

run = setup(); for (const id of ['floor', 'star', 'enemy', 'marker', 'flowers']) run.complete(id);
geometryError = 'floor.png'; run.scene.create(); assert.equal(run.scene.launches, 0, '像素测量失败也必须阻止隐形平台');
assert.equal(run.scene.textures.exists(run.scene.customTextures.get('floor')), false);
geometryError = ''; run.scene.retryMapLoading(); run.complete('floor'); run.scene.load.emit('complete');
assert.equal(run.scene.launches, 1); assert.equal(document.querySelector('.custom-map-load'), null); run.close();
run = setup(); run.scene.create(); run.scene.leaveMapLoading(); run.scene.leaveMapLoading();
assert.deepEqual(run.scene.starts, ['editor']); run.close(); assert.equal(run.scene.customTextures.size, 0);
run = setup(); run.scene.create(); run.scene.retryMapLoading();
const queued = run.scene.finishMapRetry.bind(run.scene); run.close(); queued(); assert.equal(run.scene.launches, 0);
dom.window.close();
log('custom map loading: critical gate, optional fallback, cached retry, pixel-read failure, return and shutdown passed');
