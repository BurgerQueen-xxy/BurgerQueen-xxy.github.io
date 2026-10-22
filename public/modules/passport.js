import { renderAtlas, mountAtlas } from './atlas.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const route = name => `#/category/${encodeURIComponent(name)}`;
const compactQuery = '(max-width: 700px)';
let model, currentId = 'cover', disposeReader, markId = 0;

// Two masks retain both the original coloured shapes and the original ink details.
// Nothing in the UBHC artwork is traced, regenerated, or replaced.
function foilMark() {
  const id = `ubhc-foil-${++markId}`;
  return `<svg class="jp-foil-mark" viewBox="0 0 660 469" role="img" aria-label="UBHC 原版徽章，金箔压印"><defs><filter id="${id}-shape" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -2.6 -2.6 -2.6 0 7.2"/></filter><filter id="${id}-ink" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1.2 -1.6 -.5 1.5 0"/></filter><mask id="${id}-shape-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="660" height="469" style="mask-type:alpha"><image href="./assets/ubhc-logo.jpg" width="660" height="469" filter="url(#${id}-shape)"/></mask><mask id="${id}-ink-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="660" height="469" style="mask-type:alpha"><image href="./assets/ubhc-logo.jpg" width="660" height="469" filter="url(#${id}-ink)"/></mask><linearGradient id="${id}-gold" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#b68a39"/><stop offset=".28" stop-color="#e3be69"/><stop offset=".5" stop-color="#c39a45"/><stop offset=".68" stop-color="#eacf88"/><stop offset="1" stop-color="#ad7d2d"/></linearGradient><linearGradient id="${id}-edge" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#fff0ba"/><stop offset=".37" stop-color="#f4d58b"/><stop offset=".54" stop-color="#dcb96b"/><stop offset=".72" stop-color="#fff1bf"/><stop offset="1" stop-color="#e9c573"/></linearGradient><filter id="${id}-emboss" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2.4" stdDeviation=".65" flood-color="#0c251b" flood-opacity=".95"/><feDropShadow dx="0" dy="-.9" stdDeviation=".25" flood-color="#fff0b9" flood-opacity=".45"/></filter></defs><g filter="url(#${id}-emboss)"><rect width="660" height="469" fill="url(#${id}-gold)" mask="url(#${id}-shape-mask)"/><rect width="660" height="469" fill="url(#${id}-edge)" mask="url(#${id}-ink-mask)"/></g></svg>`;
}

function cover(site, back = false, preview = false) {
  return `<div class="jp-cover ${back ? 'jp-back' : ''}"><span class="jp-cover-border" aria-hidden="true"></span><div class="jp-cover-inner"><div class="jp-cover-club jp-gold">慢慢生活俱乐部<small>SLOW NOTES · UBHC</small></div>${foilMark()}<div class="jp-cover-title jp-gold"><h2>${back?'小小的我们，也很重要。':'生活护照'}</h2><p>${back?'WE ARE SMALL, BUT NOT UNIMPORTANT.':'PERSONAL PASSPORT'}</p></div><span class="jp-cover-owner jp-gold">${esc(site.author)}<small>TAKE IT SLOW</small></span>${preview?'<span class="jp-open">翻开生活护照 <b aria-hidden="true">↗</b></span>':`<button class="jp-open" data-jp-action="${back?'reopen':'open'}">${back?'翻回内页':'打开护照'} <b aria-hidden="true">↗</b></button>`}<small class="jp-cover-code">UBHC · GOOD LITTLE DAYS</small></div></div>`;
}
export function disposePassport() { disposeReader?.(); disposeReader=null; }

export function renderPassportPreview(site) { return `<a class="jp-home-cover" href="#/about" aria-label="打开生活护照">${cover(site,false,true)}</a>`; }

const pageInfo = {
  inside:['扉页',1], identity:['资料页',2], stampsA:['生活印章',3], stampsB:['生活印章',4], notes:['口袋里的日子',7], outside:['出去走走',8],
};
function topline(chinese, english) { return `<div class="jp-topline"><b>${chinese}</b><small>${english}</small></div>`; }
function validPostDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';
}
export function recentPassportPosts(posts,limit=4) {
  return (Array.isArray(posts)?posts:[]).filter(p=>p&&typeof p.slug==='string'&&p.slug&&typeof p.title==='string').slice().sort((a,b)=>(validPostDate(b.date)||'').localeCompare(validPostDate(a.date)||'')).slice(0,limit);
}
export function passportStampRecords(site,posts) {
  const ordered=recentPassportPosts(posts,Infinity);
  return (site.categories||[]).map(category=>{const post=ordered.find(p=>p.category===category.name);return {category,post,date:validPostDate(post?.date)};});
}
function stamp({category:c,post,date},index) {
  return `<a class="jp-stamp-entry jp-stamp-${esc(c.englishName.toLowerCase())} ${post?'':'is-pending'}" href="${post?`#/post/${encodeURIComponent(post.slug)}`:route(c.name)}" aria-label="${esc(c.name)}：${post?`阅读《${esc(post.title)}》`:'待记录'}"><div class="jp-date-stamp stamp-shape-${index%3}"><span class="jp-entry-label">生活入境 · ENTRY</span><strong>${esc(c.character)}</strong>${date?`<time datetime="${date}">${date.replaceAll('-','.')}</time>`:`<span class="jp-pending-date">${post?'日期待补充':'待记录'}</span>`}<span class="jp-stamp-place">${esc(c.name)} <i aria-hidden="true">✦</i> ${esc(c.englishName)}</span></div><div class="jp-visa-sticker"><img src="./${esc(c.asset)}" alt="${esc(c.character)}"><small>${esc(c.englishName)}</small></div><span class="jp-stamp-caption">${post?`${esc(post.title)} <b aria-hidden="true">↗</b>`:c.name==='金子'?'金子的小日子，待记录':'这一栏的故事，待记录'}</span></a>`;
}
function visaPage(second=false) {
  const records=passportStampRecords(model.site,model.posts).slice(second?3:0,second?6:3);
  return `${topline('生活签证','EVERYDAY VISAS')}<div class="jp-visa-intro"><span>VISA</span><p>以文章的发布日期，<br>记下每一次生活入境。</p></div><div class="jp-visa-grid">${records.map(stamp).join('')}</div><small class="jp-visa-code">UBHC · ${second?'COLLECT THE ORDINARY':'GOOD LITTLE DAYS'}</small>`;
}
function profileField(label,value,className='') {return `<div class="jp-profile-field ${className}"><dt>${label}</dt><dd>${esc(value||'—')}</dd></div>`;}
function identityPage(site) {
  const lines=['P<UBHC<LIFE<PASSPORT','SLOW<NOTES<PERSONAL<JOURNAL'].map(line=>line.padEnd(38,'<'));
  return `${topline('生活护照','PERSONAL PASSPORT')}<dl class="jp-document-fields">${profileField('类型 / TYPE','P')}${profileField('签发机构 / AUTHORITY','UBHC')}${profileField('证件用途 / PURPOSE','生活记录')}</dl><div class="jp-id-layout"><figure class="jp-id-photo"><img src="./assets/brachio.png" alt="布拉吉奥，生活护照头像"><figcaption>PERSONAL PORTRAIT</figcaption></figure><dl class="jp-person-fields">${profileField('姓名 / NAME',site.author,'jp-holder-name')}${profileField('所在地 / LOCATION',site.location)}${profileField('生活状态 / STATUS',site.currentNote)}</dl></div><dl class="jp-profile-about">${profileField('关于持有人 / ABOUT THE HOLDER',site.bio)}</dl><div class="jp-signature"><span>持有人签名 / HOLDER’S SIGNATURE</span><strong>${esc(site.author||'—')}</strong><span class="jp-issue-mark">UBHC<small>生活记录专用</small></span></div><div class="jp-mrz-block"><small>装饰性 MRZ · 非旅行证件</small><div class="jp-code" aria-label="生活护照装饰编码，不用于身份识别">${lines.map(line=>`<span>${esc(line)}</span>`).join('')}</div></div>`;
}
function pageContent(id) {
  const {site,posts}=model;
  if(id==='inside') return `<div class="jp-inside-content"><p>THIS LITTLE BOOK BELONGS TO</p><img src="./assets/brachio.png" alt="布拉吉奥"><h2>小小的我们，<br>也很重要。</h2><span>收集日常，认真生活。<br>下一页，会有新的好事发生。</span><small>JOGUMAN FRIENDS · SLOW NOTES</small></div>`;
  if(id==='identity') return identityPage(site);
  if(id==='stampsA'||id==='stampsB') return visaPage(id==='stampsB');
  if(id==='notes') return `${topline('口袋里的日子','RECENT STORIES')}<p class="jp-notes-intro">最近写下的，值得慢慢回看。</p><div class="jp-pocket-posts">${recentPassportPosts(posts).map(p=>`<a class="jp-pocket-post" href="#/post/${encodeURIComponent(p.slug)}"><span class="jp-pocket-meta"><time${validPostDate(p.date)?` datetime="${p.date}"`:''}>${validPostDate(p.date)?p.date.replaceAll('-','.'):'日期待补充'}</time><small>${esc(p.category)}</small></span><h2>${esc(p.title)} <span aria-hidden="true">↗</span></h2><p>${esc(p.excerpt||'打开这篇手记，慢慢读。')}</p></a>`).join('')||'<p class="jp-empty-note">第一篇手记，留给一个想记住的日子。</p>'}</div>`;
  const outdoors=recentPassportPosts(posts.filter(p=>p.category==='户外'),3);
  return `${topline('出去走走','OUTSIDE WITH STEGO')}<img class="jp-stego" src="./assets/stego.png" alt="史铁哥"><h2 class="jp-page-title">下一站，等一阵风。</h2><p class="jp-hand">走过的路，慢慢记在这里。</p><div class="jp-journeys">${outdoors.length?outdoors.map(p=>`<a href="#/post/${encodeURIComponent(p.slug)}"><time>${esc(p.date)}</time><strong>${esc(p.title)}</strong><span aria-hidden="true">↗</span></a>`).join(''):'<p>还没有户外手记，留给下一次出发。</p>'}</div>`;
}
export function passportViews(compact) {
  const groups=[{id:'identity',label:'资料页',leaves:['inside','identity']},{id:'stamps',label:'生活印章',leaves:['stampsA','stampsB']},{id:'world',label:'世界地图',kind:'map'},{id:'moments',label:'口袋里的日子',leaves:['notes','outside']}];
  return [{id:'cover',label:'封面',kind:'cover'},...groups.flatMap(g=>compact&&g.leaves?g.leaves.map(id=>({id,label:pageInfo[id][0],leaves:[id],kind:'pages'})):[{...g,kind:g.kind||'pages'}]),{id:'back',label:'封底',kind:'back'}];
}
function resolveView(views,id) { return views.find(v=>v.id===id||v.leaves?.includes(id))||views[0]; }
function paperShapes() {
  return `<svg class="jp-shape-definitions" width="0" height="0" aria-hidden="true"><defs><clipPath id="jp-leaf-left" clipPathUnits="objectBoundingBox"><path d="M.038 0 Q0 0 0 .03 L0 .97 Q0 1 .038 1 L.88 .993 Q.96 .991 1 .975 L1 .025 Q.96 .009 .88 .007 Z"/></clipPath><clipPath id="jp-leaf-right" clipPathUnits="objectBoundingBox"><path d="M0 .025 Q.04 .009 .12 .007 L.962 0 Q1 0 1 .03 L1 .97 Q1 1 .962 1 L.12 .993 Q.04 .991 0 .975 Z"/></clipPath><clipPath id="jp-turn-left" clipPathUnits="objectBoundingBox"><path class="jp-curve-left" d="M.038 0 Q0 0 0 .03 C0 .32 0 .68 0 .97 Q0 1 .038 1 L.88 .993 Q.96 .991 1 .975 L1 .025 Q.96 .009 .88 .007 Z"/></clipPath><clipPath id="jp-turn-right" clipPathUnits="objectBoundingBox"><path class="jp-curve-right" d="M0 .025 Q.04 .009 .12 .007 L.962 0 Q1 0 1 .03 C1 .32 1 .68 1 .97 Q1 1 .962 1 L.12 .993 Q.04 .991 0 .975 Z"/></clipPath><clipPath id="jp-paper-spread" clipPathUnits="objectBoundingBox"><path d="M.019 0 Q0 0 0 .03 L0 .97 Q0 1 .019 1 L.44 .993 Q.48 .991 .5 .975 Q.52 .991 .56 .993 L.981 1 Q1 1 1 .97 L1 .03 Q1 0 .981 0 L.56 .007 Q.52 .009 .5 .025 Q.48 .009 .44 .007 Z"/></clipPath></defs></svg>`;
}
function renderView(view) {
  if(view.kind==='cover'||view.kind==='back') return cover(model.site,view.kind==='back');
  if(view.kind==='map') return `<div class="jp-paper jp-map-paper">${renderAtlas(model.site,model.posts)}<span class="jp-map-folio">05 — 06 / WORLD ATLAS</span></div>`;
  return `<div class="jp-paper">${view.leaves.map(id=>`<article class="jp-leaf ${id==='inside'?'jp-inside':''} jp-page-${id}" aria-label="${pageInfo[id][0]}，第${pageInfo[id][1]}页"><div class="jp-leaf-content">${pageContent(id)}<span class="jp-folio">${String(pageInfo[id][1]).padStart(2,'0')} / SLOW NOTES</span></div></article>`).join('')}</div>`;
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
  return `<section class="jog-passport"><header class="jp-heading"><h1>生活护照</h1><p>把自己与世界的相遇，收进一本护照。</p></header><div class="jp-reader ${compact?'is-compact':''}" style="--jp-left-clip:url(#jp-leaf-left);--jp-right-clip:url(#jp-leaf-right);--jp-turn-left-clip:url(#jp-turn-left);--jp-turn-right-clip:url(#jp-turn-right);--jp-spread-clip:url(#jp-paper-spread)">${paperShapes()}${controls(views,current)}<div class="jp-viewport"><div class="jp-stage ${current.kind==='cover'?'is-front-closed':current.kind==='back'?'is-back-closed':''}" tabindex="0" role="region" aria-label="可翻阅的生活护照" aria-busy="false"><div class="jp-view is-active view-${current.kind}">${renderView(current)}</div></div></div><div class="jp-pagination">${pagination(views,current)}</div><p class="jp-hint">${compact?'左右轻扫翻页 · 地图可单独拖动浏览':'左右箭头翻阅 · 在地图上慢慢探索世界'}</p></div><p class="jp-disclosure">${esc(site.sampleNotice||'')}</p></section>`;
}

export function syncPassport() {
  const reader=document.querySelector('.jp-reader'); if(!reader)return;
  const media=matchMedia(compactQuery),motion=matchMedia('(prefers-reduced-motion: reduce)');
  let views=passportViews(media.matches),current=resolveView(views,currentId),turn=null,timer,start,disposed=false;
  const stage=reader.querySelector('.jp-stage'),viewport=reader.querySelector('.jp-viewport');
  // Lay out each physical page at 460 × 650, then scale the complete content.
  // Resizing therefore preserves both the real passport proportion and its typography.
  function sizeBook() {
    const width=viewport.clientWidth;
    if(!width)return;
    const scale=width/(media.matches?460:920);
    reader.style.setProperty('--leaf-scale',String(scale));
    reader.style.setProperty('--book-height',`${650*scale}px`);
  }
  const sizeObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(sizeBook);
  sizeObserver?.observe(viewport);sizeBook();
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
    const paperTurn=![current.kind,target.kind].some(kind=>kind==='cover'||kind==='back');
    stage.innerHTML=`<div class="jp-view is-outgoing outgoing-${direction} view-${current.kind}" inert aria-hidden="true">${old}</div><div class="jp-view is-incoming incoming-${direction} view-${target.kind}" inert aria-hidden="true">${next}</div>${media.matches?'':`<div class="jp-turning-leaf turn-${direction} ${paperTurn?'is-paper-turn':''}" aria-hidden="true" inert><div class="jp-turn-face jp-turn-front face-${direction==='next'?'right':'left'} face-${current.kind==='cover'||current.kind==='back'?'cover':'paper'}"><div class="jp-turn-content">${old}</div></div><div class="jp-turn-face jp-turn-back face-${direction==='next'?'left':'right'} face-${target.kind==='cover'||target.kind==='back'?'cover':'paper'}"><div class="jp-turn-content">${next}</div></div></div>`}`;
    mountMaps(stage.querySelector('.is-incoming'));
    const animated=stage.querySelector(media.matches?'.is-outgoing':'.jp-turning-leaf');
    const animationEnd=e=>{if(e.target!==animated||e.pseudoElement)return;animated.removeEventListener('animationend',animationEnd);finish();};
    animated.addEventListener('animationend',animationEnd);
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
    reader.classList.toggle('is-compact',media.matches);reader.querySelector('.jp-hint').textContent=media.matches?'左右轻扫翻页 · 地图可单独拖动浏览':'左右箭头翻阅 · 在地图上慢慢探索世界';sizeBook();resting();
  }
  reader.addEventListener('click',click);reader.addEventListener('keydown',key);
  viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',cancel);viewport.addEventListener('lostpointercapture',cancel);
  media.addEventListener('change',resize);mountMaps(stage);
  disposeReader=()=>{disposed=true;clearTimeout(timer);clearMaps();sizeObserver?.disconnect();if(start){const pointer=start.pointer;start=null;releaseSwipe(pointer);}reader.removeEventListener('click',click);reader.removeEventListener('keydown',key);viewport.removeEventListener('pointerdown',down);viewport.removeEventListener('pointerup',up);viewport.removeEventListener('pointercancel',cancel);viewport.removeEventListener('lostpointercapture',cancel);media.removeEventListener('change',resize);};
}
