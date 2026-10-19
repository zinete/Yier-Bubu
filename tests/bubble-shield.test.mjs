import assert from 'node:assert/strict';
import { log } from 'node:console';
import { runtime } from './helpers/runtime.mjs';
const load = runtime();
const { BubbleShield, SHIELD } = load('src/systems/BubbleShield.ts');
const { computeUILayout } = load('src/systems/UILayout.ts');
const shield = new BubbleShield();
assert.equal(shield.state(0).ready, true);
assert.equal(shield.absorb(0), false);
assert.equal(shield.activate(0), true);
assert.equal(shield.activate(1), false);
assert.equal(shield.state(SHIELD.DURATION - 1).active, true);
assert.equal(shield.state(SHIELD.DURATION).active, false);
assert.equal(shield.absorb(SHIELD.DURATION), false);
assert.equal(shield.state(SHIELD.COOLDOWN - 1).ready, false);
assert.equal(shield.activate(SHIELD.COOLDOWN), true);
assert.equal(shield.absorb(SHIELD.COOLDOWN + 100), true);
assert.equal(shield.absorb(SHIELD.COOLDOWN + 100), false);
assert.equal(shield.blocksFollowup(SHIELD.COOLDOWN + 100 + SHIELD.HIT_GRACE - 1), true);
assert.equal(shield.blocksFollowup(SHIELD.COOLDOWN + 100 + SHIELD.HIT_GRACE), false);
shield.cancel();
assert.equal(shield.blocksFollowup(SHIELD.COOLDOWN + 101), false);
assert.equal(shield.state(SHIELD.COOLDOWN + 101).ready, false, '复位取消护盾但不退还冷却');
for (const [width, height] of [[568, 320], [667, 375], [844, 390], [960, 540], [1920, 1080], [390, 844]]) {
  const layout = computeUILayout(width, height);
  for (const action of ['jump', 'attack', 'shield']) {
    const box = layout[action];
    assert.ok(box.size >= 44, `${width}×${height} ${action} 最小触控尺寸`);
    assert.ok(box.x - box.size / 2 >= 0 && box.x + box.size / 2 <= width);
    assert.ok(box.y - box.size / 2 >= 0 && box.y + box.size / 2 <= height);
  }
  const a = layout.shield;
  for (const other of ['jump', 'attack']) {
    const b = layout[other];
    assert.ok(Math.abs(a.x - b.x) >= (a.size + b.size) / 2 || Math.abs(a.y - b.y) >= (a.size + b.size) / 2, '矩形点击区不重叠');
  }
}
log('bubble shield: expiry, single absorption, contact grace, cooldown and touch layout boundaries passed');
