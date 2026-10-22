// Complete official JOGUMAN scenes, with separate optional weather effects.
// Characters retain their original proportions. See assets/hero-v3/SOURCES.md.
const DEFAULT_CITY = {name:'杭州', latitude:30.2741, longitude:120.1551};
const TZ = 'Asia/Shanghai';
const CONDITIONS = new Set(['clear','cloud','rain','snow','fog','storm','unknown']);
const PHASES = new Set(['morning','day','evening','night']);
const SEASONS = ['winter','spring','summer','autumn'];
const SEASON_NAMES = {spring:'春天',summer:'夏天',autumn:'秋天',winter:'冬天'};
const PHASE_NAMES = {morning:'清晨',day:'白天',evening:'傍晚',night:'夜晚'};
const WEATHER_NAMES = {clear:'晴',cloud:'多云',rain:'雨',snow:'雪',fog:'雾',storm:'雷雨',unknown:'天气暂无'};
const WEATHER_EFFECTS = new Set(['auto','clear','cloud','rain','snow','fog','storm']);
const ART = {
  spring:{src:'./assets/hero-v3/summer-hanok-web.jpg',mobile:'./assets/hero-v3/summer-hanok-mobile.jpg',key:'hanok',source:'Hanok Wallpaper'},
  summer:{src:'./assets/hero-v3/summer-hanok-web.jpg',mobile:'./assets/hero-v3/summer-hanok-mobile.jpg',key:'hanok',source:'Hanok Wallpaper'},
  autumn:{src:'./assets/hero-v3/autumn-bbq-web.jpg',mobile:'./assets/hero-v3/autumn-bbq-mobile.jpg',key:'bbq',source:'BBQ Party Wallpaper'},
  winter:{src:'./assets/hero-v3/winter-snow-web.jpg',mobile:'./assets/hero-v3/winter-snow-mobile.jpg',key:'snow',source:'Merry Christmas Wallpaper'},
};
// Only complete, matching landscape/portrait pairs enter the random cover pool.
const COVER_ART = [ART.summer, ART.autumn, ART.winter];
const PREVIOUS_COVER = 'slow-notes-previous-cover';
const heroCovers = new WeakMap();
let previousCover;
let mounted = false, observer, timer, lastSignature = '';
const finite = Number.isFinite;
const rad = value => value * Math.PI / 180;
const read = (key, fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const validCity = city => city && finite(city.latitude) && Math.abs(city.latitude)<=90 && finite(city.longitude) && Math.abs(city.longitude)<=180;
const cityKey = city => `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;

/** Uniform choice among the other scenes; refreshes remember the previous cover. */
export function chooseCoverArt(previousKey, random = Math.random) {
  const choices = COVER_ART.filter(art => art.key !== previousKey);
  return choices[Math.floor(random() * choices.length)];
}

function coverFor(hero, state, context) {
  const signature = [state.season,state.phase,state.condition,state.weatherEffect,
    state.city,context.city.latitude,context.city.longitude,context.theme,context.themeMode].join('|');
  const existing = heroCovers.get(hero);
  if(existing?.signature === signature) return existing.art;
  if(previousCover === undefined) {
    try {previousCover = sessionStorage.getItem(PREVIOUS_COVER);} catch {previousCover = null;}
  }
  const art = chooseCoverArt(previousCover);
  previousCover = art.key;
  try {sessionStorage.setItem(PREVIOUS_COVER, art.key);} catch { /* In-memory fallback. */ }
  heroCovers.set(hero, {signature, art});
  return art;
}

/** Calendar seasons; the southern hemisphere is shifted by six months. */
export function seasonAt(date = new Date(), latitude = 30.2741, timeZone = TZ) {
  let month;
  try {month=Number(new Intl.DateTimeFormat('en',{month:'numeric',timeZone}).format(date));}
  catch {month=date.getUTCMonth()+1;}
  const season=SEASONS[Math.floor((month%12)/3)];
  return latitude<0 ? {winter:'summer',spring:'autumn',summer:'winter',autumn:'spring'}[season] : season;
}

/** Approximate solar position, used only when today's API sunrise/sunset is absent.
 * NOAA equations: https://gml.noaa.gov/grad/solcalc/solareqns.PDF */
export function solarPhase(date = new Date(), latitude = 30.2741, longitude = 120.1551) {
  const year=date.getUTCFullYear(), days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
  const day=(date.getTime()-Date.UTC(year,0,1))/86400000;
  const gamma=2*Math.PI/days*(day-.5);
  const eqtime=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
  const decl=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
  const minutes=date.getUTCHours()*60+date.getUTCMinutes()+date.getUTCSeconds()/60;
  const solarMinutes=((minutes+eqtime+4*longitude)%1440+1440)%1440;
  const angle=rad(solarMinutes/4-180);
  const elevation=Math.asin(Math.max(-1,Math.min(1,Math.sin(rad(latitude))*Math.sin(decl)+Math.cos(rad(latitude))*Math.cos(decl)*Math.cos(angle))))*180/Math.PI;
  if(elevation < -6) return 'night';
  if(elevation < 16) return solarMinutes < 720 ? 'morning' : 'evening';
  return 'day';
}

function weatherEpoch(value, offset) {
  if(typeof value!=='string') return NaN;
  if(/[zZ]$|[+-]\d\d:\d\d$/.test(value)) return Date.parse(value);
  return Date.parse(`${value}Z`)-offset*1000;
}

export function daylightPhase(date, city = DEFAULT_CITY, weather = null) {
  const offset=finite(weather?.utc_offset_seconds) ? weather.utc_offset_seconds : 8*3600;
  const day=new Date(date.getTime()+offset*1000).toISOString().slice(0,10);
  const index=weather?.daily?.time?.indexOf(day) ?? -1;
  const rise=weatherEpoch(weather?.daily?.sunrise?.[index],offset);
  const set=weatherEpoch(weather?.daily?.sunset?.[index],offset);
  if(index>=0 && finite(rise) && finite(set) && rise<set) {
    const time=date.getTime(), minute=60000;
    if(time<rise-45*minute || time>=set+45*minute) return {phase:'night',source:'sunrise-sunset'};
    if(time<rise+85*minute) return {phase:'morning',source:'sunrise-sunset'};
    if(time>=set-90*minute) return {phase:'evening',source:'sunrise-sunset'};
    return {phase:'day',source:'sunrise-sunset'};
  }
  return {phase:solarPhase(date,city.latitude,city.longitude),source:'solar-estimate'};
}

/** A visual preview never changes the observed weather condition. */
export function resolveWeatherEffect(condition = 'unknown', effect = 'auto') {
  const actualCondition=CONDITIONS.has(condition) ? condition : 'unknown';
  const weatherEffect=WEATHER_EFFECTS.has(effect) ? effect : 'auto';
  const weatherMode=weatherEffect==='auto' ? 'auto' : 'preview';
  return {actualCondition,weatherEffect,weatherMode,condition:weatherMode==='auto'?actualCondition:weatherEffect};
}

/** Pure state selection is exported for deterministic date/weather verification. */
export function deriveSceneState({date=new Date(),city=DEFAULT_CITY,weather=null,condition='unknown',weatherEffect='auto',theme=null,themeMode='auto',timeOfDay=null} = {}) {
  if(!(date instanceof Date) || !finite(date.getTime())) throw new TypeError('场景时间必须是有效日期');
  if(!validCity(city)) city=DEFAULT_CITY;
  const season=seasonAt(date,city.latitude,city.timezone || TZ);
  const daylight=daylightPhase(date,city,weather);
  let phase=daylight.phase, phaseSource=daylight.source;
  // Manual appearance is an explicit user choice; automatic mode follows location daylight.
  if(themeMode==='manual' && (theme==='dark'||theme==='light')) {
    phase=theme==='dark' ? 'night' : PHASES.has(timeOfDay)&&timeOfDay!=='night' ? timeOfDay : 'day';
    phaseSource='manual-theme';
  }
  const effect=resolveWeatherEffect(condition,weatherEffect), kind=effect.condition;
  const art=ART[season];
  return {season,phase,...effect,city:typeof city.name==='string'?city.name:'所选城市',latitude:city.latitude,phaseSource,art,
    label:`${SEASON_NAMES[season]} · ${PHASE_NAMES[phase]} · ${WEATHER_NAMES[kind]}`};
}

function particles(kind,count) {
  return Array.from({length:count},(_,i)=>`<i class="scene-${kind}" style="--x:${(i*37+11)%100};--delay:${-(i*1.17)%12}s;--duration:${kind==='drop'?1.1+(i%5)*.16:8+(i%7)}s;--size:${3+i%5}px"></i>`).join('');
}
function ensureLayers(hero) {
  if(hero.querySelector('.scene-effects')) return;
  const effects=document.createElement('div');effects.className='scene-effects';effects.setAttribute('aria-hidden','true');
  effects.innerHTML=`<div class="scene-clouds"></div><div class="scene-sunlight"></div><div class="scene-haze"></div><div class="scene-rain">${particles('drop',24)}</div><div class="scene-snow">${particles('flake',22)}</div><div class="scene-season-particles">${particles('leaf',9)}</div><div class="scene-puddles"></div><div class="scene-lightning"></div>`;
  hero.append(effects);
  const status=document.createElement('p');status.className='scene-description';status.id='scene-description';hero.append(status);
  const described=new Set((hero.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));described.add(status.id);hero.setAttribute('aria-describedby',[...described].join(' '));

}

function currentContext() {
  const root=document.documentElement;
  const storedCity=read('slow-notes-weather-city',DEFAULT_CITY);
  const city=validCity(storedCity)?storedCity:DEFAULT_CITY;
  const cache=read('slow-notes-weather-cache',null);
  const weather=cache?.key===cityKey(city) && finite(cache.at) && Date.now()-cache.at<24*3600000 ? cache.data : null;
  return {city,weather,condition:root.dataset.weatherCondition,weatherEffect:root.dataset.weatherEffect ?? read('slow-notes-weather-effect','auto'),theme:root.dataset.theme,themeMode:root.dataset.themeMode,timeOfDay:root.dataset.timeOfDay};
}

/** Call after rendering the homepage. Safe to call repeatedly on every route. */
export function syncScene() {
  if(typeof document==='undefined') return null;
  const context=currentContext();
  const state=deriveSceneState(context);
  const root=document.documentElement;
  root.dataset.sceneSeason=state.season;root.dataset.scenePhase=state.phase;root.dataset.sceneWeather=state.condition;
  root.dataset.sceneActualWeather=state.actualCondition;root.dataset.sceneWeatherMode=state.weatherMode;
  const hero=document.querySelector('.island-hero');
  if(!hero) return state;
  ensureLayers(hero);
  state.art=coverFor(hero,state,context);
  const signature=[state.season,state.phase,state.condition,state.actualCondition,state.weatherMode,state.city,state.phaseSource,state.art.key].join('|');
  if(lastSignature===signature && hero.dataset.sceneSignature===signature) return state;
  lastSignature=signature;hero.dataset.sceneSignature=signature;
  hero.dataset.sceneSeason=state.season;hero.dataset.scenePhase=state.phase;hero.dataset.sceneWeather=state.condition;
  hero.dataset.sceneActualWeather=state.actualCondition;hero.dataset.sceneWeatherMode=state.weatherMode;
  hero.dataset.sceneSource=state.phaseSource;
  const description=hero.querySelector('.scene-description');
  description.textContent=`${state.city}，${state.label}。${state.weatherMode==='preview'?`天气效果为手动预览，实况为${WEATHER_NAMES[state.actualCondition]}。`:'天气效果跟随实况。'}${state.phaseSource==='manual-theme'?'日夜外观使用手动选择。':'日夜随所在地日照变化。'}背景使用 JOGUMAN 官方完整插画，雨雪与雾的动态效果由本站制作。`;
  hero.dataset.sceneArt=state.art.key;
  root.dataset.sceneArt=state.art.key;
  const picture=hero.querySelector('.hero-official');
  if(picture) {
    const img=picture.querySelector('img'), source=picture.querySelector('source');
    if(source.getAttribute('srcset')!==state.art.mobile) source.srcset=state.art.mobile;
    if(img.getAttribute('src')!==state.art.src) img.src=state.art.src;
    img.alt='布拉吉奥和朋友们的日常，JOGUMAN 官方插画';
  }
  document.dispatchEvent(new CustomEvent('slow-scene-change',{detail:state}));
  return state;
}

export function mountScene() {
  if(mounted) return syncScene();
  mounted=true;
  observer=new MutationObserver(()=>syncScene());
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-time-of-day','data-weather-condition','data-weather-effect','data-theme','data-theme-mode']});
  document.addEventListener('slow-weather-effect-change',()=>syncScene());
  window.addEventListener('hashchange',()=>requestAnimationFrame(()=>syncScene()));
  window.addEventListener('storage',event=>{if(!event.key || ['slow-notes-weather-city','slow-notes-weather-cache','slow-notes-weather-effect','slow-notes-theme'].includes(event.key)) syncScene();});
  document.addEventListener('visibilitychange',()=>{document.documentElement.dataset.scenePaused=String(document.hidden);if(!document.hidden) syncScene();});
  timer=setInterval(()=>{if(!document.hidden) syncScene();},60000);
  window.addEventListener('pagehide',event=>{if(!event.persisted){observer?.disconnect();clearInterval(timer);}});
  return syncScene();
}
