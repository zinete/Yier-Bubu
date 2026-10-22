import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime } from './helpers/runtime.mjs';
import { coopRuntime } from './helpers/coop-runtime.mjs';

const load = runtime();
const { CoopRules, canCatchLift, interactionTarget, outwardLimit, coopCameraPlan } = load('src/systems/CoopRules.ts');
const { NORMAL_JUMP_HEIGHT, COOP_HIGH_RISE, COOP_BRIDGE, COOP_GATE, COOP_GATHER_GATE } = load('src/levels/coopTutorial.ts');
assert.ok(NORMAL_JUMP_HEIGHT > 119 && NORMAL_JUMP_HEIGHT < 121);
assert.ok(COOP_HIGH_RISE > NORMAL_JUMP_HEIGHT + 40);
const rider = { x: 500, y: 270, width: 74, height: 83, previousBottom: 354, velocityY: 180 };
const support = { x: 510, y: 356, width: 56, height: 8 };
assert.equal(canCatchLift(rider, support, []), true);
assert.equal(canCatchLift({ ...rider, velocityY: -10 }, support, []), false);
assert.equal(canCatchLift({ ...rider, previousBottom: 380 }, support, []), false);
assert.equal(canCatchLift({ ...rider, x: 100 }, support, []), false);
assert.equal(canCatchLift(rider, support, [{ x: 480, y: 250, width: 150, height: 50 }]), false);
const fact = (id, x, feet = 444) => ({ id, x, feet, grounded: true, normal: true });
const rules = new CoopRules();
assert.equal(rules.interact('other'), false); rules.interact('coop-high-lever');
rules.update([fact('p1', 1160), fact('p2', 1160)]); assert.equal(rules.gateOpen, false);
rules.update([fact('p1', 1160), fact('p2', 1290)]); assert.equal(rules.gateOpen, true);
rules.update([fact('p1', 1500), { ...fact('p2', 1590), normal: false }]); assert.equal(rules.checkpointActive, false);
rules.update([fact('p1', 1500), fact('p2', 1590)]); assert.equal(rules.checkpointActive, true);
assert.equal(rules.update([fact('p1', 2050), fact('p2', 1500)]), false);
assert.equal(rules.update([fact('p1', 2050), fact('p2', 2120)]), true);
assert.equal(rules.update([fact('p1', 2050), fact('p2', 2120)]), false);
const targets = [{ id: 'b', x: 100, y: 444, radius: 70, priority: 1 }, { id: 'a', x: 100, y: 444, radius: 70, priority: 1 }];
assert.equal(interactionTarget(fact('p1', 100), targets).id, 'a', '同优先级同距离按稳定 ID 选择唯一目标');
assert.equal(interactionTarget(fact('p1', 300), targets), undefined);
assert.equal(outwardLimit(800, 200, false, false), 0, '不截断空中速度');
assert.equal(outwardLimit(800, 200, true, false), 1);
for (const [w, h] of [[640, 360], [800, 600], [1280, 720], [1920, 1080], [2560, 1080]]) {
  const near = coopCameraPlan(w, h, 120, 220), far = coopCameraPlan(w, h, 120, 960);
  assert.ok(far.zoom <= near.zoom && far.zoom >= near.zoom * 0.72);
  assert.ok(w / far.zoom >= 1000, '落地限制的空中余量仍可容纳双人');
}

let run = coopRuntime(), { scene, key, tick, setKeys } = run;
key('KeyE', true); tick(); assert.deepEqual(Array.from(scene.ready), [true, false]);
key('Enter', true); tick(); assert.equal(scene.phase, 'ready', '准备键未松开不得进入关卡');
setKeys([]); tick(12); assert.equal(scene.phase, 'playing'); assert.equal(scene.rules.bridgeOpen, false);
assert.equal(scene.partners.p1.actor.playerId, 'p1'); assert.equal(scene.partners.p2.actor.characterId, 'bubu');
setKeys(['KeyD', 'ArrowLeft', 'KeyW', 'ArrowUp']); tick(8);
assert.ok(scene.partners.p1.actor.arcadeBody.velocity.x > 0 && scene.partners.p2.actor.arcadeBody.velocity.x < 0);
assert.ok(scene.partners.p1.actor.arcadeBody.velocity.y < 0 && scene.partners.p2.actor.arcadeBody.velocity.y < 0);
assert.equal(scene.lift.active, false); setKeys([]); tick(70);
key('ShiftLeft', true); tick(); assert.equal(scene.lift.active, false, '左 Shift 不触发托举');
setKeys([]); key('Escape', true); tick(); assert.equal(scene.phase, 'paused');
const pausedAt = scene.clock; tick(120); assert.equal(scene.clock, pausedAt);
key('Escape', true, true); assert.equal(scene.phase, 'paused'); setKeys([]);
key('Escape', true); setKeys([]); tick(); assert.equal(scene.phase, 'playing');
key('KeyD', true); run.window.dispatchEvent(new run.window.Event('blur'));
assert.equal(scene.phase, 'paused'); assert.equal(scene.controls.read('p1').moveX, 0);
setKeys([]); scene.togglePause(); tick();
const field = run.window.document.createElement('input'); run.window.document.body.append(field); field.focus();
assert.equal(scene.phase, 'paused');
assert.equal(run.window.document.activeElement, field, '暂停反馈不得抢走文本输入焦点');
assert.equal(key('ArrowUp', true, false, field).defaultPrevented, false, '文本输入不被游戏捕获');
run.shutdown();
assert.equal(run.window.document.querySelector('.coop-overlay'), null);
assert.equal(scene.game.events.entries.length, 0);
assert.equal(scene.input.entries.length, 0);
assert.equal(scene.events.entries.length, 0);
assert.equal(scene.game.input.keyboard.preventDefault, true, '归还单人模式的全局按键设置');
assert.equal(scene.input.keyboard.enabled, true);
run.close();

// Full tutorial driven by semantic keyboard commands through real Arcade steps.
run = coopRuntime(); ({ scene, key, tick, setKeys } = run); run.start();
const actor = (id) => scene.partners[id].actor;
function walk(id, target, keep = []) {
  const right = id === 'p1' ? 'KeyD' : 'ArrowRight', left = id === 'p1' ? 'KeyA' : 'ArrowLeft';
  for (let i = 0; i < 600 && scene.phase === 'playing'; i++) {
    const b = actor(id).arcadeBody, error = target - b.center.x;
    const direction = Math.abs(error) < 18 ? 0 : Math.sign(error);
    setKeys([...keep, ...(direction ? [direction > 0 ? right : left] : [])]); tick();
    if (!direction && Math.abs(b.velocity.x) < 3 && b.blocked.down) return;
  }
  assert.fail(`walk ${id} to ${target} stalled at ${actor(id).x}, phase ${scene.phase}`);
}
walk('p2', 550); walk('p1', actor('p2').arcadeBody.center.x);
setKeys(['ShiftRight']); tick(3); assert.equal(scene.lift.active, true);
setKeys(['ShiftRight', 'KeyW']); tick(55);
assert.equal(scene.lift.supported, true, `P1 should land on support: feet=${actor('p1').arcadeBody.bottom}`);
const supportedY = actor('p1').arcadeBody.bottom;
tick(90); assert.ok(Math.abs(actor('p1').arcadeBody.bottom - supportedY) < 0.01, '站立不抖动');
setKeys(['ShiftRight']); tick();
setKeys(['ShiftRight', 'KeyW', 'KeyD']); tick(25);
setKeys(['ShiftRight', 'KeyW']); tick(40);
assert.ok(Math.abs(actor('p1').arcadeBody.bottom - 268) < 1, '沿用普通跳速从托举点到高台');
walk('p1', 740, ['ShiftRight']); setKeys(['ShiftRight', 'KeyE']); tick(); setKeys([]); tick();
assert.equal(scene.rules.bridgeOpen, true); assert.equal(scene.terrain.get(COOP_BRIDGE.id).image.body.enable, true);
// Bubu can follow using the permanently opened bridge and two ordinary jumps.
setKeys(['ArrowUp']); tick(55); setKeys([]); tick();
assert.ok(Math.abs(actor('p2').arcadeBody.bottom - 372) < 1, '布布先上开桥平台');
setKeys(['ArrowUp', 'ArrowRight']); tick(25); setKeys(['ArrowUp']); tick(40); setKeys([]);
assert.ok(Math.abs(actor('p2').arcadeBody.bottom - 268) < 1, '布布无需被托举即可汇合');
walk('p1', 1160); walk('p2', 1290); tick(5);
assert.equal(scene.rules.gateOpen, true); assert.equal(scene.terrain.get(COOP_GATE.id).image.body.enable, false);
walk('p1', 1500); assert.equal(scene.rules.checkpointActive, false);
walk('p2', 1590); tick(3); assert.equal(scene.rules.checkpointActive, true);
assert.equal(scene.terrain.get(COOP_GATHER_GATE.id).image.body.enable, false);
const otherX = actor('p2').x;
setKeys(['KeyD']);
for (let i = 0; i < 180 && scene.partners.p1.life === 'normal'; i++) tick();
assert.equal(scene.partners.p1.life, 'respawning'); setKeys([]); tick(50);
assert.equal(scene.partners.p1.life, 'normal'); assert.ok(Math.abs(actor('p1').x - 1500) < 2);
assert.ok(Math.abs(actor('p2').x - otherX) < 1); assert.equal(scene.rules.bridgeOpen && scene.rules.gateOpen, true);
walk('p1', 1670); setKeys(['KeyW', 'KeyD']); tick(48); setKeys([]); tick(20);
assert.ok(actor('p1').x > 1840 && actor('p1').arcadeBody.blocked.down, '短坑可普通跳跃跨过');
walk('p1', 2030); assert.equal(scene.phase, 'playing', '一个人先到不结算');
walk('p2', 1670); setKeys(['ArrowUp', 'ArrowRight']); tick(48); setKeys([]); tick(20);
setKeys(['ArrowRight']);
for (let i = 0; i < 150 && scene.phase === 'playing'; i++) tick();
assert.equal(scene.phase, 'won'); assert.equal(scene.audio.sounds.filter((s) => s === 'win').length, 1);
tick(60); assert.equal(scene.audio.sounds.filter((s) => s === 'win').length, 1);
scene.navigate(true); scene.navigate(true); assert.equal(scene.calls.length, 1);
run.close();

// Physical lift boundaries use actual bodies, including release, side entry,
// insufficient headroom and removing either participant during support.
run = coopRuntime(); ({ scene, tick, setKeys } = run); run.start();
const p1 = scene.partners.p1.actor, p2 = scene.partners.p2.actor;
const settle = () => { setKeys([]); p1.resetAt(550, 442); p2.resetAt(550, 442); tick(12); };
settle(); setKeys(['ShiftRight']); tick(15);
assert.equal(scene.lift.active, true);
assert.equal(scene.lift.supported, false, '从布布下方或重叠位置不能吸附');
assert.ok(p1.arcadeBody.bottom > scene.lift.surface.body.top + 70);
setKeys(['ShiftRight', 'KeyW']); tick(55);
assert.equal(scene.lift.supported, true);
setKeys([]); tick(40);
assert.equal(scene.lift.active || scene.lift.supported, false);
assert.ok(Math.abs(p1.arcadeBody.bottom - 444) < 1, '松键后自然回到安全地面');
settle(); setKeys(['ShiftRight', 'KeyW']); tick(55);
setKeys(['ShiftRight', 'KeyD']); tick(25);
assert.equal(scene.lift.supported, false, '走出托举范围立即解除支撑');
setKeys([]); tick(40);
assert.ok(Math.abs(p1.arcadeBody.bottom - 444) < 1);
settle();
const ceiling = scene.addTerrain('test-ceiling', { x: 490, y: 290, width: 120, height: 20 }, false, false);
setKeys(['ShiftRight']); tick(5);
assert.equal(scene.lift.blockedAbove, true); assert.equal(scene.lift.active, false);
assert.ok(p1.arcadeBody.bottom > ceiling.rect.y + ceiling.rect.height);
ceiling.image.body.enable = false;
setKeys(['ShiftRight', 'KeyW']); tick(55);
assert.equal(scene.lift.supported, true);
const supportTop = scene.lift.surface.body.top;
setKeys(['ShiftRight']); tick(); setKeys(['ShiftRight', 'KeyW']); tick();
assert.equal(p1.arcadeBody.velocity.y, -590, '托举起跳只赋予一次原有跳速');
tick(8); setKeys(['ShiftRight']); tick(); setKeys(['ShiftRight', 'KeyW']); tick();
assert.ok(p1.arcadeBody.velocity.y > -590, '空中重复按跳不能叠加起跳速度');
assert.ok(p1.arcadeBody.bottom < supportTop);
settle(); setKeys(['ShiftRight', 'KeyW']); tick(55);
scene.fall(scene.partners.p2); assert.equal(scene.lift.active || scene.lift.supported, false);
setKeys([]); tick(65);
assert.equal(scene.partners.p2.life, 'normal'); assert.equal(p1.arcadeBody.enable, true);
assert.ok(Math.abs(p1.arcadeBody.bottom - 444) < 1, '托举者掉落不会卡住被托举者');
scene.fall(scene.partners.p1); scene.fall(scene.partners.p2); tick(65);
assert.equal(scene.partners.p1.life, 'normal'); assert.equal(scene.partners.p2.life, 'normal');
assert.ok(Math.abs(p1.x - p2.x) >= 85, '两人同时复活仍保持安全间距');
assert.equal(scene.rules.bridgeOpen || scene.rules.gateOpen || scene.rules.checkpointActive, false);
run.close();

// Ground separation blocks only outward travel and permits rejoining. Airborne
// momentum remains intact; a falling body cannot pull the camera down.
run = coopRuntime(); ({ scene, tick, setKeys } = run); run.start();
scene.partners.p1.actor.resetAt(800, 250); tick(25);
setKeys(['KeyD']); tick(20);
assert.ok(Math.abs(scene.partners.p1.actor.arcadeBody.velocity.x) < 1);
setKeys(['KeyA']); tick(15); assert.ok(scene.partners.p1.actor.arcadeBody.velocity.x < 0);
const airborne = scene.partners.p1.actor;
airborne.resetAt(800, 160); airborne.setVelocity(200, -100);
setKeys(['KeyD', 'KeyW']); tick(); assert.ok(airborne.arcadeBody.velocity.x > 150, '空中保留动量，容许正常阻力');
const camera = scene.cameras.main;
for (const [width, height] of [[800, 600], [1920, 1080], [2560, 1080], [640, 360]]) {
  scene.scale.width = width; scene.scale.height = height;
  scene.sharedCamera.update([120, 680], 10000);
  const base = Math.min(width / 960, height / 540);
  assert.ok(camera.zoom >= base * 0.72 && camera.zoom <= base);
  assert.equal(camera.y, 270);
  assert.equal(scene.overlay.root.parentElement.id, 'app', 'HUD 独立于世界镜头');
}
run.close();

// Render and fixed physics rates differ on real PCs. Support must stay stable
// when there are either two physics steps or no physics step per render frame.
for (const hz of [30, 120]) {
  run = coopRuntime(); ({ scene, setKeys } = run);
  const step = (seconds) => run.tick(Math.round(seconds * hz), 1000 / hz);
  setKeys(['KeyE', 'Enter']); step(0.1); setKeys([]); step(0.25);
  scene.partners.p1.actor.resetAt(550, 442); scene.partners.p2.actor.resetAt(550, 442); step(0.25);
  setKeys(['ShiftRight', 'KeyW']); step(1.2);
  assert.equal(scene.lift.supported, true, `${hz}Hz 托举接触`);
  const feet = scene.partners.p1.actor.arcadeBody.bottom;
  step(1.5);
  assert.ok(Math.abs(scene.partners.p1.actor.arcadeBody.bottom - feet) < 0.01, `${hz}Hz 托举站稳`);
  setKeys([]); step(1); assert.equal(scene.lift.supported || scene.lift.active, false);
  assert.ok(Math.abs(scene.partners.p1.actor.arcadeBody.bottom - 444) < 1, `${hz}Hz 松键安全落地`);
  run.close();
}
log('co-op: independent input, readiness, lift stability, complete tutorial, checkpoint/fall and one-shot finish passed using real Arcade CPU physics');
