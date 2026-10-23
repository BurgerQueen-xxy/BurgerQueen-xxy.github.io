/** A deliberately small Markdown renderer. Raw HTML is always displayed as text. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function safeLink(value) {
  const href = String(value);
  if (!href || /[\u0000-\u0020\u007f\\]/.test(href) || href.startsWith('//')) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return null;
  return href;
}

export function safeImage(value) {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return null;
  // Only content-addressed media endpoints; arbitrary API paths stay private.
  if (/^\/(?:(?:site-media|site-settings-media)\/[a-f0-9]{64}\.webp|api\/media\/[a-f0-9]{64})$/.test(value)) return value;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname ? value : null;
    } catch { return null; }
  }
  if (!/^\/?assets\/[^\u0000-\u0020\u007f\\"'<>:%?#]+$/u.test(value)) return null;
  if (value.replace(/^\//, '').split('/').some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return value;
}

function unescapeMarkdown(value) {
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
}

function closingBracket(text, start, close) {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === close) return i;
  }
  return -1;
}

function inline(value, options = {}, depth = 0) {
  if (depth > 12) return escapeHtml(value);
  let result = '';
  for (let i = 0; i < value.length;) {
    const rest = value.slice(i);
    const escaped = rest.match(/^\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/);
    if (escaped) { result += escapeHtml(escaped[1]); i += escaped[0].length; continue; }
    const ticks = rest.match(/^`+/);
    if (ticks) {
      const end = value.indexOf(ticks[0], i + ticks[0].length);
      if (end >= 0) {
        let text = value.slice(i + ticks[0].length, end);
        if (text.startsWith(' ') && text.endsWith(' ') && text.trim()) text = text.slice(1, -1);
        result += `<code>${escapeHtml(text)}</code>`;
        i = end + ticks[0].length; continue;
      }
    }
    const imageToken = rest.startsWith('![');
    if (imageToken || rest.startsWith('[')) {
      const labelStart = i + (imageToken ? 2 : 1);
      const labelEnd = closingBracket(value, labelStart, ']');
      if (labelEnd >= 0 && value[labelEnd + 1] === '(') {
        let level = 1;
        let end = labelEnd + 2;
        for (; end < value.length; end++) {
          if (value[end] === '\\') { end++; continue; }
          if (value[end] === '(') level++;
          if (value[end] === ')' && --level === 0) break;
        }
        if (end < value.length) {
          const label = value.slice(labelStart, labelEnd);
          const url = value.slice(labelEnd + 2, end).replace(/\\([()])/g, '$1');
          if (!/\s/.test(url)) {
            if (imageToken) {
              let src = safeImage(url);
              let resolved = null;
              // Only the private editor supplies a resolver, for its own offline Blob URLs.
              if (options.resolveImage && (src || /^local-media:[a-zA-Z0-9-]+$/.test(url))) {
                resolved = options.resolveImage(url);
                if (typeof resolved === 'string' && (safeImage(resolved) || /^blob:https?:\/\/[^\s"'<>]+$/.test(resolved))) src = resolved;
              }
              if (src) result += `<img src="${escapeHtml(src)}" alt="${escapeHtml(unescapeMarkdown(label))}"${resolved && src === resolved && src !== url ? ` data-markdown-src="${escapeHtml(url)}"` : ''} loading="lazy" decoding="async">`;
              else result += escapeHtml(value.slice(i, end + 1));
            } else {
              const href = safeLink(url);
              result += href ? `<a href="${escapeHtml(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inline(label, options, depth + 1)}</a>` : escapeHtml(value.slice(i, end + 1));
            }
            i = end + 1; continue;
          }
        }
      }
    }
    const stars = rest.match(/^\*{1,3}/);
    if (stars) {
      const count = stars[0].length;
      const pattern = /\\.|`+[^`]*`+|\*+/g;
      pattern.lastIndex = i + count;
      let found;
      while ((found = pattern.exec(value))) {
        if (!found[0].startsWith('*') || found[0].length < count || (count === 1 && found[0].length === 2)) continue;
        const close = found.index + found[0].length - count;
        const inner = value.slice(i + count, close);
        if (!inner || /^\s|\s$/.test(inner)) break;
        const content = inline(inner, options, depth + 1);
        result += count === 3 ? `<strong><em>${content}</em></strong>` : count === 2 ? `<strong>${content}</strong>` : `<em>${content}</em>`;
        i = close + count;
        break;
      }
      if (found && i > found.index) continue;
    }
    result += escapeHtml(value[i]);
    i++;
  }
  return result;
}

/** Split pipe cells without treating escaped pipes or inline-code pipes as columns. */
export function markdownTableCells(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (/(?<!\\)\|$/.test(text)) text = text.slice(0, -1);
  const cells = [];
  let value = '';
  let codeTicks = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) { value += text[i] + text[++i]; continue; }
    if (text[i] === '`') {
      const run = text.slice(i).match(/^`+/)[0];
      if (!codeTicks) codeTicks = run;
      else if (codeTicks === run) codeTicks = '';
      value += run; i += run.length - 1; continue;
    }
    if (text[i] === '|' && !codeTicks) { cells.push(value.trim()); value = ''; }
    else value += text[i];
  }
  cells.push(value.trim());
  return cells;
}

export function renderMarkdown(source, options = {}) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let list = [];
  let listType = '';
  let listStart = 1;
  let quote = [];
  let code = null;
  let fence = '';
  let language = '';
  const inlineLines = (items) => items.map((item, index) => {
    const hardBreak = / {2}$|\\$/.test(item);
    return inline(hardBreak ? item.replace(/ {2}$|\\$/, '') : item, options) + (index < items.length - 1 ? hardBreak ? '<br>' : ' ' : '');
  }).join('');
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inlineLines(paragraph)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) output.push(`<${listType}${listType === 'ol' && listStart !== 1 ? ` start="${listStart}"` : ''}>${list.map((item) => `<li>${inline(item, options)}</li>`).join('')}</${listType}>`);
    list = []; listType = ''; listStart = 1;
  };
  const flushQuote = () => {
    if (quote.length) output.push(`<blockquote><p>${inlineLines(quote)}</p></blockquote>`);
    quote = [];
  };
  const flush = () => { flushParagraph(); flushList(); flushQuote(); };
  const emitCode = () => output.push(`<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (code !== null) {
      if (line.trim() === fence) { emitCode(); code = null; }
      else code.push(line);
      continue;
    }
    const opening = line.match(/^\s*(`{3,})([\w-]*)\s*$/);
    if (opening) { flush(); fence = opening[1]; language = opening[2]; code = []; continue; }
    if (!line.trim()) { flush(); continue; }
    if (index + 1 < lines.length && line.includes('|')) {
      const headers = markdownTableCells(line);
      const dividers = markdownTableCells(lines[index + 1]);
      if (headers.length === dividers.length && dividers.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        flush(); index++;
        const align = dividers.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : '');
        const cellHTML = (cell, column, tag) => `<${tag}${align[column] ? ` style="text-align:${align[column]}"` : ''}>${inline(cell, options)}</${tag}>`;
        const rows = [];
        while (index + 1 < lines.length && lines[index + 1].trim() && lines[index + 1].includes('|')) {
          const cells = markdownTableCells(lines[index + 1]);
          if (cells.length !== headers.length) break;
          rows.push(`<tr>${cells.map((cell, column) => cellHTML(cell, column, 'td')).join('')}</tr>`); index++;
        }
        output.push(`<table><thead><tr>${headers.map((cell, column) => cellHTML(cell, column, 'th')).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
        continue;
      }
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flush(); output.push(`<h${heading[1].length}>${inline(heading[2], options)}</h${heading[1].length}>`); continue; }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { flush(); output.push('<hr>'); continue; }
    const quoted = line.match(/^>\s?(.*)$/);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
    const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.+)$/);
    if (item) {
      flushParagraph(); flushQuote();
      const type = item[2] ? 'ol' : 'ul';
      if (listType && listType !== type) flushList();
      if (!list.length && item[2]) listStart = Number(item[2]);
      listType = type; list.push(item[3]); continue;
    }
    flushList(); flushQuote(); paragraph.push(line.trimStart());
  }
  flush();
  if (code !== null) emitCode();
  return output.join('\n');
}

export function parsePost(source, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`文章文件名只能使用小写英文、数字和短横线：${slug}`);
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${slug}.md 缺少 frontmatter（文件开头的 --- 配置信息）`);
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const pair = line.match(/^([a-zA-Z]+):\s*(.*?)\s*$/);
    if (!pair) throw new Error(`${slug}.md 的配置信息格式错误：${line}`);
    let value = pair[2];
    if (value.startsWith('[') || value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new Error(`${slug}.md 的 ${pair[1]} 必须使用合法 JSON 格式`); }
    }
    metadata[pair[1]] = value;
  }
  for (const key of ['title', 'date', 'category', 'excerpt', 'cover']) {
    if (typeof metadata[key] !== 'string' || !metadata[key].trim()) throw new Error(`${slug}.md 缺少 ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.date) || new Date(metadata.date).toISOString().slice(0, 10) !== metadata.date) throw new Error(`${slug}.md 的日期须为有效的 YYYY-MM-DD`);
  if (!Array.isArray(metadata.tags) || !metadata.tags.every((tag) => typeof tag === 'string')) throw new Error(`${slug}.md 的 tags 必须是字符串数组`);
  if (!safeImage(metadata.cover) || /^https:/i.test(metadata.cover)) throw new Error(`${slug}.md 的封面必须使用 assets/ 下的相对路径或已上传的本站图片`);
  return {
    slug,
    title: metadata.title,
    date: metadata.date,
    category: metadata.category,
    tags: metadata.tags,
    excerpt: metadata.excerpt,
    readingTime: typeof metadata.readingTime === 'string' ? metadata.readingTime : `${Math.max(1, Math.ceil(match[2].replace(/\s/g, '').length / 250))} 分钟`,
    cover: metadata.cover,
    body: renderMarkdown(match[2].trim()),
  };
}
