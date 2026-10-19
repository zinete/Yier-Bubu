import assert from 'node:assert/strict';
import { log } from 'node:console';
import { JSDOM } from 'jsdom';
import { runtime } from './helpers/runtime.mjs';
const dom = new JSDOM('<!DOCTYPE html><body></body>');
const values = new Map();
let blocked = true;
const storage = {
  getItem(key) { if (blocked) throw new Error('blocked'); return values.get(key) ?? null; },
  setItem(key, value) { if (blocked) throw new Error('blocked'); values.set(key, value); },
};
const load = runtime({ localStorage: storage, document: dom.window.document });
const store = load('src/systems/ProgressStore.ts');
const { mountProgressNotice } = load('src/systems/ProgressNotice.ts');
const dispose = mountProgressNotice();
const notice = dom.window.document.querySelector('.progress-notice');
assert.equal(notice.hidden, false);
assert.match(notice.textContent, /暂不可读取/);
const [retry, dismiss] = notice.querySelectorAll('button');
dismiss.click();
assert.equal(notice.hidden, true);
store.completeLevel('1-1', 200, true);
assert.equal(notice.hidden, false, '新的写失败重新提示');
assert.match(notice.textContent, /刷新或关闭后可能丢失/);
retry.click();
assert.match(notice.textContent, /仍不可用/);
blocked = false;
retry.click();
assert.equal(notice.hidden, true);
assert.equal(store.loadProgress().records['1-1'].bestScore, 200);
dispose();
assert.equal(dom.window.document.querySelector('.progress-notice'), null);
blocked = true;
store.beginLevel('1-2');
assert.equal(notice.hidden, true, '卸载后不再更新已移除的通知');
dom.window.close();
log('progress notice: warning, dismiss, retry and cleanup passed');
