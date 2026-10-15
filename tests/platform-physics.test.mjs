import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('src/systems/PlatformPhysics.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { canLandOnPlatform } = module.exports;
assert.equal(canLandOnPlatform(-400, 380, 330), false, '从平台下方向上跳时穿透');
assert.equal(canLandOnPlatform(-40, 329, 330), false, '上升过程中不被台面提前挡住');
assert.equal(canLandOnPlatform(150, 325, 330), true, '从上方下落时落在台面');
assert.equal(canLandOnPlatform(0, 330, 330), true, '静止站立时保留承接');
assert.equal(canLandOnPlatform(200, 360, 330), false, '从侧面或下方进入不会吸附到平台顶部');
assert.equal(canLandOnPlatform(100, 332, 330), true, '容忍微小物理误差');
// 使用项目安装的真实 Phaser 碰撞分离函数核对碰撞面的方向。
const require = createRequire(import.meta.url);
const overlapY = require('phaser/src/physics/arcade/GetOverlapY.js');
const physics = require('phaser/src/physics/arcade/const.js');
const body = (y, height, dy, isStatic = false) => ({
  y, bottom: y + height, _dy: dy, deltaAbsY: () => Math.abs(dy),
  physicsType: isStatic ? physics.STATIC_BODY : physics.DYNAMIC_BODY,
  touching: { none: true, up: false, down: false }, blocked: { none: true, up: false, down: false },
  checkCollision: { up: true, down: !isStatic, left: !isStatic, right: !isStatic },
});
const rising = body(350, 30, -10);
assert.equal(overlapY(rising, body(330, 32, 0, true), false, 4), 0, '真实引擎允许从浮台底部跳穿');
const falling = body(303, 30, 8);
assert.equal(overlapY(falling, body(330, 32, 0, true), false, 4), 3);
assert.equal(falling.blocked.down, true, '真实引擎承接下落角色并设置站立状态');
