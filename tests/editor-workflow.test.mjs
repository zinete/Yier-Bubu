// DOM 集成测试：运行真实 EditorScene.create 与事件绑定；不声称替代浏览器/Phaser 实机测试。
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { setImmediate as nextTick } from 'node:timers/promises';
import { editorDocument, editorHistory } from './helpers/editor-model.mjs';
function load(file, require = () => ({}), globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require, ...globals }); return module.exports;
}
const maps = load('src/systems/CustomMap.ts');
const drafts = load('src/systems/EditorDraftStore.ts', () => maps);
const geometry = load('src/systems/ObjectGeometry.ts');
const selection = load('src/systems/EditorSelection.ts', () => geometry);
const backdrop = load('src/systems/SceneBackdrop.ts');
const sceneLayers = load('src/systems/SceneLayers.ts');
const materials = load('src/systems/PlatformMaterial.ts');
const constants = load('src/config/constants.ts');
const cameraViewport = load('src/systems/CameraViewport.ts', () => constants);
const viewport = load('src/systems/EditorViewport.ts');
const skins = { platform: 'builtin-moss-platform', coin: 'builtin-gold-star', enemy: 'builtin-leaf-slime',
  spawn: 'builtin-lantern-marker', checkpoint: 'builtin-lantern-marker', flag: 'builtin-lantern-marker' };
const library = maps.BUILTIN_ASSET_IDS.map((id) => ({ id, name: id, data: `${id}.png`, width: 512, height: 256 }));
class Storage {
  data = new Map(); fail = false; failRead = false;
  getItem(key) { if (this.failRead) throw new Error('SecurityError'); return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw new Error('QuotaExceededError'); this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
function setup(storage = new Storage(), observeResize = false) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'https://editor.test/' });
  const { window } = dom; const document = window.document;
  window.matchMedia = () => ({ matches: true });
  let confirm = true, serial = 0, downloaded, frameSerial = 0;
  const timers = new Map(), starts = [];
  const frames = new Map(), observers = [];
  if (observeResize) window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  window.confirm = () => confirm;
  window.SVGElement.prototype.setPointerCapture = () => {};
  window.SVGElement.prototype.getBoundingClientRect = function () {
    const workspace = document.querySelector('.workspace');
    return { left: 20 - (workspace?.scrollLeft ?? 0), top: 20 + parseFloat(this.style.marginTop || '0') - (workspace?.scrollTop ?? 0),
      width: parseFloat(this.style.width || this.getAttribute('width') || '1920'), height: parseFloat(this.style.height || '540') };
  };
  window.HTMLAnchorElement.prototype.click = () => {};
  const { EditorScene } = load('src/scenes/EditorScene.ts', (name) => {
    if (name === 'phaser') return { default: { Scene: class {
      constructor() { this.events = new EventEmitter(); this.scene = { start: (...args) => starts.push(args) }; }
    }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
    if (name.endsWith('/EditorDocument')) return editorDocument;
    if (name.endsWith('/EditorHistory')) return editorHistory;
    if (name.endsWith('/constants')) return constants;
    if (name.endsWith('/CustomMap')) return maps;
    if (name.endsWith('/EditorDraftStore')) return drafts;
    if (name.endsWith('/EditorViewport')) return viewport;
    if (name.endsWith('/CameraViewport')) return cameraViewport;
    if (name.endsWith('/ObjectGeometry')) return geometry;
    if (name.endsWith('/EditorSelection')) return selection;
    if (name.endsWith('/SceneBackdrop')) return backdrop;
    if (name.endsWith('/SceneLayers')) return sceneLayers;
    if (name.endsWith('/PlatformMaterial')) return materials;
    if (name.endsWith('/DefaultAssets')) return { DEFAULT_ASSETS: library, DEFAULT_OBJECT_SKINS: skins, mapAssets: (map) => [...library, ...(map.assets ?? [])] };
    if (name.endsWith('/AssetGeometry')) return { ensureAssetGeometry() {},
      cachedAssetGeometry: () => ({ sourceWidth: 512, sourceHeight: 256, x: 0, y: 0, width: 512, height: 256, surfaceY: 100 }),
      assetLayout: (_, x, y, width, height) => ({ x, y, width, height }) };
    return {};
  }, { window, document, localStorage: storage, Option: window.Option, AbortController: window.AbortController,
    structuredClone: globalThis.structuredClone, Blob: globalThis.Blob,
    URL: { createObjectURL: (blob) => { downloaded = blob; return 'blob:editor-test'; }, revokeObjectURL() {} },
    setTimeout: (fn) => { timers.set(++serial, fn); return serial; }, clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => { frames.set(++frameSerial, fn); return frameSerial; }, cancelAnimationFrame: (id) => frames.delete(id),
  });
  const scene = new EditorScene(); scene.create();
  const workspace = document.querySelector('.workspace');
  Object.defineProperties(workspace, { clientWidth: { value: 900, configurable: true }, clientHeight: { value: 540, configurable: true } });
  workspace.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 540 });
  return { scene, storage, starts, dom, document, window,
    click(action) { const button = document.querySelector(`[data-action="${action}"]`); assert.ok(button); button.click(); },
    input(selector, value) { const node = document.querySelector(selector); assert.ok(node, selector); node.value = value;
      node.dispatchEvent(new window.Event('input', { bubbles: true })); return node; },
    flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); },
    observers, notifyResize() { observers.filter((observer) => !observer.disconnected).forEach((observer) => observer.callback()); },
    get downloaded() { return downloaded; }, set confirm(value) { confirm = value; },
    close() { scene.events.emit('shutdown'); timers.clear(); frames.clear(); window.close(); },
  };
}
let ui = setup();
assert.equal(ui.document.querySelector('[data-draft-status]').textContent, '新地图 · 尚未保存');
ui.click('save'); assert.equal(ui.document.querySelector('[data-draft-status]').textContent, '已保存');
const initialRaw = ui.storage.getItem(maps.DRAFT_KEY);
ui.input('[data-meta="title"]', '有待应用的森林');
assert.equal(ui.document.querySelector('[data-pending-notice]').hidden, false);
ui.click('home'); ui.click('play'); assert.equal(ui.starts.length, 0, '未应用表单不能静默保存旧数据并离开');
ui.click('apply-pending');
assert.equal(ui.scene.map.title, '有待应用的森林');
assert.equal(ui.document.querySelector('[data-pending-notice]').hidden, true);
assert.ok(ui.document.querySelector('[data-draft-status]').textContent.includes('未保存'));
ui.flush();
assert.equal(ui.storage.getItem(maps.DRAFT_KEY), initialRaw);
assert.ok(ui.storage.getItem(drafts.RECOVERY_KEY));
assert.ok(ui.document.querySelector('[data-draft-status]').textContent.includes('已自动备份'));
const beforeUnload = new ui.window.Event('beforeunload', { cancelable: true });
ui.window.dispatchEvent(beforeUnload); assert.equal(beforeUnload.defaultPrevented, true);
const sharedStorage = ui.storage; ui.close();
ui = setup(sharedStorage);
assert.equal(ui.scene.map.title, '有待应用的森林', '刷新后恢复自动备份');
assert.ok(ui.document.querySelector('[data-draft-warning]').textContent.includes('已恢复'));
ui.click('undo'); // 刷新后不恢复撤销历史，不应异常。
ui.storage.fail = true;
ui.click('save'); assert.ok(ui.document.querySelector('[data-draft-status]').textContent.includes('保存失败'));
ui.click('home'); ui.click('play'); assert.equal(ui.starts.length, 0, '存储失败必须阻止切场景');
assert.equal(ui.storage.getItem(maps.DRAFT_KEY), initialRaw);
ui.click('export'); assert.equal(maps.parseCustomMap(JSON.parse(await ui.downloaded.text())).title, ui.scene.map.title, '存储故障仍能导出文件');
ui.storage.fail = false;
ui.click('save'); assert.equal(ui.storage.getItem(drafts.RECOVERY_KEY), null);
assert.equal(ui.document.querySelector('[data-draft-warning]').hidden, true);
const cleanUnload = new ui.window.Event('beforeunload', { cancelable: true }); ui.window.dispatchEvent(cleanUnload);
assert.equal(cleanUnload.defaultPrevented, false, '成功保存后不拦截离开');

// 原子属性编辑：无效速度不得顺带改变位置，撤销栈不增加。
ui.scene.map.level.enemies = [{ x: 400, y: 432, min: 320, max: 600, speed: 60 }];
ui.scene.selected = { kind: 'enemy', index: 0 }; ui.scene.render();
let before = JSON.stringify(ui.scene.map), history = ui.scene.undo.length;
ui.input('[data-prop="x"]', '480'); ui.input('[data-prop="speed"]', '-1'); ui.click('properties');
assert.equal(JSON.stringify(ui.scene.map), before); assert.equal(ui.scene.undo.length, history);
assert.equal(ui.document.querySelector('[data-prop="x"]').value, '480', '错误时保留用户输入供修正');
ui.input('[data-prop="speed"]', '80'); ui.click('properties');
assert.equal(ui.scene.map.level.enemies[0].x, 480); assert.equal(ui.scene.map.level.enemies[0].speed, 80);
assert.equal(ui.scene.undo.length, history + 1);
ui.click('undo'); assert.equal(JSON.stringify(ui.scene.map), before);

// 多张表单一起提交，任一无效则全部不提交；地图缩小不能截断已有对象。
ui.scene.selected = { kind: 'platform', index: 0 }; ui.scene.render();
before = JSON.stringify(ui.scene.map); history = ui.scene.undo.length;
ui.input('[data-prop="height"]', '0'); ui.input('[data-meta="title"]', '不应部分成功'); ui.click('apply-pending');
assert.equal(JSON.stringify(ui.scene.map), before); assert.equal(ui.scene.undo.length, history);
ui.input('[data-prop="height"]', '64'); ui.click('apply-pending'); assert.equal(ui.scene.map.title, '不应部分成功');
ui.click('save');
before = JSON.stringify(ui.scene.map);
ui.input('[data-meta="width"]', '960'); ui.click('meta'); assert.equal(JSON.stringify(ui.scene.map), before);
ui.confirm = false; ui.click('discard-fields'); assert.equal(ui.scene.pendingForms.size, 1);
ui.confirm = true; ui.click('discard-fields'); assert.equal(ui.scene.pendingForms.size, 0);

// 撤销回保存状态时，必须清除旧自动备份，刷新不能复活已撤销的编辑。
ui.input('[data-meta="title"]', '稍后撤销'); ui.click('meta'); ui.flush(); assert.ok(ui.storage.getItem(drafts.RECOVERY_KEY));
ui.click('undo'); assert.equal(ui.storage.getItem(drafts.RECOVERY_KEY), null);
assert.equal(ui.scene.hasUnsavedChanges(), false);

// 新建提示与导入真实 DOM change 事件。
ui.input('[data-meta="title"]', '新建前的编辑'); ui.click('meta'); before = JSON.stringify(ui.scene.map);
ui.confirm = false; ui.click('new'); assert.equal(JSON.stringify(ui.scene.map), before);
ui.confirm = true; ui.click('new'); assert.equal(ui.scene.map.title, maps.newMap().title);
const fileInput = ui.document.querySelector('.file');
const imported = maps.newMap(); imported.title = 'DOM 导入的地图';
Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ size: 1000, text: async () => JSON.stringify(imported) }] });
fileInput.dispatchEvent(new ui.window.Event('change', { bubbles: true })); await nextTick();
assert.equal(ui.scene.map.title, imported.title);
ui.click('save'); ui.click('play'); assert.equal(ui.starts.at(-1)[0], constants.SCENE.GAME);
assert.equal(ui.starts.at(-1)[1].customMap.title, imported.title);
ui.scene.events.emit('shutdown'); assert.equal(ui.document.querySelector('.map-editor'), null);
ui.scene.create(); assert.equal(ui.scene.map.title, imported.title, '模拟试玩返回，仍使用已保存地图');
ui.input('[data-meta="title"]', '回到编辑器后的修改一'); ui.click('meta');
ui.input('[data-meta="title"]', '回到编辑器后的修改二'); ui.click('meta');
ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
assert.equal(ui.scene.map.title, '回到编辑器后的修改一', '重入后键盘监听不应重复导致撤销两次');
ui.close();

const unreadable = new Storage(); unreadable.setItem(maps.DRAFT_KEY, 'broken');
const brokenUi = setup(unreadable);
assert.equal(brokenUi.document.querySelector('[data-draft-status]').textContent, '新地图 · 尚未保存', '损坏记录不等于成功保存'); brokenUi.close();
const memory = setup(); memory.input('[data-meta="title"]', '存储失效仍保留内存'); memory.click('meta'); memory.click('save');
memory.scene.events.emit('shutdown'); memory.storage.failRead = true; memory.scene.create();
assert.equal(memory.scene.map.title, '存储失效仍保留内存', '试玩返回时读取存储失败不能用新空地图覆盖现有内存');
memory.storage.failRead = false; memory.close();

// 未完成关卡也必须能导出/导入救援，不能要求先完成碰撞与终点布局。
const unfinished = setup(); unfinished.scene.map.level.platforms = []; unfinished.scene.render(); unfinished.click('export');
const draftJson = JSON.parse(await unfinished.downloaded.text());
assert.doesNotThrow(() => maps.parseCustomMap(draftJson, false)); assert.throws(() => maps.parseCustomMap(draftJson));
const unfinishedInput = unfinished.document.querySelector('.file');
Object.defineProperty(unfinishedInput, 'files', { value: [{ size: 1000, text: async () => JSON.stringify(draftJson) }] });
unfinishedInput.dispatchEvent(new unfinished.window.Event('change', { bubbles: true })); await nextTick();
assert.equal(unfinished.scene.map.level.platforms.length, 0);
unfinished.click('play'); assert.equal(unfinished.starts.length, 0); unfinished.close();

// P1 视口：缩放/定位不改数据、保存状态或撤销历史，缩放后指针仍映射到世界网格。
const view = setup();
view.scene.map.level.width = 8000; view.scene.map.level.platforms[0].width = 8000;
view.scene.map.level.platforms.push({ id: 'far', kind: 'platform', x: 6000, y: 240, width: 160, height: 32 });
view.scene.render(); view.click('save');
const viewportMap = JSON.stringify(view.scene.map), viewportHistory = view.scene.undo.length;
view.click('view-in'); assert.equal(view.scene.editorZoom, 1.25);
assert.equal(view.document.querySelector('[data-editor-zoom]').value, '125%');
const workspace = view.document.querySelector('.workspace'), svg = view.document.querySelector('svg');
workspace.scrollLeft = 2200;
const cursor = { clientX: 500, clientY: 100 }, worldBeforeWheel = view.scene.position(cursor);
workspace.dispatchEvent(new view.window.WheelEvent('wheel', { ...cursor, deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }));
const worldAfterWheel = view.scene.position(cursor);
assert.ok(Math.abs(worldBeforeWheel.x - worldAfterWheel.x) < 1e-8, '缩放以鼠标锚点保持世界 X');
view.scene.selected = { kind: 'platform', index: 1 }; view.scene.render();
view.click('view-focus'); assert.ok(workspace.scrollLeft > 5000);
view.click('view-start'); assert.equal(workspace.scrollLeft, 0);
view.click('view-fit'); assert.ok(parseFloat(svg.style.width) <= workspace.clientWidth - 40 + 1e-6);
view.click('view-reset'); assert.equal(view.scene.editorZoom, 1);
assert.equal(JSON.stringify(view.scene.map), viewportMap); assert.equal(view.scene.undo.length, viewportHistory);
assert.equal(view.scene.hasUnsavedChanges(), false);
view.scene.setEditorZoom(2); workspace.scrollLeft = 0; workspace.scrollTop = 0;
const box = svg.getBoundingClientRect(); view.scene.tool = 'coin';
view.scene.pointerDown({ button: 0, pointerId: 1, clientX: box.left + 336 * 2, clientY: box.top + 400 * 2,
  target: svg, altKey: false }); view.scene.endDrag();
assert.equal(view.scene.object().x, 336); assert.equal(view.scene.object().y, 400);
view.scene.nudge('ArrowRight', 16); assert.equal(view.scene.object().x, 352, '缩放后方向键仍移动一个世界网格');
view.window.dispatchEvent(new view.window.StorageEvent('storage', { key: drafts.RECOVERY_KEY, oldValue: 'old', newValue: 'new' }));
assert.equal(view.scene.backupSnapshot, undefined); assert.ok(view.document.querySelector('[data-draft-status]').textContent.includes('备份失败'));
view.close();

// 多选 DOM 流程：真实事件委托、缩放后框选/拖动、原子批量历史与唯一标记保护。
const multi = setup(), scene = multi.scene;
const plain = (value) => JSON.parse(JSON.stringify(value));
const ref = (kind, index = 0) => ({ kind, index });
scene.map.level.width = 1920;
scene.map.level.platforms = [{ id: 'ground', kind: 'ground', x: 0, y: 448, width: 1920, height: 80 },
  { id: 'jump', kind: 'platform', x: 128, y: 192, width: 160, height: 32 }];
scene.map.level.coins = [[176, 144], { x: 320, y: 144 }];
scene.map.level.enemies = [{ x: 352, y: 224, min: 304, max: 432, speed: 70,
  attack: { range: 300, cooldown: 1500, projectileSpeed: 240, projectileArc: -100, projectileGravity: 400, projectileLifetime: 1600 } }];
scene.map.decorations = [{ x: 448, y: 160, width: 64, height: 64, assetId: 'builtin-flower-bush', solid: false, layer: 'front' }];
scene.render(); multi.click('save');
const canvas = () => multi.document.querySelector('svg');
function pointer(type, x, y, options = {}, kind, index = 0) {
  const box = canvas().getBoundingClientRect();
  const target = kind ? canvas().querySelector(`[data-object="${kind}"][data-index="${index}"]`) : canvas();
  assert.ok(target, `${kind}:${index}`);
  target.dispatchEvent(new multi.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0,
    clientX: box.left + x * scene.editorZoom, clientY: box.top + y * scene.editorZoom, ...options }));
}
function key(key, options = {}, target = canvas()) {
  const event = new multi.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event); return event;
}
function pick(kind, index = 0, shiftKey = false) {
  const item = selection.selectionObject(scene.map, ref(kind, index));
  pointer('pointerdown', Number(item.x), Number(item.y), { shiftKey }, kind, index);
  pointer('pointerup', Number(item.x), Number(item.y));
}
const selectionMap = JSON.stringify(scene.map), selectionHistory = scene.undo.length;
pick('platform', 1); pick('coin', 0, true);
assert.equal(scene.activeSelections().length, 2);
assert.equal(multi.document.querySelector('[data-resize]'), null, '多选不显示单对象缩放手柄');
pick('coin', 0, true); assert.equal(scene.activeSelections().length, 1, 'Shift 再点移除');
pointer('pointerdown', 112, 112); pointer('pointermove', 300, 240); scene.renderDrag();
assert.ok(canvas().querySelector('[data-selection-marquee]'));
pointer('pointerup', 300, 240);
assert.deepEqual(plain(scene.activeSelections()), [ref('platform', 1), ref('coin')]);
pointer('pointerdown', 520, 240, { shiftKey: true }); pointer('pointermove', 300, 112); pointer('pointerup', 300, 112);
assert.equal(scene.activeSelections().length, 5, '反向框选 + Shift 追加，重复项去重');
const five = plain(scene.activeSelections());
pointer('pointerdown', 20, 20); pointer('pointermove', 50, 50);
key('Escape'); assert.deepEqual(plain(scene.activeSelections()), five, 'Esc 取消框选恢复原选区');
pointer('pointerdown', 20, 20); pointer('pointermove', 50, 50); pointer('pointercancel', 50, 50);
assert.deepEqual(plain(scene.activeSelections()), five, 'pointercancel 恢复原选区');
assert.equal(JSON.stringify(scene.map), selectionMap); assert.equal(scene.undo.length, selectionHistory);
assert.equal(scene.hasUnsavedChanges(), false, '只选择不算修改地图');
pointer('pointerdown', 20, 20); pointer('pointermove', 21, 21); pointer('pointerup', 21, 21);
assert.equal(scene.activeSelections().length, 0, '空白轻点清空选区，不启动框选');
pick('platform', 1); multi.input('[data-prop="width"]', '192'); pick('coin', 0, true);
assert.equal(scene.activeSelections().length, 1, '待提交属性阻止改变选区');
multi.click('discard-fields');
pick('coin', 0, true); pick('enemy', 0, true); pick('decoration', 0, true);
scene.setEditorZoom(2);
const multiWorkspace = multi.document.querySelector('.workspace'); multiWorkspace.scrollLeft = 100; multiWorkspace.scrollTop = 40;
before = JSON.stringify(scene.map); history = scene.undo.length;
multi.click('view-focus');
const union = selection.itemsBounds(selection.selectionItems(scene.map, scene.activeSelections()));
const expectedFocus = viewport.centeredObjectScroll(union, 2, { width: 900, height: 540 });
assert.equal(multiWorkspace.scrollLeft, expectedFocus.left); assert.equal(multiWorkspace.scrollTop, expectedFocus.top);
assert.equal(JSON.stringify(scene.map), before); assert.equal(scene.undo.length, history);
const groupBefore = JSON.stringify(scene.map), groupHistory = scene.undo.length;
pointer('pointerdown', 176, 144, {}, 'coin'); pointer('pointermove', 208, 160); scene.renderDrag();
assert.equal(selection.selectionObject(scene.map, ref('coin')).x, 208, '200%+滚动后整体拖动仍按世界坐标移动');
assert.ok(canvas().querySelector('[data-selection-bounds]'));
assert.equal(canvas().querySelector('[data-object="coin"][data-index="0"]').getAttribute('transform'), 'translate(32 16)');
assert.equal(canvas().querySelector('[data-enemy-patrol="0"]').getAttribute('d'), 'M336 230H464');
// 第二次按下不能覆盖活动拖动的初始事务。
pointer('pointerdown', 100, 100); pointer('pointermove', 240, 176); pointer('pointerup', 240, 176);
assert.equal(scene.undo.length, groupHistory + 1, '多个 pointermove 只记录一次历史');
const groupAfter = JSON.stringify(scene.map);
key('z', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), groupBefore);
key('y', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), groupAfter);
scene.setSelection([ref('platform', 1), ref('coin'), ref('enemy'), ref('decoration')]); scene.render();
before = JSON.stringify(scene.map); history = scene.undo.length;
pointer('pointerdown', 240, 176, {}, 'coin'); pointer('pointermove', 272, 192); key('Escape');
assert.equal(JSON.stringify(scene.map), before); assert.equal(scene.undo.length, history, '取消拖动不留半成品或历史');
key('ArrowRight', { shiftKey: true });
assert.equal(scene.map.level.platforms[1].x, JSON.parse(before).level.platforms[1].x + 64);
key('z', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), before);

scene.setSelection([ref('platform', 1), ref('coin')]); scene.render();
history = scene.undo.length; multi.click('move-left'); assert.equal(scene.undo.length, history + 1);
key('z', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), before);
scene.setSelection([ref('platform', 1), ref('coin')]); scene.render();
key('d', { ctrlKey: true }); assert.equal(scene.activeSelections().length, 2);
key('z', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), before, 'Ctrl+D 整批创建副本，一次撤销');

// 混合选区复制忽略唯一标记，深复制攻击参数，保持相对位置并创建新平台 ID。
scene.setSelection([ref('platform', 1), ref('coin'), ref('enemy'), ref('decoration'), ref('spawn')]); scene.render();
key('c', { ctrlKey: true }); assert.equal(scene.clipboard.items.length, 4);
const copied = plain(scene.clipboard);
scene.map.level.enemies[0].attack.range = 350;
assert.equal(scene.clipboard.items[2].value.attack.range, 300);
before = JSON.stringify(scene.map); history = scene.undo.length;
key('v', { ctrlKey: true });
assert.equal(scene.undo.length, history + 1); assert.equal(scene.activeSelections().length, 4);
assert.equal(scene.map.level.platforms.length, 3); assert.equal(scene.map.level.coins.length, 3);
assert.equal(scene.map.level.platforms[2].x, copied.items[0].value.x + 32);
assert.notEqual(scene.map.level.platforms[2].id, scene.map.level.platforms[1].id);
assert.equal(scene.map.level.enemies[1].attack.range, 300);
assert.equal(scene.map.decorations[1].layer, 'front');
assert.equal(scene.map.level.enemies[1].min, copied.items[2].value.min + 32);
assert.deepEqual(plain(scene.map.level.spawn), JSON.parse(before).level.spawn);
key('v', { ctrlKey: true });
assert.equal(scene.map.level.platforms[3].x, copied.items[0].value.x + 64);
assert.equal(new Set(scene.map.level.platforms.map((p) => p.id)).size, 4);
key('z', { ctrlKey: true }); key('z', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), before);
// 数量限制或素材失效时整批失败，不出现半批、历史或粘贴计数递增。
scene.map.level.coins = Array.from({ length: 300 }, () => ({ x: 176, y: 144 })); scene.render();
before = JSON.stringify(scene.map); history = scene.undo.length;
const pastes = scene.clipboard.pastes; key('v', { ctrlKey: true });
assert.equal(JSON.stringify(scene.map), before); assert.equal(scene.undo.length, history); assert.equal(scene.clipboard.pastes, pastes);
scene.map.level.coins = [{ x: 176, y: 144 }]; scene.clipboard.items[3].value.assetId = 'missing'; scene.render();
before = JSON.stringify(scene.map); key('v', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), before);
assert.equal(scene.undo.length, history);
// 多对象删除逆序处理同类索引，唯一标记保留；一次撤销恢复全部。
scene.map.level.coins.push({ x: 320, y: 144 });
scene.setSelection([ref('coin'), ref('coin', 1), ref('platform', 1), ref('spawn'), ref('checkpoint'), ref('flag')]); scene.render();
before = JSON.stringify(scene.map); history = scene.undo.length; key('Delete');
assert.equal(scene.map.level.coins.length, 0); assert.equal(scene.map.level.platforms.length, 1);
assert.equal(scene.undo.length, history + 1); assert.equal(scene.activeSelections().length, 3);
assert.equal(multi.document.querySelector('[data-action="delete"]').disabled, true);
const protectedMap = JSON.stringify(scene.map); key('Delete'); key('c', { ctrlKey: true });
assert.equal(JSON.stringify(scene.map), protectedMap); assert.equal(scene.undo.length, history + 1);
key('z', { ctrlKey: true }); assert.equal(JSON.stringify(scene.map), before);
// 全选只在画布内接管，输入框原生 Ctrl+A/C/V/Delete 不被劫持。
const title = multi.document.querySelector('[data-meta="title"]');
assert.equal(key('a', { ctrlKey: true }, title).defaultPrevented, false);
assert.equal(key('Delete', {}, title).defaultPrevented, false);
key('a', { ctrlKey: true }); assert.equal(scene.activeSelections().length, selection.allSelections(scene.map).length);
multi.click('clear-selection'); assert.equal(scene.activeSelections().length, 0);
// 右下角整体无法正向偏移时反向粘贴，不改变间距；边界微移不增加空历史。
scene.map.level.coins = [{ x: 1840, y: 512 }, { x: 1904, y: 512 }];
scene.setSelection([ref('coin'), ref('coin', 1)]); scene.render(); key('c', { ctrlKey: true }); key('v', { ctrlKey: true });
assert.equal(scene.map.level.coins[2].x, 1808); assert.equal(scene.map.level.coins[3].x, 1872);
assert.equal(scene.map.level.coins[2].y, 496);
scene.setSelection([ref('coin'), ref('coin', 1)]); scene.render();
history = scene.undo.length; key('ArrowRight'); assert.equal(scene.undo.length, history);
// 页面失焦/场景销毁取消未完成拖动，不把瞬时坐标留在恢复草稿。
before = JSON.stringify(scene.map);
pointer('pointerdown', 1840, 512, {}, 'coin'); pointer('pointermove', 1808, 496);
multi.window.dispatchEvent(new multi.window.Event('blur')); assert.equal(JSON.stringify(scene.map), before);
pointer('pointerdown', 1840, 512, {}, 'coin'); pointer('pointermove', 1808, 496);
multi.close(); assert.equal(JSON.stringify(scene.map), before);
log('Editor workflow DOM tests passed (draft, viewport, multi-selection)');

// 模型/命令/素材分离：含图地图的 50 步撤销、保存状态、导入替换与新分支回收。
const modelUi = setup(), model = modelUi.scene;
const image = 'data:image/png;base64,' + 'A'.repeat(250000);
model.map.assets = [{ id: 'shared', name: '共享图片', width: 512, height: 512, data: image }];
model.render(); modelUi.click('save');
const objectId = model.map.level.coins[0].objectId;
const savedModel = JSON.stringify(model.map);
for (let i = 0; i < 50; i++) { model.setSelection([ref('coin')]); model.nudge('ArrowRight', 16); }
assert.equal(model.undo.length, 50, '上传图片后不再降低到 10 步历史');
assert.equal(model.document.stats().images, 1);
assert.equal(JSON.stringify(model.undo).includes(image), false);
assert.ok(modelUi.document.querySelector('[data-history-status]').textContent.includes('撤销 50'));
assert.equal(model.savedSnapshot.includes('data:image/png'), false, '脏状态基线不重复存储整张图');
for (let i = 0; i < 50; i++) modelUi.click('undo');
assert.equal(JSON.stringify(model.map), savedModel);
assert.equal(model.map.level.coins[0].objectId, objectId);
assert.equal(model.hasUnsavedChanges(), false, '撤销回保存状态无需再次保存');
assert.equal(model.redo.length, 50);
modelUi.click('redo'); modelUi.click('export');
const exportedModel = JSON.parse(await modelUi.downloaded.text());
assert.equal(exportedModel.assets[0].data, image, '导出文件保持内嵌图片，不泄漏进程内池引用');
assert.equal(exportedModel.level.coins[0].objectId, objectId);
modelUi.flush();
assert.equal(JSON.parse(modelUi.storage.getItem(drafts.RECOVERY_KEY)).map.assets[0].data, image);
modelUi.click('save');
const modelStorage = modelUi.storage; modelUi.close();
const reopen = setup(modelStorage);
assert.equal(reopen.scene.map.assets[0].data, image); assert.equal(reopen.scene.map.level.coins[0].objectId, objectId);
assert.equal(reopen.scene.undo.length, 0, '刷新不持久化撤销历史或进程内池引用');
const importField = reopen.document.querySelector('.file');
const replacement = maps.newMap(); replacement.title = '同编号不同图片';
replacement.assets = [{ id: 'shared', name: '另一张图', width: 16, height: 16, data: 'data:image/png;base64,BBBB' }];
Object.defineProperty(importField, 'files', { configurable: true, value: [{ size: 2000, text: async () => JSON.stringify(replacement) }] });
importField.dispatchEvent(new reopen.window.Event('change', { bubbles: true })); await nextTick();
const importedId = reopen.scene.map.level.coins[0].objectId;
assert.equal(reopen.scene.map.assets[0].data, replacement.assets[0].data);
reopen.click('undo'); assert.equal(reopen.scene.map.assets[0].data, image);
reopen.click('redo'); assert.equal(reopen.scene.map.assets[0].data, replacement.assets[0].data);
assert.equal(reopen.scene.map.level.coins[0].objectId, importedId);
// 删除/复制/撤销/重做保留原对象身份，副本获得新身份。
reopen.scene.setSelection([ref('coin')]); reopen.scene.render(); reopen.click('duplicate');
const copyId = reopen.scene.object().objectId; assert.notEqual(copyId, importedId);
reopen.click('undo'); reopen.click('redo'); assert.equal(reopen.scene.map.level.coins[1].objectId, copyId);
reopen.scene.setSelection([ref('coin')]); reopen.scene.render(); reopen.click('delete');
assert.equal(reopen.scene.map.level.coins[0].objectId, copyId, '数组索引变化不更改对象编号');
reopen.click('undo'); assert.equal(reopen.scene.map.level.coins[0].objectId, importedId);
// 新建可撤销；撤销后的新编辑清空重做，但不能回收仍被主保存基线使用的图片。
reopen.click('new'); assert.equal(reopen.scene.map.assets, undefined);
reopen.click('undo'); assert.equal(reopen.scene.map.assets[0].data, replacement.assets[0].data);
reopen.input('[data-meta="title"]', '从撤销处分叉'); reopen.click('meta');
assert.equal(reopen.scene.redo.length, 0);
assert.equal(reopen.scene.document.stats().images, 2, '当前图片与旧保存基线的图片都仍被保留');
reopen.click('save');
assert.equal(reopen.scene.map.assets[0].data, replacement.assets[0].data);
// 历史前置条件失配时，整个撤销失败，模型与两个历史栈都保持不变。
reopen.input('[data-meta="title"]', '最后一条命令'); reopen.click('meta');
reopen.scene.map.title = '模拟外部无事务修改';
const mismatch = JSON.stringify(reopen.scene.map), undoCount = reopen.scene.undo.length, redoCount = reopen.scene.redo.length;
reopen.click('undo'); assert.equal(JSON.stringify(reopen.scene.map), mismatch);
assert.equal(reopen.scene.undo.length, undoCount); assert.equal(reopen.scene.redo.length, redoCount);
assert.match(reopen.document.querySelector('footer').textContent, /不匹配|操作失败/); // 独立 VM 的 Error 构造器不同，场景可能走通用错误文案。
reopen.close();
log('Editor model DOM tests passed (50-step image history, IDs, export/recovery, atomic failure)');

// 自动池回收必须跟随真正的重做分支失效和 50 步历史截断，而非只测试手动 collect。
const gc = setup(), gcScene = gc.scene;
function replaceImage(data) {
  gcScene.remember(); gcScene.map.assets = [{ id: 'gc', name: '回收测试图', data, width: 16, height: 16 }]; gcScene.render();
}
replaceImage('data:image/png;base64,AAAA'); replaceImage('data:image/png;base64,BBBB');
assert.equal(gcScene.document.stats().images, 2);
gc.click('undo'); assert.equal(gcScene.document.stats().images, 2, '可重做时不能提前回收未来图片');
gc.input('[data-meta="title"]', '新的分支'); gc.click('meta');
assert.equal(gcScene.document.stats().images, 1, '新编辑清空重做后释放无引用图片');
replaceImage('data:image/png;base64,CCCC'); assert.equal(gcScene.document.stats().images, 2);
for (let i = 0; i < 55; i++) { gc.input('[data-meta="title"]', `回收${i}`); gc.click('meta'); }
assert.equal(gcScene.undo.length, 50); assert.equal(gcScene.document.stats().images, 1, '旧图片操作被截断后回收，仅保留当前图');
gc.close();

// 紧凑侧栏：分类切换只改界面；常用工具独立于局部滚动区，按选择显示右侧属性。
const menu = setup(), menuScene = menu.scene, menuDoc = menu.document;
const style = menuDoc.createElement('style'); style.textContent = readFileSync('src/scenes/editor.css', 'utf8'); menuDoc.head.append(style);
const panel = (name) => menuDoc.querySelector(`[data-editor-panel="${name}"]`);
const tab = (name) => menuDoc.querySelector(`[role="tab"][data-editor-tab="${name}"]`);
const visiblePanels = () => [...menuDoc.querySelectorAll('[data-editor-panel]')].filter((node) => !node.hidden);
const menuKey = (key, target) => target.dispatchEvent(new menu.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
assert.equal(visiblePanels().length, 1); assert.equal(visiblePanels()[0], panel('place'));
assert.equal(menuDoc.querySelectorAll('.tool-dock [data-tool]').length, 4);
assert.equal(menuDoc.querySelector('.tool-dock').closest('[data-editor-panel]'), null, '常用工具不在任何滚动面板内部');
assert.equal(menu.window.getComputedStyle(menuDoc.querySelector('.left-sidebar')).overflow, 'hidden');
assert.equal(menu.window.getComputedStyle(panel('place')).overflow, 'auto');
assert.equal(menu.window.getComputedStyle(menuDoc.querySelector('.tool-dock')).flexShrink, '0');
assert.equal(menuDoc.querySelectorAll('.marker-tools [data-tool]').length, 3);
assert.equal(menuDoc.querySelector('[data-action="scene-pan"]'), null);
assert.equal(menuDoc.querySelector('[data-action="scene"]'), null, '只保留顶栏统一保存入口');
assert.equal(menuDoc.querySelectorAll('.default-assets [data-asset]').length, 1, '素材中不重复列平台/星星/敌人/标记工具');
assert.equal(menuDoc.querySelectorAll('.scene-assets [data-scene-asset]').length, 4);
assert.equal(menuDoc.querySelectorAll('.default-assets [data-scene-asset]').length, 0);
assert.equal(menuDoc.querySelector('[data-material="surfaceY"]').closest('details').open, false);
assert.equal(menuDoc.querySelector('[data-scene="parallax"]').type, 'hidden', '数值字段只同步数据，不重复显示输入控件');
let menuMap = JSON.stringify(menuScene.map), menuHistory = menuScene.undo.length;
panel('place').scrollTop = 48;
for (const name of ['assets', 'scene', 'map', 'place']) {
  tab(name).click(); assert.equal(visiblePanels().length, 1); assert.equal(visiblePanels()[0], panel(name));
  assert.equal(tab(name).getAttribute('aria-selected'), 'true'); assert.equal(tab(name).tabIndex, 0);
  assert.equal(menuDoc.querySelectorAll('[role="tab"][tabindex="0"]').length, 1);
}
assert.equal(panel('place').scrollTop, 48, '切换分类保留各面板自己的浏览位置');
assert.equal(JSON.stringify(menuScene.map), menuMap); assert.equal(menuScene.undo.length, menuHistory);
assert.equal(menuScene.hasUnsavedChanges(), false);
menuDoc.querySelector('[data-panel-shortcut]').click(); assert.equal(menuScene.sidebarPanel, 'assets');
menuKey('ArrowRight', tab('assets')); assert.equal(menuScene.sidebarPanel, 'scene'); assert.equal(menuDoc.activeElement, tab('scene'));
menuKey('End', tab('scene')); assert.equal(menuScene.sidebarPanel, 'map');
menuKey('Home', tab('map')); assert.equal(menuScene.sidebarPanel, 'place');
assert.equal(JSON.stringify(menuScene.map), menuMap, '分类键盘导航不能微移画布上的对象');
tab('map').click(); menu.input('[data-meta="title"]', '紧凑侧栏测试');
tab('scene').click(); assert.equal(menuScene.sidebarPanel, 'map', '未应用表单不能因切换面板而丢失');
assert.equal(menuDoc.querySelector('[data-meta="title"]').value, '紧凑侧栏测试');
menu.click('apply-pending'); tab('scene').click();
menuMap = JSON.stringify(menuScene.map.level); menu.click('layer-preset');
assert.equal(JSON.stringify(menuScene.map.level), menuMap, '分类重排不改变关卡布局');
assert.equal(menuDoc.querySelector('[data-inspector="layer"]').hidden, false);
assert.equal(menuDoc.querySelector('[data-inspector="object"]').hidden, true);
menuDoc.querySelector('[data-tool="platform"]').click();
assert.equal(menuScene.tool, 'platform'); assert.equal(menuDoc.querySelector('[data-action="reset-platform-size"]').hidden, false);
assert.equal(menuDoc.querySelector('[data-inspector="object"]').hidden, false);
assert.equal(menuDoc.querySelector('[data-inspector="layer"]').hidden, true);
menuDoc.querySelector('[data-tool="coin"]').click();
assert.equal(menuDoc.querySelector('[data-action="reset-platform-size"]').hidden, true);
menuDoc.querySelector('[data-layer-select]').click(); assert.equal(menuScene.inspectorMode, 'layer');
// 画布操作会回到对象属性，图层控制不与对象控制混排。
menuScene.tool = 'select';
menuScene.pointerDown({ button: 0, pointerId: 1, target: menuDoc.querySelector('svg'), clientX: 40, clientY: 40 });
menuScene.endDrag(); assert.equal(menuScene.inspectorMode, 'object');
tab('assets').click(); menuDoc.querySelector('[data-asset="builtin-flower-bush"]').click();
assert.equal(menuScene.tool, 'decoration'); assert.equal(menuDoc.querySelector('[data-asset-purpose]').hidden, false);
const purpose = menuDoc.querySelector('[data-placement-kind]'); purpose.value = 'platform';
purpose.dispatchEvent(new menu.window.Event('change', { bubbles: true })); assert.equal(menuScene.tool, 'platform');
const materialDetails = menuDoc.querySelector('[data-material="surfaceY"]').closest('details'); materialDetails.open = true;
menu.input('[data-material="leftCap"]', '20'); tab('scene').click();
assert.equal(menuScene.sidebarPanel, 'assets', '高级材质表单同样受到待提交保护');
menu.click('discard-fields'); tab('scene').click();
const sliderControl = menuDoc.querySelector('[data-parallax-slider]'); sliderControl.value = '0.55';
menuHistory = menuScene.undo.length;
sliderControl.dispatchEvent(new menu.window.Event('input', { bubbles: true }));
sliderControl.dispatchEvent(new menu.window.Event('change', { bubbles: true }));
assert.equal(menuScene.map.scene.parallax, 0.55); assert.equal(menuDoc.querySelector('[data-parallax-value]').value, '0.55');
assert.equal(menuScene.undo.length, menuHistory + 1, '简化控件后仍一次交互一次撤销');
tab('assets').click(); assert.equal(materialDetails.open, true, '切换分类不重建高级设置节点');
menu.click('save'); assert.equal(menuDoc.querySelector('[data-draft-status]').textContent, '已保存');
menu.close();
log('Compact sidebar DOM tests passed (tabs, context, pending forms, keyboard, existing scene/material controls)');

// 自动铺高/全屏画布/游玩视野：仍只改变视图，并对布局监听与活动事务做好清理。
const immersive = setup(new Storage(), true), immersiveScene = immersive.scene;
const immersiveStyle = immersive.document.createElement('style'); immersiveStyle.textContent = readFileSync('src/scenes/editor.css', 'utf8');
immersive.document.head.append(immersiveStyle);
const immersiveWorkspace = () => immersive.document.querySelector('.workspace');
function dimensions(width, height) {
  Object.defineProperties(immersiveWorkspace(), { clientWidth: { value: width, configurable: true }, clientHeight: { value: height, configurable: true } });
}
dimensions(1200, 1100); immersive.notifyResize(); immersive.flushFrames();
const immersiveSvg = () => immersive.document.querySelector('svg');
assert.equal(immersiveScene.editorViewMode, 'height');
assert.ok(Math.abs(parseFloat(immersiveSvg().style.height) - 1060) < 1e-8, '画布铺满可用高度，不再固定在顶部 540px');
assert.equal(parseFloat(immersiveSvg().style.width) / immersiveScene.map.level.width, parseFloat(immersiveSvg().style.height) / 540, '横纵缩放严格一致');
immersive.click('save'); const immersiveMap = JSON.stringify(immersiveScene.map), immersiveHistory = immersiveScene.undo.length;
immersiveScene.setEditorZoom(1.25); immersiveWorkspace().scrollLeft = 128; immersiveWorkspace().scrollTop = 30;
immersive.click('view-fullscreen');
assert.equal(immersiveScene.canvasFullscreen, true);
assert.ok(immersiveScene.root.classList.contains('canvas-fullscreen'));
assert.equal(immersive.window.getComputedStyle(immersive.document.querySelector('.left-sidebar')).display, 'none');
assert.equal(immersive.window.getComputedStyle(immersive.document.querySelector('.property-sidebar')).display, 'none');
assert.equal(immersive.window.getComputedStyle(immersive.document.querySelector('main')).position, 'absolute');
assert.equal(immersive.document.querySelector('[data-action="view-fullscreen"]').getAttribute('aria-pressed'), 'true');
dimensions(1920, 1080); immersive.notifyResize(); immersive.flushFrames();
assert.ok(Math.abs(parseFloat(immersiveSvg().style.height) - 1040) < 1e-8);
// 当前全屏模式仍可按世界网格放置，取消/退出不改原来视图的缩放与滚动。
immersiveScene.tool = 'coin'; const beforeFullPlacement = JSON.stringify(immersiveScene.map), fullHistory = immersiveScene.undo.length;
const fullBox = immersiveSvg().getBoundingClientRect();
immersiveScene.pointerDown({ button: 0, pointerId: 1, target: immersiveSvg(), clientX: fullBox.left + 336 * immersiveScene.editorZoom,
  clientY: fullBox.top + 400 * immersiveScene.editorZoom });
assert.equal(immersiveScene.object().x, 336); assert.equal(immersiveScene.object().y, 400);
immersive.click('undo'); assert.equal(JSON.stringify(immersiveScene.map), beforeFullPlacement); assert.equal(immersiveScene.undo.length, fullHistory);
dimensions(1200, 1100);
immersiveSvg().dispatchEvent(new immersive.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert.equal(immersiveScene.canvasFullscreen, false); assert.equal(immersiveScene.editorZoom, 1.25);
assert.equal(immersiveWorkspace().scrollLeft, 128); assert.equal(immersiveWorkspace().scrollTop, 30);
assert.equal(immersive.window.getComputedStyle(immersive.document.querySelector('.left-sidebar')).display, 'flex');
assert.equal(JSON.stringify(immersiveScene.map), immersiveMap); assert.equal(immersiveScene.undo.length, immersiveHistory);
assert.equal(immersiveScene.hasUnsavedChanges(), false);
immersive.input('[data-meta="title"]', '待提交时不能藏起菜单'); immersive.click('view-fullscreen');
assert.equal(immersiveScene.canvasFullscreen, false); immersive.click('discard-fields');
Object.defineProperties(immersive.window, { innerWidth: { value: 1920, configurable: true }, innerHeight: { value: 1080, configurable: true } });
immersive.click('view-game'); const gameReference = cameraViewport.worldCameraView(1920, 1080);
const guide = immersiveSvg().querySelector('[data-game-view-guide] rect'); assert.ok(guide);
assert.equal(Number(guide.getAttribute('width')), gameReference.width); assert.equal(Number(guide.getAttribute('height')), gameReference.height);
assert.ok(Math.abs(immersiveScene.editorZoom - Math.min(1160 / gameReference.width, 1060 / gameReference.height)) < 1e-8);
assert.ok(parseFloat(immersiveSvg().style.marginTop) > 0, '严格相机比例时以留白居中，不通过拉伸填满');
immersive.click('view-height'); assert.equal(immersiveSvg().querySelector('[data-game-view-guide]'), null);
dimensions(1200, 2400); immersive.notifyResize(); immersive.flushFrames();
assert.ok(immersiveScene.editorZoom > 3, '大屏自动铺高不被手动 300% 上限截断');
assert.ok(Math.abs(parseFloat(immersiveSvg().style.height) - 2360) < 1e-8);
immersiveScene.tool = 'select'; immersiveScene.setSelection([ref('coin')]); immersiveScene.render();
const stableZoom = immersiveScene.editorZoom, dragStart = immersiveSvg().getBoundingClientRect();
immersiveScene.pointerDown({ button: 0, pointerId: 1, target: immersiveSvg().querySelector('[data-object="coin"]'),
  clientX: dragStart.left + 330 * stableZoom, clientY: dragStart.top + 390 * stableZoom });
immersiveScene.pointerMove({ clientX: dragStart.left + 362 * stableZoom, clientY: dragStart.top + 390 * stableZoom });
dimensions(1200, 900); immersive.notifyResize(); immersive.flushFrames();
assert.equal(immersiveScene.editorZoom, stableZoom, '交互中布局变化不改变坐标映射');
immersiveScene.endDrag(true); assert.equal(JSON.stringify(immersiveScene.map), immersiveMap);
assert.ok(Math.abs(immersiveScene.editorZoom * 540 - 860) < 1e-8, '结束交互后补做自适应');
const oldObserver = immersive.observers[0]; immersiveScene.events.emit('shutdown'); assert.equal(oldObserver.disconnected, true);
immersiveScene.create(); dimensions(1200, 900); immersive.notifyResize(); immersive.flushFrames();
const afterReopenZoom = immersiveScene.editorZoom; oldObserver.callback(); immersive.flushFrames();
assert.equal(immersiveScene.editorZoom, afterReopenZoom, '旧布局回调不能操作重新进入的编辑器');
immersive.close(); assert.ok(immersive.observers.every((observer) => observer.disconnected));
const fallbackResize = setup();
Object.defineProperty(fallbackResize.document.querySelector('.workspace'), 'clientHeight', { value: 800, configurable: true });
fallbackResize.window.dispatchEvent(new fallbackResize.window.Event('resize')); fallbackResize.flushFrames();
assert.ok(Math.abs(fallbackResize.scene.editorZoom * 540 - 760) < 1e-8, '无 ResizeObserver 时仍有窗口 resize 回退'); fallbackResize.close();
log('Immersive viewport DOM tests passed (height fill, fullscreen, game ratio, resize lifecycle)');

// Starflower/temporary platform remains one editable object throughout CRUD.
const flowers = setup(); const flowerScene = flowers.scene;
flowers.document.querySelector('[data-awakening-brush]').click();
assert.equal(flowerScene.tool, 'platform'); assert.equal(flowerScene.awakeningBrush, true);
const putFlower = (x, y) => {
  const svg = flowers.document.querySelector('svg'), rect = svg.getBoundingClientRect();
  flowerScene.pointerDown({ button: 0, pointerId: 1, target: svg,
    clientX: rect.left + x * flowerScene.editorZoom, clientY: rect.top + y * flowerScene.editorZoom });
};
putFlower(480, 320); putFlower(720, 272);
assert.equal(flowerScene.map.level.platforms.filter((p) => p.awakening).length, 2, '支持连续放置');
assert.equal(flowers.document.querySelectorAll('[data-awakening-preview]').length, 2);
const selectedFlower = JSON.stringify(flowerScene.object());
flowers.input('[data-awakening-field="durationMs"]', '1');
const flowerHistory = flowerScene.undo.length;
flowers.click('properties');
assert.equal(JSON.stringify(flowerScene.object()), selectedFlower); assert.equal(flowerScene.undo.length, flowerHistory);
assert.match(flowers.document.querySelector('footer').textContent, /操作失败|持续时间/, '跨 VM 的解析异常仍阻止提交，详细范围由纯解析测试覆盖');
flowers.input('[data-awakening-field="durationMs"]', '6000'); flowers.click('properties');
assert.equal(flowerScene.object().awakening.durationMs, 6000);
flowers.click('copy'); flowers.click('paste');
assert.equal(flowerScene.map.level.platforms.filter((p) => p.awakening).length, 3);
assert.equal(flowerScene.object().awakening.durationMs, 6000);
assert.notEqual(flowerScene.object().objectId, JSON.parse(selectedFlower).objectId);
flowers.click('undo'); assert.equal(flowerScene.map.level.platforms.filter((p) => p.awakening).length, 2);
flowers.click('redo'); assert.equal(flowerScene.map.level.platforms.filter((p) => p.awakening).length, 3);
const goalLock = flowers.document.querySelector('[data-meta="awakeningGoal"]'); goalLock.checked = true;
goalLock.dispatchEvent(new flowers.window.Event('input', { bubbles: true })); flowers.click('meta');
assert.equal(flowerScene.map.level.awakeningGoal, true);
const flowerSnapshot = JSON.stringify(flowerScene.map);
flowers.click('save'); flowers.click('export');
const flowerExport = maps.parseCustomMap(JSON.parse(await flowers.downloaded.text()));
assert.equal(flowerExport.level.awakeningGoal, true); assert.equal(flowerExport.level.platforms.filter((p) => p.awakening).length, 3);
flowerScene.setSelection(flowerScene.map.level.platforms.flatMap((p, index) => p.awakening ? [{ kind: 'platform', index }] : []));
flowerScene.render(); flowers.click('delete');
assert.equal(flowerScene.map.level.platforms.filter((p) => p.awakening).length, 0);
assert.equal(flowerScene.map.level.awakeningGoal, false, '删除最后的花苞同步解除无效终点锁');
flowers.click('undo'); assert.equal(JSON.stringify(flowerScene.map), flowerSnapshot);
flowerScene.setSelection([{ kind: 'platform', index: 1 }]); flowerScene.render();
const initialFlower = { ...flowerScene.object() }, flowerSvg = flowers.document.querySelector('svg'), flowerBox = flowerSvg.getBoundingClientRect();
flowerScene.tool = 'select';
const flowerGroup = flowerSvg.querySelector('[data-object="platform"][data-index="1"] [data-awakening-preview]');
assert.equal(flowerGroup.hasAttribute('pointer-events'), false, '花苞本身也能选中和拖动配对对象');
const grabX = initialFlower.x + initialFlower.awakening.budOffsetX, grabY = initialFlower.y + initialFlower.awakening.budOffsetY;
flowerScene.pointerDown({ button: 0, pointerId: 1, target: flowerGroup.querySelector('ellipse'),
  clientX: flowerBox.left + grabX * flowerScene.editorZoom, clientY: flowerBox.top + grabY * flowerScene.editorZoom });
flowerScene.pointerMove({ clientX: flowerBox.left + (grabX + 32) * flowerScene.editorZoom, clientY: flowerBox.top + (grabY + 16) * flowerScene.editorZoom });
flowerScene.endDrag();
assert.equal(flowerScene.object().x, initialFlower.x + 32); assert.equal(flowerScene.object().y, initialFlower.y + 16);
assert.equal(flowerScene.object().awakening.budOffsetX, initialFlower.awakening.budOffsetX, '整体拖动不改变相对关联');
flowers.click('undo'); assert.equal(JSON.stringify(flowerScene.map), flowerSnapshot);
flowers.close();
log('Awakening editor DOM tests passed (continuous placement, fields, validation, copy, history, drag, save/export and goal lock)');
