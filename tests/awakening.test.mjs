import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { log } from 'node:console';
import { runtime } from './helpers/runtime.mjs';
const load = runtime();
const { parseCustomMap, newMap } = load('src/systems/CustomMap.ts');
const { AwakeningController, budPosition } = load('src/systems/AwakeningController.ts');
const { snapObjectToGrid } = load('src/systems/ObjectGeometry.ts');
const { awakeningDemo } = load('src/levels/awakeningDemo.ts');
const json = JSON.parse(readFileSync('maps/starlight-awakening-30s.json', 'utf8'));
const demoLayout = JSON.parse(JSON.stringify(awakeningDemo)); demoLayout.id = 'custom';
assert.deepEqual(json.level, demoLayout, '导入样例与内置体验关完整布局一致');
const map = parseCustomMap(json);
assert.equal(map.level.platforms.filter((p) => p.awakening).length, 3);
assert.equal(map.level.awakeningGoal, true);
assert.deepEqual(JSON.parse(JSON.stringify(map.level.platforms.map((p) => p.awakening))), JSON.parse(JSON.stringify(awakeningDemo.platforms.map((p) => p.awakening))));
assert.deepEqual(JSON.parse(JSON.stringify(map)), JSON.parse(JSON.stringify(parseCustomMap(map))), '新字段与稳定编号导入导出不变');
const state = new AwakeningController(map.level.platforms, true);
const ids = map.level.platforms.filter((p) => p.awakening).map((p) => p.id);
assert.equal(state.summary.goalLocked, true);
assert.equal(state.state(ids[0], 0).active, false);
assert.equal(state.activate('unknown', 10), false);
assert.equal(state.activate(ids[0], NaN), false);
assert.equal(state.activate(ids[0], 0), true);
assert.equal(state.state(ids[0], 6500).remaining, 1500);
assert.equal(state.state(ids[0], 7999).active, true);
assert.equal(state.state(ids[0], 8000).active, false);
assert.equal(state.summary.lit, 1, '休眠不撤销已点亮一次的计数');
state.activate(ids[0], 9000); state.activate(ids[0], 9500);
assert.equal(state.state(ids[0], 10000).remaining, 7500, '再次命中续时');
state.activate(ids[1], 10000); state.activate(ids[2], 10000);
assert.equal(state.summary.goalLocked, false); assert.equal(state.summary.lit, 3);
assert.equal(state.state(ids[0], 10000).remaining, 7500, '暂停不推进模拟时间则平台不失效');
assert.equal(new AwakeningController(map.level.platforms, false).summary.goalLocked, false);
const point = budPosition(map.level.platforms[1]); assert.equal(point.x, 624); assert.equal(point.y, 400);
const snapped = snapObjectToGrid('platform', { ...map.level.platforms[1], x: 0, y: 0 }, map.level.width);
assert.equal(snapped.x % 16, 0); assert.equal(snapped.y % 16, 0); assert.ok(budPosition(snapped).y >= 24);
for (const change of [
  (m) => { m.level.platforms[1].awakening.durationMs = 0; },
  (m) => { m.level.platforms[1].awakening.budOffsetX = Infinity; },
  (m) => { m.level.platforms[1].awakening.budOffsetY = -1000; },
  (m) => { m.level.platforms[1].kind = 'ground'; },
  (m) => { m.level.awakeningGoal = 'true'; },
  (m) => { m.level.platforms = [m.level.platforms[0]]; },
  (m) => { m.level.spawn = { x: 640, y: 400 }; },
  (m) => { m.level.flag = { x: 640, y: 320, width: 32, height: 112 }; },
]) { const candidate = globalThis.structuredClone(json); change(candidate); assert.throws(() => parseCustomMap(candidate)); }
const excessive = newMap(); excessive.level.platforms.push(...Array.from({ length: 21 }, (_, i) => ({
  id: `bloom-${i}`, x: 100, y: 300, width: 160, height: 32, kind: 'platform', awakening: { budOffsetX: 16, budOffsetY: -32, durationMs: 8000 },
})));
assert.throws(() => parseCustomMap(excessive), /20/);
const legacy = newMap(); assert.equal(parseCustomMap(legacy).level.awakeningGoal, undefined);
log('awakening: lifecycle, expiry, renewal, goal, map validation, roundtrip and grid passed');
