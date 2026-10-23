import assert from 'node:assert/strict';
import { log } from 'node:console';
import { coopRuntime } from './helpers/coop-runtime.mjs';
import { runtime, Events } from './helpers/runtime.mjs';

// Real AudioManager persists new preferences and updates the playing sound through registry events.
let saved;
const audioLoad = runtime({ localStorage: { getItem: () => null, setItem: (_, value) => { saved = JSON.parse(value); } } }, {
  phaser: { default: { Math: { Clamp: (v, min, max) => Math.max(min, Math.min(max, v)) }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } },
});
const { AudioManager } = audioLoad('src/systems/AudioManager.ts');
const registryEvents = new Events(), audioEvents = new Events(), gameEvents = new Events();
const musicTrack = { isPaused: false, play() {}, stop() {}, pause() { this.isPaused = true; }, resume() { this.isPaused = false; }, setVolume(v) { this.volume = v; }, destroy() {} };
const audioManager = new AudioManager({ registry: { events: registryEvents, set: (key, value) => registryEvents.emit('changedata', {}, key, value) },
  events: audioEvents, game: { events: gameEvents }, cache: { audio: { exists: () => true } }, sound: { add: () => musicTrack } });
audioManager.playMusic('music');
audioManager.setPreferences({ sound: false, music: false, soundVolume: .2, musicVolume: .1 });
assert.equal(saved.soundVolume, .2); assert.equal(saved.music, false); assert.equal(musicTrack.isPaused, true); assert.equal(musicTrack.volume, .1);
audioEvents.emit('shutdown'); assert.equal(registryEvents.entries.length, 0); assert.equal(gameEvents.entries.length, 0);

const run = coopRuntime(), { scene, window, load } = run;
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
const effects = load('src/systems/EffectPanel.ts'), support = load('src/systems/ReleaseSupport.ts');
const effectDispose = effects.mountEffectPanel(() => scene.game.events.emit('blur'), () => {});
const supportDispose = support.mountReleaseSupport({ version: 'test' }, () => scene.getFeedbackContext(), () => scene.game.events.emit('blur'), () => {});
const button = (text) => Array.from(scene.overlay.root.querySelectorAll('button')).find((node) => node.textContent === text);
assert.equal(scene.overlay.root.querySelector('fieldset').hidden, true);
run.start(); assert.equal(button('画面与特效').hidden, true, '游玩时不挤占 HUD');
run.setKeys(['KeyD', 'ArrowRight']); run.tick(); run.key('Escape', true); run.key('Escape', false);
assert.equal(scene.phase, 'paused'); assert.equal(scene.overlay.root.querySelector('fieldset').hidden, false);
const music = scene.overlay.root.querySelector('[data-audio="music"]');
music.focus(); music.click(); assert.equal(scene.audio.preferences.music, false);
const volume = scene.overlay.root.querySelector('[data-audio="soundVolume"]'); volume.value = '.2';
volume.dispatchEvent(new window.Event('input', { bubbles: true })); assert.equal(scene.audio.preferences.soundVolume, .2);
assert.equal(run.key('ArrowRight', true, false, volume).defaultPrevented, false, '声音滑块保留方向键编辑');
button('画面与特效').click();
const motion = window.document.querySelector('[data-reduced-motion]');
assert.equal(motion.closest('dialog').open, true);
motion.checked = true; motion.dispatchEvent(new window.Event('change', { bubbles: true }));
const preference = load('src/systems/EffectPreferences.ts').getEffectPreferences();
assert.equal(preference.reducedMotion, true);
window.document.querySelector('[data-effect-close]').click(); assert.equal(scene.phase, 'paused');
button('试玩反馈').click(); const description = window.document.querySelector('[data-description]');
assert.equal(description.closest('dialog').open, true);
assert.equal(run.key('Enter', true, false, description).defaultPrevented, false);
assert.equal(scene.getFeedbackContext().levelId, 'coop-tutorial'); assert.equal(scene.getFeedbackContext().mode, 'local-coop');
window.document.querySelector('[data-close]').click();
button('继续冒险 · Esc').click(); run.setKeys([]); run.tick();
assert.equal(scene.phase, 'playing'); assert.equal(scene.controls.read('p1').moveX, 0); assert.equal(scene.controls.read('p2').moveX, 0);
load('src/systems/EffectPreferences.ts').setEffectPreferences({ reducedMotion: false });
effectDispose(); supportDispose(); run.shutdown();
assert.equal(window.document.querySelector('.coop-overlay'), null); assert.equal(window.document.querySelector('dialog'), null);
run.close();
log('co-op settings: sound controls, effect/feedback dialogs, focus isolation, explicit resume and cleanup passed');
