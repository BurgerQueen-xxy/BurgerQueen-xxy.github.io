// Keep the initial recovery action available under the private preview CSP.
(() => {
  const showRecovery = () => { const notice = document.getElementById('loading-recovery'); if (notice) notice.hidden = false; };
  const timer = setTimeout(showRecovery, 15000);
  document.getElementById('loading-retry')?.addEventListener('click', () => location.reload());
  window.addEventListener('error', event => { if (event.target?.id === 'app-entry' || event.error) showRecovery(); }, true);
  document.addEventListener('slow-app-ready', () => clearTimeout(timer), {once:true});
})();
