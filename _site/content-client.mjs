import { parsePost, renderMarkdown, safeImage } from './scripts/markdown.mjs';

export function independentPosts(catalog, site) {
  if (catalog?.schema !== 1 || catalog.site !== site.siteId || !Array.isArray(catalog.articles)) throw new Error('独立博客内容版本或站点身份不匹配');
  const categories = new Set(site.categories.map(item => item.name));
  const identities = new Set(), routes = new Set();
  return catalog.articles.map(article => {
    const { id, version, category, slug, metadata: meta, body, source } = article;
    if (typeof id !== 'string' || identities.has(id) || !Number.isSafeInteger(version) || version < 1 || !categories.has(category) || !/^[\p{L}\p{N}_-]{1,100}$/u.test(slug) || typeof body !== 'string' || typeof source !== 'string' || !meta || typeof meta !== 'object') throw new Error('独立博客含有无效文章');
    const route = category + '/' + slug;
    if (routes.has(route) || /\/api\/|local-media:/.test(source)) throw new Error('公开文章包含重复路径或私人媒体引用');
    identities.add(id); routes.add(route);
    if (typeof meta.title !== 'string' || typeof meta.excerpt !== 'string') throw new Error('公开文章标题或摘要无效');
    const cover = meta.previewImage || meta.cover || '';
    if (cover && (!safeImage(cover) || /^https?:/i.test(cover))) throw new Error('公开文章封面不属于本站');
    return { id, version, slug: route, articleSlug: slug, category, title: meta.title,
      excerpt: meta.excerpt, cover, date: (meta.date || meta.finaldate || '').slice(0, 10),
      tags: Array.isArray(meta.tags) ? meta.tags : typeof meta.tags === 'string' ? meta.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean) : [],
      readingTime: `${Math.max(1, Math.ceil(body.replace(/\s/g, '').length / 250))} 分钟`, body: renderMarkdown(body) };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function catalogPosts(catalog, site) {
  if (!catalog || !catalog.documents || Array.isArray(catalog.documents) || typeof catalog.documents !== 'object') throw new Error('路由器内容目录格式无效');
  const categories = new Set(site.categories.map(item => item.name));
  const posts = [];
  for (const [name, source] of Object.entries(catalog.documents)) {
    const match = /^content\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(name);
    if (!match) throw new Error('路由器内容目录包含未知文章路径');
    if (source === null) continue;
    if (typeof source !== 'string' || source.includes('/api/media/')) throw new Error('公开正文仍含私人媒体引用');
    const post = parsePost(source, match[1]);
    if (!categories.has(post.category)) throw new Error(`文章 ${post.slug} 的栏目未配置`);
    posts.push(post);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export async function loadContent(fetcher = fetch, { timeoutMs = 12000 } = {}) {
  const read = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error(`无法读取博客内容（${response.status}）`);
      return await response.json();
    } finally { clearTimeout(timer); }
  };
  const site = await read('./data/site.json');
  // Runtime failures must never fall back to compiled articles: that could
  // resurrect content that the editor has explicitly taken offline.
  const posts = site.contentMode === 'runtime'
    ? site.contentProtocol === 'independent-v1'
      ? independentPosts(await read('/content.json'), site)
      : catalogPosts(await read('./router-content.json'), site)
    : await read('./data/posts.json');
  return { posts, site };
}
