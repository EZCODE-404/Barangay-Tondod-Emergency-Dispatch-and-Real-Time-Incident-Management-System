let API_BASE = './api';
let map = null,
  mapMarkers = new Map(),
  mapAccuracyCircles = new Map(),
  chart = null,
  reportChart = null,
  audioContext = null,
  notificationEnabled = localStorage.getItem('bt_admin_alerts') === '1',
  browserNotificationEnabled =
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  lastRealtimeId = Number(sessionStorage.getItem('bt_admin_realtime_last_id') || 0);
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
function formatIncidentTime(v) {
  if (!v) return 'Just now';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
async function apiFetch(ep, opt = {}) {
  API_BASE = await window.API_BASE_PROMISE;
  const r = await fetch(`${API_BASE}/${ep}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(opt.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...opt,
  });
  const raw = await r.text();
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    throw Error(
      `API returned a non-JSON response (HTTP ${r.status}). ${raw
        .replace(/<[^>]*>/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim()
        .slice(0, 240)}`,
    );
  }
  if (!r.ok || d.success === false) {
    const e = Error(d.message || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return d;
}
function toast(msg, ok = true) {
  const t = $('toast');
  if (t) {
    t.textContent = msg;
    t.className = 'toast show ' + (ok ? '' : 'error');
    setTimeout(() => (t.className = 'toast'), 3000);
  } else alert(msg);
}
function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('open');
  document.body.classList.add('modal-open');
}
function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('open');
  document.body.classList.remove('modal-open');
}
function showPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active-page'));
  $(`page-${name}`)?.classList.add('active-page');
  document
    .querySelectorAll('[data-page]')
    .forEach((a) => a.classList.toggle('active', a.dataset.page === name));
  (
    ({
      dashboard: loadDashboard,
      incidents: loadIncidents,
      dispatch: loadDispatchPage,
      responders: loadRespondersPage,
      reports: loadReports,
      users: loadUsers,
      settings: loadSettings,
    })[name] || (() => {})
  )();
}
window.showPage = showPage;
function initials(name) {
  return (
    String(name || 'User')
      .trim()
      .split(/\s+/)
      .map((x) => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  );
}
function setAvatar(el, name, src) {
  if (!el) return;
  if (src) {
    el.innerHTML = `<img src="${esc(src)}" alt="Profile picture">`;
    el.classList.add('avatar-image');
  } else {
    el.textContent = initials(name);
    el.classList.remove('avatar-image');
  }
}
async function openProfileModal() {
  const u = window.currentUser;
  if (!u) return;
  const preview = $('selfProfilePreview');
  if (preview)
    preview.innerHTML = u.profile_picture
      ? `<img src="${esc(u.profile_picture)}" alt="Profile preview">`
      : '<i class="fa-solid fa-user"></i>';
  $('profileSelfName').textContent = u.full_name || u.username;
  $('profileSelfRole').textContent = (u.role || 'Account') + ' · ' + (u.username || '');
  const f = $('profileForm');
  if (f) f.dataset.currentPicture = u.profile_picture || '';
  const file = $('selfProfilePicture');
  if (file) file.value = '';
  openModal('profileModal');
}
window.openProfileModal = openProfileModal;
function readProfilePicture(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (file.size > 2 * 1024 * 1024)
      return reject(new Error('Profile picture must be 2 MB or smaller.'));
    if (!/^image\/(jpeg|png|webp)$/.test(file.type))
      return reject(new Error('Use a JPG, PNG, or WEBP image.'));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Could not read the profile picture.'));
    r.readAsDataURL(file);
  });
}
async function loadMe() {
  try {
    const d = await apiFetch('me.php'),
      u = d.user;
    $('userName').textContent = u.full_name;
    $('userRole').textContent = u.role;
    setAvatar($('userAvatar'), u.full_name, u.profile_picture);
    document
      .querySelectorAll('.admin-only')
      .forEach(
        (x) => (x.style.display = ['Super Admin', 'Administrator'].includes(u.role) ? '' : 'none'),
      );
    document.querySelectorAll('.super-admin-only').forEach((x) => (x.style.display = 'none'));
    document
      .querySelectorAll('.admin-only-page')
      .forEach(
        (x) => (x.style.display = ['Super Admin', 'Administrator'].includes(u.role) ? '' : 'none'),
      );
    window.currentUser = u;
  } catch (e) {
    if (e.status === 401) location.href = 'login.html';
    else toast(e.message, false);
  }
}
function initLiveMap() {
  const el = $('liveIncidentMap');
  if (!el || typeof L === 'undefined') return;
  map = L.map(el, { zoomControl: true, scrollWheelZoom: true }).setView([12.8797, 121.774], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);
  if (!el.querySelector('.map-live-badge')) {
    const b = document.createElement('div');
    b.className = 'map-live-badge';
    b.innerHTML = '<span class="dot"></span>LIVE GPS';
    el.appendChild(b);
  }
  setTimeout(() => map.invalidateSize(), 250);
}
function validGps(x) {
  const lat = Number(x?.latitude),
    lng = Number(x?.longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
function incidentMapIcon(x) {
  return L.divIcon({
    className: 'incident-map-marker',
    html: `<div class="incident-map-pin ${x.priority === 'Critical' ? 'critical' : ''}"><i class="fa-solid fa-location-dot"></i></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
    popupAnchor: [0, -31],
  });
}
function categoryIcon(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('medical')) return 'fa-solid fa-kit-medical';
  if (c.includes('fire')) return 'fa-solid fa-fire-flame-curved';
  if (c.includes('disaster') || c.includes('natural')) return 'fa-solid fa-cloud-bolt';
  if (c.includes('security')) return 'fa-solid fa-shield-halved';
  return 'fa-solid fa-triangle-exclamation';
}
function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function renderLiveMap(rows) {
  if (!map) return;
  const gps = (rows || []).filter(
    (x) => validGps(x) && !['Resolved', 'Cancelled'].includes(String(x.status || '')),
  );
  const ids = new Set(gps.map((x) => String(x.id)));
  mapMarkers.forEach((m, id) => {
    if (!ids.has(String(id))) {
      map.removeLayer(m);
      mapMarkers.delete(id);
    }
  });
  mapAccuracyCircles.forEach((c, id) => {
    if (!ids.has(String(id))) {
      map.removeLayer(c);
      mapAccuracyCircles.delete(id);
    }
  });
  gps.forEach((x) => {
    const lat = Number(x.latitude),
      lng = Number(x.longitude);
    const accuracy = Number(x.gps_accuracy);
    const navUrl = mapsUrl(lat, lng);
    const html = `<div class="map-popup"><div class="map-popup-title"><b>🚨 ${esc(x.incident_no)} · ${esc(x.category)}</b><span class="map-popup-status ${String(x.priority || '').toLowerCase()}">${esc(x.priority)}</span></div><div class="map-popup-meta">${esc(x.status)} · ${esc(x.location || 'GPS location')}</div><div class="map-popup-reporter">👤 ${esc(x.reporter_name || 'Reporter')}</div><small class="map-popup-coords">GPS: ${lat.toFixed(7)}, ${lng.toFixed(7)}${Number.isFinite(accuracy) && accuracy > 0 ? ' · ±' + Math.round(accuracy) + ' m' : ''}</small><div class="map-popup-actions"><a class="map-nav-btn" href="${navUrl}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i> OPEN EXACT LOCATION</a><a class="map-details-btn" href="#" onclick="detailsById(${Number(x.id)});return false">VIEW INCIDENT</a></div></div>`;
    if (mapMarkers.has(x.id))
      mapMarkers.get(x.id).setLatLng([lat, lng]).setIcon(incidentMapIcon(x)).bindPopup(html);
    else
      mapMarkers.set(
        x.id,
        L.marker([lat, lng], {
          icon: incidentMapIcon(x),
          title: `${x.incident_no || 'Incident'} GPS`,
        })
          .addTo(map)
          .bindPopup(html),
      );
    if (Number.isFinite(accuracy) && accuracy > 0 && accuracy < 10000) {
      if (mapAccuracyCircles.has(x.id))
        mapAccuracyCircles.get(x.id).setLatLng([lat, lng]).setRadius(accuracy);
      else
        mapAccuracyCircles.set(
          x.id,
          L.circle([lat, lng], {
            radius: accuracy,
            weight: 1,
            fillOpacity: 0.08,
            opacity: 0.35,
            interactive: false,
          }).addTo(map),
        );
    }
  });
  if (gps.length) {
    const bounds = L.latLngBounds(gps.map((x) => [Number(x.latitude), Number(x.longitude)]));
    /* Refit when incidents are added/removed or when their coordinates change. */
    const signature = gps
      .map((x) => `${x.id}:${Number(x.latitude).toFixed(7)},${Number(x.longitude).toFixed(7)}`)
      .sort()
      .join('|');
    if (!map._centered || signature !== map._lastGpsSignature) {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 16 });
      map._centered = true;
      map._lastGpsSignature = signature;
    }
    map._lastGpsCount = gps.length;
  } else if (!map._centered) {
    map.setView([12.8797, 121.774], 6);
  }
}
async function refreshLiveMap() {
  try {
    const d = await apiFetch('incidents.php?active=1');
    renderLiveMap(d.incidents || []);
  } catch (e) {
    console.warn('Live map refresh:', e.message);
  }
}
async function loadDashboard() {
  try {
    const d = await apiFetch('dashboard.php'),
      s = d.stats;
    $('totalIncidents').textContent = s.total_incidents;
    $('activeIncidents').textContent = s.active_incidents;
    $('responderCount').textContent = s.responders;
    $('completedIncidents').textContent = s.completed;
    $('pendingIncidents').textContent = s.pending;
    $('categoriesList').innerHTML =
      (d.categories || [])
        .map((x) => {
          const pct = Math.min(100, Math.max(0, Number(x.percentage || 0)));
          return `<div class="category-row"><div class="category-icon"><i class="${categoryIcon(x.category)}"></i></div><div class="category-content"><div class="category-top"><span>${esc(x.category)}</span><b>${pct}%</b></div><div class="bar" aria-label="${pct}% ${esc(x.category)}"><i style="width:${pct}%"></i></div></div></div>`;
        })
        .join('') || '<div class="empty">No incident categories yet.</div>';
    $('recentIncidents').innerHTML =
      (d.recent_incidents || [])
        .map(
          (x) =>
            `<div class="recent-row" role="button" tabindex="0" onclick="detailsById(${x.id})" onkeydown="if(event.key==='Enter')detailsById(${x.id})"><div class="recent-main"><div class="recent-heading"><b>${esc(x.incident_no)}</b><span class="pill ${String(x.status || '').toLowerCase()}">${esc(x.status)}</span></div><small>${esc(x.category)} · ${esc(x.location || 'Location not provided')}</small><time><i class="fa-regular fa-clock"></i> Reported ${esc(formatIncidentTime(x.created_at))}</time></div></div>`,
        )
        .join('') || '<div class="empty">No incidents yet.</div>';
    const rs = d.response_status || [];
    let get = (n) => (rs.find((x) => x.status === n) || {}).total || 0;
    $('onScene').textContent = get('On Scene');
    $('enRoute').textContent = get('En Route');
    $('standby').textContent = get('Standby');
    $('responseSummary').textContent =
      `${s.completed} resolved of ${s.total_incidents} total incidents`;
    $('responseRate').textContent = s.total_incidents
      ? Math.round((s.completed / s.total_incidents) * 100) + '%'
      : '0%';
    const c = $('incidentChart');
    if (c && window.Chart) {
      chart?.destroy();
      chart = new Chart(c, {
        type: 'line',
        data: {
          labels: d.overview.labels,
          datasets: [{ data: d.overview.values, fill: true, tension: 0.3 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
        },
      });
    }
    $('respondersList').innerHTML =
      (d.responders || [])
        .map(
          (x) =>
            `<div class="responder-row"><div class="responder-main"><b>${esc(x.full_name)}</b><small>${esc(x.type || 'General Responder')} · ${esc(x.phone || 'No phone')}</small></div><span class="availability-badge ${String(
              x.status || '',
            )
              .toLowerCase()
              .replace(
                /\s+/g,
                '-',
              )}"><i class="fa-solid fa-circle"></i>${esc(x.status || 'Unavailable')}</span></div>`,
        )
        .join('') || '<div class="empty">No responders registered.</div>';
    $('apiStatus').textContent = 'Connected';
    renderLiveMap(d.map_incidents || d.recent_incidents || []);
    const ml = document.querySelector('#liveIncidentMap .map-loading');
    if (ml) ml.style.display = (d.map_incidents || []).some(validGps) ? 'none' : 'block';
  } catch (e) {
    $('apiStatus').textContent = 'API error';
    toast(e.message, false);
  }
}
async function loadIncidents() {
  try {
    const q = new URLSearchParams();
    ['incidentSearch', 'incidentStatus', 'incidentPriority', 'incidentCategory'].forEach(
      (id, i) => {
        const v = $(id)?.value;
        if (v) q.set(['search', 'status', 'priority', 'category'][i], v);
      },
    );
    const d = await apiFetch('incidents.php?' + q);
    $('incidentTable').innerHTML =
      (d.incidents || [])
        .map(
          (x) =>
            `<tr><td><b>${esc(x.incident_no)}</b><small>${esc(x.source || 'Dashboard')}</small></td><td>${esc(x.category)}</td><td>${esc(x.location)}</td><td><span class="pill">${esc(x.priority)}</span></td><td><span class="pill">${esc(x.status)}</span></td><td>${esc(x.responder_name || 'Unassigned')}</td><td>${esc(x.created_at)}</td><td><div class="table-actions"><button class="secondary mini" onclick="detailsById(${x.id})"><i class="fa-solid fa-eye"></i> View</button><button class="secondary mini" onclick="updateIncident(${x.id})"><i class="fa-solid fa-pen"></i> Status</button><button class="danger mini" onclick="deleteIncident(${x.id})"><i class="fa-solid fa-trash"></i> Delete</button></div></td></tr>`,
        )
        .join('') || '<tr><td colspan="8">No incidents found.</td></tr>';
  } catch (e) {
    toast(e.message, false);
  }
}
async function loadDispatchPage() {
  try {
    const d = await apiFetch('incidents.php?active=1'),
      q = d.incidents || [];
    $('dispatchCount').textContent = q.length;
    $('dispatchQueue').innerHTML =
      q
        .map((x) => {
          const coords =
            x.latitude != null && x.longitude != null
              ? `${Number(x.latitude).toFixed(5)}, ${Number(x.longitude).toFixed(5)}`
              : '';
          return `<div class="dispatch-item"><div class="dispatch-info"><div class="dispatch-title"><span class="dispatch-no">${esc(x.incident_no)}</span><span class="dispatch-sep">·</span><span class="dispatch-category">${esc(x.category)}</span></div><div class="dispatch-location"><i class="fa-solid fa-location-dot"></i><span>${esc(x.location || 'Location not provided')}</span>${coords ? `<span class="dispatch-coords">${esc(coords)}</span>` : ''}</div><div class="dispatch-meta"><span class="priority-text ${String(x.priority || '').toLowerCase()}">${esc(x.priority)}</span><span class="meta-dot">•</span><span>${esc(x.status)}</span>${x.source ? `<span class="source-tag">${esc(x.source)}</span>` : ''}</div></div><div class="dispatch-action"><button class="primary mini dispatch-btn" onclick="dispatchById(${x.id})"><i class="fa-solid ${x.assigned_responder_id ? 'fa-user-gear' : 'fa-truck-medical'}"></i><span>${x.assigned_responder_id ? 'Change Responder' : 'Dispatch'}</span></button></div></div>`;
        })
        .join('') || '<div class="empty">No incidents need dispatch.</div>';
    const r = await apiFetch('responders.php');
    const responders = r.responders || [];
    const available = responders.filter((x) =>
      ['Available', 'Standby', 'On Duty'].includes(x.status),
    );
    $('dispatchResponders').innerHTML =
      responders
        .map((x) => {
          const av = x.profile_picture
            ? `<img class="user-avatar-thumb" src="${esc(x.profile_picture)}" alt="">`
            : `<span class="user-avatar-thumb">${initials(x.full_name)}</span>`;
          return `<div class="responder-row"><div class="user-avatar-cell">${av}<div><b>${esc(x.full_name)}</b><small>${esc(x.type || 'General Responder')} · ${esc(x.phone || 'No phone')}</small></div></div><span class="pill responder-status-pill ${String(
            x.status || '',
          )
            .toLowerCase()
            .replace(/\s+/g, '-')}">${esc(x.status)}</span></div>`;
        })
        .join('') || '<div class="empty">No responders registered.</div>';
    if ($('availableResponderCount')) $('availableResponderCount').textContent = available.length;
    if ($('enRouteResponderCount'))
      $('enRouteResponderCount').textContent = responders.filter(
        (x) => x.status === 'En Route',
      ).length;
  } catch (e) {
    toast(e.message, false);
  }
}
async function loadRespondersPage() {
  try {
    const q = new URLSearchParams({
      search: $('responderSearch')?.value || '',
      status: $('responderStatus')?.value || '',
    });
    const d = await apiFetch('responders.php?' + q);
    const rows = d.responders || [];
    const table = $('responderTable');
    if (!table) return;
    table.innerHTML =
      rows
        .map((x) => {
          const avatar = x.profile_picture
            ? `<img class="user-avatar-thumb" src="${esc(x.profile_picture)}" alt="">`
            : `<span class="user-avatar-thumb">${initials(x.full_name)}</span>`;
          return `<tr><td><div class="user-avatar-cell">${avatar}<div><b>${esc(x.full_name)}</b><small>${esc(x.type || 'General Responder')}</small></div></div></td><td>${esc(x.type || 'General Responder')}</td><td>${esc(x.phone || '—')}</td><td><span class="pill responder-status-pill ${String(
            x.status || '',
          )
            .toLowerCase()
            .replace(
              /\s+/g,
              '-',
            )}">${esc(x.status || 'Unavailable')}</span></td><td><span class="status-badge active">Managed in User Management</span></td></tr>`;
        })
        .join('') || '<tr><td colspan="5">No responders found.</td></tr>';
  } catch (e) {
    toast(e.message, false);
  }
}
async function loadReports() {
  try {
    const d = await apiFetch(`reports.php?from=${$('reportFrom').value}&to=${$('reportTo').value}`),
      s = d.summary || {};
    $('reportTotal').textContent = s.total || 0;
    $('reportResolved').textContent = s.resolved || 0;
    $('reportActive').textContent = s.active || 0;
    $('reportCritical').textContent = s.critical || 0;
    $('statusBreakdown').innerHTML =
      (d.statuses || [])
        .map(
          (x) =>
            `<div class="progress-row"><span>${esc(x.status)}</span><b>${Number(x.total || 0)}</b></div>`,
        )
        .join('') || '<div class="empty">No status data for this period.</div>';
    $('dailyReport').innerHTML =
      (d.daily || []).map((x) => `<tr><td>${esc(x.day)}</td><td>${x.total}</td></tr>`).join('') ||
      '<tr><td colspan="2">No data.</td></tr>';
    const c = $('reportChart');
    if (c && window.Chart) {
      reportChart?.destroy();
      reportChart = new Chart(c, {
        type: 'bar',
        data: {
          labels: (d.categories || []).map((x) => x.category),
          datasets: [{ data: (d.categories || []).map((x) => x.total) }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
        },
      });
    }
    return d;
  } catch (e) {
    toast(e.message, false);
    return null;
  }
}

function reportDateLabel(v) {
  if (!v) return '';
  const d = new Date(String(v) + 'T00:00:00');
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString([], { year: 'numeric', month: 'long', day: '2-digit' });
}
function reportStatusClass(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-');
}
function buildPrintableReport(d) {
  const s = d.summary || {},
    categories = d.categories || [],
    statuses = d.statuses || [],
    incidents = d.incidents || [],
    trend = d.trend || d.daily || [];
  const generated = new Date().toLocaleString([], {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const user = window.currentUser?.full_name || 'Authorized Administrator',
    total = Number(s.total || 0);
  const pct = (n, t) => (t ? Math.round((Number(n || 0) / Number(t)) * 100) : 0);
  const days = Number(d.days || 1),
    gran = d.granularity || (days <= 62 ? 'daily' : days <= 366 ? 'monthly' : 'yearly');
  const gl = gran === 'daily' ? 'Daily' : gran === 'monthly' ? 'Monthly' : 'Yearly';
  const date = (x) => {
    let z = new Date(`${x}T00:00:00`);
    return isNaN(z)
      ? x
      : z.toLocaleDateString([], { year: 'numeric', month: 'long', day: '2-digit' });
  };
  const period = (x) => {
    if (gran === 'daily') return date(x);
    if (gran === 'yearly') return String(x);
    let [y, m] = String(x).split('-');
    let z = new Date(Number(y), Number(m) - 1, 1);
    return z.toLocaleDateString([], { year: 'numeric', month: 'long' });
  };
  const cats =
    categories
      .map(
        (x) =>
          `<tr><td>${esc(x.category)}</td><td class="num">${+x.total || 0}</td><td class="num">${pct(x.total, total)}%</td></tr>`,
      )
      .join('') || '<tr><td colspan="3" class="empty">No category data.</td></tr>';
  const sts =
    statuses
      .map(
        (x) =>
          `<tr><td><span class="status ${reportStatusClass(x.status)}">${esc(x.status)}</span></td><td class="num">${+x.total || 0}</td><td class="num">${pct(x.total, total)}%</td></tr>`,
      )
      .join('') || '<tr><td colspan="3" class="empty">No status data.</td></tr>';
  const trs =
    trend
      .map(
        (x) =>
          `<tr><td>${esc(period(x.period))}</td><td class="num">${+x.total || 0}</td><td class="num">${pct(x.total, total)}%</td></tr>`,
      )
      .join('') || '<tr><td colspan="3" class="empty">No incidents recorded.</td></tr>';
  const rows =
    incidents
      .map(
        (x, i) =>
          `<tr><td class="num">${i + 1}</td><td><b>${esc(x.incident_no)}</b><small>${esc(x.created_at || '')}</small></td><td>${esc(x.category)}</td><td>${esc(x.location)}</td><td><span class="priority ${reportStatusClass(x.priority)}">${esc(x.priority)}</span></td><td><span class="status ${reportStatusClass(x.status)}">${esc(x.status)}</span></td><td>${esc(x.responder_name || 'Unassigned')}</td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="7" class="empty">No incidents recorded for the selected period.</td></tr>';
  const overview = total
    ? `${total} incident${total === 1 ? '' : 's'} recorded from ${date(d.from)} through ${date(d.to)}. ${+s.resolved || 0} resolved, ${+s.active || 0} active/open, and ${+s.cancelled || 0} cancelled.`
    : 'No emergency incidents were recorded during the selected coverage period.';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Emergency Incident Report</title><style>
@page{size:A4;margin:15mm 13mm 16mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#203338;font-size:9.5px;line-height:1.4}.report{max-width:184mm;margin:auto}.header{border-bottom:3px solid #087f70;padding-bottom:10px;margin-bottom:13px;display:flex;justify-content:space-between;gap:20px}.brand h1{margin:0;color:#087f70;font-size:19px}.brand p{margin:3px 0 0;color:#62767b;font-size:8.5px}.meta{text-align:right;color:#62767b;font-size:8px}.meta strong{display:block;color:#203338;font-size:9px}.title{margin:0 0 3px;font-size:16px}.period{margin:0;color:#62767b}.badge{display:inline-block;margin-left:6px;padding:2px 6px;border:1px solid #b9cfcb;border-radius:10px;color:#087f70;font-size:7px;font-weight:bold;text-transform:uppercase}.section{margin-top:15px;break-inside:avoid}.section h2{font-size:10.5px;letter-spacing:.65px;text-transform:uppercase;margin:0 0 6px;color:#087f70;border-bottom:1px solid #dbe6e5;padding-bottom:4px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.metric{border:1px solid #dce7e6;border-radius:5px;padding:7px 8px;min-height:54px}.metric span{display:block;font-size:6.5px;font-weight:bold;letter-spacing:.55px;color:#728489}.metric b{display:block;font-size:16px;margin-top:2px}.metric small{font-size:6.5px;color:#728489}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.note{background:#f4f8f7;border-left:3px solid #087f70;padding:7px 9px;color:#4e6267;font-size:8.5px}.table{width:100%;border-collapse:collapse;table-layout:fixed}.table th{background:#edf5f3;color:#36545a;text-transform:uppercase;font-size:6.8px;letter-spacing:.35px;text-align:left;padding:5px;border-bottom:1px solid #cbdad8}.table td{padding:5px;border-bottom:1px solid #e7eeee;vertical-align:top;word-wrap:break-word}.num{text-align:right}.table small{display:block;color:#7a898d;font-size:6.5px;margin-top:1px}.empty{text-align:center;color:#7a898d;padding:11px!important}.status,.priority{display:inline-block;padding:2px 5px;border-radius:9px;font-size:6.5px;font-weight:bold;text-transform:uppercase}.status.resolved{background:#e6f5ef;color:#087f70}.status.pending{background:#fff6df;color:#9b7000}.status.dispatched,.status.active{background:#e8f1ff;color:#3266a5}.status.cancelled{background:#f0f2f3;color:#647177}.priority.critical{background:#fde9e9;color:#c62828}.priority.high{background:#fff0df;color:#b85d00}.priority.moderate{background:#eef4f5;color:#526a70}.priority.low{background:#eef7f1;color:#397356}.footer{margin-top:18px;padding-top:7px;border-top:1px solid #dbe6e5;color:#7a898d;font-size:7px;display:flex;justify-content:space-between;gap:12px}.incident-table th:nth-child(1){width:5%}.incident-table th:nth-child(2){width:14%}.incident-table th:nth-child(3){width:14%}.incident-table th:nth-child(4){width:24%}.incident-table th:nth-child(5){width:10%}.incident-table th:nth-child(6){width:11%}.incident-table th:nth-child(7){width:22%}@media print{tr{break-inside:avoid}.table thead{display:table-header-group}}@media screen{body{background:#eef3f2;padding:30px}.report{background:#fff;padding:24px;box-shadow:0 8px 30px #17313922}}
</style></head><body><main class="report">
<header class="header"><div class="brand"><h1>${esc(window.deploymentSettings?.barangay_name || 'Barangay Tondod').toUpperCase()}</h1><p>Emergency Dispatch & Incident Management System</p></div><div class="meta"><strong>OFFICIAL OPERATIONAL REPORT</strong>Generated ${esc(generated)}<br>Prepared by ${esc(user)}</div></header>
<h2 class="title">Emergency Incident Report <span class="badge">${gl} Coverage</span></h2>
<p class="period">Reporting period: <b>${esc(date(d.from))}</b> to <b>${esc(date(d.to))}</b> · ${days} day${days === 1 ? '' : 's'} covered</p>
<section class="section"><h2>Executive Summary</h2><div class="summary">
<div class="metric"><span>Total Incidents</span><b>${total}</b><small>All reports received</small></div><div class="metric"><span>Resolved</span><b>${+s.resolved || 0}</b><small>${pct(s.resolved, total)}% of total</small></div><div class="metric"><span>Active / Open</span><b>${+s.active || 0}</b><small>Requires monitoring</small></div><div class="metric"><span>Cancelled</span><b>${+s.cancelled || 0}</b><small>Not active</small></div><div class="metric"><span>Critical</span><b>${+s.critical || 0}</b><small>High priority</small></div></div><div class="note" style="margin-top:7px"><b>Period overview:</b> ${esc(overview)}</div></section>
<section class="section grid"><div><h2>Incidents by Category</h2><table class="table"><thead><tr><th>Category</th><th class="num">Count</th><th class="num">Share</th></tr></thead><tbody>${cats}</tbody></table></div><div><h2>Status Breakdown</h2><table class="table"><thead><tr><th>Status</th><th class="num">Count</th><th class="num">Share</th></tr></thead><tbody>${sts}</tbody></table></div></section>
<section class="section"><h2>${gl} Incident Volume</h2><table class="table"><thead><tr><th>${gl === 'Daily' ? 'Date' : gl === 'Monthly' ? 'Month' : 'Year'}</th><th class="num">Incidents</th><th class="num">Share</th></tr></thead><tbody>${trs}</tbody></table></section>
<section class="section incident-register"><h2>Incident Register</h2><div class="note">Every incident below falls within the selected reporting period. Use the incident number as the official case reference.</div><table class="table incident-table"><thead><tr><th>#</th><th>Incident No. / Time</th><th>Category</th><th>Location</th><th>Priority</th><th>Status</th><th>Assigned Responder</th></tr></thead><tbody>${rows}</tbody></table></section>
<footer class="footer"><span>${esc(window.deploymentSettings?.barangay_name || 'Barangay Tondod')} Emergency Dispatch System</span><span>Confidential operational record · ${gl} coverage</span></footer>
</main><script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script></body></html>`;
}

async function generateReportAndPrint() {
  const d = await loadReports();
  if (!d) return;
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) {
    toast('Please allow pop-ups to print the report.', false);
    return;
  }
  w.document.open();
  w.document.write(buildPrintableReport(d));
  w.document.close();
}

async function loadUsers() {
  try {
    const d = await apiFetch('users.php');
    const rows = d.users || [];
    const table = $('userTable');
    if (!table) return;
    table.innerHTML =
      rows
        .map((x) => {
          const inactive = String(x.status).toLowerCase() === 'inactive';
          const isSuper = String(x.role) === 'Super Admin';
          const avatar = x.profile_picture
            ? `<img class="user-avatar-thumb" src="${esc(x.profile_picture)}" alt="">`
            : `<span class="user-avatar-thumb">${initials(x.full_name)}</span>`;
          return `<tr><td><div class="user-avatar-cell">${avatar}<div><b>${esc(x.full_name)}</b><small>${esc(x.role)}</small></div></div></td><td>${esc(x.username)}</td><td>${esc(x.role)}</td><td><span class="status-badge ${inactive ? 'pending' : 'active'}">${esc(inactive ? 'PENDING' : 'ACTIVE')}</span></td><td>${esc(x.created_at || '')}</td><td class="user-actions">${isSuper ? '<span class="status-badge active">Protected</span>' : `<button type="button" class="secondary mini" data-edit-user="${Number(x.id)}"><i class="fa-solid fa-pen"></i> Edit</button>${inactive ? `<button type="button" class="primary mini" data-toggle-user="${Number(x.id)}" data-next-status="active"><i class="fa-solid fa-check"></i> Approve</button>` : `<button type="button" class="secondary mini" data-toggle-user="${Number(x.id)}" data-next-status="inactive"><i class="fa-solid fa-ban"></i> Disable</button>`}<button type="button" class="danger mini" data-delete-user="${Number(x.id)}"><i class="fa-solid fa-trash"></i> Delete</button>`}</td></tr>`;
        })
        .join('') || '<tr><td colspan="6">No users.</td></tr>';
    table.onclick = async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const id = Number(b.dataset.editUser || b.dataset.toggleUser || b.dataset.deleteUser);
      const row = rows.find((r) => Number(r.id) === id);
      try {
        if (b.dataset.editUser) {
          openUserModal(row);
        } else if (b.dataset.toggleUser) {
          await setUserStatus(id, b.dataset.nextStatus);
        } else if (b.dataset.deleteUser) {
          await deleteUser(id);
        }
      } catch (e) {
        toast(e.message, false);
      }
    };
  } catch (e) {
    toast(e.message, false);
  }
}
async function setUserStatus(id, status) {
  const active = status === 'active';
  if (
    !confirm(
      active
        ? 'Approve and activate this account?'
        : 'Disable this account? The user will no longer be able to log in.',
    )
  )
    return;
  await apiFetch('users.php', {
    method: 'PATCH',
    body: JSON.stringify({ id: Number(id), status }),
  });
  toast(active ? 'Account approved and activated.' : 'Account disabled.');
  await loadUsers();
  await loadRespondersPage();
}
async function approveUser(id) {
  return setUserStatus(id, 'active');
}
async function loadSettings() {
  try {
    const d = await apiFetch('settings.php');
    for (const k of ['barangay_name', 'city', 'hotline'])
      if (d.settings?.[k])
        $(
          k === 'barangay_name' ? 'barangayName' : k === 'city' ? 'barangayCity' : 'hotline',
        ).value = d.settings[k];
  } catch (e) {
    toast(e.message, false);
  }
}
async function saveSettings() {
  try {
    const payload = {
      barangay_name: $('barangayName')?.value.trim(),
      city: $('barangayCity')?.value.trim(),
      hotline: $('hotline')?.value.trim(),
    };
    if (!payload.barangay_name || !payload.city || !payload.hotline)
      throw Error('Barangay name, city, and emergency hotline are required.');
    await apiFetch('settings.php', { method: 'POST', body: JSON.stringify(payload) });
    window.deploymentSettings = { ...(window.deploymentSettings || {}), ...payload };
    window.applyDeploymentSettings?.(window.deploymentSettings);
    toast('Deployment settings saved and applied across the entire system.');
    await loadSettings();
  } catch (e) {
    toast(e.message, false);
  }
}
function openIncidentModal() {
  openModal('incidentModal');
}
function openUserModal(x = null, forcedRole = '') {
  const f = $('userForm');
  if (!f) return;
  f.reset();
  f.dataset.id = x?.id || '';
  f.full_name.value = x?.full_name || '';
  f.username.value = x?.username || '';
  f.username.disabled = !!x;
  f.password.required = !x;
  f.password.value = '';
  if (f.confirm_password) {
    f.confirm_password.required = !x;
    f.confirm_password.value = '';
  }
  const selectedRole = forcedRole || x?.role || 'Responder';
  f.role.value = ['Administrator', 'Responder'].includes(selectedRole) ? selectedRole : 'Responder';
  f.status.value = String(x?.status || 'active').toLowerCase();
  if (f.phone) f.phone.value = x?.phone || x?.responder_phone || '';
  f.profile_picture_file.value = '';
  f.dataset.profilePicture = x?.profile_picture || '';
  const preview = $('profilePreview');
  if (preview) {
    preview.innerHTML = x?.profile_picture
      ? `<img src="${esc(x.profile_picture)}" alt="Profile preview">`
      : '<i class="fa-solid fa-user"></i>';
  }
  $('userModalTitle').textContent = x ? 'Edit Account' : 'Add New User';
  openModal('userModal');
  setTimeout(() => f.full_name.focus(), 80);
}
function details(x) {
  const modal = document.createElement('div');
  modal.className = 'dispatch-modal';

  // Accept the canonical DB field plus aliases returned by older API variants.
  const photoPath = x.image_path || x.photo_path || x.incident_photo_path || x.image_url || '';
  const photoUrl = photoPath
    ? /^https?:\/\//i.test(String(photoPath))
      ? String(photoPath)
      : window.appAssetUrl
        ? window.appAssetUrl(photoPath)
        : '../' + String(photoPath).replace(/^\/+/, '').split('/').filter(Boolean).join('/')
    : '';
  const reporterPhone = x.contact_number || x.reporter_phone || '';
  const safePhone = String(reporterPhone).replace(/[^0-9+*#,;]/g, '');
  const hasGps = x.latitude != null && x.longitude != null;
  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${encodeURIComponent(x.latitude)},${encodeURIComponent(x.longitude)}`
    : '';

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card incident-detail-card">
      <button class="modal-close" type="button" aria-label="Close incident details">×</button>

      <div class="incident-detail-header">
        <div>
          <span class="incident-detail-eyebrow">INCIDENT ${esc(x.incident_no)}</span>
          <h2>${esc(x.category)}</h2>
        </div>
        <span class="incident-priority ${String(x.priority || '').toLowerCase()}">${esc(x.priority || 'Moderate')}</span>
      </div>

      <p class="incident-detail-description">${esc(x.description || 'No description provided.')}</p>

      <div class="incident-detail-photo" style="margin:14px 0;padding:12px;border:1px solid #dce8e5;border-radius:12px">
        <strong style="display:block;margin-bottom:8px">SOS ATTACHED PHOTO</strong>
        ${
          photoUrl
            ? `
          <a href="${esc(photoUrl)}" target="_blank" rel="noopener noreferrer">
            <img src="${esc(photoUrl)}" alt="Attached SOS incident photo" loading="eager" style="display:block;max-width:100%;max-height:320px;border-radius:8px;object-fit:contain" onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('afterend','<small>Photo file not found. Check the uploads/sos folder and stored image path.</small>')">
          </a>
        `
            : '<small>No photo was attached to this report.</small>'
        }
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <small>LOCATION</small>
          <b>${esc(x.location || 'Not provided')}</b>
        </div>
        <div class="detail-item">
          <small>REPORTER</small>
          <b>${esc(x.reporter_name || 'Not provided')}</b>
        </div>
        <div class="detail-item contact-item">
          <small>CONTACT</small>
          <div class="contact-entry">
            <span class="contact-number">${esc(reporterPhone || 'Not provided')}</span>
            ${safePhone ? `<a class="call-reporter-button" href="tel:${esc(safePhone)}"><i class="fa-solid fa-phone"></i> CALL REPORTER</a>` : ''}
          </div>
        </div>
        <div class="detail-item">
          <small>SOURCE</small>
          <b>${esc(x.source || 'Dashboard')}</b>
        </div>
      </div>

      ${
        hasGps
          ? `
        <a
          class="gps-location-button"
          href="${mapsUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="gps-location-icon"><i class="fa-solid fa-location-dot"></i></span>
          <span class="gps-location-copy">
            <strong>Open GPS Location</strong>
            <small>View the reported coordinates in Google Maps</small>
          </span>
          <i class="fa-solid fa-arrow-up-right-from-square gps-location-arrow"></i>
        </a>
      `
          : ''
      }

      <button class="dispatch-wide" id="d" type="button">
        <i class="fa-solid fa-truck-medical"></i>
        DISPATCH RESPONDER
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('.modal-close').onclick = () => modal.remove();
  modal.querySelector('.modal-backdrop').onclick = () => modal.remove();
  modal.querySelector('#d').onclick = () => {
    modal.remove();
    dispatchById(x.id);
  };
}
async function detailsById(id) {
  const d = await apiFetch('incidents.php?id=' + id);
  if (d.incidents?.[0]) details(d.incidents[0]);
}
async function dispatchById(id) {
  try {
    const incD = await apiFetch('incidents.php?id=' + encodeURIComponent(id));
    const inc = (incD.incidents || [])[0];
    if (!inc) {
      toast('Emergency incident was not found.', false);
      return;
    }
    const rsD = await apiFetch('responders.php');
    const rs = rsD.responders || [];
    const av = rs.filter((r) => ['Available', 'Standby', 'On Duty'].includes(String(r.status)));
    const m = document.createElement('div');
    m.className = 'dispatch-modal';
    m.innerHTML = `<div class="modal-backdrop"></div><div class="modal-card dispatch-dialog"><button class="modal-close" aria-label="Close">×</button><div class="modal-head dispatch-modal-head"><div class="dispatch-title"><small>DISPATCH EMERGENCY</small><h2>${esc(inc.incident_no)}</h2></div><span class="dispatch-priority ${String(inc.priority || 'Moderate').toLowerCase()}"><i class="fa-solid fa-flag"></i><b>${esc(inc.priority || 'Moderate')}</b><small>PRIORITY</small></span></div><div class="dispatch-dialog-info"><b>${esc(inc.category)}</b><span>📍 ${esc(inc.location || 'Location not provided')}</span>${inc.latitude != null && inc.longitude != null ? `<span>GPS: ${Number(inc.latitude).toFixed(5)}, ${Number(inc.longitude).toFixed(5)}</span>` : ''}</div><label class="dispatch-select-label">Available responder<select id="dispatchResponder" ${av.length ? '' : 'disabled'}><option value="">${av.length ? 'Choose responder...' : 'No available responder'}</option>${av.map((r) => `<option value="${r.id}">${esc(r.full_name)} — ${esc(r.type || 'Responder')}</option>`).join('')}</select></label><div class="dispatch-help"><div class="dispatch-help-title"><i class="fa-solid fa-circle-info"></i><strong>STATUS AFTER DISPATCH</strong></div><div class="dispatch-status-flow"><span class="status-chip dispatched"><i class="fa-solid fa-check"></i> DISPATCHED</span><i class="fa-solid fa-arrow-right status-arrow"></i><span class="status-chip enroute"><i class="fa-solid fa-route"></i> EN ROUTE</span></div><p>The incident will be marked <b>Dispatched</b> and the selected responder will be marked <b>En Route</b>.</p></div><button class="dispatch-wide" id="confirmDispatch" ${av.length ? '' : 'disabled'}><i class="fa-solid fa-truck-medical"></i> CONFIRM DISPATCH</button></div>`;
    document.body.appendChild(m);
    m.querySelector('.modal-close').onclick = () => m.remove();
    m.querySelector('.modal-backdrop').onclick = () => m.remove();
    m.querySelector('#confirmDispatch').onclick = async () => {
      const rid = m.querySelector('#dispatchResponder').value;
      if (!rid) {
        toast('Please select an available responder.', false);
        return;
      }
      const btn = m.querySelector('#confirmDispatch');
      btn.disabled = true;
      btn.textContent = 'DISPATCHING...';
      try {
        const result = await apiFetch('incidents.php', {
          method: 'PATCH',
          body: JSON.stringify({ id: Number(id), assigned_responder_id: Number(rid) }),
        });
        if (!result.success) throw Error(result.message || 'Dispatch failed.');
        m.remove();
        toast(
          result.notification_created === false
            ? 'Responder dispatched. Apply device_notifications_migration.sql to enable responder notifications.'
            : 'Responder dispatched and notification sent.',
        );
        await Promise.all([loadDashboard(), loadIncidents(), loadDispatchPage()]);
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-truck-medical"></i> CONFIRM DISPATCH';
        toast(e.message || 'Dispatch failed.', false);
      }
    };
  } catch (e) {
    toast(e.message || 'Unable to open dispatch.', false);
  }
}
async function updateIncident(id) {
  try {
    const d = await apiFetch('incidents.php?id=' + encodeURIComponent(id));
    const inc = (d.incidents || [])[0];
    if (!inc) {
      toast('Incident not found.', false);
      return;
    }
    const modal = document.createElement('div');
    modal.className = 'status-modal';
    const statuses = [
      ['Pending', 'fa-clock', 'pending'],
      ['Dispatched', 'fa-truck-medical', 'dispatched'],
      ['Active', 'fa-signal', 'active'],
      ['Resolved', 'fa-circle-check', 'resolved'],
      ['Cancelled', 'fa-ban', 'cancelled'],
    ];
    modal.innerHTML = `<div class="status-backdrop"></div><section class="status-dialog"><button class="status-close" aria-label="Close">×</button><div class="status-dialog-head"><div><span>UPDATE INCIDENT STATUS</span><h2>${esc(inc.incident_no)}</h2></div><span class="status-priority ${String(inc.priority || '').toLowerCase()}">${esc(inc.priority || 'Moderate')}</span></div><div class="status-context"><b>${esc(inc.category || 'Emergency')}</b><p><i class="fa-solid fa-location-dot"></i> ${esc(inc.location || 'Location not provided')}</p><small>Current status: <strong>${esc(inc.status || 'Pending')}</strong></small></div><div class="status-options">${statuses.map(([name, icon, cls]) => `<button type="button" class="status-choice ${cls} ${name === inc.status ? 'selected' : ''}" data-status="${name}"><span><i class="fa-solid ${icon}"></i></span><strong>${name}</strong><small>${name === 'Resolved' ? 'Close and remove from live board' : name === 'Cancelled' ? 'Cancel and keep only in admin incident history' : name === 'Dispatched' ? 'Responder assigned / en route' : name === 'Active' ? 'Emergency is currently being handled' : 'Waiting for dispatch'}</small></button>`).join('')}</div><div class="status-help"><i class="fa-solid fa-shield-halved"></i> Resolved and Cancelled require Administrator confirmation.</div></section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.status-close').onclick = close;
    modal.querySelector('.status-backdrop').onclick = close;
    modal.querySelectorAll('.status-choice').forEach(
      (btn) =>
        (btn.onclick = async () => {
          const status = btn.dataset.status;
          if (status === inc.status) {
            close();
            return;
          }
          if (
            status === 'Resolved' &&
            !confirm(
              'Confirm resolution? This incident will immediately disappear from the LIVE incident board.',
            )
          )
            return;
          if (
            status === 'Cancelled' &&
            !confirm(
              'Cancel this incident? It will remain only in the Administrator Incident Management list.',
            )
          )
            return;
          btn.disabled = true;
          btn.classList.add('saving');
          try {
            await apiFetch('incidents.php', {
              method: 'PATCH',
              body: JSON.stringify({ id: Number(id), status }),
            });
            close();
            toast(
              status === 'Resolved'
                ? 'Incident resolved and removed from the live board.'
                : status === 'Cancelled'
                  ? 'Incident cancelled and moved to admin history.'
                  : 'Incident status updated.',
            );
            await Promise.all([loadIncidents(), loadDashboard(), loadDispatchPage()]);
          } catch (e) {
            btn.disabled = false;
            btn.classList.remove('saving');
            toast(e.message, false);
          }
        }),
    );
  } catch (e) {
    toast(e.message, false);
  }
}

async function deleteIncident(id) {
  if (!confirm('Delete this emergency incident permanently?')) return;
  try {
    let data;
    try {
      data = await apiFetch('incidents.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', id: Number(id) }),
      });
    } catch (_) {
      data = await apiFetch('incidents.php?id=' + encodeURIComponent(id), { method: 'DELETE' });
    }
    if (!data.success) throw Error(data.message || 'Delete failed.');
    toast('Emergency incident deleted successfully.');
    await loadIncidents();
    await loadDashboard();
    await loadDispatchPage();
  } catch (e) {
    toast(e.message, false);
  }
}

async function removeResponder(id) {
  if (!confirm('Delete this responder?')) return;
  try {
    await apiFetch('responders.php?id=' + id, { method: 'DELETE' });
    toast('Responder deleted.');
    await loadRespondersPage();
    await loadDashboard();
  } catch (e) {
    toast(e.message, false);
  }
}

async function deleteUser(id) {
  if (!confirm('Delete this user?')) return;
  try {
    await apiFetch('users.php?id=' + id, { method: 'DELETE' });
    toast('User deleted.');
    await loadUsers();
  } catch (e) {
    toast(e.message, false);
  }
}
function showEmergencyAlert(x) {
  let stack = document.getElementById('alertStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'alertStack';
    stack.className = 'alert-stack';
    document.body.appendChild(stack);
  }
  const seenKey = 'bt_admin_alert_seen_' + x.id;
  if (sessionStorage.getItem(seenKey) === '1') return;
  if (stack.querySelector('[data-alert-id=\"' + x.id + '\"]')) return;
  sessionStorage.setItem(seenKey, '1');
  const el = document.createElement('div');
  el.className =
    'live-alert ' + (String(x.priority || '').toLowerCase() === 'critical' ? 'critical-alert' : '');
  el.dataset.alertId = x.id;
  el.innerHTML =
    '<div class=\"alert-icon\"><i class=\"fa-solid fa-triangle-exclamation\"></i></div><div class=\"alert-content\"><h3>NEW EMERGENCY · ' +
    esc(x.incident_no || 'Emergency') +
    '</h3><p><b>' +
    esc(x.category || 'Emergency') +
    '</b> · <span class=\"priority-text\">' +
    esc(x.priority || 'Critical') +
    '</span></p><p>📍 ' +
    esc(x.location || 'Location unavailable') +
    '</p><p>👤 ' +
    esc(x.reporter_name || 'Bystander') +
    ' · <strong>Reported ' +
    esc(formatIncidentTime(x.created_at)) +
    '</strong></p><div class=\"alert-actions\"><button class=\"view\" type=\"button\">VIEW INCIDENT</button><button class=\"close\" type=\"button\">DISMISS</button></div></div>';
  el.querySelector('.view').onclick = () => {
    el.remove();
    detailsById(x.id);
    showPage('incidents');
    updateNotificationCount(-1);
  };
  el.querySelector('.close').onclick = () => {
    el.remove();
    updateNotificationCount(-1);
  };
  stack.appendChild(el);
  updateNotificationCount(1);
  if (notificationEnabled && typeof playNotificationSound === 'function')
    playNotificationSound(5000);
  if (browserNotificationEnabled && 'Notification' in window) {
    try {
      new Notification('🚨 NEW EMERGENCY · ' + (x.incident_no || ''), {
        body:
          (x.category || 'Emergency') +
          ' · ' +
          (x.location || 'Location unavailable') +
          '\nReported ' +
          formatIncidentTime(x.created_at),
        tag: 'incident-' + x.id,
      });
    } catch (e) {}
  }
}
async function enableAlerts() {
  notificationEnabled = true;
  localStorage.setItem('bt_admin_alerts', '1');
  let soundPlayed = false;
  if (
    typeof unlockNotificationSound === 'function' &&
    typeof playNotificationSound === 'function'
  ) {
    try {
      await unlockNotificationSound();
      soundPlayed = await playNotificationSound(1100);
    } catch (e) {
      console.warn('Admin alert sound could not be previewed:', e.message);
    }
  }
  if ('Notification' in window && Notification.permission === 'default')
    Notification.requestPermission()
      .then((p) => {
        browserNotificationEnabled = p === 'granted';
      })
      .catch(() => {});
  const b = $('enableAlerts');
  if (b) {
    b.classList.add('enabled');
    b.innerHTML = '<i class="fa-solid fa-volume-high"></i> ALERTS ON';
  }
  toast(
    soundPlayed
      ? 'Emergency alerts enabled. Test sound played.'
      : 'Emergency alerts enabled, but the sound preview could not play. Check the notification sound file.',
  );
}
function loadNotifications() {
  showPage('incidents');
  loadIncidents();
}

function updateNotificationCount(delta = 0, set = null) {
  const n = document.querySelector('#notifCount');
  if (!n) return;
  const v = set === null ? Math.max(0, Number(n.textContent || 0) + delta) : Number(set);
  n.textContent = String(v);
  n.style.display = v > 0 ? 'block' : 'none';
}
async function loadInitialNotifications() {
  try {
    const d = await apiFetch('notifications.php');
    updateNotificationCount(0, d.unread_count ?? d.count ?? 0);
    lastRealtimeId = Number(d.last_id || 0);
    sessionStorage.setItem('bt_admin_realtime_last_id', String(lastRealtimeId));
  } catch (e) {
    console.warn('Notification load failed', e);
  }
}
async function realtime() {
  try {
    let d;
    try {
      d = await apiFetch('notifications.php?after_id=' + encodeURIComponent(lastRealtimeId));
    } catch (e) {
      d = await apiFetch('realtime.php?after_id=' + encodeURIComponent(lastRealtimeId));
    }
    const rows = d.notifications || d.incidents || [];
    if (rows.length) {
      for (const x of rows) {
        lastRealtimeId = Math.max(lastRealtimeId, Number(x.id || 0));
        sessionStorage.setItem('bt_admin_realtime_last_id', String(lastRealtimeId));
        // Render the actual in-page emergency popup. The popup itself updates
        // the notification badge, plays the configured sound, and optionally
        // sends a browser notification. Do not increment the badge separately
        // here or it will be counted twice.
        showEmergencyAlert(x);
      }
      await loadDashboard();
      if ($('page-incidents')?.classList.contains('active-page')) await loadIncidents();
    } else {
      lastRealtimeId = Math.max(lastRealtimeId, Number(d.last_id || 0));
      sessionStorage.setItem('bt_admin_realtime_last_id', String(lastRealtimeId));
    }
    await refreshLiveMap();
  } catch (e) {
    console.warn('Realtime notification error', e.message);
  }
}
function editUser(x) {
  openUserModal(x);
}
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('[data-page]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const page = a.dataset.page;
      history.replaceState(null, '', '#' + page);
      showPage(page);
      $('sidebar')?.classList.remove('open');
    }),
  );
  window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#', '');
    if (document.getElementById('page-' + page)) showPage(page);
  });
  const initialPage = location.hash.replace('#', '');
  if (document.getElementById('page-' + initialPage)) showPage(initialPage);
  $('menu')?.addEventListener('click', () => $('sidebar')?.classList.toggle('open'));
  $('userAvatar')?.addEventListener('click', openProfileModal);
  $('selfProfilePicture')?.addEventListener('change', async (e) => {
    try {
      const data = await readProfilePicture(e.target.files?.[0]);
      if (data) {
        $('selfProfilePreview').innerHTML = `<img src="${esc(data)}" alt="Profile preview">`;
        e.target.dataset.value = data;
      }
    } catch (x) {
      e.target.value = '';
      toast(x.message, false);
    }
  });
  $('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const f = e.target,
        file = $('selfProfilePicture');
      const data =
        file?.dataset.value !== undefined ? file.dataset.value : f.dataset.currentPicture || '';
      await apiFetch('profile.php', {
        method: 'PATCH',
        body: JSON.stringify({ profile_picture: data }),
      });
      const d = await apiFetch('me.php');
      window.currentUser = d.user;
      setAvatar($('userAvatar'), d.user.full_name, d.user.profile_picture);
      closeModal('profileModal');
      toast('Profile picture updated successfully.');
    } catch (x) {
      toast(x.message, false);
    }
  });
  $('logoutBtn')?.addEventListener('click', async () => {
    await apiFetch('logout.php', { method: 'POST' });
    location.href = 'login.html';
  });
  document.addEventListener(
    'pointerdown',
    () => {
      if (notificationEnabled) {
        try {
          audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
          audioContext.resume();
        } catch (e) {}
      }
    },
    { once: false, passive: true },
  );
  $('notifBtn')?.addEventListener('click', () => {
    loadNotifications?.();
  });
  $('globalSearch')?.addEventListener('input', (e) => {
    if ($('incidentSearch')) $('incidentSearch').value = e.target.value;
    showPage('incidents');
    loadIncidents();
  });
  $('incidentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = Object.fromEntries(new FormData(e.target));
      await apiFetch('incidents.php', { method: 'POST', body: JSON.stringify(d) });
      closeModal('incidentModal');
      e.target.reset();
      toast('Incident reported.');
      loadDashboard();
      loadIncidents();
    } catch (x) {
      toast(x.message, false);
    }
  });
  $('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = Object.fromEntries(new FormData(e.target));
      const id = e.target.dataset.id;
      const editing = !!id;
      if (!editing && d.password !== d.confirm_password)
        throw Error('Password and Confirm Password do not match.');
      const file = $('profilePicture')?.files?.[0];
      if (file) d.profile_picture = await readProfilePicture(file);
      else if (editing) d.profile_picture = e.target.dataset.profilePicture || '';
      delete d.profile_picture_file;
      if (editing) {
        d.id = Number(id);
        delete d.username;
        if (!d.password) {
          delete d.password;
          delete d.confirm_password;
        }
      }
      await apiFetch('users.php', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(d) });
      closeModal('userModal');
      toast(
        editing ? 'Account details updated successfully.' : 'User account created successfully.',
      );
      await loadUsers();
      await loadRespondersPage();
      await loadDashboard();
    } catch (x) {
      toast(x.message, false);
    }
  });
  $('profilePicture')?.addEventListener('change', async (e) => {
    try {
      const data = await readProfilePicture(e.target.files?.[0]);
      const preview = $('profilePreview');
      if (preview && data) preview.innerHTML = `<img src="${esc(data)}" alt="Profile preview">`;
    } catch (x) {
      e.target.value = '';
      toast(x.message, false);
    }
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.password-toggle');
    if (!b) return;
    e.preventDefault();
    const target = b.dataset.target;
    const input = target ? $(target) : b.closest('.password-field')?.querySelector('input');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = show
      ? '<i class="fa-regular fa-eye-slash"></i>'
      : '<i class="fa-regular fa-eye"></i>';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  $('incidentSearch')?.addEventListener('input', loadIncidents);
  $('incidentStatus')?.addEventListener('change', loadIncidents);
  $('incidentPriority')?.addEventListener('change', loadIncidents);
  $('incidentCategory')?.addEventListener('change', loadIncidents);
  $('responderSearch')?.addEventListener('input', loadRespondersPage);
  $('responderStatus')?.addEventListener('change', loadRespondersPage);
  $('enableAlerts')?.addEventListener('click', enableAlerts);
  if (notificationEnabled) {
    $('enableAlerts')?.classList.add('enabled');
    if ($('enableAlerts'))
      $('enableAlerts').innerHTML = '<i class="fa-solid fa-volume-high"></i> ALERTS ON';
  }
  $('captureIncidentGps')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      $('gpsCaptureStatus').textContent = 'GPS is not supported.';
      return;
    }
    $('gpsCaptureStatus').textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        $('incidentLatitude').value = p.coords.latitude.toFixed(7);
        $('incidentLongitude').value = p.coords.longitude.toFixed(7);
        $('gpsCaptureStatus').textContent =
          `GPS captured: ${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
      },
      () => {
        $('gpsCaptureStatus').textContent = 'Unable to get GPS location.';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
  const now = new Date(),
    first = new Date(now.getFullYear(), now.getMonth(), 1);
  if ($('reportFrom')) $('reportFrom').value = first.toISOString().slice(0, 10);
  if ($('reportTo')) $('reportTo').value = now.toISOString().slice(0, 10);
  initLiveMap();
  await loadMe();
  await loadDashboard();
  await loadInitialNotifications();
  setInterval(realtime, 2000);
  setInterval(() => {
    if ($('page-dashboard')?.classList.contains('active-page')) {
      loadDashboard();
      refreshLiveMap();
    }
  }, 10000);
});
