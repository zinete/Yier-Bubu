import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, require = () => ({}), globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require, ...globals });
  return module.exports;
}
const maps = load('src/systems/CustomMap.ts');
const geometry = load('src/systems/ObjectGeometry.ts');
const builtins = maps.BUILTIN_ASSET_IDS.map((id) => ({ id }));
const { EditorScene } = load('src/scenes/EditorScene.ts', (name) => {
  if (name === 'phaser') return { default: { Scene: class {} } };
  if (name.endsWith('/CustomMap')) return maps;
  if (name.endsWith('/ObjectGeometry')) return geometry;
  if (name.endsWith('/DefaultAssets')) return { mapAssets: (map) => [...builtins, ...(map.assets ?? [])] };
  return {};
}, { structuredClone: globalThis.structuredClone, cancelAnimationFrame() {} });
const canvasTarget = { closest: () => null };
function key(scene, key, options = {}) {
  const event = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false,
    target: canvasTarget, prevented: false, preventDefault() { this.prevented = true; }, ...options };
  scene.handleKeyDown(event); return event;
}
function array(scene, kind) {
  return kind === 'platform' ? scene.map.level.platforms : kind === 'coin' ? scene.map.level.coins
    : kind === 'enemy' ? scene.map.level.enemies : scene.map.decorations;
}
function setup(kind = 'platform') {
  const scene = Object.create(EditorScene.prototype);
  const buttons = Object.fromEntries(['copy', 'paste', 'delete', 'duplicate'].map((action) => [action, {}]));
  const svg = { focus() { scene.focused = true; }, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 540 }) };
  Object.assign(scene, { map: maps.newMap(), tool: 'select', undo: [], redo: [], objectSerial: 0,
    root: { isConnected: true, querySelector: (selector) => selector === 'svg' ? svg : buttons[selector.match(/data-action="([^"]+)"/)?.[1]] },
    render() { this.renderClipboardControls(); }, message(text) { this.lastMessage = text; },
  });
  const p = { x: 320, y: 176, assetId: 'builtin-moss-platform' };
  if (kind === 'platform') scene.map.level.platforms.push({ ...p, id: 'source-p', width: 160, height: 32, kind: 'platform' });
  else if (kind === 'coin') scene.map.level.coins = [{ ...p, assetId: 'builtin-gold-star' }];
  else if (kind === 'enemy') scene.map.level.enemies = [{ ...p, min: 240, max: 400, speed: 70, assetId: 'builtin-leaf-slime',
    attack: { range: 340, cooldown: 1600, projectileSpeed: 440, projectileArc: -120, projectileGravity: 700, projectileLifetime: 1450 } }];
  else if (kind === 'decoration') scene.map.decorations = [{ ...p, width: 96, height: 48, assetId: 'builtin-flower-bush', layer: 'front', solid: false }];
  else scene.map.level[kind] = { ...scene.map.level[kind], x: 320, y: 176 };
  const index = kind === 'platform' ? 1 : 0;
  const target = { closest: (selector) => selector === '[data-resize]' ? null
    : { getAttribute: (name) => name === 'data-object' ? kind : String(index) } };
  scene.pointerDown({ button: 0, clientX: 325, clientY: 180, target, pointerId: 1 });
  scene.endDrag();
  assert.equal(scene.focused, true, '点击选中后画布应主动获得键盘焦点');
  return { scene, buttons };
}
for (const kind of ['platform', 'coin', 'enemy', 'decoration']) {
  const { scene, buttons } = setup(kind);
  assert.equal(buttons.copy.disabled, false);
  assert.equal(buttons.paste.disabled, true);
  const original = scene.object();
  const originalValue = JSON.parse(JSON.stringify(original));
  const beforeCopy = JSON.stringify(scene.map);
  assert.equal(key(scene, 'c', { ctrlKey: true }).prevented, true);
  assert.equal(JSON.stringify(scene.map), beforeCopy, '复制不能移动/修改原对象');
  assert.equal(scene.undo.length, 0, '复制不应创建撤销记录');
  assert.equal(buttons.paste.disabled, false);
  original.x += 16;
  if (kind === 'enemy') original.attack.cooldown += 100;
  const count = array(scene, kind).length;
  assert.equal(key(scene, 'v', { ctrlKey: true }).prevented, true);
  assert.equal(array(scene, kind).length, count + 1);
  assert.equal(scene.tool, 'select');
  const pasted = scene.object();
  assert.equal(pasted.x, originalValue.x + 32, '粘贴基于复制时快照，而非后来修改的源对象');
  assert.equal(pasted.y, originalValue.y + 16);
  assert.equal(pasted.assetId, originalValue.assetId);
  assert.equal(scene.undo.length, 1);
  if (kind === 'platform') assert.notEqual(pasted.id, originalValue.id);
  if (kind === 'enemy') {
    assert.equal(pasted.min, originalValue.min + 32);
    assert.equal(pasted.max, originalValue.max + 32);
    assert.equal(pasted.attack.cooldown, originalValue.attack.cooldown);
    assert.notEqual(pasted.attack, scene.clipboard.value.attack, '嵌套攻击配置也需深拷贝');
  }
  if (kind === 'decoration') { assert.equal(pasted.layer, 'front'); assert.equal(pasted.solid, false); }
  key(scene, 'Delete');
  assert.equal(array(scene, kind).length, count);
  assert.equal(scene.selected, undefined);
  assert.ok(scene.lastMessage.includes('Ctrl+Z'), '删除应提供恢复提示');
  assert.equal(buttons.paste.disabled, false, '删除源对象/副本不能清空内部剪贴板');
  key(scene, 'z', { ctrlKey: true });
  assert.equal(array(scene, kind).length, count + 1, '删除可撤销');
  key(scene, 'z', { ctrlKey: true, shiftKey: true });
  assert.equal(array(scene, kind).length, count, '删除可重做');
  key(scene, 'v', { ctrlKey: true });
  assert.equal(scene.object().x, originalValue.x + 64, '连续粘贴逐次偏移，避免重叠');
  const clipboard = scene.clipboard;
  key(scene, 'd', { ctrlKey: true });
  assert.equal(scene.clipboard, clipboard, 'Ctrl+D 不得覆盖 Ctrl+C 剪贴板');
  if (kind === 'platform') assert.equal(new Set(array(scene, kind).map((p) => p.id)).size, array(scene, kind).length);
  assert.doesNotThrow(() => maps.parseCustomMap(scene.map), '复制后的数据应仍可保存/导出/试玩');
}

// 仅框选中唯一标记时，保持现有地图完整性，不删除或复制它们。
for (const kind of ['spawn', 'checkpoint', 'flag']) {
  const { scene, buttons } = setup(kind);
  const before = JSON.stringify(scene.map);
  key(scene, 'Delete'); key(scene, 'c', { ctrlKey: true }); key(scene, 'd', { ctrlKey: true });
  assert.equal(JSON.stringify(scene.map), before);
  assert.equal(scene.undo.length, 0);
  assert.equal(buttons.copy.disabled, true);
  assert.equal(buttons.delete.disabled, true);
}
const { scene } = setup();
for (const shortcut of ['c', 'v', 'z', 'd', 'Delete']) {
  const before = JSON.stringify(scene.map);
  const field = { closest: (selector) => selector.includes('input') ? {} : null };
  const event = key(scene, shortcut, { ctrlKey: shortcut !== 'Delete', target: field });
  assert.equal(event.prevented, false, '输入框/富文本内部应保留系统文字复制、粘贴和删除');
  assert.equal(JSON.stringify(scene.map), before);
}
const noClipboard = JSON.stringify(scene.map);
key(scene, 'v', { ctrlKey: true });
assert.equal(JSON.stringify(scene.map), noClipboard);
assert.equal(scene.undo.length, 0, '空剪贴板不应产生编辑或撤销记录');
key(scene, 'c', { metaKey: true });
key(scene, 'v', { metaKey: true });
assert.equal(scene.map.level.platforms.length, 3, 'Command+C/V 也可用');
const beforeIME = JSON.stringify(scene.map);
key(scene, 'Delete', { isComposing: true });
assert.equal(JSON.stringify(scene.map), beforeIME);
scene.drag = {};
key(scene, 'Delete'); key(scene, 'v', { ctrlKey: true });
assert.equal(JSON.stringify(scene.map), beforeIME, '拖动中不允许数组变更导致选中索引失效');
scene.drag = undefined;
scene.action('new');
assert.equal(scene.clipboard, undefined, '新建地图清空旧素材引用剪贴板');

const limited = setup('coin').scene;
key(limited, 'c', { ctrlKey: true });
limited.map.level.coins = Array.from({ length: 300 }, () => ({ x: 320, y: 176 }));
const full = JSON.stringify(limited.map);
key(limited, 'v', { ctrlKey: true });
assert.equal(JSON.stringify(limited.map), full);
assert.equal(limited.undo.length, 0);
assert.equal(limited.clipboard.pastes, 0, '粘贴失败不推进偏移序号');

const edge = setup('enemy').scene;
Object.assign(edge.object(), { x: 1904, y: 528, min: 1880, max: 1918 });
key(edge, 'c', { ctrlKey: true }); key(edge, 'v', { ctrlKey: true });
const bounds = geometry.objectBounds('enemy', edge.object());
assert.ok(edge.object().x !== 1904 || edge.object().y !== 528, '地图右下角优先反向偏移，避免副本被源对象完全遮住');
assert.ok(bounds.x + bounds.width <= 1920 && bounds.y + bounds.height <= 540);
for (const n of [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height]) assert.equal(n % 16, 0);
assert.ok(edge.object().min <= edge.object().x && edge.object().max >= edge.object().x);

const assetScene = setup('decoration').scene;
assetScene.map.assets = [{ id: 'upload', name: '图片', data: 'data:image/png;base64,iVBORw0KGgo=', width: 32, height: 32 }];
assetScene.object().assetId = 'upload';
key(assetScene, 'c', { ctrlKey: true });
assetScene.map.assets = [];
const missingAsset = JSON.stringify(assetScene.map);
key(assetScene, 'v', { ctrlKey: true });
assert.equal(JSON.stringify(assetScene.map), missingAsset, '拒绝粘贴缺失素材的对象');
assert.equal(assetScene.undo.length, 0);

const groundCopy = setup('platform').scene;
groundCopy.map.level.width = 8000;
Object.assign(groundCopy.object(), { kind: 'ground', x: 0, width: 6000, height: 96 });
groundCopy.resetPlatformBrush();
key(groundCopy, 'c', { ctrlKey: true }); key(groundCopy, 'v', { ctrlKey: true });
assert.equal(groundCopy.object().kind, 'ground');
assert.equal(groundCopy.object().width, 6000, '复制地面仍保留原始地面尺寸');
assert.equal(groundCopy.paintWidth, 160, '复制地面不能覆盖新建跳台笔刷');
assert.equal(groundCopy.paintHeight, 32);
