import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const markdown = new Marked({ gfm: true });
const markdownStyles = `
  body { margin:0; color:#243343; font: 15px/1.58 system-ui,sans-serif; }
  #unsliced-markdown { overflow-wrap:anywhere; }
  h1,h2,h3,h4,h5,h6 { color:#184b54; line-height:1.25; margin:1.1em 0 .45em; }
  h1 { font-size:2em; border-bottom:3px solid #2c827c; padding-bottom:.32em; margin-top:0; }
  p,ul,ol { margin:.5em 0 .85em; }
  blockquote { background:#edf5f4; border-left:4px solid #47968c; margin:1em 0; padding:.45em 1em; }
  code { background:#edf1f4; font-family:"Unsliced Sans SC",monospace; }
  pre { padding:1em; background:#edf1f4; white-space:pre-wrap; }
  table { width:100%; border-collapse:collapse; margin:1em 0; }
  th,td { text-align:left; padding:.48em .65em; border-bottom:1px solid #d5e0e3; }
  th { background:#215a61; color:white; }
  tbody tr:nth-child(even) { background:#f2f7f7; }
  img { max-width:100%; max-height:570px; object-fit:contain; }
`;

export function prepareDocument({ markdown: source, html }) {
  const content = source === undefined ? html : markdown.parse(source);
  const safe = sanitizeHtml(content, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'style', 'img', 'figure', 'figcaption', 'colgroup', 'col',
      'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
      'defs', 'marker', 'lineargradient', 'stop'],
    allowedAttributes: {
      '*': ['id', 'class', 'style', 'lang', 'title', 'data-unsliced-root', 'data-breakflow*'],
      a: ['href'], img: ['src', 'alt', 'width', 'height'],
      th: ['rowspan', 'colspan', 'scope'], td: ['rowspan', 'colspan'], ol: ['start'], col: ['span'],
      svg: ['viewBox', 'width', 'height', 'xmlns'], marker: ['id', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient'],
      ...Object.fromEntries(['g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','stop','lineargradient'].map(tag =>
        [tag, ['d','x','y','width','height','cx','cy','r','rx','ry','x1','x2','y1','y2','points','fill','stroke','stroke-width',
          'transform','text-anchor','font-size','font-weight','marker-end','offset','stop-color']]))
    },
    parser: { lowerCaseAttributeNames: false },
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title'],
    allowVulnerableTags: true, // CSS is retained; the isolated browser blocks external requests.
    allowedSchemesByTag: { img: ['data'] },
    transformTags: {
      img(tagName, attribs) {
        if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(attribs.src ?? '')) {
          throw new Error('图片请嵌入为 PNG、JPEG、GIF 或 WebP 的 data URL。Unsliced 不读取外部网址或本机图片路径。');
        }
        return { tagName, attribs };
      }
    }
  });
  const body = source === undefined ? safe : '<main id="unsliced-markdown" data-unsliced-root>' + safe + '</main>';
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{margin:0}img{max-width:100%}' + (source === undefined ? '' : markdownStyles) +
    '</style></head><body>' + body + '</body></html>';
}

export function contentWarning({ markdown: source, html }) {
  // A fragment may end with a heading, table, list or code block. Only use
  // strong signals here, since a complete last sentence need not end in punctuation.
  const markdownTokens = source === undefined ? [] : markdown.lexer(source).filter(token => token.type !== 'space');
  const last = markdownTokens.at(-1);
  const fence = last?.type === 'code' && last.raw.match(/^ {0,3}(`{3,}|~{3,})/u);
  const unclosedFence = fence && !last.raw.trimEnd().split(/\r?\n/u).slice(1)
    .some(line => new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}\\s*$','u').test(line));
  const incompleteDocument = html && (/<html(?:\s|>)/iu.test(html) && !/<\/html\s*>\s*$/iu.test(html) ||
    /<[^<>]*$/u.test(html));
  const tail = source === undefined
    ? sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trimEnd()
    : last?.type === 'paragraph' ? last.text.trimEnd() : '';
  const unfinishedSentence = /[、，；：,:;]$|(?:因为|所以|但是|以及|例如|包括|如果|由于|同时|并且|认为|需要)$|\b(?:and|or|because|including|which|such as|due to)$/iu.test(tail);
  const omittedContent = /(?:\[.*(?:truncated|omitted).*\]|[（(](?:下文|以下|后续|其余)?(?:内容)?(?:省略|略去)[）)])$/iu.test(tail);
  return unclosedFence || incompleteDocument || unfinishedSentence || omittedContent
    ? '内容结尾可能被截断。请核对原稿是否完整，再提交完整内容重新生成。'
    : undefined;
}
