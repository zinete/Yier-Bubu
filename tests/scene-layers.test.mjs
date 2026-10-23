import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import ts from 'typescript';
import { editorDocument, editorHistory } from './helpers/editor-model.mjs';
function load(path, require = () => ({}), globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require, ...globals });
  return module.exports;
}
const maps = load('src/systems/CustomMap.ts');
const layers = load('src/systems/SceneLayers.ts');
const backdrop = load('src/systems/SceneBackdrop.ts');
const preset = layers.forestLayerPreset();
const make = () => ({ ...maps.newMap(), scene: { ...backdrop.DEFAULT_SCENE, baseMode: 'sky', layers: globalThis.structuredClone(preset) } });
const canonical = (value) => JSON.stringify(value);
const source = make();
const parsed = maps.parseCustomMap(source);
const defaults = load('src/systems/DefaultAssets.ts', (file) => ({ default: file }));
assert.equal(canonical(defaults.DEFAULT_ASSETS.map((a) => a.id).sort()), canonical([...maps.BUILTIN_ASSET_IDS].sort()), '内置素材注册和导入白名单一致');
assert.ok(!defaults.runtimeMapAssets(maps.newMap()).some((a) => a.id.startsWith('builtin-scene-')), '旧地图不下载未使用的新素材');
const emptyObjects = maps.newMap(); emptyObjects.level.coins = []; emptyObjects.level.enemies = [];
assert.ok(!defaults.runtimeMapAssets(emptyObjects).some((a) => ['builtin-gold-star', 'builtin-leaf-slime'].includes(a.id)), '没有星星或敌人时不加载相应素材');
assert.equal(defaults.runtimeMapAssets(source).filter((a) => a.id.startsWith('builtin-scene-')).length, 4);
const sample = JSON.parse(readFileSync('maps/starlight-relay-layered-60s.json', 'utf8'));
assert.equal(maps.parseCustomMap(sample).scene.layers.length, 4, '实际示范文件可导入');
assert.equal(canonical(sample.level), canonical(JSON.parse(readFileSync('maps/starlight-relay-60s.json', 'utf8')).level), '示范只换视觉，不改关卡路径');
assert.equal(canonical(parsed.scene.layers), canonical(preset));
assert.equal(canonical(maps.parseCustomMap(JSON.parse(canonical(parsed)))), canonical(parsed), '新字段导入导出幂等');
assert.equal(maps.parseCustomMap(maps.newMap()).scene.layers, undefined, '旧地图不强制转换视觉');
assert.equal(maps.parseCustomMap(maps.newMap()).scene.baseMode, undefined);
for (const mutate of [
  (m) => { m.scene.layers = Array.from({ length: 17 }, (_, i) => ({ ...preset[0], id: `l-${i}` })); },
  (m) => { m.scene.layers[1].id = m.scene.layers[0].id; },
  (m) => { m.scene.layers[0].id = '" onclick="alert(1)'; },
  (m) => { m.scene.layers[0].assetId = 'missing'; },
  (m) => { m.scene.layers[0].assetId = 'https://example.com/untrusted.png'; },
  (m) => { m.scene.layers[0].group = 'gameplay'; },
  (m) => { m.scene.layers[0].mode = 'script'; },
  (m) => { m.scene.layers[0].width = Infinity; },
  (m) => { m.scene.layers[0].height = 0; },
  (m) => { m.scene.layers[0].parallax = 1.1; },
  (m) => { m.scene.layers[0].opacity = -1; },
  (m) => { m.scene.layers[0].visible = 'false'; },
  (m) => { m.scene.layers[0].locked = 1; },
  (m) => { m.scene.layers[0].name = ''; },
  (m) => { m.scene.baseMode = 'bad'; },
]) { const bad = make(); mutate(bad); assert.throws(() => maps.parseCustomMap(bad)); }
const extra = make(); extra.scene.layers[0].script = 'bad';
assert.equal(maps.parseCustomMap(extra).scene.layers[0].script, undefined, '图层仍只有数据，不执行代码');
const uploads = make(); uploads.assets = [{ id: 'upload', name: '自定义山', data: 'data:image/png;base64,iVBORw0KGgo=', width: 512, height: 256 }];
uploads.scene.layers[1].assetId = 'upload';
assert.equal(maps.parseCustomMap(uploads).scene.layers[1].assetId, 'upload');
const library = [...maps.BUILTIN_ASSET_IDS.map((id) => ({ id, data: `${id}.png` })), ...uploads.assets];
const svg = layers.sceneLayersSvg(preset, library, 1920, 'background');
assert.equal((svg.match(/data-scene-layer=/g) ?? []).length, 3);
assert.ok(svg.includes('patternUnits="userSpaceOnUse"'));
assert.ok(!svg.includes('forest-foliage'));
assert.ok(layers.sceneLayersSvg(preset, library, 1920, 'foreground').includes('forest-foliage'));
assert.ok(layers.sceneLayersSvg([{ ...preset[1], mode: 'image', x: -32, y: 64 }], library, 1920, 'background').includes('translate(-32 64)'));
const hidden = preset.map((p) => ({ ...p, visible: false }));
assert.equal(layers.sceneLayersSvg(hidden, library, 1920, 'background'), '');
assert.ok(Math.abs(layers.sceneLayersSvg(preset, library, 1000000, 'background').length - svg.length) < 40, '长地图不增加图元数量');
assert.ok(!backdrop.sceneBackdropSvg(source.scene, 1920).includes('scene-preview-trees'), '仅天空模式不再叠加主题几何树');
assert.ok(backdrop.sceneBackdropSvg(backdrop.DEFAULT_SCENE, 1920).includes('scene-preview-trees'), '原主题保留');

// Phaser 适配器：使用实际纹理尺寸而不是素材缩略图尺寸；跟随相机、缩放、释放监听。
const camera = Object.assign(new EventEmitter(), { scrollX: 100, width: 960, zoom: 1, worldView: { x: 100 } });
const events = new EventEmitter(), sprites = [];
function sprite(kind, x, y, width, height, key) {
  const s = { kind, x, y, width, height, key };
  for (const name of ['setOrigin', 'setDisplaySize', 'setScrollFactor', 'setAlpha', 'setDepth', 'setTileScale', 'setPosition', 'setSize', 'setTilePosition']) {
    s[name] = (...values) => { s[name + 'Args'] = values; return s; };
  }
  sprites.push(s); return s;
}
const runtime = { cameras: { main: camera }, events, textures: { exists: () => true, get: () => ({ get: () => ({ cutWidth: 1774, cutHeight: 887 }) }) },
  add: { image: (x, y, key) => sprite('image', x, y, 0, 0, key), tileSprite: (x, y, w, h, key) => sprite('repeat', x, y, w, h, key) } };
const rendered = [{ ...preset[0], x: 32 }, { ...preset[1], mode: 'image' }, { ...preset[2], visible: false }, preset[3]];
layers.mountSceneLayers(runtime, rendered, new Map(library.map((a) => [a.id, a.id])));
assert.equal(sprites.length, 3, '隐藏图层不创建运行时对象');
assert.equal(sprites[0].setSizeArgs[0], 960, '平铺仅覆盖视口，不用地图宽度分配画布');
assert.equal(sprites[1].setDepthArgs[0], layers.layerDepth(rendered[1], 1));
assert.ok(sprites[2].setDepthArgs[0] > 6, '前景在角色和旧前景之上');
for (const zoom of [0.5, 1, 1.75, 2]) {
  for (const scrollX of [0, 300, 50000]) {
    camera.zoom = zoom; camera.scrollX = scrollX;
    camera.worldView.x = scrollX + 480 - 480 / zoom;
    camera.emit('followupdate');
    for (const [index, p] of [[0, rendered[0]], [2, rendered[3]]]) {
      const view = layers.repeatLayerViewport(p, camera, 1774);
      assert.equal(sprites[index].setPositionArgs[0], view.x);
      assert.equal(sprites[index].setSizeArgs[0], 960 / zoom);
      const visibleTileOrigin = view.x - sprites[index].setTilePositionArgs[0] * p.width / 1774;
      assert.ok(Math.abs(visibleTileOrigin - layers.layerScreenX(p, scrollX)) < 1e-8, '平铺相位与 SVG 视差相同');
    }
  }
}
// 使用项目实际 Phaser CameraManager.shutdown，重现引擎先销毁相机的顺序。
const PhaserCameraManager = load('node_modules/phaser/src/cameras/2d/CameraManager.js', (name) => {
  if (name === '../../utils/Class') return function (definition) {
    const constructor = definition.initialize;
    Object.assign(constructor.prototype, definition); return constructor;
  };
  if (name === '../../plugins/PluginCache') return { register() {} };
  if (name === '../../scene/events') return { UPDATE: 'update', SHUTDOWN: 'shutdown' };
  return {};
});
const shutdownScene = Object.assign(Object.create(PhaserCameraManager.prototype), {
  main: camera, cameras: [camera], systems: { events },
});
camera.destroy = () => { camera.destroyed = true; camera.removeAllListeners(); };
runtime.cameras = shutdownScene;
// 引擎监听早于应用监听注册，因此必须插到队首，不能只测试相机仍存在的理想情况。
events.prependOnceListener('shutdown', () => shutdownScene.shutdown());
assert.doesNotThrow(() => events.emit('shutdown'), '相机管理器先清空 main 后，图层清理不能再读取 main.off');
assert.equal(runtime.cameras.main, undefined); assert.equal(camera.destroyed, true);
assert.equal(camera.listenerCount('followupdate'), 0); assert.equal(events.listenerCount('prerender'), 0);
// 重复试玩/退出，并调用已排队的旧回调：不能访问销毁的相机或更新旧精灵。
for (let cycle = 0; cycle < 8; cycle++) {
  const lifecycleEvents = new EventEmitter();
  const nextCamera = Object.assign(new EventEmitter(), { scrollX: cycle * 100, width: 960, zoom: 1, worldView: { x: cycle * 100 } });
  nextCamera.destroy = () => { nextCamera.removeAllListeners(); nextCamera.worldView = undefined; };
  const manager = Object.assign(Object.create(PhaserCameraManager.prototype), {
    main: nextCamera, cameras: [nextCamera], systems: { events: lifecycleEvents },
  });
  const lifecycleScene = { ...runtime, cameras: manager, events: lifecycleEvents };
  lifecycleEvents.once('shutdown', () => manager.shutdown());
  layers.mountSceneLayers(lifecycleScene, preset, new Map(library.map((a) => [a.id, a.id])));
  const queued = lifecycleEvents.listeners('prerender')[0];
  assert.equal(nextCamera.listenerCount('followupdate'), 1);
  assert.doesNotThrow(() => lifecycleEvents.emit('shutdown'));
  assert.equal(lifecycleEvents.listenerCount('prerender'), 0);
  assert.equal(lifecycleEvents.listenerCount('shutdown'), 0);
  assert.equal(nextCamera.listenerCount('followupdate'), 0);
  assert.doesNotThrow(() => queued(), '退出后的排队回调不能触碰已销毁的 worldView');
  assert.doesNotThrow(() => lifecycleEvents.emit('shutdown'), '重复退出事件无副作用');
}

const { EditorScene } = load('src/scenes/EditorScene.ts', (name) => {
  if (name === 'phaser') return { default: { Scene: class {} } };
  if (name.endsWith('/EditorDocument')) return editorDocument;
  if (name.endsWith('/EditorHistory')) return editorHistory;
  if (name.endsWith('/CustomMap')) return maps;
  if (name.endsWith('/SceneLayers')) return layers;
  if (name.endsWith('/SceneBackdrop')) return backdrop;
  if (name.endsWith('/DefaultAssets')) return { mapAssets: (map) => [...library, ...(map.assets ?? [])] };
  return {};
}, { structuredClone: globalThis.structuredClone, window: { confirm: () => true } });
const editor = Object.create(EditorScene.prototype);
const zones = { background: { innerHTML: '' }, foreground: { innerHTML: '' } };
Object.assign(editor, { map: make(), selectedLayerId: preset[1].id, undo: [], redo: [], objectSerial: 0,
  measureUsedAssets() {},
  root: { isConnected: true, querySelector: (selector) => selector === 'svg'
    ? { querySelector: (selector) => zones[selector.match(/zone="([^"]+)"/)?.[1]] } : null },
  render() { this.commitHistory(); this.renderCount = (this.renderCount ?? 0) + 1; },
  updateSceneParallax() { this.parallaxUpdates = (this.parallaxUpdates ?? 0) + 1; },
  message(text) { this.lastMessage = text; } });
const gameplay = canonical(editor.map.level);
for (const opacity of ['0.4', '0.6', '0.8']) assert.equal(editor.applyLayerField({ dataset: { layerField: 'opacity' }, value: opacity }), true);
assert.equal(editor.undo.length, 0); assert.equal(editor.renderCount, undefined, '连续输入只刷新视觉图层，不能重建玩法对象或表单');
editor.commitSceneEdit(); assert.equal(editor.undo.length, 1, '一次连续输入合并一次撤销');
for (const value of ['', 'bad', '-1', '2']) assert.equal(editor.applyLayerField({ dataset: { layerField: 'opacity' }, value }), false);
assert.equal(editor.currentSceneLayer().opacity, 0.8);
editor.applyLayerField({ dataset: { layerField: 'parallax' }, value: '0.35' }); editor.commitSceneEdit();
editor.action('undo'); assert.equal(editor.currentSceneLayer().parallax, 0.16);
editor.action('redo'); assert.equal(editor.currentSceneLayer().parallax, 0.35);
editor.action('layer-lock'); const locked = canonical(editor.map);
assert.equal(editor.applyLayerField({ dataset: { layerField: 'x' }, value: '128' }), false);
editor.action('layer-delete'); assert.equal(canonical(editor.map), locked, '锁定层不能修改或删除');
editor.reorderSceneLayer(preset[1].id, preset[0].id); assert.equal(canonical(editor.map), locked, '锁定层不能拖动排序');
editor.action('layer-visible'); assert.equal(editor.currentSceneLayer().visible, false, '锁定仍可隐藏');
editor.action('layer-lock'); editor.action('layer-visible');
editor.reorderSceneLayer(preset[1].id, preset[0].id); assert.equal(editor.map.scene.layers[0].id, preset[1].id);
const beforeCrossGroup = canonical(editor.map);
editor.reorderSceneLayer(preset[1].id, preset[3].id); assert.equal(canonical(editor.map), beforeCrossGroup);
editor.action('layer-duplicate'); assert.equal(editor.map.scene.layers.length, 5); assert.notEqual(editor.currentSceneLayer().id, preset[1].id);
editor.action('layer-delete'); assert.equal(editor.map.scene.layers.length, 4);
editor.action('layer-add'); assert.equal(editor.map.scene.layers.length, 5);
editor.editSceneLayer('layer-add', 'builtin-scene-foliage');
assert.equal(editor.currentSceneLayer().assetId, 'builtin-scene-foliage'); assert.equal(editor.currentSceneLayer().group, 'foreground');
editor.action('layer-preset'); assert.equal(editor.map.scene.layers.length, 4);
assert.equal(canonical(editor.map.level), gameplay, '图层编辑、预设、撤销重做不能修改任何玩法或碰撞数据');
editor.selectedLayerId = preset[0].id;
const initial = canonical(editor.map.scene);
editor.applyLayerField({ dataset: { layerField: 'opacity' }, value: '0.5' });
editor.applyLayerField({ dataset: { layerField: 'opacity' }, value: '1' });
const undoLength = editor.undo.length; editor.commitSceneEdit();
assert.equal(editor.undo.length, undoLength, '回到原值不产生空撤销'); assert.equal(canonical(editor.map.scene), initial);
const keys = [];
editor.action = (action) => keys.push(action);
editor.handleKeyDown({ key: 'Delete', code: 'Delete', target: { closest: (selector) => selector.includes('.scene-layer-panel') ? {} : null }, preventDefault() {} });
assert.equal(keys[0], 'layer-delete', '图层面板 Delete 不能误删画布里的玩法对象');

// 实际 GameScene 入口必须连接图层适配器，基础天空模式不注入旧版路牌。
let mounted, forestArgs;
const { GameScene } = load('src/scenes/GameScene.ts', (name) => {
  if (name === 'phaser') return { default: { Scene: class {} } };
  if (name.endsWith('/DefaultAssets')) return { mapAssets: () => [] };
  if (name.endsWith('/ForestArt')) return { buildForest: (...args) => { forestArgs = args; } };
  if (name.endsWith('/SceneLayers')) return { mountSceneLayers: (...args) => { mounted = args; } };
  if (name.endsWith('/ViewportArt')) return { ViewportPlatformRenderer: class { add() {} sync() {} } };
  return {};
});
const game = Object.assign(Object.create(GameScene.prototype), { customMap: make(), level: maps.newMap().level,
  customTextures: new Map(), skinKey() {}, drawObjectSkin() {} });
game.createBackground();
assert.equal(mounted[1], game.customMap.scene.layers); assert.equal(forestArgs[4], true); assert.equal(forestArgs[6], true);
