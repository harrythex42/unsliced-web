import { Marked } from 'marked';
import { prepareDocument } from '../../packages/mcp/document.mjs';
import { examples } from './examples.mjs';

const words = {
  zh: {
    language: '语言', headline: '把 Markdown 存成 PDF', intro: '粘贴文稿，确认每页怎么排，再存为 PDF。',
    browserNote: '推荐使用 Chrome 或 Edge，其他浏览器打印时分页可能不准确',
    input: 'Markdown 文稿', example: '试试示例', print: '存为 PDF',
    inputHint: '只支持 Markdown。插图请用内嵌图片，不要用外链。',
    printHint: '在打印窗口里，目标选「另存为 PDF」，纸张 A4，比例 100%，页眉和页脚保持关闭。',
    privacy: '文稿只在这台电脑上排版，不上传、无统计、不保存历史；字体等文件只从本站加载。',
    preview: '分页预览', empty: '排好的页面会出现在这里。', working: '正在排版…',
    ready: count => `A4 · 共 ${count} 页`,
    html: '这里支持 Markdown，不支持直接写入 HTML。请用「# 标题」写标题、用「**文字**」加粗；如果只是展示 HTML 代码，请用三反引号围起来。',
    image: '无法使用这张图片。请将 PNG、JPEG、GIF 或 WebP 作为内嵌图片，或者移除这张图后再试。',
    font: '中文字体暂时没能载入。请检查网络，刷新页面后重新粘贴文稿再试。',
    tall: '有一段内容比一页还高。请在长段落中间空一行、把长代码拆成几段，或缩小图片后再试。',
    noPages: '还没有可打印的内容。请加一点文字或标题再试。',
    other: '暂时无法排版。请先试一小段文稿，或刷新页面后重试。',
    openSource: '开源项目', mit: 'BreakFlow / MIT 许可证', ofl: '字体许可证（OFL）',
    placeholder: '# 你的文稿标题\n\n在这里粘贴或输入 Markdown。'
  },
  en: {
    language: 'Language', headline: 'Turn Markdown into a PDF', intro: 'Paste a draft, check the page breaks, then save it as a PDF.',
    browserNote: 'We recommend Chrome or Edge. Page breaks may differ when printing from other browsers.',
    input: 'Markdown draft', example: 'Try an example', print: 'Save as PDF',
    inputHint: 'Markdown only. Embed images in the draft instead of linking to a website.',
    printHint: 'In the print dialog: choose Save as PDF, A4, scale 100%, and turn off headers and footers.',
    privacy: 'Your draft stays on this device: no uploads, tracking or saved history. All app files load from this site.',
    preview: 'Page preview', empty: 'Your pages will appear here.', working: 'Laying out pages…',
    ready: count => `A4 · ${count} ${count === 1 ? 'page' : 'pages'}`,
    html: 'This page accepts Markdown, not raw HTML. Try “# Title” for a heading and “**text**” for bold. To show HTML as code, wrap it in triple backticks.',
    image: 'This image could not be included. Embed a PNG, JPEG, GIF or WebP in your draft, or remove the image and try again.',
    font: 'The Chinese font could not load. Check your connection, reload the page, then paste your draft again.',
    tall: 'A block is taller than one page. Add a blank line to break up a long paragraph, split a long code block, or use a smaller image.',
    noPages: 'There is nothing to print yet. Add some text or a heading and try again.',
    other: 'The draft could not be laid out. Try a shorter section or reload the page and try again.',
    openSource: 'Open source', mit: 'BreakFlow / MIT', ofl: 'Font license (OFL)',
    placeholder: '# Your document title\n\nPaste or type Markdown here.'
  }
};
const $ = id => document.getElementById(id);
const editor = $('markdown'), print = $('print'), preview = $('preview'), stage = $('measure'), viewport = $('preview-viewport');
const markdown = new Marked({ gfm: true });
const han = /\p{Script=Han}/u;
const fontFile = './fonts/font.css';
const siteTitle = 'Unsliced';
let language, display = { key: '' }, timer, version = 0, due = null, rendering = false, usingExample = false;
let heading = '', fontSheet;

function displayStatus(key, kind = '', count) {
  display = { key, kind, count };
  const message = words[language][key];
  $('status').textContent = typeof message === 'function' ? message(count) : message ?? '';
  $('status').dataset.kind = kind;
  preview.dataset.state = kind || 'empty';
}

function setLanguage(next) {
  language = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  $('language').value = next;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = words[next][element.dataset.i18n];
  editor.placeholder = words[next].placeholder;
  displayStatus(display.key, display.kind, display.count);
  if (usingExample) showExample();
}

const ua = navigator.userAgent;
const chromeOrEdge = /\bEdg\/\d/u.test(ua) ||
  (/\b(?:Headless)?Chrome\/\d/u.test(ua) && !/\b(?:OPR|SamsungBrowser|Vivaldi|YaBrowser|EdgA)\//u.test(ua));
$('browser-note').hidden = chromeOrEdge;
setLanguage(/^zh(?:-|$)/iu.test(navigator.language) ? 'zh' : 'en');
$('language').onchange = event => setLanguage(event.target.value);

// Screen-only scaling keeps the whole sheet visible on narrow screens. A4
// sizing and page contents used for printing never depend on this scale.
function fitPreview() {
  const style = getComputedStyle(viewport);
  const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  viewport.style.setProperty('--preview-scale', Math.min(1, Math.max(0.1, available / (210 * 96 / 25.4))));
}
new ResizeObserver(fitPreview).observe(viewport);

class DraftError extends Error {}
function mediumTimeout(promise) {
  let timeout;
  return Promise.race([promise, new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new DraftError('font')), 15000);
  })]).finally(() => clearTimeout(timeout));
}

async function waitForFont(root) {
  if (!han.test(root.innerText)) return;
  root.style.fontFamily = '"Unsliced Sans SC", ' + getComputedStyle(root).fontFamily;
  try {
    if (!fontSheet) {
      fontSheet = document.createElement('link');
      fontSheet.rel = 'stylesheet';
      fontSheet.href = fontFile;
      await mediumTimeout(new Promise((resolve, reject) => {
        fontSheet.onload = resolve;
        fontSheet.onerror = reject;
        document.head.append(fontSheet);
      }));
    }
    root.getBoundingClientRect();
    await mediumTimeout(document.fonts.ready);
    const faces = Array.from(document.fonts).filter(face => face.family.replaceAll('"', '') === 'Unsliced Sans SC');
    if (!faces.some(face => face.status === 'loaded') || faces.some(face => face.status === 'error')) throw new DraftError('font');
  } catch {
    fontSheet?.remove();
    fontSheet = null;
    throw new DraftError('font');
  }
}

function addDocumentStyles(css) {
  if (document.getElementById('document-styles')) return;
  // Reuse MCP typography, but keep it from styling the editor and toolbar.
  // The shared Markdown sheet is made of plain element/ID selector lists.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const scope = '#unsliced-markdown';
  const style = document.createElement('style');
  style.id = 'document-styles';
  style.textContent = Array.from(sheet.cssRules, rule => {
    const selectors = rule.selectorText.split(',').map(part => {
      const selector = part.trim();
      return selector === 'body' || selector === scope ? scope : `${scope} ${selector}`;
    });
    return `${selectors.join(', ')} { ${rule.style.cssText} }`;
  }).join('\n');
  document.head.append(style);
}

async function layout(source) {
  markdown.walkTokens(markdown.lexer(source), token => {
    if (token.type === 'html') throw new DraftError('html');
  });
  let html;
  try {
    html = prepareDocument({ markdown: source });
  } catch (error) {
    if (error.message.includes('图片请嵌入')) throw new DraftError('image');
    throw error;
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const root = parsed.getElementById('unsliced-markdown');
  // The shared sanitizer already limits image URLs. Remove even valid link
  // destinations so a document cannot initiate a navigation.
  for (const node of root.querySelectorAll('a[href]')) node.removeAttribute('href');
  addDocumentStyles(parsed.head.querySelector('style').textContent);
  stage.append(root);
  await waitForFont(root);
  await Promise.all(Array.from(root.querySelectorAll('img'), async image => {
    try { await image.decode(); }
    catch { throw new DraftError('image'); }
  }));
  const title = root.querySelector('h1,h2,h3,h4,h5,h6')?.textContent.trim() ?? '';
  const result = await BreakFlow.createPaginator({
    strategy: 'optimal', optimal: BreakFlow.DEFAULT_OPTIMAL_OPTIONS, page: { format: 'A4' }
  }).paginate(root);
  if (result.issues.some(issue => issue.type === 'oversized-element' || issue.type === 'overflow') ||
      result.fixes.some(fix => fix.type === 'split-oversized-element')) throw new DraftError('tall');
  if (result.issues.some(issue => issue.severity === 'error')) throw new DraftError('other');
  if (!result.pageCount) throw new DraftError('noPages');
  return { element: result.element, count: result.pageCount, title };
}

async function render() {
  if (rendering || due !== version) return;
  const job = due;
  due = null;
  rendering = true;
  try {
    const { element, count, title } = await layout(editor.value.trim());
    if (job !== version) return;
    preview.replaceChildren(element);
    heading = title;
    $('empty').hidden = true;
    print.disabled = false;
    displayStatus('ready', 'ready', count);
  } catch (error) {
    if (job === version) displayStatus(error instanceof DraftError ? error.message : 'other', 'error');
  } finally {
    stage.replaceChildren();
    rendering = false;
    if (due === version) render();
  }
}

function schedule(composing = false) {
  const job = ++version;
  clearTimeout(timer);
  due = null;
  preview.replaceChildren();
  $('empty').hidden = false;
  print.disabled = true;
  document.title = siteTitle;
  const content = editor.value.trim();
  displayStatus(content ? 'working' : '', content ? 'working' : '');
  if (content && !composing) timer = setTimeout(() => {
    due = job;
    render();
  }, 320);
}

function showExample() {
  usingExample = true;
  editor.value = examples[language];
  editor.scrollTop = 0;
  schedule();
}

$('example').onclick = showExample;
editor.oninput = event => {
  usingExample = false;
  schedule(event.isComposing);
};
editor.addEventListener('compositionend', () => schedule());
print.onclick = () => {
  if (print.disabled) return;
  // This is a suggested filename; the browser and OS can still change it.
  document.title = heading.replace(/[\\/:*?"<>|]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 100) || 'Unsliced';
  window.print();
};
window.addEventListener('afterprint', () => { document.title = siteTitle; });
