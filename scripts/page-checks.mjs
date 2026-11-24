export async function boxOverflow(page) {
  return page.locator('.breakflow-page-content').evaluateAll(pages => pages.flatMap((content, index) => {
    const box = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    const bottom = box.bottom - Number.parseFloat(style.paddingBottom);
    const top = box.top + Number.parseFloat(style.paddingTop);
    const left = box.left + Number.parseFloat(style.paddingLeft);
    const right = box.right - Number.parseFloat(style.paddingRight);
    return Array.from(content.querySelectorAll('*')).flatMap(node => {
      const rect = node.getBoundingClientRect();
      if (!rect.height) return [];
      const overshoot = { 下: rect.bottom - bottom, 上: top - rect.top, 左: left - rect.left, 右: rect.right - right };
      return Object.entries(overshoot).filter(([, px]) => px > 0.05).map(([edge, px]) =>
        `第 ${index + 1} 页的 ${node.id ? '#' + node.id : node.tagName.toLowerCase()} 超出${edge}边界 ${px.toFixed(2)}px`);
    });
  }));
}

export async function sourceSections(page, selector) {
  return page.locator(selector).evaluate(root => {
    function visibleText(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.data;
      if (!(node instanceof Element)) return '';
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'template', 'noscript', 'title', 'desc'].includes(tag)) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return '';
      return Array.from(node.childNodes, visibleText).join('');
    }

    let heading = '';
    const sections = [];
    for (const [index, node] of Array.from(root.childNodes).entries()) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        const label = `第 ${index + 1} 个子节点的裸文本`;
        sections.push({ label: heading ? `${heading} / ${label}` : label, text: node.textContent });
        continue;
      }
      if (!(node instanceof Element)) continue;
      const tag = node.tagName.toLowerCase();
      const text = visibleText(node);
      if (!text?.trim()) continue;
      const label = node.id ? `#${node.id}` : `<${tag}> 第 ${index + 1} 个子节点`;
      if (/^h[1-6]$/u.test(tag)) heading = text.trim().slice(0, 48);
      sections.push({ label: heading ? `${heading} / ${label}` : label, text });
    }
    return sections;
  });
}
