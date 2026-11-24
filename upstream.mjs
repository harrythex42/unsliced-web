import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pin from './upstream.json' with { type: 'json' };
import project from './package.json' with { type: 'json' };

const repository = 'https://github.com/harrythex42/unsliced-core';
const folder = fileURLToPath(new URL('./.upstream/core/', import.meta.url));
const asset = 'unsliced-engine.tar.gz';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['LICENSE', 'runtime/index.mjs', 'runtime/index.global.js',
  'assets/fonts/UnslicedSansSC.ttf', 'assets/fonts/OFL.txt', 'assets/fonts/README.md'];

assert.match(pin.tag, /^core-v\d+\.\d+\.\d+$/u);
assert.match(pin.commit, /^[0-9a-f]{40}$/u);
assert.match(pin.sha256, /^[0-9a-f]{64}$/u);
await mkdir(folder, { recursive: true });
const cached = join(folder, `${pin.sha256}.tar.gz`);
let bytes = await readFile(cached).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (!bytes) {
  const response = await fetch(`${repository}/releases/download/${pin.tag}/${asset}`,
    { signal: AbortSignal.timeout(120_000) });
  assert.ok(response.ok, `Core download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
assert.equal(hash(bytes), pin.sha256, 'Core archive checksum mismatch');

const stage = await mkdtemp(join(folder, 'verify-'));
try {
  const archive = join(stage, asset);
  await writeFile(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', stage], { stdio: 'inherit' });
  const manifest = JSON.parse(await readFile(join(stage, 'engine/manifest.json'), 'utf8'));
  assert.equal(manifest.upstream, repository);
  assert.equal(manifest.commit, pin.commit, 'Wrong Core source commit');
  assert.equal(manifest.playwright, project.devDependencies.playwright);
  assert.deepEqual(Object.keys(manifest.sha256).sort(), [...files].sort());
  for (const file of files) {
    assert.equal(hash(await readFile(join(stage, 'engine', file))), manifest.sha256[file], `Core file mismatch: ${file}`);
  }
  for (const file of [...files, 'manifest.json']) {
    const target = join(folder, 'engine', file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(stage, 'engine', file), target);
  }
  await copyFile(archive, cached);
} finally {
  await rm(stage, { recursive: true, force: true });
}
console.log(`Unsliced Core ${pin.tag} (${pin.commit})`);
