import assert from 'node:assert/strict';
import { log } from 'node:console';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, require = () => ({})) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require }); return module.exports;
}
const geometry = load('src/systems/ObjectGeometry.ts');
const maps = load('src/systems/CustomMap.ts');
const selection = load('src/systems/EditorSelection.ts', () => geometry);
const plain = (value) => JSON.parse(JSON.stringify(value));
const ref = (kind, index = 0) => ({ kind, index });
const map = maps.newMap();
map.level.width = 960;
map.level.platforms = [{ id: 'ground', kind: 'ground', x: 0, y: 448, width: 960, height: 80 },
  { id: 'jump', kind: 'platform', x: 128, y: 192, width: 160, height: 32 }];
map.level.coins = [[176, 144], { x: 320, y: 144, assetId: 'builtin-gold-star' }];
map.level.enemies = [{ x: 352, y: 224, min: 304, max: 432, speed: 75, attack: 'shoot' }];
map.decorations = [{ x: 448, y: 160, width: 64, height: 64, assetId: 'builtin-flower-bush', solid: false }];
const source = JSON.stringify(map);
assert.deepEqual(plain(selection.boxSelections(map, { x: 112, y: 112, width: 192, height: 128 })), [ref('platform', 1), ref('coin')]);
assert.equal(selection.boxSelections(map, { x: 0, y: 440, width: 32, height: 32 }).length, 0, '小框擦过地面不选中整段地面');
assert.equal(selection.allSelections(map).length, 9, '玩法对象包含三个唯一标记，不包含场景图层');
assert.equal(selection.selectionObject(map, ref('spawn', 1)), undefined);
assert.equal(selection.copyableSelection(ref('spawn')), false);

const refs = [ref('platform', 1), ref('coin'), ref('enemy'), ref('decoration')];
const items = selection.selectionItems(map, refs);
assert.deepEqual(plain(items[1].value), { x: 176, y: 144 }, '旧数组星星转为坐标记录');
const moved = selection.translatedSelection(items, 10000, 10000, 960);
const delta = Number(moved[0].value.x) - Number(items[0].value.x);
assert.equal(delta % 16, 0);
for (let i = 0; i < moved.length; i++) {
  assert.equal(moved[i].value.x - items[i].value.x, delta, '碰边时共用位移，不压缩布局');
  const box = geometry.objectBounds(moved[i].ref.kind, moved[i].value);
  for (const edge of [box.x, box.y, box.x + box.width, box.y + box.height]) assert.equal(edge % 16, 0);
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 960 && box.y + box.height <= 540);
}
assert.equal(moved[2].value.min, 304 + delta);
assert.equal(moved[2].value.max, 432 + delta);
assert.equal(moved[2].value.attack, 'shoot');
assert.equal(JSON.stringify(map), source, '计算移动不能改变原地图或快照');
const candidate = globalThis.structuredClone(map); selection.writeSelection(candidate, moved);
assert.equal(Array.isArray(candidate.level.coins[0]), false);
assert.equal(candidate.level.enemies[0].x, moved[2].value.x);
assert.equal(JSON.stringify(map), source);

const edge = selection.translatedSelection([
  { ref: ref('coin'), value: { x: 16, y: 16 } },
  { ref: ref('coin', 1), value: { x: 80, y: 48 } },
], -1000, -1000, 960);
assert.equal(edge[0].value.x, 16); assert.equal(edge[1].value.x, 80);
const old = selection.translatedSelection([{ ref: ref('platform'), value: { x: 13, y: 71, width: 149, height: 29 } }], 9, -9, 960);
assert.deepEqual(plain(old[0].value), { x: 32, y: 48, width: 144, height: 32 }, '旧非网格对象首次规范到网格');
assert.throws(() => selection.translatedSelection([
  { ref: ref('coin'), value: { x: 16, y: 16 } }, { ref: ref('coin', 1), value: { x: 1200, y: 16 } },
], 0, 0, 960), /整个选区/);
log('Editor selection tests passed');
