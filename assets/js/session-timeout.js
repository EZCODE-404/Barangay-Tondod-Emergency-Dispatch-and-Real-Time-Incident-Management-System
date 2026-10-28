/* Authenticated-session inactivity timeout: 30 minutes. */
(() => {
  'use strict';
  const TIMEOUT_MS = 30 * 60 * 1000;
  let timer = null;
  let loggingOut = false;

  function clearLoginValues() {
    try {
      localStorage.removeItem('username');
      localStorage.removeItem('password');
      sessionStorage.removeItem('username');
      sessionStorage.removeItem('password');
    } catch (_) {}
  }

  async function logoutForInactivity() {
    if (loggingOut) return;
    loggingOut = true;
    clearLoginValues();
    try {
      await fetch(await apiUrl('logout.php'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        keepalive: true,
      });
    } catch (_) {}
    window.location.href = 'login.html?timeout=1';
  }

  function resetTimer() {
    if (loggingOut) return;
    clearTimeout(timer);
    timer = setTimeout(logoutForInactivity, TIMEOUT_MS);
  }

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((type) => {
    document.addEventListener(type, resetTimer, { passive: true });
  });
  resetTimer();
})();
