import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { root, build, validatePostContent } from './build.mjs';
import { renderMarkdown } from './markdown.mjs';

for (const filename of ['app.js', 'scripts/markdown.mjs', 'scripts/build.mjs', 'scripts/server.mjs', 'scripts/check.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, filename)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const renderedUnsafe = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert)\n\n[x](data:text/html,test)');
assert(!renderedUnsafe.includes('<script'), '原始 HTML 应被转义');
assert(!renderedUnsafe.includes('<a '), '脚本与 data 链接不应渲染为可点击链接');
assert(renderMarkdown('[安全链接](https://example.com?a=1&b=2)').includes('href="https://example.com?a=1&amp;b=2"'), '普通链接应正常渲染并转义');
assert.equal(renderMarkdown('![照片说明](assets/jinzi/photo.jpg)'), '<p><img src="assets/jinzi/photo.jpg" alt="照片说明" loading="lazy" decoding="async"></p>', '独立行的本地图片应懒加载显示');
assert.equal(renderMarkdown('正文 ![照片](https://example.com/photo.jpg?a=1&b=2) 继续'), '<p>正文 <img src="https://example.com/photo.jpg?a=1&amp;b=2" alt="照片" loading="lazy" decoding="async"> 继续</p>', '行内 HTTPS 图片应显示且不改变周围文本');
assert(renderMarkdown('![金子的照片](assets/金子.jpg)').includes('src="assets/金子.jpg"'), '本地图片应允许中文文件名');
assert(renderMarkdown('!["<照片>&](assets/photo.jpg)').includes('alt="&quot;&lt;照片&gt;&amp;"'), '图片说明中的 HTML 字符应转义');
assert(!renderMarkdown('`![示例](assets/photo.jpg)`').includes('<img'), '代码里的图片语法不应生成图片');
for (const source of ['javascript:alert', 'data:image/svg+xml,test', 'http://example.com/photo.jpg', '//example.com/photo.jpg', 'assets/../secret.jpg', 'assets/%2e%2e/secret.jpg', 'assets\\photo.jpg', 'https://', 'other/photo.jpg']) {
  const rendered = renderMarkdown(`![不安全图片](${source})`);
  assert(!rendered.includes('<img') && !rendered.includes('<a '), `不允许的图片来源不应显示为图片或链接：${source}`);
}
const { posts, site } = await build();
await assert.rejects(validatePostContent([{ ...posts[0], category: '未配置的栏目' }], site), /未在.*categories.*配置/, '未配置的文章分类应阻止构建');
await assert.rejects(validatePostContent([{ ...posts[0], cover: 'assets/__missing-cover-check__.jpg' }], site), /封面文件不存在/, '缺失封面应阻止构建');
await assert.rejects(validatePostContent(posts, { ...site, categories: [{ name: '重复栏目' }, { name: '重复栏目' }] }), /唯一/, '重复栏目名称应阻止构建');
console.log('JavaScript 语法、安全渲染与文章配置检查通过。');
