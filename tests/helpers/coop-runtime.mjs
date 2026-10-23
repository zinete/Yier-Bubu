import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { runtime, Events } from './runtime.mjs';
import { characterBounds } from './character-bounds.mjs';
const require = createRequire(import.meta.url);
const World = require('phaser/src/physics/arcade/World.js');
const { DYNAMIC_BODY, STATIC_BODY } = require('phaser/src/physics/arcade/const.js');

// Real installed Arcade World/Body/StaticBody/colliders. Only rendering and sound
// are adapters: this is CPU physics verification, not a browser/GPU run.
class Visual extends Events {
  active = true; visible = true; angle = 0; rotation = 0; scaleX = 1; scaleY = 1;
  originX = 0.5; originY = 0.5; hasTransformComponent = true;
  constructor(scene, x = 0, y = 0, key = 'platform') {
    super(); this.scene = scene; this.x = x; this.y = y;
    this.width = key === 'characters' ? 128 : 64; this.height = key === 'characters' ? 142 : 32;
    this.frame = { realWidth: this.width, realHeight: this.height }; this.texture = {};
  }
  get displayWidth() { return this.width * this.scaleX; }
  get displayHeight() { return this.height * this.scaleY; }
  get displayOriginX() { return this.width * this.originX; }
  get displayOriginY() { return this.height * this.originY; }
  setOrigin(x, y = x) { this.originX = x; this.originY = y; return this; }
  setDisplaySize(w, h) { this.scaleX = w / this.width; this.scaleY = h / this.height; return this; }
  getTopLeft(out = {}) { out.x = this.x - this.displayOriginX * this.scaleX; out.y = this.y - this.displayOriginY * this.scaleY; return out; }
  getCenter() { const pos = this.getTopLeft(); return { x: pos.x + this.displayWidth / 2, y: pos.y + this.displayHeight / 2 }; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setVisible(v) { this.visible = v; return this; }
  setAlpha(v) { this.alpha = v; return this; }
  setTint() { return this; } clearTint() { return this; } setDepth() { return this; }
  setFillStyle() { return this; } setStrokeStyle() { return this; } setFlipX() { return this; }
  setText(v) { this.text = v; return this; } play(v) { this.animation = v; return this; }
  setGravityY(v) { this.body.setGravityY(v); return this; }
  setMaxVelocity(x, y) { this.body.setMaxVelocity(x, y); return this; }
  setVelocity(x, y) { this.body.setVelocity(x, y); return this; }
  setCollideWorldBounds(v) { this.body.setCollideWorldBounds(v); return this; }
  refreshBody() { this.body.updateFromGameObject(); return this; }
  disableBody() { this.body.enable = false; this.active = this.visible = false; return this; }
  destroy() { if (this.body) { this.body.destroy(); this.body = undefined; } this.scene = undefined; this.active = false; }
}
class Audio {
  sounds = [];
  preferences = { sound: true, music: true, soundVolume: .6, musicVolume: .35 };
  setPreferences(value) { this.preferences = value; }
  play(key) { this.sounds.push(key); } playMusic() {} setMusicPaused(v) { this.paused = v; }
}
export function coopRuntime() {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://example.test', pretendToBeVisual: true });
  const { window } = dom; window.document.hasFocus = () => true;
  const load = runtime({ window, document: window.document, Element: window.Element }, {
    phaser: { default: { Scene: class {}, Physics: { Arcade: { Sprite: Visual } },
      Scenes: { Events: { SHUTDOWN: 'shutdown', POST_UPDATE: 'postupdate' } } } },
    '../systems/CharacterBody': { characterBodyBounds: characterBounds },
    '../systems/AudioManager': { AudioManager: Audio },
    '../systems/ForestArt': { buildForest() {} },
    './coop.css': {},
  });
  const { CoopScene } = load('src/scenes/CoopScene.ts');
  const scene = new CoopScene();
  scene.sys = { scale: { width: 960, height: 540 } };
  scene.events = new Events(); scene.scale = { width: 960, height: 540 };
  scene.game = { events: new Events(), input: { keyboard: { preventDefault: true } }, canvas: window.document.createElement('canvas') };
  window.document.getElementById('app').append(scene.game.canvas);
  scene.input = new Events(); scene.input.keyboard = { enabled: true };
  const world = new World(scene, { gravity: { x: 0, y: 0 }, debug: false });
  scene.objects = [];
  const visual = (x, y, key) => { const v = new Visual(scene, x, y, key); scene.objects.push(v); return v; };
  scene.add = { existing: (v) => scene.objects.push(v), text: (x, y) => visual(x, y), rectangle: (x, y) => visual(x, y) };
  scene.physics = { world, add: {
    existing: (actor) => world.enableBody(actor, DYNAMIC_BODY),
    staticImage: (x, y, key) => { const v = visual(x, y, key); world.enableBody(v, STATIC_BODY); return v; },
    collider: (...args) => world.addCollider(...args),
  } };
  scene.cameras = { main: { zoom: 1, setBounds() { return this; }, setBackgroundColor() { return this; },
    setZoom(v) { this.zoom = v; return this; }, centerOn(x, y) { this.x = x; this.y = y; return this; } } };
  scene.textures = { get: () => ({ getSourceImage: () => ({ src: 'local-thumb.png' }) }) };
  scene.calls = []; scene.scene = { start: (...args) => scene.calls.push(['start', ...args]), restart: () => scene.calls.push(['restart']) };
  scene.create();
  const held = new Set();
  const key = (code, down, repeat = false, target = window) => {
    if (down) held.add(code); else held.delete(code);
    const event = new window.KeyboardEvent(down ? 'keydown' : 'keyup', { code, repeat, bubbles: true, cancelable: true });
    target.dispatchEvent(event); return event;
  };
  const setKeys = (codes) => {
    for (const code of [...held]) if (!codes.includes(code)) key(code, false);
    for (const code of codes) if (!held.has(code)) key(code, true);
  };
  let time = 0;
  const tick = (frames = 1, delta = 1000 / 60) => {
    for (let i = 0; i < frames; i++) {
      time += delta;
      world.update(time, delta); scene.update(time, delta); world.postUpdate();
      scene.events.emit('postupdate');
    }
  };
  const start = () => {
    setKeys(['KeyE', 'Enter']); tick(); setKeys([]); tick(12);
  };
  let stopped = false;
  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    // Match Phaser shutdown: display objects and Arcade plugin can die first.
    scene.objects.forEach((v) => v.destroy()); world.destroy();
    scene.events.emit('shutdown');
  };
  const close = () => { shutdown(); dom.window.close(); };
  return { scene, window, load, world, key, setKeys, tick, start, shutdown, close };
}
