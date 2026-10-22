import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { build, root, outputDirectory } from './build.mjs';

const argumentsList = process.argv.slice(2);
const portIndex = argumentsList.indexOf('--port');
const port = Number(portIndex >= 0 ? argumentsList[portIndex + 1] : process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port 必须为 1 至 65535 的整数');
const host = '127.0.0.1';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/rss+xml; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

await build();
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) { response.writeHead(400); response.end('Bad request'); return; }
    const filename = path.resolve(outputDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(outputDirectory + path.sep)) { response.writeHead(403); response.end('Forbidden'); return; }
    if (!(await stat(filename)).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const content = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404);
    response.end(error instanceof URIError ? 'Bad request' : 'Not found');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，可追加 --port 4174` : error.message);
  clearTimeout(timer);
  watcher?.close();
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`慢慢来 → http://${host}:${port}${argumentsList.includes('--watch') ? '（保存文件后自动构建，刷新浏览器即可）' : ''}`));

let watcher;
let timer;
let building = false;
let pending = false;
async function rebuild() {
  if (building) { pending = true; return; }
  building = true;
  try { await build(); } catch (error) { console.error(`构建失败：${error.message}`); }
  building = false;
  if (pending) { pending = false; await rebuild(); }
}
if (argumentsList.includes('--watch')) {
  watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const relative = filename.replaceAll('\\', '/');
    if (!/^(content\/|public\/|index\.html$|app\.js$|styles\.css$|pet\.js$|pet\.css$)/.test(relative)) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 160);
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  clearTimeout(timer);
  watcher?.close();
  server.close(() => process.exit(0));
});
