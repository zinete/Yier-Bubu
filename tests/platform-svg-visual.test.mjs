// Optional offline raster QA. SCENE_PREVIEW_MODULES points to the bundled sharp runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { runtime } from './helpers/runtime.mjs';
const require = createRequire(import.meta.url);
const sharp = process.env.SCENE_PREVIEW_MODULES ? createRequire(path.join(process.env.SCENE_PREVIEW_MODULES, 'sharp/package.json'))('sharp') : require('sharp');
const load = runtime();
const { analyzeAssetPixels } = load('src/systems/AssetGeometry.ts');
const { platformSvg, platformSlices, MOSS_MATERIAL } = load('src/systems/PlatformMaterial.ts');
const { SvgAssetLibrary } = load('src/systems/SvgAssetLibrary.ts');
const png = readFileSync('src/assets/editor/moss-platform.png');
const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const geometry = analyzeAssetPixels(data, info.width, info.height);
const source = `data:image/png;base64,${png.toString('base64')}`;
let samples = '';
for (const [index, [width, height, cameraX, scale]] of [[1920, 32, 0, 1], [1920, 32, 500, .75], [10000, 96, 5000, 1], [320, 96, 0, 1.5]].entries()) {
  const library = new SvgAssetLibrary(`image-${index}`), ref = library.reference(source);
  const compact = platformSvg(source, geometry, MOSS_MATERIAL, 15, 120, width, height, ref);
  const pieces = platformSlices(geometry, MOSS_MATERIAL, 15, 120, width, height).filter((p) => p.x + p.width >= cameraX && p.x < cameraX + 960 / scale);
  const expanded = pieces.map((p) => `<svg x="${p.x}" y="${p.y}" width="${p.drawWidth}" height="${p.height}" viewBox="${p.sx} ${p.sy} ${p.sw} ${p.sh}" preserveAspectRatio="none"><use href="#original"${p.flipX ? ` transform="translate(${2 * p.sx + p.sw} 0) scale(-1 1)"` : ''}/></svg>`).join('');
  const svg = (body, defs) => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="320" viewBox="${cameraX} 0 ${960 / scale} ${320 / scale}"><defs>${defs}</defs>${body}</svg>`;
  const a = await sharp(Buffer.from(svg(compact, library.definitions))).ensureAlpha().raw().toBuffer();
  const b = await sharp(Buffer.from(svg(expanded, `<image id="original" href="${source}" width="${info.width}" height="${info.height}"/>`))).ensureAlpha().raw().toBuffer();
  let difference = 0, opaque = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] > 16 || b[i + 3] > 16) { opaque++; for (let c = 0; c < 4; c++) difference += Math.abs(a[i + c] - b[i + c]); }
  }
  const error = difference / Math.max(1, opaque * 4);
  assert.ok(opaque > 5000, '共享图片必须可见');
  assert.ok(error < 12, `pattern 与逐片绘制差异过大: ${error}`);
  log(`SVG raster ${width}x${height}, camera ${cameraX}, zoom ${scale}: mean channel error ${error.toFixed(2)}/255`);
  samples += `<svg y="${index * 320}" width="960" height="320" viewBox="${cameraX} 0 ${960 / scale} ${320 / scale}"><defs>${library.definitions}</defs>${compact}</svg>`;
}
if (process.argv.includes('--preview')) await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1280"><rect width="960" height="1280" fill="#e5efd8"/>${samples}</svg>`)).png().toFile('docs/2026-10-23-platform-render-preview.png');
