import { parsePost } from './scripts/markdown.mjs';

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

export async function loadContent(fetcher = fetch) {
  const read = async (url) => {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`无法读取博客内容（${response.status}）`);
    return response.json();
  };
  const site = await read('./data/site.json');
  // Runtime failures must never fall back to compiled articles: that could
  // resurrect content that the editor has explicitly taken offline.
  const posts = site.contentMode === 'runtime'
    ? catalogPosts(await read('./router-content.json'), site)
    : await read('./data/posts.json');
  return { posts, site };
}
