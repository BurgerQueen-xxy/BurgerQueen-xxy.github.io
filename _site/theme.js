try {
  if (localStorage.getItem('slow-notes-theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch { /* Storage may be unavailable; the default theme remains usable. */ }
