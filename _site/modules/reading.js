/** Temporary reading UI state; never changes the pet's saved visibility preference. */
export function mountReadingChrome({ pet }) {
  const mobile = window.matchMedia('(max-width: 850px)');
  const nav = document.querySelector('.main-nav');
  const menu = document.querySelector('#mobile-menu');
  let article = false, hidden = false, anchor = 0, frame = 0;
  let viewportWidth = window.innerWidth;

  function scrollPosition() {
    // Ignore rubber-band overscroll at either end of a mobile page.
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return Math.min(max, Math.max(0, window.scrollY));
  }

  function showHidden(next) {
    if (hidden === next) return;
    hidden = next;
    if (hidden) document.body.dataset.readingChrome = 'hidden';
    else delete document.body.dataset.readingChrome;
    nav.inert = hidden;
    if (hidden) nav.setAttribute('aria-hidden', 'true');
    else nav.removeAttribute('aria-hidden');
    pet.setReadingHidden(hidden);
  }

  function reveal() {
    anchor = scrollPosition();
    showHidden(false);
  }

  function update() {
    frame = 0;
    const y = scrollPosition();
    const focused = document.activeElement;
    const keyboardFocus = focused?.matches(':focus-visible') &&
      focused.closest('.main-nav, #brachio-pet');
    if (!article || !mobile.matches || y < 100 || !menu.hidden ||
        document.querySelector('dialog[open]') || pet.interacting || keyboardFocus) {
      reveal();
      return;
    }
    // Measure from the last extremum, so small touch reversals do not flicker.
    anchor = hidden ? Math.max(anchor, y) : Math.min(anchor, y);
    if (hidden ? anchor - y >= 12 : y - anchor >= 28) {
      showHidden(!hidden);
      anchor = y;
    }
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  // Mobile browser toolbars resize the height during scrolling; only a width
  // change should reset reading mode (rotation, window resize, or breakpoint).
  window.addEventListener('resize', () => {
    if (window.innerWidth !== viewportWidth) {
      viewportWidth = window.innerWidth;
      reveal();
    }
  }, { passive: true });
  mobile.addEventListener('change', reveal);
  window.addEventListener('pageshow', reveal);
  document.addEventListener('brachio-pet-reveal', reveal);
  document.addEventListener('keydown', event => {
    // Make navigation available before keyboard focus moves into it.
    if (event.key === 'Tab') reveal();
  });

  return {
    reset() {
      article = document.body.dataset.page === 'post' && Boolean(document.querySelector('.article-page'));
      cancelAnimationFrame(frame);
      frame = 0;
      reveal();
    },
  };
}
