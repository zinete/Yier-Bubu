import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { log } from 'node:console';
import { runtime, Events } from './helpers/runtime.mjs';

const source = readFileSync('src/scenes/PreloadScene.ts', 'utf8');
const mocks = Object.fromEntries([...source.matchAll(/import \w+ from '([^']+\.png)'/g)].map((match) => [match[1], { default: match[1] }]));
const Phaser = { Scene: class {}, Loader: { Events: { FILE_LOAD_ERROR: 'loaderror', PROGRESS: 'progress' } }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } };
let touch = false;
const load = runtime({}, {
  ...mocks, phaser: { default: Phaser },
  '../systems/ViewportManager': { ViewportManager: { attach() {} } },
  '../systems/GeneratedAudio': { generatedAudio: () => ({ music: 'music.wav' }) },
  '../systems/UILayout': { isTouchPrimaryDevice: () => touch },
  '../systems/ThemeBackground': { preloadThemeBackgrounds() {} },
});
const { PreloadScene } = load('src/scenes/PreloadScene.ts');
const { SCENE } = load('src/config/constants.ts');
const { fitPoseBounds } = load('src/systems/SpritePose.ts');
const loaded = new Set();
class Label extends Events {
  visible = true;
  setOrigin() { return this; } setInteractive() { return this; }
  setVisible(value) { this.visible = value; return this; }
  setText(value) { this.text = value; return this; }
}
function scene() {
  const instance = new PreloadScene();
  instance.events = new Events(); instance.load = new Events();
  instance.input = { keyboard: new Events() };
  instance.queued = [];
  instance.load.image = instance.load.spritesheet = (key) => instance.queued.push(key);
  instance.load.audio = () => {};
  instance.cache = { audio: { exists: () => false } };
  instance.add = { text: () => new Label() };
  instance.textures = { exists: (key) => loaded.has(key) };
  instance.animations = [];
  instance.anims = { exists: () => false, create: (spec) => instance.animations.push(spec) };
  instance.started = []; instance.restarts = 0; instance.prepared = 0;
  instance.scene = { start: (key) => instance.started.push(key), restart: () => { instance.restarts++; } };
  instance.makeTextures = instance.trimStartCardTextures = () => { instance.prepared++; };
  instance.preload();
  return instance;
}
let instance = scene();
assert.equal(instance.queued.length, 23, 'PC 不下载未使用的摇杆、跳跃与投掷按钮');
assert.ok(!instance.queued.includes('ui-button-jump'));
assert.ok(instance.queued.includes('coop-lift-yier-source'));
assert.ok(instance.queued.includes('coop-lift-bubu-source'));
for (const key of instance.queued) if (key !== 'characters') loaded.add(key);
instance.load.emit('loaderror', { key: 'characters', type: 'image' });
instance.create();
assert.equal(instance.prepared, 0, '必要资源缺失时不裁图、不创建动画、不进入菜单');
assert.equal(instance.started.length, 0); assert.equal(instance.retryButton.visible, true);
assert.match(instance.label.text, /characters/);
instance.retry({ repeat: true }); assert.equal(instance.restarts, 0);
instance.retry(); instance.retry(); assert.equal(instance.restarts, 1, '重试按钮防重复触发');
instance.events.emit('shutdown');
assert.equal(instance.load.entries.length, 0); assert.equal(instance.input.keyboard.entries.length, 0);
instance = scene();
assert.equal(instance.queued.length, 1, '重试只重新请求失败项');
assert.equal(instance.queued[0], 'characters'); loaded.add('characters');
instance.load.emit('loaderror', { key: 'music', type: 'audio' });
instance.create();
assert.equal(instance.started[0], SCENE.START, '音频失败可以无声继续');
assert.equal(instance.prepared, 2);
for (const character of ['yier', 'bubu']) {
  const animation = instance.animations.find((candidate) => candidate.key === `${character}-lift`);
  assert.ok(animation, `缺少静态托举姿态 ${character}-lift`);
  assert.equal(animation.frames.length, 1, '托举姿态不应来回播放');
  assert.equal(animation.frames[0].key, `${character}-lift-pose`);
  assert.equal(animation.repeat, 0);
}
assert.equal(instance.animations.some((animation) => /-lift-(ready|carrying|riding|boost-jump|cancel)$/.test(animation.key)), false,
  '不再注册多余的托举阶段动画');
const fitted = fitPoseBounds(
  { x: 3, y: 4, width: 200, height: 250 },
  { x: 10, y: 12, width: 100, height: 120 },
);
assert.ok(fitted.width <= 100 && fitted.height <= 120, '托举姿态限制在原角色轮廓内');
assert.equal(fitted.y + fitted.height, 132, '托举姿态脚底与原角色脚底对齐');
assert.equal(fitted.width / fitted.height, 200 / 250, '托举姿态保持原始宽高比');
instance.events.emit('shutdown');
log('preload: missing-image gate, cached retry, audio fallback and cleanup passed');
touch = true; instance = scene();
assert.deepEqual(instance.queued.sort(), ['ui-button-jump', 'ui-button-throw', 'ui-joystick-idle']);
instance.events.emit('shutdown');
