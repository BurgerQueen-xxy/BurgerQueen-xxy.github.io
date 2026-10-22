import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogPosts, loadContent } from '../content-client.mjs';
import { renderMarkdown, parsePost } from './markdown.mjs';

const site = JSON.parse(await readFile(new URL('../content/site.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../content/posts/slow-days.md', import.meta.url), 'utf8');
const hash = 'a'.repeat(64);
const documents = { 'content/posts/slow-days.md': source, 'content/posts/removed.md': null };
assert.equal(catalogPosts({ documents }, site).length, 1);
assert.deepEqual(catalogPosts({ documents: {} }, site), []);
assert.throws(() => catalogPosts({ documents: { '../../private.md': source } }, site));
assert.throws(() => catalogPosts({ documents: { 'content/posts/test.md': source + `\n![private](/api/media/${hash})` } }, site));
assert(renderMarkdown(`![photo](/site-media/${hash}.webp)`).includes('<img'));
assert(!renderMarkdown('![private](/api/private/file)').includes('<img'));
assert(!renderMarkdown(`![invalid](/site-media/${hash}.webp/../../secret)`).includes('<img'));
assert.equal(parsePost(source.replace(/cover:.*\r?\n/, `cover: /site-media/${hash}.webp\n`), 'test').cover, `/site-media/${hash}.webp`);
const urls = [];
await assert.rejects(loadContent(async url => {
  urls.push(url);
  return url.endsWith('site.json') ? { ok: true, json: async () => ({ ...site, contentMode: 'runtime' }) } : { ok: false, status: 503 };
}));
assert.deepEqual(urls, ['./data/site.json', './router-content.json'], '后台错误不得回退已撤下的静态文章');
const result = await loadContent(async url => ({ ok: true, json: async () => url.endsWith('site.json') ? { ...site, contentMode: 'runtime' } : { documents } }));
assert.equal(result.posts.length, 1);
console.log('Runtime 目录、撤下、私人媒体与失败关闭检查通过。');
