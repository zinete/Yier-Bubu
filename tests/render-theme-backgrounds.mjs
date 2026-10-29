import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, imports = () => ({})) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: imports });
  return module.exports;
}
const scenery = load('src/systems/SceneryGenerator.ts');
const background = load('src/systems/ThemeBackground.ts', (name) => {
  if (name === 'phaser') return { default: { Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
  if (name.endsWith('/SceneryGenerator')) return scenery;
  if (name.endsWith('.svg')) {
    const source = readFileSync(path.resolve('src/systems', name));
    return { default: `data:image/svg+xml;base64,${source.toString('base64')}` };
  }
  return {};
});
const labels = { forest: '绘本森林', snow: '雪地', desert: '沙漠', night: '星空夜晚' };
let markup = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="660"><rect width="1000" height="660" fill="#f7f7ef"/>';
for (const [index, theme] of Object.keys(labels).entries()) {
  const x = 15 + index % 2 * 495, y = 15 + Math.floor(index / 2) * 325;
  markup += `<text x="${x}" y="${y + 20}" font-family="Microsoft YaHei" font-size="18" fill="#294d43">${labels[theme]}</text>`
    + `<svg x="${x}" y="${y + 32}" width="480" height="270" viewBox="0 0 960 540">`
    + background.themeBackgroundSvg(theme, .2, 1920, 20261028) + '</svg>';
}
markup += '</svg>';
writeFileSync('docs/scene-themes-preview.svg', markup);
