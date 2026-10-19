import assert from 'node:assert/strict';
import { log } from 'node:console';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// 使用现有 TypeScript 编译器执行纯逻辑模块，无需引入浏览器或 Phaser。
function session(storage) {
  const cache = new Map();
  function load(path) {
    if (!existsSync(path)) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts');
    if (statSync(path).isDirectory()) path = resolve(path, 'index.ts');
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, localStorage: storage,
      require: (id) => load(resolve(dirname(path), id)),
    }, { filename: path });
    return module.exports;
  }
  return load(resolve('src/systems/ProgressStore.ts'));
}
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
let store = session(storage);
assert.equal(store.loadProgress().currentLevel, '1-1');
assert.equal(store.beginLevel('1-2'), '1-1', '未解锁关卡不能直接进入');
store.completeLevel('1-1', 1200, true);
assert.equal(store.loadProgress().currentLevel, '1-2');
assert.equal(store.beginLevel('1-2'), '1-2');
store = session(storage);
assert.equal(store.loadProgress().currentLevel, '1-2', '刷新后保留进度');
store.completeLevel('1-1', 100, false);
assert.equal(store.loadProgress().records['1-1'].bestScore, 1200);
assert.equal(store.loadProgress().records['1-1'].allCollected, true);
store.completeLevel('1-2', 2000, false);
assert.equal(store.loadProgress().currentLevel, '1-2', '最后一关没有虚构下一关');
values.set('yierBubuProgress', '{broken');
store = session(storage);
assert.equal(store.loadProgress().currentLevel, '1-1');
store = session({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
store.completeLevel('1-1', 500, false);
assert.equal(store.beginLevel('1-2'), '1-2', '存储禁用时仍有内存进度');

// Readable stale storage must not roll back progress after a failed write.
values.clear();
let failWrite = false;
store = session({ ...storage, setItem(key, value) {
  if (failWrite) throw new Error('quota');
  storage.setItem(key, value);
} });
store.beginLevel('1-1');
const notifications = [];
const unsubscribe = store.subscribeProgressStorage((status) => notifications.push(status));
failWrite = true;
store.completeLevel('1-1', 900, true);
assert.equal(store.getProgressStorageStatus().pending, true);
assert.equal(store.loadProgress().currentLevel, '1-2');
assert.equal(store.beginLevel('1-2'), '1-2');
assert.equal(store.loadProgress().records['1-1'].bestScore, 900);
const exposed = store.loadProgress();
exposed.unlocked.length = 0;
exposed.records['1-1'].bestScore = 0;
assert.equal(store.loadProgress().records['1-1'].bestScore, 900, '调用者不能修改内部存档');
store.completeLevel('not-a-level', 1, false);
store.completeLevel('1-1', NaN, false);
assert.equal(Object.keys(store.loadProgress().records).length, 1);
assert.equal(store.retryProgressStorage(), false);
// Explicit recovery merges another tab's higher score rather than overwriting it.
storage.setItem('yierBubuProgress', JSON.stringify({
  version: 1, currentLevel: '1-1', unlocked: ['1-1', '1-2'], started: true,
  records: { '1-1': { bestScore: 1500, allCollected: false }, '1-2': { bestScore: 1000, allCollected: true } },
}));
failWrite = false;
assert.equal(store.retryProgressStorage(), true);
assert.equal(store.getProgressStorageStatus().mode, 'persistent');
store = session(storage);
assert.equal(store.loadProgress().records['1-1'].bestScore, 1500);
assert.equal(store.loadProgress().records['1-1'].allCollected, true);
assert.equal(store.loadProgress().records['1-2'].bestScore, 1000);
unsubscribe();
assert.equal(notifications.length, 3, '仅在状态变化时通知订阅者');
let blocked = true;
store = session({ ...storage, getItem(key) { if (blocked) throw new Error('blocked'); return storage.getItem(key); } });
store.loadProgress();
assert.equal(store.getProgressStorageStatus().reason, 'read-failed');
blocked = false;
assert.equal(store.retryProgressStorage(), true);
assert.equal(store.loadProgress().currentLevel, '1-2');
values.set('yierBubuProgress', '{broken');
assert.equal(store.loadProgress().currentLevel, '1-2', '损坏数据不清空已读出的好存档');
assert.equal(store.getProgressStorageStatus().reason, 'invalid-data');
log('progress: persistence, write failure, stale reads and recovery passed');
