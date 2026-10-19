import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { editorDocument, editorHistory } from './helpers/editor-model.mjs';
function load(path, require = () => ({}), globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require, ...globals });
  return module.exports;
}
const geometry = load('src/systems/ObjectGeometry.ts');
const { EDITOR_GRID, CUSTOM_OBJECTS, objectBounds, snapObjectToGrid, resizeObjectOnGrid } = geometry;
const kinds = ['coin', 'enemy', 'spawn', 'checkpoint', 'platform', 'flag', 'decoration'];
function aligned(kind, p, worldWidth = 10003) {
  const r = objectBounds(kind, p);
  for (const edge of [r.x, r.y, r.x + r.width, r.y + r.height]) {
    assert.equal(edge % EDITOR_GRID, 0, `${kind} 的每条边都应对齐网格：${JSON.stringify(r)}`);
  }
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= worldWidth && r.y + r.height <= 540);
}
for (const kind of kinds) {
  for (const x of [-900, 0, 7.3, 101, 330, 9999, 20000]) {
    for (const y of [-900, 0, 11.5, 107, 390, 539, 1000]) {
      const raw = { x, y, width: 75, height: 43 };
      const p = snapObjectToGrid(kind, raw, 10003);
      aligned(kind, p);
      assert.equal(raw.x, x, '纯函数不能修改导入对象');
      assert.equal(JSON.stringify(snapObjectToGrid(kind, p, 10003)), JSON.stringify(p), '吸附应幂等，不能反复漂移');
      const resized = resizeObjectOnGrid(kind, raw, 178.5, 54.5, 10003);
      aligned(kind, resized);
    }
  }
}
assert.equal(objectBounds('coin', { x: 336, y: 400 }).width, 32);
assert.equal(objectBounds('enemy', { x: 336, y: 400 }).y, 368, '敌人以底部为锚点');

const customMap = load('src/systems/CustomMap.ts');
const assets = ['moss-platform', 'gold-star', 'leaf-slime', 'lantern-marker', 'flower-bush'].map((name) =>
  ({ id: `builtin-${name}`, name, data: `${name}.png`, width: 320, height: 224 }));
const defaultSkins = { platform: assets[0].id, coin: assets[1].id, enemy: assets[2].id,
  spawn: assets[3].id, checkpoint: assets[3].id, flag: assets[3].id };
const fakeBounds = { sourceWidth: 100, sourceHeight: 100, x: 0, y: 0, width: 100, height: 100, surfaceY: 0 };
const assetGeometry = load('src/systems/AssetGeometry.ts');
let previewElement;
const { EditorScene } = load('src/scenes/EditorScene.ts', (name) => {
  if (name === 'phaser') return { default: { Scene: class {} } };
  if (name.endsWith('/EditorDocument')) return editorDocument;
  if (name.endsWith('/EditorHistory')) return editorHistory;
  if (name.endsWith('/constants')) return load('src/config/constants.ts');
  if (name.endsWith('/ObjectGeometry')) return geometry;
  if (name.endsWith('/CustomMap')) return customMap;
  if (name.endsWith('/DefaultAssets')) return { DEFAULT_ASSETS: assets, DEFAULT_OBJECT_SKINS: defaultSkins, mapAssets: () => assets };
  if (name.endsWith('/AssetGeometry')) return { ...assetGeometry, cachedAssetGeometry: () => fakeBounds };
  if (name.endsWith('/PlatformMaterial')) return load('src/systems/PlatformMaterial.ts');
  return {};
}, {
  structuredClone: globalThis.structuredClone,
  cancelAnimationFrame: () => {}, requestAnimationFrame: () => 1,
  document: { createElementNS: () => ({ dataset: {}, setAttribute() {}, innerHTML: '' }) },
});
function sceneFor(kind) {
  const scene = Object.create(EditorScene.prototype);
  const svg = {
    // 模拟页面偏移、画布 CSS 缩放，保证吸附的是世界网格而不是屏幕像素。
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 960, height: 270 }),
    setPointerCapture() {}, querySelector: () => undefined, append: (node) => { previewElement = node; },
    focus() {},
  };
  Object.assign(scene, { map: customMap.newMap(), tool: kind, undo: [], redo: [],
    paintWidth: 173, paintHeight: 35, renderFrame: 0, previewFrame: 0,
    root: { querySelector: (selector) => selector === 'svg' ? svg : {} },
    render() { this.commitHistory(); }, scheduleCanvas() {}, message() {},
  });
  return scene;
}
function event(x, y, target = { closest: () => null }, shiftKey = false) {
  return { clientX: 100 + x / 2, clientY: 50 + y / 2, button: 0,
    pointerId: 1, target, shiftKey, altKey: false };
}
function target(kind, resize = false) {
  return { closest: (selector) => selector === '[data-resize]' ? (resize ? {} : null)
    : { getAttribute: (name) => name === 'data-object' ? kind : '0' } };
}
for (const kind of kinds) {
  const scene = sceneFor(kind);
  if (kind === 'decoration') scene.assetId = assets[4].id;
  scene.preview = { x: 333.2, y: 401.7 };
  const expected = scene.placement(scene.preview);
  scene.drawPreview();
  const hit = objectBounds(kind, expected);
  assert.ok(previewElement.innerHTML.includes(`<rect x="${hit.x}" y="${hit.y}" width="${hit.width}" height="${hit.height}"`), '幽灵预览使用吸附后的碰撞框');
  scene.pointerDown(event(333.2, 401.7, undefined, true));
  aligned(kind, scene.object(), 1920);
  assert.equal(scene.object().x, expected.x, '实际放置与幽灵预览相同');
  assert.equal(scene.object().y, expected.y);
}
for (const kind of kinds) {
  const scene = sceneFor('select');
  const p = { x: 330, y: 390, width: 75, height: 43 };
  if (kind === 'coin') scene.map.level.coins = [p];
  else if (kind === 'enemy') scene.map.level.enemies = [{ ...p, min: 250, max: 410, speed: 70 }];
  else if (kind === 'platform') scene.map.level.platforms = [{ ...p, id: 'p', kind: 'platform' }];
  else if (kind === 'decoration') scene.map.decorations = [{ ...p, assetId: assets[4].id }];
  else scene.map.level[kind] = p;
  const before = JSON.stringify(scene.map);
  scene.pointerDown(event(337.25, 395.75, target(kind)));
  assert.equal(JSON.stringify(scene.map), before, '仅选中旧对象不能擅自改动地图');
  scene.pointerMove(event(340.25, 407.75, undefined, true)); // 实际对象移动 +3,+12，而非鼠标吸附差值。
  aligned(kind, scene.object(), 1920);
  const expected = snapObjectToGrid(kind, { ...p, x: 333, y: 402 }, 1920);
  assert.equal(scene.object().x, expected.x);
  assert.equal(scene.object().y, expected.y, '不同按下偏移、Shift 均不能破坏吸附');
  scene.pointerMove(event(341.25, 408.75));
  aligned(kind, scene.object(), 1920);
  scene.endDrag(true);
  assert.equal(JSON.stringify(scene.map), before, '取消拖动应恢复原尺寸及坐标');
}
const resizing = sceneFor('select');
resizing.map.decorations = [{ x: 101, y: 105, width: 75, height: 43, assetId: assets[4].id }];
resizing.selected = { kind: 'decoration', index: 0 };
resizing.pointerDown(event(176, 148, target('decoration', true)));
resizing.pointerMove(event(4000, 900, undefined, true));
aligned('decoration', resizing.object(), 1920);
resizing.endDrag();
assert.equal(resizing.undo.length, 1, '一次拖动只记录一次撤销');
resizing.nudge('ArrowLeft', EDITOR_GRID);
aligned('decoration', resizing.object(), 1920);

// 回归：操作 6000px 地面后，新建跳台不能继承它的尺寸。
const brush = sceneFor('select');
brush.map.level.width = 8000;
brush.map.level.platforms = [{ id: 'long-ground', x: 0, y: 432, width: 6000, height: 96, kind: 'ground' }];
brush.position = (e) => ({ x: e.clientX, y: e.clientY });
brush.resetPlatformBrush();
const brushEvent = (x, y, resize = false) => ({ clientX: x, clientY: y, button: 0, pointerId: 1, target: target('platform', resize) });
const defaultBrush = () => { assert.equal(brush.paintWidth, 160); assert.equal(brush.paintHeight, 32); };
brush.pointerDown(brushEvent(120, 440)); brush.endDrag();
defaultBrush();
brush.pointerDown(brushEvent(120, 440)); brush.pointerMove(brushEvent(136, 424)); brush.endDrag();
defaultBrush();
let ground = brush.object();
brush.pointerDown(brushEvent(ground.x + ground.width, ground.y + ground.height, true));
brush.pointerMove(brushEvent(6400, 520)); brush.endDrag();
defaultBrush();
let propertyKind = 'ground';
let propertyWidth = '6000', propertyHeight = '96';
const brushQuery = brush.root.querySelector;
brush.root.querySelector = (selector) => selector === '[data-kind]' ? { value: propertyKind }
  : ['[data-appearance]', '[data-layer]', '[data-solid]', '[data-remote]'].includes(selector) ? null : brushQuery(selector);
brush.root.querySelectorAll = () => [{ dataset: { prop: 'width' }, value: propertyWidth }, { dataset: { prop: 'height' }, value: propertyHeight }];
brush.action('properties');
defaultBrush();
brush.tool = 'platform';
brush.pointerDown(brushEvent(800, 240));
assert.equal(brush.object().width, 160); assert.equal(brush.object().height, 32);
assert.equal(brush.object().kind, 'platform');
assert.equal(brush.map.level.platforms[0].width, 6000, '新建跳台不能缩短已有地面');

// 明确编辑浮台时仍可记住尺寸、连续放置；仅选中和移动不能覆盖笔刷。
propertyKind = 'platform'; propertyWidth = '256'; propertyHeight = '48';
brush.action('properties');
assert.equal(brush.paintWidth, 256); assert.equal(brush.paintHeight, 48);
brush.pointerDown(brushEvent(1200, 160));
assert.equal(brush.object().width, 256); assert.equal(brush.object().height, 48);
propertyWidth = '6000'; propertyHeight = '96';
brush.action('properties');
assert.equal(brush.paintWidth, 6000);
propertyKind = 'ground';
brush.action('properties');
defaultBrush();
brush.tool = 'select';
brush.selected = { kind: 'platform', index: 1 };
const beforeCancel = JSON.stringify(brush.map);
const floating = brush.object();
brush.pointerDown(brushEvent(floating.x + floating.width, floating.y + floating.height, true));
brush.pointerMove(brushEvent(floating.x + floating.width + 64, floating.y + floating.height));
brush.endDrag(true);
assert.equal(JSON.stringify(brush.map), beforeCancel);
defaultBrush();
const resizedFloat = brush.object();
brush.pointerDown(brushEvent(resizedFloat.x + resizedFloat.width, resizedFloat.y + resizedFloat.height, true));
brush.pointerMove(brushEvent(resizedFloat.x + resizedFloat.width + 32, resizedFloat.y + resizedFloat.height + 16));
brush.endDrag();
assert.equal(brush.paintWidth, 288); assert.equal(brush.paintHeight, 64, '实际缩放跳台后记住其尺寸');
brush.tool = 'platform';
assert.equal(brush.placement({ x: 400, y: 160 }).width, 288);
brush.paintWidth = 6000; brush.paintHeight = 96;
const beforeReset = JSON.stringify(brush.map), historyBeforeReset = brush.undo.length;
brush.action('reset-platform-size');
defaultBrush();
assert.equal(JSON.stringify(brush.map), beforeReset, '恢复放置尺寸不修改任何地图对象');
assert.equal(brush.undo.length, historyBeforeReset, '重置笔刷不产生地图撤销记录');

// 验证实际试玩入口设置的体积与编辑框一致；不改变官方关卡的默认碰撞。
const { GameScene } = load('src/scenes/GameScene.ts', (name) => name === 'phaser' ? { default: { Scene: class {} } }
  : name.endsWith('/ObjectGeometry') ? geometry : {});
const game = Object.create(GameScene.prototype);
const body = { setSize(w, h) { this.width = w; this.height = h; return this; },
  setOffset(x, y) { this.offset = { x, y }; return this; } };
const coin = { width: 100, height: 80, x: 336, y: 400, body,
  setTexture() { return this; }, setScale(s) { this.scaleX = s; this.scaleY = s; return this; }, setTint() { return this; },
  setDisplaySize(w, h) { this.scaleX = w / this.width; this.scaleY = h / this.height; return this; },
  clearTint() { return this; }, setCircle() { return this; }, setData() { return this; },
};
game.level = { coins: [{ x: coin.x, y: coin.y }] };
game.physics = { add: { group: () => ({ create: () => coin }) } };
game.skinKey = () => 'star'; game.textures = { exists: () => true }; game.tweens = { add() {} };
game.createCoins();
assert.equal(body.width * coin.scaleX, CUSTOM_OBJECTS.coin.bodyWidth);
assert.equal(coin.x - coin.width * coin.scaleX / 2 + body.offset.x * coin.scaleX, objectBounds('coin', coin).x);
assert.equal(coin.y - coin.height * coin.scaleY / 2 + body.offset.y * coin.scaleY, objectBounds('coin', coin).y);
const { Enemy } = load('src/entities/Enemy.ts', (name) => name === 'phaser'
  ? { default: { Physics: { Arcade: { Sprite: class {} } } } } : geometry);
const enemy = Object.create(Enemy.prototype);
Object.assign(enemy, { ...coin, x: 336, y: 400 });
enemy.applySkin('slime');
assert.equal(body.width * enemy.scaleX, CUSTOM_OBJECTS.enemy.bodyWidth);
assert.equal(body.height * enemy.scaleY, CUSTOM_OBJECTS.enemy.bodyHeight);
assert.equal(enemy.x - enemy.width * enemy.scaleX / 2 + body.offset.x * enemy.scaleX, objectBounds('enemy', enemy).x);
assert.equal(enemy.y - enemy.height * enemy.scaleY + body.offset.y * enemy.scaleY, objectBounds('enemy', enemy).y);
