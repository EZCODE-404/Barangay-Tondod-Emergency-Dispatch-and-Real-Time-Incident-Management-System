let selectedType = 'Road Accident',
  coords = { latitude: null, longitude: null, gps_accuracy: null },
  sent = false,
  remainingReports = null,
  limitLoaded = false;
const q = (s) => document.querySelector(s);
const photoInput = q('#incidentPhoto');
let selectedPhoto = null;
let cameraStream = null;

function showPhotoPreview(file) {
  const preview = q('#photoPreview');
  if (!preview) return;
  preview.replaceChildren();
  if (!file) return;
  const img = document.createElement('img');
  img.alt = 'Incident photo preview';
  img.style.cssText = 'max-width:100%;max-height:220px;border-radius:12px;display:block';
  const url = URL.createObjectURL(file);
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  preview.appendChild(img);
  const caption = document.createElement('small');
  caption.textContent = 'Photo ready to send.';
  caption.style.cssText = 'display:block;margin-top:6px;color:#64748b';
  preview.appendChild(caption);
}

function validatePhoto(file) {
  if (!file) return 'Please attach or capture an incident photo before sending SOS.';
  if (file.size > 5 * 1024 * 1024) return 'Photo must be 5 MB or smaller.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Use a JPG, PNG, or WEBP photo.';
  }
  return '';
}

photoInput?.addEventListener('change', () => {
  const file = photoInput.files?.[0] || null;
  selectedPhoto = file;
  const error = validatePhoto(file);
  if (error && file) {
    photoInput.value = '';
    selectedPhoto = null;
    q('#photoPreview').textContent = error;
    return;
  }
  showPhotoPreview(selectedPhoto);
});

function closeCamera() {
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  q('#cameraPreview').srcObject = null;
  q('#cameraPanel').classList.add('hidden');
  q('#capturePhoto').classList.add('hidden');
  q('#cancelCamera').classList.add('hidden');
  q('#openCamera').classList.remove('hidden');
}

q('#openCamera')?.addEventListener('click', async () => {
  const status = q('#cameraStatus');
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Camera access is unavailable in this browser or connection. Use Choose Photo instead.';
    q('#cameraPanel').classList.remove('hidden');
    return;
  }
  try {
    status.textContent = 'Requesting camera permission…';
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    q('#cameraPreview').srcObject = cameraStream;
    q('#cameraPanel').classList.remove('hidden');
    q('#capturePhoto').classList.remove('hidden');
    q('#cancelCamera').classList.remove('hidden');
    q('#openCamera').classList.add('hidden');
    status.textContent = 'Position the camera and tap Capture Photo.';
  } catch (error) {
    status.textContent = 'Could not open the camera. Allow camera permission or use Choose Photo instead.';
    q('#cameraPanel').classList.remove('hidden');
  }
});

q('#capturePhoto')?.addEventListener('click', async () => {
  const video = q('#cameraPreview');
  if (!cameraStream || !video.videoWidth || !video.videoHeight) {
    q('#cameraStatus').textContent = 'Camera is not ready yet. Please wait a moment and try again.';
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) {
    q('#cameraStatus').textContent = 'Could not capture the photo. Please try again or use Choose Photo.';
    return;
  }
  if (blob.size > 5 * 1024 * 1024) {
    q('#cameraStatus').textContent = 'Captured photo is over 5 MB. Move closer or use Choose Photo.';
    return;
  }
  selectedPhoto = new File([blob], `sos-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
  if (photoInput) photoInput.value = '';
  showPhotoPreview(selectedPhoto);
  closeCamera();
});
q('#cancelCamera')?.addEventListener('click', closeCamera);
window.addEventListener('pagehide', closeCamera);
document.querySelectorAll('.types button').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('.types button').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      selectedType = b.dataset.type;
    }),
);
q('[data-type="Road Accident"]').classList.add('selected');
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
    let finished = false;
    const done = (ok) => {
      if (finished) return;
      finished = true;
      resolve(ok);
    };
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
        done(true);
      },
      (e) => {
        const messages = {
          1: 'GPS permission was denied. You can still send with a landmark.',
          2: 'GPS is temporarily unavailable. You can still send with a landmark.',
          3: 'GPS took too long. You can still send with a landmark.',
        };
        setLoc(messages[e?.code] || 'GPS unavailable. You can still send with a landmark.');
        done(false);
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
  er.classList.add('hidden');
  const contact = q('#contact').value.trim();
  const contactDigits = contact.replace(/\D/g, '');
  if (!contact) {
    er.textContent = 'Please enter your contact number before sending SOS.';
    er.classList.remove('hidden');
    q('#contact').focus();
    return;
  }
  if (contactDigits.length < 7 || contactDigits.length > 15) {
    er.textContent = 'Please enter a valid contact number containing 7 to 15 digits.';
    er.classList.remove('hidden');
    q('#contact').focus();
    return;
  }
  const photoError = validatePhoto(selectedPhoto || photoInput?.files?.[0] || null);
  if (photoError) {
    er.textContent = photoError;
    er.classList.remove('hidden');
    q('#openCamera').focus();
    return;
  }
  const latest = await loadReportLimit();
  if (latest === null || latest <= 0) return;
  b.disabled = true;
  b.classList.add('sending');
  b.querySelector('small').textContent = 'SENDING SOS…';
  if (coords.latitude === null && !q('#manualLocation').value.trim()) await gps();
  const location =
    q('#manualLocation').value.trim() ||
    (coords.latitude !== null
      ? `${coords.latitude}, ${coords.longitude}`
      : 'Location not provided');
  try {
    const payload = new FormData();
    payload.append('category', selectedType);
    payload.append('description', q('#description').value.trim() || 'Public SOS emergency report.');
    payload.append('location', location);
    payload.append('latitude', coords.latitude ?? '');
    payload.append('longitude', coords.longitude ?? '');
    payload.append('reporter_name', q('#reporterName').value.trim());
    payload.append('contact_number', contact);
    payload.append('gps_accuracy', coords.gps_accuracy ?? '');
    payload.append('incident_photo', selectedPhoto || photoInput.files[0], (selectedPhoto || photoInput.files[0]).name);
    const r = await fetch(await apiUrl('sos_report.php'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      body: payload,
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw Error('Server returned an invalid response. Please try again.');
    }
    if (!r.ok || d.success === false) {
      if (d && d.limit_reached) {
        setLimitUI(d.remaining);
        throw Error(d.message);
      }
      throw Error(d.message || 'Unable to send SOS');
    }
    sent = true;
    closeCamera();
    setLimitUI(d.remaining);
    ok.classList.remove('hidden');
    ok.innerHTML = `🚨 <b>SOS SENT</b><br>Incident <b>${d.incident_no}</b> has been received by the dispatcher.<br><small>${d.remaining} report${d.remaining === 1 ? '' : 's'} left today.</small>`;
  } catch (e) {
    er.textContent =
      e.message +
      ' If this is life-threatening, call ' +
      (window.deploymentSettings?.hotline || '911') +
      '.';
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
window.loadDeploymentSettings?.();
setLoc('📍 GPS will be requested when you send SOS or tap Refresh GPS.');
loadReportLimit();
setInterval(() => {
  if (!sent) loadReportLimit();
}, 5000);
