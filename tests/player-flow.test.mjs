import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime, Events } from './helpers/runtime.mjs';

// Executes production scene/controller/player methods with small rendering and
// physics adapters. This is not a browser run or an actual physics playthrough.
class Visual extends Events {
  active = true; visible = true; x = 0; y = 0; data = new Map(); list = [];
  constructor(x = 0, y = 0) { super(); this.x = x; this.y = y; }
  setOrigin() { return this; }
  setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; }
  setSize() { return this; }
  setOffset() { return this; }
  setVisible(visible) { this.visible = visible; return this; }
  setTint() { return this; }
  setStrokeStyle() { return this; }
  setFontSize() { return this; }
  setScale() { return this; }
  setCollideWorldBounds() { return this; }
  setGravityY() { return this; }
  setMaxVelocity() { return this; }
  setVelocity(x, y) { this.body.velocity = { x, y }; return this; }
  setVelocityY(y) { this.body.velocity.y = y; return this; }
  setFlipX() { return this; }
  setAlpha(alpha) { this.alpha = alpha; return this; }
  setScrollFactor() { return this; }
  setInteractive() { return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setRadius() { return this; }
  play(key) { this.animation = key; return this; }
  refreshBody() { this.body ??= { checkCollision: {} }; return this; }
  setData(key, value) { this.data.set(key, value); return this; }
  getData(key) { return this.data.get(key); }
  disableBody() { this.active = false; if (this.body) this.body.enable = false; return this; }
}
class Sprite extends Visual {
  constructor(scene, x, y) {
    super(x, y); this.scene = scene; this.texture = {};
    this.body = {
      enable: true, velocity: { x: 0, y: 0 }, blocked: {}, touching: {}, bottom: y,
      setSize() { return this; }, setOffset() { return this; },
      reset: (rx, ry) => { this.x = rx; this.y = ry; },
    };
  }
}
class Effects { impact() {} charge() {} sparkle() {} setPaused(value) { this.paused = value; } }
class Audio { play() {} playMusic() {} toggleSound() {} setMusicPaused(value) { this.paused = value; } }
const gameEvents = new Events();
const values = new Map([['yierBubuTutorialV1', 'done']]);
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const Phaser = {
  Scene: class {}, Physics: { Arcade: { Sprite } }, Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  Scale: { Events: { RESIZE: 'resize' } },
  Input: { Keyboard: { JustDown: (key) => { const down = key.pressed; key.pressed = false; return down; } } },
  Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)), Vector2: class { constructor(x, y) { this.x = x; this.y = y; } } },
};
const layoutModule = runtime()('src/systems/UILayout.ts');
let editorUnavailable = false;
const load = runtime({ localStorage: storage, window: { devicePixelRatio: 1 } }, {
  phaser: { default: Phaser },
  '../systems/CharacterBody': { characterBodyBounds: () => ({ x: 0, y: 0, width: 40, height: 60 }) },
  '../systems/AudioManager': { AudioManager: Audio },
  '../systems/SkillEffects': { SkillEffects: Effects },
  '../systems/CameraManager': { CameraManager: { attach() {} } },
  '../systems/ViewportManager': { ViewportManager: { attach() {} } },
  '../systems/ForestArt': { buildForest() {} },
  '../systems/LevelValidator': { LevelValidator: { validate() {} } },
  '../systems/CustomMap': { parseCustomMap: (value) => value, playablePlatforms: (map) => map.level.platforms },
  '../systems/DefaultAssets': { mapAssets: () => [], runtimeMapAssets: () => [], DEFAULT_OBJECT_SKINS: {} },
  '../systems/SceneLayers': { mountSceneLayers() {} },
  '../systems/UILayout': { ...layoutModule, isTouchPrimaryDevice: () => true },
  get './EditorScene'() { if (editorUnavailable) throw new Error('offline'); return { EditorScene: class {} }; },
});
const { GameScene } = load('src/scenes/GameScene.ts');
const { ResultScene } = load('src/scenes/ResultScene.ts');
const { UIScene } = load('src/scenes/UIScene.ts');
const { StartScene } = load('src/scenes/StartScene.ts');
const { InputManager } = load('src/systems/InputManager.ts');
const { REGISTRY, SCENE, PLAYER } = load('src/config/constants.ts');
function pool() { return { children: { each() {} }, getFirstDead: () => null }; }
function setup(scene) {
  scene.events = new Events(); scene.game = { events: gameEvents };
  const keyboard = new Events();
  keyboard.addKey = () => ({ isDown: false, pressed: false, reset() { this.isDown = this.pressed = false; } });
  scene.input = new Events(); scene.input.keyboard = keyboard;
  scene.registry = new Map(); scene.scale = new Events();
  scene.add = {
    existing() {}, rectangle: (x, y) => new Visual(x, y), text: (x, y) => new Visual(x, y),
    image: (x, y) => new Visual(x, y), zone: (x, y) => new Visual(x, y), circle: (x, y) => new Visual(x, y),
  };
  scene.overlaps = [];
  scene.physics = {
    world: { isPaused: true, resume() { this.isPaused = false; }, pause() { this.isPaused = true; }, setBounds() {} },
    add: {
      existing() {}, staticGroup: () => ({ create: (x, y) => new Visual(x, y) }),
      collider() {}, staticImage: (x, y) => new Visual(x, y),
      overlap: (a, b, fn) => scene.overlaps.push({ a, b, fn }),
    },
  };
  scene.delayed = []; scene.timers = [];
  scene.time = { paused: true, delayedCall: (_, fn) => scene.delayed.push(fn), addEvent: (event) => scene.timers.push(event.callback) };
  scene.tweens = { resumeAll() {}, pauseAll() {} };
  scene.cameras = { main: { shake() {} } };
  scene.calls = [];
  scene.scene = Object.fromEntries(['start', 'launch', 'stop', 'pause', 'restart'].map((method) => [method, (...args) => scene.calls.push([method, ...args])]));
  scene.textures = { remove() {} };
  return scene;
}
function create(character = 'yier', levelId = '1-1') {
  const scene = setup(new GameScene());
  scene.registry.set(REGISTRY.CHARACTER, character);
  scene.createBackground = () => {};
  scene.feedback = () => {};
  scene.createCoins = () => { scene.coins = pool(); };
  scene.createEnemies = () => { scene.enemies = pool(); };
  scene.createProjectiles = () => { scene.playerProjectiles = pool(); scene.enemyProjectiles = pool(); };
  scene.init({ levelId }); scene.create();
  // Keep real hurt/stomp logic; skip movement integration supplied by Phaser.
  scene.player.updatePlayer = () => {};
  return scene;
}
const shutdown = (scene) => scene.events.emit('shutdown');
const overlap = (scene, a, b, first, second) => scene.overlaps.find((entry) => entry.a === a && entry.b === b).fn(first, second);
function enemy(x = 100) {
  return { x, y: 400, isAlive: true, arcadeBody: { center: { y: 380 } }, defeat() {
    if (!this.isAlive) return false;
    this.isAlive = false; return true;
  } };
}
function shot(owner) {
  const object = new Visual(100, 400); object.firedBy = owner;
  object.body = { enable: true }; object.arcadeBody = object.body;
  return object;
}

for (const character of ['yier', 'bubu']) {
  for (const level of ['1-1', '1-2']) {
    const scene = create(character, level);
    assert.equal(scene.player.character, character);
    assert.equal(scene.level.id, level);
    assert.equal(scene.health, 3); assert.equal(scene.time.paused, false);
    const coin = new Visual(200, 300);
    overlap(scene, scene.player, scene.coins, scene.player, coin);
    overlap(scene, scene.player, scene.coins, scene.player, coin);
    assert.equal(scene.collected, 1); assert.equal(scene.score, 100);
    scene.finish(true);
    const result = scene.calls.find((call) => call[0] === 'launch' && call[1] === SCENE.RESULT)[2];
    assert.equal(result.nextLevelId, level === '1-1' ? '1-2' : undefined);
    assert.equal(scene.physics.world.isPaused, true);
    scene.finish(false); scene.collect(new Visual()); scene.damage(false);
    const terminalEnemy = enemy(); const terminalShot = shot('player');
    overlap(scene, scene.playerProjectiles, scene.enemies, terminalShot, terminalEnemy);
    assert.equal(terminalEnemy.isAlive, true); assert.equal(scene.score, 100);
    assert.equal(scene.calls.filter((call) => call[1] === SCENE.RESULT).length, 1);
    shutdown(scene);
  }
}
let scene = create('invalid-character');
assert.equal(scene.player.character, 'yier', '角色缺失时安全回退');
scene.hitEnemy(enemy());
assert.equal(scene.health, 2); assert.equal(scene.player.visible, true);
assert.equal(scene.player.active, true); assert.equal(scene.player.body.enable, true);
scene.hitEnemy(enemy()); assert.equal(scene.health, 2, '无敌帧不重复扣血');
scene.player.y = 700; scene.damage(true);
assert.equal(scene.player.y, scene.checkpoint.y); assert.equal(scene.health, 2, '无敌帧仍可坠落复位');
scene.combatTime += PLAYER.HURT_COOLDOWN;
const badShot = shot('player');
overlap(scene, scene.player, scene.enemyProjectiles, scene.player, badShot);
assert.equal(scene.health, 2, '错误阵营的弹体不造成伤害');
const enemyShot = shot('enemy');
overlap(scene, scene.player, scene.enemyProjectiles, scene.player, enemyShot);
overlap(scene, scene.player, scene.enemyProjectiles, scene.player, enemyShot);
assert.equal(scene.health, 1); assert.equal(enemyShot.active, false);
scene.combatTime += PLAYER.HURT_COOLDOWN; scene.damage(false);
assert.equal(scene.status, 'lost'); assert.equal(scene.health, 0);
shutdown(scene);
scene = create();
const target = enemy(); const playerShot = shot('player');
overlap(scene, scene.playerProjectiles, scene.enemies, playerShot, target);
overlap(scene, scene.playerProjectiles, scene.enemies, playerShot, enemy());
assert.equal(scene.score, 200, '同一弹体仅命中一次');
scene.player.body.velocity.y = 200; scene.player.body.bottom = 300;
scene.hitEnemy(enemy()); assert.equal(scene.score, 450); assert.equal(scene.player.body.velocity.y, -390);
scene.seconds = 1; scene.timers[0]();
assert.equal(scene.status, 'lost'); assert.equal(scene.seconds, 0);
shutdown(scene);

// Restart, blur/hidden pause, repeat-key suppression, explicit resume, cleanup.
for (let cycle = 0; cycle < 10; cycle++) {
  const before = gameEvents.entries.length;
  scene = create();
  scene.handleAction('restart'); scene.handleAction('home');
  assert.equal(scene.status, 'playing', 'R/H 在游玩时不误暂停');
  gameEvents.emit('virtual-control', 'right', true);
  gameEvents.emit('blur'); gameEvents.emit('hidden');
  assert.equal(scene.status, 'paused'); assert.equal(scene.time.paused, true);
  assert.equal(scene.inputManager.down('right'), false);
  gameEvents.emit('focus'); assert.equal(scene.status, 'paused', '聚焦后必须手动继续');
  scene.pauseFromKeyboard({ repeat: true }); assert.equal(scene.status, 'paused');
  scene.pauseFromKeyboard({ repeat: false }); assert.equal(scene.status, 'playing');
  gameEvents.emit('virtual-control', 'attack', true);
  scene.update(0, 16);
  scene.finish(true);
  scene.delayed.forEach((fn) => fn());
  assert.equal(scene.charging, false);
  shutdown(scene);
  assert.equal(gameEvents.entries.length, before, '重入不遗留游戏/输入监听');
  assert.equal(scene.input.keyboard.entries.length, 0);
}
for (const action of ['restart', 'home']) {
  scene = create('bubu', '1-2'); scene.handleAction('pause'); scene.handleAction(action);
  scene.handleAction(action);
  assert.equal(scene.calls.filter((call) => call[0] === (action === 'restart' ? 'restart' : 'start')).length, 1);
  assert.equal(scene.calls.at(-1)[0], action === 'restart' ? 'restart' : 'start');
  if (action === 'restart') assert.equal(scene.calls.at(-1)[1].levelId, '1-2');
  else assert.equal(scene.calls.at(-1)[1], SCENE.START);
  shutdown(scene);
}
for (const [customMap, nextLevelId, expected] of [[undefined, '1-2', '1-2'], [undefined, undefined, '1-1'], [{ title: 'custom' }, undefined, '1-1']]) {
  const result = setup(new ResultScene());
  result.result = { levelId: '1-1', nextLevelId, customMap };
  result.restartGame(); result.restartGame(); result.delayed.forEach((fn) => fn());
  assert.equal(result.calls.filter((call) => call[0] === 'start').length, 1, '结算重复点击只导航一次');
  assert.equal(result.calls.at(-1)[2].levelId, expected);
  const home = setup(new ResultScene()); home.result = result.result;
  home.navigate(SCENE.START, '1-1'); home.delayed.forEach((fn) => fn());
  assert.equal(home.calls.at(-1)[1], customMap ? SCENE.EDITOR : SCENE.START);
}

const menu = setup(new StartScene()); menu.settingsModal = { visible: false }; menu.selected = 'bubu';
menu.startGame('1-2'); menu.startGame('1-2');
assert.equal(menu.calls.filter((call) => call[0] === 'start').length, 1);
assert.equal(menu.registry.get(REGISTRY.CHARACTER), 'bubu');
const editorMenu = setup(new StartScene()); editorMenu.settingsModal = { visible: false };
editorMenu.editorEntry = { setText(value) { this.text = value; } };
let editorRegistered = false;
editorMenu.scene.get = () => editorRegistered;
editorMenu.scene.add = (key) => { assert.equal(key, SCENE.EDITOR); editorRegistered = true; };
editorUnavailable = true; await editorMenu.openEditor();
assert.equal(editorMenu.navigating, false); assert.match(editorMenu.editorEntry.text, /失败/);
editorUnavailable = false; await editorMenu.openEditor();
assert.equal(editorRegistered, true); assert.equal(editorMenu.calls.at(-1)[1], SCENE.EDITOR);
// Leaving the start scene while an import resolves must never navigate later.
editorRegistered = false; editorMenu.navigating = false; editorMenu.calls.length = 0;
const pendingEntry = editorMenu.openEditor(); editorMenu.entryGeneration++;
await pendingEntry; assert.equal(editorMenu.calls.length, 0);

// Mobile input does not require a keyboard and always consumes actions once.
const mobile = setup({}); mobile.input.keyboard = undefined;
const input = new InputManager(mobile);
gameEvents.emit('virtual-control', 'left', true);
gameEvents.emit('virtual-control', 'jump', true);
gameEvents.emit('virtual-control', 'attack', true);
input.update(); assert.equal(input.down('left'), true);
assert.equal(input.consumeJump(), true); assert.equal(input.consumeJump(), false);
assert.equal(input.consumeAttack(), true); assert.equal(input.consumeAttack(), false);
input.reset(); assert.equal(input.down('left'), false); shutdown(mobile);

// Each touch control belongs to one finger; releasing a different finger does
// not cancel it. Scene-wide release and backgrounding clear every held action.
const ui = setup(new UIScene());
ui.createMobileControls();
ui.game.events.on('blur', ui.releaseMobileControls, ui);
ui.game.events.on('hidden', ui.releaseMobileControls, ui);
const controls = [];
const track = (control, down) => controls.push([control, down]);
gameEvents.on('virtual-control', track);
const jump = ui.actionControls.find((entry) => entry.control === 'jump').button;
const attack = ui.actionControls.find((entry) => entry.control === 'attack').button;
jump.emit('pointerdown', { id: 1 }); attack.emit('pointerdown', { id: 2 });
jump.emit('pointerout', { id: 2 });
assert.equal(ui.actionPointers.get('jump'), 1);
ui.onPointerUp({ id: 2 }); assert.equal(ui.actionPointers.has('jump'), true);
assert.equal(ui.actionPointers.has('attack'), false);
ui.onPointerUp({ id: 1 }); assert.equal(ui.actionPointers.size, 0);
ui.joystickHitZone.emit('pointerdown', { id: 3, x: 100, y: 0 });
ui.joystickHitZone.emit('pointerdown', { id: 4, x: 0, y: 0 });
assert.equal(ui.joystickPointerId, 3);
jump.emit('pointerdown', { id: 1 }); gameEvents.emit('hidden');
assert.equal(ui.joystickPointerId, undefined); assert.equal(ui.actionPointers.size, 0);
assert.equal(controls.at(-1)[1], false);
ui.registry.set('hud', { paused: true }); jump.emit('pointerdown', { id: 1 });
assert.equal(ui.actionPointers.size, 0, '暂停菜单下不接收触控动作');
for (const key of ['tutorial', 'pauseText', 'pauseMenu', 'journeyText', 'skillBar', 'skillText', 'hudPanel',
  'portraitFrame', 'portrait', 'divider', 'starText', 'scoreText', 'timerText', 'pauseButton', 'soundButton']) ui[key] = new Visual();
ui.children = { getByName: () => null };
ui.scale.width = 390; ui.scale.height = 844; ui.registry.set('hud', { paused: false });
const rotationActions = [];
const onRotation = (action) => rotationActions.push(action);
gameEvents.on('game-action', onRotation);
ui.layout(); assert.equal(rotationActions.length, 1); assert.equal(rotationActions[0], 'pause');
ui.scale.width = 844; ui.scale.height = 390; ui.registry.set('hud', { paused: true });
ui.layout(); assert.equal(rotationActions.length, 1, '旋回横屏不自动恢复游戏');
gameEvents.off('game-action', onRotation);
ui.destroyUi(); gameEvents.off('virtual-control', track);
assert.equal(gameEvents.entries.length, 0, '所有流程退出后无残留全局监听');
log('player flow: 2 characters × 2 levels, combat, pause, lifecycle, result and multi-touch passed (simulated adapters)');
