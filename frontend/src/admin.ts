import { openProposalModal } from './proposal';
import { supabase } from './api';
import { createClient } from '@supabase/supabase-js';
import {
  GOOD_ACCURACY_METERS,
  LIVE_PIN_STALE_MS,
  accuracyCirclePolygon,
  accuracyLabel,
  accuracyQuality,
  formatCoordinates,
  haversineMeters,
  isPreciseGps,
  isValidCoordinate,
  parseDeviceId,
  parseGpsMeta,
  stripLocationTags,
  type LocationSource
} from './geo';

declare const mapboxgl: any;
declare const L: any;

function getAdminSupabaseClient() {
  if (supabase) return supabase;
  const url = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('ivraine-supabase-url');
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('ivraine-supabase-key');
  if (url && key && typeof url === 'string' && typeof key === 'string' && !url.includes('YOUR_') && !key.includes('YOUR_')) {
    try {
      return createClient(url, key);
    } catch {}
  }
  return null;
}

export interface VisitorLog {
  id: string;
  ip: string;
  section: 'Scrapbook' | 'Private Space' | 'Admin';
  action: string;
  details?: string;
  user?: string;
  userAgent?: string;
  deviceId?: string;
  dodgeCount?: number;
  latitude?: number | null;
  longitude?: number | null;
  /** GPS accuracy radius in metres (when the row carries it). */
  accuracyMeters?: number | null;
  /** 'gps' = real device fix · 'ip' = network estimate · 'unknown' = legacy row. */
  source?: LocationSource;
  fullAddress?: string;
  city?: string;
  country?: string;
  timestamp: string;
}

/** A log that was resolved down to a mappable location with GPS provenance. */
export interface ResolvedLocation {
  log: VisitorLog;
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  source: LocationSource;
  deviceId: string;
  /** Street-level accuracy from a real GPS chip → the only kind that becomes a live pin. */
  precise: boolean;
  /** Precision reported years ago / without any GPS tag — plotted as unverified. */
  unverified: boolean;
  /** IP / network derived — never plotted as a position. */
  approximate: boolean;
  updatedAtMs: number;
}

export interface AdminStats {
  totalVisits: number;
  uniqueIps: number;
  scrapbookVisits: number;
  spaceVisits: number;
  proposalAccepted: boolean;
  proposalAcceptedAt: string | null;
  totalDodges: number;
  recentIps: string[];
  locationsCount: number;
  latestCity: string;
}

let allLogs: VisitorLog[] = [];
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
let currentClientIp = '127.0.0.1';

// Map state
let mapInstance: any = null;
let mapType: 'mapbox' | 'leaflet' = 'leaflet';
let mapMarkers: any[] = [];
let leafletMarkersLayer: any = null;
let leafletTileLayers: Record<'dark' | 'satellite' | 'streets', any> = { dark: null, satellite: null, streets: null };
let currentMapStyle: 'dark' | 'satellite' | 'streets' = 'dark';
let mapInitialized = false;
let userInteractedWithMap = false;
/**
 * The live pin always reflects the phone's own GPS fix. The admin dashboard can
 * never place or drag it, so it is impossible to show her at a wrong spot.
 */
let followLivePin = true;
/** Accuracy rings + GeoJSON sources that must be cleared on every refresh. */
let accuracyOverlays: any[] = [];
let lastFocusedPinKey = '';

// Passcode handling
const lockScreen = document.getElementById('admin-lock') as HTMLDivElement;
const lockForm = document.getElementById('admin-lock-form') as HTMLFormElement;
const passInput = document.getElementById('admin-passcode-input') as HTMLInputElement;
const lockMsg = document.getElementById('admin-lock-msg') as HTMLParagraphElement;
const btnLock = document.getElementById('btn-lock') as HTMLButtonElement;

function isUnlocked(): boolean {
  return sessionStorage.getItem('ivraine-admin-unlocked') === 'true';
}

function unlockAdmin() {
  sessionStorage.setItem('ivraine-admin-unlocked', 'true');
  lockScreen.style.display = 'none';
  void loadAdminData();
  startAutoRefresh();
  setTimeout(() => initVisitorMap(), 200);
}

function lockAdmin() {
  sessionStorage.removeItem('ivraine-admin-unlocked');
  lockScreen.style.display = 'flex';
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  passInput.value = '';
  passInput.focus();
}

lockForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = passInput.value.trim();
  // Valid passcodes: 20260902, 09022026, 8-digit couple passcodes, or 'admin'
  if (val === '20260902' || val === '09022026' || val.length === 8 || val.toLowerCase() === 'admin') {
    unlockAdmin();
  } else {
    lockMsg.textContent = 'Incorrect passcode. Try again.';
    passInput.select();
  }
});

btnLock?.addEventListener('click', lockAdmin);

// Device string parser
function formatDevice(ua?: string): string {
  if (!ua) return 'Unknown Device';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  let os = 'Unknown OS';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Chrome/i.test(ua) && !/Edge|Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Edg/i.test(ua)) browser = 'Edge';

  return `${isMobile ? '📱 Mobile' : '💻 Desktop'} (${os} · ${browser})`;
}

// Relative time formatter
function timeAgo(dateString: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(dateString).toLocaleDateString();
}

// API endpoint resolver: returns custom Railway URL if configured, or same-origin /api path
function getBackendEndpoint(path: string): string {
  const saved = localStorage.getItem('ivraine-api-url');
  if (saved && saved.trim()) {
    return `${saved.trim().replace(/\/+$/, '')}${path}`;
  }
  
  const envApi = import.meta.env.VITE_API_URL;
  if (envApi && typeof envApi === 'string' && !envApi.includes('YOUR_')) {
    const isLocalEnv = envApi.includes('localhost') || envApi.includes('127.0.0.1');
    const isLocalPage = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocalPage || !isLocalEnv) {
      return `${envApi.trim().replace(/\/+$/, '')}${path}`;
    }
  }
  
  return path;
}

// Fetch public IP address with fast fallbacks and session caching
async function detectPublicIp(): Promise<string> {
  try {
    const cached = sessionStorage.getItem('ivraine_detected_ip');
    if (cached && cached !== '127.0.0.1') return cached;
  } catch {}

  const endpoint = getBackendEndpoint('/api/ip');
  if (endpoint) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          try { sessionStorage.setItem('ivraine_detected_ip', data.ip); } catch {}
          return data.ip;
        }
      }
    } catch {}
  }

  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        try { sessionStorage.setItem('ivraine_detected_ip', data.ip); } catch {}
        return data.ip;
      }
    }
  } catch {}

  try {
    const res = await fetch('https://api64.ipify.org?format=json', { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        try { sessionStorage.setItem('ivraine_detected_ip', data.ip); } catch {}
        return data.ip;
      }
    }
  } catch {}

  return '127.0.0.1';
}

// Local storage logs
function getLocalLogs(): VisitorLog[] {
  try {
    const raw = localStorage.getItem('ivraine_visitor_logs');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalLog(entry: VisitorLog) {
  try {
    const existing = getLocalLogs();
    existing.unshift(entry);
    if (existing.length > 500) existing.length = 500;
    localStorage.setItem('ivraine_visitor_logs', JSON.stringify(existing));
  } catch {}
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Render table rows
function renderLogs(logs: VisitorLog[]) {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <h3>No visitor activity logged yet</h3>
          <p>Visits to the Scrapbook or Private Space will appear here in real-time with their IP and location.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const isYes = log.action.includes('YES');
    const isScrapbook = log.section === 'Scrapbook';
    const isSpace = log.section === 'Private Space';
    const badgeClass = isScrapbook ? 'scrapbook' : isSpace ? 'space' : 'admin';
    const timeFormatted = new Date(log.timestamp).toLocaleString();
    const relativeTime = timeAgo(log.timestamp);
    const device = formatDevice(log.userAgent);

    let locationTag = '';
    if (log.fullAddress) {
      locationTag = `<div style="font-size:11px;color:#7dd3fc;margin-top:3px;display:flex;align-items:center;gap:4px;">📍 ${escapeHtml(log.fullAddress)}</div>`;
    }

    return `
      <tr>
        <td>
          <span class="ip-cell">
            <strong>${escapeHtml(log.ip)}</strong>
            <button class="copy-ip-btn" data-ip="${escapeHtml(log.ip)}" title="Copy IP">📋</button>
          </span>
          ${locationTag}
        </td>
        <td>
          <span class="badge-section ${badgeClass}">${escapeHtml(log.section)}</span>
        </td>
        <td>
          <span class="action-text ${isYes ? 'proposal-yes' : ''}">
            ${escapeHtml(log.action)}
          </span>
        </td>
        <td style="color:var(--muted);">${escapeHtml(log.details || '—')}</td>
        <td><strong>${escapeHtml(log.user || 'Visitor')}</strong></td>
        <td style="color:var(--muted);font-size:12px;">${escapeHtml(device)}</td>
        <td class="time-cell" title="${escapeHtml(timeFormatted)}">
          ${escapeHtml(relativeTime)}
        </td>
      </tr>
    `;
  }).join('');

  // Attach copy listeners
  tbody.querySelectorAll<HTMLButtonElement>('.copy-ip-btn').forEach(btn => {
    btn.onclick = () => {
      const ip = btn.dataset.ip || '';
      navigator.clipboard.writeText(ip);
      const originalText = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    };
  });
}

// Filter and search
function filterLogs() {
  const searchInput = document.getElementById('log-search') as HTMLInputElement | null;
  const filterSelect = document.getElementById('section-filter') as HTMLSelectElement | null;
  const search = searchInput?.value.trim().toLowerCase() || '';
  const sectionFilter = filterSelect?.value || 'all';

  const filtered = allLogs.filter(log => {
    const matchesSection = sectionFilter === 'all' || log.section === sectionFilter;
    const matchesSearch = !search ||
      log.ip.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search) ||
      (log.details || '').toLowerCase().includes(search) ||
      (log.fullAddress || '').toLowerCase().includes(search) ||
      (log.city || '').toLowerCase().includes(search) ||
      (log.country || '').toLowerCase().includes(search) ||
      (log.user || '').toLowerCase().includes(search) ||
      log.timestamp.toLowerCase().includes(search);

    return matchesSection && matchesSearch;
  });

  renderLogs(filtered);
}

// Compute statistics from logs
function computeStats(logs: VisitorLog[]): AdminStats {
  const uniqueIps = new Set(logs.map(l => l.ip)).size;
  const scrapbookVisits = logs.filter(l => l.section === 'Scrapbook').length;
  const spaceVisits = logs.filter(l => l.section === 'Private Space').length;
  
  let proposalAccepted = false;
  let proposalAcceptedAt: string | null = null;
  let totalDodges = 0;
  let locationsCount = 0;
  let latestCity = '';

  for (const l of logs) {
    if (l.action.toLowerCase().includes('yes') || l.action.toLowerCase().includes('said yes')) {
      proposalAccepted = true;
      if (!proposalAcceptedAt) proposalAcceptedAt = l.timestamp;
    }
    if (typeof l.dodgeCount === 'number') {
      totalDodges += l.dodgeCount;
    }
    if (l.latitude && l.longitude) {
      locationsCount++;
      if (!latestCity && (l.city || l.fullAddress)) {
        latestCity = l.city ? `${l.city}${l.country ? ', ' + l.country : ''}` : l.fullAddress || '';
      }
    }
  }

  try {
    if (localStorage.getItem('ivraine_proposal_status') === 'accepted') {
      proposalAccepted = true;
      proposalAcceptedAt = localStorage.getItem('ivraine_proposal_date') || proposalAcceptedAt || new Date().toISOString();
    }
    const dodges = Number(localStorage.getItem('ivraine_proposal_dodges'));
    if (!isNaN(dodges) && dodges > totalDodges) {
      totalDodges = dodges;
    }
  } catch {}

  return {
    totalVisits: logs.length,
    uniqueIps,
    scrapbookVisits,
    spaceVisits,
    proposalAccepted,
    proposalAcceptedAt,
    totalDodges,
    recentIps: Array.from(new Set(logs.slice(0, 25).map(l => l.ip))),
    locationsCount,
    latestCity: latestCity || 'None yet'
  };
}

// Update connection status badge in header
function updateConnectionBadge(status: 'railway' | 'supabase' | 'local') {
  const badge = document.getElementById('connection-status-badge');
  if (!badge) return;
  if (status === 'railway') {
    badge.textContent = '● Railway API Connected';
    badge.style.color = '#2ecc71';
    badge.style.borderColor = 'rgba(46, 204, 113, 0.4)';
    badge.style.background = 'rgba(46, 204, 113, 0.12)';
  } else if (status === 'supabase') {
    badge.textContent = '● Supabase Cloud Sync';
    badge.style.color = '#a78bfa';
    badge.style.borderColor = 'rgba(167, 139, 250, 0.4)';
    badge.style.background = 'rgba(167, 139, 250, 0.12)';
  } else {
    badge.textContent = '● Local Browser Storage';
    badge.style.color = '#fbbf24';
    badge.style.borderColor = 'rgba(251, 191, 36, 0.4)';
    badge.style.background = 'rgba(251, 191, 36, 0.12)';
  }
}

function updateKpiUi(stats: AdminStats) {
  const totalVisitsEl = document.getElementById('stat-total-visits');
  if (totalVisitsEl) totalVisitsEl.textContent = String(stats.totalVisits);

  const uniqueIpsEl = document.getElementById('stat-unique-ips');
  if (uniqueIpsEl) uniqueIpsEl.textContent = String(stats.uniqueIps);

  const scrapbookVisitsEl = document.getElementById('stat-scrapbook-visits');
  if (scrapbookVisitsEl) scrapbookVisitsEl.textContent = String(stats.scrapbookVisits);

  const spaceVisitsEl = document.getElementById('stat-space-visits');
  if (spaceVisitsEl) spaceVisitsEl.textContent = String(stats.spaceVisits);

  const propStatus = document.getElementById('stat-proposal-status');
  if (propStatus) {
    if (stats.proposalAccepted) {
      propStatus.textContent = 'Said YES! 💖';
      propStatus.style.color = '#ff6b81';
    } else {
      propStatus.textContent = 'Pending';
      propStatus.style.color = '#f0ecf4';
    }
  }

  const dodgeEl = document.getElementById('stat-dodge-count');
  if (dodgeEl) dodgeEl.textContent = `Dodges avoided: ${stats.totalDodges}`;

  const locCountEl = document.getElementById('stat-locations-count');
  if (locCountEl) locCountEl.textContent = String(stats.locationsCount);

  const latestCityEl = document.getElementById('stat-latest-city');
  if (latestCityEl) latestCityEl.textContent = stats.latestCity.length > 28 ? stats.latestCity.slice(0, 26) + '…' : stats.latestCity;
}

// -----------------------------------------------------------------------------------------
// LIVE PHONE GPS MAP ENGINE
// Only the phone's own GPS fix is ever drawn as a live pin — the dashboard can never
// place, drag or fake that position, and IP/network estimates are never plotted.
// -----------------------------------------------------------------------------------------

/** Turns a raw log into a mappable location with its GPS provenance. */
function resolveLocation(log: VisitorLog): ResolvedLocation | null {
  const lat = typeof log.latitude === 'number' ? log.latitude : (log.latitude != null ? parseFloat(String(log.latitude)) : NaN);
  const lng = typeof log.longitude === 'number' ? log.longitude : (log.longitude != null ? parseFloat(String(log.longitude)) : NaN);
  if (!isValidCoordinate(lat, lng)) return null;

  const meta = parseGpsMeta(log.details);
  const tagless = meta.source === 'unknown';
  const declared = log.source && log.source !== 'unknown' ? log.source : null;
  // A manually placed pin from an older dashboard version must never count as her position.
  const isManual = /moved live pin|manual pin/i.test(log.action || '');
  const looksIpDerived = isManual
    || /ip[-\s]?(approx|based|estimate)/i.test(log.details || '')
    || /approximate/i.test(log.action || '');

  const source: LocationSource = looksIpDerived ? 'ip' : (declared || meta.source);
  const accuracyMeters = typeof log.accuracyMeters === 'number' && Number.isFinite(log.accuracyMeters) && log.accuracyMeters > 0
    ? log.accuracyMeters
    : meta.accuracyMeters;

  const deviceId = log.deviceId || parseDeviceId(log.details) || '';
  const approximate = source === 'ip' || looksIpDerived;
  const precise = !approximate && !tagless && isPreciseGps(accuracyMeters);
  const unverified = !approximate && !precise;

  return {
    log,
    lat,
    lng,
    accuracyMeters,
    source,
    deviceId,
    precise,
    unverified,
    approximate,
    updatedAtMs: new Date(log.timestamp).getTime() || 0
  };
}

/** One pin per physical device — never merges two phones into a single pin. */
function devicePinKey(loc: ResolvedLocation): string {
  if (loc.deviceId) return `dev:${loc.deviceId}`;
  const ip = (loc.log.ip || 'unknown').trim();
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(loc.log.userAgent || '');
  return `ip:${ip}:${isMobile ? 'mobile' : 'desktop'}`;
}

function newestPerDevice(locations: ResolvedLocation[]): ResolvedLocation[] {
  const map = new Map<string, ResolvedLocation>();
  for (const loc of locations) {
    const key = devicePinKey(loc);
    const current = map.get(key);
    // Newest wins, but a real GPS fix always beats an approximate one.
    if (!current) map.set(key, loc);
    else if (loc.precise && !current.precise) map.set(key, loc);
    else if (loc.precise === current.precise && loc.updatedAtMs > current.updatedAtMs) map.set(key, loc);
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

function isLivePinFresh(loc: ResolvedLocation): boolean {
  return Date.now() - loc.updatedAtMs <= LIVE_PIN_STALE_MS;
}

function updateMapHud(pin: ResolvedLocation | null, approximateHint = '') {
  const coordsEl = document.getElementById('hud-coordinates');
  const addrEl = document.getElementById('hud-address');
  const statusEl = document.getElementById('hud-interaction-status');
  const accuracyEl = document.getElementById('hud-accuracy');
  const freshnessEl = document.getElementById('hud-freshness');

  if (!pin) {
    if (coordsEl) coordsEl.textContent = '📍 No GPS fix received yet';
    if (addrEl) addrEl.textContent = approximateHint || 'Waiting for the phone to share its GPS location';
    if (accuracyEl) {
      accuracyEl.textContent = 'Accuracy: —';
      accuracyEl.style.color = 'var(--muted)';
    }
    if (freshnessEl) freshnessEl.textContent = 'No live update yet';
    if (statusEl) {
      statusEl.textContent = '🔒 Locked to the phone — the dashboard cannot move this pin';
      statusEl.style.color = '#2ecc71';
    }
    return;
  }

  if (coordsEl) coordsEl.textContent = `📍 ${formatCoordinates(pin.lat, pin.lng)}`;
  if (addrEl) {
    const address = pin.log.fullAddress || stripLocationTags(pin.log.details) || `${pin.log.city || ''} ${pin.log.country || ''}`.trim() || 'Address unavailable';
    addrEl.textContent = address.length > 52 ? `${address.slice(0, 50)}…` : address;
    addrEl.title = address;
  }
  if (accuracyEl) {
    const quality = accuracyQuality(pin.accuracyMeters);
    accuracyEl.textContent = `${pin.precise ? 'GPS accuracy' : 'Reported accuracy'}: ${accuracyLabel(pin.accuracyMeters)}`;
    accuracyEl.style.color = quality === 'good' ? '#2ecc71' : quality === 'fair' ? '#fbbf24' : 'var(--muted)';
  }
  if (freshnessEl) {
    const fresh = isLivePinFresh(pin);
    freshnessEl.textContent = fresh
      ? `Live · updated ${timeAgo(pin.log.timestamp)}`
      : `⚠ Last update ${timeAgo(pin.log.timestamp)} — phone offline?`;
    freshnessEl.style.color = fresh ? '#2ecc71' : '#fbbf24';
  }
  if (statusEl) {
    if (pin.precise) {
      statusEl.textContent = freshText(pin)
        ? '🔒 Locked to the phone\'s GPS — the dashboard cannot move this pin'
        : '⚠ Pin is stale — still locked to the last GPS fix the phone sent';
      statusEl.style.color = freshText(pin) ? '#2ecc71' : '#fbbf24';
    } else {
      statusEl.textContent = '⚠ This pin is not a verified GPS fix — read the badge before trusting it';
      statusEl.style.color = '#fbbf24';
    }
  }
}

function freshText(pin: ResolvedLocation): boolean {
  return isLivePinFresh(pin);
}


function showMapToast(message: string, durationMs: number = 3500) {
  const toast = document.getElementById('map-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'flex';
  setTimeout(() => {
    if (toast) toast.style.display = 'none';
  }, durationMs);
}

/**
 * Marker for a resolved location.
 * Precise pins are hard-locked to the phone's GPS fix — they are not draggable in any
 * engine, so the dashboard physically cannot show someone at a place they are not.
 */
function createLiveMarkerElement(loc: ResolvedLocation): HTMLElement {
  const user = loc.log.user || 'Visitor';
  const precise = loc.precise;

  const container = document.createElement('div');
  container.className = `live-map-marker-container${precise ? '' : ' is-unverified'}`;
  container.setAttribute('data-gps-locked', 'true');
  container.setAttribute('data-precise', precise ? 'true' : 'false');
  container.setAttribute('data-device-id', loc.deviceId || '');
  container.setAttribute('data-accuracy', loc.accuracyMeters != null ? String(Math.round(loc.accuracyMeters)) : '');
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', precise
    ? `Live GPS pin for ${user}. Locked to the phone, ${accuracyLabel(loc.accuracyMeters)}.`
    : `Unverified location for ${user}. Not a GPS fix.`);

  const wave1 = document.createElement('div');
  wave1.className = 'live-radar-ping';

  const wave2 = document.createElement('div');
  wave2.className = 'live-radar-ping second';

  const center = document.createElement('div');
  center.className = 'live-marker-center';

  const emoji = document.createElement('span');
  emoji.className = 'live-marker-emoji';
  emoji.textContent = precise ? '💖' : '⚠';
  center.appendChild(emoji);

  const pill = document.createElement('div');
  pill.className = 'live-marker-pill';
  const accuracySuffix = loc.accuracyMeters != null ? ` ±${Math.round(loc.accuracyMeters)}m` : '';
  const label = precise
    ? `${escapeHtml(user)} · 🔒 Live GPS${accuracySuffix}`
    : `${escapeHtml(user)} · ⚠ Not GPS`;
  pill.innerHTML = `<span class="pill-dot"></span><span>${label}</span>`;

  container.appendChild(wave1);
  container.appendChild(wave2);
  container.appendChild(center);
  container.appendChild(pill);

  return container;
}

/** Human readable provenance line used by map popups and the location cards. */
function provenanceBadge(loc: ResolvedLocation): { text: string; color: string } {
  if (loc.precise) {
    return { text: `📱 Real phone GPS fix · ${accuracyLabel(loc.accuracyMeters)}`, color: '#2ecc71' };
  }
  if (loc.unverified) {
    return { text: '⚠ Legacy location without a GPS reading — treat as approximate', color: '#fbbf24' };
  }
  return { text: '🌐 Network/IP estimate — never plotted as her exact position', color: '#fbbf24' };
}

function locationPopupHtml(loc: ResolvedLocation): string {
  const badge = provenanceBadge(loc);
  const device = loc.deviceId ? `<span>🔑 Device: ${escapeHtml(loc.deviceId)}</span>` : '';
  return `
    <div class="map-popup-header">
      <span>💖</span>
      <span>${escapeHtml(loc.log.user || 'Visitor')}</span>
      <span class="badge-section ${loc.log.section === 'Scrapbook' ? 'scrapbook' : 'space'}">${escapeHtml(loc.log.section)}</span>
    </div>
    <div style="font-size:11px;color:${badge.color};font-weight:700;margin-bottom:4px;">${badge.text}</div>
    <div class="map-popup-address">📍 ${escapeHtml(loc.log.fullAddress || stripLocationTags(loc.log.details) || 'Address unavailable')}</div>
    <div class="map-popup-meta">
      <span>🌐 ${formatCoordinates(loc.lat, loc.lng)}</span>
      <span>💻 IP: ${escapeHtml(loc.log.ip)}</span>
      <span>⏱ ${escapeHtml(timeAgo(loc.log.timestamp))}</span>
      ${device}
      <span style="color:#8b95a5;font-weight:600;margin-top:4px;">🔒 Pin follows the phone — it cannot be moved from here</span>
    </div>
  `;
}

/** Draws the GPS accuracy circle so "accurate" is visible, not just claimed. */
function drawAccuracyCircle(loc: ResolvedLocation) {
  if (!mapInstance || !loc.precise || loc.accuracyMeters == null) return;
  const radius = Math.max(5, Math.min(loc.accuracyMeters, 1000));
  const color = accuracyQuality(loc.accuracyMeters) === 'good' ? '#2ecc71' : '#fbbf24';

  try {
    if (mapType === 'leaflet' && typeof L !== 'undefined') {
      const circle = L.circle([loc.lat, loc.lng], {
        radius,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.08,
        interactive: false
      }).addTo(mapInstance);
      accuracyOverlays.push(circle);
      return;
    }

    if (mapType === 'mapbox') {
      const sourceId = `gps-accuracy-${accuracyOverlays.length}`;
      mapInstance.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [accuracyCirclePolygon(loc.lat, loc.lng, radius)] }
        }
      });
      mapInstance.addLayer({
        id: `${sourceId}-fill`,
        type: 'fill',
        source: sourceId,
        paint: { 'fill-color': color, 'fill-opacity': 0.08 }
      });
      mapInstance.addLayer({
        id: `${sourceId}-line`,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': color, 'line-width': 1, 'line-opacity': 0.6 }
      });
      accuracyOverlays.push({ sourceId, fillId: `${sourceId}-fill`, lineId: `${sourceId}-line` });
    }
  } catch {}
}

function clearAccuracyOverlays() {
  if (!mapInstance) return;
  for (const overlay of accuracyOverlays) {
    try {
      if (mapType === 'leaflet') {
        mapInstance.removeLayer(overlay);
      } else {
        if (mapInstance.getLayer(overlay.lineId)) mapInstance.removeLayer(overlay.lineId);
        if (mapInstance.getLayer(overlay.fillId)) mapInstance.removeLayer(overlay.fillId);
        if (mapInstance.getSource(overlay.sourceId)) mapInstance.removeSource(overlay.sourceId);
      }
    } catch {}
  }
  accuracyOverlays = [];
}

/** Keeps the camera glued to the newest GPS fix while "Follow live" is on. */
function followPinIfEnabled(pin: ResolvedLocation | null) {
  if (!pin || !pin.precise || !followLivePin || userInteractedWithMap || !mapInstance) return;

  const key = `${devicePinKey(pin)}:${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
  const isNewPosition = lastFocusedPinKey !== key;
  const firstFocus = lastFocusedPinKey === '';
  lastFocusedPinKey = key;
  if (!isNewPosition && !firstFocus) return;

  try {
    const center = mapInstance.getCenter();
    const drift = haversineMeters(center.lat, center.lng, pin.lat, pin.lng);
    if (!firstFocus && drift <= 15) return;
    if (mapType === 'mapbox') {
      mapInstance.easeTo({ center: [pin.lng, pin.lat], duration: 850 });
    } else {
      mapInstance.panTo([pin.lat, pin.lng], { animate: true, duration: 0.85 });
    }
  } catch {}
}

function initVisitorMap() {
  const mapContainer = document.getElementById('admin-visitor-map');
  if (!mapContainer || mapInitialized) return;

  const mapboxToken = localStorage.getItem('ivraine-mapbox-token') || import.meta.env.VITE_MAPBOX_TOKEN || '';

  // 1. Attempt Mapbox GL JS if token is present
  if (mapboxToken && typeof mapboxgl !== 'undefined') {
    try {
      mapboxgl.accessToken = mapboxToken;
      let styleUrl = 'mapbox://styles/mapbox/dark-v11';
      if (currentMapStyle === 'satellite') styleUrl = 'mapbox://styles/mapbox/satellite-streets-v12';
      else if (currentMapStyle === 'streets') styleUrl = 'mapbox://styles/mapbox/streets-v12';

      mapInstance = new mapboxgl.Map({
        container: 'admin-visitor-map',
        style: styleUrl,
        center: [123.8647, 9.6496], // Bohol / Philippines
        zoom: 14,
        maxZoom: 22
      });

      mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapType = 'mapbox';
      mapInitialized = true;

      // Track user interaction so auto-refresh does not reset user's camera / zoom
      mapInstance.on('movestart', () => { if (!isDraggingPin) userInteractedWithMap = true; });
      mapInstance.on('zoomstart', () => { userInteractedWithMap = true; });

      mapInstance.on('load', () => {
        updateVisitorMap(allLogs);
      });

      const engineEl = document.getElementById('hud-engine-tag');
      if (engineEl) engineEl.textContent = 'Mapbox GL Vector';
      return;
    } catch (err) {
      console.warn('Mapbox initialization failed, falling back to Leaflet Ultra-HD:', err);
    }
  }

  // 2. Leaflet Fallback with Ultra-HD Tiles & Overzooming (tiles never disappear)
  if (typeof L !== 'undefined') {
    try {
      if ((mapContainer as any)._leaflet_id) {
        (mapContainer as any)._leaflet_id = null;
      }

      mapInstance = L.map('admin-visitor-map', {
        zoomControl: true,
        maxZoom: 22
      }).setView([9.6496, 123.8647], 14);

      // Dark Matter with maxNativeZoom: 18, maxZoom: 22 so it scales up to 22 without disappearing!
      leafletTileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB &copy; OpenStreetMap',
        maxNativeZoom: 18,
        maxZoom: 22
      });

      // Esri Satellite with maxNativeZoom: 19, maxZoom: 22
      leafletTileLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri &copy; Maxar, Earthstar Geographics',
        maxNativeZoom: 19,
        maxZoom: 22
      });

      // Streets with maxNativeZoom: 19, maxZoom: 22
      leafletTileLayers.streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxNativeZoom: 19,
        maxZoom: 22
      });

      const activeLayer = leafletTileLayers[currentMapStyle] || leafletTileLayers.dark;
      activeLayer.addTo(mapInstance);

      leafletMarkersLayer = L.layerGroup().addTo(mapInstance);
      mapType = 'leaflet';
      mapInitialized = true;

      // Track user interaction so auto-refresh does not reset zoom
      mapInstance.on('movestart', () => { if (!isDraggingPin) userInteractedWithMap = true; });
      mapInstance.on('zoomstart', () => { userInteractedWithMap = true; });

      const engineEl = document.getElementById('hud-engine-tag');
      if (engineEl) engineEl.textContent = 'Leaflet Ultra-HD';

      updateVisitorMap(allLogs);
    } catch (err) {
      console.error('Leaflet initialization error:', err);
    }
  }
}

function updateVisitorMap(logs: VisitorLog[]) {
  if (!mapInstance || !mapInitialized) return;

  const resolved = logs
    .map(resolveLocation)
    .filter((loc): loc is ResolvedLocation => loc !== null);

  const devicePins = newestPerDevice(resolved);
  const precisePins = devicePins.filter(p => p.precise);
  const plottedPins = precisePins.length > 0 ? precisePins : devicePins.filter(p => !p.approximate);
  const newestPrecise = precisePins[0] || null;

  renderRecentLocationsDeck(resolved);
  clearAccuracyOverlays();

  const approximateHint = devicePins.find(p => p.approximate)
    ? `Approximate network region: ${devicePins.find(p => p.approximate)?.log.city || 'Philippines'} (not shown on map)`
    : '';
  updateMapHud(newestPrecise || plottedPins[0] || null, approximateHint);

  const engineTag = document.getElementById('hud-engine-tag');
  if (engineTag) {
    const base = mapType === 'mapbox' ? 'Mapbox GL' : 'Leaflet Ultra-HD';
    const tag = precisePins.length > 0
      ? `📱 ${precisePins.length} Live GPS Pin${precisePins.length > 1 ? 's' : ''}`
      : (plottedPins.length > 0 ? `📍 ${plottedPins.length} Pin` : 'No GPS Fix');
    engineTag.textContent = `${base} · ${tag}`;
  }

  if (mapType === 'mapbox') {
    try { mapInstance.resize(); } catch {}

    mapMarkers.forEach(m => {
      try { m.remove(); } catch {}
    });
    mapMarkers = [];

    const bounds = new mapboxgl.LngLatBounds();

    plottedPins.forEach(loc => {
      const el = createLiveMarkerElement(loc);
      const popup = new mapboxgl.Popup({ offset: 30 }).setHTML(locationPopupHtml(loc));

      const marker = new mapboxgl.Marker({
        element: el,
        draggable: false
      })
        .setLngLat([loc.lng, loc.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      mapMarkers.push(marker);
      drawAccuracyCircle(loc);
      bounds.extend([loc.lng, loc.lat]);
    });

    if (plottedPins.length > 0 && !bounds.isEmpty()) {
      if (followLivePin && newestPrecise) {
        followPinIfEnabled(newestPrecise);
      } else if (!userInteractedWithMap) {
        try {
          if (plottedPins.length === 1) {
            mapInstance.flyTo({ center: [plottedPins[0].lng, plottedPins[0].lat], zoom: 16, essential: true });
          } else {
            mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 16 });
          }
        } catch {}
      }
    }
  } else if (mapType === 'leaflet' && leafletMarkersLayer) {
    try { mapInstance.invalidateSize(); } catch {}
    leafletMarkersLayer.clearLayers();
    mapMarkers = [];

    const latLngs: any[] = [];

    plottedPins.forEach(loc => {
      const el = createLiveMarkerElement(loc);
      const divIcon = L.divIcon({
        className: 'leaflet-clean-marker',
        html: el,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
        popupAnchor: [0, -25]
      });

      const marker = L.marker([loc.lat, loc.lng], {
        icon: divIcon,
        draggable: false
      })
        .bindPopup(locationPopupHtml(loc))
        .addTo(leafletMarkersLayer);

      mapMarkers.push({ marker, lat: loc.lat, lng: loc.lng, log: loc.log });
      drawAccuracyCircle(loc);
      latLngs.push([loc.lat, loc.lng]);
    });

    if (latLngs.length > 0) {
      if (followLivePin && newestPrecise) {
        followPinIfEnabled(newestPrecise);
      } else if (!userInteractedWithMap) {
        try {
          if (latLngs.length === 1) {
            mapInstance.setView(latLngs[0], 16);
          } else {
            mapInstance.fitBounds(latLngs, { padding: [50, 50], maxZoom: 16 });
          }
        } catch {}
      }
    }
  }
}

function setMapLayerStyle(style: 'dark' | 'satellite' | 'streets') {
  currentMapStyle = style;

  document.querySelectorAll('.layer-pill').forEach(pill => pill.classList.remove('active'));
  document.getElementById(`btn-layer-${style}`)?.classList.add('active');

  if (mapType === 'mapbox' && mapInstance) {
    let styleUrl = 'mapbox://styles/mapbox/dark-v11';
    if (style === 'satellite') styleUrl = 'mapbox://styles/mapbox/satellite-streets-v12';
    else if (style === 'streets') styleUrl = 'mapbox://styles/mapbox/streets-v12';
    mapInstance.setStyle(styleUrl);
  } else if (mapType === 'leaflet' && mapInstance) {
    Object.values(leafletTileLayers).forEach(layer => {
      if (layer && mapInstance.hasLayer(layer)) {
        mapInstance.removeLayer(layer);
      }
    });
    const nextLayer = leafletTileLayers[style] || leafletTileLayers.dark;
    if (nextLayer) nextLayer.addTo(mapInstance);
  }
  showMapToast(`🗺 Switched map to ${style.charAt(0).toUpperCase() + style.slice(1)} view`);
}

function flyToLocation(lat: number, lng: number) {
  if (!mapInstance) return;

  userInteractedWithMap = false;

  // Switch to Map tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="tab-map"]')?.classList.add('active');
  document.getElementById('tab-map')?.classList.add('active');

  setTimeout(() => {
    if (mapType === 'mapbox') {
      try { mapInstance.resize(); } catch {}
      mapInstance.flyTo({ center: [lng, lat], zoom: 17, essential: true });
    } else if (mapType === 'leaflet') {
      try { mapInstance.invalidateSize(); } catch {}
      mapInstance.setView([lat, lng], 17, { animate: true });
    }
  }, 100);
}

function renderRecentLocationsDeck(geoLogs: VisitorLog[]) {
  const container = document.getElementById('recent-locations-deck');
  if (!container) return;

  if (!geoLogs.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 30px;">
        <h3>Waiting for location data…</h3>
        <p>Locations will appear here as soon as Loraine or visitors open the Scrapbook or Private Space and grant location access.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = geoLogs.slice(0, 12).map(log => {
    const lat = log.latitude!;
    const lng = log.longitude!;
    const isScrapbook = log.section === 'Scrapbook';
    const badgeClass = isScrapbook ? 'scrapbook' : 'space';

    return `
      <div class="location-card">
        <div class="location-card-top">
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <strong>${escapeHtml(log.user || 'Visitor')}</strong>
              <span class="badge-section ${badgeClass}">${escapeHtml(log.section)}</span>
            </div>
            <div class="location-card-address">
              ${escapeHtml(log.fullAddress || `${lat.toFixed(4)}, ${lng.toFixed(4)}`)}
            </div>
          </div>
          <span style="font-size:24px;">📍</span>
        </div>
        <div class="location-card-sub">
          <span>🌐 Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
          <span>💻 IP: ${escapeHtml(log.ip)}</span>
        </div>
        <div class="location-card-footer">
          <span style="font-size:12px;color:var(--muted);">${escapeHtml(timeAgo(log.timestamp))}</span>
          <button class="nav-btn btn-fly-pin" data-lat="${lat}" data-lng="${lng}" style="padding:4px 10px;font-size:11px;">
            Fly to Pin ↗
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach fly-to buttons
  container.querySelectorAll<HTMLButtonElement>('.btn-fly-pin').forEach(btn => {
    btn.onclick = () => {
      const lat = parseFloat(btn.dataset.lat || '0');
      const lng = parseFloat(btn.dataset.lng || '0');
      flyToLocation(lat, lng);
    };
  });
}

// -----------------------------------------------------------------------------------------
// DATA FETCHING & SYNCHRONIZATION
// -----------------------------------------------------------------------------------------
async function loadAdminData() {
  currentClientIp = await detectPublicIp();
  const ipIndicator = document.getElementById('current-ip-indicator');
  if (ipIndicator) ipIndicator.textContent = `Your IP: ${currentClientIp}`;

  let fetchedLogs: VisitorLog[] = [];
  let fetchedFromBackend = false;

  // 1. Try Backend API
  const endpoint = getBackendEndpoint('/api/admin/logs');
  if (endpoint) {
    try {
      const res = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          fetchedLogs = data.logs;
          fetchedFromBackend = true;
          updateConnectionBadge('railway');
        }
      }
    } catch {}
  }

  // 2. ALWAYS query Supabase directly and merge all records
  let fetchedFromSupabase = false;
  const sbClient = getAdminSupabaseClient();
  if (sbClient) {
    try {
      const { data, error } = await sbClient
        .from('ivraine_visitor_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (!error && Array.isArray(data) && data.length > 0) {
        const sbLogs: VisitorLog[] = data.map((row: any) => ({
          id: row.id,
          ip: row.ip || '127.0.0.1',
          section: row.section || 'Scrapbook',
          action: row.action || 'Visit',
          details: row.details || '',
          user: row.user_name || 'Visitor',
          userAgent: row.user_agent || '',
          dodgeCount: row.dodge_count || 0,
          latitude: typeof row.latitude === 'number' ? row.latitude : (row.latitude ? parseFloat(row.latitude) : null),
          longitude: typeof row.longitude === 'number' ? row.longitude : (row.longitude ? parseFloat(row.longitude) : null),
          fullAddress: row.full_address || '',
          city: row.city || '',
          country: row.country || '',
          timestamp: row.created_at || new Date().toISOString()
        }));

        const existingKeys = new Set(fetchedLogs.map(l => l.id || `${l.ip}_${l.action}_${l.timestamp.slice(0, 19)}`));
        for (const log of sbLogs) {
          const k = log.id || `${log.ip}_${log.action}_${log.timestamp.slice(0, 19)}`;
          if (!existingKeys.has(k)) {
            fetchedLogs.push(log);
            existingKeys.add(k);
          }
        }
        fetchedFromSupabase = true;
        if (!fetchedFromBackend) updateConnectionBadge('supabase');
      }
    } catch {}
  }

  // 3. Merge with local storage logs
  const localLogs = getLocalLogs();
  const existingKeys = new Set(fetchedLogs.map(l => `${l.ip}_${l.action}_${l.timestamp.slice(0, 19)}`));

  for (const local of localLogs) {
    const key = `${local.ip}_${local.action}_${local.timestamp.slice(0, 19)}`;
    if (!existingKeys.has(key)) {
      fetchedLogs.push(local);
      existingKeys.add(key);
    }
  }

  // 4. Ensure any saved location is permanently pinned on the map even if permission was turned off later
  try {
    const rawSavedLoc = localStorage.getItem('ivraine_last_location') || localStorage.getItem('ivraine_saved_pinned_location');
    if (rawSavedLoc) {
      const parsedLoc = JSON.parse(rawSavedLoc);
      if (parsedLoc.latitude && parsedLoc.longitude) {
        const hasSaved = fetchedLogs.some(l => l.latitude != null && l.longitude != null && Math.abs(l.latitude - parsedLoc.latitude) < 0.0001 && Math.abs(l.longitude - parsedLoc.longitude) < 0.0001);
        if (!hasSaved) {
          fetchedLogs.unshift({
            id: 'saved_pinned_' + Date.now(),
            ip: 'Saved GPS Pin',
            section: 'Scrapbook',
            action: '📍 Pinned Location Saved ♡',
            details: parsedLoc.fullAddress || parsedLoc.city || 'Previously granted visitor coordinates',
            user: 'Loraine',
            latitude: parsedLoc.latitude,
            longitude: parsedLoc.longitude,
            fullAddress: parsedLoc.fullAddress || '',
            city: parsedLoc.city || '',
            country: parsedLoc.country || '',
            timestamp: parsedLoc.timestamp || new Date().toISOString()
          });
        }
      }
    }
  } catch {}

  fetchedLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (!fetchedFromBackend && !fetchedFromSupabase) {
    updateConnectionBadge('local');
  }

  // Initial visit log if empty
  if (fetchedLogs.length === 0) {
    const adminVisit: VisitorLog = {
      id: String(Date.now()),
      ip: currentClientIp,
      section: 'Admin',
      action: 'Opened Admin Dashboard',
      details: 'First admin session initialized',
      user: 'Ivan (Admin)',
      userAgent: navigator.userAgent,
      dodgeCount: 0,
      timestamp: new Date().toISOString()
    };
    fetchedLogs.push(adminVisit);
    saveLocalLog(adminVisit);
  }

  allLogs = fetchedLogs;
  const stats = computeStats(allLogs);
  updateKpiUi(stats);
  filterLogs();
  updateVisitorMap(allLogs);
}

// Real-time synchronization across browser tabs
try {
  const adminChannel = new BroadcastChannel('ivraine_admin_channel');
  adminChannel.onmessage = (event) => {
    if (event.data?.type === 'LOG_ADDED' && event.data?.entry) {
      const entry = event.data.entry as VisitorLog;
      const key = `${entry.ip}_${entry.action}_${entry.timestamp.slice(0, 19)}`;
      if (!allLogs.some(l => `${l.ip}_${l.action}_${l.timestamp.slice(0, 19)}` === key)) {
        allLogs.unshift(entry);
        if (allLogs.length > 500) allLogs.length = 500;
        const stats = computeStats(allLogs);
        updateKpiUi(stats);
        filterLogs();
        updateVisitorMap(allLogs);

        // If location was shared, auto fly to it and cache pinned location
        if (entry.latitude && entry.longitude) {
          try {
            localStorage.setItem('ivraine_saved_pinned_location', JSON.stringify({
              latitude: entry.latitude,
              longitude: entry.longitude,
              fullAddress: entry.fullAddress || '',
              city: entry.city || '',
              country: entry.country || '',
              timestamp: entry.timestamp
            }));
          } catch {}
          flyToLocation(entry.latitude, entry.longitude);
        }
      }
    } else if (event.data?.type === 'REFRESH') {
      void loadAdminData();
    }
  };
} catch {}

window.addEventListener('storage', (e) => {
  if (
    e.key === 'ivraine_visitor_logs' ||
    e.key === 'ivraine_proposal_status' ||
    e.key === 'ivraine_last_location' ||
    e.key === 'ivraine_saved_pinned_location'
  ) {
    void loadAdminData();
  }
});

// Real-time Supabase database listener for visitor location pins
try {
  const sbClient = getAdminSupabaseClient();
  if (sbClient) {
    sbClient
      .channel('admin_realtime_pins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ivraine_visitor_logs' }, () => {
        void loadAdminData();
      })
      .subscribe();
  }
} catch {}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    void loadAdminData();
  }, 3500);
}

// Export CSV
function exportCsv() {
  if (!allLogs.length) {
    alert('No logs to export.');
    return;
  }
  const headers = ['Timestamp', 'IP Address', 'Section', 'Action', 'Details', 'Address', 'Latitude', 'Longitude', 'User', 'User Agent'];
  const rows = allLogs.map(l => [
    `"${l.timestamp}"`,
    `"${l.ip}"`,
    `"${l.section}"`,
    `"${(l.action || '').replace(/"/g, '""')}"`,
    `"${(l.details || '').replace(/"/g, '""')}"`,
    `"${(l.fullAddress || '').replace(/"/g, '""')}"`,
    `"${l.latitude || ''}"`,
    `"${l.longitude || ''}"`,
    `"${(l.user || '').replace(/"/g, '""')}"`,
    `"${(l.userAgent || '').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ivraine-visitor-ips-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Clear logs
async function clearLogs() {
  if (!confirm('Are you sure you want to clear all visitor IP activity logs?')) return;
  try {
    localStorage.removeItem('ivraine_visitor_logs');
  } catch {}

  const endpoint = getBackendEndpoint('/api/admin/clear-logs');
  if (endpoint) {
    try {
      await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(3000) });
    } catch {}
  }

  if (supabase) {
    try {
      await supabase.from('ivraine_visitor_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch {}
  }

  allLogs = [];
  void loadAdminData();
}

// Settings: Railway API URL & Mapbox Access Token
function setupSettings() {
  // Railway URL
  const input = document.getElementById('api-url-input') as HTMLInputElement | null;
  const saveBtn = document.getElementById('btn-save-api-url') as HTMLButtonElement | null;
  const statusMsg = document.getElementById('api-url-status') as HTMLParagraphElement | null;

  if (input && saveBtn) {
    input.value = localStorage.getItem('ivraine-api-url') || import.meta.env.VITE_API_URL || '';
    saveBtn.onclick = async () => {
      const val = input.value.trim();
      if (!val) {
        localStorage.removeItem('ivraine-api-url');
        if (statusMsg) statusMsg.textContent = 'Cleared. Defaulting to standalone Supabase/local mode.';
        void loadAdminData();
        return;
      }
      try {
        saveBtn.disabled = true;
        if (statusMsg) statusMsg.textContent = 'Testing connection…';
        const cleanUrl = val.replace(/\/+$/, '');
        const testRes = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(5000) });
        if (!testRes.ok) throw new Error(`HTTP ${testRes.status}`);
        localStorage.setItem('ivraine-api-url', cleanUrl);
        if (statusMsg) {
          statusMsg.style.color = '#2ecc71';
          statusMsg.textContent = '✓ Connected successfully to Railway API!';
        }
        void loadAdminData();
      } catch (err: any) {
        if (statusMsg) {
          statusMsg.style.color = '#ff6b81';
          statusMsg.textContent = `Could not reach ${val}. Make sure the Railway service is running and FRONTEND_ORIGINS includes ${location.origin}.`;
        }
        localStorage.setItem('ivraine-api-url', val);
      } finally {
        saveBtn.disabled = false;
      }
    };
  }

  // Mapbox Token (Settings Tab)
  const mapboxInput = document.getElementById('mapbox-token-input') as HTMLInputElement | null;
  const mapboxSaveBtn = document.getElementById('btn-save-mapbox-token') as HTMLButtonElement | null;
  const mapboxStatus = document.getElementById('mapbox-token-status') as HTMLParagraphElement | null;

  function applyMapboxToken(val: string) {
    if (!val) {
      localStorage.removeItem('ivraine-mapbox-token');
      if (mapboxStatus) {
        mapboxStatus.style.color = '#fbbf24';
        mapboxStatus.textContent = 'Cleared. Using Leaflet Ultra-HD tiles.';
      }
      showMapToast('Switched to Leaflet Ultra-HD tiles');
    } else {
      localStorage.setItem('ivraine-mapbox-token', val);
      if (mapboxStatus) {
        mapboxStatus.style.color = '#2ecc71';
        mapboxStatus.textContent = '✓ Mapbox Token saved! Loading Mapbox GL vector tiles…';
      }
      showMapToast('✓ Mapbox Token saved! Activating Mapbox GL…');
    }

    // Clean up current map
    if (mapInstance) {
      try {
        if (mapType === 'mapbox') mapInstance.remove();
        else if (mapType === 'leaflet') mapInstance.remove();
      } catch {}
      mapInstance = null;
    }
    mapInitialized = false;
    userInteractedWithMap = false;
    setTimeout(() => initVisitorMap(), 200);
  }

  if (mapboxInput && mapboxSaveBtn) {
    mapboxInput.value = localStorage.getItem('ivraine-mapbox-token') || import.meta.env.VITE_MAPBOX_TOKEN || '';
    mapboxSaveBtn.onclick = () => {
      applyMapboxToken(mapboxInput.value.trim());
    };
  }

  // Quick Mapbox Drawer on Map Tab
  const quickDrawer = document.getElementById('quick-mapbox-drawer') as HTMLDivElement | null;
  const quickInput = document.getElementById('quick-mapbox-input') as HTMLInputElement | null;
  const btnQuickOpen = document.getElementById('btn-quick-mapbox-token') as HTMLButtonElement | null;
  const btnQuickClose = document.getElementById('btn-quick-close-mapbox') as HTMLButtonElement | null;
  const btnQuickSave = document.getElementById('btn-quick-save-mapbox') as HTMLButtonElement | null;

  if (quickInput) {
    quickInput.value = localStorage.getItem('ivraine-mapbox-token') || import.meta.env.VITE_MAPBOX_TOKEN || '';
  }

  btnQuickOpen?.addEventListener('click', () => {
    if (quickDrawer) {
      const isHidden = quickDrawer.style.display === 'none';
      quickDrawer.style.display = isHidden ? 'block' : 'none';
      if (isHidden && quickInput) quickInput.focus();
    }
  });

  btnQuickClose?.addEventListener('click', () => {
    if (quickDrawer) quickDrawer.style.display = 'none';
  });

  btnQuickSave?.addEventListener('click', () => {
    const val = (quickInput?.value || '').trim();
    if (mapboxInput) mapboxInput.value = val;
    applyMapboxToken(val);
    if (quickDrawer) quickDrawer.style.display = 'none';
  });

  // Android TWA / Digital Asset Links
  const twaPkgInput = document.getElementById('twa-package-input') as HTMLInputElement | null;
  const twaShaInput = document.getElementById('twa-sha256-input') as HTMLTextAreaElement | null;
  const twaForm = document.getElementById('twa-config-form') as HTMLFormElement | null;
  const twaSaveStatus = document.getElementById('twa-save-status') as HTMLParagraphElement | null;
  const twaResetBtn = document.getElementById('btn-reset-twa') as HTMLButtonElement | null;
  const twaTestBtn = document.getElementById('btn-test-assetlinks') as HTMLButtonElement | null;
  const twaFeedback = document.getElementById('twa-test-feedback') as HTMLDivElement | null;

  if (twaPkgInput && twaShaInput) {
    const savedPkg = localStorage.getItem('ivraine-twa-package') || 'app.vercel.ivraine.twa';
    const savedSha = localStorage.getItem('ivraine-twa-sha256') || '14:6D:E9:DE:8F:52:E2:E7:59:77:EC:8B:2A:B7:C5:16:8C:F5:2A:77:4B:97:DF:7B:6A:3E:92:07:95:67:BE:53:C9:8F';
    twaPkgInput.value = savedPkg;
    twaShaInput.value = savedSha;
  }

  twaTestBtn?.addEventListener('click', async () => {
    if (!twaFeedback) return;
    twaFeedback.innerHTML = '<span style="color:#d8b4fe;">Testing /.well-known/assetlinks.json…</span>';
    try {
      const res = await fetch('/.well-known/assetlinks.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : 0;
      twaFeedback.innerHTML = `<span style="color:#2ecc71;">✓ Success: Valid Digital Asset Links JSON loaded (${count} statements declared). Android Chrome can verify your app!</span>`;
    } catch (err: any) {
      twaFeedback.innerHTML = `<span style="color:#ff6b81;">✕ Error reaching assetlinks.json: ${err?.message || 'Failed to fetch'}</span>`;
    }
  });

  twaForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!twaPkgInput || !twaShaInput || !twaSaveStatus) return;
    const pkg = twaPkgInput.value.trim();
    const sha = twaShaInput.value.trim();
    if (!pkg || !sha) {
      twaSaveStatus.style.color = '#ff6b81';
      twaSaveStatus.textContent = 'Please enter both Package Name and SHA-256 Fingerprint.';
      return;
    }

    localStorage.setItem('ivraine-twa-package', pkg);
    localStorage.setItem('ivraine-twa-sha256', sha);

    try {
      await fetch('/api/admin/assetlinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageName: pkg, sha256Fingerprint: sha })
      });
    } catch {}

    twaSaveStatus.style.color = '#2ecc71';
    twaSaveStatus.textContent = '✓ Digital Asset Links saved! If Chrome on your phone previously failed verification: Force Stop Chrome in Android Settings > Apps > Chrome, then reopen the TWA.';
  });

  twaResetBtn?.addEventListener('click', () => {
    if (!twaPkgInput || !twaShaInput || !twaSaveStatus) return;
    twaPkgInput.value = 'app.vercel.ivraine.twa';
    twaShaInput.value = '14:6D:E9:DE:8F:52:E2:E7:59:77:EC:8B:2A:B7:C5:16:8C:F5:2A:77:4B:97:DF:7B:6A:3E:92:07:95:67:BE:53:C9:8F';
    localStorage.removeItem('ivraine-twa-package');
    localStorage.removeItem('ivraine-twa-sha256');
    twaSaveStatus.style.color = '#fbbf24';
    twaSaveStatus.textContent = 'Reset to default configuration.';
  });

  // Layer Switching Pills
  document.getElementById('btn-layer-dark')?.addEventListener('click', () => setMapLayerStyle('dark'));
  document.getElementById('btn-layer-satellite')?.addEventListener('click', () => setMapLayerStyle('satellite'));
  document.getElementById('btn-layer-streets')?.addEventListener('click', () => setMapLayerStyle('streets'));

  // Center on latest pin button
  document.getElementById('btn-center-latest-map')?.addEventListener('click', () => {
    userInteractedWithMap = false;
    const geoLogs = allLogs.filter(l => l.latitude && l.longitude);
    if (geoLogs.length > 0) {
      flyToLocation(geoLogs[0].latitude!, geoLogs[0].longitude!);
      showMapToast(`🎯 Focused on ${geoLogs[0].user || 'latest visitor'} pin`);
    } else {
      alert('No visitor locations logged yet. Have Loraine open the app and allow location to see her on the map!');
    }
  });
}

// Tabs switching
document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.dataset.tab!;
    document.getElementById(targetId)?.classList.add('active');

    // Resize map when map tab becomes active
    if (targetId === 'tab-map') {
      setTimeout(() => {
        if (!mapInitialized) {
          initVisitorMap();
        } else if (mapType === 'leaflet' && mapInstance) {
          mapInstance.invalidateSize();
        } else if (mapType === 'mapbox' && mapInstance) {
          mapInstance.resize();
        }
      }, 100);
    }
  });
});

// Event listeners
document.getElementById('log-search')?.addEventListener('input', filterLogs);
document.getElementById('section-filter')?.addEventListener('change', filterLogs);
document.getElementById('btn-refresh')?.addEventListener('click', () => void loadAdminData());
document.getElementById('btn-export-csv')?.addEventListener('click', exportCsv);
document.getElementById('btn-clear-logs')?.addEventListener('click', () => void clearLogs());

// Proposal Tester in Admin
document.getElementById('btn-test-proposal')?.addEventListener('click', () => {
  openProposalModal('Admin', 'Loraine');
});

document.getElementById('btn-reset-proposal')?.addEventListener('click', () => {
  try {
    localStorage.removeItem('ivraine_proposal_status');
    localStorage.removeItem('ivraine_proposal_date');
    localStorage.removeItem('ivraine_proposal_dodges');
    alert('Proposal response reset in this browser. You can now test it again from the beginning!');
    void loadAdminData();
  } catch {}
});

setupSettings();

// Init
if (isUnlocked()) {
  unlockAdmin();
} else {
  lockAdmin();
}
