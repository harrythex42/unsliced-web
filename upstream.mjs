import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const url = 'https://github.com/harrythex42/unsliced-mcp.git';
const folder = fileURLToPath(new URL('./.upstream/artifacts/', import.meta.url));
const { artifactCommit, coreCommit } = JSON.parse(readFileSync(new URL('./upstream.json', import.meta.url), 'utf8'));
assert.match(artifactCommit, /^[0-9a-f]{40}$/u, 'Use a full artifact commit SHA.');
assert.match(coreCommit, /^[0-9a-f]{40}$/u, 'Use a full core commit SHA.');
mkdirSync(folder, { recursive: true });

const git = (...args) => execFileSync('git', ['-C', folder, ...args], { encoding: 'utf8' }).trim();
const runGit = (...args) => execFileSync('git', ['-C', folder, ...args], { stdio: 'inherit' });
// The cache is local to this project; never use a sibling checkout.
try {
  assert.equal(resolve(git('rev-parse', '--show-toplevel')), resolve(folder));
} catch {
  runGit('init', '--quiet');
  assert.equal(resolve(git('rev-parse', '--show-toplevel')), resolve(folder));
}
const old = (() => {
  try { return git('rev-parse', '--verify', '--quiet', 'HEAD'); }
  catch { return ''; }
})();
if (old) assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Cached upstream has local changes.');
if (old !== artifactCommit) {
  runGit('fetch', '--depth=1', '--no-tags', url, artifactCommit);
  runGit('checkout', '--quiet', '--detach', artifactCommit);
}
assert.equal(git('rev-parse', 'HEAD'), artifactCommit);
const manifest = JSON.parse(readFileSync(join(folder, 'engine', 'manifest.json'), 'utf8'));
assert.equal(manifest.commit, coreCommit, 'Engine package does not match the pinned core version.');
for (const name of ['runtime/index.mjs', 'runtime/index.global.js', 'assets/fonts/UnslicedSansSC.ttf', 'assets/fonts/OFL.txt', 'LICENSE']) {
  const actual = createHash('sha256').update(readFileSync(join(folder, 'engine', name))).digest('hex');
  assert.equal(actual, manifest.sha256[name], `Engine file mismatch: ${name}`);
}
console.log(`Unsliced 分页版本：${coreCommit}（公开产物 ${artifactCommit}）`);

function pnpm(...args) {
  execFileSync('pnpm', args, {
    cwd: folder, stdio: 'inherit', shell: process.platform === 'win32'
  });
}
pnpm('install', '--frozen-lockfile');
if (process.argv.includes('--browser')) {
  pnpm('exec', 'playwright', 'install', 'chromium');
}
