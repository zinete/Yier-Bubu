import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import process from 'node:process';
function load(path, require = () => ({}), globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require, ...globals });
  return module.exports;
}
const backdrop = load('src/systems/SceneBackdrop.ts');
const { DEFAULT_SCENE, SCENE_PALETTES, backdropLayers, themeParallax, sceneBackdropSvg } = backdrop;
for (const theme of Object.keys(SCENE_PALETTES)) {
  const layers = backdropLayers(theme);
  assert.ok(layers.length >= 3);
  assert.ok(layers.every((l) => l.shapes.length > 0));
  assert.ok(backdropLayers(theme, 0).every((l) => l.parallax === 0), '0 表示固定背景');
  assert.ok(backdropLayers(theme, 1).every((l) => l.parallax === 1), '1 表示全部随地图');
  const svg = sceneBackdropSvg({ ...DEFAULT_SCENE, theme }, 1920);
  assert.ok(svg.includes(SCENE_PALETTES[theme].sky[0]));
  assert.ok(svg.includes('scene-preview-hills') && svg.includes('scene-preview-trees'));
  assert.equal(svg.includes('scene-preview-stars'), theme === 'night');
  const longSvg = sceneBackdropSvg({ ...DEFAULT_SCENE, theme }, 1000000);
  assert.ok(Math.abs(longSvg.length - svg.length) < 100, '长地图背景以 pattern 重复，不能生成成千上万 SVG 图元');
}
assert.equal(themeParallax(0.42, 0.2), 0.42, '默认保留原有层级视差');

const mapModule = load('src/systems/CustomMap.ts');
const library = (map) => map.assets ?? [];
let assetMeasurements;
const { EditorScene } = load('src/scenes/EditorScene.ts', (name) => {
  if (name === 'phaser') return { default: { Scene: class {} } };
  if (name.endsWith('/SceneBackdrop')) return backdrop;
  if (name.endsWith('/CustomMap')) return mapModule;
  if (name.endsWith('/DefaultAssets')) return { mapAssets: library };
  if (name.endsWith('/AssetGeometry')) return { cachedAssetGeometry: () => assetMeasurements };
  return {};
}, { window: { matchMedia: () => ({ matches: false }) } });
const scene = Object.create(EditorScene.prototype);
scene.map = mapModule.newMap();
scene.map.assets = [{ id: 'bg', name: '我的背景', data: 'data:image/png;base64,iVBORw0KGgo=', width: 256, height: 128 }];
scene.undo = []; scene.redo = [];
scene.selected = { kind: 'coin', index: 0 };
const selected = scene.selected;
const fields = Object.fromEntries(Object.entries({ theme: 'forest', background: '', mode: 'stretch', parallax: '0.2' })
  .map(([name, value]) => [`[data-scene="${name}"]`, { value, disabled: false, dataset: {} }]));
const slider = { value: '0.2', dataset: { parallaxSlider: '' } };
const status = { textContent: '', classList: { toggle(name, active) { status[name] = active; } } };
const undoButton = { disabled: true }, redoButton = { disabled: true };
let layers = [], markup = '', renders = 0, saved, backgroundRebuilds = 0;
const background = { get innerHTML() { return markup; }, set innerHTML(value) {
  backgroundRebuilds += 1;
  markup = value;
  layers = [...value.matchAll(/data-preview-parallax="([^"]+)"/g)].map((m) => ({
    factor: Number(m[1]), getAttribute(name) { return name === 'data-preview-parallax' ? String(this.factor) : this[name]; },
    setAttribute(name, value) { if (name === 'data-preview-parallax') this.factor = Number(value); else this[name] = value; },
  }));
} };
const workspace = { scrollLeft: 0, scrollWidth: 1960, clientWidth: 960,
  getBoundingClientRect: () => ({ left: 100 }), scrollTo(options) { this.scrollLeft = options.left; this.behavior = options.behavior; } };
const svg = { style: {}, getBoundingClientRect: () => ({ left: 120 - workspace.scrollLeft, width: 960 }),
  querySelector: () => background, querySelectorAll: () => layers };
scene.root = { isConnected: true, querySelector: (selector) => fields[selector] ?? ({ svg, '.workspace': workspace,
  '[data-parallax-slider]': slider, '.scene-preview-status': status,
  '[data-action="undo"]': undoButton, '[data-action="redo"]': redoButton })[selector] };
scene.message = (text) => { scene.lastMessage = text; };
scene.render = () => { renders += 1; scene.renderSceneControls(); scene.renderSceneBackground(); };
scene.save = () => { saved = JSON.stringify(scene.map); return true; };
const objectsBefore = JSON.stringify(scene.map.level);
fields['[data-scene="theme"]'].value = 'snow';
assert.equal(scene.applySceneSettings(), true);
assert.equal(scene.map.scene.theme, 'snow');
assert.ok(markup.includes('#8fbbd8'), '选择后立即替换为雪地背景，不等待保存按钮');
assert.equal(renders, 0, '实时更新不能重建对象层/整个编辑器');
assert.equal(scene.selected, selected, '实时预览保持选择状态');
scene.commitSceneEdit();
assert.equal(scene.undo.length, 1);
assert.equal(undoButton.disabled, false);

const rebuildsBeforeSlider = backgroundRebuilds;
for (const value of ['0.3', '0.45', '0.7']) { slider.value = value; assert.equal(scene.applySceneSettings(slider), true); }
assert.equal(backgroundRebuilds, rebuildsBeforeSlider, '拖动视差滑块只更新滚动系数，不重复解析图片与重建图元');
assert.equal(fields['[data-scene="parallax"]'].value, '0.7');
assert.equal(scene.undo.length, 1, '滑块连续 input 不得产生大量撤销记录');
scene.commitSceneEdit();
assert.equal(scene.undo.length, 2, '一次滑动只记录一次撤销');
const validScene = JSON.stringify(scene.map.scene);
for (const value of ['', 'bad', '-0.1', '1.1']) {
  fields['[data-scene="parallax"]'].value = value;
  assert.equal(scene.applySceneSettings(), false);
  assert.equal(JSON.stringify(scene.map.scene), validScene, '非法输入不影响上一次有效预览');
  assert.equal(status.invalid, true);
}
scene.renderSceneControls();
fields['[data-scene="background"]'].value = 'bg';
fields['[data-scene="mode"]'].value = 'repeat';
assert.equal(scene.applySceneSettings(), true);
assert.ok(markup.includes('scene-preview-image') && markup.includes('width="1080"'));
assert.ok(!markup.includes('scene-preview-hills'), '自定义背景替代主题远景，不叠加两套背景');
assert.equal(fields['[data-scene="mode"]'].disabled, false);
scene.commitSceneEdit();
fields['[data-scene="mode"]'].value = 'stretch';
scene.applySceneSettings(); scene.commitSceneEdit();
assert.ok(!markup.includes('scene-preview-image'), '拉伸模式即时生效');
assert.ok(markup.includes('width="1920" height="540" preserveAspectRatio="none"'));

// CSS 缩放下仍用世界坐标计算补偿；不改变任何碰撞/对象位置。
workspace.scrollLeft = 220;
scene.updateSceneParallax();
assert.ok(Math.abs(Number(layers[0].transform.match(/translate\(([^ ]+)/)[1]) - 400 * 0.3) < 1e-7);
assert.equal(JSON.stringify(scene.map.level), objectsBefore);
scene.action('undo');
assert.equal(scene.map.scene.backgroundMode, 'repeat');
assert.equal(fields['[data-scene="mode"]'].value, 'repeat');
scene.action('redo');
assert.equal(scene.map.scene.backgroundMode, 'stretch');
scene.action('scene');
assert.equal(JSON.parse(saved).scene.theme, 'snow');
assert.equal(mapModule.parseCustomMap(JSON.parse(saved)).scene.parallax, 0.7, '保存/导入/试玩沿用当前预览设置');
const beforePan = JSON.stringify(scene.map);
scene.action('scene-pan');
assert.ok(workspace.scrollLeft !== 220);
assert.equal(JSON.stringify(scene.map), beforePan, '视差演示只移动视口');

fields['[data-scene="background"]'].value = '';
scene.applySceneSettings(); scene.commitSceneEdit();
assert.equal(fields['[data-scene="mode"]'].disabled, true);
assert.ok(markup.includes('scene-preview-hills'));
const history = scene.undo.length;
fields['[data-scene="parallax"]'].value = '0.9'; scene.applySceneSettings();
fields['[data-scene="parallax"]'].value = '0.7'; scene.applySceneSettings(); scene.commitSceneEdit();
assert.equal(scene.undo.length, history, '改回原值不产生空撤销记录');
assetMeasurements = { sourceWidth: 1024, sourceHeight: 1024 };
fields['[data-scene="background"]'].value = 'bg';
fields['[data-scene="mode"]'].value = 'repeat';
scene.applySceneSettings(); scene.commitSceneEdit();
assert.ok(markup.includes('width="540" height="540" patternUnits="userSpaceOnUse"'), '背景平铺使用真实原图尺寸，不能使用过时的素材库标称尺寸');

const { GameScene } = load('src/scenes/GameScene.ts', (name) => {
  if (name === 'phaser') return { default: { Scene: class {} } };
  if (name.endsWith('/DefaultAssets')) return { mapAssets: library };
  if (name.endsWith('/ForestArt')) return { buildForest() {} };
  return {};
});
const game = Object.create(GameScene.prototype);
let tileScale;
const image = { setOrigin() { return this; }, setDepth() { return this; }, setScrollFactor() { return this; },
  setTileScale(value) { tileScale = value; return this; } };
Object.assign(game, { customMap: scene.map, level: scene.map.level,
  customTextures: new Map([['bg', 'bg-key']]),
  textures: { exists: () => true, get: () => ({ get: () => ({ cutHeight: 1024 }) }) },
  add: { tileSprite: () => image }, drawObjectSkin() {},
});
game.createBackground();
assert.equal(tileScale, 540 / 1024, '试玩平铺也应以真实原图高度适配');

// 试玩也消费同一图层数据，主题视差不再仅对自定义背景生效。
const { buildForest } = load('src/systems/ForestArt.ts', () => backdrop);
for (const theme of Object.keys(SCENE_PALETTES)) {
  const graphics = [];
  const chain = () => {
    const obj = {};
    for (const method of ['setOrigin', 'setDisplaySize', 'setDepth', 'fillStyle', 'fillCircle', 'fillEllipse', 'fillRoundedRect', 'lineStyle', 'lineBetween', 'strokeRoundedRect']) obj[method] = () => obj;
    obj.setScrollFactor = (value) => { obj.scrollFactor = value; return obj; };
    return obj;
  };
  const mock = { textures: { exists: () => true }, add: { image: chain, text: chain,
    graphics: () => { const obj = chain(); graphics.push(obj); return obj; } } };
  buildForest(mock, { id: 'custom', width: 1920, platforms: [] }, '预览', theme, false, 0.7);
  const actualFactors = graphics.filter((g) => g.scrollFactor !== undefined).map((g) => g.scrollFactor);
  assert.equal(JSON.stringify(actualFactors), JSON.stringify(backdropLayers(theme, 0.7).map((l) => l.parallax)));
}
if (process.argv.includes('--preview')) process.stdout.write(JSON.stringify(Object.keys(SCENE_PALETTES).map((theme) =>
  ({ theme, ...SCENE_PALETTES[theme], layers: backdropLayers(theme) }))));
