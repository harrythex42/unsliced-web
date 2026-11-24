import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { prepareDocument } from '../../packages/mcp/document.mjs';
import { boxOverflow, sourceSections } from '../../packages/mcp/page-checks.mjs';
import { generatePdf, DEFAULT_OPTIMAL_OPTIONS } from '../../packages/playwright/dist/index.js';
import { captureTables, inspectTables } from '../../scripts/check-table-fragments.mjs';
import { writeReports } from './reports.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..'), dist = join(here, 'dist'), output = join(root, 'output/web');
const python = process.env.UNSLICED_PYTHON || 'python3';
const sampleDir = join(root, 'samples');
const sampleNames = (await readdir(sampleDir, { recursive: true })).filter(n => n.endsWith('.md')).sort();
assert.ok(sampleNames.length, '找不到 Markdown 验收样例');
await mkdir(join(output, 'manual'), { recursive: true });

const prefix = '/projects/unsliced/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(prefix)) return res.writeHead(404).end();
    const file = resolve(dist, path.slice(prefix.length) || 'index.html');
    if (!file.startsWith(dist + sep)) return res.writeHead(404).end();
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'text/plain; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
const origin = new URL(base).origin;
const viewport = { width: 1360, height: 940 };
const remote = url => /^(?:https?|wss?):$/u.test(url.protocol) && url.origin !== origin;

async function openSite(browser, options = {}, configure = () => {}) {
  const context = await browser.newContext({ viewport, locale: 'zh-CN', serviceWorkers: 'block', ...options });
  const external = new Set(), requests = new Set(), badResponses = new Set();
  context.on('request', request => {
    requests.add(request.url());
    if (remote(new URL(request.url()))) external.add(request.url());
  });
  context.on('response', response => {
    if (response.url().startsWith(base) && !response.ok()) badResponses.add(response.url());
  });
  await context.route(remote, route => {
    external.add(route.request().url());
    return route.abort();
  });
  try {
    await configure(context);
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#preview').dataset.state === 'empty');
    return { page, external, requests, badResponses, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}

const fontRequest = url => url.startsWith(base + 'fonts/') && /\.(css|woff2)$/u.test(url);
const fontBinary = url => url.startsWith(base + 'fonts/') && url.endsWith('.woff2');
async function waitState(page, wanted = 'ready') {
  await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('#preview').dataset.state));
  assert.equal(await page.locator('#preview').getAttribute('data-state'), wanted, await page.locator('#status').innerText());
}
async function edit(page, source, wanted) {
  await page.locator('#markdown').fill(source);
  assert.ok(await page.locator('#print').isDisabled(), '修改后仍可打印旧内容');
  await waitState(page, wanted);
}

async function checkInterface(browser) {
  const checks = [];
  const site = await openSite(browser, { locale: 'en-US' }, context => context.addInitScript(() => {
    window.print = () => { window.suggestedName = document.title; };
  }));
  try {
    const { page, requests } = site;
    assert.match(await page.locator('h1').innerText(), /Turn Markdown into a PDF/u);
    assert.equal([...requests].filter(fontRequest).length, 0);
    assert.ok(await page.locator('#browser-note').isHidden());
    await page.click('#example');
    await waitState(page);
    assert.match(await page.locator('#preview h1').innerText(), /Reading Space Project/u);
    assert.ok(await page.locator('.breakflow-page').count() >= 2, '英文示例没有演示分页');
    assert.equal([...requests].filter(fontRequest).length, 0, '英文文稿下载了中文字体');
    await page.screenshot({ path: join(output, 'interface-en.png'), fullPage: true });
    await page.selectOption('#language', 'zh');
    await waitState(page);
    assert.match(await page.locator('h1').first().innerText(), /把 Markdown 存成 PDF/u);
    assert.match(await page.locator('#preview h1').innerText(), /阅读空间项目周报/u);
    assert.ok(await page.locator('.breakflow-page').count() >= 2, '中文示例没有演示分页');
    assert.ok([...requests].some(fontBinary), '未按需下载中文字体');
    await page.screenshot({ path: join(output, 'interface-zh.png'), fullPage: true });
    await page.click('#print');
    assert.equal(await page.evaluate(() => window.suggestedName), '阅读空间项目周报');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.title(), 'Unsliced');
    checks.push('界面切换、示例、按需字体、打印文件名');

    // The first (invalid) draft must be overtaken by a fast second input.
    await page.locator('#markdown').fill('<p>正在输入的临时内容</p>');
    assert.match(await page.locator('#status').innerText(), /正在排版/u);
    await edit(page, '# 最后一次修改\n\n这里是正文。 [链接](https://example.invalid/draft)');
    assert.equal(await page.locator('#preview h1').innerText(), '最后一次修改');
    assert.equal(await page.locator('#preview a[href]').count(), 0);
    await edit(page, '<p>HTML</p>', 'error');
    assert.match(await page.locator('#status').innerText(), /不支持直接写入 HTML/u);
    await edit(page, '![外链图片](https://example.invalid/picture.png)', 'error');
    assert.match(await page.locator('#status').innerText(), /内嵌图片/u);
    await edit(page, '# 长代码\n\n```text\n' + 'a line of text\n'.repeat(180) + '```', 'error');
    assert.match(await page.locator('#status').innerText(), /比一页还高/u);
    assert.equal(await page.evaluate(async () => {
      try { await fetch('https://example.invalid/this-must-not-leave'); return false; }
      catch { return true; }
    }), true, 'CSP 没有挡住外部请求');
    assert.deepEqual([...site.external], [], '页面发出了外部请求');
    assert.deepEqual([...site.badResponses], [], '子路径资源没有成功载入');
    checks.push('自动排版、最新输入、HTML/图片/超页提示、外网拦截、子路径');
  } finally {
    await site.close();
  }

  const other = await openSite(browser, {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/151.0'
  }, context => context.route('**/fonts/*.woff2', route => route.abort()));
  try {
    assert.match(await other.page.locator('h1').innerText(), /把 Markdown 存成 PDF/u);
    assert.match(await other.page.locator('#browser-note').innerText(), /推荐使用 Chrome 或 Edge/u);
    assert.ok(await other.page.locator('#browser-note').isVisible());
    assert.equal([...other.requests].filter(fontRequest).length, 0, '只打开中文界面就下载了字体');
    await edit(other.page, '# English still works\n\nTest text.');
    await edit(other.page, '# 中文\n\n测试字体失败提示。', 'error');
    assert.match(await other.page.locator('#status').innerText(), /中文字体暂时没能载入/u);
    assert.ok(await other.page.locator('#print').isDisabled());
    assert.deepEqual([...other.external], []);
    checks.push('非推荐浏览器仍可使用、中文界面不预载字体、字体失败提示');
  } finally {
    await other.close();
  }
  for (const [userAgent, warned] of [
    ['Mozilla/5.0 AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', true],
    ['Mozilla/5.0 AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0', false]
  ]) {
    const labelled = await openSite(browser, { userAgent, locale: 'en-US' });
    try {
      assert.equal(await labelled.page.locator('#browser-note').isVisible(), warned);
      assert.deepEqual([...labelled.external], []);
    } finally {
      await labelled.close();
    }
  }
  checks.push('Safari 与 Edge 的浏览器提示分支（模拟浏览器名称）');
  return checks;
}

function planStats(plan) {
  const partial = new Set(plan.pages.flatMap(page => page.items.filter(i => i.isPartial && !i.tableSplit?.isSplit).map(i => i.nodeId)));
  return {
    pages: plan.pageCount,
    starts: plan.pages.map(page => {
      const i = page.items[0];
      return i ? [i.nodeId, i.tagName.toLowerCase(), i.tableSplit?.startRowIndex ?? null] : null;
    }),
    whitespace: plan.pages.map(p => +(100 * p.remainingSpace / p.availableHeight).toFixed(1)),
    split: partial.size + plan.fixes.filter(x => x.type === 'split-oversized-element').length,
    tableContinuations: plan.pages.flatMap(p => p.items).filter(i => i.tableSplit?.repeatsHeader).length,
    strandedHeadings: plan.pages.slice(0, -1).filter(p => /^h[1-6]$/iu.test(p.items.at(-1)?.tagName ?? '')).length
  };
}

async function resetImages(folder) {
  await mkdir(folder, { recursive: true });
  for (const entry of await readdir(folder)) {
    if (/^page-\d+\.png$/u.test(entry)) await unlink(join(folder, entry));
  }
}

async function mcpReference(browser, markdown, dir) {
  const html = prepareDocument({ markdown });
  const selector = '[data-unsliced-root]';
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html);
    const sections = await sourceSections(page, selector);
    const tables = await page.locator(selector).evaluate(captureTables);
    const summaries = {};
    for (const [strategy, folder] of [['optimal', 'mcp'], ['greedy-scored', 'greedy']]) {
      const target = join(dir, folder);
      await resetImages(target);
      const pdf = join(target, 'document.pdf');
      const { result } = await generatePdf({ html, selector, strategy, page: { format: 'A4' },
        config: { optimal: DEFAULT_OPTIMAL_OPTIONS }, settleTimeoutMs: 0, playwrightPage: page, output: pdf });
      summaries[folder] = planStats(result);
      execFileSync(python, [join(root, 'scripts/render_pdf_pages.py'), pdf, join(target, 'page'), '120']);
    }
    return { sections, tables, ...summaries };
  } finally {
    await context.close();
  }
}

function runPython(script, args, data) {
  return JSON.parse(execFileSync(python, [script, ...args], {
    encoding: 'utf8', input: JSON.stringify(data), env: { ...process.env, PYTHONUTF8: '1' }
  }));
}

async function pageContents(page) {
  return page.locator('.breakflow-page').evaluateAll(pages => pages.map(sheet => {
    const root = sheet.querySelector('[data-breakflow-page-root]');
    function visibleText(el) {
      if (!el) return '';
      if (el.nodeType === Node.TEXT_NODE) return el.data;
      if (!(el instanceof Element) || getComputedStyle(el).display === 'none' ||
          getComputedStyle(el).visibility === 'hidden') return '';
      return Array.from(el.childNodes, visibleText).join('');
    }
    const first = root.firstElementChild;
    const text = visibleText(root);
    const search = [...new Set(text.match(/\p{Script=Han}{3,6}|[a-zA-Z]{5,12}/gu) ?? [])];
    const firstRow = first?.matches('table') ? first.querySelector('tbody tr') : null;
    const firstText = firstRow ? visibleText(first.querySelector('thead')) + visibleText(firstRow) : visibleText(first);
    const startRow = first?.classList.contains('breakflow-table-slice') ? firstRow?.dataset.breakflowRowIndex : undefined;
    return { text, first: firstText, search: search.slice(0, 18), images: root.querySelectorAll('img').length,
      start: first ? [first.dataset.breakflowNodeId, first.localName, startRow === undefined ? null : Number(startRow)] : null };
  }));
}

async function checkSample(browser, name) {
  const slug = name.replace(/\.md$/u, '').split(sep).join('--');
  const dir = join(output, slug), webDir = join(dir, 'web');
  await resetImages(webDir);
  const source = (await readFile(join(sampleDir, name), 'utf8')).trim();
  const ref = await mcpReference(browser, source, dir);
  const site = await openSite(browser);
  try {
    const { page } = site;
    const noFontBeforeInput = ![...site.requests].some(fontRequest);
    await edit(page, source);
    const screen = await pageContents(page);
    await page.emulateMedia({ media: 'print' });
    const printDOM = await pageContents(page);
    const pdf = join(webDir, 'document.pdf');
    await page.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    const table = await page.evaluate(inspectTables, { sources: ref.tables, minimum: DEFAULT_OPTIMAL_OPTIONS.minTableRows, issues: [] });
    const compare = { sections: ref.sections, headers: table.headers };
    const physical = runPython(join(here, 'check_pdf.py'), [pdf, join(webDir, 'page')], screen);
    const original = runPython(join(root, 'scripts/verify_pdf_text.py'), [pdf], compare);
    const starts = screen.map(p => p.start);
    const mcpDifferences = Array.from({ length: Math.max(starts.length, ref.mcp.starts.length) }, (_, i) => i)
      .filter(i => JSON.stringify(starts[i]) !== JSON.stringify(ref.mcp.starts[i]))
      .map(i => ({ page: i + 1, web: starts[i] ?? null, mcp: ref.mcp.starts[i] ?? null }));
    const row = { name, slug, previewCount: screen.length, pdfCount: physical.pages,
      startsMatch: !physical.starts.length && JSON.stringify(screen) === JSON.stringify(printDOM) && screen.length === physical.pages,
      pageCountMatches: screen.length === physical.pages, blank: physical.blank, nonA4: physical.nonA4,
      textCorrect: !original.differences.length && !physical.text.length && !physical.missingSearch.length,
      external: [...site.external], mcpDifferences, mcp: ref.mcp, greedy: ref.greedy, starts, physical, original,
      details: [...table.errors, ...await boxOverflow(page)] };
    if (!row.startsMatch) row.details.push('PDF 和预览的逐页开头不一致');
    if (!row.pageCountMatches) row.details.push('PDF 页数和预览不一致');
    if (row.blank.length) row.details.push('存在空白页');
    if (row.nonA4.length) row.details.push('纸张不是 A4');
    if (!row.textCorrect) row.details.push('文字与原文/预览不一致或无法搜索', ...original.differences);
    if (row.external.length) row.details.push('发出了外部请求');
    if (physical.imageMismatch.length) row.details.push('PDF 中的图片数量和预览不一致');
    if (site.badResponses.size) row.details.push('网页资源载入失败：' + [...site.badResponses].join('、'));
    if (!noFontBeforeInput) row.details.push('没有文稿时就下载了字体');
    await writeFile(join(webDir, 'text-reference.json'), JSON.stringify(compare, null, 2));
    await writeFile(join(webDir, 'preview-reference.json'), JSON.stringify(screen, null, 2));
    return row;
  } finally {
    await site.close();
  }
}

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.UNSLICED_CHROMIUM || undefined });
  const result = { browser: browser.version(), sampleCount: sampleNames.length, rows: [], interfaceChecks: [], errors: [] };
  try { result.interfaceChecks = await checkInterface(browser); }
  catch (error) { result.errors.push('界面与隐私检查：' + error.message); }
  for (const name of sampleNames) {
    try {
      const row = await checkSample(browser, name);
      result.rows.push(row);
      console.log(`${name}：${row.details.length ? '失败' : '通过'}；${row.pdfCount} 页；与 MCP 比较：${row.mcpDifferences.length ? '不同（仅记录）' : '相同'}`);
    } catch (error) {
      result.errors.push(name + '：' + error.message);
    }
  }
  await writeReports(output, result);
  for (const error of result.errors) console.error(error);
  for (const row of result.rows) for (const detail of row.details) console.error(`${row.name}：${detail}`);
  if (result.errors.length || result.rows.some(r => r.details.length)) process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
