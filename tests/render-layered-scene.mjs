// 离线视觉 QA：直接使用编辑器的图层 SVG 与平台拼接函数，不启动浏览器。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const sharp = process.env.SCENE_PREVIEW_MODULES
  ? createRequire(path.join(process.env.SCENE_PREVIEW_MODULES, 'sharp', 'package.json'))('sharp') : require('sharp');
function load(file, imports = () => ({})) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: imports });
  return module.exports;
}
const geometry = load('src/systems/AssetGeometry.ts');
const material = load('src/systems/PlatformMaterial.ts');
const scene = load('src/systems/SceneLayers.ts');
const assets = load('src/systems/DefaultAssets.ts', (file) => ({ default: `data:image/png;base64,${readFileSync(path.resolve('src/systems', file)).toString('base64')}` })).DEFAULT_ASSETS;
const map = JSON.parse(readFileSync('maps/starlight-relay-layered-60s.json', 'utf8'));
const shapes = new Map();
for (const asset of assets) {
  const buffer = Buffer.from(asset.data.split(',')[1], 'base64');
  const metadata = await sharp(buffer).metadata();
  if (asset.id.startsWith('builtin-scene-') && asset.id !== 'builtin-scene-sky' && !metadata.hasAlpha) throw new Error(`透明素材缺少 alpha: ${asset.id}`);
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  shapes.set(asset.id, geometry.analyzeAssetPixels(data, info.width, info.height));
}
let bodies = '';
for (const p of map.level.platforms) {
  const asset = assets.find((a) => a.id === (p.assetId ?? 'builtin-moss-platform'));
  bodies += material.platformSvg(asset.data, shapes.get(asset.id), material.materialFor(asset.id, map.platformMaterials), p.x, p.y, p.width, p.height);
}
for (const coin of map.level.coins) {
  const asset = assets.find((a) => a.id === 'builtin-gold-star');
  bodies += `<image href="${asset.data}" x="${coin.x - 12}" y="${coin.y - 12}" width="24" height="24"/>`;
}
for (const p of map.level.enemies) {
  const asset = assets.find((a) => a.id === 'builtin-leaf-slime');
  bodies += `<image href="${asset.data}" x="${p.x - 20}" y="${p.y - 34}" width="40" height="34"/>`;
}
let markup = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1200"><rect width="1000" height="1200" fill="#fffaf0"/>';
for (const [index, cameraX] of [0, 2400].entries()) {
  const top = 46 + index * 590;
  const layerGroup = (group) => scene.sceneLayersSvg(map.scene.layers, assets, map.level.width, group)
    .replace(/(<g data-scene-layer="[^"]+" data-preview-parallax="([^"]+)")/g, (_, tag, factor) => `${tag} transform="translate(${cameraX * (1 - Number(factor))} 0)"`);
  markup += `<text x="20" y="${top - 16}" font-family="Microsoft YaHei" font-size="18" fill="#345b43">${index ? '横向视差预览 · Camera X = 2400' : '分层森林预设 · Camera X = 0'}（离线素材合成）</text>`
    + `<svg x="20" y="${top}" width="960" height="540" viewBox="${cameraX} 0 960 540"><rect x="${cameraX}" width="960" height="540" fill="#d7e9bc"/>`
    + layerGroup('background') + bodies + layerGroup('foreground') + '</svg>';
}
markup += '</svg>';
await sharp(Buffer.from(markup)).png().toFile('docs/scene-layers-preview.png');
writeFileSync('docs/scene-layers-preview-info.json', JSON.stringify({ renderer: 'shared SVG + sharp (offline, not browser gameplay)', cameras: [0, 2400], layers: map.scene.layers.map(({ id, parallax }) => ({ id, parallax })) }, null, 2));
