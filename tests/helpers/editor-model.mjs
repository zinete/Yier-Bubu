import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, structuredClone: globalThis.structuredClone });
  return module.exports;
}
export const editorDocument = load('src/systems/EditorDocument.ts');
export const editorHistory = load('src/systems/EditorHistory.ts');
