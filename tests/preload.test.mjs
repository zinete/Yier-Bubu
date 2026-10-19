import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { log } from 'node:console';
import { runtime, Events } from './helpers/runtime.mjs';

const source = readFileSync('src/scenes/PreloadScene.ts', 'utf8');
const mocks = Object.fromEntries([...source.matchAll(/import \w+ from '([^']+\.png)'/g)].map((match) => [match[1], { default: match[1] }]));
const Phaser = { Scene: class {}, Loader: { Events: { FILE_LOAD_ERROR: 'loaderror', PROGRESS: 'progress' } }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } };
const load = runtime({}, {
  ...mocks, phaser: { default: Phaser },
  '../systems/ViewportManager': { ViewportManager: { attach() {} } },
  '../systems/GeneratedAudio': { generatedAudio: () => ({ music: 'music.wav' }) },
});
const { PreloadScene } = load('src/scenes/PreloadScene.ts');
const { SCENE } = load('src/config/constants.ts');
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
  instance.anims = { exists: () => false, create() {} };
  instance.started = []; instance.restarts = 0; instance.prepared = 0;
  instance.scene = { start: (key) => instance.started.push(key), restart: () => { instance.restarts++; } };
  instance.makeTextures = instance.trimStartCardTextures = () => { instance.prepared++; };
  instance.preload();
  return instance;
}
let instance = scene();
assert.equal(instance.queued.length, 24, '只加载 24 项被实际使用的位图（含角色图集）');
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
instance.events.emit('shutdown');
log('preload: missing-image gate, cached retry, audio fallback and cleanup passed');
