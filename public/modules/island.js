const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const route = name => `#/category/${encodeURIComponent(name)}`;
const postRoute = post => `#/post/${encodeURIComponent(post.slug)}`;
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const demoCovers = new Set(['assets/journal-official.jpg', 'assets/woody-official.jpg', 'assets/lucky-official.jpg']);
let model, rotations = new Map();

export function categoryArt(post, categories, className = '') {
  const category = categories.find(c => c.name === post.category) || categories[0];
  if (post.cover && !demoCovers.has(post.cover)) return `<div class="real-cover ${className}"><img src="${esc(post.cover)}" alt="" loading="lazy"></div>`;
  return `<div class="role-art role-${esc(category.englishName.toLowerCase())} ${className}"><span class="art-sun" aria-hidden="true"></span><img class="art-cloud" src="./assets/scenery/cloud_02_pc.svg" alt="" loading="lazy"><img class="art-character" src="./${esc(category.asset)}" alt="${esc(category.character)}" loading="lazy"><span class="art-caption">${esc(category.englishName)}</span></div>`;
}

function character(name, extra = '') {
  const c = model.site.categories.find(c => c.name === name);
  return `<img class="section-character ${extra}" src="./${esc(c.asset)}" alt="${esc(c.character)}" loading="lazy">`;
}
function more(name, label = '看看这一栏') { return `<a class="island-link" href="${route(name)}">${esc(label)} ${arrow}</a>`; }
function sectionHeading(name, english, title, description) { return `<div class="island-heading">${character(name)}<div><p class="island-kicker">${english}</p><h2>${title}</h2><p>${description}</p></div></div>`; }
function selected(name, limit) {
  const all = model.posts.filter(p => p.category === name);
  const offset = rotations.get(name) || 0;
  return all.length ? [...all.slice(offset), ...all.slice(0, offset)].slice(0, limit) : [];
}
function refresh(name, label) {
  return `<button class="refresh-stories" data-refresh-section="${esc(name)}" ${model.posts.filter(p=>p.category===name).length < 2 ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>${label}</button>`;
}
function storyCard(post) {
  return `<article class="story-card"><a class="story-cover" href="${postRoute(post)}" aria-label="阅读：${esc(post.title)}">${categoryArt(post, model.site.categories)}<time datetime="${post.date}">${post.date.slice(5).replace('-', '/')}</time></a><div class="story-info"><a class="category-pill" href="${route(post.category)}">${esc(post.category)}</a><h3><a href="${postRoute(post)}">${esc(post.title)}</a></h3><p>${esc(post.excerpt)}</p><a class="island-link" href="${postRoute(post)}">读这篇手记 ${arrow}</a></div></article>`;
}
export function renderStoryCards(site,posts,items=posts){model={site,posts};return items.map(storyCard).join('');}
function polaroid(post, index) {return `<a class="polaroid polaroid-${index}" href="${postRoute(post)}">${categoryArt(post,model.site.categories)}<strong>${esc(post.title)}</strong></a>`;}
function recipeItems() {
  const items = selected('在家做饭', 3);
  return `<div class="dish-grid">${items.map(p=>`<a class="dish-card" href="${postRoute(p)}">${categoryArt(p,model.site.categories)}<div><span>${esc(p.tags?.[0] || '家常味道')}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></div>${arrow}</a>`).join('')}<div class="next-dish">${character('在家做饭')}<p>下一道家常菜，<br>慢慢做，也慢慢记。</p></div></div>`;
}
function diningItems() {return selected('出去吃饭',3).map((p,i)=>`<a class="pin-note note-${i}" href="${postRoute(p)}"><span class="note-pin" aria-hidden="true"></span>${categoryArt(p,model.site.categories)}<small>${esc(p.date.replaceAll('-','.'))}</small><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></a>`).join('');}
function outdoorItem() {
  const p=selected('户外',1)[0];
  return p ? `<a class="postcard-art" href="${postRoute(p)}">${categoryArt(p,model.site.categories)}</a><div class="postcard-message"><div class="postage-stamp">${character('户外')}<small>OUTSIDE</small></div><p class="island-kicker">A POSTCARD FROM OUTSIDE</p><h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p><a class="island-link" href="${postRoute(p)}">打开这张明信片 ${arrow}</a></div>` : `<div class="empty-note">下一张明信片，留给下一次出发。</div>`;
}
function otherItems(){return selected('其他',3).map(p=>`<a class="scrap-note" href="${postRoute(p)}"><time datetime="${p.date}">${p.date.slice(5).replace('-',' / ')}</time><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p>${arrow}</a>`).join('');}
function jinziItem() {
  const p=selected('金子',1)[0];
  return p ? `<a class="jinzi-photo" href="${postRoute(p)}">${categoryArt(p,model.site.categories)}</a><div><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><a class="island-link" href="${postRoute(p)}">看看金子 ${arrow}</a></div>` : `<div class="jinzi-photo-empty">${character('金子')}<span>WOODY & JINZI</span></div><div><p class="island-kicker">A LITTLE PLACE FOR JINZI</p><h3>金子的小日子，慢慢收集。</h3><p>这里留给小黑猫金子的照片和故事。<br>伍迪已经坐好，等金子来做客。</p>${more('金子','走进金子的小世界')}</div>`;
}

export function renderIsland(site, posts) {
  model = {site,posts};
  const collection=selected('收藏',2);
  return `<section class="island-hero" id="top" aria-labelledby="island-title">
    <div class="island-sky" aria-hidden="true"><div class="island-stars"></div><span class="island-sun"></span><span class="island-moon"></span><img class="cloud cloud-a" src="./assets/scenery/cloud_01_pc.svg" alt=""><img class="cloud cloud-b" src="./assets/scenery/cloud_02_pc.svg" alt=""><img class="cloud cloud-c" src="./assets/scenery/cloud_03_pc.svg" alt=""></div>
    <div class="island-hero-copy"><h1 id="island-title">慢慢生活，<br><em>好好记录。</em></h1><p>和布拉吉奥一起，收集日常的小事。<br>也给小黑猫金子，留一片晒太阳的地方。</p><button class="island-primary" data-scroll-journal>去小岛上逛逛 ${arrow}</button></div>
    <div class="joguman-landscape"><div class="meadow"></div><div class="bushes" aria-hidden="true"></div><div class="brick-wall" aria-hidden="true"></div><div class="character-party"><img class="party-diplo" src="./assets/diplo.png" alt="迪波罗"><img class="party-ankylo" src="./assets/ankylo.png" alt="安基罗"><button class="party-brachio" data-greet aria-label="和布拉吉奥打个招呼"><img src="./assets/brachio.png" alt="布拉吉奥"></button><img class="party-stego" src="./assets/stego.png" alt="史铁哥"><img class="party-tricera" src="./assets/tricera.png" alt="崔卡拉"><img class="party-woody" src="./assets/woody.png" alt="伍迪"></div><span class="party-note" id="greeting" aria-live="polite">小小的我们，也很重要。</span></div>
    <button class="island-weather" data-open-calendar aria-label="打开日历与天气预报" aria-haspopup="dialog"><span class="weather-mini-icon" data-weather-icon>${weatherIcon()}</span><span class="weather-mini-copy"><strong data-weather-city>杭州</strong><small><span data-weather-temp>--</span>C · <span data-weather-label>正在获取天气</span></small></span><span class="weather-mini-clock"><strong data-clock-time>--:--</strong><small data-clock-date>日历与天气预报</small></span></button>
  </section>
  <section class="island-section recent-section" id="journal"><div class="island-inner"><div class="section-bar"><div><p class="island-kicker">RECENT STORIES</p><h2>最近的手记</h2></div><a class="island-link" href="#/journal">查看全部 ${arrow}</a></div><div class="story-grid">${posts.slice(0,3).map(storyCard).join('')}</div></div></section>
  <section class="island-section collection-section" id="collection"><div class="island-inner collection-layout"><div>${sectionHeading('收藏','LITTLE COLLECTION','布拉吉奥的小小收藏馆','书、票根、喜欢的小物。看到它们时，心里会亮起一盏小灯。')}<div class="island-counts">${site.categories.map(c=>`<a href="${route(c.name)}"><strong>${String(posts.filter(p=>p.category===c.name).length).padStart(2,'0')}</strong><span>${esc(c.name)}</span></a>`).join('')}</div>${more('收藏','逛逛收藏馆')}</div><div><div class="polaroid-pair" data-section-items="收藏">${collection.map(polaroid).join('')}</div>${refresh('收藏','换一组收藏')}</div></div></section>
  <section class="island-section dining-section" id="dining"><div class="island-inner dining-layout"><div class="dining-copy">${sectionHeading('出去吃饭','LET’S EAT OUT','跟迪波罗，出去吃饭','街角的小店，一碗热腾腾的面。把喜欢的味道记下来。')}${refresh('出去吃饭','换一家看看')}${more('出去吃饭','看看外食手记')}</div><div class="dining-board" data-section-items="出去吃饭">${diningItems()}<div class="dining-sticker">${character('出去吃饭')}<span>今天也要<br>好好吃饭！</span></div></div></div></section>
  <section class="island-section kitchen-section" id="kitchen"><div class="island-inner"><div class="section-bar">${sectionHeading('在家做饭','TODAY’S MENU','安基罗的家常厨房','不赶时间，给自己做一顿热乎乎的饭。')}${refresh('在家做饭','换一道菜')}</div><div data-section-items="在家做饭">${recipeItems()}</div>${more('在家做饭','翻翻家里的菜谱')}</div></section>
  <section class="island-section outdoor-section" id="outdoor"><div class="island-inner"><div class="postcard" data-section-items="户外">${outdoorItem()}</div><div class="postcard-footer"><span>跟着史铁哥，去外面透透气。</span>${refresh('户外','换个目的地')}${more('户外','全部户外手记')}</div></div></section>
  <section class="island-section scraps-section" id="scraps"><div class="island-inner"><div class="section-bar">${sectionHeading('其他','BITS & PIECES','崔卡拉的生活杂记','想法、日常，和暂时不知道放在哪里的小事。')}${more('其他','所有生活碎片')}</div><div class="scrap-grid" data-section-items="其他">${otherItems()}</div></div></section>
  <section class="island-section jinzi-section" id="jinzi"><div class="island-inner"><div class="section-bar">${sectionHeading('金子','WOODY & JINZI','伍迪看护的金子小窝','给小黑猫金子，一片自己的小天地。')}</div><div class="jinzi-feature">${jinziItem()}</div></div></section>
  <section class="island-section passport-section" id="passport"><div class="island-inner passport-layout"><a class="passport-cover" href="#/about"><img src="./assets/ubhc-logo.jpg" alt="UBHC"><span>慢慢生活俱乐部</span><strong>生活护照</strong><small>MY LITTLE PASSPORT</small></a><div><p class="island-kicker">NICE TO MEET YOU</p><h2>你好，我是${esc(site.author)}。</h2><p>${esc(site.bio)}<br>把自己和世界的相遇，慢慢收进这里。</p><a class="island-link" href="#/about">翻开我的生活护照 ${arrow}</a></div></div></section>
  <section class="letter-section"><img src="./assets/brachio.png" alt="" loading="lazy"><p>布拉吉奥捎来一句话</p><h2>愿你今天也遇见一件小小的好事。</h2><button class="island-link" data-random>随便翻一篇手记 ${arrow}</button></section>`;
}

export function weatherIcon(){return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 19a6 6 0 1 1 11-6M16 3v2M5 8l2 2M27 8l-2 2"/><path d="M9 27h14a5 5 0 0 0 0-10 7 7 0 0 0-13-1 5.5 5.5 0 0 0-1 11Z"/></svg>';}
export function syncIsland() {
  document.querySelectorAll('[data-refresh-section]').forEach(button => button.addEventListener('click',()=>{
    const name=button.dataset.refreshSection;
    const length=model.posts.filter(p=>p.category===name).length;
    rotations.set(name,((rotations.get(name)||0)+1)%Math.max(1,length));
    const target=document.querySelector(`[data-section-items="${name}"]`);
    if(name==='收藏')target.innerHTML=selected(name,2).map(polaroid).join('');
    if(name==='出去吃饭')target.innerHTML=diningItems();
    if(name==='在家做饭')target.innerHTML=recipeItems();
    if(name==='户外')target.innerHTML=outdoorItem();
  }));
  document.querySelector('[data-scroll-journal]')?.addEventListener('click',()=>document.querySelector('#journal')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));
}

let passportPage=0;
export function renderPassport(site,posts){
  model={site,posts};
  const right=[
    `<p class="island-kicker">ABOUT ME</p><h2>你好，我是${esc(site.author)}。</h2><p>${esc(site.bio)}</p><p>这里放着平凡日子里的小发现：喜欢的东西、一顿好吃的饭、一次没有计划的散步，还有小黑猫金子的日常。</p><blockquote>不用每一天都很特别。<br>有在好好生活，就已经很好。</blockquote><p>此刻：${esc(site.currentNote)}</p>`,
    `<p class="island-kicker">MY LITTLE ARCHIVE</p><h2>把日子慢慢收好。</h2><div class="passport-stats">${site.categories.map(c=>`<a href="${route(c.name)}"><img src="./${esc(c.asset)}" alt=""><span>${esc(c.name)}</span><b>${posts.filter(p=>p.category===c.name).length} 篇</b></a>`).join('')}</div><p>每一个栏目，都有一位小伙伴照看。</p>`,
    `<p class="island-kicker">LITTLE MOMENTS</p><h2>留在口袋里的小事。</h2>${(site.notes||[]).slice(0,3).map(n=>`<div class="passport-note"><time>${esc(n.date.replaceAll('-','.'))}</time><p>${esc(n.text)}</p></div>`).join('')}`
  ];
  return `<section class="passport-page"><div class="passport-page-title"><p class="island-kicker">MY LITTLE PASSPORT</p><h1>生活护照</h1><p>把自己与世界的相遇，收进一本护照。</p></div><div class="passport-book"><div class="passport-left"><div class="passport-brand"><img src="./assets/ubhc-logo.jpg" alt="UBHC"><span>慢慢生活俱乐部</span></div><div class="passport-id-photo"><img src="./assets/brachio.png" alt="布拉吉奥"></div><small>NAME / 姓名</small><h2>${esc(site.author)}</h2><small>MY LITTLE WORLD / 所在地</small><p>${esc(site.location)}</p><div class="passport-seal">UBHC<br><span>TAKE IT SLOW</span></div></div><div class="passport-right">${right[passportPage]}<span class="passport-page-number">${String(passportPage+1).padStart(2,'0')} / 03</span></div></div><div class="passport-controls"><button class="button" data-passport-turn="-1" ${passportPage===0?'disabled':''}>上一页</button><span>${passportPage+1} / 3</span><button class="button" data-passport-turn="1" ${passportPage===2?'disabled':''}>下一页</button></div><p class="passport-disclosure">${esc(site.sampleNotice)}<br>个人非官方主题 · 角色 © JOGUMAN</p></section>`;
}
export function syncPassport(){document.querySelectorAll('[data-passport-turn]').forEach(button=>button.addEventListener('click',()=>{passportPage=Math.min(2,Math.max(0,passportPage+Number(button.dataset.passportTurn)));const top=document.querySelector('.passport-page').getBoundingClientRect().top+scrollY;document.querySelector('.passport-page').outerHTML=renderPassport(model.site,model.posts);syncPassport();window.scrollTo({top:Math.max(0,top-100),behavior:'instant'});}));}
