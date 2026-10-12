import assert from 'node:assert/strict';
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
