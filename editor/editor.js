import { renderMarkdown } from './markdown.mjs';

const $ = (id) => document.getElementById(id);
const categories = ['收藏', '出去吃饭', '在家做饭', '户外', '其他', '金子'];
const draftPrefix = 'slow-notes-editor-draft:';
const state = { csrf: '', authenticated: false, busy: false, articles: [], draft: null, conflict: null, album: [], deployment: { items: [], routerConfigured: false }, catalog: null, page: 'articles', imageRole: 'body', pickerRole: null, preview: false, freezeRequest: null };

class ApiError extends Error {
  constructor(status, value) { super(typeof value.detail === 'string' ? value.detail : '请求失败，请稍后重试'); this.status = status; this.value = value; }
}
async function request(path, method = 'GET', body) {
  if (method !== 'GET' && path !== '/login' && !state.csrf) {
    const session = await request('/session');
    state.csrf = session.csrf;
  }
  const raw = body instanceof Blob;
  const response = await fetch('/api' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: method === 'GET' ? {} : { 'X-CSRF-Token': state.csrf, 'Content-Type': raw ? body.type || 'application/octet-stream' : 'application/json' },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  });
  let value;
  try { value = await response.json(); }
  catch { throw new ApiError(response.ok ? 502 : response.status, { detail: '后台暂不可用或正在重启，请稍后重试；编辑区内容保留。' }); }
  if (!response.ok) throw new ApiError(response.status, value);
  return value;
}
function notify(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function report(error) {
  if (error instanceof ApiError && error.status === 401) {
    state.csrf = ''; state.authenticated = false;
    $('workspace').hidden = true; $('login-view').hidden = false;
    notify('会话已过期，请重新登录。编辑区与本机草稿仍保留。', true);
  } else notify(error instanceof TypeError ? '网络请求失败，请检查连接后重试。编辑区与本机草稿保留。' : error.message || '操作失败，请稍后重试。', true);
}
async function run(action, progress) {
  if (state.busy) return;
  state.busy = true;
  document.body.setAttribute('aria-busy', 'true');
  const enabled = [...document.querySelectorAll('button:not(:disabled)')];
  enabled.forEach((button) => { button.disabled = true; });
  if (progress) notify(progress);
  try { await action(); } catch (error) { report(error); }
  finally {
    state.busy = false; document.body.removeAttribute('aria-busy');
    enabled.forEach((button) => { if (button.isConnected) button.disabled = false; });
    updateControls();
  }
}
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function button(text, action, className) { const element = node('button', text, className); element.type = 'button'; element.addEventListener('click', action); return element; }
function clone(value) { return structuredClone(value); }
function titleOf(article) { try { return readSource(article.document.source).meta.title || article.document.slug || '未命名文章'; } catch { return article.title || '未命名文章'; } }
function dateText(value) { return value ? new Date(value * 1000).toLocaleString('zh-CN', { hour12: false }) : ''; }
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function readSource(source) {
  const match = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('文章缺少受支持的 frontmatter，请先检查 Markdown 文件。');
  const meta = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const pair = line.match(/^([a-zA-Z]+):\s*(.*?)\s*$/);
    if (!pair) throw new Error('无法解析文章设置：' + line);
    meta[pair[1]] = pair[2].startsWith('[') || pair[2].startsWith('"') ? JSON.parse(pair[2]) : pair[2];
  }
  return { meta, body: match[2] };
}
function sourceFrom(meta, body) { return '---\n' + Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n' + body; }
function dirty() { return Boolean(state.draft && (!state.draft.version || state.draft.document.source !== state.draft.savedSource || state.draft.document.slug !== state.draft.savedSlug)); }
function remember() {
  if (!state.draft) return;
  try {
    const key = draftPrefix + state.draft.id;
    if (dirty()) localStorage.setItem(key, JSON.stringify({ ...state.draft, localUpdated: Date.now() }));
    else localStorage.removeItem(key);
  } catch { notify('本机存储不可用或空间不足，请立即导出 Markdown 副本。编辑区内容仍在。', true); }
  updateStatus();
}
function localDrafts() {
  const result = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(draftPrefix)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (value?.document && typeof value.document.source === 'string' && /^[a-f0-9-]{36}$/.test(value.id)) result.push(value);
      } catch { /* Preserve corrupt browser data without rendering it. */ }
    }
  } catch { /* The editor remains usable with backend saving and export. */ }
  return result.sort((a, b) => b.localUpdated - a.localUpdated);
}
function renderRecovery() {
  const drafts = localDrafts(); $('recovery').hidden = !drafts.length; $('local-list').replaceChildren();
  drafts.forEach((draft) => {
    const row = node('div', undefined, 'local-item');
    row.append(node('span', `${titleOf(draft)} · ${new Date(draft.localUpdated).toLocaleString('zh-CN')}`), button('恢复编辑', () => run(async () => { openDraft(draft, true); notify('已恢复本机草稿。请检查内容后保存到后台。'); })));
    $('local-list').append(row);
  });
}
function showPage(page) {
  state.page = page;
  for (const name of ['articles', 'write', 'album', 'deploy']) $(name + '-page').hidden = name !== page;
  document.querySelectorAll('[data-page]').forEach((element) => { if (element.dataset.page === page) element.setAttribute('aria-current', 'page'); else element.removeAttribute('aria-current'); });
  if (page === 'articles') { renderRecovery(); renderArticles(); }
  if (page === 'deploy') renderDeployment();
  if (page === 'album') renderAlbum();
  if (page !== 'album') state.pickerRole = null;
  updateControls();
  $('main').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function openDraft(article, local = false) {
  if (state.draft) { collectEditor(); remember(); }
  const parsed = readSource(article.document.source);
  state.draft = local ? clone(article) : { ...clone(article), savedSource: article.document.source, savedSlug: article.document.slug };
  state.conflict = null; state.freezeRequest = null;
  $('conflict-panel').hidden = true;
  $('editor-form').hidden = false; $('write-empty').hidden = true;
  $('title').value = parsed.meta.title || '';
  $('date').value = parsed.meta.date || today();
  $('category').value = categories.includes(article.document.category) ? article.document.category : '其他';
  $('slug').value = article.document.slug;
  $('tags').value = Array.isArray(parsed.meta.tags) ? parsed.meta.tags.join(', ') : '';
  $('excerpt').value = parsed.meta.excerpt || '';
  $('cover').value = parsed.meta.cover || '';
  $('body').value = parsed.body;
  state.preview = false; updatePreview(); updateStatus(); showPage('write');
}
function newArticle() {
  const id = crypto.randomUUID();
  const meta = { title: '', date: today(), category: '其他', tags: [], excerpt: '', cover: '' };
  openDraft({ id, version: 0, trashed: 0, source_path: null, savedSource: '', savedSlug: '', document: { category: '其他', slug: 'note-' + today() + '-' + id.slice(0, 6), source: sourceFrom(meta, '') } }, true);
  remember(); $('title').focus(); notify('新草稿已建立。填写标题、摘要与封面后，可以保存到后台。');
}
function collectEditor() {
  if (!state.draft || $('editor-form').hidden) return;
  const parsed = readSource(state.draft.document.source);
  const meta = { ...parsed.meta, title: $('title').value, date: $('date').value, category: $('category').value, tags: $('tags').value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), excerpt: $('excerpt').value, cover: $('cover').value.trim() };
  if (JSON.stringify(meta) === JSON.stringify(parsed.meta) && $('body').value === parsed.body && $('slug').value.trim() === state.draft.document.slug && meta.category === state.draft.document.category) return;
  state.draft.document = { category: meta.category, slug: $('slug').value.trim(), source: sourceFrom(meta, $('body').value) };
}
function updateStatus() {
  if (!state.draft) return;
  const modified = dirty();
  $('save-status').textContent = state.conflict ? '版本冲突 · 编辑区与后台副本均保留，请选择处理方式。' : modified ? `本机有修改 · ${state.draft.version ? '后台保存为 v' + state.draft.version : '尚未保存到后台'} · 尚未部署这些修改` : `后台已保存 v${state.draft.version} · ${deployedLabel(state.draft)}`;
  $('word-count').textContent = $('body').value.replace(/\s/g, '').length + ' 字';
  updateControls();
}
function updateControls() {
  const active = Boolean(state.draft);
  $('save-draft').disabled = state.busy || !active || Boolean(state.conflict) || Boolean(state.draft?.trashed);
  $('export-draft').disabled = state.busy || !active;
  $('history').disabled = state.busy || !state.draft?.version;
  const canFreeze = !state.busy && active && state.draft.version > 0 && !dirty() && !state.conflict && !state.draft.trashed;
  $('freeze').disabled = !canFreeze;
  $('freeze-unpublish').disabled = !canFreeze;
  $('rollback').disabled = state.busy || !state.deployment.routerConfigured || !state.deployment.routerCurrent;
}
function imageURL(value) {
  if (/^\/api\/media\/[a-f0-9]{64}$/.test(value)) return value;
  if (/^assets\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').some((part) => part === '..' || part === '.')) return '/' + value;
  return null;
}
function updatePreview() {
  $('body').hidden = state.preview; $('preview').hidden = !state.preview;
  $('preview-toggle').textContent = state.preview ? '继续编辑' : '预览'; $('preview-toggle').setAttribute('aria-pressed', String(state.preview));
  if (state.preview) {
    // The shared renderer escapes all raw HTML and validates Markdown URLs.
    $('preview').innerHTML = renderMarkdown($('body').value);
    $('preview').querySelectorAll('img').forEach((image) => {
      const url = imageURL(image.getAttribute('src') || '');
      if (url) image.src = url;
      else image.replaceWith(node('span', '[请上传图片后预览：' + image.alt + ']'));
    });
  }
  const cover = imageURL($('cover').value.trim());
  $('cover-preview').hidden = !cover;
  if (cover) $('cover-preview').src = cover; else $('cover-preview').removeAttribute('src');
}
async function refreshArticles() { state.articles = await request('/articles?trash=' + $('trash-filter').checked); renderArticles(); renderRecovery(); }
function normalizedSource(source) { return typeof source === 'string' ? source.replace(/\/site-media\/([a-f0-9]{64})\.webp/g, '/api/media/$1').replace(/\r\n?/g, '\n') : source; }
function deployedLabel(article) {
  if (!state.catalog) return '部署状态尚未读取';
  const path = 'content/posts/' + article.document.slug + '.md';
  const source = state.catalog.documents?.[path];
  if (source) return normalizedSource(source) === normalizedSource(article.document.source) ? '此内容已在路由器生效' : '路由器使用另一内容版本';
  if (article.source_path && state.catalog.documents?.[article.source_path]) return '旧文章路径仍在路由器生效';
  return '此文章未在当前路由器快照中部署';
}
function renderArticles() {
  const query = $('search').value.trim().toLocaleLowerCase(); const category = $('category-filter').value;
  const items = state.articles.filter((article) => (!category || article.document.category === category) && (!query || article.document.source.toLocaleLowerCase().includes(query) || article.document.slug.includes(query)));
  $('article-count').textContent = `${$('trash-filter').checked ? '回收站' : '所有文章'} · ${items.length} 篇`;
  $('article-list').replaceChildren();
  if (!items.length) $('article-list').append(node('div', $('trash-filter').checked ? '回收站是空的。' : query || category ? '没有找到匹配的文章。' : '还没有文章。新建一篇，或导入部署包内的基线文章。', 'empty'));
  items.forEach((article) => {
    const row = node('div', undefined, 'article-row'); const main = node('div', undefined, 'article-main');
    main.append(button(titleOf(article), () => run(async () => { if (article.trashed) throw new Error('请先从回收站恢复文章。'); const cached = localDrafts().find((draft) => draft.id === article.id); openDraft(cached || await request('/articles/' + article.id), Boolean(cached)); if (cached) notify('已打开这台设备的未同步草稿。'); }), 'article-title'));
    const metadata = node('div', undefined, 'article-meta');
    metadata.append(node('span', article.document.category, 'tag'), node('span', '后台 v' + article.version), node('span', article.document.slug), node('span', deployedLabel(article)));
    main.append(metadata);
    const actions = node('div', undefined, 'button-row');
    actions.append(button(article.trashed ? '恢复文章' : '移入回收站', () => run(async () => {
      if (state.draft?.id === article.id && dirty()) throw new Error('这篇文章还有本机修改，请先保存或导出。');
      if (!article.trashed && !window.confirm('移入回收站？文章历史会保留。已部署内容仍需在部署中心单独下架。')) return;
      const changed = await request('/articles/' + article.id + '/trash', 'POST', { version: article.version, trashed: !article.trashed });
      if (state.draft?.id === article.id) { state.draft = null; $('editor-form').hidden = true; $('write-empty').hidden = false; }
      await refreshArticles(); notify(changed.trashed ? '已移入回收站；已部署内容保持原状态。' : '文章已恢复，可以继续编辑。');
    }), article.trashed ? '' : 'quiet'));
    row.append(main, actions); $('article-list').append(row);
  });
}
async function saveDraft() {
  collectEditor();
  if (!$('editor-form').reportValidity()) { notify('请补全文章设置中的必填项，并检查文章路径格式。', true); return; }
  if (state.conflict) throw new Error('请先处理版本冲突。');
  const snapshot = clone(state.draft);
  let saved;
  try {
    saved = await request('/articles' + (snapshot.version ? '/' + snapshot.id : ''), snapshot.version ? 'PUT' : 'POST', snapshot.version ? { version: snapshot.version, document: snapshot.document } : { id: snapshot.id, document: snapshot.document });
  } catch (error) {
    // A first save may succeed while its response is lost. Use the normal
    // conflict route so later edits are retained in server history as well.
    if (!snapshot.version && error.status === 409 && !error.value.current) {
      try { await request('/articles/' + snapshot.id); }
      catch { throw error; }
      try { saved = await request('/articles/' + snapshot.id, 'PUT', { version: 0, document: snapshot.document }); }
      catch (conflict) { if (conflict.status === 409 && conflict.value.current) error = conflict; else throw conflict; }
    }
    if (!saved && error.status === 409 && error.value.current) {
      state.conflict = error.value;
      $('conflict-panel').hidden = false;
      $('conflict-description').textContent = `后台已经保存到 v${error.value.current.version}，你的内容仍在编辑区。两份内容已记录到后台冲突历史；请比较后合并、另存，或使用后台版本。`;
      $('conflict-source').textContent = error.value.current.document.source;
      remember();
    }
    if (!saved) throw error;
  }
  collectEditor();
  state.draft = { ...state.draft, version: saved.version, source_path: saved.source_path, savedSource: saved.document.source, savedSlug: saved.document.slug };
  state.freezeRequest = null; remember(); await refreshArticles();
  notify(dirty() ? `v${saved.version} 已保存。保存期间的新修改仍在编辑区，请再次保存。` : `草稿 v${saved.version} 已保存到后台。部署需要在路由器部署页面单独执行。`);
}
function resolveConflict(mode) {
  if (!state.conflict || !state.draft) return;
  collectEditor(); const remote = state.conflict.current;
  if (mode === 'remote') {
    const oldId = state.draft.id; openDraft(remote);
    try { localStorage.removeItem(draftPrefix + oldId); } catch { /* Backend conflict copy remains. */ }
    notify('已使用后台版本；之前的本机内容可在冲突历史中找回。');
  } else if (mode === 'copy') {
    const copy = clone(state.draft); const oldId = copy.id; copy.id = crypto.randomUUID(); copy.version = 0; copy.source_path = null; copy.savedSource = ''; copy.savedSlug = '';
    copy.document.slug = (copy.document.slug.slice(0, 80).replace(/-+$/, '') || 'note') + '-copy-' + copy.id.slice(0, 8);
    openDraft(copy, true); try { localStorage.removeItem(draftPrefix + oldId); } catch { /* Both backend copies remain. */ } remember();
    notify('本机内容已放入新的文章草稿，请检查路径后保存。');
  } else {
    state.draft.version = remote.version; state.draft.savedSource = remote.document.source; state.draft.savedSlug = remote.document.slug; state.draft.source_path = remote.source_path;
    state.conflict = null; $('conflict-panel').hidden = true; remember(); notify('编辑区内容保留。请合并需要的后台内容，再保存新版本。');
  }
}
function exportDraft() {
  collectEditor(); if (!state.draft) return;
  const url = URL.createObjectURL(new Blob([state.draft.document.source], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = (state.draft.document.slug || 'draft') + '.md'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('已导出 Markdown 副本。封面和正文图片仍使用当前站点的图片路径。');
}
function insertText(text, startOffset = text.length, endOffset = startOffset) {
  if (!state.draft) return;
  if (state.preview) { state.preview = false; updatePreview(); }
  const body = $('body'); const start = body.selectionStart;
  body.setRangeText(text, start, body.selectionEnd, 'end'); body.setSelectionRange(start + startOffset, start + endOffset); body.focus(); collectEditor(); remember();
}
function format(kind) {
  const body = $('body'); const selected = body.value.slice(body.selectionStart, body.selectionEnd);
  const pairs = { bold: ['**', '**', '加粗文字'], italic: ['*', '*', '斜体文字'], link: ['[', '](https://example.com)', '链接文字'], code: ['\n```\n', '\n```\n', '代码'] };
  if (pairs[kind]) { const [before, after, fallback] = pairs[kind]; const value = selected || fallback; insertText(before + value + after, before.length, before.length + value.length); }
  else { const prefix = { heading: '## ', quote: '> ', list: '- ', ordered: '1. ' }[kind]; const content = (selected || '文字').split('\n').map((line) => prefix + line).join('\n'); const before = body.selectionStart > 0 && body.value[body.selectionStart - 1] !== '\n' ? '\n' : ''; insertText(before + content, before.length + prefix.length, before.length + content.length); }
}
async function history() {
  if (!state.draft?.version) throw new Error('保存文章后即可查看历史。');
  const identity = state.draft.id; const data = await request('/articles/' + identity + '/history'); $('history-list').replaceChildren();
  const records = [...data.revisions.map((item) => ({ ...item, label: `版本 v${item.version}${item.trashed ? ' · 回收站记录' : ''}`, at: item.updated })), ...data.conflicts.map((item) => ({ ...item, label: '冲突副本 · 基于 v' + item.base_version, at: item.created }))];
  records.forEach((item) => {
    const details = node('details', undefined, 'history-item'); details.append(node('summary', item.label + (item.at ? ' · ' + dateText(item.at) : '')), node('pre', item.document.source));
    details.append(button('恢复到编辑区', () => {
      if (state.busy) return;
      if (dirty() && !window.confirm('当前编辑区有修改。替换前建议导出副本，确认将历史内容恢复到编辑区？')) return;
      if (state.draft?.id !== identity) return;
      const restored = { ...state.draft, document: clone(item.document) };
      openDraft(restored, true); remember(); $('history-dialog').close(); notify('历史内容已恢复到编辑区。保存后将生成新草稿版本，部署不会自动变化。');
    }));
    $('history-list').append(details);
  });
  $('history-dialog').showModal();
}
function chooseUpload(role) { state.imageRole = role; $('image-file').multiple = role === 'album'; $('image-file').value = ''; $('image-file').click(); }
async function uploadImages(files) {
  const role = state.imageRole; const articleId = state.draft?.id;
  if (role !== 'album' && !state.draft) throw new Error('请先打开一篇文章。');
  for (const file of files) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('只接受静态 PNG、JPEG、WebP 图片。');
    if (file.size > 10 * 1024 * 1024) throw new Error('每张图片不能超过 10 MiB。');
    notify('正在上传 ' + file.name + '…');
    const media = await request('/media?purpose=' + (role === 'album' ? 'album' : 'image'), 'POST', file);
    if (role !== 'album' && state.draft?.id === articleId) useMedia(media.id, role, file.name.replace(/\.[^.]+$/, ''));
  }
  if (role === 'album') { state.album = await request('/media'); renderAlbum(); notify('图片已加入私人相册。选择到文章并部署后，才会显示在博客中。'); }
  else notify('图片已上传并加入编辑区，请保存草稿。');
}
function useMedia(id, role, alt = '图片') {
  if (!state.draft) throw new Error('请先打开或新建一篇文章，再选择图片。');
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('图片编号无效。');
  const url = '/api/media/' + id;
  if (role === 'cover') { $('cover').value = url; collectEditor(); remember(); updatePreview(); }
  else insertText('\n![' + alt.replace(/[\[\]\r\n]/g, '') + '](' + url + ')\n');
  showPage('write');
}
function renderAlbum() {
  $('album-purpose').hidden = !state.pickerRole;
  $('album-purpose').textContent = state.pickerRole === 'cover' ? '正在为当前文章选择封面。点击图片下方的「用作封面」。' : '正在为当前文章选择正文图片。';
  $('album-grid').replaceChildren();
  if (!state.album.length) $('album-grid').append(node('p', '相册还是空的。上传一些想留住的画面吧。', 'muted'));
  state.album.forEach((media) => {
    if (!/^[a-f0-9]{64}$/.test(media.id)) return;
    const card = node('div', undefined, 'media-card'); const image = node('img'); image.src = '/api/media/' + media.id; image.alt = '私人相册图片'; image.loading = 'lazy';
    const info = node('div', undefined, 'media-info'); info.append(node('p', `${media.width} × ${media.height} · ${Math.round(media.size / 1024)} KB`));
    const actions = node('div', undefined, 'button-row');
    actions.append(button('插入正文', () => run(async () => useMedia(media.id, 'body'))), button('用作封面', () => run(async () => useMedia(media.id, 'cover'))), button('移出相册', () => run(async () => {
      if (!window.confirm('将图片移出相册？原图和文章中的引用会保留。')) return;
      await request('/album/' + media.id, 'DELETE'); state.album = await request('/media'); renderAlbum(); notify('已移出相册；原图和文章引用保留。');
    }), 'quiet'));
    const original = node('a', '下载原图'); original.href = '/api/media/' + media.id + '/original'; original.download = media.id + '.original';
    info.append(actions, original); card.append(image, info); $('album-grid').append(card);
  });
}
async function refreshDeployment() {
  const [deployment, catalog] = await Promise.allSettled([request('/candidates'), fetch('/router-content.json', { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error('无法读取当前路由器内容目录'); return response.json(); })]);
  if (deployment.status === 'rejected') throw deployment.reason;
  state.deployment = deployment.value;
  state.catalog = catalog.status === 'fulfilled' ? catalog.value : null;
  renderDeployment(); renderArticles(); updateStatus();
}
function renderDeployment() {
  const deployment = state.deployment;
  $('router-state').textContent = deployment.routerConfigured ? '已配置' : '尚未配置';
  $('router-current').textContent = deployment.routerCurrent ? deployment.routerCurrent.slice(0, 8) : '部署包基线';
  $('deploy-article').textContent = state.draft ? `${titleOf(state.draft)} · ${state.draft.version ? '后台 v' + state.draft.version : '尚未保存'}${dirty() ? ' · 有未保存修改' : ''}` : '请先打开并保存一篇文章。';
  $('deployed-status').textContent = state.draft ? deployedLabel(state.draft) : '';
  $('candidate-list').replaceChildren();
  if (!deployment.items.length) $('candidate-list').append(node('div', '还没有候选版本。先保存文章，再冻结候选。', 'empty'));
  deployment.items.forEach((candidate) => {
    const current = candidate.id === deployment.routerCurrent; const operation = candidate.snapshot.operation === 'unpublish' ? '下架文章' : '部署文章';
    const card = node('section', undefined, 'candidate-card' + (current ? ' current' : '')); const info = node('div');
    info.append(node('h3', (candidate.articleTitle || '文章 ' + candidate.article.slice(0, 8)) + ' · v' + candidate.version), node('span', current ? '当前站点快照' : candidate.router_state === 'router_deployed' ? '历史部署快照' : '候选已冻结 · 尚未部署', 'badge'), node('p', operation + (candidate.created ? ' · ' + dateText(candidate.created) : '')), node('p', '候选 ' + candidate.id + ' · 校验 ' + (candidate.snapshot.sha256 || '').slice(0, 12), 'candidate-fingerprint'));
    if (candidate.error) info.append(node('p', candidate.error));
    const deploy = button(current ? '当前已应用' : '部署到路由器', () => run(async () => {
      const label = candidate.snapshot.operation === 'unpublish' ? '下架这篇文章' : '应用这篇文章';
      if (!window.confirm(`确认在路由器${label}的冻结版本 v${candidate.version}？此操作改变当前路由器博客内容，后续草稿修改不会包含在内。`)) { notify('已取消部署，当前路由器内容保持原状态。'); return; }
      await request('/candidates/' + candidate.id + '/deploy-router', 'POST');
      await refreshDeployment(); notify('候选已应用到当前路由器站点。此状态不代表已经公网发布。');
    }, '正在部署冻结候选，请保持页面打开…'), 'primary');
    deploy.disabled = current || !deployment.routerConfigured;
    card.append(info, deploy); $('candidate-list').append(card);
  });
  updateControls();
}
async function freeze(operation) {
  collectEditor();
  if (!state.draft?.version || dirty() || state.conflict) throw new Error('请先保存草稿，并处理版本冲突，再冻结候选。');
  const identity = state.draft.id; const version = state.draft.version;
  if (!state.freezeRequest || state.freezeRequest.article !== identity || state.freezeRequest.version !== version || state.freezeRequest.operation !== operation) state.freezeRequest = { article: identity, version, operation, requestId: crypto.randomUUID() };
  const candidate = await request('/articles/' + identity + '/candidates', 'POST', { version, operation, requestId: state.freezeRequest.requestId });
  state.freezeRequest = null;
  await refreshDeployment();
  notify(`候选 ${candidate.id.slice(0, 8)} 已冻结，博客尚未变化。请检查版本后单独点击「部署到路由器」。`);
}
async function bootWorkspace() {
  state.authenticated = true; $('login-view').hidden = true; $('workspace').hidden = false;
  await refreshArticles(); await refreshDeployment();
  renderRecovery(); showPage(state.page); notify('已登录私人编辑室。草稿保存与路由器部署分开进行。');
}

$('login-form').addEventListener('submit', (event) => { event.preventDefault(); run(async () => { const result = await request('/login', 'POST', { password: $('password').value }); state.csrf = result.csrf; $('password').value = ''; await bootWorkspace(); }, '正在登录…'); });
$('logout').addEventListener('click', () => run(async () => { collectEditor(); remember(); await request('/logout', 'POST'); state.csrf = ''; state.authenticated = false; $('workspace').hidden = true; $('login-view').hidden = false; notify('已退出登录。本机未同步草稿会保留在当前浏览器，重新登录后可恢复。'); }));
document.querySelectorAll('[data-page]').forEach((element) => element.addEventListener('click', () => run(async () => { const page = element.dataset.page; if (page === 'album') state.album = await request('/media'); if (page === 'deploy') await refreshDeployment(); showPage(page); })));
$('new-article').addEventListener('click', () => run(async () => newArticle()));
$('new-from-write').addEventListener('click', () => run(async () => newArticle()));
$('search').addEventListener('input', renderArticles); $('category-filter').addEventListener('change', renderArticles);
$('trash-filter').addEventListener('change', () => run(refreshArticles));
$('refresh-articles').addEventListener('click', () => run(async () => { await refreshArticles(); await refreshDeployment(); notify('文章与部署状态已刷新。'); }));
$('import-articles').addEventListener('click', () => run(async () => { const result = await request('/import', 'POST'); await refreshArticles(); notify(`导入完成：新增 ${result.imported.length} 篇，跳过 ${result.skipped.length} 篇${result.errors.length ? '，有 ' + result.errors.length + ' 个文件未能导入：' + result.errors.join('、') : '。现有草稿保留。'}`, Boolean(result.errors.length)); }, '正在导入本机部署基线…'));
$('editor-form').addEventListener('submit', (event) => { event.preventDefault(); run(saveDraft, '正在保存草稿…'); });
$('editor-form').addEventListener('input', () => { collectEditor(); remember(); updatePreview(); });
$('save-draft').addEventListener('click', () => run(saveDraft, '正在保存草稿…'));
$('export-draft').addEventListener('click', exportDraft);
$('preview-toggle').addEventListener('click', () => { state.preview = !state.preview; updatePreview(); });
document.querySelectorAll('[data-format]').forEach((element) => element.addEventListener('click', () => format(element.dataset.format)));
$('history').addEventListener('click', () => run(history)); $('close-history').addEventListener('click', () => $('history-dialog').close());
$('conflict-merge').addEventListener('click', () => resolveConflict('merge')); $('conflict-copy').addEventListener('click', () => resolveConflict('copy')); $('conflict-remote').addEventListener('click', () => resolveConflict('remote'));
$('upload-body').addEventListener('click', () => chooseUpload('body')); $('upload-cover').addEventListener('click', () => chooseUpload('cover')); $('upload-album').addEventListener('click', () => chooseUpload('album'));
$('pick-cover').addEventListener('click', () => run(async () => { state.pickerRole = 'cover'; state.album = await request('/media'); showPage('album'); }));
$('image-file').addEventListener('change', () => { const files = [...$('image-file').files]; if (files.length) run(() => uploadImages(files)); });
$('go-deploy').addEventListener('click', () => run(async () => { await refreshDeployment(); showPage('deploy'); }));
$('refresh-deploy').addEventListener('click', () => run(async () => { await refreshDeployment(); notify('已读取当前路由器部署状态。'); }));
$('freeze').addEventListener('click', () => run(() => freeze('publish'), '正在核验并冻结候选…'));
$('freeze-unpublish').addEventListener('click', () => run(() => freeze('unpublish'), '正在核验并冻结下架候选…'));
$('rollback').addEventListener('click', () => run(async () => { if (!window.confirm('确认回滚整个路由器站点到上一部署快照？私人草稿与文章历史会保留。')) { notify('已取消回滚，当前路由器内容保持原状态。'); return; } await request('/router/rollback', 'POST'); await refreshDeployment(); notify('路由器已恢复上一份站点快照。草稿内容没有变化。'); }, '准备回滚…'));
window.addEventListener('beforeunload', (event) => { if (dirty()) { remember(); event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && state.authenticated && state.draft) { event.preventDefault(); run(saveDraft, '正在保存草稿…'); } });
window.addEventListener('offline', () => notify('网络已断开。可以继续编辑，本机草稿会保留；恢复网络后请手动保存。', true));
window.addEventListener('online', () => notify('网络已恢复。请保存本机修改，并刷新部署状态。'));
run(async () => {
  try { const session = await request('/session'); state.csrf = session.csrf; await bootWorkspace(); }
  catch (error) { if (error.status !== 401) throw error; $('login-view').hidden = false; notify('请输入编辑室密码。'); }
});
