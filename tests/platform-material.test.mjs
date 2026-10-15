import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import process from 'node:process';
import { createRequire } from 'node:module';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/systems/PlatformMaterial.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { platformSlices, platformGeometry, materialFor, platformSvg, MOSS_MATERIAL } = module.exports;
const g = { sourceWidth: 2172, sourceHeight: 724, x: 50, y: 190, width: 2070, height: 371, surfaceY: 238 };
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-7, `${message}: ${a} / ${b}`);
assert.equal(materialFor('builtin-moss-platform').mode, 'repeat');
assert.equal(materialFor('uploaded').mode, 'stretch', '旧上传素材不应未经选择就改变铺设方式');
assert.equal(materialFor('toString', {}).mode, 'stretch', '不能读到原型上的属性');
close(platformGeometry(g, MOSS_MATERIAL).surfaceY, 286, '内置材质使用明确标定，不再依赖 alpha 行阈值');
for (const width of [16, 32, 160, 320, 960, 1920, 4800, 9600]) {
  for (const height of [8, 24, 32, 96, 300]) {
    for (const caps of [[0.12, 0.12], [0, 0], [0.4, 0.1]]) {
      const m = { ...MOSS_MATERIAL, leftCap: caps[0], rightCap: caps[1] };
      const pieces = platformSlices(g, m, 123, 400, width, height);
      let edge = 123;
      for (const p of pieces) {
        close(p.x, edge, '拼片无空隙或重叠'); edge = p.x + p.width;
        assert.ok(p.width > 0 && Number.isFinite(p.width));
        assert.ok(p.drawWidth >= p.width && p.drawWidth <= p.width + 0.5);
        assert.ok(p.x + p.drawWidth <= 123 + width + 1e-7, '接缝冗余不应超出平台右边界');
        assert.ok(p.sx >= g.x && p.sx + p.sw <= g.x + g.width);
        close(p.y + (286 - p.sy) / p.sh * p.height, 400, '所有拼片站立面一致');
        close(p.y + p.height, 400 + height, '厚度不改变碰撞底部');
      }
      close(edge, 123 + width, '任意宽度覆盖精确');
      const centers = pieces.slice(caps[0] ? 1 : 0, caps[1] ? -1 : undefined);
      assert.equal(centers.length % 2, 1, '奇数正反中段保证左右收口方向正确');
      centers.forEach((p, i) => assert.equal(p.flipX, i % 2 === 1));
      for (let i = 1; i < pieces.length; i += 1) {
        const before = pieces[i - 1], after = pieces[i];
        close(before.sx + (before.flipX ? 0 : before.sw), after.sx + (after.flipX ? after.sw : 0), '相邻接缝采样同一纹理边界');
      }
    }
  }
}
const short = platformSlices(g, MOSS_MATERIAL, 0, 0, 960, 32);
const long = platformSlices(g, MOSS_MATERIAL, 0, 0, 9600, 32);
close(short[0].width, long[0].width, '地图变长不能拉大收边');
assert.ok(long.length > short.length, '地图变长通过增加拼片适配');
assert.equal(platformSlices(g, { ...MOSS_MATERIAL, mode: 'stretch' }, 0, 0, 960, 32).length, 1);
assert.equal(platformSlices(g, MOSS_MATERIAL, 0, 0, 0, 32).length, 0);
assert.ok(platformSvg('asset.png', g, MOSS_MATERIAL, 0, 0, 960, 32).includes('scale(-1 1)'), '编辑器使用相同镜像拼接');
assert.equal(platformSvg('asset.png', g, MOSS_MATERIAL, 0, 0, 9600, 8).split('asset.png').length, 2, '长平台不能重复内嵌整张 base64 图片');

// 调用真实 GameScene 绘制入口，检查它没有重新走整图拉伸；纹理帧用 Phaser 本身的实现。
const require = createRequire(import.meta.url);
const Frame = require('phaser/src/textures/Frame.js');
const gameModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/scenes/GameScene.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: gameModule, exports: gameModule.exports,
  require: (name) => name === 'phaser' ? { default: { Scene: class {} } }
    : name.endsWith('/PlatformMaterial') ? module.exports
      : name.endsWith('/DefaultAssets') ? { DEFAULT_OBJECT_SKINS: { platform: 'builtin-moss-platform' } } : {},
});
const scene = Object.create(gameModule.exports.GameScene.prototype);
scene.customMap = { platformMaterials: {} };
scene.customTextures = new Map([['builtin-moss-platform', 'moss']]);
scene.assetGeometry = new Map([['moss', g]]);
const frames = new Map();
const texture = {
  source: [{ width: g.sourceWidth, height: g.sourceHeight }],
  has: (name) => frames.has(name),
  add: (name, index, x, y, width, height) => frames.set(name, new Frame(texture, name, index, x, y, width, height)),
};
scene.textures = { exists: () => true, get: () => texture };
const images = [];
scene.add = { image: (x, y, key, frame) => {
  const result = { x, y, key, frame,
    setOrigin() { return this; },
    setDisplaySize(width, height) { this.width = width; this.height = height; return this; },
    setFlipX(flip) { this.flip = flip; return this; },
    setDepth() { return this; },
  };
  images.push(result); return result;
} };
scene.drawObjectSkin('platform', { x: 10, y: 444 }, 10, 444, 1920, 32);
const expected = platformSlices(g, MOSS_MATERIAL, 10, 444, 1920, 32);
assert.equal(images.length, expected.length);
images.forEach((image, i) => {
  const p = expected[i], frame = frames.get(image.frame);
  close(image.x, p.x, '运行时 X 与编辑预览相等');
  close(image.y, p.y, '运行时 Y 与编辑预览相等');
  close(image.width, p.drawWidth, '运行时拼片尺寸相同');
  close(frame.cutX, p.sx, '纹理裁切位置正确');
  close(frame.cutWidth, p.sw, '纹理裁切宽度正确');
  assert.equal(image.flip, p.flipX);
});
assert.equal(frames.size, 3, '无论地图多长，同一材质只复用三种纹理帧');

// 离线绘制回归预览的数据入口；不依赖浏览器或开发服务器。
if (process.argv.includes('--preview')) {
  process.stdout.write(JSON.stringify([160, 320, 960, 960, 960].map((width, i) => ({
    label: `${width} x ${i >= 3 ? 96 : 32}${i === 4 ? ' / custom baseline' : ''}`,
    surface: 90 + i * 210,
    slices: platformSlices(g, i === 4 ? { ...MOSS_MATERIAL, surfaceY: 0.45 } : MOSS_MATERIAL,
      35, 90 + i * 210, width, i >= 3 ? 96 : 32),
  }))));
}
