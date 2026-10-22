import { renderAtlas, mountAtlas } from './atlas.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const route = name => `#/category/${encodeURIComponent(name)}`;
const compactQuery = '(max-width: 700px)';
let model, currentId = 'cover', disposeReader, markId = 0;

// A live SVG ink mask preserves the original UBHC linework; the foil is a UI material.
function foilMark() {
  const id = `ubhc-foil-${++markId}`;
  return `<svg class="jp-foil-mark" viewBox="0 0 660 469" role="img" aria-label="UBHC 烫金徽章"><defs><filter id="${id}-ink" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1.2 -1.6 -.5 1.5 0"/></filter><mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="660" height="469" style="mask-type:alpha"><image href="./assets/ubhc-logo.jpg" width="660" height="469" filter="url(#${id}-ink)"/></mask><linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#bd9456"/><stop offset=".28" stop-color="#e8d69d"/><stop offset=".48" stop-color="#b9914e"/><stop offset=".57" stop-color="#f4e5b2"/><stop offset=".76" stop-color="#d4b879"/><stop offset="1" stop-color="#a67b3d"/></linearGradient></defs><rect width="660" height="469" fill="url(#${id}-gold)" mask="url(#${id}-mask)"/></svg>`;
}

function cover(site, back = false, preview = false) {
  return `<div class="jp-cover ${back ? 'jp-back' : ''}"><span class="jp-cover-border" aria-hidden="true"></span><div class="jp-cover-club jp-gold">慢慢生活俱乐部<small>SLOW NOTES · UBHC</small></div>${foilMark()}<div class="jp-cover-title jp-gold"><h2>${back?'小小的我们，也很重要。':'生活护照'}</h2><p>${back?'WE ARE SMALL, BUT NOT UNIMPORTANT.':'PERSONAL PASSPORT'}</p></div><span class="jp-cover-owner jp-gold">${esc(site.author)}<small>TAKE IT SLOW</small></span>${preview?'<span class="jp-open">翻开生活护照 <b aria-hidden="true">↗</b></span>':`<button class="jp-open" data-jp-action="${back?'reopen':'open'}">${back?'翻回内页':'打开护照'} <b aria-hidden="true">↗</b></button>`}<small class="jp-cover-code">UBHC · GOOD LITTLE DAYS</small></div>`;
}
export function disposePassport() { disposeReader?.(); disposeReader=null; }

export function renderPassportPreview(site) { return `<a class="jp-home-cover" href="#/about" aria-label="打开生活护照">${cover(site,false,true)}</a>`; }

const pageInfo = {
  inside:['扉页',1], identity:['资料页',2], stampsA:['生活印章',3], stampsB:['生活印章',4], notes:['口袋里的日子',7], outside:['出去走走',8],
};
function topline(chinese, english) { return `<div class="jp-topline"><b>${chinese}</b><small>${english}</small></div>`; }
function stamp(c) {
  return `<a class="jp-stamp jp-stamp-${esc(c.englishName.toLowerCase())}" href="${route(c.name)}"><img src="./${esc(c.asset)}" alt="${esc(c.character)}"><strong>${esc(c.name)}</strong><small>${esc(c.englishName)} · ${model.posts.filter(p=>p.category===c.name).length} 篇</small></a>`;
}
function pageContent(id) {
  const {site,posts}=model;
  if(id==='inside') return `<div class="jp-inside-content"><p>THIS LITTLE BOOK BELONGS TO</p><img src="./assets/brachio.png" alt="布拉吉奥"><h2>小小的我们，<br>也很重要。</h2><span>收集日常，认真生活。<br>下一页，会有新的好事发生。</span><small>JOGUMAN FRIENDS · SLOW NOTES</small></div>`;
  if(id==='identity') return `${topline('个人资料','PERSONAL DETAILS')}<div class="jp-id-layout"><div class="jp-id-photo"><img src="./assets/brachio.png" alt="护照上的布拉吉奥"></div><div><small>姓名 / NAME</small><h2>${esc(site.author)}</h2><small>我的小世界 / LOCATION</small><p>${esc(site.location)}</p><small>生活状态 / STATUS</small><p>${esc(site.currentNote)}</p></div></div><div class="jp-profile-text"><small>ABOUT ME</small><p>${esc(site.bio)}</p><p>收藏喜欢的东西，认真吃饭，去外面走走。<br>也给小黑猫金子留一片晒太阳的地方。</p></div><div class="jp-signature"><span>持有人签名 / SIGNATURE</span><strong>${esc(site.author)}</strong><span class="jp-round-stamp">UBHC<small>GOOD LITTLE DAYS</small></span></div><div class="jp-code" aria-hidden="true">P&lt;UBHC&lt;SLOW&lt;&lt;NOTES&lt;&lt;&lt;&lt;&lt;&lt;<br>TAKE&lt;IT&lt;SLOW&lt;EVERY&lt;DAY&lt;&lt;&lt;&lt;</div>`;
  if(id==='stampsA') return `${topline('生活印章','LITTLE MOMENTS')}<h2 class="jp-page-title">给喜欢的日子，<br>盖一个小小的章。</h2><p class="jp-hand">每个栏目，都有一位小伙伴照看。</p><div class="jp-stamp-grid">${site.categories.slice(0,3).map(stamp).join('')}</div>`;
  if(id==='stampsB') return `${topline('生活印章','COLLECT THE ORDINARY')}<div class="jp-stamp-grid jp-stamp-grid-high">${site.categories.slice(3).map(stamp).join('')}</div><div class="jp-jinzi-note"><img src="./assets/woody.png" alt="伍迪"><p>这一角，专门留给金子。<br>小黑猫的照片和故事，慢慢攒。</p></div>`;
  if(id==='notes') return `${topline('口袋里的日子','POCKET NOTES')}<h2 class="jp-page-title">一些不想忘的小事。</h2>${(site.notes||[]).slice(0,3).map(n=>`<div class="jp-note"><time>${esc(n.date.replaceAll('-','.'))}</time><p>${esc(n.text)}</p></div>`).join('')}`;
  const outdoors=posts.filter(p=>p.category==='户外').slice(0,3);
  return `${topline('出去走走','OUTSIDE WITH STEGO')}<img class="jp-stego" src="./assets/stego.png" alt="史铁哥"><h2 class="jp-page-title">下一站，等一阵风。</h2><p class="jp-hand">走过的路，慢慢记在这里。</p><div class="jp-journeys">${outdoors.length?outdoors.map(p=>`<a href="#/post/${encodeURIComponent(p.slug)}"><time>${esc(p.date)}</time><strong>${esc(p.title)}</strong><span aria-hidden="true">↗</span></a>`).join(''):'<p>还没有户外手记，留给下一次出发。</p>'}</div>`;
}
export function passportViews(compact) {
  const groups=[{id:'identity',label:'资料页',leaves:['inside','identity']},{id:'stamps',label:'生活印章',leaves:['stampsA','stampsB']},{id:'world',label:'世界地图',kind:'map'},{id:'moments',label:'口袋里的日子',leaves:['notes','outside']}];
  return [{id:'cover',label:'封面',kind:'cover'},...groups.flatMap(g=>compact&&g.leaves?g.leaves.map(id=>({id,label:pageInfo[id][0],leaves:[id],kind:'pages'})):[{...g,kind:g.kind||'pages'}]),{id:'back',label:'封底',kind:'back'}];
}
function resolveView(views,id) { return views.find(v=>v.id===id||v.leaves?.includes(id))||views[0]; }
function renderView(view) {
  if(view.kind==='cover'||view.kind==='back') return cover(model.site,view.kind==='back');
  if(view.kind==='map') return `<div class="jp-paper jp-map-paper">${renderAtlas(model.site,model.posts)}<span class="jp-map-folio">05 — 06 / WORLD ATLAS</span></div>`;
  return `<div class="jp-paper">${view.leaves.map(id=>`<article class="jp-leaf ${id==='inside'?'jp-inside':''}" aria-label="${pageInfo[id][0]}，第${pageInfo[id][1]}页">${pageContent(id)}<span class="jp-folio">${String(pageInfo[id][1]).padStart(2,'0')} / SLOW NOTES</span></article>`).join('')}</div>`;
}
function controls(views,current) {
  const chapters=[['cover','封面'],['identity','资料页'],['stampsA','生活印章'],['world','世界地图'],['notes','随记'],['back','封底']];
  return `<nav class="jp-chapters" aria-label="护照章节">${chapters.map(([id,label])=>`<button data-jp-target="${id}" aria-current="${resolveView(views,id)===current?'page':'false'}">${label}</button>`).join('')}</nav>`;
}
function pagination(views,current) {
  const index=views.indexOf(current);
  const pages=current.leaves?.map(id=>String(pageInfo[id][1]).padStart(2,'0')).join(' — ');
  return `<button data-jp-action="prev" aria-label="上一页" ${!index?'disabled':''}>←</button><span aria-live="polite"><b>${esc(current.label)}</b><small>${current.kind==='map'?'05 — 06 / 08':pages?`${pages} / 08`:'SLOW NOTES · UBHC'}</small></span><button data-jp-action="next" aria-label="下一页" ${index===views.length-1?'disabled':''}>→</button>`;
}
export function renderPassport(site,posts) {
  disposeReader?.(); model={site,posts};
  const compact=matchMedia(compactQuery).matches,views=passportViews(compact),current=resolveView(views,currentId);
  return `<section class="jog-passport"><header class="jp-heading"><h1>生活护照</h1><p>把自己与世界的相遇，收进一本护照。</p></header><div class="jp-reader ${compact?'is-compact':''}">${controls(views,current)}<div class="jp-viewport"><div class="jp-stage ${current.kind==='cover'?'is-front-closed':current.kind==='back'?'is-back-closed':''}" tabindex="0" role="region" aria-label="可翻阅的生活护照" aria-busy="false"><div class="jp-view is-active view-${current.kind}">${renderView(current)}</div></div></div><div class="jp-pagination">${pagination(views,current)}</div><p class="jp-hint">${compact?'左右轻扫翻页 · 地图可单独拖动浏览':'左右箭头翻阅 · 在地图上慢慢探索世界'}</p></div><p class="jp-disclosure">${esc(site.sampleNotice||'')}</p></section>`;
}

export function syncPassport() {
  const reader=document.querySelector('.jp-reader'); if(!reader)return;
  const media=matchMedia(compactQuery),motion=matchMedia('(prefers-reduced-motion: reduce)');
  let views=passportViews(media.matches),current=resolveView(views,currentId),turn=null,timer,start,disposed=false;
  const stage=reader.querySelector('.jp-stage'),viewport=reader.querySelector('.jp-viewport');
  const maps=new Map();
  function mountMaps(root) { root.querySelectorAll('.jp-atlas').forEach(el=>{if(!maps.has(el))maps.set(el,mountAtlas(el,model.site,model.posts));}); }
  function clearMaps() { for(const cleanup of maps.values())if(typeof cleanup==='function')cleanup();maps.clear(); }
  function updateChrome() {
    reader.querySelector('.jp-chapters').outerHTML=controls(views,current);
    reader.querySelector('.jp-pagination').innerHTML=pagination(views,current);
    if(turn)reader.querySelectorAll('.jp-chapters button,.jp-pagination button').forEach(b=>b.disabled=true);
  }
  function resting() {
    clearMaps();stage.innerHTML=`<div class="jp-view is-active view-${current.kind}">${renderView(current)}</div>`;
    stage.className=`jp-stage ${current.kind==='cover'?'is-front-closed':current.kind==='back'?'is-back-closed':''}`;
    stage.setAttribute('aria-busy','false'); mountMaps(stage);updateChrome();
  }
  function finish() { if(!turn||disposed)return;clearTimeout(timer);current=turn.to;currentId=current.leaves?.[0]||current.id;turn=null;resting(); }
  async function go(target) {
    if(!target||target===current||turn||disposed)return;
    const focused=reader.contains(document.activeElement);
    if(motion.matches){current=target;currentId=current.leaves?.[0]||current.id;resting();if(focused)stage.focus({preventScroll:true});return;}
    const direction=views.indexOf(target)>views.indexOf(current)?'next':'prev';
    const old=stage.querySelector('.jp-view').innerHTML;
    let next=renderView(target);
    const pending=turn={from:current,to:target,direction};clearMaps();updateChrome();
    stage.setAttribute('aria-busy','true');
    if(target.kind==='map') {
      // Prepare a real map before taking the two read-only turning-page snapshots.
      // Keeping it in layout also gives its labels the correct rendered scale.
      const prepared=document.createElement('div');
      prepared.className='jp-view view-map';prepared.style.visibility='hidden';prepared.inert=true;prepared.setAttribute('aria-hidden','true');prepared.innerHTML=next;
      stage.querySelector('.is-active')?.setAttribute('inert','');stage.append(prepared);mountMaps(prepared);
      await maps.get(prepared.querySelector('.jp-atlas'))?.ready;
      if(disposed||turn!==pending)return;
      next=prepared.innerHTML;clearMaps();
    }
    stage.className=`jp-stage is-turning ${target.kind==='cover'?'is-front-closed':target.kind==='back'?'is-back-closed':''}`;
    stage.setAttribute('aria-busy','true');
    stage.innerHTML=`<div class="jp-view is-outgoing outgoing-${direction} view-${current.kind}" inert aria-hidden="true">${old}</div><div class="jp-view is-incoming incoming-${direction} view-${target.kind}" inert aria-hidden="true">${next}</div>${media.matches?'':`<div class="jp-turning-leaf turn-${direction}" aria-hidden="true" inert><div class="jp-turn-face jp-turn-front"><div class="jp-turn-content">${old}</div></div><div class="jp-turn-face jp-turn-back"><div class="jp-turn-content">${next}</div></div></div>`}`;
    mountMaps(stage.querySelector('.is-incoming'));
    const animated=stage.querySelector(media.matches?'.is-outgoing':'.jp-turning-leaf');
    animated.addEventListener('animationend',e=>{if(e.target===animated)finish();},{once:true});
    timer=setTimeout(finish,850);
    if(focused)stage.focus({preventScroll:true});
  }
  function click(e) {
    const target=e.target.closest('[data-jp-target],[data-jp-action]');if(!target||target.disabled)return;
    if(target.dataset.jpTarget)return go(resolveView(views,target.dataset.jpTarget));
    const action=target.dataset.jpAction,index=views.indexOf(current);
    go(action==='open'?views[1]:action==='reopen'?views.at(-2):views[index+(action==='next'?1:-1)]);
  }
  function key(e) {
    if(e.target.closest('.jp-atlas,input,textarea,select')||e.altKey||e.ctrlKey||e.metaKey)return;
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();go(e.key==='Home'?views[0]:e.key==='End'?views.at(-1):views[views.indexOf(current)+(e.key==='ArrowRight'?1:-1)]);}
  }
  function down(e) {
    if(turn||start||!e.isPrimary||e.button!==0||e.target.closest('button,a,.jp-atlas,input,select')||(!media.matches&&e.pointerType!=='touch'))return;
    start={x:e.clientX,y:e.clientY,pointer:e.pointerId};viewport.setPointerCapture(e.pointerId);
  }
  function releaseSwipe(pointer) {if(viewport.hasPointerCapture(pointer))viewport.releasePointerCapture(pointer);}
  function up(e) {if(!start||e.pointerId!==start.pointer)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;releaseSwipe(e.pointerId);if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)go(views[views.indexOf(current)+(dx<0?1:-1)]);}
  function cancel(e) {if(!start||e.pointerId!==start.pointer)return;start=null;releaseSwipe(e.pointerId);}
  function resize() {
    if(turn)finish();views=passportViews(media.matches);current=resolveView(views,currentId);
    reader.classList.toggle('is-compact',media.matches);reader.querySelector('.jp-hint').textContent=media.matches?'左右轻扫翻页 · 地图可单独拖动浏览':'左右箭头翻阅 · 在地图上慢慢探索世界';resting();
  }
  reader.addEventListener('click',click);reader.addEventListener('keydown',key);
  viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',cancel);viewport.addEventListener('lostpointercapture',cancel);
  media.addEventListener('change',resize);mountMaps(stage);
  disposeReader=()=>{disposed=true;clearTimeout(timer);clearMaps();if(start){const pointer=start.pointer;start=null;releaseSwipe(pointer);}reader.removeEventListener('click',click);reader.removeEventListener('keydown',key);viewport.removeEventListener('pointerdown',down);viewport.removeEventListener('pointerup',up);viewport.removeEventListener('pointercancel',cancel);viewport.removeEventListener('lostpointercapture',cancel);media.removeEventListener('change',resize);};
}
