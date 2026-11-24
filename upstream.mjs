import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const url = 'https://github.com/harrythex42/Unsliced.git';
const folder = fileURLToPath(new URL('./.upstream/source/', import.meta.url));
const { commit } = JSON.parse(readFileSync(new URL('./upstream.json', import.meta.url), 'utf8'));
assert.match(commit, /^[0-9a-f]{40}$/u, 'Use a full Unsliced commit SHA.');
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
if (old !== commit) {
  runGit('fetch', '--depth=1', '--no-tags', url, commit);
  runGit('checkout', '--quiet', '--detach', commit);
}
assert.equal(git('rev-parse', 'HEAD'), commit);
console.log(`Unsliced 固定版本：${commit}`);

function pnpm(...args) {
  execFileSync('pnpm', args, {
    cwd: folder, stdio: 'inherit', shell: process.platform === 'win32'
  });
}
pnpm('install', '--frozen-lockfile');
if (process.argv.includes('--browser')) {
  pnpm('exec', 'playwright', 'install', 'chromium');
} else {
  pnpm('exec', 'turbo', 'run', 'build', '--filter=@breakflow/playwright...');
}
