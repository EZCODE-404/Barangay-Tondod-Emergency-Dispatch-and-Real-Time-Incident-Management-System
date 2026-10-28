let selectedType = 'Security Concern',
  coords = { latitude: null, longitude: null, gps_accuracy: null },
  sent = false,
  remainingReports = null,
  limitLoaded = false;
const q = (s) => document.querySelector(s);
document.querySelectorAll('.types button').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('.types button').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      selectedType = b.dataset.type;
    }),
);
q('[data-type="Security Concern"]').classList.add('selected');

function setLoc(t, ok = false) {
  const e = q('#locationStatus');
  e.innerHTML = '📍 ' + t;
  e.style.color = ok ? '#078f70' : '';
}
function setLimitUI(remaining) {
  const n = Number(remaining);
  remainingReports = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  limitLoaded = true;
  const b = q('#sosButton'),
    small = b.querySelector('small');
  if (remainingReports <= 0) {
    b.disabled = true;
    b.classList.remove('sending');
    small.textContent = 'DAILY REPORT LIMIT REACHED · 0 REPORTS LEFT TODAY';
    q('#errorBox').classList.add('hidden');
  } else {
    b.disabled = false;
    small.textContent = `TAP ONCE TO SEND · ${remainingReports} REPORT${remainingReports === 1 ? '' : 'S'} LEFT TODAY`;
  }
}
async function loadReportLimit() {
  try {
    const r = await fetch(await apiUrl('sos_report_limit.php'), {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const d = await r.json();
    if (r.ok && d.success) {
      setLimitUI(d.remaining);
      return d.remaining;
    }
  } catch (e) {}
  limitLoaded = false;
  q('#sosButton').disabled = true;
  q('#sosButton').querySelector('small').textContent = 'CHECKING REPORT LIMIT…';
  return null;
}
function gps() {
  if (!window.isSecureContext) {
    setLoc('GPS needs a secure HTTPS connection. You can still send with a landmark.');
    return Promise.resolve(false);
  }
  if (!navigator.geolocation) {
    setLoc('GPS is not supported on this browser. You can still send with a landmark.');
    return Promise.resolve(false);
  }
  setLoc('Getting GPS…');
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        coords = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          gps_accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        };
        setLoc(
          `GPS ready: ${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}${coords.gps_accuracy !== null ? ` · ±${Math.round(coords.gps_accuracy)}m` : ''}`,
          true,
        );
        resolve(true);
      },
      (e) => {
        const messages = {
          1: 'GPS permission was denied. You can still send with a landmark.',
          2: 'GPS is temporarily unavailable. You can still send with a landmark.',
          3: 'GPS took too long. You can still send with a landmark.',
        };
        setLoc(messages[e?.code] || 'GPS unavailable. You can still send with a landmark.');
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}
q('#locate').onclick = gps;

async function sendSOS() {
  if (sent || !limitLoaded || remainingReports <= 0) return;
  const b = q('#sosButton'),
    ok = q('#confirmation'),
    er = q('#errorBox');
  const latest = await loadReportLimit();
  if (latest === null || latest <= 0) return;
  b.disabled = true;
  b.classList.add('sending');
  b.querySelector('small').textContent = 'SENDING SOS…';
  if (coords.latitude === null && !q('#manualLocation').value.trim()) await gps();
  const location =
    q('#manualLocation').value.trim() ||
    (coords.latitude !== null ? `${coords.latitude}, ${coords.longitude}` : '');
  if (!location) {
    er.textContent = 'Location is required.';
    er.classList.remove('hidden');
    b.classList.remove('sending');
    await loadReportLimit();
    return;
  }
  try {
    const r = await fetch(await apiUrl('responder_sos.php'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        category: selectedType,
        description: q('#description').value.trim(),
        location,
        latitude: coords.latitude,
        longitude: coords.longitude,
        gps_accuracy: coords.gps_accuracy,
      }),
    });
    const d = await r.json();
    if (!r.ok || d.success === false) {
      if (d && d.limit_reached) {
        setLimitUI(d.remaining);
        throw Error(d.message);
      }
      throw Error(d.message || 'Unable to send responder SOS');
    }
    sent = true;
    setLimitUI(d.remaining);
    ok.classList.remove('hidden');
    ok.innerHTML = `🚨 <b>RESPONDER SOS SENT</b><br>Incident <b>${d.incident_no}</b> has been received by dispatch.<br><small>${d.remaining} report${d.remaining === 1 ? '' : 's'} left today.</small>`;
  } catch (e) {
    er.textContent = e.message;
    er.classList.remove('hidden');
    if (!sent) {
      await loadReportLimit();
      b.classList.remove('sending');
    }
  }
}
const b = q('#sosButton');
b.addEventListener('click', (e) => {
  e.preventDefault();
  sendSOS();
});
setLoc('📍 GPS will be requested when you send SOS or tap Refresh GPS.');
loadReportLimit();
setInterval(() => {
  if (!sent) loadReportLimit();
}, 5000);
