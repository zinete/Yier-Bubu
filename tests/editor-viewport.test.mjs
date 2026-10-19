import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { EventEmitter } from 'node:events';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/systems/EditorViewport.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { editorZoom, heightFillZoom, anchoredZoomScroll, centeredObjectScroll } = module.exports;
assert.equal(editorZoom(0), 0.05); assert.equal(editorZoom(10), 3); assert.equal(editorZoom(NaN), 1);
for (const from of [0.05, 0.5, 1, 2]) for (const to of [0.05, 0.5, 1, 3]) {
  const world = { x: 8000, y: 2000 }, before = { left: 40000, top: 10000 };
  const after = anchoredZoomScroll(world, from, to, before);
  assert.ok(Math.abs((world.x * from - before.left) - (world.x * to - after.left)) < 1e-8);
  assert.ok(Math.abs((world.y * from - before.top) - (world.y * to - after.top)) < 1e-8);
}
const centered = centeredObjectScroll({ x: 6000, y: 240, width: 160, height: 32 }, 2, { width: 900, height: 540 });
assert.equal(centered.left, 11730); assert.equal(centered.top, 262);
for (const height of [200, 540, 1100, 2200, 4320]) assert.ok(Math.abs(heightFillZoom(height) * 540 - (height - 40)) < 1e-8);
assert.equal(heightFillZoom(0), 1); assert.equal(heightFillZoom(NaN), 1);
function load(file, require = () => ({})) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: loaded, exports: loaded.exports, require }); return loaded.exports;
}
const constants = load('src/config/constants.ts');
const cameraViewport = load('src/systems/CameraViewport.ts', () => constants);
const { CameraManager } = load('src/systems/CameraManager.ts', (name) => name === 'phaser'
  ? { default: { Scale: { Events: { RESIZE: 'resize' } }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } }
  : name.endsWith('/CameraViewport') ? cameraViewport : constants);
for (const [width, height] of [[960, 540], [1920, 1080], [2560, 1080], [1024, 768], [390, 844]]) {
  const expected = cameraViewport.worldCameraView(width, height);
  assert.equal(expected.zoom, Math.min(width / 960, height / 540));
  assert.ok(expected.width >= 960 - 1e-8 && expected.height >= 540 - 1e-8);
  assert.ok(Math.abs(expected.width / expected.height - width / height) < 1e-8);
  const camera = { setBounds() { return this; }, setZoom(value) { this.zoom = value; return this; }, setDeadzone() { return this; },
    startFollow() { return this; }, setRoundPixels() { return this; } };
  const scale = Object.assign(new EventEmitter(), { width, height });
  const events = new EventEmitter();
  CameraManager.attach({ cameras: { main: camera }, scale, events }, { x: 100, y: 300 });
  assert.equal(camera.zoom, expected.zoom, '编辑器参考和真实 CameraManager.attach 共用相同比例');
  scale.width *= 1.2; scale.emit('resize');
  assert.equal(camera.zoom, cameraViewport.worldCameraView(scale.width, scale.height).zoom);
  events.emit('shutdown'); assert.equal(scale.listenerCount('resize'), 0);
}
