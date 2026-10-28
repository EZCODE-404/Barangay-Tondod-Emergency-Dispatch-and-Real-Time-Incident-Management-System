/* Emergency notification sound: extracted from the supplied video, 1.0x section only. */
let notificationSoundContext = null;
let notificationSoundBuffer = null;
let notificationSoundLoading = null;

function notificationSoundUrl() {
  const relative = 'assets/audio/notification-1x.mp3';
  const resolved =
    typeof window.appAssetUrl === 'function' ? window.appAssetUrl(relative) : relative;
  return new URL(resolved, window.location.href).href;
}

async function loadNotificationSound() {
  if (notificationSoundBuffer) return notificationSoundBuffer;
  if (notificationSoundLoading) return notificationSoundLoading;
  notificationSoundLoading = (async () => {
    try {
      notificationSoundContext =
        notificationSoundContext || new (window.AudioContext || window.webkitAudioContext)();
      const res = await fetch(notificationSoundUrl(), { cache: 'force-cache' });
      if (!res.ok) throw new Error('Notification sound could not be loaded.');
      const data = await res.arrayBuffer();
      notificationSoundBuffer = await notificationSoundContext.decodeAudioData(data);
      return notificationSoundBuffer;
    } catch (e) {
      console.warn('Notification sound load failed:', e.message);
      return null;
    } finally {
      notificationSoundLoading = null;
    }
  })();
  return notificationSoundLoading;
}

async function unlockNotificationSound() {
  try {
    notificationSoundContext =
      notificationSoundContext || new (window.AudioContext || window.webkitAudioContext)();
    if (notificationSoundContext.state === 'suspended') await notificationSoundContext.resume();
    const buffer = await loadNotificationSound();
    return Boolean(buffer);
  } catch (e) {
    console.warn('Notification sound unlock failed:', e.message);
    return false;
  }
}

async function playNotificationSound(durationMs = 5000) {
  try {
    const buffer = await loadNotificationSound();
    if (!buffer) return false;
    notificationSoundContext =
      notificationSoundContext || new (window.AudioContext || window.webkitAudioContext)();
    if (notificationSoundContext.state === 'suspended') await notificationSoundContext.resume();
    const source = notificationSoundContext.createBufferSource();
    const gain = notificationSoundContext.createGain();
    gain.gain.value = 0.9;
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(notificationSoundContext.destination);
    source.start(0);
    const stopAt = Math.min(5000, Math.max(100, Number(durationMs) || 5000));
    window.setTimeout(() => {
      try {
        source.stop();
      } catch (e) {}
    }, stopAt);
    return true;
  } catch (e) {
    console.warn('Notification sound playback failed:', e.message);
    return false;
  }
}

document.addEventListener(
  'pointerdown',
  () => {
    unlockNotificationSound();
  },
  { once: true, passive: true },
);
