import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime } from './helpers/runtime.mjs';
import { coopRuntime } from './helpers/coop-runtime.mjs';

const load = runtime();
const { CoopRules, canCatchLift, interactionTarget, outwardLimit, coopCameraPlan } = load('src/systems/CoopRules.ts');
const { COOP_LIFT } = load('src/config/coopLift.ts');
const { NORMAL_JUMP_HEIGHT, MIN_LIFT_START_GAIN, COOP_HIGH_RISE, COOP_BRIDGE, COOP_GATE, COOP_GATHER_GATE } = load('src/levels/coopTutorial.ts');
assert.ok(NORMAL_JUMP_HEIGHT > 119 && NORMAL_JUMP_HEIGHT < 121);
assert.ok(COOP_HIGH_RISE > NORMAL_JUMP_HEIGHT, '高台必须让地面普通跳无法通过');
assert.ok(COOP_HIGH_RISE < NORMAL_JUMP_HEIGHT + MIN_LIFT_START_GAIN, '高台应由头顶起跳位置而非强化跳速通过');
const rider = { x: 500, y: 270, width: 74, height: 83, previousBottom: 354, velocityY: 180 };
const support = { x: 510, y: 356, width: 56, height: 8 };
assert.equal(canCatchLift(rider, support, []), true);
assert.equal(canCatchLift({ ...rider, velocityY: -10 }, support, []), false);
assert.equal(canCatchLift({ ...rider, velocityY: 900 }, support, [], { maxFallSpeed: 780 }), false, '高速坠落不强制吸附');
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
const keysFor = {
  p1: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', skill: 'KeyF' },
  p2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', skill: 'ShiftRight' },
};
function walk(id, target, keep = []) {
  const { right, left } = keysFor[id];
  for (let i = 0; i < 600 && scene.phase === 'playing'; i++) {
    const b = actor(id).arcadeBody, error = target - b.center.x;
    const direction = Math.abs(error) < 18 ? 0 : Math.sign(error);
    setKeys([...keep, ...(direction ? [direction > 0 ? right : left] : [])]); tick();
    if (!direction && Math.abs(b.velocity.x) < 3 && b.blocked.down) return;
  }
  assert.fail(`walk ${id} to ${target} stalled at ${actor(id).x}, phase ${scene.phase}`);
}
walk('p2', 550); walk('p1', actor('p2').arcadeBody.center.x);
setKeys(['ShiftRight']); tick(); assert.equal(scene.lift.active, true);
assert.equal(scene.lift.stateOf('p2'), 'LIFT_READY');
assert.equal(actor('p2').actionAnimationKey, 'bubu-lift');
assert.equal(actor('p1').actionAnimationKey, null);
setKeys(['ShiftRight', 'KeyW']);
for (let i = 0; i < 100 && !scene.lift.supported; i++) tick();
assert.equal(scene.lift.supported, true, `P1 should land on support: feet=${actor('p1').arcadeBody.bottom}`);
assert.equal(scene.lift.carrierId, 'p2'); assert.equal(scene.lift.riderId, 'p1');
assert.equal(actor('p1').actionAnimationKey, 'yier-idle');
assert.equal(actor('p2').actionAnimationKey, 'bubu-lift');
const supportedY = actor('p1').arcadeBody.bottom;
const supportedBody = [actor('p1').arcadeBody.width, actor('p1').arcadeBody.height,
  actor('p1').arcadeBody.offset.x, actor('p1').arcadeBody.offset.y];
setKeys(['ShiftRight']);
tick(90); assert.ok(Math.abs(actor('p1').arcadeBody.bottom - supportedY) < 0.01, '站立不抖动');
assert.deepEqual([actor('p1').arcadeBody.width, actor('p1').arcadeBody.height,
  actor('p1').arcadeBody.offset.x, actor('p1').arcadeBody.offset.y], supportedBody, '动作帧不改变碰撞框');
setKeys(['ShiftRight', 'KeyW', 'KeyD']); tick();
assert.equal(scene.lift.stateOf('p1'), 'BOOST_JUMP');
assert.equal(scene.lift.stateOf('p2'), 'LIFT_READY');
assert.ok(Math.abs(actor('p1').arcadeBody.velocity.y - scene.lift.boostJumpVelocity) < 0.01);
assert.equal(actor('p1').actionAnimationKey, null);
assert.equal(actor('p2').actionAnimationKey, 'bubu-lift');
tick(24);
setKeys([]);
for (let i = 0; i < 120 && !actor('p1').arcadeBody.blocked.down; i++) tick();
assert.ok(Math.abs(actor('p1').arcadeBody.bottom - 268) < 1, '借力跳从托举点到达高台');
walk('p1', 740); setKeys(['KeyE']); tick(); setKeys([]); tick();
assert.equal(scene.rules.bridgeOpen, true); assert.equal(scene.terrain.get(COOP_BRIDGE.id).image.body.enable, true);
// Bubu can follow using the permanently opened bridge and two ordinary jumps.
assert.equal(scene.lift.stateOf('p2'), 'NORMAL', '松开托举键后恢复普通跳跃');
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

// The same state machine must work in both directions. These cases use real
// Arcade bodies and exercise hold, release, catch, follow, boost and cleanup.
run = coopRuntime(); ({ scene, key, tick, setKeys } = run); run.start();
const pair = (carrierId) => ({ carrierId, riderId: carrierId === 'p1' ? 'p2' : 'p1' });
const settlePair = (x = 550) => {
  setKeys([]); scene.lift.reset(); scene.liftAnimator.update();
  actor('p1').resetAt(x, 442); actor('p2').resetAt(x, 442); tick(12);
};
function catchRider(carrierId, x = 240) {
  const { riderId } = pair(carrierId);
  settlePair(x); setKeys([keysFor[carrierId].skill]); tick();
  assert.equal(scene.lift.stateOf(carrierId), 'LIFT_READY');
  setKeys([keysFor[carrierId].skill, keysFor[riderId].jump]);
  for (let i = 0; i < 110 && !scene.lift.supported; i++) tick();
  assert.equal(scene.lift.carrierId, carrierId, `${carrierId} 可以托举 ${riderId}`);
  assert.equal(scene.lift.riderId, riderId);
  setKeys([keysFor[carrierId].skill]); tick();
  return { carrierId, riderId, carrier: actor(carrierId), rider: actor(riderId) };
}

for (const carrierId of ['p1', 'p2']) {
  const { riderId } = pair(carrierId), skill = keysFor[carrierId].skill;
  settlePair();
  key(skill, true); tick();
  assert.equal(scene.lift.stateOf(carrierId), 'LIFT_READY');
  assert.equal(actor(carrierId).actionAnimationKey, `${actor(carrierId).characterId}-lift`);
  key(skill, true, true); tick();
  assert.equal(scene.lift.stateOf(carrierId), 'LIFT_READY', '长按 repeat 不影响托举准备');
  setKeys([skill, keysFor[carrierId].jump]); tick(6);
  assert.ok(actor(carrierId).arcadeBody.velocity.y >= 0, '托举准备期间禁止普通跳跃');
  setKeys([]); tick();
  assert.equal(scene.lift.stateOf(carrierId), 'LIFT_CANCEL');
  assert.equal(actor(carrierId).actionAnimationKey, null);
  tick(14); assert.equal(scene.lift.stateOf(carrierId), 'NORMAL');

  const relation = catchRider(carrierId);
  const originalBody = [relation.rider.arcadeBody.width, relation.rider.arcadeBody.height,
    relation.rider.arcadeBody.offset.x, relation.rider.arcadeBody.offset.y];
  const initialOffset = relation.rider.arcadeBody.center.x - relation.carrier.arcadeBody.center.x;
  setKeys([skill, keysFor[carrierId].right]); tick(70);
  assert.equal(scene.lift.stateOf(carrierId), 'CARRYING');
  assert.equal(scene.lift.stateOf(riderId), 'RIDING');
  assert.ok(relation.carrier.arcadeBody.velocity.x > 0, '托举者仍可跟随移动');
  assert.ok(relation.carrier.arcadeBody.velocity.x <= 300 * COOP_LIFT.carryingSpeedScale + 0.01, '托举移动有稳定速度上限');
  assert.ok(Math.abs(relation.rider.arcadeBody.center.x - relation.carrier.arcadeBody.center.x - initialOffset) < 0.01, '乘坐者水平稳定跟随');
  assert.ok(Math.abs(relation.rider.arcadeBody.bottom - (relation.carrier.arcadeBody.top - COOP_LIFT.headGap)) < 0.01, '脚底与头顶间距稳定');
  assert.deepEqual([relation.rider.arcadeBody.width, relation.rider.arcadeBody.height,
    relation.rider.arcadeBody.offset.x, relation.rider.arcadeBody.offset.y], originalBody, '托举动画和同步不改变碰撞框');
  setKeys([]); tick();
  assert.equal(scene.lift.relation, null); assert.equal(scene.lift.stateOf(carrierId), 'LIFT_CANCEL');
  assert.equal(relation.rider.arcadeBody.enable, true, '取消托举恢复乘坐者物理体');
  tick(35); assert.ok(Math.abs(relation.rider.arcadeBody.bottom - 444) < 1, '取消后安全落地');

  const boosted = catchRider(carrierId);
  const jumpsBefore = scene.audio.sounds.filter((sound) => sound === 'jump').length;
  key(keysFor[riderId].jump, true); tick();
  assert.equal(scene.lift.relation, null); assert.equal(scene.lift.stateOf(carrierId), 'LIFT_READY');
  assert.equal(scene.lift.stateOf(riderId), 'BOOST_JUMP');
  assert.equal(scene.lift.boostJumpVelocity, -590, '借力不强化个人跳速，只提高起跳位置');
  assert.ok(Math.abs(boosted.rider.arcadeBody.velocity.y - scene.lift.boostJumpVelocity) < 0.01, '头顶起跳仅施加一次原有跳速');
  assert.equal(scene.audio.sounds.filter((sound) => sound === 'jump').length, jumpsBefore + 1);
  key(keysFor[riderId].jump, false); tick(8);
  const fallingAwayFromImpulse = boosted.rider.arcadeBody.velocity.y;
  key(keysFor[riderId].jump, true); tick();
  assert.ok(boosted.rider.arcadeBody.velocity.y > scene.lift.boostJumpVelocity, '空中重复按跳不能叠加借力速度');
  assert.ok(boosted.rider.arcadeBody.velocity.y >= fallingAwayFromImpulse - 40, '重复按键没有第二次向上冲量');
  key(keysFor[riderId].jump, false); tick(40);

  const fallingCarrier = catchRider(carrierId);
  scene.fall(scene.partners[carrierId]);
  assert.equal(scene.lift.relation, null); assert.equal(scene.lift.stateOf(riderId), 'NORMAL');
  assert.equal(fallingCarrier.rider.arcadeBody.enable, true, '托举者掉落立即归还乘坐者物理体');
  assert.equal(fallingCarrier.rider.actionAnimationKey, null);
  tick(65); assert.equal(scene.partners[carrierId].life, 'normal');

  const fallingRider = catchRider(carrierId);
  scene.fall(scene.partners[riderId]);
  assert.equal(scene.lift.relation, null); assert.equal(scene.lift.stateOf(carrierId), 'NORMAL');
  assert.equal(fallingRider.carrier.actionAnimationKey, null);
  tick(65); assert.equal(scene.partners[riderId].life, 'normal');

  catchRider(carrierId); scene.togglePause();
  assert.equal(scene.phase, 'paused'); assert.equal(scene.lift.relation, null);
  assert.equal(scene.lift.stateOf('p1'), 'NORMAL'); assert.equal(scene.lift.stateOf('p2'), 'NORMAL');
  assert.equal(actor(riderId).arcadeBody.enable, true, '暂停清理乘坐状态');
  scene.togglePause(); tick();
}

settlePair(); setKeys(['KeyF', 'ShiftRight']); tick();
assert.equal(scene.lift.stateOf('p1'), 'LIFT_READY'); assert.equal(scene.lift.stateOf('p2'), 'LIFT_READY');
assert.equal(scene.lift.relation, null, '双方同时准备不会形成循环引用');
setKeys([]); tick();
assert.equal(scene.lift.stateOf('p1'), 'LIFT_CANCEL'); assert.equal(scene.lift.stateOf('p2'), 'LIFT_CANCEL');
scene.lift.reset(); scene.liftAnimator.update();

settlePair();
const ceiling = scene.addTerrain('test-ceiling', { x: 490, y: 290, width: 120, height: 20 }, false, false);
setKeys(['ShiftRight']); tick(); assert.equal(scene.lift.blockedFor('p2'), true);
setKeys(['ShiftRight', 'KeyW']); tick(70); setKeys([]);
assert.equal(scene.lift.relation, null, '头顶空间不足不能把队友抬进地形');
ceiling.image.body.enable = false;
scene.fall(scene.partners.p1); scene.fall(scene.partners.p2); tick(65);
assert.equal(scene.partners.p1.life, 'normal'); assert.equal(scene.partners.p2.life, 'normal');
assert.ok(Math.abs(actor('p1').x - actor('p2').x) >= 85, '两人同时复活仍保持安全间距');
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
scene.scale.width = 1920; scene.scale.height = 1080;
scene.sharedCamera.update([120, 680], 10000);
scene.scale.width = 640; scene.scale.height = 360;
scene.sharedCamera.update([120, 680], 1000 / 60);
assert.ok(camera.zoom <= 640 / 960, '缩窗首帧立即换算基础缩放');
const halfView = 640 / camera.zoom / 2;
assert.ok(camera.x - halfView <= 120 && camera.x + halfView >= 680, '缩窗过渡首帧仍容纳双人');
const preferences = run.load('src/systems/EffectPreferences.ts');
preferences.setEffectPreferences({ quality: 'auto', reducedMotion: true });
scene.sharedCamera.update([120, 220], 1000 / 60);
const reducedZoom = camera.zoom;
scene.sharedCamera.update([120, 680], 1000 / 60);
assert.equal(camera.zoom, reducedZoom, '减少动态模式不随双人距离反复缩放');
preferences.setEffectPreferences({ quality: 'auto', reducedMotion: false });
for (const [width, height] of [[800, 600], [1920, 1080], [2560, 1080], [640, 360]]) {
  scene.scale.width = width; scene.scale.height = height;
  scene.sharedCamera.update([120, 680], 10000);
  const base = Math.min(width / 960, height / 540);
  assert.ok(camera.zoom >= base * 0.72 && camera.zoom <= base);
  assert.equal(camera.y, 270);
  assert.equal(scene.overlay.root.parentElement.id, 'app', 'HUD 独立于世界镜头');
}
run.close();

// Arcade's fixed step produces zero, one or multiple physics steps per render
// frame at these rates. Both directions must remain attached while moving.
for (const hz of [30, 60, 120]) for (const carrierId of ['p1', 'p2']) {
  run = coopRuntime(); ({ scene, key, setKeys } = run);
  const step = (seconds) => run.tick(Math.max(1, Math.round(seconds * hz)), 1000 / hz);
  setKeys(['KeyE', 'Enter']); step(0.1); setKeys([]); step(0.25);
  const riderId = carrierId === 'p1' ? 'p2' : 'p1';
  const carrierKeys = keysFor[carrierId], riderKeys = keysFor[riderId];
  scene.partners.p1.actor.resetAt(550, 442); scene.partners.p2.actor.resetAt(550, 442); step(0.25);
  key(carrierKeys.skill, true); step(0.04);
  assert.equal(scene.lift.stateOf(carrierId), 'LIFT_READY', `${hz}Hz ${carrierId} 按住进入准备`);
  key(riderKeys.jump, true);
  for (let i = 0; i < Math.ceil(hz * 1.5) && !scene.lift.supported; i++) step(1 / hz);
  assert.equal(scene.lift.carrierId, carrierId, `${hz}Hz ${carrierId} 双向托举接触`);
  key(riderKeys.jump, false); step(0.05);
  setKeys([carrierKeys.skill, carrierKeys.right]); step(1.5);
  const carrier = scene.partners[carrierId].actor.arcadeBody;
  const riderBody = scene.partners[riderId].actor.arcadeBody;
  assert.equal(scene.lift.supported, true, `${hz}Hz 移动中保持托举`);
  assert.ok(Math.abs(riderBody.center.x - carrier.center.x) < 0.01, `${hz}Hz 水平跟随无漂移`);
  assert.ok(Math.abs(riderBody.bottom - (carrier.top - COOP_LIFT.headGap)) < 0.01, `${hz}Hz 头顶间距无抖动`);
  setKeys([carrierKeys.skill]); key(riderKeys.jump, true); step(1 / hz);
  assert.equal(scene.lift.stateOf(riderId), 'BOOST_JUMP', `${hz}Hz 借力跳只消费新按下沿`);
  assert.equal(scene.lift.relation, null);
  assert.ok(Math.abs(scene.partners[riderId].actor.arcadeBody.velocity.y - (-590)) < 0.01, `${hz}Hz 头顶起跳保持普通跳速`);
  setKeys([]); step(0.8);
  run.close();
}
log('co-op: bidirectional hold/release/catch/follow/boost, cleanup, complete tutorial and frame-rate stability passed using real Arcade CPU physics');
