import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const dist = join(here, 'dist');
const python = process.env.UNSLICED_PYTHON || 'python3';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsup'))('esbuild');
const mcpRequire = createRequire(join(root, 'packages/mcp/document.mjs'));
await mkdir(dist, { recursive: true });
execFileSync(python, [join(here, 'subset_font.py'), join(dist, 'fonts')], { stdio: 'inherit' });
await build({
  entryPoints: [join(here, 'app.mjs')], outfile: join(dist, 'app.js'), bundle: true,
  platform: 'browser', format: 'esm', alias: { marked: mcpRequire.resolve('marked') },
  banner: { js: '/*! BreakFlow and Unsliced contributors — MIT; see ./LICENSE. */' },
  minify: true
});
for (const [file, dest] of [
  [join(here, 'index.html'), 'index.html'],
  [join(here, 'ui.css'), 'ui.css'],
  [join(root, 'LICENSE'), 'LICENSE']
]) await copyFile(file, join(dist, dest));
const engine = await readFile(join(root, 'packages/browser/dist/index.global.js'), 'utf8');
await writeFile(join(dist, 'breakflow.js'),
  '/*! BreakFlow and Unsliced contributors — MIT; see ./LICENSE. */\n' +
  engine.replace(/\r?\n\/\/# sourceMappingURL=[^\r\n]+/u, ''));
await writeFile(join(dist, '.nojekyll'), '');
console.log('网页版静态文件：apps/web/dist/');
