import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export function runtime(globals = {}, mocks = {}) {
  const cache = new Map();
  function load(file) {
    let path = resolve(file);
    if (!existsSync(path)) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts');
    if (statSync(path).isDirectory()) path = resolve(path, 'index.ts');
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      ...globals, module, exports: module.exports,
      require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : load(resolve(dirname(path), id)),
    }, { filename: path });
    return module.exports;
  }
  return load;
}

// Phaser-style event context and once/off semantics, without DOM/WebGL.
export class Events {
  entries = [];
  on(event, fn, context) { this.entries.push({ event, fn, context }); return this; }
  once(event, fn, context) { this.entries.push({ event, fn, context, once: true }); return this; }
  off(event, fn, context) {
    this.entries = this.entries.filter((e) => !(e.event === event && (!fn || e.fn === fn) && (context === undefined || e.context === context)));
    return this;
  }
  emit(event, ...args) {
    for (const entry of [...this.entries].filter((e) => e.event === event)) {
      if (entry.once) this.entries = this.entries.filter((e) => e !== entry);
      entry.fn.apply(entry.context, args);
    }
    return this;
  }
}
