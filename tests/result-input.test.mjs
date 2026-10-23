import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime, Events } from './helpers/runtime.mjs';
class Visual extends Events {}
for (const method of ['setOrigin', 'setResolution', 'setDisplaySize', 'setStrokeStyle', 'setSize', 'setInteractive', 'add'])
  Visual.prototype[method] = function () { return this; };
const load = runtime({ window: { devicePixelRatio: 1 } }, {
  phaser: { default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Geom: { Rectangle: class { static Contains() {} } } } },
  '../systems/ViewportManager': { ViewportManager: { attach() {} } },
});
const { ResultScene } = load('src/scenes/ResultScene.ts');
for (const key of ['SPACE', 'ENTER', 'R', 'H']) {
  const scene = new ResultScene(), calls = [], delayed = [];
  scene.input = { keyboard: new Events() }; scene.events = new Events();
  scene.add = Object.fromEntries(['rectangle', 'text', 'container', 'image'].map((name) => [name, () => new Visual()]));
  scene.tweens = { add() {} }; scene.time = { delayedCall: (_, fn) => delayed.push(fn) };
  scene.scene = { stop() {}, start: (...args) => calls.push(args) };
  scene.create({ won: true, score: 200, message: '完成', levelId: '1-1', nextLevelId: '1-2' });
  for (let n = 0; n < 10; n++) scene.input.keyboard.emit(`keydown-${key}`, { repeat: true });
  assert.equal(scene.restarting, false, `held ${key} cannot skip the result`);
  assert.equal(delayed.length, 0);
  scene.input.keyboard.emit(`keyup-${key}`, {});
  scene.input.keyboard.emit(`keydown-${key}`, { repeat: false });
  scene.input.keyboard.emit(`keydown-${key}`, { repeat: false });
  delayed.forEach((fn) => fn());
  assert.equal(calls.length, 1, `fresh ${key} navigates once`);
  assert.equal(calls[0][0], key === 'H' ? 'StartScene' : 'GameScene');
  if (key !== 'H') assert.equal(calls[0][1].levelId, key === 'R' ? '1-1' : '1-2');
  scene.events.emit('shutdown'); assert.equal(scene.input.keyboard.entries.length, 0);
}
log('result input: held repeats ignored, fresh confirmation/replay/home and shutdown cleanup passed');
