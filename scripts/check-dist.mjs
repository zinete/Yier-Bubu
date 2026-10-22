import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { log } from 'node:console';
const root = resolve('dist');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const info = JSON.parse(readFileSync(join(root, 'build-info.json'), 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(info.version, pkg.version);
assert.ok(info.revision && Number.isFinite(Date.parse(info.builtAt)));
const files = readdirSync(join(root, 'assets'));
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert.ok(url.startsWith('./'), `Subpath-safe entry expected: ${url}`);
  assert.ok(existsSync(resolve(root, url)), `Missing entry: ${url}`);
}
assert.ok(files.some((name) => /^EditorScene-.*\.js$/.test(name)), 'Editor must remain a lazy chunk');
const entry = files.find((name) => /^index-.*\.js$/.test(name));
assert.ok(entry);
const bytes = (name) => statSync(join(root, 'assets', name)).size;
// Regression ceilings, not mobile load-speed acceptance thresholds.
assert.ok(bytes(entry) < 1_400_000, 'Entry JS exceeded the temporary regression budget');
const game = files.find((name) => /^GameApp-.*\.js$/.test(name));
assert.ok(game && bytes(game) < 1_400_000, 'Lazy game JS exceeded the existing regression budget');
assert.ok(bytes(entry) < 30_000, 'Device gate must load before Phaser and image imports');
assert.ok(!html.includes('GameApp-'), 'Mobile gate must not preload the game bundle in HTML');
assert.ok(files.some((name) => /^CoopScene-.*\.js$/.test(name)), 'Co-op scene remains a lazy chunk');
const total = files.reduce((sum, name) => sum + bytes(name), 0);
assert.ok(total < 23_000_000, 'Build exceeded the temporary regression budget');
log(`dist checked: v${info.version}, entry ${(bytes(entry) / 1024).toFixed(0)} KiB, all assets ${(total / 1048576).toFixed(2)} MiB (not first-screen transfer size)`);
