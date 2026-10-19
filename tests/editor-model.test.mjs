import assert from 'node:assert/strict';
import { log } from 'node:console';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { editorDocument, editorHistory } from './helpers/editor-model.mjs';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/systems/CustomMap.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const maps = module.exports;
const { EditorDocument } = editorDocument;
const { createEditorCommand, applyEditorCommand, trimEditorHistory, HISTORY_LIMIT, HISTORY_BYTES } = editorHistory;
const plain = (value) => JSON.parse(JSON.stringify(value));
const clone = globalThis.structuredClone;
const objects = (map) => [...map.level.platforms, ...map.level.coins, ...map.level.enemies, ...(map.decorations ?? []),
  map.level.spawn, map.level.checkpoint, map.level.flag];

// 旧 v1 无编号地图：数组星星、任意旧平台运行时 id、外观与图层兼容。
const legacy = maps.newMap(); objects(legacy).forEach((p) => delete p.objectId);
legacy.level.platforms[0].id = '旧平台名';
legacy.level.coins = [[320, 380], { x: 480, y: 380 }];
legacy.level.enemies = [{ x: 600, y: 432, min: 560, max: 640, speed: 70 }];
legacy.decorations = [{ assetId: 'builtin-flower-bush', x: 720, y: 360, width: 96, height: 64 }];
const oldRaw = JSON.stringify(legacy), migrated = maps.parseCustomMap(legacy, false);
assert.equal(JSON.stringify(legacy), oldRaw, '迁移不能修改传入的旧文件对象');
assert.equal(new Set(objects(migrated).map((p) => p.objectId)).size, objects(migrated).length);
assert.ok(objects(migrated).every((p) => /^[a-zA-Z0-9_-]{1,64}$/.test(p.objectId)));
assert.equal(JSON.stringify(maps.parseCustomMap(migrated, false)), JSON.stringify(migrated), '迁移幂等');
assert.equal(JSON.stringify(maps.parseCustomMap(legacy, false)), JSON.stringify(migrated), '旧文件重复迁移结果确定');
const ids = migrated.level.coins.map((p) => p.objectId);
migrated.level.coins.reverse(); migrated.level.coins[0].x += 16;
assert.deepEqual(plain(maps.parseCustomMap(migrated, false).level.coins.map((p) => p.objectId)), [...ids].reverse());
migrated.level.coins.splice(0, 1);
assert.equal(maps.parseCustomMap(migrated, false).level.coins[0].objectId, ids[0], '删除前序对象不重编号');
for (const id of ['', 'a'.repeat(65), '<img onerror=1>', 9, null]) {
  const bad = maps.newMap(); bad.level.spawn.objectId = id;
  assert.throws(() => maps.parseCustomMap(bad, false), /编号/);
}
const duplicate = maps.newMap(); duplicate.level.spawn.objectId = duplicate.level.coins[0].objectId;
assert.throws(() => maps.parseCustomMap(duplicate, false), /重复/, '跨类型编号也不允许重复');
const collision = clone(legacy); collision.level.coins[1].objectId = 'obj-coin-0';
assert.notEqual(maps.parseCustomMap(collision, false).level.coins[0].objectId, 'obj-coin-0', '补齐时避开已有编号');

const document = new EditorDocument(), map = maps.newMap();
map.assets = Array.from({ length: 20 }, (_, index) => ({ id: `upload-${index}`, name: `图片${index}`, width: 512, height: 512,
  data: 'data:image/png;base64,' + 'A'.repeat(98999) + 'ABCDEFGHIJKLMNOPQRST'[index] }));
assert.doesNotThrow(() => maps.parseCustomMap(map, false));
const full = JSON.stringify(map), initial = document.capture(map), undo = [], snapshots = [initial];
assert.ok(initial.length < 5000); assert.equal(initial.includes('data:image/png'), false);
assert.equal(JSON.stringify(document.restore(initial)), full, '池化不能改变导出图片载荷、顺序与对象');
const cloned = document.clone(map); assert.equal(JSON.stringify(cloned), full);
cloned.level.coins[0].x += 16; cloned.assets[0].name = '改名';
assert.notEqual(cloned.level.coins[0].x, map.level.coins[0].x); assert.notEqual(cloned.assets[0].name, map.assets[0].name);
assert.equal(cloned.assets[0].data, map.assets[0].data, '图片字符串共享，模型与素材元信息独立');
for (let i = 1; i <= 60; i++) {
  const before = document.capture(map); map.title = `历史${i}`;
  const after = document.capture(map), command = createEditorCommand(before, after);
  assert.equal(command.patches.length, 1); assert.equal(JSON.stringify(command.patches[0].path), '["title"]');
  undo.push(command); trimEditorHistory(undo); snapshots.push(after);
}
assert.equal(undo.length, HISTORY_LIMIT, '含上传图片也保留 50 步，而非旧 10 步');
assert.equal(JSON.stringify(undo).includes('data:image/png'), false, '历史中没有图片副本');
const commandBytes = undo.reduce((sum, command) => sum + command.bytes, 0);
assert.ok(commandBytes < 20000);
assert.equal(document.stats().images, 20);
let current = document.capture(map);
for (const command of [...undo].reverse()) current = applyEditorCommand(current, command, true);
assert.equal(current, snapshots[10], '裁剪后 50 次撤销回到正确基线');
for (const command of undo) current = applyEditorCommand(current, command, false);
assert.equal(current, snapshots[60]); assert.equal(document.restore(current).assets[19].data, map.assets[19].data);
assert.equal(createEditorCommand(current, current), undefined, '无变化不创建命令');

// 键增删、数组插入/删除/重排和批量字段修改均保序、可逆。
for (const transform of [
  (m) => { m.level.coins.push({ objectId: 'new-coin', x: 600, y: 320 }); },
  (m) => { m.level.coins.splice(0, 1); },
  (m) => { delete m.assets; },
  (m) => { m.scene = { theme: 'snow', parallax: 0.2, backgroundMode: 'repeat' }; },
  (m) => { m.level.spawn.x += 16; m.level.checkpoint.y -= 16; m.level.flag.width = 48; },
  (m) => { m.assets.reverse(); },
]) {
  const next = document.clone(map), before = document.capture(next); transform(next);
  const after = document.capture(next), command = createEditorCommand(before, after);
  assert.equal(applyEditorCommand(before, command, false), after);
  assert.equal(applyEditorCommand(after, command, true), before);
  assert.equal(JSON.stringify(document.restore(applyEditorCommand(after, command, true))), JSON.stringify(map));
}
const next = document.clone(map), before = document.capture(next);
next.level.spawn.x += 16; next.level.checkpoint.x += 16;
const after = document.capture(next), command = createEditorCommand(before, after);
const bad = JSON.parse(after); bad.level.checkpoint.x += 1;
assert.throws(() => applyEditorCommand(JSON.stringify(bad), command, true), /不匹配/);
const oversized = Array.from({ length: 5 }, () => ({ patches: [], bytes: HISTORY_BYTES / 2 })); trimEditorHistory(oversized);
assert.equal(oversized.length, 2, '差量字节预算裁掉旧历史');

// 同一图片内容只存一次；同素材 ID 更换内容时保留旧载荷，供撤销使用。
const pool = new EditorDocument(), imageMap = maps.newMap();
const asset = { id: 'image', name: '图', width: 16, height: 16, data: 'data:image/png;base64,AAAA' };
imageMap.assets = [asset, { ...asset, id: 'second' }];
const firstImage = pool.capture(imageMap); assert.equal(pool.stats().images, 1);
imageMap.assets[0] = { ...asset, data: 'data:image/png;base64,BBBB' };
const secondImage = pool.capture(imageMap), changeImage = createEditorCommand(firstImage, secondImage);
assert.ok(changeImage.patches.some((p) => p.path.at(-1) === 'data'));
pool.collect([secondImage, JSON.stringify(changeImage)]); assert.equal(pool.stats().images, 2);
assert.equal(pool.restore(applyEditorCommand(secondImage, changeImage, true)).assets[0].data, asset.data);
const empty = pool.capture(maps.newMap()); pool.collect([empty, firstImage]); assert.equal(pool.stats().images, 1);
pool.collect([empty]); assert.equal(pool.stats().images, 0, '新分支/历史截断后可以回收无引用图片');
assert.throws(() => pool.restore(firstImage), /缺少图片/);
log(`Editor model tests passed: 50 commands ${commandBytes} bytes; shared image payload ${document.stats().payloadChars} chars (serialized-data estimate, not heap measurement)`);
