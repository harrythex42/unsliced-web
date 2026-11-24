import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const files = ['web', 'mcp', 'greedy'];
const names = ['网页版', 'MCP 全局最优', 'MCP 贪心'];
const yes = value => value ? '是' : '否';
const list = array => array.length ? array.join('、') : '无';
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const link = (...parts) => parts.map(encodeURIComponent).join('/');

export async function writeReports(output, result) {
  const lines = [
    '# Unsliced 网页版验收', '',
    `Chromium ${result.browser} 自动打印。使用静态网站的子路径测试，没有启用部署。`,
    '[逐页并排对照](comparison.html) · [中文界面](interface-zh.png) · [English interface](interface-en.png) · [详细结果](metrics.json)', '',
    'PDF 关闭页眉页脚；核对页开头与正文，其中包括长表续页。核对原文只忽略空白，不把形似字当成相同。'
      + '与 MCP 的页开头差异是参考，不扣分。', '',
    '| 样例 | 结果 | 预览与 PDF 页开头一致 | 预览 → PDF 页数 | 空白页 | A4 | 文字正确且可搜索 | 网站外请求 | 与 MCP 页开头不同 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  const gallery = [
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Unsliced · 网页与 MCP 逐页对照</title>',
    '<style>body{background:#eef3fa;color:#18283e;font:16px system-ui;margin:18px}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0 0 12px}img{width:100%;height:auto;background:white}figcaption{padding:6px 0}a{color:#274f83}</style>',
    '<h1>Unsliced · 网页与 MCP 逐页对照</h1><p><a href="report.md">验收报告</a> · <a href="interface-zh.png">中文界面</a> · <a href="interface-en.png">English interface</a></p>'
  ];
  for (const row of result.rows) {
    const pdf = link(row.slug, 'web', 'document.pdf');
    lines.push(`| [${row.name}](${pdf}) | ${row.details.length ? '失败' : '通过'} | ${yes(row.startsMatch)} | ${row.previewCount} → ${row.pdfCount} | ${list(row.blank)} | ${yes(!row.nonA4.length)} | ${yes(row.textCorrect)} | ${row.external.length} | ${list(row.mcpDifferences.map(x => x.page))} |`);
    gallery.push(`<h2>${escape(row.name)}</h2>`);
    const sheets = await Promise.all(files.map(sub => readdir(join(output, row.slug, sub)).then(items => items
      .filter(file => /^page-\d+\.png$/u.test(file)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })))));
    for (let n = 0; n < Math.max(...sheets.map(items => items.length)); n++) {
      gallery.push('<section>' + sheets.map((items, col) => {
        const alt = `${names[col]} · 第 ${n + 1} 页`;
        const path = items[n] ? link(row.slug, files[col], items[n]) : '';
        return `<figure><figcaption>${alt}</figcaption>` +
          (path ? `<a href="${path}"><img loading="lazy" alt="${alt}" src="${path}"></a>` : '本版无此页') + '</figure>';
      }).join('') + '</section>');
    }
  }
  lines.push('', '## 界面与隐私', '', ...result.interfaceChecks.map(item => '- 通过：' + item));
  lines.push('', '## 同一原稿在 MCP 下的两种排法', '',
    '留白按可写正文区域计算；长表沿行拆分单列，不算意外切块。', '',
    '| 样例 | 排法 | 页数 | 每页留白 | 意外切块 | 长表续页 | 页底标题 |',
    '| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of result.rows) {
    for (const [label, stats] of [['贪心', row.greedy], ['全局最优', row.mcp]]) {
      lines.push(`| ${row.name} | ${label} | ${stats.pages} | ${stats.whitespace.map(n => n + '%').join('、')} | ${stats.split} | ${stats.tableContinuations} | ${stats.strandedHeadings} |`);
    }
  }
  const findings = [
    ...result.errors,
    ...result.rows.flatMap(row => row.details.map(detail => row.name + '：' + detail)),
    ...result.rows.flatMap(row => row.mcpDifferences.map(diff =>
      `${row.name} 第 ${diff.page} 页页首与 MCP 不同（网页版 ${describeStart(diff.web)}；MCP ${describeStart(diff.mcp)}）。`))
  ];
  lines.push('', '## 差异与失败详情', '', ...(findings.length ? findings.map(text => '- ' + text) : ['无。']));
  await Promise.all([
    writeFile(join(output, 'report.md'), lines.join('\n') + '\n'),
    writeFile(join(output, 'comparison.html'), gallery.join('\n') + '\n'),
    writeFile(join(output, 'metrics.json'), JSON.stringify(result, null, 2))
  ]);
}

function describeStart(start) {
  if (!start) return '没有该页';
  const [block, tag, row] = start;
  return `${tag} ${block ?? ''}${row === null ? '' : `，从表格第 ${row + 1} 个数据行开始`}`;
}
