/** A deliberately small Markdown renderer. Raw HTML is always displayed as text. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeLink(value) {
  const href = value.trim();
  if (!href || /[\u0000-\u0020\u007f\\]/.test(href) || href.startsWith('//')) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return null;
  return href;
}

function safeImage(value) {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return null;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname ? value : null;
    } catch { return null; }
  }
  if (!/^assets\/[^\u0000-\u0020\u007f\\"'<>:%?#]+$/u.test(value)) return null;
  if (value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return value;
}

function inline(value) {
  // Match syntax before escaping; URL values are validated and escaped separately.
  const token = /`(?<code>[^`\n]+)`|!\[(?<alt>[^\]\n]*)\]\((?<src>[^\s)]+)\)|\[(?<label>[^\]\n]+)\]\((?<href>[^\s)]+)\)|\*\*(?<strong>[^*\n]+)\*\*|\*(?<emphasis>[^*\n]+)\*/g;
  let result = '';
  let offset = 0;
  for (const match of value.matchAll(token)) {
    result += escapeHtml(value.slice(offset, match.index));
    const { code, alt, src, label, href: link, strong, emphasis } = match.groups;
    if (code !== undefined) result += `<code>${escapeHtml(code)}</code>`;
    else if (src !== undefined) {
      const image = safeImage(src);
      result += image
        ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`
        : escapeHtml(match[0]);
    } else if (label !== undefined) {
      const href = safeLink(link);
      result += href
        ? `<a href="${escapeHtml(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`
        : escapeHtml(match[0]);
    } else if (strong !== undefined) result += `<strong>${escapeHtml(strong)}</strong>`;
    else result += `<em>${escapeHtml(emphasis)}</em>`;
    offset = match.index + match[0].length;
  }
  return result + escapeHtml(value.slice(offset));
}

export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let list = [];
  let listType = '';
  let quote = [];
  let code = null;
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) output.push(`<${listType}>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</${listType}>`);
    list = [];
    listType = '';
  };
  const flushQuote = () => {
    if (quote.length) output.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    quote = [];
  };
  const flush = () => { flushParagraph(); flushList(); flushQuote(); };

  for (const line of lines) {
    if (code !== null) {
      if (/^\s*```\s*$/.test(line)) {
        output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) { flush(); code = []; continue; }
    if (!line.trim()) { flush(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flush(); output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { flush(); output.push('<hr>'); continue; }
    const quoted = line.match(/^>\s?(.*)$/);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
    const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.+)$/);
    if (item) {
      flushParagraph(); flushQuote();
      const type = item[2] ? 'ol' : 'ul';
      if (listType && listType !== type) flushList();
      listType = type;
      list.push(item[3]);
      continue;
    }
    flushList(); flushQuote(); paragraph.push(line.trim());
  }
  flush();
  if (code !== null) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
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
  if (!/^assets\/[a-zA-Z0-9_./-]+$/.test(metadata.cover) || metadata.cover.split('/').includes('..')) throw new Error(`${slug}.md 的封面必须使用 assets/ 下的相对路径`);
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
