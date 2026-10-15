import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/systems/AssetGeometry.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { analyzeAssetPixels, assetLayout } = module.exports;
const width = 20, height = 20;
const pixels = new Uint8ClampedArray(width * height * 4);
const solid = (x, y, alpha = 255) => { pixels[(y * width + x) * 4 + 3] = alpha; };
// 图片上方 8px 留白，花叶延伸到第 3 行；主体草地从第 8 行开始。
for (let y = 8; y <= 18; y += 1) for (let x = 2; x <= 17; x += 1) solid(x, y);
solid(9, 3); solid(0, 0, 10);
const bounds = analyzeAssetPixels(pixels, width, height);
assert.equal(bounds.x, 2); assert.equal(bounds.y, 3);
assert.equal(bounds.surfaceY, 8, '独立花叶不能抬高整个平台表面');
for (const platformHeight of [24, 32, 96]) {
  const layout = assetLayout(bounds, 150, 444, 600, platformHeight, true);
  const surfaceInWorld = layout.y + (bounds.surfaceY - bounds.y) / bounds.height * layout.height;
  assert.ok(Math.abs(surfaceInWorld - 444) < 1e-9, '草地表面必须与物理顶部相等');
  assert.ok(Math.abs(layout.y + layout.height - (444 + platformHeight)) < 1e-9, '底部与平台高度一致');
}
assert.equal(assetLayout(bounds, 1, 2, 40, 34).y, 2, '非平台对象只去除透明留白');
const blank = analyzeAssetPixels(new Uint8Array(16), 2, 2);
assert.equal(blank.width, 2); assert.equal(blank.surfaceY, 0);
