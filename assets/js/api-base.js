/* Resolve the API directory from nested pages as well as the web root. */
(function () {
  function candidates() {
    if (location.protocol === 'file:') return [];
    const pathParts = location.pathname.split('/').filter(Boolean);
    // Treat the last segment as a filename unless the URL ends with a slash.
    if (!location.pathname.endsWith('/') && pathParts.length) pathParts.pop();
    const out = [];
    for (let i = pathParts.length; i >= 0; i--) {
      const prefix = i ? '/' + pathParts.slice(0, i).join('/') : '';
      out.push(prefix + '/api/');
    }
    return [...new Set(out)];
  }

  window.API_BASE_PROMISE = (async () => {
    if (location.protocol === 'file:') {
      throw new Error('Open this application through Apache/XAMPP, not as a file (file://).');
    }
    for (const base of candidates()) {
      try {
        const response = await fetch(base + 'index.php', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) continue;
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          if (data && data.status === 'online') return base.replace(/\/$/, '');
        } catch (_) {}
      } catch (_) {}
    }
    throw new Error(
      'Could not find the API folder. Check that the api folder is inside the project web root.',
    );
  })();

  window.apiUrl = async (ep) => `${await window.API_BASE_PROMISE}/${String(ep).replace(/^\//, '')}`;

  // Add a session-backed CSRF token to every same-origin state-changing API request.
  // Fetch the token for each mutation so a session renewed after inactivity is handled.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    let requestUrl;
    let method;
    try {
      const inputUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      requestUrl = new URL(inputUrl, window.location.href);
      method = String(
        init.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET'),
      ).toUpperCase();
    } catch (_) {
      return nativeFetch(input, init);
    }

    const isApiRequest = requestUrl.origin === window.location.origin && /\/api\/[^/]+$/.test(requestUrl.pathname);
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const isCsrfEndpoint = /\/csrf\.php$/.test(requestUrl.pathname);
    if (!isApiRequest || !isMutation || isCsrfEndpoint) {
      return nativeFetch(input, init);
    }

    const csrfUrl = new URL('csrf.php', new URL('.', requestUrl)).href;
    const tokenResponse = await nativeFetch(csrfUrl, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    let tokenData;
    try {
      tokenData = await tokenResponse.json();
    } catch (_) {
      throw new Error('Could not obtain a security token. Refresh the page and try again.');
    }
    if (!tokenResponse.ok || !tokenData?.success || !tokenData?.csrf_token) {
      throw new Error(tokenData?.message || 'Could not obtain a security token. Refresh the page and try again.');
    }

    const headers = new Headers(typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    headers.set('X-CSRF-Token', tokenData.csrf_token);
    return nativeFetch(input, { ...init, headers, credentials: init.credentials || 'same-origin' });
  };
})();

/* Resolve files saved under the application web root from both root and /pages/ screens. */
window.appAssetUrl = function (relativePath) {
  let raw = String(relativePath || '')
    .split(String.fromCharCode(92))
    .join('/');
  while (raw.startsWith('/')) raw = raw.slice(1);
  if (!raw || raw.split('/').some((part) => part === '..')) return '';
  const pathname = window.location.pathname || '/';
  let appRoot = '';
  const pagesAt = pathname.indexOf('/pages/');
  const apiAt = pathname.indexOf('/api/');
  if (pagesAt >= 0) appRoot = pathname.slice(0, pagesAt);
  else if (apiAt >= 0) appRoot = pathname.slice(0, apiAt);
  else if (pathname.endsWith('/')) appRoot = pathname.replace(/\/+$/, '');
  else appRoot = pathname.slice(0, pathname.lastIndexOf('/'));
  return `${appRoot}/${raw}`;
};
