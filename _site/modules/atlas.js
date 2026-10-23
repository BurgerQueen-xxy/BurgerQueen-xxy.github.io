// Geography: Natural Earth 5.1.2 (public domain). See assets/maps/SOURCES.md.
// No travel history is bundled with the geographic data.
const SVG_NS='http://www.w3.org/2000/svg';
const BASE_VIEW={x:0,y:0,width:1536,height:1024};
const MAX_ZOOM=8;
const mounted=new WeakMap();
let dataPromise;
// View preferences only: no travel records or other private content are retained.
let sessionState={view:{...BASE_VIEW},selected:''};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const finite=Number.isFinite;

/** Keep supplied records even without usable coordinates; never invent a pin. */
export function normalizeJourneys(value) {
  if(!Array.isArray(value)) return [];
  return value.filter(item=>item && typeof item.name==='string' && item.name.trim() && typeof item.countryCode==='string' && /^[a-z]{2,3}$/i.test(item.countryCode.trim())).map(item=>{
    const positioned=finite(item.latitude)&&Math.abs(item.latitude)<=90&&finite(item.longitude)&&Math.abs(item.longitude)<=180;
    const date=typeof item.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&!Number.isNaN(Date.parse(`${item.date}T00:00:00Z`))&&new Date(`${item.date}T00:00:00Z`).toISOString().slice(0,10)===item.date?item.date:'';
    return {name:item.name.trim(),countryCode:item.countryCode.trim().toLowerCase(),latitude:positioned?item.latitude:null,longitude:positioned?item.longitude:null,date,slug:typeof item.slug==='string'?item.slug:''};
  });
}

/** Natural Earth I forward projection, matching the supplied outline data.
 * Polynomial coefficients from d3-geo (ISC, license bundled with the data). */
export function projectLocation(latitude,longitude,projection) {
  if(!finite(latitude)||!finite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180) return null;
  const phi=latitude*Math.PI/180,lambda=longitude*Math.PI/180,p2=phi*phi,p4=p2*p2;
  const x=lambda*(.8707-.131979*p2+p4*(-.013791+p4*(.003971*p2-.001529*p4)));
  const y=phi*(1.007226+p2*(.015085+p4*(-.044475+.028874*p2-.005916*p4)));
  return {x:projection.translate[0]+projection.scale*x,y:projection.translate[1]-projection.scale*y};
}

export function clampView(view) {
  const width=clamp(view.width,BASE_VIEW.width/MAX_ZOOM,BASE_VIEW.width);
  const height=width*BASE_VIEW.height/BASE_VIEW.width;
  return {x:clamp(view.x,BASE_VIEW.x,BASE_VIEW.x+BASE_VIEW.width-width),y:clamp(view.y,BASE_VIEW.y,BASE_VIEW.y+BASE_VIEW.height-height),width,height};
}

function outlinePath(coordinates,projection) {
  return coordinates.map(([latitude,longitude],index)=>{const p=projectLocation(latitude,longitude,projection);return `${index?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join('');
}
function graticule(projection) {
  const lines=[];
  for(let latitude=-60;latitude<=60;latitude+=30) lines.push(outlinePath(Array.from({length:91},(_,i)=>[latitude,-180+i*4]),projection));
  for(let longitude=-150;longitude<=180;longitude+=30) lines.push(outlinePath(Array.from({length:43},(_,i)=>[-84+i*4,longitude]),projection));
  return lines;
}
function svgElement(name,attributes={},text) {
  const node=document.createElementNS(SVG_NS,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  if(text!==undefined)node.textContent=text;
  return node;
}

export function renderAtlas(site={},posts=[]) {
  const journeys=normalizeJourneys(site.journeys);
  return `<section class="jp-atlas atlas-root" aria-label="护照世界地图"><header class="atlas-heading"><div><p>THE WORLD IN MY PASSPORT</p><h2>世界很大，慢慢走。</h2></div><span class="atlas-record-count">${journeys.length} 条地点记录</span></header><div class="atlas-toolbar"><label class="atlas-select-label"><span>国家 / 地区</span><select class="atlas-country-select" aria-label="选择国家或地区" disabled><option value="">正在展开地图…</option></select></label><div class="atlas-controls" aria-label="地图缩放"><button type="button" data-atlas-action="out" aria-label="缩小地图" title="缩小" disabled>−</button><output class="atlas-zoom" aria-live="polite">1×</output><button type="button" data-atlas-action="in" aria-label="放大地图" title="放大" disabled>＋</button><button type="button" data-atlas-action="reset" aria-label="复位世界地图" title="复位" disabled>↺</button></div></div><div class="atlas-viewport" tabindex="0" aria-label="世界地图，选择国家后可放大；方向键平移，加减键缩放，Home 复位"><div class="atlas-map-status" role="status">地图正在展开…</div><svg class="atlas-map" xmlns="${SVG_NS}" viewBox="${BASE_VIEW.x} ${BASE_VIEW.y} ${BASE_VIEW.width} ${BASE_VIEW.height}" role="img" aria-label="世界国家轮廓与经纬线" preserveAspectRatio="xMidYMid meet"></svg><span class="atlas-map-hint">拖动地图 · 选择国家</span></div><section class="atlas-detail" aria-live="polite" aria-atomic="false"><div class="atlas-empty"><h3>${journeys.length?'地点记录正在展开':'世界很大，足迹慢慢留下'}</h3><p>先看看地图，下一次出发再慢慢记录。</p></div></section><footer class="atlas-source"><span>Natural Earth · 国家与地区轮廓</span><a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">地图来源 ↗</a></footer></section>`;
}

function loadMap() {
  if(!dataPromise) {
    const request=new AbortController(),timeout=setTimeout(()=>request.abort(),8000);
    dataPromise=fetch(new URL('../assets/maps/world.json',import.meta.url),{signal:request.signal}).then(response=>{
    if(!response.ok)throw new Error(`地图读取失败：${response.status}`);
    return response.json();
  }).then(data=>{
    if(!finite(data.scale)||!Array.isArray(data.translate)||data.translate.length!==2||!data.translate.every(finite)||!Array.isArray(data.countries)||!data.countries.length)throw new Error('地图数据格式无效');
    if(data.countries.some(c=>typeof c.id!=='string'||typeof c.name!=='string'||!/^[a-z]{2,3}$/i.test(c.code)||typeof c.path!=='string'||!/^[MLZ0-9.,\-\s]+$/i.test(c.path)))throw new Error('地图轮廓格式无效');
    return data;
    }).catch(error=>{dataPromise=null;throw error;}).finally(()=>clearTimeout(timeout));
  }
  return dataPromise;
}

/** Mount only when the passport's map spread is shown. Returns a cleanup function. */
export function mountAtlas(container,site={},posts=[]) {
  const root=container?.matches?.('.jp-atlas')?container:container?.querySelector?.('.jp-atlas');
  if(!root)return ()=>{};
  mounted.get(root)?.();
  const restored={view:{...sessionState.view},selected:sessionState.selected};
  const controller=new AbortController(),{signal}=controller;
  const svg=root.querySelector('.atlas-map'),viewport=root.querySelector('.atlas-viewport'),select=root.querySelector('.atlas-country-select'),detail=root.querySelector('.atlas-detail'),status=root.querySelector('.atlas-map-status');
  const records=normalizeJourneys(site.journeys),postIndex=new Map((Array.isArray(posts)?posts:[]).map(post=>[post.slug,post]));
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  let disposed=false,data=null,countries=[],byCode=new Map(),aliases=new Map(),knownRecords=[],paths=[],pins=[],selected='',view={...BASE_VIEW},drag=null,selectedMarker,resizeObserver;
  const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal});
  // Native select, links, map drag, and arrow-key navigation belong to the atlas.
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click','dblclick','keydown','touchstart','touchmove','touchend'])listen(root,type,event=>event.stopPropagation());
  function cleanup(){if(disposed)return;if(data)sessionState={view:{...view},selected};disposed=true;resolveReady(false);controller.abort();resizeObserver?.disconnect();if(drag&&svg.hasPointerCapture?.(drag.id))svg.releasePointerCapture(drag.id);drag=null;mounted.delete(root);}
  // The passport can take one completed, inert snapshot without a persistent observer.
  cleanup.ready=ready;
  mounted.set(root,cleanup);
  const currentCountry=()=>byCode.get(selected);
  function setView(next) {
    view=clampView(next);svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
    sessionState={view:{...view},selected};
    const zoom=BASE_VIEW.width/view.width;
    root.querySelector('.atlas-zoom').textContent=`${Number(zoom.toFixed(1))}×`;
    root.querySelector('[data-atlas-action="out"]').disabled=zoom<=1.001;
    root.querySelector('[data-atlas-action="in"]').disabled=zoom>=MAX_ZOOM-.001;
    root.dataset.atlasZoomed=String(zoom>1.8);
    const rect=svg.getBoundingClientRect(),units=Math.max(view.width/Math.max(rect.width,1),view.height/Math.max(rect.height,1));
    svg.style.setProperty('--atlas-label-size',`${units*10}px`);
    for(const pin of pins)pin.setAttribute('r',String(units*4.5));
    if(selectedMarker){selectedMarker.querySelector('circle').setAttribute('r',String(units*7));selectedMarker.querySelector('text').setAttribute('dy',String(-units*12));}
  }
  function zoomBy(factor) {
    const width=clamp(view.width/factor,BASE_VIEW.width/MAX_ZOOM,BASE_VIEW.width),height=width*BASE_VIEW.height/BASE_VIEW.width;
    setView({x:view.x+(view.width-width)/2,y:view.y+(view.height-height)/2,width,height});
  }
  function recordHTML(record) {
    const post=postIndex.get(record.slug);
    const body=`<span class="atlas-record-date">${record.date?esc(record.date.replaceAll('-','.')):'日期待补充'}</span><strong>${esc(record.name)}</strong><small>${post?'阅读这篇手记 ↗':'游记待记录'}${record.latitude===null?' · 位置待补充':''}</small>`;
    return post?`<a class="atlas-record" href="#/post/${encodeURIComponent(post.slug)}">${body}</a>`:`<div class="atlas-record">${body}</div>`;
  }
  function renderDetail() {
    const country=currentCountry(),list=country?knownRecords.filter(record=>record.code===country.code):knownRecords;
    root.dataset.atlasSelected=String(Boolean(country));
    detail.hidden=!country;
    if(!country&&!list.length){detail.innerHTML='<div class="atlas-empty"><h3>世界很大，足迹慢慢留下</h3><p>这里还没有旅行记录。选一个国家，先在地图上逛逛。</p></div>';return;}
    detail.innerHTML=`<div class="atlas-detail-heading"><h3>${country?esc(country.name):'口袋里的旅行记录'}</h3><span>${list.length} 条记录</span><button type="button" data-atlas-action="close" aria-label="收起国家详情">×</button></div>${list.length?`<div class="atlas-records">${list.map(recordHTML).join('')}</div>`:`<p class="atlas-country-empty">还没有这里的足迹，留给下一次出发。</p>`}`;
  }
  function chooseCountry(code,center=false) {
    selected=byCode.has(code)?code:'';select.value=selected;
    for(const path of paths)path.classList.toggle('atlas-country-selected',path.dataset.atlasCode===selected);
    selectedMarker?.remove();selectedMarker=null;
    const country=currentCountry();
    if(country) {
      const point=projectLocation(country.latitude,country.longitude,data);
      if(point) {
        selectedMarker=svgElement('g',{class:'atlas-selection','pointer-events':'none'});
        selectedMarker.append(svgElement('circle',{cx:point.x,cy:point.y,r:7}),svgElement('text',{x:point.x,y:point.y,'text-anchor':'middle'},country.name));
        svg.querySelector('.atlas-markers').append(selectedMarker);
        if(center){const width=BASE_VIEW.width/Math.max(2.6,BASE_VIEW.width/view.width),height=width*BASE_VIEW.height/BASE_VIEW.width;setView({x:point.x-width/2,y:point.y-height/2,width,height});}
      }
    }
    setView(view);renderDetail();
  }
  function buildMap(result) {
    data=result;
    // Separate Australian territories share AU; one dropdown entry selects all AU outlines.
    for(const country of data.countries){if(!byCode.has(country.code))byCode.set(country.code,country);aliases.set(country.code,country.code);aliases.set(country.id.toLowerCase(),country.code);}
    countries=[...byCode.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
    knownRecords=records.map(record=>({...record,code:aliases.get(record.countryCode)})).filter(record=>record.code);
    const visited=new Set(knownRecords.map(record=>record.code));
    svg.replaceChildren();
    const grid=svgElement('g',{class:'atlas-graticule','aria-hidden':'true'});
    for(const d of graticule(data))grid.append(svgElement('path',{d}));
    svg.append(grid);
    const shapes=svgElement('g',{class:'atlas-countries'});paths=[];
    for(const country of data.countries){const path=svgElement('path',{d:country.path,class:`atlas-country${visited.has(country.code)?' atlas-country-recorded':''}`,'data-atlas-code':country.code});path.append(svgElement('title',{},country.name));shapes.append(path);paths.push(path);}
    svg.append(shapes);
    const labels=svgElement('g',{class:'atlas-geography-labels','aria-hidden':'true','pointer-events':'none'});
    for(const [label,latitude,longitude,kind] of [['北美洲',43,-108,'land'],['南美洲',-19,-59,'land'],['欧洲',55,18,'land'],['非洲',5,20,'land'],['亚洲',45,95,'land'],['大洋洲',-25,135,'land'],['太平洋',-4,-145,'ocean'],['大西洋',18,-33,'ocean'],['印度洋',-25,77,'ocean']]){const point=projectLocation(latitude,longitude,data);labels.append(svgElement('text',{x:point.x,y:point.y,'text-anchor':'middle',class:`atlas-label-${kind}`},label));}
    // Labels follow the same projection as outlines, rather than decorative straight lines.
    for(const latitude of [-60,-30,0,30,60]){const point=projectLocation(latitude,-177,data);labels.append(svgElement('text',{x:point.x,y:point.y,dx:6,dy:-4,class:'atlas-coordinate-label'},latitude===0?'赤道 0°':`${Math.abs(latitude)}°${latitude>0?'N':'S'}`));}
    svg.append(labels);
    const markers=svgElement('g',{class:'atlas-markers'});pins=[];
    for(const record of knownRecords){const point=projectLocation(record.latitude,record.longitude,data);if(!point)continue;const pin=svgElement('circle',{cx:point.x,cy:point.y,r:5,class:'atlas-pin','data-atlas-code':record.code});pin.append(svgElement('title',{},record.name));markers.append(pin);pins.push(pin);}
    svg.append(markers);
    select.replaceChildren(new Option('全部国家 / 地区',''));
    for(const country of countries)select.add(new Option(`${country.name}${visited.has(country.code)?' · 有记录':''}`,country.code));
    select.disabled=false;
    root.querySelector('[data-atlas-action="reset"]').disabled=false;
    status.hidden=true;svg.classList.add('atlas-map-ready');
    root.querySelector('.atlas-record-count').textContent=`${knownRecords.length} 条地点记录 · ${visited.size} 个国家 / 地区`;
    setView(restored.view);chooseCountry(restored.selected);
  }
  async function start() {
    status.hidden=false;status.textContent='地图正在展开…';
    try{const result=await loadMap();if(!disposed&&root.isConnected){buildMap(result);resolveReady(true);}else resolveReady(false);}
    catch{if(disposed||!root.isConnected){resolveReady(false);return;}status.innerHTML='<p>地图暂时没能展开。</p><button type="button" data-atlas-retry>再试一次</button>';resolveReady(false);}
  }
  listen(select,'change',()=>chooseCountry(select.value,Boolean(select.value)));
  listen(root,'click',event=>{
    const retry=event.target.closest('[data-atlas-retry]');if(retry){start();return;}
    const action=event.target.closest('[data-atlas-action]')?.dataset.atlasAction;if(!data||!action)return;
    if(action==='close'){chooseCountry('');select.focus();}if(action==='in')zoomBy(1.5);if(action==='out')zoomBy(1/1.5);if(action==='reset'){setView({...BASE_VIEW});chooseCountry('');}
  });
  listen(viewport,'keydown',event=>{
    if(event.target!==viewport||!data)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','Escape'].includes(event.key))event.preventDefault();
    const step=view.width*.1;
    if(event.key==='ArrowLeft')setView({...view,x:view.x-step});if(event.key==='ArrowRight')setView({...view,x:view.x+step});
    if(event.key==='ArrowUp')setView({...view,y:view.y-step});if(event.key==='ArrowDown')setView({...view,y:view.y+step});
    if(event.key==='+'||event.key==='=')zoomBy(1.5);if(event.key==='-')zoomBy(1/1.5);
    if(event.key==='Home'){setView({...BASE_VIEW});chooseCountry('');}if(event.key==='Escape')chooseCountry('');
  });
  const pointerPoint=(event,matrix)=>new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);
  listen(svg,'pointerdown',event=>{
    if(!data||event.button!==0||!event.isPrimary)return;
    const matrix=svg.getScreenCTM()?.inverse();if(!matrix)return;
    event.preventDefault();
    drag={id:event.pointerId,matrix,point:pointerPoint(event,matrix),clientX:event.clientX,clientY:event.clientY,view:{...view},moved:false,code:event.target.closest?.('[data-atlas-code]')?.dataset.atlasCode};
    svg.setPointerCapture(event.pointerId);viewport.classList.add('atlas-dragging');
  });
  listen(svg,'pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const point=pointerPoint(event,drag.matrix);
    if(Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)>5)drag.moved=true;
    if(drag.moved)setView({...drag.view,x:drag.view.x-(point.x-drag.point.x),y:drag.view.y-(point.y-drag.point.y)});
  });
  function endDrag(event){if(!drag||event.pointerId!==drag.id)return;const completed=drag;drag=null;viewport.classList.remove('atlas-dragging');if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);if(event.type==='pointerup'&&!completed.moved&&completed.code)chooseCountry(completed.code);}
  listen(svg,'pointerup',endDrag);listen(svg,'pointercancel',endDrag);listen(svg,'lostpointercapture',event=>{if(drag&&event.pointerId===drag.id){drag=null;viewport.classList.remove('atlas-dragging');}});
  if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(()=>{if(data&&!disposed)setView(view);});resizeObserver.observe(viewport);}
  start();return cleanup;
}
