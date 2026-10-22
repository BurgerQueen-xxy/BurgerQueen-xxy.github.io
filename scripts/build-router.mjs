/** PC-only release builder. No SSH, Node installation or builds on the router. */
import { readFile, readdir, mkdir, cp, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { root, build } from './build.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const compact = value => JSON.stringify(value);

export async function fileHashes(directory) {
  const result = {};
  async function visit(relative = '') {
    for (const entry of (await readdir(path.join(directory, relative))).sort()) {
      const name = relative ? `${relative}/${entry}` : entry;
      const info = await lstat(path.join(directory, name));
      if (info.isSymbolicLink()) throw new Error(`发布文件不允许链接：${name}`);
      if (info.isDirectory()) await visit(name);
      else if (info.isFile()) result[name] = sha256(await readFile(path.join(directory, name)));
      else throw new Error(`不支持的文件类型：${name}`);
    }
  }
  await visit();
  return result;
}

function git(...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('无法读取本机 Git 状态');
  return result.stdout.trim();
}

export async function buildRouter({ output, url, allowDirty = false }) {
  if (!output || !url) throw new Error('需要 --output <不存在的新目录> 和 --url <博客HTTPS地址>');
  const target = path.resolve(output);
  if (target === root || target.startsWith(root + path.sep)) throw new Error('发布包输出必须位于源码仓库外');
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('路由器博客地址必须是纯 HTTPS origin');
  const status = git('status', '--porcelain', '--untracked-files=all');
  if (status && !allowDirty) throw new Error('正式发布要求干净 Git 工作区；请审查并提交本地改动。仅本地验证可加 --allow-dirty');
  const sourceCommit = git('rev-parse', 'HEAD');
  await mkdir(target, { recursive: false }); // Never overwrite a previous candidate.
  const program = path.join(target, 'program');
  await build({ output: program, mode: 'runtime', url: origin.href });
  const source = path.join(target, 'source');
  await mkdir(source);
  await cp(path.join(root, 'content'), path.join(source, 'content'), { recursive: true });
  await mkdir(path.join(source, 'public'));
  await cp(path.join(root, 'public', 'assets'), path.join(source, 'public', 'assets'), { recursive: true });
  const sourceFiles = await fileHashes(source);
  for (const name of Object.keys(sourceFiles)) {
    if (!(name === 'content/site.json' || /^content\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(name) || name.startsWith('public/assets/'))) throw new Error(`来源快照包含未允许文件：${name}`);
  }
  const snapshot = { schema: 1, site: 'slow-notes', sourceCommit, files: sourceFiles };
  await writeFile(path.join(source, 'snapshot.json'), compact(snapshot));
  const manifest = {
    schema: 1, adapter: 'slow-notes-v1', site: 'slow-notes', contentMode: 'runtime', sourceCommit,
    contentPaths: Object.keys(sourceFiles).filter(name => name.endsWith('.md') && name.startsWith('content/posts/')),
    files: await fileHashes(program),
  };
  manifest.bundleId = sha256(compact(manifest));
  await writeFile(path.join(program, 'program.json'), compact(manifest));
  await mkdir(path.join(target, 'app', 'cms'), { recursive: true });
  // Explicit suffix allowlist keeps tests, caches, databases and private state out.
  for (const entry of await readdir(path.join(root, 'cms'))) {
    if (!entry.endsWith('.py') && !/^requirements.*\.txt$/.test(entry)) continue;
    const filename = path.join(root, 'cms', entry);
    if (!(await lstat(filename)).isFile()) throw new Error(`后台发布文件无效：${entry}`);
    await cp(filename, path.join(target, 'app', 'cms', entry));
  }
  await cp(path.join(root, 'deploy', 'br-t320', 'site_guard.py'), path.join(target, 'app', 'site_guard.py'));
  await mkdir(path.join(target, 'editor'));
  for (const entry of ['index.html', 'editor.js', 'editor.css']) {
    await cp(path.join(root, 'editor', entry), path.join(target, 'editor', entry));
  }
  await cp(path.join(root, 'scripts', 'markdown.mjs'), path.join(target, 'editor', 'markdown.mjs'));
  const files = await fileHashes(target);
  for (const name of Object.keys(files)) {
    if (/(^|\/)(?:\.env|.*\.(?:key|pem|p12|sqlite\d*|db)|__pycache__|node_modules|tests)(\/|$)/i.test(name)) throw new Error(`发布包包含私人或开发文件：${name}`);
  }
  if (git('rev-parse', 'HEAD') !== sourceCommit || git('status', '--porcelain', '--untracked-files=all') !== status) throw new Error('构建中源码提交或工作区状态变化，请使用新目录重试');
  const release = { schema: 1, site: 'slow-notes', sourceCommit, deployable: !status,
    sourceStatus: status ? 'dirty-validation-only' : 'clean', files };
  release.bundleId = sha256(compact(release));
  await writeFile(path.join(target, 'release.json'), compact(release));
  const archive = `${target}.tar.gz`;
  try { await lstat(archive); throw new Error('发布归档已存在，拒绝覆盖'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const packed = spawnSync('tar', ['-czf', archive, '-C', target, 'release.json', 'program', 'source', 'app', 'editor'], { windowsHide: true });
  if (packed.status !== 0) throw new Error('归档失败；目录保留供检查');
  await writeFile(`${archive}.sha256`, `${sha256(await readFile(archive))}  ${path.basename(archive)}\n`);
  console.log(`${release.deployable ? '正式候选包' : '仅本地验证包（禁止上传部署）'}：${archive}\n版本：${release.bundleId}`);
  return release;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  buildRouter({ output: value('--output'), url: value('--url'), allowDirty: args.includes('--allow-dirty') })
    .catch(error => { console.error(`路由器构建失败：${error.message}`); process.exitCode = 1; });
}
