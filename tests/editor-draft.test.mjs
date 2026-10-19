import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, require = () => ({}), globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require, ...globals }); return module.exports;
}
const maps = load('src/systems/CustomMap.ts');
const { EditorDraftStore, RECOVERY_KEY } = load('src/systems/EditorDraftStore.ts', () => maps);
class Storage {
  data = new Map(); failWrite = false; failRemove = false;
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite) throw new Error('QuotaExceededError'); this.data.set(key, value); }
  removeItem(key) { if (this.failRemove) throw new Error('SecurityError'); this.data.delete(key); }
}
const storage = new Storage();
const store = new EditorDraftStore(() => storage, () => 1000);
assert.equal(store.load().map, undefined);
const map = maps.newMap();
let saved = store.save(map, null); assert.equal(saved.ok, true);
assert.equal(JSON.parse(storage.getItem(maps.DRAFT_KEY)).kind, 'editor-draft');
const original = storage.getItem(maps.DRAFT_KEY);
const edit = globalThis.structuredClone(map); edit.title = '自动恢复的森林';
assert.equal(store.backup(edit, saved.revision).ok, true);
assert.equal(storage.getItem(maps.DRAFT_KEY), original, '自动备份不能覆盖手动保存');
const refresh = new EditorDraftStore(() => storage).load();
assert.equal(refresh.restored, true); assert.equal(refresh.map.title, edit.title); assert.equal(refresh.savedMap.title, map.title);
storage.failWrite = true;
assert.equal(store.save(edit, saved.revision).ok, false);
assert.equal(storage.getItem(maps.DRAFT_KEY), original, '保存失败保留旧记录');
assert.equal(store.backup(edit, saved.revision).ok, false);
storage.failWrite = false;
const staleBackup = storage.getItem(RECOVERY_KEY);
storage.failRemove = true;
const same = store.save(map, saved.revision); assert.equal(same.ok, true, '旧备份清理失败不能否定成功写入的主草稿');
assert.notEqual(same.revision, saved.revision, '同一毫秒保存同一地图也应产生新修订，旧备份不能复活');
assert.equal(storage.getItem(RECOVERY_KEY), staleBackup);
const staleLoad = new EditorDraftStore(() => storage).load();
assert.equal(staleLoad.restored, false); assert.equal(staleLoad.map.title, map.title);
storage.failRemove = false;
saved = store.save(edit, same.revision); assert.equal(saved.ok, true);
assert.equal(storage.getItem(RECOVERY_KEY), null);
const roundTrip = new EditorDraftStore(() => storage).load();
assert.equal(roundTrip.map.title, edit.title); assert.equal(roundTrip.restored, false);

// 多个标签页共享主版本，也不能互相覆盖尚未提交的自动备份。
const tabA = new EditorDraftStore(() => storage), tabB = new EditorDraftStore(() => storage);
const baseA = tabA.load(), baseB = tabB.load();
const workA = { ...edit, title: 'A 页面' }, workB = { ...edit, title: 'B 页面' };
assert.equal(tabA.backup(workA, baseA.revision).ok, true);
const aBackup = storage.getItem(RECOVERY_KEY);
assert.equal(tabB.backup(workB, baseB.revision).ok, false);
assert.equal(tabB.save(workB, baseB.revision).ok, false);
assert.equal(tabB.clearRecovery(baseB.revision).ok, false);
assert.equal(storage.getItem(RECOVERY_KEY), aBackup);
assert.equal(tabA.clearRecovery(baseA.revision).ok, true);
assert.equal(storage.getItem(RECOVERY_KEY), null, '撤销回保存状态时移除旧备份');
const changed = tabA.save(workA, baseA.revision); assert.equal(changed.ok, true);
assert.equal(tabB.save(workB, baseB.revision).ok, false);

const legacy = new Storage(); legacy.setItem(maps.DRAFT_KEY, JSON.stringify(map));
const legacyStore = new EditorDraftStore(() => legacy), legacyLoad = legacyStore.load();
assert.equal(legacyLoad.map.title, map.title); assert.equal(legacyStore.save(edit, legacyLoad.revision).ok, true);
const corrupt = new Storage(); corrupt.setItem(maps.DRAFT_KEY, '{ broken'); corrupt.setItem(RECOVERY_KEY, 'bad');
const corruptStore = new EditorDraftStore(() => corrupt), corruptLoad = corruptStore.load();
assert.equal(corruptLoad.map, undefined); assert.equal(corruptLoad.warnings.length, 2);
assert.equal(corrupt.getItem(maps.DRAFT_KEY), '{ broken', '加载损坏数据不能自动清空原记录');
assert.equal(corruptStore.save(map, corruptLoad.revision).ok, true, '用户明确保存可以修复损坏草稿');
const disabled = new EditorDraftStore(() => { throw new Error('SecurityError'); });
assert.ok(disabled.load().warnings.length); assert.equal(disabled.save(map, null).ok, false); assert.equal(disabled.backup(map, null).ok, false);
const beforeInvalid = storage.getItem(maps.DRAFT_KEY);
assert.equal(tabA.save({ ...map, title: '' }, changed.revision).ok, false);
assert.equal(storage.getItem(maps.DRAFT_KEY), beforeInvalid);
