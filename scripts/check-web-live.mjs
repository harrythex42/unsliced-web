import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './upstream-browser.mjs';
import { prepareDocument } from '#upstream/document.mjs';
import { sourceSections } from '#upstream/page-checks.mjs';
import { DEFAULT_OPTIMAL_OPTIONS } from '#upstream/engine/runtime/index.mjs';
import { captureTables, inspectTables } from './check-table-fragments.mjs';

const site = 'https://harrythex42.github.io/unsliced-web/';
const origin = new URL(site).origin;
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'output/web-live');
const python = process.env.UNSLICED_PYTHON || 'python3';
const sampleDir = join(root, 'samples');
const names = (await readdir(sampleDir, { recursive: true })).filter(name => name.endsWith('.md')).sort();
assert.ok(names.length, '找不到 Markdown 样例');
await mkdir(join(output, 'manual'), { recursive: true });

const nonSite = url => /^(?:https?|wss?):$/u.test(url.protocol) && url.origin !== origin;
const isFont = url => url.startsWith(site + 'fonts/') && url.endsWith('.woff2');
const viewport = { width: 1360, height: 940 };
const browser = await chromium.launch({ executablePath: process.env.UNSLICED_CHROMIUM || undefined });

async function open() {
  const context = await browser.newContext({ viewport, locale: 'en-US', serviceWorkers: 'block' });
  const outside = new Set(), fonts = new Set(), failed = new Set();
  context.on('request', request => {
    if (nonSite(new URL(request.url()))) outside.add(request.url());
  });
  context.on('response', response => {
    if (isFont(response.url()) && response.ok()) fonts.add(response.url());
    if (response.url().startsWith(site) && !response.ok()) failed.add(response.url());
  });
  // Record attempted requests as a failure, and block them before transmission.
  await context.route(nonSite, route => {
    outside.add(route.request().url());
    return route.abort();
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(site, { timeout: 20000 });
    assert.ok(response?.ok(), `网页打开失败：HTTP ${response?.status()}`);
    await page.locator('#preview[data-state=empty]').waitFor({ state: 'attached', timeout: 10000 });
    return { page, context, fonts, outside, failed };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function ready(page) {
  const preview = page.locator('#preview');
  await page.locator('#preview:is([data-state=ready], [data-state=error])').waitFor({ state: 'attached', timeout: 20000 });
  assert.equal(await preview.getAttribute('data-state'), 'ready', await page.locator('#status').innerText());
}

async function checkExample() {
  const session = await open();
  try {
    const { page, fonts, outside, failed } = session;
    assert.match(await page.locator('.intro h1').innerText(), /Turn Markdown into a PDF/u);
    assert.equal(fonts.size, 0);
    await page.click('#example');
    await ready(page);
    assert.match(await page.locator('#preview h1').innerText(), /Reading Space Project/u);
    assert.equal(await page.locator('.breakflow-page').count(), 2);
    assert.equal(fonts.size, 0, '英文示例不应下载中文字体');
    await page.screenshot({ path: join(output, 'interface-en.png'), fullPage: true });
    await page.selectOption('#language', 'zh');
    await ready(page);
    assert.match(await page.locator('.intro h1').innerText(), /把 Markdown 存成 PDF/u);
    assert.equal(await page.locator('#preview h1').innerText(), '阅读空间项目周报');
    assert.equal(await page.locator('.breakflow-page').count(), 2);
    assert.ok(fonts.size > 0, '中文字体没有从本站载入');
    await page.screenshot({ path: join(output, 'interface-zh.png'), fullPage: true });
    assert.deepEqual([...outside], [], '网页试图请求外站');
    assert.deepEqual([...failed], [], '有网站资源载入失败');
    return { english: true, chinese: true, example: true, fontAssets: [...fonts], outside: [...outside] };
  } finally {
    await session.context.close();
  }
}

async function sourceReference(markdown) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(prepareDocument({ markdown }));
    const selector = '#unsliced-markdown';
    return {
      sections: await sourceSections(page, selector),
      tables: await page.locator(selector).evaluate(captureTables)
    };
  } finally {
    await context.close();
  }
}

function pythonJson(script, args, data) {
  return JSON.parse(execFileSync(python, [join(root, script), ...args], {
    input: JSON.stringify(data), encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' }
  }));
}

async function checkSample(name) {
  const markdown = (await readFile(join(sampleDir, name), 'utf8')).trim();
  const reference = await sourceReference(markdown);
  const folder = join(output, name.replace(/\.md$/u, '').split(sep).join('--'));
  await mkdir(folder, { recursive: true });
  for (const file of await readdir(folder)) {
    if (/^page-\d+\.png$/u.test(file)) await unlink(join(folder, file));
  }
  const session = await open();
  try {
    const { page, fonts, outside, failed } = session;
    await page.locator('#markdown').fill(markdown);
    await ready(page);
    const preview = await page.locator('.breakflow-page [data-breakflow-page-root]').evaluateAll(pages => {
      const text = node => {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) return node.data;
        if (!(node instanceof Element) || getComputedStyle(node).display === 'none' ||
            getComputedStyle(node).visibility === 'hidden') return '';
        return Array.from(node.childNodes, text).join('');
      };
      return pages.map(root => {
        const first = root.firstElementChild;
        const firstRow = first?.matches('table') ? first.querySelector('tbody tr') : null;
        const full = text(root);
        return {
          first: firstRow ? text(first.querySelector('thead')) + text(firstRow) : text(first),
          text: full, images: root.querySelectorAll('img').length,
          search: [...new Set(full.match(/\p{Script=Han}{3,6}|[a-zA-Z]{5,12}/gu) ?? [])].slice(0, 18)
        };
      });
    });
    await page.emulateMedia({ media: 'print' });
    const table = await page.evaluate(inspectTables, {
      sources: reference.tables, minimum: DEFAULT_OPTIMAL_OPTIONS.minTableRows, issues: []
    });
    const pdf = join(folder, 'document.pdf');
    await page.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    const physical = pythonJson('check_pdf.py', [pdf, join(folder, 'page')], preview);
    const text = pythonJson('scripts/verify_pdf_text.py', [pdf], { sections: reference.sections, headers: table.headers });
    const row = {
      name, folder: folder.slice(output.length + 1), previewPages: preview.length, pdfPages: physical.pages,
      startsMatch: !physical.starts.length && physical.pages === preview.length,
      blank: physical.blank, nonA4: physical.nonA4,
      textCorrect: !text.differences.length && !physical.text.length && !physical.missingSearch.length,
      fontAssets: [...fonts], outside: [...outside], failedResources: [...failed], physical, text, tableErrors: table.errors
    };
    row.pass = row.startsMatch && !row.blank.length && !row.nonA4.length && row.textCorrect &&
      !row.outside.length && !row.failedResources.length && !physical.imageMismatch.length && !table.errors.length &&
      (!/\p{Script=Han}/u.test(markdown) || !!fonts.size);
    return row;
  } finally {
    await session.context.close();
  }
}

const results = { site, browser: browser.version(), interface: null, rows: [], errors: [] };
try {
  try { results.interface = await checkExample(); }
  catch (error) { results.errors.push('界面、示例或字体：' + error.message); }
  for (const name of names) {
    try {
      const row = await checkSample(name);
      results.rows.push(row);
      console.log(`${name}：${row.pass ? '通过' : '失败'}，${row.previewPages} → ${row.pdfPages} 页`);
    } catch (error) {
      results.errors.push(name + '：' + error.message);
    }
  }
  const lines = [
    '# Unsliced 线上检查', '', `${site} · Chromium ${results.browser}`,
    '', results.interface ? '中英文界面、周报示例和本站中文字体检查通过。' : '界面检查未通过，详见下方。', '',
    '| 样例 | 预览 → PDF 页数 | 页首相同 | 空白页 | A4 | 文字正确且可搜索 | 外站请求 | 结果 |',
    '| --- | --- | --- | --- | --- | --- | ---: | --- |'
  ];
  for (const row of results.rows) lines.push(`| [${row.name}](${encodeURIComponent(row.folder)}/document.pdf) | ${row.previewPages} → ${row.pdfPages} | ${row.startsMatch ? '是' : '否'} | ${row.blank.join('、') || '无'} | ${row.nonA4.length ? '否' : '是'} | ${row.textCorrect ? '是' : '否'} | ${row.outside.length} | ${row.pass ? '通过' : '失败'} |`);
  for (const error of results.errors) lines.push('', '- ' + error);
  await writeFile(join(output, 'metrics.json'), JSON.stringify(results, null, 2));
  await writeFile(join(output, 'report.md'), lines.join('\n') + '\n');
  if (results.errors.length || results.rows.some(row => !row.pass)) {
    for (const message of results.errors) console.error(message);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
