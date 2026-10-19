import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let revision = process.env.GITHUB_SHA?.slice(0, 12) ?? 'local';
try {
  if (revision === 'local') revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) revision += '-dirty';
} catch { /* A source archive can still be built without Git. */ }
const buildInfo = { version, revision, builtAt: new Date().toISOString(), channel: 'public-preview' };
export default defineConfig({
  base: './', server: { host: true },
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  plugins: [{
    name: 'release-build-info',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(buildInfo, null, 2) }); },
  }],
});
