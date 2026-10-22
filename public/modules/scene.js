// Original JOGUMAN artwork, composed with site-owned season and weather effects.
// No character image is redrawn or recolored. See assets/scenery/SOURCES-scene.md.
const DEFAULT_CITY = {name:'杭州', latitude:30.2741, longitude:120.1551};
const TZ = 'Asia/Shanghai';
const CONDITIONS = new Set(['clear','cloud','rain','snow','fog','storm','unknown']);
const PHASES = new Set(['morning','day','evening','night']);
const SEASONS = ['winter','spring','summer','autumn'];
const SEASON_NAMES = {spring:'春天',summer:'夏天',autumn:'秋天',winter:'冬天'};
const PHASE_NAMES = {morning:'清晨',day:'白天',evening:'傍晚',night:'夜晚'};
const WEATHER_NAMES = {clear:'晴',cloud:'多云',rain:'雨',snow:'雪',fog:'雾',storm:'雷雨',unknown:'天气暂无'};
const ART = {
  spring:{src:'./assets/lucky-official.jpg',title:'春天的小幸运',source:'Lucky Brachio Wallpaper'},
  summer:{src:'./assets/scenery/summer-hanok-art.jpg',title:'吃一片夏天的西瓜',source:'Hanok Wallpaper'},
  autumn:{src:'./assets/scenery/autumn-bbq-official.jpg',title:'秋日，和朋友坐在一起',source:'BBQ Party Wallpaper'},
  winter:{src:'./assets/scenery/winter-christmas-official.jpg',title:'冬日的小小祝福',source:'Merry Christmas Wallpaper'},
  night:{src:'./assets/scenery/night-guitar-official.jpg',title:'月亮出来，慢慢晚安',source:'Late Night Guitar Wallpaper'},
};
let mounted = false, observer, timer, lastSignature = '', postcardEnabled = true;
const finite = Number.isFinite;
const rad = value => value * Math.PI / 180;
const read = (key, fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const validCity = city => city && finite(city.latitude) && Math.abs(city.latitude)<=90 && finite(city.longitude) && Math.abs(city.longitude)<=180;
const cityKey = city => `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;

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

/** Pure state selection is exported for deterministic date/weather verification. */
export function deriveSceneState({date=new Date(),city=DEFAULT_CITY,weather=null,condition='unknown',theme=null,themeMode='auto',timeOfDay=null} = {}) {
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
  const kind=CONDITIONS.has(condition) ? condition : 'unknown';
  const art=phase==='night' ? ART.night : ART[season];
  return {season,phase,condition:kind,city:typeof city.name==='string'?city.name:'所选城市',latitude:city.latitude,phaseSource,art,
    label:`${SEASON_NAMES[season]} · ${PHASE_NAMES[phase]} · ${WEATHER_NAMES[kind]}`};
}

function particles(kind,count) {
  return Array.from({length:count},(_,i)=>`<i class="scene-${kind}" style="--x:${(i*37+11)%100};--delay:${-(i*1.17)%12}s;--duration:${kind==='drop'?1.1+(i%5)*.16:8+(i%7)}s;--size:${3+i%5}px"></i>`).join('');
}
function ensureLayers(hero) {
  if(hero.querySelector('.scene-effects')) return;
  const effects=document.createElement('div');effects.className='scene-effects';effects.setAttribute('aria-hidden','true');
  effects.innerHTML=`<div class="scene-haze"></div><div class="scene-rain">${particles('drop',24)}</div><div class="scene-snow">${particles('flake',22)}</div><div class="scene-season-particles">${particles('leaf',9)}</div><div class="scene-puddles"></div>`;
  hero.append(effects);
  const status=document.createElement('p');status.className='scene-description';status.id='scene-description';hero.append(status);
  const described=new Set((hero.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));described.add(status.id);hero.setAttribute('aria-describedby',[...described].join(' '));
  if(postcardEnabled) {
    const card=document.createElement('figure');card.className='scene-postcard';
    card.innerHTML='<img alt="" decoding="async"><figcaption></figcaption><span class="scene-postcard-tape" aria-hidden="true"></span>';
    hero.append(card);
  }
}

function currentContext() {
  const root=document.documentElement;
  const storedCity=read('slow-notes-weather-city',DEFAULT_CITY);
  const city=validCity(storedCity)?storedCity:DEFAULT_CITY;
  const cache=read('slow-notes-weather-cache',null);
  const weather=cache?.key===cityKey(city) && finite(cache.at) && Date.now()-cache.at<24*3600000 ? cache.data : null;
  return {city,weather,condition:root.dataset.weatherCondition,theme:root.dataset.theme,themeMode:root.dataset.themeMode,timeOfDay:root.dataset.timeOfDay};
}

/** Call after rendering the homepage. Safe to call repeatedly on every route. */
export function syncScene() {
  if(typeof document==='undefined') return null;
  const state=deriveSceneState(currentContext());
  const root=document.documentElement;
  root.dataset.sceneSeason=state.season;root.dataset.scenePhase=state.phase;root.dataset.sceneWeather=state.condition;
  const hero=document.querySelector('.island-hero');
  if(!hero) return state;
  ensureLayers(hero);
  const signature=[state.season,state.phase,state.condition,state.city,state.phaseSource].join('|');
  if(lastSignature===signature && hero.dataset.sceneSignature===signature) return state;
  lastSignature=signature;hero.dataset.sceneSignature=signature;
  hero.dataset.sceneSeason=state.season;hero.dataset.scenePhase=state.phase;hero.dataset.sceneWeather=state.condition;
  hero.dataset.sceneSource=state.phaseSource;
  const description=hero.querySelector('.scene-description');
  description.textContent=`${state.city}，${state.label}。${state.phaseSource==='manual-theme'?'日夜外观使用手动选择。':'日夜随所在地日照变化。'}画面由 JOGUMAN 官方原图组合，季节色彩与天气动态由本站制作。`;
  const card=hero.querySelector('.scene-postcard');
  if(card) {
    const img=card.querySelector('img');if(img.getAttribute('src')!==state.art.src) img.src=state.art.src;
    img.alt=`JOGUMAN 官方插画：${state.art.source}`;
    card.querySelector('figcaption').textContent=state.art.title;
    card.title=`${state.label} · 插画 © JOGUMAN`;
  }
  document.dispatchEvent(new CustomEvent('slow-scene-change',{detail:state}));
  return state;
}

export function mountScene({postcard=true} = {}) {
  postcardEnabled=postcard;
  if(mounted) return syncScene();
  mounted=true;
  observer=new MutationObserver(()=>syncScene());
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-time-of-day','data-weather-condition','data-theme','data-theme-mode']});
  window.addEventListener('hashchange',()=>requestAnimationFrame(()=>syncScene()));
  window.addEventListener('storage',event=>{if(!event.key || ['slow-notes-weather-city','slow-notes-weather-cache','slow-notes-theme'].includes(event.key)) syncScene();});
  document.addEventListener('visibilitychange',()=>{document.documentElement.dataset.scenePaused=String(document.hidden);if(!document.hidden) syncScene();});
  timer=setInterval(()=>{if(!document.hidden) syncScene();},60000);
  window.addEventListener('pagehide',event=>{if(!event.persisted){observer?.disconnect();clearInterval(timer);}});
  return syncScene();
}
