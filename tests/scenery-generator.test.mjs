import assert from 'node:assert/strict';
import { runtime } from './helpers/runtime.mjs';

const load = runtime();
const scenery = load('src/systems/SceneryGenerator.ts');
const backdrop = load('src/systems/SceneBackdrop.ts');
const sceneLayers = load('src/systems/SceneLayers.ts');

const first = scenery.sceneryChunks(123456);
const signature = JSON.stringify(first);
assert.equal(first.length, scenery.SCENERY_CYCLE_CHUNKS);
assert.equal(scenery.SCENERY_REPEAT_WIDTH, scenery.SCENERY_CHUNK_WIDTH * first.length);
assert.equal(JSON.stringify(scenery.sceneryChunks(123456)), signature, '相同种子必须生成相同场景块');
scenery.sceneryChunks(999999);
assert.equal(JSON.stringify(scenery.sceneryChunks(123456)), signature, '结果不能依赖其他地图的调用顺序');
assert.notEqual(JSON.stringify(scenery.sceneryChunks(654321)), signature, '不同地图种子应产生不同组合');
assert.ok(new Set(first.flatMap((chunk) => [...chunk.farTrees, ...chunk.trees, ...chunk.grove]).map((tree) => tree.variant)).size >= 3,
  '一个周期内至少出现三种树冠结构');
assert.ok(new Set(first.flatMap((chunk) => chunk.trees).map((tree) => Math.round(tree.height))).size >= 8,
  '树木高度不能退化成同一模板');

const settings = { ...backdrop.DEFAULT_SCENE, scenerySeed: 123456 };
const svg = backdrop.sceneBackdropSvg(settings, 1920, undefined, undefined, 'ignored-title');
assert.equal(backdrop.sceneBackdropSvg(settings, 1920, undefined, undefined, 'another-title'), svg,
  '持久化种子后，重命名地图不能改变景观');
assert.notEqual(backdrop.sceneBackdropSvg({ ...settings, scenerySeed: 654321 }, 1920), svg,
  '换一组景观必须实际改变预览');
assert.ok(svg.includes('scene-preview-trees-far') && svg.includes('scene-preview-grove'), '远景、中景和近景应独立分层');
assert.ok(backdrop.backdropLayers('forest', 0.2, settings.scenerySeed)
  .every((layer) => layer.depth < sceneLayers.layerDepth({ group: 'background' }, 0)),
  '主题底图必须始终位于用户添加的背景图层后方');
const longSvg = backdrop.sceneBackdropSvg(settings, 1000000);
assert.ok(Math.abs(longSvg.length - svg.length) < 120, '百万像素地图仍只保存一个固定长度的场景周期');

const mapModule = load('src/systems/CustomMap.ts');
const map = mapModule.newMap();
map.scene = { ...backdrop.DEFAULT_SCENE, scenerySeed: 0xffffffff, sceneryVersion: scenery.SCENERY_VERSION };
assert.equal(mapModule.parseCustomMap(JSON.parse(JSON.stringify(map))).scene.scenerySeed, 0xffffffff,
  '景观种子导入导出应保持不变');
assert.equal(mapModule.parseCustomMap(JSON.parse(JSON.stringify(map))).scene.sceneryVersion, 1,
  '景观生成版本应随地图持久化');
for (const invalid of [-1, 0x100000000, 1.5, '123']) {
  const candidate = mapModule.newMap();
  candidate.scene = { ...backdrop.DEFAULT_SCENE, scenerySeed: invalid };
  assert.throws(() => mapModule.parseCustomMap(candidate), `非法景观种子 ${invalid} 应被拒绝`);
}
const future = mapModule.newMap();
future.scene = { ...backdrop.DEFAULT_SCENE, scenerySeed: 1, sceneryVersion: 2 };
assert.throws(() => mapModule.parseCustomMap(future), '未知景观生成版本应被拒绝，避免静默改变已发布地图');
