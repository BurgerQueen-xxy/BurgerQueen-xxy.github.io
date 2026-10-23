// The private editor previews this exact theme. Ordinary static sites stay unchanged.
const PREVIEW_KEY = 'page-editor-preview';
const fields = ['name', 'englishName', 'author', 'description', 'bio', 'currentNote', 'location'];

export function validatePageSettings(value, defaults) {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join('|') !== 'messages|passport|schema|text' || value.schema !== 1 || !value.text || !value.messages || !value.passport) throw new Error('页面设置格式无效，请检查已部署的页面版本。');
  if (defaults && (Object.keys(value.text).sort().join('|') !== Object.keys(defaults.text).sort().join('|') || Object.keys(value.messages).sort().join('|') !== Object.keys(defaults.messages).sort().join('|'))) throw new Error('页面字段与当前主题不一致，请先更新页面草稿。');
  for (const item of Object.values(value.text)) {
    if (!item || Object.keys(item).sort().join('|') !== 'fontSize|label|value' || typeof item.label !== 'string' || typeof item.value !== 'string' || item.value.length > 4000 || item.value.includes('\0') || !(item.fontSize === null || typeof item.fontSize === 'number' && Number.isFinite(item.fontSize) && item.fontSize >= 8 && item.fontSize <= 96)) throw new Error('页面文字或字号格式无效。');
  }
  const link = value.text['footer.linkUrl']?.value;
  if (typeof link !== 'string' || (link && !/^https:\/\/[^\s<>"\\]+$/.test(link))) throw new Error('页脚链接必须使用 HTTPS。');
  const avatar = value.text['profile.avatar']?.value;
  if (typeof avatar !== 'string' || avatar && (!/^(?:\.?\/)?(?:assets\/|api\/media\/|site-settings-media\/)/.test(avatar) || avatar.includes('..') || /[\s<>"'\\]/.test(avatar))) throw new Error('页面头像须来自本站。');
  for (const words of Object.values(value.messages)) {
    if (!words || Object.keys(words).sort().join('|') !== 'empty|missing') throw new Error('栏目提示词字段无效。');
    for (const name of ['missing', 'empty']) if (!Array.isArray(words?.[name]) || !words[name].length || words[name].length > 100 || words[name].some((word) => typeof word !== 'string' || !word.trim() || word.length > 300)) throw new Error('栏目提示词格式无效。');
  }
  if (Object.keys(value.passport).sort().join('|') !== 'order|stamps' || !Array.isArray(value.passport.stamps) || !Array.isArray(value.passport.order) || value.passport.stamps.length > 500 || value.passport.order.length > 2000) throw new Error('护照页面数据格式无效。');
  if (new TextEncoder().encode(JSON.stringify(value)).length > 512 * 1024) throw new Error('页面设置超过 512 KiB。');
  return value;
}

export class PageSettingsLoadError extends Error {
  constructor(message) { super(message); this.name = 'PageSettingsLoadError'; }
}

export async function loadPageSettings(site, { fetcher = fetch, search = location.search, storage } = {}) {
  const preview = new URLSearchParams(search).get('editor-preview') === '1';
  if (site.contentMode !== 'runtime' && !preview) return null;
  async function json(path, allow404 = false) {
    let response;
    try { response = await fetcher(path, { cache: 'no-store', credentials: 'same-origin' }); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new PageSettingsLoadError('页面设置连接失败，请刷新重试；未改用旧页面内容。');
    }
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new PageSettingsLoadError(`页面设置读取失败（${response.status}），请稍后重试。`);
    try { return await response.json(); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new PageSettingsLoadError('页面设置不是有效 JSON，请检查本站部署。');
    }
  }
  let defaults, settings;
  try {
    defaults = validatePageSettings(await json('./site-settings.defaults.json'));
    if (preview) {
      const local = (storage || sessionStorage).getItem(PREVIEW_KEY);
      if (local) settings = validatePageSettings(JSON.parse(local), defaults);
      else settings = validatePageSettings((await json('/api/site-settings')).value, defaults);
    } else settings = validatePageSettings(await json('/site-settings.json', true) || structuredClone(defaults), defaults);
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof PageSettingsLoadError) throw error;
    throw new PageSettingsLoadError(error.message || '页面设置读取失败。');
  }
  return { settings, defaults, preview };
}

export function mergePageSettings(site, settings) {
  if (!settings) return site;
  return { ...site, ...Object.fromEntries(fields.map((key) => [key, settings.text[`site.${key}`].value])), categories: site.categories.map((category) => ({ ...category, description: settings.text[`category.${category.name}.description`]?.value ?? category.description })) };
}

function setText(element, item, { keepChildren = false } = {}) {
  if (!element || !item) return;
  if (keepChildren) {
    let text = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (!text) { text = document.createTextNode(''); element.prepend(text); }
    const value = item.value + ' ';
    if (text.textContent !== value) text.textContent = value;
    for (const extra of [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node !== text)) extra.remove();
  } else if (element.textContent !== item.value || element.querySelector('br')) element.textContent = item.value;
  element.style.whiteSpace = 'pre-line';
  if (item.fontSize === null) element.style.removeProperty('font-size');
  else element.style.fontSize = `${item.fontSize}px`;
}

/** Binds the existing DOM, including passport pages created lazily while turning. */
export function mountPageSettings(state) {
  if (!state) return { apply() {}, dispose() {} };
  const { settings, defaults, preview } = state;
  const text = settings.text;
  const bind = (selector, key, options) => document.querySelectorAll(selector).forEach((element) => setText(element, text[key], options));
  const font = (selector, key) => document.querySelectorAll(selector).forEach((element) => {
    if (text[key].fontSize === null) element.style.removeProperty('font-size');
    else element.style.fontSize = `${text[key].fontSize}px`;
  });
  let scheduled = false, disposed = false;
  function apply() {
    if (disposed) return;
    bind('[data-site-name]', 'site.name'); bind('[data-english-name]', 'site.englishName');
    const title = document.querySelector('#island-title');
    if (title && !title.querySelector('[data-settings-hero-line]')) {
      const first = document.createElement('span'); first.dataset.settingsHeroLine = '1';
      const second = document.createElement('em'); second.dataset.settingsHeroLine = '2';
      title.replaceChildren(first, document.createElement('br'), second);
    }
    bind('[data-settings-hero-line="1"]', 'hero.line1'); bind('[data-settings-hero-line="2"]', 'hero.line2');
    bind('.island-hero-copy > p', 'hero.description'); bind('.island-primary', 'hero.button', { keepChildren: true });
    bind('.jp-heading h1, .jp-cover:not(.jp-back) .jp-cover-title h2', 'passport.title');
    bind('.jp-heading > p', 'passport.description'); bind('.jp-signature > strong', 'passport.signature');
    bind('.jp-page-outside .jp-page-title', 'passport.nextStop'); bind('.jp-inside-content > span', 'passport.message');
    bind('.letter-section h2', 'home.message'); bind('.footer-motto', 'footer.motto');
    bind('.site-footer > p', 'footer.notice', { keepChildren: true }); bind('.site-footer > p > span > a', 'footer.linkLabel');
    const footerLink = document.querySelector('.site-footer > p > span > a');
    if (footerLink) {
      if (text['footer.linkUrl'].value) { footerLink.href = text['footer.linkUrl'].value; footerLink.removeAttribute('aria-disabled'); }
      else { footerLink.removeAttribute('href'); footerLink.setAttribute('aria-disabled', 'true'); }
    }
    bind('.jp-holder-name dd', 'site.author'); bind('.jp-person-fields .jp-profile-field:nth-child(2) dd', 'site.location');
    bind('.jp-person-fields .jp-profile-field:nth-child(3) dd', 'site.currentNote'); bind('.jp-profile-about dd', 'site.bio');
    bind('.jp-cover-owner', 'site.author', { keepChildren: true });
    font('.profile-note h2, .passport-layout > div > h2', 'site.author');
    font('.profile-note > p, .passport-layout > div > p:not(.island-kicker)', 'site.bio');
    font('.now-note > p', 'site.currentNote');
    const avatar = text['profile.avatar'].value || './assets/brachio.png';
    document.querySelectorAll('.jp-id-photo img, .profile-note .avatar img').forEach((image) => { if (image.getAttribute('src') !== avatar) image.setAttribute('src', avatar); });
    let category;
    try { category = decodeURIComponent(location.hash.split('?')[0].replace(/^#\/category\//, '')); } catch { /* Invalid route is rendered by the app. */ }
    if (settings.messages[category]) {
      bind('.category-intro > div > p:last-child', `category.${category}.description`);
      document.querySelectorAll('.catalog-grid .empty-state > p').forEach((element) => setText(element, { value: settings.messages[category].empty[0], fontSize: null }));
    }
    document.querySelectorAll('.jp-stamp-entry.is-pending').forEach((entry) => {
      let name;
      try { name = decodeURIComponent(entry.getAttribute('href').split('/category/')[1]); } catch { return; }
      if (settings.messages[name]) setText(entry.querySelector('.jp-stamp-caption'), { value: settings.messages[name].missing[0], fontSize: null });
    });
    const outsideEmpty = document.querySelector('[data-section-items="户外"] .empty-note');
    if (outsideEmpty) setText(outsideEmpty, { value: settings.messages['户外'].empty[0], fontSize: null });
  }
  const observer = new MutationObserver(() => {
    if (scheduled || disposed) return;
    scheduled = true; queueMicrotask(() => { scheduled = false; apply(); });
  });
  observer.observe(document.querySelector('#main') || document.body, { childList: true, subtree: true });
  function receive(event) {
    if (!preview || window.parent === window || event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'blog-page-preview') return;
    try {
      validatePageSettings(event.data.value, defaults);
      const serialized = JSON.stringify(event.data.value);
      if (sessionStorage.getItem(PREVIEW_KEY) === serialized) return;
      sessionStorage.setItem(PREVIEW_KEY, serialized);
      location.reload();
    } catch (error) {
      window.parent.postMessage({ type: 'blog-page-preview-error', message: error.message }, location.origin);
    }
  }
  if (preview) window.addEventListener('message', receive);
  apply();
  if (preview && window.parent !== window) window.parent.postMessage({ type: 'blog-page-preview-ready' }, location.origin);
  return { apply, dispose() { disposed = true; observer.disconnect(); window.removeEventListener('message', receive); } };
}
