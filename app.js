import { renderPassport, syncPassport, disposePassport } from './modules/passport.js';
import { mountScene, syncScene } from './modules/scene.js';
import { mountPet } from './pet.js';
import { renderIsland, syncIsland, categoryArt, weatherIcon, renderStoryCards } from './modules/island.js';
import { mountWidgets, syncWidgets } from './modules/widgets.js';
import { loadContent } from './content-client.mjs';

const icons = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  moon: '<path d="M20.5 14.2A8.7 8.7 0 0 1 9.8 3.5a8.8 8.8 0 1 0 10.7 10.7Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  heart: '<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>',
  leaf: '<path d="M20 3C8 2 2 7 5 15c6 8 15 2 15-12Z"/><path d="M3 21 15 9"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  link: '<path d="m10 13 4-4m-6 8-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2-1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
};
const icon = (name, className = '') => `<svg class="icon ${className}" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = selector => document.querySelector(selector);
let categories = ['全部'], posts = [], site = {}, filter = '全部', littleTab = 'collections', currentPage = 'home', toastTimer;
const categoryUrl = name => `#/category/${encodeURIComponent(name)}`;
const getCategory = name => (site.categories || []).find(c => c.name === name);
const readSaved = () => { try { const v = JSON.parse(localStorage.getItem('slow-notes-saved') || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } };
let saved = readSaved();
const dateLabel = date => String(date).replaceAll('-', '.');
const postUrl = post => `#/post/${encodeURIComponent(post.slug)}`;
const linkArrow = (href, text, cls = '') => `<a class="text-link ${cls}" href="${href}">${escape(text)} ${icon('arrow')}</a>`;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800);
}

function syncTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#theme-toggle').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#theme-toggle').setAttribute('aria-label', dark ? '切换到日间模式' : '切换到夜间模式');
  $('#theme-toggle').title = dark ? '切换到日间模式' : '切换到夜间模式';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#202921' : '#faf8f0';
}

function categoryTabs() {
  return `<div class="filter-tabs" aria-label="文章分类">${categories.map(c => { const item=getCategory(c); return `<button data-filter="${c}" class="filter-tab ${filter === c ? 'active' : ''}" aria-pressed="${filter === c}" title="${item ? escape(item.character+' · '+c):'全部手记'}">${item?`<img src="./${escape(item.asset)}" alt="" width="22" height="26">`:''}${c}</button>`; }).join('')}</div>`;
}

function postRow(post, index = 0) {
  return `<article class="post-row" style="--row-index:${index}">
    <a class="post-cover cover-${index % 3}" href="${postUrl(post)}" tabindex="-1" aria-hidden="true">${categoryArt(post,site.categories)}</a>
    <div class="post-summary"><div class="post-meta"><span>${escape(post.category)}</span><span class="meta-dot">·</span><time datetime="${escape(post.date)}">${dateLabel(post.date)}</time></div>
      <h3><a href="${postUrl(post)}">${escape(post.title)}</a></h3><p>${escape(post.excerpt)}</p>
      <div class="post-bottom"><span>${icon('clock')} ${escape(post.readingTime)}${post.readingTime.includes('阅读') ? '' : '阅读'}</span><a class="post-arrow" href="${postUrl(post)}" aria-label="阅读：${escape(post.title)}">${icon('arrow')}</a></div>
    </div></article>`;
}

function profile() {
  return `<aside class="home-sidebar"><div class="profile-note"><span class="paper-tape" aria-hidden="true"></span><div class="avatar"><img src="./assets/brachio.png" alt="布拉吉奥" width="44" height="86"></div><h2>你好，我是${escape(site.author)}。</h2><p>${escape(site.bio || '一个认真生活、偶尔发呆的人。')}<br>这里是我的小小自留地。</p>${linkArrow('#/about','认识一下')}</div><div class="now-note"><h2>此刻的小事</h2><p><span class="status-dot"></span>${escape(site.currentNote || '在读书，也在等风来')}</p><img src="./assets/woody.png" width="38" height="85" alt="伍迪" loading="lazy"></div><p class="side-whisper">生活不用很大，<br>装得下喜欢就好。</p></aside>`;
}

function filteredPosts() { return filter === '全部' ? posts : posts.filter(post => post.category === filter); }

function home() { return renderIsland(site, posts); }

function renderPosts(limit) {
  const items = filteredPosts();
  return items.length ? items.slice(0, limit || items.length).map(postRow).join('') : (filter==='金子'?'<div class="empty-state jinzi-empty"><img src="./assets/woody.png" alt="伍迪" width="43" height="94"><h2>金子的小日子，慢慢收集。</h2><p>这里留给小黑猫金子的照片和故事。</p></div>':'<div class="empty-state"><p>这一页还空着，留给下次的小故事。</p></div>');
}

function categoryPage(name) {
  const category=getCategory(name);
  if(!category) return notFound();
  filter=name;
  document.title=`${name} · ${category.character} · ${site.name}`;
  const selected=filteredPosts();
  return `<section class="page-intro category-intro"><div><p class="page-english">${escape(category.englishName)} / ${escape(category.character)}</p><h1>${name==='金子'?'金子的小小世界':escape(name)}</h1><p>${escape(category.description)}</p></div><img src="./${escape(category.asset)}" alt="${escape(category.character)}" width="95" height="130"></section><div class="category-summary"><span>${selected.length} 篇手记</span>${name==='收藏'?linkArrow('#/little-things?tab=saved','我的阅读书签'):linkArrow('#/journal','全部手记')}</div><section class="catalog-grid ${selected.length?'story-grid':''}" id="post-list">${selected.length?renderStoryCards(site,posts,selected):renderPosts()}</section><nav class="category-paths" aria-label="六位小伙伴">${site.categories.map(c=>`<a href="${categoryUrl(c.name)}"><img src="./${escape(c.asset)}" alt="">${escape(c.name)}</a>`).join('')}</nav>`;
}

function journal() {
  return `<section class="page-intro"><p class="page-english">THE JOURNAL</p><h1>把日子，写成手记。</h1><p>一些走过的路，一些想留下来的小事。</p></section><section class="journal-layout"><div><div class="journal-toolbar">${categoryTabs()}<span class="result-count" id="result-count">${filteredPosts().length} 篇手记</span></div><div id="post-list" class="post-list">${renderPosts()}</div></div>${profile()}</section>`;
}

function littleThings() {
  return `<section class="page-intro"><p class="page-english">LITTLE THINGS</p><h1>小小的，也很重要。</h1><p>喜欢的东西，随手记下的瞬间，还有想再读一遍的文字。</p></section><div class="little-tabs" aria-label="生活小事栏目">${[['collections','小收藏'],['notes','生活碎片'],['saved','我的书签']].map(([key,label]) => `<button class="text-tab ${littleTab===key?'active':''}" data-little-tab="${key}" aria-pressed="${littleTab===key}">${label}${key==='saved'?` <span>${saved.length}</span>`:''}</button>`).join('')}</div><section id="little-content" class="little-content">${littleContent()}</section>`;
}

function littleContent() {
  if (littleTab === 'saved') {
    const bookmarked = posts.filter(p => saved.includes(p.slug));
    return bookmarked.length ? `<div class="saved-list">${bookmarked.map(postRow).join('')}</div><p class="small-note">书签保存在当前浏览器里。</p>` : `<div class="empty-state"><img src="./assets/brachio.png" alt="布拉吉奥" width="54" height="105"><h2>留一个位置，给喜欢的文字。</h2><p>阅读文章时，点一下「收藏这篇」，它就会在这里等你。</p>${linkArrow('#/journal','去翻翻手记')}</div>`;
  }
  if (littleTab === 'notes') return `<div class="notes-list">${(site.notes || []).map(n => `<article class="small-note-row"><time datetime="${escape(n.date)}">${dateLabel(n.date)}</time><p>${escape(n.text)}</p>${icon('leaf')}</article>`).join('')}</div>`;
  return `<div class="collection-list">${(site.collections || []).map((c,i) => `<article class="collection-item"><div class="collection-art collection-art-${i%3}">${icon(i%2 ? 'leaf' : 'book')}<span>${String(i+1).padStart(2,'0')}</span></div><div><span class="post-meta">${escape(c.kind)}</span><h2>${escape(c.title)}</h2><p>${escape(c.note)}</p></div></article>`).join('')}</div>`;
}

function about() { return renderPassport(site,posts); }

function detail(slug) {
  const post = posts.find(p => p.slug === slug);
  if (!post) return notFound();
  const isSaved = saved.includes(slug);
  document.title = `${post.title} · ${site.name}`;
  const index = posts.indexOf(post);
  return `<article class="article-page"><div class="article-back">${linkArrow('#/journal','回到手记','back-link')}</div><header class="article-header"><div class="post-meta"><a href="#/journal?category=${encodeURIComponent(post.category)}">${escape(post.category)}</a><span>·</span><time datetime="${escape(post.date)}">${dateLabel(post.date)}</time><span>·</span><span>${escape(post.readingTime)}阅读</span></div><h1>${escape(post.title)}</h1><p>${escape(post.excerpt)}</p></header>${categoryArt(post,site.categories,'article-cover')}<div class="article-body">${post.body}</div><div class="article-tags">${(post.tags || []).map(t=>`<a href="#/journal?search=${encodeURIComponent(t)}"># ${escape(t)}</a>`).join('')}</div><div class="article-actions"><button class="button ${isSaved?'saved':''}" data-bookmark="${escape(slug)}" aria-pressed="${isSaved}">${icon('bookmark')} ${isSaved?'已收藏':'收藏这篇'}</button><button class="button" data-copy>${icon('link')} 复制文章链接</button></div><div class="article-end"><img src="./assets/woody.png" alt="" width="34" height="73"><p>谢谢你，读到了这里。<br><span>愿你今天也遇见一件小小的好事。</span></p></div><nav class="article-pagination" aria-label="相邻文章">${index>0?`<a href="${postUrl(posts[index-1])}"><small>上一篇</small><span>${escape(posts[index-1].title)}</span></a>`:'<span></span>'}${index<posts.length-1?`<a href="${postUrl(posts[index+1])}"><small>下一篇</small><span>${escape(posts[index+1].title)}</span></a>`:'<span></span>'}</nav></article>`;
}

function notFound() { return `<div class="empty-state page-empty"><img src="./assets/brachio.png" width="55" height="108" alt="布拉吉奥"><h1>好像走到了一条小岔路。</h1><p>这篇手记还没有写好，先回去逛逛吧。</p>${linkArrow('#/','回到首页')}</div>`; }

function render() {
  disposePassport();
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathname, query=''] = raw.split('?');
  const params = new URLSearchParams(query);
  currentPage = pathname.startsWith('/post/') ? 'post' : (pathname.split('/')[1] || 'home');
  filter = categories.includes(params.get('category')) ? params.get('category') : '全部';
  document.title = `${site.name} · ${currentPage==='home'?'生活手记':({'journal':'手记','about':'关于我','little-things':'生活小事'}[currentPage] || '手记')}`;
  let content;
  if (currentPage==='home') content=home();
  else if (currentPage==='journal') content=journal();
  else if (currentPage==='little-things') { if(['collections','notes','saved'].includes(params.get('tab')))littleTab=params.get('tab');content=littleThings(); }
  else if (currentPage==='about') content=about();
  else if (currentPage==='category') { try {content=categoryPage(decodeURIComponent(pathname.slice(10)));}catch{content=notFound();} }
  else if (currentPage==='post') { try { content=detail(decodeURIComponent(pathname.slice(6))); } catch { content=notFound(); } }
  else content=notFound();
  $('#main').innerHTML = content;
  document.body.dataset.page = currentPage;
  $('#mobile-menu').hidden = true;
  document.querySelector('.mobile-more')?.setAttribute('aria-expanded','false');
  $('.site-header').classList.toggle('scrolled', currentPage !== 'home' || window.scrollY > 90);
  if(currentPage === 'home') { syncIsland(); syncScene(); }
  if(currentPage === 'about') syncPassport();
  syncWidgets();
  document.querySelectorAll('[data-nav]').forEach(el => {
    const selectedCategory=currentPage==='post'?posts.find(p=>postUrl(p)===location.hash)?.category:filter;
    const active = el.dataset.nav === currentPage || (el.dataset.nav===selectedCategory && ['category','post'].includes(currentPage));
    el.classList.toggle('active',active);
    if(active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  if ($('#search-dialog').open) $('#search-dialog').close();
  window.scrollTo({top:0,behavior:'instant'});
  $('#reading-progress').style.width='0%';
  if (params.get('search')) openSearch(params.get('search'));
}

function search(query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length ? posts.filter(p=>terms.every(t => `${p.title} ${p.excerpt} ${p.category} ${p.tags.join(' ')} ${p.body.replace(/<[^>]*>/g,' ')}`.toLocaleLowerCase().includes(t))) : posts.slice(0,4);
  $('#search-hint').textContent = terms.length ? `找到 ${results.length} 篇相关手记` : '试试「日常」「咖啡」「旅行」';
  $('#search-results').innerHTML = results.length ? results.map(p=>`<a class="search-result" href="${postUrl(p)}"><span><small>${escape(p.category)} · ${dateLabel(p.date)}</small><strong>${escape(p.title)}</strong><p>${escape(p.excerpt)}</p></span>${icon('arrow')}</a>`).join('') : '<div class="search-empty">还没找到这段小故事，换个词试试吧。</div>';
}

function openSearch(query='') {
  if (!$('#search-dialog').open) $('#search-dialog').showModal();
  $('#search-input').value=query; search(query); $('#search-input').focus();
}

$('#search-toggle').innerHTML=icon('search');
$('#weather-toggle').innerHTML=weatherIcon();
$('#music-toggle').innerHTML='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="18" cy="16" rx="3" ry="2.5"/></svg>';
$('#search-close').innerHTML=icon('close');
$('#search-field-icon').innerHTML=icon('search');
$('#back-top').innerHTML=icon('up');
syncTheme();
document.addEventListener('slow-theme-change',syncTheme);
mountPet({trigger:'#pet-toggle'});
$('#theme-toggle').addEventListener('click',()=>{
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem('slow-notes-theme',dark?'dark':'light'); } catch { toast('当前浏览器无法保存偏好，切换仍然有效。'); }
  syncTheme();
});
$('#search-toggle').addEventListener('click',()=>openSearch());
$('#search-close').addEventListener('click',()=>$('#search-dialog').close());
$('#search-input').addEventListener('input',e=>search(e.target.value));
$('#search-results').addEventListener('click',e=>{if(e.target.closest('a'))$('#search-dialog').close();});
$('.skip-link').addEventListener('click',e=>{e.preventDefault();$('#main').focus();$('#main').scrollIntoView({behavior:'instant'});});
$('#search-dialog').addEventListener('click',e=> { if(e.target===$('#search-dialog')) {const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();} });
$('#back-top').addEventListener('click',()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
$('#mobile-menu-close').addEventListener('click',()=>{ $('#mobile-menu').hidden=true; document.querySelector('.mobile-more')?.setAttribute('aria-expanded','false'); });
document.addEventListener('click',e=>{if(!$('#mobile-menu').hidden&&!e.target.closest('#mobile-menu,.mobile-more')){$('#mobile-menu').hidden=true;document.querySelector('.mobile-more')?.setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') {e.preventDefault();openSearch();}
  else if(e.key==='Escape'&&!$('#mobile-menu').hidden){$('#mobile-menu').hidden=true;document.querySelector('.mobile-more')?.setAttribute('aria-expanded','false');document.querySelector('.mobile-more')?.focus();}
  else if (e.key==='/' && !e.target.matches('input,textarea,[contenteditable]')) {e.preventDefault();openSearch();}
});
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');
  if(!button) return;
  if(button.hasAttribute('data-filter')) {
    filter=button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
    $('#post-list').innerHTML=renderPosts(currentPage==='home'?2:undefined);
    if($('#result-count')) $('#result-count').textContent=`${filteredPosts().length} 篇手记`;
  }
  if(button.hasAttribute('data-random') && posts.length) location.hash=postUrl(posts[Math.floor(Math.random()*posts.length)]);
  if(button.hasAttribute('data-greet')) {
    const greetings=['今天也有好好生活。','没关系，慢慢来就好。','小小的你，也很重要。','先休息一下，再出发吧。'];
    const caption=$('#greeting');
    caption.textContent=greetings[(greetings.indexOf(caption.textContent)+1)%greetings.length];
    button.classList.remove('wave'); void button.offsetWidth;button.classList.add('wave');
  }
  if(button.hasAttribute('data-little-tab')) {
    littleTab=button.dataset.littleTab;
    document.querySelectorAll('[data-little-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.littleTab===littleTab);b.setAttribute('aria-pressed',String(b.dataset.littleTab===littleTab));});
    $('#little-content').innerHTML=littleContent();
  }
  if(button.hasAttribute('data-bookmark')) {
    const slug=button.dataset.bookmark;
    const next=saved.includes(slug)?saved.filter(x=>x!==slug):[...saved,slug];
    try {localStorage.setItem('slow-notes-saved',JSON.stringify(next)); saved=next; const active=saved.includes(slug);button.classList.toggle('saved',active);button.setAttribute('aria-pressed',String(active));button.innerHTML=`${icon('bookmark')} ${active?'已收藏':'收藏这篇'}`;toast(active?'收好了，下次在「收藏 → 我的阅读书签」见。':'已从书签里移除。');} catch {toast('当前浏览器无法保存书签，请检查存储设置。');}
  }
  if(button.hasAttribute('data-copy')) {
    try {await navigator.clipboard.writeText(location.href);toast('文章链接复制好了。');} catch {toast('暂时无法复制，可以从浏览器地址栏复制链接。');}
  }
});
window.addEventListener('scroll',()=>{
  $('.site-header').classList.toggle('scrolled',currentPage!=='home'||window.scrollY>90);
  $('#back-top').hidden=window.scrollY<450;
  if(currentPage==='post') {const max=document.documentElement.scrollHeight-innerHeight;$('#reading-progress').style.width=`${max>0?Math.min(100,scrollY/max*100):100}%`;}
},{passive:true});
window.addEventListener('hashchange',()=>{render();$('#main').focus({preventScroll:true});});

async function init() {
  try {
    ({ posts, site } = await loadContent());
    saved=saved.filter(slug=>posts.some(p=>p.slug===slug));
    categories=['全部',...(site.categories||[]).map(c=>c.name)];
    document.querySelector('meta[name="description"]').content=site.description;
    $('.brand').setAttribute('aria-label',`${site.name} 首页`);
    $('.main-nav').innerHTML=`${(site.categories||[]).map(c=>`<a href="${categoryUrl(c.name)}" data-nav="${escape(c.name)}" title="${escape(c.character)}"><img class="nav-character" src="./${escape(c.asset)}" alt=""><span>${escape(c.name)}</span></a>`).join('')}<a href="#/about" data-nav="about"><img class="nav-passport" src="./assets/ubhc-transparent.png" alt=""><span>护照</span></a><button class="mobile-more" aria-expanded="false" aria-controls="mobile-menu"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg><span>更多</span></button>`;
    $('#mobile-menu-links').innerHTML=`${site.categories.map(c=>`<a href="${categoryUrl(c.name)}"><img src="./${escape(c.asset)}" alt="">${escape(c.name)}</a>`).join('')}<a href="#/journal">全部手记</a><a href="#/about">生活护照</a><a href="#/little-things?tab=saved">阅读书签</a><button id="mobile-pet-toggle">布拉吉奥小伙伴</button>`;
    $('#mobile-pet-toggle').addEventListener('click',()=>{$('#pet-toggle').click();});
    document.querySelector('.mobile-more').addEventListener('click',()=>{const open=$('#mobile-menu').hidden;$('#mobile-menu').hidden=!open;document.querySelector('.mobile-more').setAttribute('aria-expanded',String(open));});
    document.querySelectorAll('[data-site-name]').forEach(el=>el.textContent=site.name);
    document.querySelectorAll('[data-english-name]').forEach(el=>el.textContent=site.englishName);
    $('#year').textContent=String(new Date().getFullYear());
    mountWidgets({site,posts});
    mountScene({gallery:site.heroGallery});
    render();
    document.dispatchEvent(new Event('slow-app-ready'));
  } catch(error) {
    $('#main').innerHTML='<div class="empty-state page-empty"><h1>手记还没翻开。</h1><p>暂时没能读取内容，请刷新页面再试一次。</p><button class="button primary" id="retry">重新打开</button></div>';
    $('#retry').addEventListener('click',init);
    console.error(error);
  }
}
init();
