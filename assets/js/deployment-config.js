/* Deployment-wide configuration. Settings are stored in MySQL and applied to every UI. */
(function () {
  const api = location.pathname.includes('/pages/') ? '../api/settings.php' : './api/settings.php';
  window.deploymentSettings = window.deploymentSettings || {};
  window.applyDeploymentSettings = function (s) {
    s = s || {};
    window.deploymentSettings = s;
    const defaults = { barangay_name: 'Barangay Tondod', city: 'San Jose City', hotline: '911' };
    const merged = { ...defaults, ...s };
    Object.keys(merged).forEach((key) => {
      document
        .querySelectorAll('[data-deployment="' + CSS.escape(key) + '"]')
        .forEach((e) => (e.textContent = merged[key]));
      document
        .querySelectorAll('[data-deployment-value="' + CSS.escape(key) + '"]')
        .forEach((e) => {
          if (document.activeElement !== e) e.value = merged[key];
        });
    });
    const hotline = merged.hotline || '911';
    document.querySelectorAll('[data-deployment="hotline-link"]').forEach((e) => {
      e.href = 'tel:' + String(hotline).replace(/[^0-9+]/g, '');
      if (e.dataset.hotlineLabel !== 'false')
        e.textContent = e.dataset.hotlinePrefix === 'false' ? hotline : '☎ ' + hotline;
    });
    document.title = document.title.replace(
      /Barangay Tondod/gi,
      merged.barangay_name || defaults.barangay_name,
    );
    document.querySelectorAll('meta[name="description"]').forEach((e) => {
      if (e.content)
        e.content = e.content.replace(
          /Barangay Tondod/gi,
          merged.barangay_name || defaults.barangay_name,
        );
    });
    window.dispatchEvent(new CustomEvent('deploymentsettingsloaded', { detail: merged }));
    return merged;
  };
  window.loadDeploymentSettings = async function () {
    try {
      const r = await fetch(api, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const d = await r.json();
      if (!r.ok || d.success === false) throw new Error(d.message || 'Settings unavailable');
      return window.applyDeploymentSettings(d.settings || {});
    } catch (e) {
      console.warn('Deployment settings:', e.message);
      return window.deploymentSettings;
    }
  };
  document.addEventListener('DOMContentLoaded', () => window.loadDeploymentSettings());
  setInterval(() => window.loadDeploymentSettings(), 5000);
})();
