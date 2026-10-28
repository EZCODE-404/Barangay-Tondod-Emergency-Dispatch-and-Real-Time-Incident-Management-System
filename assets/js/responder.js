document.addEventListener(
  'pointerdown',
  () => {
    if (alarmEnabled) {
      try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        audioContext.resume();
      } catch (e) {}
    }
  },
  { passive: true },
);
const $ = (id) => document.getElementById(id);
const esc = (x) =>
  String(x ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
const DEVICE_KEY = 'bt_responder_device_key';
let responderNotificationStorageKey = 'bt_responder_notification_last_id';
let lastNotificationId = Number(sessionStorage.getItem(responderNotificationStorageKey) || 0);
let notificationPermission = false,
  audioContext = null,
  alarmEnabled = localStorage.getItem('bt_responder_alarm') === '1';
function deviceKey() {
  let k = localStorage.getItem(DEVICE_KEY);
  if (!k) {
    k = crypto.randomUUID
      ? crypto.randomUUID()
      : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem(DEVICE_KEY, k);
  }
  return k;
}
async function api(ep, opt = {}) {
  const base = await window.API_BASE_PROMISE;
  const r = await fetch(base + '/' + ep, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(opt.body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
    ...opt,
  });
  const raw = await r.text();
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    throw Error(
      'Invalid API response from server: ' +
        raw
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180),
    );
  }
  if (!r.ok || d.success === false) {
    const e = Error(d.message || 'Request failed.');
    e.status = r.status;
    throw e;
  }
  return d;
}
function toast(x) {
  const t = $('toast');
  t.textContent = x;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
function formatResponderTime(v) {
  if (!v) return 'Just now';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
}
function initials(n) {
  return String(n || 'R')
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
async function registerDevice() {
  try {
    const d = await api('responder_devices.php', {
      method: 'POST',
      body: JSON.stringify({
        device_key: deviceKey(),
        device_name: navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Desktop Browser',
        user_agent: navigator.userAgent,
      }),
    });
    $('notificationText').textContent =
      'This device is registered for responder-specific dispatch notifications.';
    return d;
  } catch (e) {
    $('notificationText').textContent = e.message;
    throw e;
  }
}
async function enableNotifications() {
  try {
    await unlockNotificationSound();
    alarmEnabled = true;
    localStorage.setItem('bt_responder_alarm', '1');
    if (!('Notification' in window)) {
      await registerDevice();
      toast('Responder alarm enabled. Browser notifications are not supported.');
      return;
    }
    const p = await Notification.requestPermission();
    notificationPermission = p === 'granted';
    await registerDevice();
    $('enableNotifications').innerHTML = '<i class="fa-solid fa-bell"></i> ALERTS ON';
    $('enableNotifications').classList.add('enabled');
    toast(
      notificationPermission
        ? 'Responder alarm and notifications enabled.'
        : 'Responder alarm enabled. Browser notification permission was not granted.',
    );
  } catch (e) {
    toast(e.message);
  }
}
function responderAlarm() {
  if (!alarmEnabled) return;
  playNotificationSound(5000);
}
function notifyBrowser(n) {
  if (
    !notificationPermission ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  )
    return;
  try {
    const note = new Notification(n.title || 'New Emergency Assignment', {
      body: n.message || 'You have a new emergency assignment.',
      tag: 'responder-' + n.id,
    });
    note.onclick = () => {
      window.focus();
      if (n.incident_id)
        document.getElementById('incidents')?.scrollIntoView({ behavior: 'smooth' });
      note.close();
    };
  } catch (e) {}
}
function showNotification(n) {
  const stack = $('responderNotificationStack');
  if (!stack || stack.querySelector('[data-notification-id="' + n.id + '"]')) return;
  const el = document.createElement('div');
  el.className = 'responder-notification';
  el.dataset.notificationId = n.id;
  el.innerHTML = `<div class="rn-icon"><i class="fa-solid fa-truck-medical"></i></div><div class="rn-body"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p>${n.incident_no ? `<small>${esc(n.incident_no)} · ${esc(n.priority || '')}</small>` : ''}</div><button class="rn-close" aria-label="Dismiss">×</button>`;
  el.querySelector('.rn-close').onclick = async () => {
    try {
      await api('responder_notifications.php', {
        method: 'PATCH',
        body: JSON.stringify({ id: Number(n.id) }),
      });
    } catch (e) {}
    el.remove();
  };
  stack.prepend(el);
  responderAlarm();
  notifyBrowser(n);
  setTimeout(() => el.remove(), 15000);
}
async function pollNotifications() {
  try {
    const d = await api(
      'responder_notifications.php?after_id=' + encodeURIComponent(lastNotificationId),
    );
    const rows = d.notifications || [];
    for (const n of rows) {
      lastNotificationId = Math.max(lastNotificationId, Number(n.id || 0));
      sessionStorage.setItem(responderNotificationStorageKey, String(lastNotificationId));
      showNotification(n);
    }
    if (!rows.length) {
      const serverLast = Number(d.last_id || 0);
      lastNotificationId =
        serverLast < lastNotificationId ? serverLast : Math.max(lastNotificationId, serverLast);
      sessionStorage.setItem(responderNotificationStorageKey, String(lastNotificationId));
    }
  } catch (e) {
    if (!/migration|required|database/i.test(e.message)) console.warn(e.message);
  }
}

const responderLocationCache = new Map();

async function reverseResponderLocation(lat, lon) {
  const key = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  if (responderLocationCache.has(key)) return responderLocationCache.get(key);
  const stored = sessionStorage.getItem(`bt_responder_reverse_${key}`);
  if (stored) {
    responderLocationCache.set(key, stored);
    return stored;
  }
  const fallback = `GPS ${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) throw new Error();
    const data = await response.json();
    const a = data.address || {};
    const parts = [
      a.amenity || a.building || a.shop || a.tourism || a.leisure || a.historic,
      a.road || a.pedestrian || a.footway,
      a.neighbourhood || a.suburb || a.quarter,
      a.village || a.town || a.city || a.municipality,
      a.state,
    ].filter(Boolean);
    const result = parts.length ? [...new Set(parts)].join(', ') : data.display_name || fallback;
    responderLocationCache.set(key, result);
    try {
      sessionStorage.setItem(`bt_responder_reverse_${key}`, result);
    } catch (_) {}
    return result;
  } catch (_) {
    responderLocationCache.set(key, fallback);
    return fallback;
  }
}

async function enrichResponderLocations(incidents) {
  await Promise.all(
    incidents.map(async (x) => {
      if (Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude))) {
        x.location_name = await reverseResponderLocation(x.latitude, x.longitude);
      }
    }),
  );
  renderResponderIncidents(incidents);
}

function renderResponderIncidents(incidents) {
  $('assigned').textContent = incidents.length;
  $('badge').textContent = incidents.length;
  $('incidents').innerHTML =
    incidents
      .map(
        (x) =>
          `<article class="assignment ${x.priority === 'Critical' ? 'critical' : ''}"><div class="top"><div><h3>${esc(x.incident_no)} · ${esc(x.category)}</h3><div class="assignment-location"><div class="location-copy"><span class="location-label"><i class="fa-solid fa-location-dot"></i> INCIDENT LOCATION</span><b>${esc(x.location_name || x.location || 'Location not provided')}</b>${x.latitude && x.longitude ? `<small>${esc(Number(x.latitude).toFixed(6))}, ${esc(Number(x.longitude).toFixed(6))}</small>` : ''}</div>${x.latitude && x.longitude ? `<a class="location-map-button" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(x.latitude)},${encodeURIComponent(x.longitude)}"><i class="fa-solid fa-map-location-dot"></i><span>VIEW GPS LOCATION</span></a>` : ''}</div><p>${esc(x.description || 'No description provided.')}</p>${x.reporter_phone ? `<div class="reporter-contact"><div><small>REPORTER CONTACT</small><strong>${esc(x.reporter_name || 'Reporting person')}</strong><a href="tel:${esc(String(x.reporter_phone).replace(/[^0-9+*#,;]/g, ''))}">${esc(x.reporter_phone)}</a></div><a class="call-reporter-button" href="tel:${esc(String(x.reporter_phone).replace(/[^0-9+*#,;]/g, ''))}"><i class="fa-solid fa-phone"></i> CALL REPORTER</a></div>` : ''}${x.image_path ? `<p class="incident-photo"><a href="${esc(window.appAssetUrl ? window.appAssetUrl(x.image_path) : '../' + String(x.image_path))}" target="_blank" rel="noopener"><img src="${esc(window.appAssetUrl ? window.appAssetUrl(x.image_path) : '../' + String(x.image_path))}" alt="Incident photo" loading="lazy" style="max-width:100%;max-height:260px;border-radius:10px;object-fit:contain" onerror="this.closest('.incident-photo')?.querySelector('.photo-error')?.removeAttribute('hidden');this.style.display='none'"></a><small class="photo-error" hidden>Photo file could not be found. Check the uploads/sos folder.</small></p>` : ''}<p class="reported-time"><i class="fa-regular fa-clock"></i> Reported ${esc(formatResponderTime(x.created_at))}</p><div class="assignment-meta"><span class="pill">${esc(x.priority)}</span><span class="pill">${esc(x.status)}</span></div></div></div><div class="actions"><button class="primary mini" onclick="updateIncident(${x.id},'On Scene')"><i class="fa-solid fa-location-dot"></i> ON SCENE</button><button class="secondary mini" onclick="updateIncident(${x.id},'En Route')"><i class="fa-solid fa-route"></i> EN ROUTE</button></div></article>`,
      )
      .join('') || '<div class="empty">No assigned emergencies.</div>';
}
function openProfileModal() {
  const u = window.currentResponderUser || {};
  const p = $('selfProfilePreview');
  p.innerHTML = u.profile_picture
    ? `<img src="${esc(u.profile_picture)}" alt="Profile preview">`
    : '<i class="fa-solid fa-user"></i>';
  $('profileSelfName').textContent = u.full_name || 'Responder';
  $('profileSelfRole').textContent = (u.role || 'Responder') + ' · ' + (u.username || '');
  const f = $('profileForm');
  if (f) f.dataset.currentPicture = u.profile_picture || '';
  const file = $('selfProfilePicture');
  if (file) {
    file.value = '';
    delete file.dataset.value;
  }
  $('profileModal').classList.add('open');
  document.body.classList.add('modal-open');
}
function closeProfileModal() {
  $('profileModal')?.classList.remove('open');
  document.body.classList.remove('modal-open');
}
async function saveProfilePicture(e) {
  e.preventDefault();
  try {
    const f = e.target,
      file = $('selfProfilePicture');
    const data =
      file?.dataset.value !== undefined ? file.dataset.value : f.dataset.currentPicture || '';
    const d = await api('profile.php', {
      method: 'PATCH',
      body: JSON.stringify({ profile_picture: data }),
    });
    window.currentResponderUser = d.user;
    loadResponderAvatar(d.user);
    closeProfileModal();
    toast('Profile picture updated successfully.');
  } catch (x) {
    toast(x.message);
  }
}
function loadResponderAvatar(u) {
  $('avatar').textContent = initials(u.full_name);
  $('avatarLarge').textContent = initials(u.full_name);
  if (u.profile_picture) {
    $('avatar').innerHTML =
      '<img src="' +
      esc(u.profile_picture) +
      '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">';
    $('avatarLarge').innerHTML = '<img src="' + esc(u.profile_picture) + '" alt="Profile">';
  }
}
async function load() {
  try {
    const d = await api('responder.php'),
      r = d.responder;
    window.currentResponderUser = {
      ...(window.currentResponderUser || {}),
      full_name: r.full_name,
      role: 'Responder',
      profile_picture: r.profile_picture,
    };
    $('name').textContent = r.full_name;
    $('profileName').textContent = r.full_name;
    $('profileType').textContent = r.type;
    $('phone').textContent = r.phone;
    loadResponderAvatar(r);
    $('status').textContent = r.status;
    $('statusSelect').value = ['Available', 'En Route', 'On Scene', 'Standby'].includes(r.status)
      ? r.status
      : 'Available';
    renderResponderIncidents(d.incidents || []);
    enrichResponderLocations(d.incidents || []);
    return true;
  } catch (e) {
    if (e.status === 401) {
      location.href = 'login.html?session=expired';
      return false;
    }
    const list = $('incidents');
    if (list)
      list.innerHTML =
        '<div class="empty" role="alert">Unable to load incident details. ' +
        esc(e.message || 'Please refresh and try again.') +
        '</div>';
    toast(e.message || 'Unable to load incidents.');
    return false;
  }
}

async function updateIncident(id, status) {
  try {
    await api('responder.php', {
      method: 'PATCH',
      body: JSON.stringify({ incident_id: id, status }),
    });
    toast('Response status updated.');
    load();
  } catch (e) {
    toast(e.message);
  }
}
$('refresh')?.addEventListener('click', async () => {
  const button = $('refresh');
  if (!button) return;
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> REFRESHING...';
  try {
    const ok = await load();
    if (ok) {
      await pollNotifications();
      toast('Assigned incidents refreshed.');
    }
  } catch (e) {
    toast(e.message || 'Refresh failed.');
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
});
$('saveStatus').onclick = async () => {
  try {
    await api('responder.php', {
      method: 'PATCH',
      body: JSON.stringify({ status: $('statusSelect').value }),
    });
    toast('Status updated.');
    load();
  } catch (e) {
    toast(e.message);
  }
};
const notificationButton = $('enableNotifications');

if (notificationButton) {
  notificationButton.onclick = enableNotifications;
}
$('avatarProfileButton')?.addEventListener('click', openProfileModal);
$('selfProfilePicture')?.addEventListener('change', async (e) => {
  try {
    const data = await new Promise((resolve, reject) => {
      const f = e.target.files?.[0];
      if (!f) return resolve('');
      if (f.size > 2 * 1024 * 1024)
        return reject(new Error('Profile picture must be 2 MB or smaller.'));
      if (!/^image\/(jpeg|png|webp)$/.test(f.type))
        return reject(new Error('Use a JPG, PNG, or WEBP image.'));
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('Could not read the profile picture.'));
      r.readAsDataURL(f);
    });
    if (data) {
      $('selfProfilePreview').innerHTML = `<img src="${esc(data)}" alt="Profile preview">`;
      e.target.dataset.value = data;
    }
  } catch (x) {
    e.target.value = '';
    toast(x.message);
  }
});
$('profileForm')?.addEventListener('submit', saveProfilePicture);
$('logout').onclick = async () => {
  await api('logout.php', { method: 'POST' });
  location.href = 'login.html';
};
async function requireResponderSession() {
  try {
    const d = await api('me.php');
    window.currentResponderUser = d.user;
    if (!d.user || d.user.role !== 'Responder') {
      window.location.replace('login.html');
      return false;
    }
    responderNotificationStorageKey = 'bt_responder_notification_last_id_' + String(d.user.id);
    lastNotificationId = Number(sessionStorage.getItem(responderNotificationStorageKey) || 0);
    document.body.classList.remove('responder-locked');
    const gate = $('authGate');
    if (gate) gate.remove();
    const app = $('responderApp');
    if (app) app.style.visibility = 'visible';
    return true;
  } catch (e) {
    window.location.replace('login.html');
    return false;
  }
}
(async () => {
  if (!(await requireResponderSession())) return;
  try {
    await registerDevice();
  } catch (e) {
    console.warn(e.message);
  }
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      notificationPermission = true;
      $('enableNotifications').innerHTML = '<i class="fa-solid fa-bell"></i> NOTIFICATIONS ON';
      $('enableNotifications').classList.add('enabled');
    }
  } catch (e) {}
  await load();
  await pollNotifications();
  setInterval(load, 10000);
  setInterval(pollNotifications, 2500);
})();
