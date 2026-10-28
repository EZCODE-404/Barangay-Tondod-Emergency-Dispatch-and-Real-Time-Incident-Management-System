const latestRows = document.getElementById('latestRows');
const latestCount = document.getElementById('latestCount');
const latestDate = document.getElementById('latestDate');
const latestClock = document.getElementById('latestClock');
const latestAlertButton = document.getElementById('latestAlertButton');
const latestTickerTrack = document.getElementById('latestTickerTrack');

let latestLastRealtimeId = Number(sessionStorage.getItem('bt_latest_realtime_last_id') || 0);
let latestAlertsEnabled = localStorage.getItem('bt_admin_alerts') === '1';
let latestVerticalTimer = null;
let latestVerticalIndex = 0;
let latestVerticalCount = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/*
 * Philippine Standard Time
 */
const PHILIPPINE_TIMEZONE = 'Asia/Manila';

function formatDateLabel(date) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: PHILIPPINE_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
    .format(date)
    .toUpperCase();
}

/*
 * Format incident timestamps.
 *
 * MySQL DATETIME values do not contain timezone information.
 * They are treated as Philippine Standard Time (UTC+08:00).
 */
function formatTime(value) {
  if (!value) {
    return '--:--';
  }

  const raw = String(value).trim();

  /*
   * MySQL DATETIME:
   * YYYY-MM-DD HH:MM:SS
   */
  const mysqlMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (mysqlMatch) {
    const hour = mysqlMatch[4];
    const minute = mysqlMatch[5];

    return `${hour}:${minute}`;
  }

  /*
   * ISO timestamps that already contain
   * timezone information.
   */
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: PHILIPPINE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function priorityClass(priority) {
  return String(priority || 'Moderate').toLowerCase();
}

function statusClass(status) {
  return String(status || '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

const reverseLocationCache = new Map();

function incidentCoordinates(incident) {
  const lat = Number(incident?.latitude);
  const lon = Number(incident?.longitude);

  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;

  if (reverseLocationCache.has(key)) {
    return reverseLocationCache.get(key);
  }

  const stored = sessionStorage.getItem(`bt_reverse_${key}`);

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      reverseLocationCache.set(key, parsed);
      return parsed;
    } catch (_) {}
  }

  const fallback = `GPS ${lat.toFixed(6)}, ${lon.toFixed(6)}`;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error('Reverse geocoding unavailable');
    }

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

    reverseLocationCache.set(key, result);

    try {
      sessionStorage.setItem(`bt_reverse_${key}`, JSON.stringify(result));
    } catch (_) {}

    return result;
  } catch (_) {
    reverseLocationCache.set(key, fallback);
    return fallback;
  }
}

async function enrichIncidentLocations(incidents) {
  await Promise.all(
    incidents.map(async (incident) => {
      const coords = incidentCoordinates(incident);

      if (!coords) {
        return;
      }

      incident.location_name = await reverseGeocode(coords.lat, coords.lon);
    }),
  );

  renderLatestIncidents(incidents);
  renderLiveTicker(incidents);
}

function buildIncidentRow(incident) {
  return `
    <article class="latest-row latest-row-${priorityClass(incident.priority)}">

      <div class="latest-time">
        ${escapeHtml(formatTime(incident.created_at))}
      </div>

      <div class="latest-incident">
        <strong>
          ${escapeHtml(incident.incident_no)}
        </strong>

        <small>
          ${escapeHtml(incident.source || 'DISPATCH SYSTEM')}
        </small>
      </div>

      <div class="latest-type">
        ${escapeHtml(incident.category || 'Emergency')}
      </div>

      <div class="latest-location">
        <i class="fa-solid fa-location-dot"></i>

        <span>
          ${escapeHtml(incident.location_name || incident.location || 'Location not provided')}
        </span>
      </div>

      <span class="latest-pill ${priorityClass(incident.priority)}">
        ${escapeHtml(incident.priority || 'Moderate')}
      </span>

      <span class="latest-pill status ${statusClass(incident.status)}">
        ${escapeHtml(incident.status || 'Pending')}
      </span>

      <div class="latest-unit">
        ${escapeHtml(incident.responder_name || 'AWAITING DISPATCH')}
      </div>

    </article>
  `;
}

function stopVerticalIncidentScroll() {
  if (latestVerticalTimer) {
    clearInterval(latestVerticalTimer);
  }

  latestVerticalTimer = null;
  latestVerticalIndex = 0;
  latestVerticalCount = 0;

  latestRows.classList.remove('is-moving');
}

function startVerticalIncidentScroll(incidents) {
  stopVerticalIncidentScroll();

  if (incidents.length <= 5) {
    return;
  }

  const track = latestRows.querySelector('.latest-scroll-track');

  if (!track) {
    return;
  }

  latestVerticalCount = incidents.length;

  latestRows.classList.add('is-moving');

  latestVerticalTimer = setInterval(() => {
    latestVerticalIndex += 1;

    track.style.transform = `translateY(-${latestVerticalIndex * 78}px)`;

    if (latestVerticalIndex >= latestVerticalCount) {
      setTimeout(() => {
        latestRows.classList.remove('is-moving');

        latestVerticalIndex = 0;

        track.style.transform = 'translateY(0)';

        requestAnimationFrame(() => {
          latestRows.classList.add('is-moving');
        });
      }, 1200);
    }
  }, 3200);
}

function renderLatestIncidents(incidents) {
  stopVerticalIncidentScroll();

  if (!incidents.length) {
    latestRows.innerHTML = `
      <div class="latest-empty">
        <i class="fa-regular fa-calendar-check"></i>

        <div>
          No active incidents have been reported today.
        </div>

        <small>
          The board updates automatically when a new report arrives.
        </small>
      </div>
    `;

    latestCount.textContent = '0 ACTIVE INCIDENTS';

    return;
  }

  latestCount.textContent = `${incidents.length} ACTIVE INCIDENT${
    incidents.length === 1 ? '' : 'S'
  }`;

  const visibleSequence =
    incidents.length > 5 ? incidents.concat(incidents.slice(0, 5)) : incidents;

  latestRows.innerHTML = `<div class="latest-scroll-track">${visibleSequence
    .map(buildIncidentRow)
    .join('')}</div>`;

  startVerticalIncidentScroll(incidents);
}

function renderLiveTicker(incidents) {
  if (!latestTickerTrack) {
    return;
  }

  if (!incidents.length) {
    latestTickerTrack.innerHTML =
      '<span class="ticker-placeholder">' +
      '<i class="fa-regular fa-circle-check"></i> ' +
      'NO ACTIVE EMERGENCIES — OPERATIONS NORMAL' +
      '</span>';

    latestTickerTrack.classList.remove('is-scrolling');

    return;
  }

  const items = incidents
    .map((incident) => {
      const priority = String(incident.priority || 'Moderate').toUpperCase();

      const location = incident.location_name || incident.location || 'LOCATION UNAVAILABLE';

      const responder = incident.responder_name || 'AWAITING DISPATCH';

      const status = String(incident.status || 'Pending').toUpperCase();

      return `
      <span class="ticker-item ticker-${priority.toLowerCase()}">

        <b class="ticker-time">
          ${escapeHtml(formatTime(incident.created_at))}
        </b>

        <b class="ticker-id">
          ${escapeHtml(incident.incident_no || 'INCIDENT')}
        </b>

        <span class="ticker-type">
          ${escapeHtml(incident.category || 'EMERGENCY')}
        </span>

        <span class="ticker-location">
          <i class="fa-solid fa-location-dot"></i>
          ${escapeHtml(location)}
        </span>

        <span class="ticker-unit">
          <i class="fa-solid fa-truck-medical"></i>
          ${escapeHtml(responder)}
        </span>

        <span class="ticker-status">
          ${escapeHtml(status)}
        </span>

      </span>
    `;
    })
    .join('<span class="ticker-separator">◆</span>');

  latestTickerTrack.innerHTML =
    `<div class="ticker-sequence">${items}</div>` +
    `<div class="ticker-sequence" aria-hidden="true">${items}</div>`;

  latestTickerTrack.classList.toggle('is-scrolling', incidents.length > 0);
}

function updateAlertButton() {
  if (!latestAlertButton) {
    return;
  }

  latestAlertButton.classList.toggle('enabled', latestAlertsEnabled);

  latestAlertButton.innerHTML = latestAlertsEnabled
    ? '<i class="fa-solid fa-volume-high"></i> ALARM ENABLED'
    : '<i class="fa-solid fa-bell"></i> ENABLE ALARM';
}

async function enableLatestAlerts() {
  const unlocked = await unlockNotificationSound();

  if (!unlocked) {
    showLatestPopup(
      {
        id: `alarm-setup-${Date.now()}`,
        incident_no: 'ALARM SETUP',
        category: 'Browser audio is blocked',
        priority: 'Low',
        location: 'Click ENABLE ALARM again or allow sound for this site.',
        created_at: new Date().toISOString(),
        is_system_notice: true,
      },
      false,
    );

    return;
  }

  latestAlertsEnabled = true;

  localStorage.setItem('bt_admin_alerts', '1');

  updateAlertButton();

  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (_) {}
  }
}

function showLatestPopup(incident, playSound = true) {
  if (playSound && latestAlertsEnabled) {
    playNotificationSound(5000);
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(`🚨 NEW EMERGENCY · ${incident.incident_no || ''}`, {
        body:
          `${incident.category || 'Emergency'} · ` +
          `${incident.location || 'Location unavailable'}`,

        tag: `incident-${incident.id || incident.incident_no}`,
      });
    } catch (_) {}
  }
}

async function loadLatestIncidents() {
  try {
    const apiBase = await window.API_BASE_PROMISE;

    const response = await fetch(`${apiBase}/realtime.php?public=1&after_id=0`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });

    const payload = await response.json();

    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || `Unable to load incidents (${response.status}).`);
    }

    const today = new Date();

    const incidents = (payload.incidents || []).filter((incident) => {
      const created = new Date(String(incident.created_at || '').replace(' ', 'T'));

      const status = String(incident.status || '').trim();

      const isToday =
        !Number.isNaN(created.getTime()) &&
        created.getFullYear() === today.getFullYear() &&
        created.getMonth() === today.getMonth() &&
        created.getDate() === today.getDate();

      return isToday && ['Pending', 'Dispatched', 'Active'].includes(status);
    });

    incidents.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    renderLatestIncidents(incidents);

    renderLiveTicker(incidents);

    enrichIncidentLocations(incidents);
  } catch (error) {
    latestRows.innerHTML = `
      <div class="latest-empty">

        <i class="fa-solid fa-triangle-exclamation"></i>

        <div>
          ${escapeHtml(error.message || 'Incident feed unavailable.')}
        </div>

      </div>
    `;
  }
}

async function checkForNewIncidents() {
  try {
    const apiBase = await window.API_BASE_PROMISE;
    const response = await fetch(
      `${apiBase}/realtime.php?public=1&after_id=${encodeURIComponent(latestLastRealtimeId)}`,
      {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
    );
    if (!response.ok) return;
    const payload = await response.json();
    const rows = payload.incidents || [];
    for (const incident of rows) {
      const id = Number(incident.id || 0);
      if (id <= latestLastRealtimeId) continue;
      latestLastRealtimeId = id;
      sessionStorage.setItem('bt_latest_realtime_last_id', String(latestLastRealtimeId));
      showLatestPopup(incident);
    }
  } catch (error) {
    console.warn('Live incident notification error:', error.message);
  }
}

async function initializeRealtimeCursor() {
  try {
    const apiBase = await window.API_BASE_PROMISE;
    const response = await fetch(`${apiBase}/realtime.php?public=1&after_id=0`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const payload = await response.json();
    if (!latestLastRealtimeId) {
      latestLastRealtimeId = Number(payload.last_id || 0);
      sessionStorage.setItem('bt_latest_realtime_last_id', String(latestLastRealtimeId));
    }
  } catch (_) {}
}

/*
 * Philippine Standard Time live clock.
 */
function updateClock() {
  const now = new Date();

  if (latestClock) {
    latestClock.textContent = new Intl.DateTimeFormat('en-PH', {
      timeZone: PHILIPPINE_TIMEZONE,

      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',

      hour12: false,
    }).format(now);
  }

  if (latestDate) {
    latestDate.textContent = `TODAY · ${formatDateLabel(now)}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  updateAlertButton();

  latestAlertButton?.addEventListener('click', enableLatestAlerts);

  document.addEventListener(
    'pointerdown',
    () => {
      if (latestAlertsEnabled) {
        unlockNotificationSound();
      }
    },
    {
      once: true,
      passive: true,
    },
  );

  updateClock();

  setInterval(updateClock, 1000);

  await initializeRealtimeCursor();

  await loadLatestIncidents();

  await checkForNewIncidents();

  setInterval(loadLatestIncidents, 2000);

  setInterval(checkForNewIncidents, 2000);
});

/*
 * Critical incidents:
 * Full-screen emergency mode
 * for exactly 5 seconds.
 */
const latestScreen = document.querySelector('.latest-screen');

const latestCriticalOverlay = document.getElementById('latestCriticalOverlay');

const latestCriticalClose = document.getElementById('latestCriticalClose');

const latestCriticalIncident = document.getElementById('latestCriticalIncident');

const latestCriticalLocation = document.getElementById('latestCriticalLocation');

const latestCriticalNumber = document.getElementById('latestCriticalNumber');

const latestCriticalType = document.getElementById('latestCriticalType');

const latestCriticalTime = document.getElementById('latestCriticalTime');

let criticalAlertTimer = null;

function enterCriticalAlertMode(incident) {
  if (!latestCriticalOverlay || !latestScreen || incident?.is_system_notice) {
    return;
  }

  if (!incident?.id && !incident?.incident_no) {
    return;
  }

  document.body.classList.add('critical-alert-mode');

  latestScreen.classList.add('critical-board-pulse');

  latestCriticalOverlay.hidden = false;

  latestCriticalIncident.textContent = incident.category || 'CRITICAL INCIDENT REPORTED';

  latestCriticalLocation.textContent = incident.location || 'Location unavailable';

  latestCriticalNumber.textContent = incident.incident_no || 'INCIDENT —';

  latestCriticalType.textContent = String(incident.priority || 'Critical').toUpperCase();

  latestCriticalTime.textContent = `REPORTED ${formatTime(incident.created_at)}`;

  if (criticalAlertTimer) {
    clearTimeout(criticalAlertTimer);
  }

  criticalAlertTimer = setTimeout(() => exitCriticalAlertMode(), 5000);
}

function exitCriticalAlertMode() {
  if (!latestCriticalOverlay || !latestScreen) {
    return;
  }

  document.body.classList.remove('critical-alert-mode');

  latestScreen.classList.remove('critical-board-pulse');

  latestCriticalOverlay.classList.add('is-leaving');

  window.setTimeout(() => {
    latestCriticalOverlay.hidden = true;

    latestCriticalOverlay.classList.remove('is-leaving');
  }, 220);

  if (criticalAlertTimer) {
    clearTimeout(criticalAlertTimer);

    criticalAlertTimer = null;
  }
}

latestCriticalClose?.addEventListener('click', exitCriticalAlertMode);

latestCriticalOverlay?.addEventListener('click', (event) => {
  if (event.target === latestCriticalOverlay) {
    exitCriticalAlertMode();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !latestCriticalOverlay?.hidden) {
    exitCriticalAlertMode();
  }
});

/*
 * Wrap the existing popup function
 * so Critical reports also trigger
 * TV emergency mode.
 */
const originalShowLatestPopup = showLatestPopup;

showLatestPopup = function wrappedShowLatestPopup(incident, playSound = true) {
  originalShowLatestPopup(incident, playSound);

  const isRealIncident =
    !incident?.is_system_notice && (Number(incident?.id) > 0 || Boolean(incident?.incident_no));

  if (isRealIncident && String(incident.priority || '').toLowerCase() === 'critical') {
    enterCriticalAlertMode(incident);
  }
};
