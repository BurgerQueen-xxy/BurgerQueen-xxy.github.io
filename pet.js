// Official JOGUMAN artwork; see public/assets/SOURCES-pet.md for provenance.
const STORAGE_KEY = 'slow-notes-pet';
const animationUrl = new URL('./assets/brachio-pet.json', import.meta.url).href;
const playerUrl = new URL('./vendor/lottie.min.js', import.meta.url).href;
const stillUrl = new URL('./assets/brachio.png', import.meta.url).href;
let playerPromise;
let mountedPet;

function getPlayer() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!playerPromise) {
    playerPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = playerUrl;
      script.async = true;
      script.dataset.brachioPlayer = '';
      script.onload = () => window.lottie ? resolve(window.lottie) : reject(new Error('Lottie 未能加载'));
      script.onerror = () => { script.remove(); playerPromise = undefined; reject(new Error('Lottie 未能加载')); };
      document.head.append(script);
    });
  }
  return playerPromise;
}

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { hidden: stored?.hidden === true, paused: stored?.paused === true };
  } catch { return { hidden: false, paused: false }; }
}

/** Mount once; trigger is an existing header button or selector. Include pet.css. */
export function mountPet({ trigger = '#pet-toggle' } = {}) {
  if (mountedPet) return mountedPet;
  const preferences = readPreferences();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const triggerButton = typeof trigger === 'string' ? document.querySelector(trigger) : trigger;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let animation;
  let destroyed = false;
  let greetingTimer;
  let greetingIndex = 0;
  const greetings = ['嗨，我是布拉吉奥。', '别着急，慢慢来就好。', '一起发一会儿呆吧。'];

  const root = document.createElement('aside');
  root.className = 'brachio-pet';
  root.id = 'brachio-pet';
  root.setAttribute('aria-label', '布拉吉奥小伙伴');
  root.innerHTML = `
    <p class="brachio-pet__speech" role="status" aria-live="polite" hidden></p>
    <div class="brachio-pet__tools">
      <button type="button" class="brachio-pet__control" data-pet-pause aria-label="暂停动画" title="暂停动画"></button>
      <button type="button" class="brachio-pet__control" data-pet-hide aria-label="隐藏布拉吉奥" title="隐藏布拉吉奥"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>
    </div>
    <button type="button" class="brachio-pet__character" aria-label="和布拉吉奥打个招呼" title="和布拉吉奥打个招呼">
      <img class="brachio-pet__still" src="${stillUrl}" alt="" width="65" height="128">
      <span class="brachio-pet__animation" aria-hidden="true"></span>
    </button>`;
  document.body.append(root);
  const pauseButton = root.querySelector('[data-pet-pause]');
  const hideButton = root.querySelector('[data-pet-hide]');
  const characterButton = root.querySelector('.brachio-pet__character');
  const animationContainer = root.querySelector('.brachio-pet__animation');
  const speech = root.querySelector('.brachio-pet__speech');

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Private browsing may disable storage. */ }
  }

  function sync() {
    const paused = preferences.paused || media.matches;
    root.hidden = preferences.hidden;
    pauseButton.disabled = media.matches;
    pauseButton.setAttribute('aria-pressed', String(paused));
    const label = media.matches ? '已按系统设置减少动画' : paused ? '继续动画' : '暂停动画';
    pauseButton.setAttribute('aria-label', label);
    pauseButton.title = label;
    pauseButton.innerHTML = paused
      ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 7 5-7 5Z"/></svg>'
      : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg>';
    if (triggerButton) {
      triggerButton.setAttribute('aria-controls', root.id);
      triggerButton.setAttribute('aria-pressed', String(!preferences.hidden));
      const triggerLabel = preferences.hidden ? '显示布拉吉奥' : '隐藏布拉吉奥';
      triggerButton.setAttribute('aria-label', triggerLabel);
      triggerButton.title = triggerLabel;
    }
    if (animation) {
      if (paused || preferences.hidden || document.hidden) animation.pause();
      else animation.play();
    }
  }

  function setHidden(hidden, restoreFocus = false) {
    preferences.hidden = hidden;
    if (hidden) {
      clearTimeout(greetingTimer);
      speech.hidden = true;
      if (restoreFocus && root.contains(document.activeElement)) triggerButton?.focus();
    }
    save();
    sync();
  }

  function setPaused(paused) {
    preferences.paused = paused;
    save();
    sync();
  }

  function greet() {
    if (preferences.hidden) setHidden(false);
    clearTimeout(greetingTimer);
    speech.textContent = greetings[greetingIndex++ % greetings.length];
    speech.hidden = false;
    greetingTimer = window.setTimeout(() => { speech.hidden = true; }, 3500);
  }

  triggerButton?.addEventListener('click', () => setHidden(!preferences.hidden), options);
  hideButton.addEventListener('click', () => setHidden(true, true), options);
  pauseButton.addEventListener('click', () => setPaused(!preferences.paused), options);
  characterButton.addEventListener('click', greet, options);
  document.addEventListener('visibilitychange', sync, options);
  media.addEventListener('change', sync, options);
  document.addEventListener('brachio-pet', (event) => {
    switch (event.detail?.action) {
      case 'show': setHidden(false); break;
      case 'hide': setHidden(true, true); break;
      case 'toggle': setHidden(!preferences.hidden, true); break;
      case 'pause': setPaused(true); break;
      case 'play': setPaused(false); break;
      case 'greet': greet(); break;
    }
  }, options);
  sync();

  const ready = Promise.all([
    getPlayer(),
    fetch(animationUrl).then((response) => {
      if (!response.ok) throw new Error('布拉吉奥动画未能加载');
      return response.json();
    }),
  ]).then(([lottie, animationData]) => {
    if (destroyed) return;
    animation = lottie.loadAnimation({
      container: animationContainer,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      animationData,
      rendererSettings: { preserveAspectRatio: 'xMidYMax meet', progressiveLoad: true },
    });
    animation.addEventListener('DOMLoaded', () => {
      // The official file loops the original 0–19 keyframes using loopOut.
      // Light SVG omits expression evaluation; looping this segment preserves it.
      animation.setSpeed(0.48);
      animation.playSegments([0, 19], true);
      animationContainer.querySelector('svg')?.setAttribute('focusable', 'false');
      root.classList.add('brachio-pet--ready');
      sync();
    });
    animation.addEventListener('data_failed', () => root.classList.remove('brachio-pet--ready'));
  }).catch(() => {
    // Keep the original, locally bundled character image available on failure.
    root.classList.remove('brachio-pet--ready');
    pauseButton.hidden = true;
  });

  mountedPet = {
    ready,
    show: () => setHidden(false),
    hide: () => setHidden(true, true),
    toggle: () => setHidden(!preferences.hidden, true),
    pause: () => setPaused(true),
    play: () => setPaused(false),
    greet,
    destroy() {
      destroyed = true;
      controller.abort();
      clearTimeout(greetingTimer);
      animation?.destroy();
      root.remove();
      triggerButton?.removeAttribute('aria-controls');
      triggerButton?.removeAttribute('aria-pressed');
      mountedPet = undefined;
    },
  };
  return mountedPet;
}
