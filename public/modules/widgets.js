// Browser-only companions. Weather dates and the calendar use Asia/Shanghai.
const TZ = 'Asia/Shanghai';
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Preferences remain usable without storage. */ } };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const temp = value => finite(value) ? `${Math.round(value)}°` : '—';
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({close:'<path d="m6 6 12 12M6 18 18 6"/>',left:'<path d="m14 5-7 7 7 7"/>',right:'<path d="m10 5 7 7-7 7"/>',play:'<path d="m9 5 11 7-11 7Z" fill="currentColor"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',prev:'<path d="M5 5v14m14-14L7 12l12 7Z"/>',next:'<path d="M19 5v14M5 5l12 7-12 7Z"/>',list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',volume:'<path d="m11 5-6 4H2v6h3l6 4Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18m-13 5h2m4 0h2"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',cloud:'<path d="M5 18a4 4 0 0 1-.6-8 7 7 0 0 1 13.4-1A4.5 4.5 0 1 1 19 18Z"/>',rain:'<path d="M5 15a4 4 0 0 1-.6-8 7 7 0 0 1 13.4 0A4 4 0 0 1 19 15M7 18l-1 3m6-3-1 3m6-3-1 3"/>',snow:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>',fog:'<path d="M4 8h16M2 12h20M5 16h14M8 20h8"/>',storm:'<path d="M4 14a4 4 0 0 1 .4-7 7 7 0 0 1 13.4 0A4 4 0 0 1 20 14M13 11l-5 7h5l-2 5 7-8h-6Z"/>',note:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>'})[name] || '<circle cx="12" cy="12" r="8"/><path d="M12 7v6m0 4h.01"/>'}</svg>`;

let mounted = false, articlePosts = [], siteName = '慢慢来';
let clockTimer, refreshTimer;
const defaultCity = { name:'杭州', latitude:30.2741, longitude:120.1551, country:'中国' };
const validCity = value => value && typeof value.name === 'string' && value.name.length < 90 && finite(value.latitude) && Math.abs(value.latitude) <= 90 && finite(value.longitude) && Math.abs(value.longitude) <= 180;
let city = read('slow-notes-weather-city', defaultCity);
if (!validCity(city)) city = defaultCity;
let weather = null, weatherLoading = false, weatherError = '', weatherController = null, citySearchController = null;
let selectedDate = '', calendarMonth = '', cachedAt = 0;
let sessionTheme = null, sessionAutoTheme = false;
const cityKey = value => `${value.latitude.toFixed(4)},${value.longitude.toFixed(4)}`;

export function clockParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).formatToParts(date).map(p => [p.type,p.value]));
  const hour = Number(parts.hour);
  return {...parts, date:`${parts.year}-${parts.month}-${parts.day}`, time:`${parts.hour}:${parts.minute}`, theme:hour >= 19 || hour < 5 ? 'dark' : 'light'};
}
export function calendarMonthData(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new RangeError('月份格式应为 YYYY-MM');
  const [year,month] = value.split('-').map(Number);
  if (year < 1900 || year > 2100) throw new RangeError('日历支持 1900 至 2100 年');
  return {year,month,offset:(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,count:new Date(Date.UTC(year,month,0)).getUTCDate()};
}
export function shiftCalendarMonth(value, direction) {
  const {year,month} = calendarMonthData(value);
  if (!Number.isInteger(direction)) throw new RangeError('月份偏移应为整数');
  const serial = Math.min(2100*12+11,Math.max(1900*12,year*12+month-1+direction));
  return `${Math.floor(serial/12)}-${String(serial%12+1).padStart(2,'0')}`;
}
function themePreference() {
  if (sessionAutoTheme) return null;
  try {
    const stored = localStorage.getItem('slow-notes-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* A manual choice can still apply to this page without storage. */ }
  return sessionTheme;
}
function syncDayNight(now) {
  const preference = themePreference(), automatic = !preference;
  const theme = preference || now.theme;
  if (document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
    document.dispatchEvent(new CustomEvent('slow-theme-change',{detail:{theme,mode:automatic?'auto':'manual'}}));
  }
  document.documentElement.dataset.themeMode = automatic ? 'auto' : 'manual';
  const label = $('#sn-theme-mode');
  if (label) label.textContent = automatic ? '自动 · 随日夜变化' : `手动 · ${document.documentElement.dataset.theme === 'dark' ? '夜间' : '日间'}模式`;
  const button = $('[data-follow-day-night]');
  if (button) button.setAttribute('aria-pressed',String(automatic));
}
function syncClock() {
  const now = clockParts();
  syncDayNight(now);
  const weekday = new Intl.DateTimeFormat('zh-CN', {timeZone:TZ, weekday:'long'}).format(new Date());
  document.querySelectorAll('[data-clock-time]').forEach(el => { el.textContent = now.time; });
  document.querySelectorAll('[data-clock-date]').forEach(el => { el.textContent = `${Number(now.month)}月${Number(now.day)}日 ${weekday}`; });
  document.querySelectorAll('[data-clock-full]').forEach(el => { el.textContent = `${now.date} ${now.time}:${now.second}`; });
  const hour = Number(now.hour);
  document.documentElement.dataset.timeOfDay = hour >= 5 && hour < 9 ? 'morning' : hour >= 9 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'evening' : 'night';
}
function weatherDescription(code) {
  if (!finite(code)) return {label:'天气暂无', kind:'unknown', icon:'cloud'};
  if (code === 0) return {label:'晴',kind:'clear',icon:'sun'};
  if (code <= 3) return {label:code === 3 ? '阴' : '多云',kind:'cloud',icon:'cloud'};
  if (code <= 48) return {label:'雾',kind:'fog',icon:'fog'};
  if (code >= 95) return {label:'雷雨',kind:'storm',icon:'storm'};
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return {label:'雪',kind:'snow',icon:'snow'};
  return {label:code >= 80 ? '阵雨' : '雨',kind:'rain',icon:'rain'};
}
function syncWeather() {
  const description = weatherDescription(weather?.current?.weather_code);
  document.querySelectorAll('[data-weather-city]').forEach(el => { el.textContent = city.name; });
  document.querySelectorAll('[data-weather-temp]').forEach(el => { el.textContent = temp(weather?.current?.temperature_2m); });
  document.querySelectorAll('[data-weather-label]').forEach(el => { el.textContent = weather ? `${description.label}${weatherError ? ' · 缓存' : ''}` : weatherLoading ? '获取中' : '天气暂无'; });
  document.querySelectorAll('[data-weather-icon]').forEach(el => { el.innerHTML = icon(description.icon); });
  document.documentElement.dataset.weatherCondition = description.kind;
  const toggle = $('#weather-toggle');
  if (toggle) toggle.setAttribute('aria-label', `${city.name} ${weather ? `${temp(weather.current.temperature_2m)} ${description.label}` : '天气暂无'}，打开天气与时间`);
}
function panelShell(id, eyebrow, title, body, character) {
  return `<dialog id="${id}" class="sn-widget" aria-labelledby="${id}-title"><div class="sn-widget-heading"><div><small>${eyebrow}</small><h2 id="${id}-title">${title}</h2></div><button type="button" class="sn-round-button" data-widget-close aria-label="关闭${title}">${icon('close')}</button></div>${character ? `<img class="sn-widget-character" src="./assets/${character}.png" alt="" width="52" height="60">` : ''}${body}</dialog>`;
}
function showDialog(id, trigger) {
  document.querySelectorAll('.sn-widget[open]').forEach(el => el.close());
  const dialog = $(`#${id}`);
  if (dialog && !dialog.open) {
    dialog.returnTarget = trigger?.closest('.sn-widget')?.returnTarget || trigger;
    dialog.showModal();
  }
  syncWidgetTriggers();
}
function syncWidgetTriggers() {
  for (const [selector,id] of [['#weather-toggle','sn-weather'],['#music-toggle','sn-music'],['[data-open-calendar]','sn-calendar']]) {
    document.querySelectorAll(selector).forEach(el => { el.setAttribute('aria-haspopup','dialog'); el.setAttribute('aria-controls',id); el.setAttribute('aria-expanded',String(Boolean($(`#${id}`)?.open))); });
  }
}
async function fetchJSON(url, controller) {
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {signal:controller.signal, credentials:'omit'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
function validWeather(data) {
  return data && finite(data.current?.temperature_2m) && finite(data.current?.weather_code) && Array.isArray(data.daily?.time);
}
async function fetchWeather() {
  weatherController?.abort();
  const controller = new AbortController();
  weatherController = controller;
  weatherLoading = true; weatherError = '';
  syncWeather(); renderWeather();
  const params = new URLSearchParams({latitude:String(city.latitude),longitude:String(city.longitude),current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',timezone:TZ,forecast_days:'7'});
  try {
    const result = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`, controller);
    if (weatherController !== controller) return;
    if (!validWeather(result)) throw new Error('无天气数据');
    weather = result; cachedAt = Date.now();
    save('slow-notes-weather-cache', {key:cityKey(city),data:weather,at:cachedAt});
  } catch {
    if (weatherController !== controller) return;
    weatherError = weather ? '暂时无法更新，以下为上次获取的天气。' : '天气暂时没有送达。可以稍后重试，或换一个城市。';
  } finally {
    if (weatherController === controller) {
      weatherLoading = false; syncWeather(); renderWeather();
      if ($('#sn-calendar')?.open) renderCalendar();
    }
  }
}
function forecastHTML() {
  if (!weather?.daily?.time?.length) return `<p class="sn-soft-message">${weatherLoading ? '预报正在路上…' : '暂时没有天气预报。'}</p>`;
  return `<div class="sn-forecast-list">${weather.daily.time.map((date,index) => `<button type="button" data-forecast-date="${esc(date)}" aria-label="查看${esc(date)}的日历"><small>${date.slice(5).replace('-','/')}</small>${icon(weatherDescription(weather.daily.weather_code?.[index]).icon,23)}<span>${weatherDescription(weather.daily.weather_code?.[index]).label}</span><b>${temp(weather.daily.temperature_2m_min?.[index])} / ${temp(weather.daily.temperature_2m_max?.[index])}</b></button>`).join('')}</div>`;
}
function renderWeather() {
  const container = $('#sn-weather-readings');
  if (!container) return;
  const reading = weather?.current;
  const description = weatherDescription(reading?.weather_code);
  const updated = cachedAt ? new Intl.DateTimeFormat('zh-CN',{timeZone:TZ,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(cachedAt) : '';
  container.innerHTML = `<div class="sn-weather-now"><span class="sn-weather-picture">${icon(description.icon,54)}</span><div><span class="sn-weather-city">${esc(city.name)} <small>参考城市 · 可更换</small></span><strong>${temp(reading?.temperature_2m)}<small>${reading ? description.label : weatherLoading ? '获取中' : '暂无数据'}</small></strong></div></div><div class="sn-weather-metrics"><span>体感<b>${temp(reading?.apparent_temperature)}</b></span><span>湿度<b>${finite(reading?.relative_humidity_2m) ? `${reading.relative_humidity_2m}%` : '—'}</b></span><span>风速<b>${finite(reading?.wind_speed_10m) ? `${Math.round(reading.wind_speed_10m)} km/h` : '—'}</b></span></div>${weatherError ? `<p class="sn-widget-error" role="status">${weatherError}</p>` : ''}<div class="sn-weather-update"><small>${updated ? `${updated} 更新 · 北京时间` : '数据来自 Open-Meteo'}</small><button type="button" class="sn-text-button" data-refresh-weather ${weatherLoading ? 'disabled' : ''}>${weatherLoading ? '更新中…' : '重新获取'}</button></div><div class="sn-section-label"><b>未来 7 天</b><small>点日期，翻翻日历</small></div>${forecastHTML()}`;
}
function pickCity(next) {
  if (!validCity(next)) return;
  city = next; weather = null; cachedAt = 0;
  save('slow-notes-weather-city', city);
  $('#sn-city-results').innerHTML = '<p class="sn-soft-message">城市已经换好。</p>';
  fetchWeather();
}
async function searchCity(event) {
  event.preventDefault();
  const query = $('#sn-city-input').value.trim();
  if (query.length < 2) { $('#sn-city-results').innerHTML='<p class="sn-soft-message">请写下至少两个字的城市名。</p>'; return; }
  citySearchController?.abort();
  const controller = new AbortController(); citySearchController = controller;
  $('#sn-city-results').innerHTML='<p class="sn-soft-message" role="status">正在找这个地方…</p>';
  try {
    const data = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({name:query,count:'5',language:'zh',format:'json'})}`,controller);
    if (citySearchController !== controller) return;
    const results = (data.results || []).filter(validCity);
    const target = $('#sn-city-results'); target.replaceChildren();
    if (!results.length) { target.innerHTML='<p class="sn-soft-message" role="status">还没找到，可以试试城市拼音或英文名。</p>'; return; }
    for (const result of results) {
      const button = document.createElement('button'); button.type = 'button';
      button.innerHTML = `<b>${esc(result.name)}</b><small>${esc([result.admin1,result.country].filter(Boolean).join(' · '))}</small>${icon('right',16)}`;
      button.addEventListener('click',()=>pickCity({name:result.name,latitude:result.latitude,longitude:result.longitude,country:result.country || ''}));
      target.append(button);
    }
  } catch {
    if (citySearchController === controller) $('#sn-city-results').innerHTML='<p class="sn-widget-error" role="status">城市搜索暂时不可用，请稍后重试。</p>';
  }
}
function lunarDate(date, short = false) {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese',{month:'long',day:'numeric',timeZone:TZ}).formatToParts(new Date(`${date}T12:00:00+08:00`));
    const month = parts.find(p=>p.type==='month')?.value || '';
    const day = Number(parts.find(p=>p.type==='day')?.value);
    const names = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
    return short ? day === 1 ? month : names[day] || '' : `${month}${names[day] || ''}`;
  } catch { return ''; }
}
function openCalendar(trigger, date = clockParts().date) {
  selectedDate = date; calendarMonth = date.slice(0,7); renderCalendar();
  showDialog('sn-calendar',trigger);
}
function renderCalendar() {
  if (!calendarMonth) return;
  const {year,month,offset,count} = calendarMonthData(calendarMonth);
  const today = clockParts().date;
  $('#sn-calendar-title').textContent = `${year} 年 ${month} 月`;
  $('#sn-calendar-grid').innerHTML = `${'<span aria-hidden="true"></span>'.repeat(offset)}${Array.from({length:count},(_,index)=>{
    const date = `${calendarMonth}-${String(index+1).padStart(2,'0')}`;
    const hasPosts = articlePosts.some(post=>post.date?.slice(0,10)===date);
    return `<button type="button" data-calendar-date="${date}" aria-pressed="${date===selectedDate}" ${date===today ? 'aria-current="date"' : ''} aria-label="${date} ${lunarDate(date)}${hasPosts ? '，有手记' : ''}" class="${hasPosts ? 'has-posts' : ''}"><b>${index+1}</b><small>${lunarDate(date,true)}</small>${hasPosts ? '<i aria-hidden="true"></i>' : ''}</button>`;
  }).join('')}`;
  $('[data-calendar-month="-1"]').disabled=calendarMonth==='1900-01';
  $('[data-calendar-month="1"]').disabled=calendarMonth==='2100-12';
  const dayPosts = articlePosts.filter(post=>post.date?.slice(0,10)===selectedDate);
  const forecastIndex = weather?.daily?.time?.indexOf(selectedDate) ?? -1;
  const daily=weather?.daily;
  $('#sn-calendar-detail').innerHTML = `<strong>${selectedDate} <span>${lunarDate(selectedDate)}</span></strong><p>${forecastIndex<0 ? '这一天暂无天气预报' : `${esc(city.name)} · ${weatherDescription(daily.weather_code?.[forecastIndex]).label} · ${temp(daily.temperature_2m_min?.[forecastIndex])}～${temp(daily.temperature_2m_max?.[forecastIndex])} · 降水 ${finite(daily.precipitation_probability_max?.[forecastIndex]) ? `${daily.precipitation_probability_max[forecastIndex]}%` : '暂无'}`}</p><div class="sn-calendar-articles">${dayPosts.length ? dayPosts.map(post=>`<a href="#/post/${encodeURIComponent(post.slug)}">${icon('note',15)} ${esc(post.title)} ${icon('right',14)}</a>`).join('') : '<small>这一天还没有手记，留给新的小故事。</small>'}</div>`;
  $('#sn-calendar-forecast').innerHTML=forecastHTML();
  $('#sn-calendar-city').textContent=`${city.name} · 未来 7 天`;
}

// Two original, procedurally composed miniatures. No downloaded recordings.
const tracks = [
  {title:'草地上的慢动作',artist:'原创合成轻音乐 · 01',cover:'./assets/brachio.png',composition:0},
  {title:'金子的午后梦',artist:'原创合成轻音乐 · 02',cover:'./assets/woody.png',composition:1},
];
let trackIndex=0, audio, trackRequest=0, generating=false, playMode=read('slow-notes-music-mode','all');
if (!['all','one','shuffle'].includes(playMode)) playMode='all';
const modeLabels={all:'列表循环',one:'单曲循环',shuffle:'随机播放'};
const generated = new Map(), importedURLs = [];
const timeLabel = value => `${Math.floor((Number.isFinite(value) ? value : 0)/60)}:${String(Math.floor((Number.isFinite(value) ? value : 0)%60)).padStart(2,'0')}`;
function encodeWAV(buffer) {
  const samples=buffer.getChannelData(0), bytes=new ArrayBuffer(44+samples.length*2), view=new DataView(bytes);
  const text=(offset,value)=>{for(let i=0;i<value.length;i++) view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+samples.length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++) view.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);
  return URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
}
async function composeTrack(index) {
  if (generated.has(index)) return generated.get(index);
  const promise = (async()=>{
    const OfflineContext=window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) throw new Error('当前浏览器不支持合成音乐，可导入本地音频。');
    const beat=index===0 ? 60/76 : 60/68, length=16*4*beat+4;
    const context=new OfflineContext(1,Math.ceil(length*22050),22050);
    const master=context.createGain();master.gain.value=.48;master.connect(context.destination);
    const delay=context.createDelay(2);delay.delayTime.value=beat*.75;
    const echo=context.createGain();echo.gain.value=.22;delay.connect(echo);echo.connect(master);
    const note=(midi,start,duration,amplitude=.15,type='sine')=>{
      const oscillator=context.createOscillator(), envelope=context.createGain();
      oscillator.type=type;oscillator.frequency.value=440*Math.pow(2,(midi-69)/12);
      envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(amplitude,start+.025);envelope.gain.exponentialRampToValueAtTime(.001,start+duration);
      oscillator.connect(envelope);envelope.connect(master);envelope.connect(delay);oscillator.start(start);oscillator.stop(start+duration+.03);
    };
    const chords=index===0 ? [[48,55,59,64],[45,52,55,60],[50,57,60,65],[43,50,57,62]] : [[53,60,64,69],[48,55,62,67],[50,57,60,65],[45,52,59,64]];
    const melody=index===0 ? [76,74,71,67,69,72,76,74,77,76,72,69,74,71,67,69] : [81,76,79,72,74,76,71,67,77,74,72,69,71,76,74,69];
    for(let bar=0;bar<16;bar++) {
      const start=bar*4*beat, chord=chords[bar%4];
      note(chord[0]-12,start,beat*3.7,.13);
      for(let step=0;step<8;step++) note(chord[[0,2,1,3,2,1,3,2][step]]+12,start+step*beat/2,beat*1.5,.085,'triangle');
      note(melody[bar],start+beat*.5,beat*2.4,.15);
      if(bar%2===0) note(melody[(bar+3)%16],start+beat*2.8,beat*1.4,.085);
    }
    return encodeWAV(await context.startRendering());
  })();
  generated.set(index,promise);
  try { return await promise; } catch(error) { generated.delete(index); throw error; }
}
function musicStatus(message='') { $('#sn-music-status').textContent=message; }
function syncMusic() {
  if (!audio) return;
  const playing=!audio.paused && !audio.ended;
  $('#sn-music-play').innerHTML=icon(playing?'pause':'play',23);
  $('#sn-music-play').setAttribute('aria-label',playing?'暂停音乐':'播放音乐');
  $('#sn-music-play').disabled=generating;
  $('#sn-music').classList.toggle('is-playing',playing);
  $('#music-toggle')?.classList.toggle('is-playing',playing);
  if ($('#music-toggle')) $('#music-toggle').setAttribute('aria-label',playing?'打开音乐播放器，音乐正在播放':'打开音乐播放器');
  $('#sn-music-mode').textContent=modeLabels[playMode];
  $('#sn-music-mode').setAttribute('aria-label',`${modeLabels[playMode]}，切换播放模式`);
  syncProgress();
}
function syncProgress() {
  const duration=finite(audio.duration)?audio.duration:0;
  $('#sn-music-progress').max=String(duration||1);
  $('#sn-music-progress').disabled=!duration;
  $('#sn-music-progress').value=String(Math.min(audio.currentTime,duration));
  $('#sn-music-elapsed').textContent=timeLabel(audio.currentTime);
  $('#sn-music-duration').textContent=timeLabel(duration);
}
function renderTracks() {
  const current=tracks[trackIndex];
  $('#sn-music-track-title').textContent=current.title;
  $('#sn-music-artist').textContent=current.artist;
  $('#sn-music-cover').src=current.cover;
  $('#sn-playlist').innerHTML=tracks.map((track,index)=>`<li><button type="button" data-track-index="${index}" aria-pressed="${index===trackIndex}"><span>${String(index+1).padStart(2,'0')}</span><span><b>${esc(track.title)}</b><small>${esc(track.artist)}</small></span>${index===trackIndex?icon('note',17):icon('play',15)}</button></li>`).join('');
  syncMusic();
}
async function selectTrack(index, play = false) {
  const request=++trackRequest;
  trackIndex=(index+tracks.length)%tracks.length;
  const track=tracks[trackIndex];
  audio.pause();audio.removeAttribute('src');audio.load();
  generating=true;musicStatus(track.local?'正在打开本地音乐…':'正在准备这段小旋律…');renderTracks();
  try {
    const url=track.src || await composeTrack(track.composition);
    if (request!==trackRequest) return;
    audio.src=url;audio.load();generating=false;musicStatus('');syncMusic();
    if (play) await audio.play();
  } catch(error) {
    if (request!==trackRequest) return;
    generating=false;
    musicStatus(error.name==='NotAllowedError'?'点一下播放，让音乐慢慢开始。':error.message || '这首暂时无法播放，可以换一首试试。');
  }
  if (request===trackRequest) syncMusic();
}
async function toggleMusic() {
  if (!audio.paused) { audio.pause(); return; }
  if (!audio.getAttribute('src')) { await selectTrack(trackIndex,true); return; }
  try { await audio.play();musicStatus(''); } catch { musicStatus('音乐暂时无法播放，请重试或换一首。'); }
}
function nextTrack(direction=1, play=!audio.paused) {
  let next=trackIndex+direction;
  if(playMode==='shuffle' && direction===1 && tracks.length>1) next=(trackIndex+1+Math.floor(Math.random()*(tracks.length-1)))%tracks.length;
  selectTrack(next,play);
}
function importMusic(files) {
  let added=0;
  for(const file of Array.from(files).slice(0,30)) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name)) continue;
    const src=URL.createObjectURL(file); importedURLs.push(src);
    tracks.push({title:file.name.replace(/\.[^.]+$/,''),artist:'本地音乐 · 仅在当前页面使用',src,local:true,cover:'./assets/woody.png'});added++;
  }
  renderTracks();
  musicStatus(added?`已加入 ${added} 首本地音乐，没有上传到服务器。`:'请选择 MP3、WAV、OGG 等音频文件。');
  $('#sn-music-list').hidden=false;
  $('#sn-music-list-toggle').setAttribute('aria-expanded','true');
}

export function mountWidgets({site={},posts=[]}={}) {
  articlePosts=posts;siteName=site.name||siteName;
  if(mounted) { syncWidgets(); return; }
  mounted=true;
  document.body.insertAdjacentHTML('beforeend',panelShell('sn-weather','WEATHER & TIME','小小气象站',`<div class="sn-live-clock"><span data-clock-full></span><small>北京时间</small></div><div class="sn-theme-follow"><span id="sn-theme-mode"></span><button type="button" class="sn-text-button" data-follow-day-night aria-pressed="false" title="北京时间 19:00 至次日 05:00 使用夜间模式">跟随日夜</button></div><div id="sn-weather-readings"></div><details class="sn-city-settings"><summary>更换城市</summary><form id="sn-city-form"><label class="sn-sr-only" for="sn-city-input">城市名称</label><input id="sn-city-input" autocomplete="off" placeholder="输入城市，如杭州 / Hangzhou" maxlength="80" required minlength="2"><button type="submit">查找</button></form><div id="sn-city-results" class="sn-city-results" aria-live="polite"></div><p class="sn-footnote">默认参考杭州。城市选择只保存在这台设备上。</p></details><div class="sn-widget-bottom"><button type="button" class="sn-soft-button" data-open-calendar>${icon('calendar',17)} 翻开日历</button><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo ↗</a></div>`,'brachio'));
  document.body.insertAdjacentHTML('beforeend',panelShell('sn-calendar','LITTLE DAYS','日历',`<nav class="sn-calendar-nav" aria-label="日历月份"><button type="button" class="sn-round-button" data-calendar-month="-1" aria-label="上个月">${icon('left',18)}</button><button type="button" class="sn-soft-button" data-calendar-today>回到今天</button><button type="button" class="sn-round-button" data-calendar-month="1" aria-label="下个月">${icon('right',18)}</button></nav><div class="sn-calendar-week" aria-hidden="true">${'一二三四五六日'.split('').map(day=>`<span>${day}</span>`).join('')}</div><div id="sn-calendar-grid" class="sn-calendar-grid" aria-label="选择日期"></div><p class="sn-calendar-legend"><i></i> 有手记的日子 <span>· 北京时间</span></p><div id="sn-calendar-detail" class="sn-calendar-detail" aria-live="polite"></div><div class="sn-section-label"><b id="sn-calendar-city"></b><button type="button" class="sn-text-button" data-open-weather>查看天气</button></div><div id="sn-calendar-forecast"></div><p class="sn-footnote">预报来自 <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · 农历由浏览器日期服务提供</p>`));
  document.body.insertAdjacentHTML('beforeend',panelShell('sn-music','SLOW RADIO','慢慢听',`<div class="sn-music-now"><div class="sn-record"><img id="sn-music-cover" src="./assets/brachio.png" alt="" width="64" height="64"></div><div><h3 id="sn-music-track-title"></h3><p id="sn-music-artist"></p></div></div><input id="sn-music-progress" class="sn-range" type="range" min="0" max="1" value="0" step="0.1" disabled aria-label="音乐播放进度"><div class="sn-music-time"><span id="sn-music-elapsed">0:00</span><span id="sn-music-duration">0:00</span></div><div class="sn-music-controls"><button id="sn-music-mode" type="button" class="sn-mode"></button><div class="sn-play-controls"><button id="sn-music-prev" type="button" aria-label="上一首">${icon('prev',19)}</button><button id="sn-music-play" type="button" aria-label="播放音乐">${icon('play',23)}</button><button id="sn-music-next" type="button" aria-label="下一首">${icon('next',19)}</button></div><button id="sn-music-list-toggle" type="button" class="sn-round-button" aria-label="展开或收起播放列表" aria-controls="sn-music-list" aria-expanded="true">${icon('list',20)}</button></div><label class="sn-volume">${icon('volume',18)}<input id="sn-music-volume" class="sn-range" type="range" min="0" max="1" step="0.01" aria-label="音量"><output id="sn-volume-value"></output></label><p id="sn-music-status" class="sn-music-status" role="status"></p><div id="sn-music-list"><ol id="sn-playlist" class="sn-playlist"></ol><label class="sn-import">＋ 加入本地音乐<input id="sn-music-import" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.opus" multiple></label><p class="sn-footnote">自带两段原创合成旋律。导入的音乐留在本机，刷新后清空。</p></div>`));
  audio=document.createElement('audio');audio.id='sn-audio';audio.preload='metadata';audio.hidden=true;document.body.append(audio);
  const volume=read('slow-notes-music-volume',.45);audio.volume=finite(volume)?Math.min(1,Math.max(0,volume)):.45;
  $('#sn-music-volume').value=String(audio.volume);$('#sn-volume-value').textContent=`${Math.round(audio.volume*100)}%`;
  $('#sn-music-track-title').textContent=tracks[0].title;
  $('#sn-city-form').addEventListener('submit',searchCity);
  $('#sn-music-play').addEventListener('click',toggleMusic);
  $('#sn-music-prev').addEventListener('click',()=>nextTrack(-1));
  $('#sn-music-next').addEventListener('click',()=>nextTrack(1));
  $('#sn-music-mode').addEventListener('click',()=>{const modes=['all','one','shuffle'];playMode=modes[(modes.indexOf(playMode)+1)%modes.length];save('slow-notes-music-mode',playMode);syncMusic();});
  $('#sn-music-list-toggle').addEventListener('click',()=>{const list=$('#sn-music-list');list.hidden=!list.hidden;$('#sn-music-list-toggle').setAttribute('aria-expanded',String(!list.hidden));});
  $('#sn-music-progress').addEventListener('input',event=>{if(finite(audio.duration)) audio.currentTime=Number(event.target.value);syncProgress();});
  $('#sn-music-volume').addEventListener('input',event=>{audio.volume=Number(event.target.value);save('slow-notes-music-volume',audio.volume);$('#sn-volume-value').textContent=`${Math.round(audio.volume*100)}%`;});
  $('#sn-music-import').addEventListener('change',event=>{importMusic(event.target.files);event.target.value='';});
  for(const name of ['play','pause','loadedmetadata','durationchange']) audio.addEventListener(name,syncMusic);
  audio.addEventListener('timeupdate',syncProgress);
  audio.addEventListener('error',()=>{if(audio.getAttribute('src')) {musicStatus('浏览器暂时无法读取这段音频，请换一首或导入支持的格式。');syncMusic();}});
  audio.addEventListener('ended',()=>{if(playMode==='one') {audio.currentTime=0;audio.play().catch(()=>syncMusic());} else nextTrack(1,true);});
  for(const dialog of document.querySelectorAll('.sn-widget')) {
    dialog.addEventListener('close',()=>{syncWidgetTriggers();const target=dialog.returnTarget;if(target?.isConnected && !target.closest('dialog:not([open])')) target.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) dialog.close();}});
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target) return;
    if(target.closest('.sn-calendar-articles')) $('#sn-calendar').close();
    if(target.matches('#weather-toggle,[data-open-weather]')) {renderWeather();showDialog('sn-weather',target);}
    if(target.matches('#music-toggle')) {renderTracks();showDialog('sn-music',target);}
    if(target.matches('[data-open-calendar]')) openCalendar(target);
    if(target.matches('[data-widget-close]')) target.closest('dialog').close();
    if(target.matches('#theme-toggle')) {sessionAutoTheme=false;sessionTheme=document.documentElement.dataset.theme;syncClock();}
    if(target.matches('[data-follow-day-night]')) {sessionTheme=null;sessionAutoTheme=true;try {localStorage.removeItem('slow-notes-theme');} catch { /* Follow the clock for this page when preferences cannot be saved. */ }syncClock();}
    if(target.matches('[data-refresh-weather]')) fetchWeather();
    if(target.matches('[data-forecast-date]')) openCalendar(target,target.dataset.forecastDate);
    if(target.matches('[data-calendar-month]')) {calendarMonth=shiftCalendarMonth(calendarMonth,Number(target.dataset.calendarMonth));renderCalendar();}
    if(target.matches('[data-calendar-today]')) {selectedDate=clockParts().date;calendarMonth=selectedDate.slice(0,7);renderCalendar();}
    if(target.matches('[data-calendar-date]')) {selectedDate=target.dataset.calendarDate;renderCalendar();$(`[data-calendar-date="${selectedDate}"]`)?.focus();}
    if(target.matches('[data-track-index]')) selectTrack(Number(target.dataset.trackIndex),true);
  });
  window.addEventListener('hashchange',()=>document.querySelectorAll('.sn-widget[open]').forEach(dialog=>dialog.close()));
  window.addEventListener('storage',event=>{if(event.key==='slow-notes-theme' || event.key===null){sessionTheme=null;sessionAutoTheme=false;syncClock();}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){syncClock();if(Date.now()-cachedAt>30*60*1000 && !weatherLoading) fetchWeather();}});
  window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(clockTimer);clearInterval(refreshTimer);weatherController?.abort();citySearchController?.abort();importedURLs.forEach(url=>URL.revokeObjectURL(url));}});
  const cache=read('slow-notes-weather-cache',null);
  if(cache?.key===cityKey(city) && validWeather(cache.data) && finite(cache.at) && Date.now()-cache.at<24*60*60*1000) {weather=cache.data;cachedAt=cache.at;}
  renderTracks();syncWidgets();renderWeather();
  if(!weather || Date.now()-cachedAt>15*60*1000) fetchWeather();
  clockTimer=setInterval(syncClock,1000);
  refreshTimer=setInterval(()=>{if(document.visibilityState==='visible' && !weatherLoading) fetchWeather();},15*60*1000);
}

export function syncWidgets() {
  if(!mounted) return;
  syncClock();syncWeather();syncWidgetTriggers();syncMusic();
}
