import { readFile, readdir, mkdir, rm, cp, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePost, escapeHtml } from './markdown.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const outputDirectory = path.join(root, 'dist');

export async function validatePostContent(posts, site) {
  if (!Array.isArray(site.categories) || !site.categories.length) throw new Error('content/site.json 的 categories 必须是非空栏目数组');
  const names = site.categories.map((category) => category?.name);
  if (names.some((name) => typeof name !== 'string' || !name.trim()) || new Set(names).size !== names.length) throw new Error('content/site.json 的每个栏目须有唯一、非空的 name');
  const categories = new Set(names);
  for (const post of posts) {
    if (!categories.has(post.category)) throw new Error(`content/posts/${post.slug}.md 的 category「${post.category}」未在 content/site.json 的 categories 中配置；可用栏目：${names.join('、')}`);
    const coverPath = path.join(root, 'public', post.cover);
    try {
      if (!(await stat(coverPath)).isFile()) throw new Error('not a file');
    } catch {
      throw new Error(`content/posts/${post.slug}.md 的封面文件不存在：public/${post.cover}；请添加图片或修改 cover`);
    }
  }
}

export async function build(options = {}) {
  const target = options.output ? path.resolve(options.output) : outputDirectory;
  const mode = options.mode || 'static';
  if (!['static', 'runtime'].includes(mode)) throw new Error('未知内容模式');
  if (options.output) {
    try { await stat(target); throw new Error('构建输出必须是不存在的新目录'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const site = JSON.parse(await readFile(path.join(root, 'content', 'site.json'), 'utf8'));
  site.contentMode = mode;
  if (options.url !== undefined) site.url = options.url;
  for (const key of ['name', 'englishName', 'author', 'description', 'bio', 'currentNote', 'location']) {
    if (typeof site[key] !== 'string') throw new Error(`content/site.json 缺少字符串字段 ${key}`);
  }
  for (const key of ['collections', 'notes']) {
    if (!Array.isArray(site[key])) throw new Error(`content/site.json 的 ${key} 必须是数组`);
  }
  const contentDirectory = path.join(root, 'content', 'posts');
  const filenames = (await readdir(contentDirectory)).filter((filename) => filename.endsWith('.md'));
  const posts = await Promise.all(filenames.map(async (filename) => parsePost(await readFile(path.join(contentDirectory, filename), 'utf8'), filename.slice(0, -3))));
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  if (!posts.length) throw new Error('content/posts/ 中没有 Markdown 文章');
  await validatePostContent(posts, site);
  const entryFiles = ['index.html', 'app.js', 'styles.css', 'pet.js', 'pet.css', 'theme.js', 'content-client.mjs'];
  for (const filename of entryFiles) await access(path.join(root, filename));
  // The output directory is a fixed child of this project, never user-supplied.
  if (path.dirname(outputDirectory) !== root || path.basename(outputDirectory) !== 'dist') throw new Error('构建目录无效');
  if (!options.output) await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(path.join(target, 'data'), { recursive: true });
  for (const filename of entryFiles) await cp(path.join(root, filename), path.join(target, filename));
  await mkdir(path.join(target, 'scripts'));
  await cp(path.join(root, 'scripts', 'markdown.mjs'), path.join(target, 'scripts', 'markdown.mjs'));
  await cp(path.join(root, 'public'), target, { recursive: true });
  if (mode === 'static') await writeFile(path.join(target, 'data', 'posts.json'), JSON.stringify(posts, null, 2) + '\n');
  await writeFile(path.join(target, 'data', 'site.json'), JSON.stringify(site, null, 2) + '\n');
  // Runtime bundles never contain compiled article JSON/RSS: only the current
  // frozen CMS catalog may make article content readable.
  if (mode === 'static') await writeFile(path.join(target, '.nojekyll'), '');
  if (site.url && mode === 'static') {
    const baseUrl = new URL(site.url);
    if (!['https:', 'http:'].includes(baseUrl.protocol)) throw new Error('站点 url 须为 https:// 或 http:// 地址');
    if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
    baseUrl.search = '';
    baseUrl.hash = '';
    const rssItems = posts.map((post) => {
      const href = new URL(`#/post/${post.slug}`, baseUrl).href;
      return `<item><title>${escapeHtml(post.title)}</title><link>${escapeHtml(href)}</link><guid isPermaLink="true">${escapeHtml(href)}</guid><pubDate>${new Date(`${post.date}T00:00:00+08:00`).toUTCString()}</pubDate><category>${escapeHtml(post.category)}</category><description>${escapeHtml(post.excerpt)}</description><content:encoded>${escapeHtml(post.body)}</content:encoded></item>`;
    }).join('\n');
    const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeHtml(site.name)}</title><link>${escapeHtml(baseUrl.href)}</link><description>${escapeHtml(site.description)}</description><language>zh-CN</language><atom:link href="${escapeHtml(new URL('rss.xml', baseUrl).href)}" rel="self" type="application/rss+xml"/>\n${rssItems}\n</channel></rss>\n`;
    await writeFile(path.join(target, 'rss.xml'), feed);
  }
  console.log(`已构建 ${posts.length} 篇文章（${mode}）→ ${target}`);
  return { posts, site };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((error) => { console.error(`构建失败：${error.message}`); process.exitCode = 1; });
}
