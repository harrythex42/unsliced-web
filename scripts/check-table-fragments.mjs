// Both functions run in the browser. Capture the reference before pagination.
export function captureTables(root) {
  return Array.from(root.querySelectorAll('table'), table => {
    const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows)).filter(row => row.getClientRects().length);
    const head = table.tHead ? Array.from(table.tHead.rows) : [];
    if (!table.tHead) {
      while (rows[0]?.cells.length && Array.from(rows[0].cells).every(cell => cell.tagName === 'TH')) head.push(rows.shift());
    }
    const cells = row => Array.from(row.cells, cell => cell.innerText.replace(/\s/gu, ''));
    return { header: head.map(cells), rows: rows.map(cells) };
  });
}

export function inspectTables({ sources, minimum, issues }) {
  const errors = [];
  const headers = {};
  const groups = new Map();
  const pages = Array.from(document.querySelectorAll('.breakflow-page'));
  for (const [i, page] of pages.entries()) {
    for (const table of page.querySelectorAll('table[data-breakflow-table-index]')) {
      const key = table.dataset.breakflowTableIndex;
      if (!sources[key]) { errors.push('无原表可对照'); continue; }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ table, page: i + 1 });
    }
  }
  const signature = row => Array.from(row.cells, cell => cell.innerText.replace(/\s/gu, ''));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const parts = [];
  for (const [key, slices] of groups) {
    if (slices.length === 1 && !slices[0].table.classList.contains('breakflow-table-slice')) continue;
    const source = sources[key];
    let expected = 0;
    const counts = [];
    for (const [i, { table, page }] of slices.entries()) {
      const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows));
      const header = Array.from(table.tHead?.rows ?? [], signature);
      if (!equal(source.header, header)) errors.push('第 ' + page + ' 页表头缺失或内容不同');
      if (i && source.header.length) headers[page] = source.header.flat().join('');
      const label = '第 ' + page + ' 页表 ' + (+key + 1);
      const relaxed = issues.some(issue => issue.type === 'short-table-fragment' &&
        issue.details.nodeId === table.dataset.breakflowNodeId && issue.details.startRowIndex === expected);
      if (!rows.length || (rows.length < minimum && !relaxed)) errors.push(label + ' 数据行数不足');
      const content = table.closest('.breakflow-page-content');
      const box = content.getBoundingClientRect();
      const style = getComputedStyle(content);
      const top = box.top + parseFloat(style.paddingTop), bottom = box.bottom - parseFloat(style.paddingBottom);
      for (const row of rows) {
        const bounds = row.getBoundingClientRect();
        if (bounds.top < top - 0.05 || bounds.bottom > bottom + 0.05)
          errors.push(label + ' 数据行跨越页面边界：原表第 ' + (expected + 1) + ' 行');
        if (Number(row.dataset.breakflowRowIndex) !== expected || !equal(signature(row), source.rows[expected]))
          errors.push(label + ' 数据行被切开、遗失或顺序错误：原表第 ' + (expected + 1) + ' 行');
        expected++;
      }
      counts.push(rows.length);
    }
    if (expected !== source.rows.length) errors.push('原表数据行数不一致');
    parts.push(counts);
  }
  return { errors, headers, parts };
}
