import assert from 'node:assert/strict';
import { log } from 'node:console';
import { JSDOM } from 'jsdom';
import { runtime } from './helpers/runtime.mjs';

const dom = new JSDOM('<div id="app"></div><input>', { pretendToBeVisual: true });
const { window } = dom;
const load = runtime({ window, document: window.document, Element: window.Element });
const { CoopKeyboard } = load('src/systems/CoopKeyboard.ts');
const { isMobileDevice, showDesktopRequired } = load('src/systems/DesktopGate.ts');
let focus = true, playing = true, pauses = 0, blurred = 0;
const bindings = [];
for (const host of [window, window.document]) {
  const add = host.addEventListener.bind(host), remove = host.removeEventListener.bind(host);
  host.addEventListener = (type, listener, options) => {
    if (['keydown', 'keyup', 'blur', 'focusin', 'visibilitychange'].includes(type)) bindings.push({ host, type, listener });
    add(type, listener, options);
  };
  host.removeEventListener = (type, listener, options) => {
    const index = bindings.findIndex((b) => b.host === host && b.type === type && b.listener === listener);
    if (index !== -1) bindings.splice(index, 1);
    remove(type, listener, options);
  };
}
const key = (code, down = true, extra = {}, target = window) => {
  const event = new window.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event); return event;
};
for (let cycle = 0; cycle < 4; cycle++) {
  const previousBindings = bindings.length;
  const input = new CoopKeyboard(window, () => focus, () => playing, () => pauses++, () => blurred++);
  const owned = bindings.slice(previousBindings);
  key('KeyD'); key('ArrowLeft'); key('KeyW'); key('ArrowUp'); key('KeyE'); key('Enter');
  const first = input.read('p1'), second = input.read('p2');
  assert.equal(first.moveX, 1); assert.equal(second.moveX, -1);
  assert.equal(first.jumpPressed && second.jumpPressed && first.interactPressed && second.interactPressed, true);
  assert.equal(input.read('p1').jumpPressed, false);
  assert.equal(input.read('p2').interactPressed, false);
  key('KeyW', true, { repeat: true }); assert.equal(input.read('p1').jumpPressed, false);
  key('KeyW', false); assert.equal(input.read('p1').jumpReleased, true);
  assert.equal(input.read('p1').jumpReleased, false);
  key('ShiftLeft'); assert.equal(input.read('p2').skillHeld, false);
  key('ShiftRight'); assert.equal(input.read('p2').skillPressed, true);
  assert.equal(input.read('p2').skillHeld, true);
  key('KeyF'); assert.equal(input.read('p1').skillPressed, true);
  input.reset('p1'); assert.equal(input.read('p1').moveX, 0);
  assert.equal(input.read('p2').moveX, -1, '单人复活只清除自己的输入');
  input.reset(); assert.equal(input.read('p2').moveX, 0);
  key('KeyD', true, { repeat: true }); assert.equal(input.read('p1').moveX, 0);
  key('KeyD', false); key('KeyD'); assert.equal(input.read('p1').moveX, 1);
  window.dispatchEvent(new window.Event('blur')); assert.equal(input.read('p1').moveX, 0);
  // Release can occur while the window is unfocused, so no keyup arrives.
  key('KeyD', true, { repeat: true }); assert.equal(input.read('p1').moveX, 0);
  key('KeyD'); assert.equal(input.read('p1').moveX, 1, '失焦期间遗漏 keyup 后，新的按键仍然可用');
  focus = false; assert.equal(key('ArrowRight').defaultPrevented, false);
  focus = true;
  assert.equal(key('ArrowRight', true, {}, window.document.querySelector('input')).defaultPrevented, false);
  assert.equal(key('ArrowRight', true, { ctrlKey: true }).defaultPrevented, false);
  playing = false; input.reset(); assert.equal(key('KeyW').defaultPrevented, false);
  assert.equal(input.read('p1').jumpPressed, false);
  playing = true; key('KeyW', true, { repeat: true }); assert.equal(input.read('p1').jumpPressed, false);
  key('Escape'); key('Escape', true, { repeat: true }); assert.equal(pauses, cycle + 1);
  input.destroy(); input.destroy(); assert.ok(owned.every((binding) => !bindings.includes(binding)), '销毁本次注册的全部输入监听');
  const previous = blurred;
  window.dispatchEvent(new window.Event('blur')); key('Escape', false); key('Escape');
  assert.equal(blurred, previous); assert.equal(pauses, cycle + 1, '销毁后的旧输入不再响应');
}
const device = (userAgent, platform, maxTouchPoints, mobile) => isMobileDevice({ userAgent, platform, maxTouchPoints, mobile });
assert.equal(device('Mozilla iPhone Mobile', 'iPhone', 5), true);
assert.equal(device('Mozilla Android', 'Linux armv8l', 5), true);
assert.equal(device('Mozilla Macintosh Safari', 'MacIntel', 5), true, 'iPad 桌面 UA 仍属于移动设备');
assert.equal(device('Mozilla Windows NT 10.0 Chrome', 'Win32', 10), false, '触屏 Windows PC 不被误拒绝');
assert.equal(device('Mozilla Macintosh Safari', 'MacIntel', 0), false);
assert.equal(device('desktop UA', 'Win32', 0, true), true);
window.innerWidth = 360;
assert.equal(device('Mozilla Windows NT 10.0 Chrome', 'Win32', 0), false, 'PC 小窗口不依赖宽度判定');
showDesktopRequired(window.document.querySelector('#app'));
assert.match(window.document.querySelector('#app').textContent, /当前版本仅支持电脑，请使用电脑浏览器并连接键盘游玩。/);
window.close();
log('co-op input/device: independent key edges, focus/pause recovery, disposal and desktop-only gate passed');
