// Official JOGUMAN artwork; see public/assets/SOURCES-pet.md for provenance.
const STORAGE_KEY = 'slow-notes-pet';
const animationUrl = new URL('./assets/brachio-pet.json', import.meta.url).href;
const playerUrl = new URL('./vendor/lottie.min.js', import.meta.url).href;
const stillUrl = new URL('./assets/brachio.png', import.meta.url).href;
const OBSTACLES = '.site-header, .site-header .main-nav, #mobile-menu, .mobile-dock, .mobile-nav, .bottom-nav, [data-pet-obstacle]';
const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const finite = value => typeof value === 'number' && Number.isFinite(value);
let playerPromise;
let mountedPet;

/** Pixel coordinates are kept inside the visible, unobstructed viewport. */
export function constrainPetPosition(point, bounds) {
  return {
    x: clamp(finite(point?.x) ? point.x : bounds.minX, bounds.minX, bounds.maxX),
    y: clamp(finite(point?.y) ? point.y : bounds.maxY, bounds.minY, bounds.maxY),
  };
}
export function normalizePetPosition(point, bounds) {
  const safe = constrainPetPosition(point, bounds);
  return {
    x: bounds.maxX > bounds.minX ? (safe.x - bounds.minX) / (bounds.maxX - bounds.minX) : 0,
    y: bounds.maxY > bounds.minY ? (safe.y - bounds.minY) / (bounds.maxY - bounds.minY) : 1,
  };
}
export function restorePetPosition(ratio, bounds) {
  return constrainPetPosition({
    x: bounds.minX + clamp(finite(ratio?.x) ? ratio.x : 0, 0, 1) * (bounds.maxX - bounds.minX),
    y: bounds.minY + clamp(finite(ratio?.y) ? ratio.y : 1, 0, 1) * (bounds.maxY - bounds.minY),
  }, bounds);
}

function getPlayer() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!playerPromise) {
    playerPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = playerUrl; script.async = true; script.dataset.brachioPlayer = '';
      script.onload = () => {
        if (window.lottie) resolve(window.lottie);
        else { playerPromise = undefined; reject(new Error('Lottie 未能加载')); }
      };
      script.onerror = () => { script.remove(); playerPromise = undefined; reject(new Error('Lottie 未能加载')); };
      document.head.append(script);
    });
  }
  return playerPromise;
}
function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), point = stored?.position;
    return { hidden: stored?.hidden === true, paused: stored?.paused === true,
      position: finite(point?.x) && finite(point?.y) ? {x:clamp(point.x,0,1),y:clamp(point.y,0,1)} : null };
  } catch { return { hidden: false, paused: false, position: null }; }
}

/** Mount once; trigger is an existing header button or selector. Include pet.css. */
export function mountPet({ trigger = '#pet-toggle' } = {}) {
  if (mountedPet) return mountedPet;
  const preferences = readPreferences();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const triggerButton = typeof trigger === 'string' ? document.querySelector(trigger) : trigger;
  const controller = new AbortController(), options = { signal: controller.signal };
  let animation, destroyed = false, greetingTimer, transitionTimer, layoutFrame, gazeFrame;
  let greetingIndex = 0, drag = null, suppressClickUntil = 0, position = {x:0,y:0}, bounds, obstructed = false;
  let eyeGroups = [], gaze = {x:0,y:0}, gazeTarget = {x:0,y:0};
  const greetings = ['嗨，我是布拉吉奥。', '别着急，慢慢来就好。', '一起发一会儿呆吧。'];
  const root = document.createElement('aside');
  root.className = 'brachio-pet'; root.id = 'brachio-pet'; root.setAttribute('aria-label', '布拉吉奥小伙伴');
  root.innerHTML = `
    <p class="brachio-pet__speech" role="status" aria-live="polite" hidden></p>
    <p id="brachio-pet-help" class="brachio-pet__sr-only">可以拖动我。聚焦角色后，方向键移动，Shift 加方向键加速，Home 回到左下角，Esc 收起，Enter 或空格打招呼。</p>
    <div class="brachio-pet__stage">
      <div class="brachio-pet__tools">
        <button type="button" class="brachio-pet__control" data-pet-pause aria-label="暂停动画" title="暂停动画"></button>
        <button type="button" class="brachio-pet__control" data-pet-home aria-label="让布拉吉奥回到左下角" title="回到左下角"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10 10 4l6 6M6 9v7h8V9M9 16v-4h2v4"/></svg></button>
        <button type="button" class="brachio-pet__control" data-pet-hide aria-label="隐藏布拉吉奥" title="隐藏布拉吉奥"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>
      </div>
      <button type="button" class="brachio-pet__character" aria-label="布拉吉奥，拖动或打个招呼" aria-describedby="brachio-pet-help" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home Escape" title="拖动我，或点一下打招呼">
        <img class="brachio-pet__still" src="${stillUrl}" alt="" width="65" height="128" draggable="false">
        <span class="brachio-pet__animation" aria-hidden="true"></span>
      </button>
    </div>`;
  document.body.append(root);
  const pauseButton = root.querySelector('[data-pet-pause]'), hideButton = root.querySelector('[data-pet-hide]');
  const homeButton = root.querySelector('[data-pet-home]'), characterButton = root.querySelector('.brachio-pet__character');
  const animationContainer = root.querySelector('.brachio-pet__animation'), speech = root.querySelector('.brachio-pet__speech');
  const motionAllowed = () => !preferences.paused && !media.matches && !document.hidden;
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Preferences still work for this page. */ } }
  function viewport() {
    const view = window.visualViewport;
    return {left:view?.offsetLeft || 0, top:view?.offsetTop || 0, width:view?.width || innerWidth, height:view?.height || innerHeight};
  }
  function readBounds() {
    const view = viewport(), style = getComputedStyle(root);
    const width = parseFloat(style.width) || 105, height = parseFloat(style.height) || 150;
    const edge = parseFloat(style.getPropertyValue('--pet-edge')) || 12;
    const safe = side => parseFloat(style.getPropertyValue(`--pet-safe-${side}`)) || 0;
    const minX = view.left + Math.max(edge,safe('left'));
    let top = view.top + Math.max(edge,safe('top')), bottom = view.top + view.height - Math.max(edge,safe('bottom'));
    document.querySelectorAll(OBSTACLES).forEach(element => {
      const css = getComputedStyle(element), rect = element.getBoundingClientRect();
      if (css.position !== 'fixed' || css.display === 'none' || css.visibility === 'hidden' || !rect.width || !rect.height) return;
      if (rect.bottom <= view.top || rect.top >= view.top + view.height) return;
      if (element.matches('.site-header') && rect.top <= view.top + 20) top = Math.max(top,rect.bottom+8);
      else if (element.matches('#mobile-menu, [data-pet-obstacle]') || rect.top > view.top + view.height / 2) bottom = Math.min(bottom,rect.top-10);
    });
    obstructed = bottom - top < height; root.classList.toggle('brachio-pet--obstructed',obstructed);
    return {minX,maxX:Math.max(minX,view.left+view.width-width-Math.max(edge,safe('right'))),minY:top,maxY:Math.max(top,bottom-height),width,height};
  }
  function placeSpeech() {
    if (speech.hidden) return;
    const view = viewport(), rect = speech.getBoundingClientRect();
    let x = position.x + bounds.width - 8;
    if (x + rect.width > view.left + view.width - 10) x = position.x - rect.width + 8;
    speech.style.left = `${clamp(x,view.left+10,Math.max(view.left+10,view.left+view.width-rect.width-10))}px`;
    speech.style.top = `${clamp(position.y+20,view.top+10,Math.max(view.top+10,view.top+view.height-rect.height-10))}px`;
  }
  function place(next) {
    position = constrainPetPosition(next,bounds);
    root.style.left = `${position.x.toFixed(2)}px`; root.style.top = `${position.y.toFixed(2)}px`;
    root.classList.add('brachio-pet--positioned'); placeSpeech();
  }
  function updateLayout() {
    layoutFrame = null; if (destroyed) return;
    if (drag) finishDrag(false);
    bounds = readBounds(); place(restorePetPosition(preferences.position,bounds));
    root.inert = preferences.hidden || obstructed; root.setAttribute('aria-hidden',String(preferences.hidden || obstructed));
    if (obstructed) { speech.hidden=true;resetGaze(); }
    sync();
  }
  function scheduleLayout() { if (!layoutFrame) layoutFrame=requestAnimationFrame(updateLayout); }
  function resetPosition(announce = true) {
    finishDrag(false); preferences.position=null; updateLayout();save();resetGaze();
    if(announce) speak('回到小角落，继续陪你。');
  }
  function moveBy(x,y) {
    bounds=readBounds();place({x:position.x+x,y:position.y+y});
    preferences.position=normalizePetPosition(position,bounds);save();resetGaze();
  }
  function applyGaze() {
    eyeGroups.forEach((group,index)=>group.setAttribute('transform',`translate(${(gaze.x*(index===0 ? .85 : 1)).toFixed(3)} ${gaze.y.toFixed(3)})`));
  }
  function resetGaze() {cancelAnimationFrame(gazeFrame);gazeFrame=null;gaze={x:0,y:0};gazeTarget={x:0,y:0};applyGaze();}
  function stepGaze() {
    gazeFrame=null;
    if(!motionAllowed() || preferences.hidden || obstructed || drag) {resetGaze();return;}
    gaze.x+=(gazeTarget.x-gaze.x)*.22;gaze.y+=(gazeTarget.y-gaze.y)*.22;applyGaze();
    if(Math.abs(gazeTarget.x-gaze.x)+Math.abs(gazeTarget.y-gaze.y)>.025) gazeFrame=requestAnimationFrame(stepGaze);
  }
  function lookAt(event) {
    if(!eyeGroups.length || event.pointerType==='touch' || !motionAllowed() || preferences.hidden || obstructed || drag) return;
    const rect=animationContainer.getBoundingClientRect(), scale=Math.min(rect.width/252,rect.height/244);
    // Original eyes: layer 3 at (61.216,63.269), layer 5 at (72.675,49.2).
    const eyeX=rect.left+(rect.width-252*scale)/2+66.95*scale, eyeY=rect.bottom-244*scale+56.23*scale;
    const distance=Math.max(140,viewport().width*.2);
    gazeTarget={x:clamp((event.clientX-eyeX)/distance,-1,1)*3.4,y:clamp((event.clientY-eyeY)/distance,-1,1)*2.7};
    if(!gazeFrame) gazeFrame=requestAnimationFrame(stepGaze);
  }
  function connectEyes() {
    eyeGroups=[];
    // Transform-only wrappers preserve every original path and stroke, and
    // Bodymovin retains its own layer transforms and original limb animation.
    for(const id of [3,5]) {
      const layer=animationContainer.querySelector(`.brachio-pet__eye-layer--${id}`); if(!layer) continue;
      const wrapper=document.createElementNS('http://www.w3.org/2000/svg','g'); wrapper.setAttribute('data-pet-gaze',String(id));
      while(layer.firstChild) wrapper.append(layer.firstChild);
      layer.append(wrapper);eyeGroups.push(wrapper);
    }
    root.dataset.gazeReady=String(eyeGroups.length===2);resetGaze();
  }
  function sync() {
    const paused=preferences.paused||media.matches;
    pauseButton.disabled=media.matches; pauseButton.setAttribute('aria-pressed',String(paused));
    const label=media.matches?'已按系统设置减少动画':paused?'继续动画':'暂停动画';
    pauseButton.setAttribute('aria-label',label);pauseButton.title=label;
    pauseButton.innerHTML=paused?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 7 5-7 5Z"/></svg>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg>';
    root.classList.toggle('brachio-pet--paused',paused); root.inert=preferences.hidden||obstructed;
    root.setAttribute('aria-hidden',String(preferences.hidden||obstructed));
    if(triggerButton) {
      triggerButton.setAttribute('aria-controls',root.id);triggerButton.setAttribute('aria-pressed',String(!preferences.hidden));
      const label=preferences.hidden?'显示布拉吉奥':'隐藏布拉吉奥';triggerButton.setAttribute('aria-label',label);triggerButton.title=label;
    }
    if(animation) {if(paused||preferences.hidden||document.hidden||obstructed) animation.pause();else animation.play();}
    if(paused||preferences.hidden||document.hidden||obstructed) resetGaze();
  }
  function clearTransition() {clearTimeout(transitionTimer);root.classList.remove('brachio-pet--entering','brachio-pet--leaving');}
  function returnFocus() {
    const candidates=[triggerButton,...document.querySelectorAll('[data-pet-toggle], [data-menu-pet]')].filter(Boolean);
    const visible=candidates.find(button=>button.getClientRects().length&&!button.closest('[hidden]'));
    (visible||document.querySelector('#main'))?.focus({preventScroll:true});
  }
  function setHidden(hidden,restoreFocus=false) {
    if(destroyed) return;
    const changed=preferences.hidden!==hidden; preferences.hidden=hidden;
    finishDrag(false);clearTransition();resetGaze();
    if(hidden) {
      clearTimeout(greetingTimer);speech.hidden=true;
      if(restoreFocus&&root.contains(document.activeElement)) returnFocus();
      if(!root.hidden&&changed&&motionAllowed()) {
        root.classList.add('brachio-pet--leaving');transitionTimer=setTimeout(()=>{root.hidden=true;clearTransition();},240);
      } else root.hidden=true;
    } else {
      root.hidden=false;updateLayout();
      if(changed&&motionAllowed()) {void root.offsetWidth;root.classList.add('brachio-pet--entering');transitionTimer=setTimeout(clearTransition,390);}
    }
    save();sync();
  }
  function setPaused(paused) {preferences.paused=paused;save();sync();}
  function speak(message,duration=3500) {
    if(preferences.hidden||obstructed) return;
    clearTimeout(greetingTimer);speech.textContent=message;speech.hidden=false;placeSpeech();
    greetingTimer=setTimeout(()=>{speech.hidden=true;},duration);
  }
  function greet() {if(preferences.hidden)setHidden(false);speak(greetings[greetingIndex++%greetings.length]);}
  function startDrag(event) {
    if(!event.isPrimary||event.button!==0||preferences.hidden) return;
    clearTransition();resetGaze();bounds=readBounds();
    drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,origin:{...position},saved:preferences.position?{...preferences.position}:null,moved:false};
    characterButton.setPointerCapture(event.pointerId);characterButton.focus({preventScroll:true});
  }
  function dragMove(event) {
    if(!drag||event.pointerId!==drag.id) return;
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if(!drag.moved&&Math.hypot(dx,dy)<6) return;
    event.preventDefault();drag.moved=true;speech.hidden=true;root.classList.add('brachio-pet--dragging');
    place({x:drag.origin.x+dx,y:drag.origin.y+dy});
  }
  function finishDrag(cancel=false) {
    if(!drag) return false;
    const previous=drag;drag=null;root.classList.remove('brachio-pet--dragging');
    if(characterButton.hasPointerCapture(previous.id)) characterButton.releasePointerCapture(previous.id);
    if(previous.moved) {
      suppressClickUntil=performance.now()+600;
      if(cancel) {preferences.position=previous.saved;place(previous.origin);}
      else preferences.position=normalizePetPosition(position,bounds);
      save();resetGaze();
    }
    return previous.moved;
  }
  function endDrag(event) {
    if(drag?.id!==event.pointerId) return;
    const moved=finishDrag(event.type==='pointercancel');
    if(moved&&event.type!=='pointercancel') speak('换个地方，继续陪你。',2200);
  }

  triggerButton?.addEventListener('click',()=>setHidden(!preferences.hidden),options);
  hideButton.addEventListener('click',()=>setHidden(true,true),options);
  pauseButton.addEventListener('click',()=>setPaused(!preferences.paused),options);
  homeButton.addEventListener('click',()=>resetPosition(),options);
  characterButton.addEventListener('click',event=>{if(event.detail>0&&performance.now()<suppressClickUntil){event.preventDefault();return;}greet();},options);
  characterButton.addEventListener('pointerdown',startDrag,options);
  characterButton.addEventListener('pointermove',dragMove,{...options,passive:false});
  characterButton.addEventListener('pointerup',endDrag,options);
  characterButton.addEventListener('pointercancel',endDrag,options);
  characterButton.addEventListener('lostpointercapture',()=>finishDrag(false),options);
  characterButton.addEventListener('dragstart',event=>event.preventDefault(),options);
  characterButton.addEventListener('keydown',event=>{
    const step=event.shiftKey?32:12, moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
    if(moves[event.key]) {event.preventDefault();finishDrag(false);moveBy(...moves[event.key]);}
    else if(event.key==='Home'){event.preventDefault();resetPosition();}
    else if(event.key==='Escape'){event.preventDefault();if(drag){finishDrag(true);speak('好，还是待在原来的地方。',2000);}else setHidden(true,true);}
  },options);
  document.addEventListener('pointermove',lookAt,{...options,passive:true});
  document.documentElement.addEventListener('pointerleave',resetGaze,options);
  window.addEventListener('blur',()=>{finishDrag(false);resetGaze();},options);
  document.addEventListener('visibilitychange',()=>{finishDrag(false);resetGaze();sync();},options);
  media.addEventListener('change',()=>{clearTransition();root.hidden=preferences.hidden;resetGaze();sync();},options);
  window.addEventListener('resize',scheduleLayout,options);
  window.visualViewport?.addEventListener('resize',scheduleLayout,options);
  window.visualViewport?.addEventListener('scroll',scheduleLayout,options);
  const observed=new WeakSet(), resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(scheduleLayout):null;
  function observeObstacles() {document.querySelectorAll(OBSTACLES).forEach(element=>{if(!observed.has(element)){resizeObserver?.observe(element);observed.add(element);}});}
  resizeObserver?.observe(root);observeObstacles();
  const mutationObserver=new MutationObserver(records=>{
    if(records.some(record=>!root.contains(record.target)&&(record.target.matches?.(OBSTACLES)||record.type==='childList'&&[...record.addedNodes].some(node=>node.matches?.(OBSTACLES)||node.querySelector?.(OBSTACLES))))) {observeObstacles();scheduleLayout();}
  });
  mutationObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style']});
  document.addEventListener('brachio-pet',event=>{
    switch(event.detail?.action) {
      case 'show':setHidden(false);break;case 'hide':setHidden(true,true);break;case 'toggle':setHidden(!preferences.hidden,true);break;
      case 'pause':setPaused(true);break;case 'play':setPaused(false);break;case 'greet':greet();break;case 'reset':resetPosition();break;
    }
  },options);
  root.hidden=preferences.hidden;updateLayout();sync();
  const ready=Promise.all([
    getPlayer(),fetch(animationUrl,{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('布拉吉奥动画未能加载');return response.json();}),
  ]).then(([lottie,data])=>{
    if(destroyed) return;
    // Annotate only original eye layers in memory. Layer 6 is the pink mouth;
    // layer 7 combines head, neck and body and must never be displaced alone.
    for(const layer of data.layers||[]) if([3,5].includes(layer.ind)) layer.cl=`${layer.cl||''} brachio-pet__eye-layer--${layer.ind}`.trim();
    return new Promise(resolve=>{
      animation=lottie.loadAnimation({container:animationContainer,renderer:'svg',loop:true,autoplay:false,animationData:data,rendererSettings:{preserveAspectRatio:'xMidYMax meet',progressiveLoad:true}});
      animation.addEventListener('DOMLoaded',()=>{
        if(destroyed){resolve();return;}
        // Light SVG omits expressions; loop the original 0–19 keyframes.
        animation.setSpeed(.48);animation.playSegments([0,19],true);animationContainer.querySelector('svg')?.setAttribute('focusable','false');
        root.classList.add('brachio-pet--ready');connectEyes();sync();resolve();
      });
      animation.addEventListener('data_failed',()=>{root.classList.remove('brachio-pet--ready');eyeGroups=[];pauseButton.hidden=true;resolve();});
    });
  }).catch(()=>{
    if(destroyed)return;root.classList.remove('brachio-pet--ready');eyeGroups=[];pauseButton.hidden=true;
    // Original local PNG remains draggable and summonable when Lottie fails.
  });
  mountedPet={ready,show:()=>setHidden(false),hide:()=>setHidden(true,true),toggle:()=>setHidden(!preferences.hidden,true),pause:()=>setPaused(true),play:()=>setPaused(false),greet,resetPosition,moveBy,
    destroy(){destroyed=true;controller.abort();clearTimeout(greetingTimer);clearTransition();cancelAnimationFrame(layoutFrame);resetGaze();finishDrag(false);resizeObserver?.disconnect();mutationObserver.disconnect();animation?.destroy();root.remove();triggerButton?.removeAttribute('aria-controls');triggerButton?.removeAttribute('aria-pressed');mountedPet=undefined;},
  };
  return mountedPet;
}
