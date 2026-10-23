import assert from 'node:assert/strict';
import { log } from 'node:console';
import { coopRuntime } from './helpers/coop-runtime.mjs';

// Actual Arcade fixed stepping: contact flags persist between render frames.
for (const hz of [60, 90, 120, 144, 240]) for (let phase = 0; phase < 4; phase++) {
  const run = coopRuntime(); run.start();
  const step = (frames) => run.tick(frames, 1000 / hz);
  step(phase + 1); run.setKeys(['KeyW', 'ArrowUp']); step(2);
  const jumps = () => run.scene.audio.sounds.filter((key) => key === 'jump').length;
  assert.equal(jumps(), 2, `${hz}Hz phase ${phase}: each player starts one jump`);
  run.setKeys([]); step(1); run.setKeys(['KeyW', 'ArrowUp']); step(2);
  assert.equal(jumps(), 2, `${hz}Hz phase ${phase}: airborne repress cannot jump again`);
  assert.ok(run.scene.partners.p1.actor.arcadeBody.velocity.y > -590);
  run.setKeys([]); step(hz);
  const landedJumps = jumps();
  assert.equal(run.scene.partners.p1.actor.arcadeBody.blocked.down, true);
  assert.equal(run.scene.partners.p2.actor.arcadeBody.blocked.down, true);
  run.setKeys(['KeyW', 'ArrowUp']); step(2);
  assert.equal(jumps(), landedJumps + 2, 'both players can jump again after actual landing');
  run.close();
}
// Explicitly retain coyote time and buffered landing with the shared controller.
const run = coopRuntime(); run.start();
const player = run.scene.partners.p1.actor, body = player.arcadeBody;
const command = (jumpPressed) => ({ moveX: 0, jumpPressed, jumpHeld: true });
player.clearJumpMemory(); body.setVelocityY(0); body.blocked.down = true;
player.applyCommand(1000, command(false)); body.blocked.down = body.touching.down = false;
assert.equal(player.applyCommand(1100, command(true)), true, '100ms off a ledge retains the 125ms coyote jump');
assert.equal(player.applyCommand(1108, command(true)), false, 'coyote jump is consumed once');
player.clearJumpMemory(); body.setVelocityY(30);
assert.equal(player.applyCommand(2000, command(true)), false, 'airborne press is buffered');
body.blocked.down = true; body.setVelocityY(0);
assert.equal(player.applyCommand(2100, command(false)), true, 'landing within 135ms consumes buffered jump');
run.close();
log('jump: real Arcade 60/90/120/144/240Hz and step phases, normal landing, coyote and buffer preserved');
