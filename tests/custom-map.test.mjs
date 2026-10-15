import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/systems/CustomMap.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { newMap, parseCustomMap, playablePlatforms, validateMapWidth } = module.exports;
assert.equal(parseCustomMap(newMap()).level.id, 'custom');
for (const width of [960, 9601, 10000, 50000, 1000000]) {
  const wide = newMap();
  wide.level.width = width;
  wide.level.platforms[0].width = width;
  wide.level.checkpoint.x = width / 2;
  wide.level.flag.x = width - 140;
  wide.level.coins = [{ x: width - 256, y: 390 }];
  const saved = parseCustomMap(wide, false);
  const playable = parseCustomMap(JSON.parse(JSON.stringify(saved)));
  assert.equal(playable.level.width, width, '编辑、保存、导入、试玩共用无固定上限的宽度规则');
  assert.equal(playable.level.flag.x, width - 140, '超出旧边界的对象坐标不能被截断');
  assert.equal(playable.level.platforms[0].width, width, '平台宽度仍以实际地图边界校验');
}
for (const width of [0, -1, 959, NaN, Infinity, -Infinity, '1920', null]) {
  assert.throws(() => validateMapWidth(width), '无上限不等于接受非有限或低于最小值的宽度');
}
const map = newMap();
map.level.id = '1-1';
map.level.coins = [[320, 380]];
map.extraScript = 'arbitrary code';
const parsed = parseCustomMap(JSON.parse(JSON.stringify(map)));
assert.equal(Object.keys(parsed.platformMaterials).length, 0, '旧地图保持兼容，默认材质由运行时提供');
const materialMap = newMap();
materialMap.platformMaterials = { 'builtin-moss-platform': { mode: 'repeat', surfaceY: 0.395, leftCap: 0.12, rightCap: 0.12 } };
const materialRoundTrip = parseCustomMap(JSON.parse(JSON.stringify(materialMap)));
assert.equal(materialRoundTrip.platformMaterials['builtin-moss-platform'].surfaceY, 0.395);
assert.equal(JSON.stringify(parseCustomMap(materialRoundTrip)), JSON.stringify(materialRoundTrip), '材质导入导出稳定');
for (const change of [
  (m) => { m.platformMaterials.missing = m.platformMaterials['builtin-moss-platform']; },
  (m) => { m.platformMaterials['builtin-moss-platform'].mode = 'script'; },
  (m) => { m.platformMaterials['builtin-moss-platform'].surfaceY = NaN; },
  (m) => { m.platformMaterials['builtin-moss-platform'].surfaceY = 1; },
  (m) => { m.platformMaterials['builtin-moss-platform'].leftCap = -1; },
  (m) => { m.platformMaterials['builtin-moss-platform'].rightCap = 0.9; },
]) {
  const bad = JSON.parse(JSON.stringify(materialMap)); change(bad);
  assert.throws(() => parseCustomMap(bad), '非法材质配置必须被拒绝');
}
assert.equal(parsed.level.id, 'custom', '自定义地图不能冒充官方关卡');
assert.equal(parsed.level.coins[0].x, 320);
assert.equal(parsed.extraScript, undefined, '只保留白名单字段');
for (const mutate of [
  (m) => { m.version = 99; },
  (m) => { m.level.width = Infinity; },
  (m) => { m.level.platforms[0].width = 10000; },
  (m) => { m.level.spawn.x = 0; },
  (m) => { m.level.flag.y = 0; m.level.flag.height = 20; },
  (m) => { m.level.coins = Array(301).fill({ x: 10, y: 20 }); },
  (m) => { m.level.enemies = [{ x: 100, y: 400, min: 200, max: 300, speed: 70 }]; },
]) {
  const invalid = newMap(); mutate(invalid);
  assert.throws(() => parseCustomMap(invalid));
}
const incomplete = newMap(); incomplete.level.platforms = [];
assert.doesNotThrow(() => parseCustomMap(incomplete, false), '未完成草稿可保存');
assert.throws(() => parseCustomMap(incomplete), '未完成地图不可试玩');
const decorated = newMap();
decorated.assets = [{ id: 'asset-1', name: '花朵.png', data: 'data:image/png;base64,iVBORw0KGgo=', width: 32, height: 32 }];
decorated.decorations = [{ assetId: 'asset-1', x: 100, y: 100, width: 32, height: 32 }];
const roundTrip = parseCustomMap(JSON.parse(JSON.stringify(decorated)));
assert.equal(roundTrip.assets[0].data, decorated.assets[0].data);
assert.equal(roundTrip.decorations[0].assetId, 'asset-1');
decorated.decorations[0].assetId = 'missing';
assert.throws(() => parseCustomMap(decorated), '素材引用必须存在');
decorated.decorations[0].assetId = 'asset-1';
decorated.assets[0].data = 'https://example.com/image.png';
assert.throws(() => parseCustomMap(decorated), '不接受外链或可执行图片');
const sceneMap = newMap();
sceneMap.scene = { theme: 'night', backgroundMode: 'repeat', parallax: 0.4 };
assert.equal(parseCustomMap(sceneMap).scene.theme, 'night');
assert.equal(parseCustomMap(newMap()).scene.theme, 'forest', '旧地图默认森林');
sceneMap.scene.parallax = 2;
assert.throws(() => parseCustomMap(sceneMap), '视差系数校验');
sceneMap.scene.parallax = 0.4;
sceneMap.scene.backgroundAssetId = 'missing';
assert.throws(() => parseCustomMap(sceneMap), '背景素材引用校验');
const skinned = newMap();
skinned.level.platforms[0].assetId = 'builtin-moss-platform';
skinned.level.coins = [{ x: 300, y: 390, assetId: 'builtin-gold-star' }];
skinned.level.enemies = [{ x: 500, y: 400, min: 450, max: 550, speed: 70, assetId: 'builtin-leaf-slime' }];
skinned.level.spawn.assetId = 'builtin-lantern-marker';
skinned.level.flag.assetId = 'builtin-lantern-marker';
const skins = parseCustomMap(JSON.parse(JSON.stringify(skinned)));
assert.equal(skins.level.platforms[0].assetId, 'builtin-moss-platform');
assert.equal(skins.level.coins[0].assetId, 'builtin-gold-star');
assert.equal(skins.level.enemies[0].assetId, 'builtin-leaf-slime');
assert.equal(skins.level.spawn.assetId, 'builtin-lantern-marker');
assert.equal(skins.level.flag.assetId, 'builtin-lantern-marker');
skinned.level.enemies[0].assetId = 'nonexistent';
assert.throws(() => parseCustomMap(skinned), '对象外观必须引用有效素材');
const oldPlatformDecorations = newMap();
oldPlatformDecorations.decorations = [
  { assetId: 'builtin-moss-platform', x: 200, y: 350, width: 160, height: 32 },
  { assetId: 'builtin-moss-platform', x: 450, y: 350, width: 160, height: 32, solid: false },
  { assetId: 'builtin-flower-bush', x: 650, y: 350, width: 128, height: 80 },
];
const migrated = parseCustomMap(oldPlatformDecorations);
assert.equal(migrated.decorations[0].solid, true, '旧版默认平台图片升级为可站立平台');
assert.equal(migrated.decorations[1].solid, false, '明确指定装饰的图片不升级');
assert.equal(migrated.decorations[2].solid, false, '花丛仍为装饰');
assert.equal(playablePlatforms(migrated).length, migrated.level.platforms.length + 1);
assert.equal(playablePlatforms(parseCustomMap(JSON.parse(JSON.stringify(migrated)))).length,
  playablePlatforms(migrated).length, '重复保存解析不会叠加平台');
const imageGround = newMap(); imageGround.level.platforms = [];
imageGround.decorations = [{ assetId: 'builtin-moss-platform', x: 0, y: 444, width: 1920, height: 96, solid: true }];
assert.doesNotThrow(() => parseCustomMap(imageGround), '图片平台能承接出生点、检查点和终点');
