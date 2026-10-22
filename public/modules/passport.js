const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categoryLink = name => `#/category/${encodeURIComponent(name)}`;
const postLink = post => `#/post/${encodeURIComponent(post.slug)}`;
const labels = ['封面', '认识一下', '生活印章', '口袋里的日子', '封底'];
let current = 0;
let model;

function cover(back = false) {
  return `<div class="jp-cover ${back ? 'jp-back' : ''}"><div class="jp-cover-frame"><p>JOGUMAN FRIENDS</p><span class="jp-cover-club">慢慢生活俱乐部</span><img src="./assets/ubhc-transparent.png" alt="UBHC"><h2>${back ? '小小的我们，<br>也很重要。' : '生活护照'}</h2><small>${back ? 'WE ARE SMALL, BUT NOT UNIMPORTANT.' : 'MY LITTLE PASSPORT'}</small><span class="jp-cover-owner">${esc(model.site.author)}<em>TAKE IT SLOW</em></span><button data-jp-go="${back ? 3 : 1}" class="jp-open">${back ? '再翻翻内页' : '翻开护照'} <span aria-hidden="true">↗</span></button></div></div>`;
}

function leaf(content, number, extra = '') {
  return `<article class="jp-leaf ${extra}">${content}<span class="jp-folio">${String(number).padStart(2, '0')} / SLOW NOTES</span></article>`;
}

function identity() {
  const { site, posts } = model;
  return `<div class="jp-spread">${leaf(`<p class="jp-small">THIS LITTLE BOOK BELONGS TO</p><div class="jp-inside-art"><img src="./assets/brachio.png" alt="布拉吉奥"><span>嗨，慢慢来就好。</span></div><blockquote>不用每一天都很特别。<br>有在好好生活，<br>就已经很好。</blockquote><p class="jp-hand">和布拉吉奥、伍迪，<br>还有其他小伙伴一起，<br>把普通的日子好好收起来。</p>`, 1, 'jp-inside')}${leaf(`<div class="jp-topline"><b>生活记录本</b><span>PERSONAL PASSPORT</span></div><div class="jp-id-layout"><div class="jp-id-photo"><img src="./assets/brachio.png" alt="护照上的布拉吉奥"></div><div><small>姓名 / NAME</small><h2>${esc(site.author)}</h2><small>我的小世界 / LOCATION</small><p>${esc(site.location)}</p><small>生活状态 / STATUS</small><p>${esc(site.currentNote)}</p></div></div><div class="jp-profile-text"><small>ABOUT ME</small><p>${esc(site.bio)}</p><p>收藏喜欢的东西，认真吃饭，去外面走走。<br>也给小黑猫金子留一片晒太阳的地方。</p></div><div class="jp-signature"><span>持有人签名 / SIGNATURE</span><strong>${esc(site.author)}</strong><span class="jp-round-stamp">UBHC<br><small>GOOD LITTLE DAYS</small></span></div><div class="jp-code" aria-hidden="true">UBHC &lt;&lt; SLOW &lt;&lt; NOTES &lt;&lt; ${String(posts.length).padStart(3,'0')}<br>TAKE &lt;&lt; IT &lt;&lt; SLOW &lt;&lt; EVERY &lt;&lt; DAY</div>`, 2)}</div>`;
}

function stamps() {
  const { site, posts } = model;
  const stamp = c => `<a class="jp-stamp jp-stamp-${esc(c.englishName.toLowerCase())}" href="${categoryLink(c.name)}"><img src="./${esc(c.asset)}" alt="${esc(c.character)}"><strong>${esc(c.name)}</strong><small>${esc(c.englishName)} · ${posts.filter(p=>p.category===c.name).length} 篇手记</small></a>`;
  return `<div class="jp-spread">${leaf(`<div class="jp-topline"><b>生活印章</b><span>LITTLE MOMENTS</span></div><h2>给喜欢的日子，<br>盖一个小小的章。</h2><p class="jp-hand">每一个栏目，都有一位小伙伴照看。<br>点一下印章，就能翻到那些手记。</p><div class="jp-stamp-grid">${site.categories.slice(0,3).map(stamp).join('')}</div>`,3)}${leaf(`<div class="jp-topline"><b>生活印章</b><span>COLLECT THE ORDINARY</span></div><div class="jp-stamp-grid">${site.categories.slice(3).map(stamp).join('')}</div><div class="jp-jinzi-note"><img src="./assets/woody.png" alt="伍迪"><p>这一角，专门留给金子。<br>小黑猫的照片和故事，慢慢攒。</p></div>`,4)}</div>`;
}

function moments() {
  const { site, posts } = model;
  const outdoors = posts.filter(p=>p.category==='户外').slice(0,3);
  return `<div class="jp-spread">${leaf(`<div class="jp-topline"><b>口袋里的日子</b><span>POCKET NOTES</span></div><h2>一些不想忘的小事。</h2>${(site.notes||[]).slice(0,3).map(n=>`<div class="jp-note"><time>${esc(n.date.replaceAll('-','.'))}</time><p>${esc(n.text)}</p></div>`).join('')}`,5)}${leaf(`<div class="jp-topline"><b>出去走走</b><span>OUTSIDE WITH STEGO</span></div><img class="jp-stego" src="./${esc(site.categories.find(c=>c.name==='户外')?.sceneAsset || 'assets/stego.png')}" alt="史铁哥"><h2>下一站，等一阵风。</h2><p class="jp-hand">走过的路，慢慢记在这里。</p><div class="jp-journeys">${outdoors.length ? outdoors.map(p=>`<a href="${postLink(p)}"><time>${esc(p.date)}</time><strong>${esc(p.title)}</strong><span aria-hidden="true">↗</span></a>`).join('') : '<p>还没有户外手记，留给下一次出发。</p>'}</div>`,6)}</div>`;
}

function view() { return current===0 ? cover() : current===4 ? cover(true) : current===1 ? identity() : current===2 ? stamps() : moments(); }
function content() {
  return `<nav class="jp-chapters" aria-label="护照章节">${labels.map((name,index)=>`<button data-jp-go="${index}" aria-current="${current===index?'page':'false'}">${name}</button>`).join('')}</nav><div class="jp-stage ${current===0 || current===4?'jp-closed':''}" tabindex="0" aria-label="生活护照，可用左右方向键翻页">${view()}</div><div class="jp-pagination"><button class="button" data-jp-go="${current-1}" ${current===0?'disabled':''}>← 上一页</button><span aria-live="polite">${esc(labels[current])}<small>${current+1} / ${labels.length}</small></span><button class="button" data-jp-go="${current+1}" ${current===4?'disabled':''}>下一页 →</button></div><p class="jp-hint">点击目录或左右箭头翻页 · 手机上也可以左右滑动</p>`;
}

export function renderPassport(site, posts) {
  model = {site, posts};
  return `<section class="jog-passport"><header class="jp-heading"><p>MY LITTLE PASSPORT</p><h1>生活护照</h1><span>把自己与世界的相遇，收进一本护照。</span></header><div class="jp-reader">${content()}</div><p class="jp-disclosure">${esc(site.sampleNotice || '')}<br>个人生活记录本 · 非官方 JOGUMAN 主题</p></section>`;
}

export function syncPassport() {
  const reader = document.querySelector('.jp-reader');
  if (!reader) return;
  let turning = false, start;
  function turn(next) {
    next = Math.max(0, Math.min(labels.length-1, Number(next)));
    if (turning || next===current) return;
    const previous=current, stage=reader.querySelector('.jp-stage');
    const face=(previous===0 || previous===4 ? stage.firstElementChild : stage.querySelector(next>current ? '.jp-leaf:last-child' : '.jp-leaf:first-child')).cloneNode(true);
    const wasFocused=reader.contains(document.activeElement);
    current=next;
    reader.innerHTML=content();
    const target=reader.querySelector('.jp-stage');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      turning=true;
      const flap=document.createElement('div');
      flap.className=`jp-flap ${next>previous?'jp-flap-next':'jp-flap-prev'} ${previous===0 || previous===4 ? 'jp-flap-cover':''}`;
      flap.setAttribute('aria-hidden','true');flap.inert=true;
      flap.append(face);target.append(flap);
      setTimeout(()=>{flap.remove();turning=false;},650);
    }
    if (wasFocused) target.focus({preventScroll:true});
    if (target.getBoundingClientRect().top < 90) target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  reader.addEventListener('click',e=>{const button=e.target.closest('[data-jp-go]');if(button && !button.disabled)turn(button.dataset.jpGo);});
  reader.addEventListener('keydown',e=>{
    if(e.key==='ArrowRight' || e.key==='ArrowLeft'){e.preventDefault();turn(current+(e.key==='ArrowRight'?1:-1));}
    if(e.key==='Home'){e.preventDefault();turn(0);}
    if(e.key==='End'){e.preventDefault();turn(4);}
  });
  reader.addEventListener('pointerdown',e=>{if(e.pointerType==='touch' && !e.target.closest('a,button'))start={x:e.clientX,y:e.clientY};});
  reader.addEventListener('pointercancel',()=>{start=null;});
  reader.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.7)turn(current+(dx<0?1:-1));});
}
