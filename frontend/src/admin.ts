import { openProposalModal } from './proposal';
import { supabase } from './api';
import { createClient } from '@supabase/supabase-js';

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
  dodgeCount?: number;
  latitude?: number | null;
  longitude?: number | null;
  fullAddress?: string;
  city?: string;
  country?: string;
  timestamp: string;
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
let isDraggingPin = false;
let latestPinnedCoords: { lat: number; lng: number; address?: string; user?: string } | null = null;

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
// MAPBOX / LEAFLET LIVE VISITOR MAP ENGINE (ULTRA-HD, DEEP-ZOOM, GRABBABLE LIVE PIN)
// -----------------------------------------------------------------------------------------

function updateMapHud(lat: number, lng: number, address?: string, isDraggable: boolean = true) {
  const coordsEl = document.getElementById('hud-coordinates');
  if (coordsEl) {
    coordsEl.textContent = `📍 ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
  }
  const addrEl = document.getElementById('hud-address');
  if (addrEl && address) {
    addrEl.textContent = address.length > 40 ? address.slice(0, 38) + '…' : address;
    addrEl.title = address;
  }
  const statusEl = document.getElementById('hud-interaction-status');
  if (statusEl) {
    statusEl.textContent = isDraggable ? '🖐 Draggable (Grab pin to reposition)' : '📍 Fixed Location';
    statusEl.style.color = '#2ecc71';
  }
  const engineEl = document.getElementById('hud-engine-tag');
  if (engineEl) {
    engineEl.textContent = mapType === 'mapbox' ? 'Mapbox GL Vector' : 'Leaflet Ultra-HD';
  }
}

function updateHudCoords(lat: number, lng: number) {
  const coordsEl = document.getElementById('hud-coordinates');
  if (coordsEl) {
    coordsEl.textContent = `📍 ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E (Moving...)`;
  }
  const statusEl = document.getElementById('hud-interaction-status');
  if (statusEl) {
    statusEl.textContent = '🖐 Repositioning Live Pin…';
    statusEl.style.color = '#ff6b81';
  }
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

function createLiveMarkerElement(user: string, _isPrimary: boolean = true): HTMLElement {
  const container = document.createElement('div');
  container.className = 'live-map-marker-container';
  container.setAttribute('role', 'button');
  container.setAttribute('aria-label', `Live location pin for ${user}. Drag to move.`);

  const wave1 = document.createElement('div');
  wave1.className = 'live-radar-ping';

  const wave2 = document.createElement('div');
  wave2.className = 'live-radar-ping second';

  const center = document.createElement('div');
  center.className = 'live-marker-center';

  const emoji = document.createElement('span');
  emoji.className = 'live-marker-emoji';
  emoji.textContent = '💖';
  center.appendChild(emoji);

  const pill = document.createElement('div');
  pill.className = 'live-marker-pill';
  pill.innerHTML = `<span class="pill-dot"></span><span>${escapeHtml(user || 'Loraine')} ♡</span>`;

  container.appendChild(wave1);
  container.appendChild(wave2);
  container.appendChild(center);
  container.appendChild(pill);

  return container;
}

async function handlePinRepositioned(newLat: number, newLng: number, user: string = 'Loraine') {
  updateHudCoords(newLat, newLng);
  showMapToast(`📍 Pin placed at ${newLat.toFixed(4)}, ${newLng.toFixed(4)}! Resolving address…`);

  let resolvedAddress = `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`;
  let resolvedCity = '';
  let resolvedCountry = 'Philippines';

  // Reverse geocode via Nominatim
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&zoom=18&addressdetails=1`;
    const res = await fetch(geoUrl, {
      headers: { 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) {
        resolvedAddress = data.display_name;
        resolvedCity = data.address?.city || data.address?.town || data.address?.municipality || data.address?.county || '';
        resolvedCountry = data.address?.country || 'Philippines';
      }
    }
  } catch {}

  latestPinnedCoords = { lat: newLat, lng: newLng, address: resolvedAddress, user };
  updateMapHud(newLat, newLng, resolvedAddress);
  showMapToast(`📍 Pin saved: ${resolvedCity ? resolvedCity + ' · ' : ''}${resolvedAddress.slice(0, 30)} ♡`);

  // Persist locally
  const locPayload = {
    latitude: newLat,
    longitude: newLng,
    fullAddress: resolvedAddress,
    city: resolvedCity,
    country: resolvedCountry,
    user,
    timestamp: new Date().toISOString()
  };
  try {
    localStorage.setItem('ivraine_saved_pinned_location', JSON.stringify(locPayload));
    localStorage.setItem('ivraine_last_location', JSON.stringify(locPayload));
  } catch {}

  // Sync to Backend & Supabase
  try {
    const trackPayload = {
      section: 'Admin',
      action: '📍 Moved Live Pin on Map ♡',
      details: resolvedAddress,
      user,
      latitude: newLat,
      longitude: newLng,
      fullAddress: resolvedAddress,
      city: resolvedCity,
      country: resolvedCountry
    };

    const endpoint = getBackendEndpoint('/api/date-location');
    if (endpoint) {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackPayload)
      });
    }

    const sb = getAdminSupabaseClient();
    if (sb) {
      void sb.from('ivraine_visitor_logs').insert([{
        ip: currentClientIp,
        section: 'Admin',
        action: '📍 Moved Live Pin on Map ♡',
        details: resolvedAddress,
        user_name: user,
        latitude: newLat,
        longitude: newLng,
        full_address: resolvedAddress,
        city: resolvedCity,
        country: resolvedCountry
      }]);
    }
  } catch {}

  // Update in-memory logs
  const existingLog = allLogs.find(l => l.latitude != null && l.longitude != null);
  if (existingLog) {
    existingLog.latitude = newLat;
    existingLog.longitude = newLng;
    existingLog.fullAddress = resolvedAddress;
    existingLog.city = resolvedCity;
  }
  renderRecentLocationsDeck(allLogs.filter(l => l.latitude && l.longitude));
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
  if (!mapInstance || !mapInitialized || isDraggingPin) return;

  const geoLogs: VisitorLog[] = logs
    .map(l => {
      const lat = typeof l.latitude === 'number' ? l.latitude : (l.latitude ? parseFloat(String(l.latitude)) : null);
      const lng = typeof l.longitude === 'number' ? l.longitude : (l.longitude ? parseFloat(String(l.longitude)) : null);
      return { ...l, latitude: lat, longitude: lng };
    })
    .filter(l => l.latitude != null && l.longitude != null && !isNaN(l.latitude) && !isNaN(l.longitude));

  renderRecentLocationsDeck(geoLogs);

  if (geoLogs.length > 0) {
    const primary = geoLogs[0];
    updateMapHud(primary.latitude!, primary.longitude!, primary.fullAddress || `${primary.city || ''} ${primary.country || ''}`.trim() || 'Bohol, Philippines');
  }

  if (mapType === 'mapbox') {
    try { mapInstance.resize(); } catch {}

    mapMarkers.forEach(m => {
      try { m.remove(); } catch {}
    });
    mapMarkers = [];

    const bounds = new mapboxgl.LngLatBounds();

    geoLogs.forEach((log, index) => {
      const lat = log.latitude!;
      const lng = log.longitude!;
      const isPrimary = index === 0;

      const el = createLiveMarkerElement(log.user || 'Loraine', isPrimary);

      const popupHtml = `
        <div class="map-popup-header">
          <span>💖</span>
          <span>${escapeHtml(log.user || 'Visitor')}</span>
          <span class="badge-section ${log.section === 'Scrapbook' ? 'scrapbook' : 'space'}">${escapeHtml(log.section)}</span>
        </div>
        <div class="map-popup-address">📍 ${escapeHtml(log.fullAddress || 'Address details in log')}</div>
        <div class="map-popup-meta">
          <span>🌐 ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
          <span>💻 IP: ${escapeHtml(log.ip)}</span>
          <span>⏱ ${escapeHtml(timeAgo(log.timestamp))}</span>
          <span style="color:#2ecc71;font-weight:600;margin-top:4px;">🖐 Drag marker to reposition</span>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 30 }).setHTML(popupHtml);

      const marker = new mapboxgl.Marker({
        element: el,
        draggable: true
      })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(mapInstance);

      marker.on('dragstart', () => {
        isDraggingPin = true;
        userInteractedWithMap = true;
        el.classList.add('is-dragging');
        updateHudCoords(marker.getLngLat().lat, marker.getLngLat().lng);
      });

      marker.on('drag', () => {
        const pos = marker.getLngLat();
        updateHudCoords(pos.lat, pos.lng);
      });

      marker.on('dragend', async () => {
        isDraggingPin = false;
        el.classList.remove('is-dragging');
        const pos = marker.getLngLat();
        await handlePinRepositioned(pos.lat, pos.lng, log.user || 'Loraine');
      });

      mapMarkers.push(marker);
      bounds.extend([lng, lat]);
    });

    if (geoLogs.length > 0 && !bounds.isEmpty() && !userInteractedWithMap) {
      try {
        if (geoLogs.length === 1) {
          mapInstance.flyTo({ center: [geoLogs[0].longitude, geoLogs[0].latitude], zoom: 16, essential: true });
        } else {
          mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 16 });
        }
      } catch {}
    }
  } else if (mapType === 'leaflet' && leafletMarkersLayer) {
    try { mapInstance.invalidateSize(); } catch {}
    leafletMarkersLayer.clearLayers();
    mapMarkers = [];

    const latLngs: any[] = [];

    geoLogs.forEach((log, index) => {
      const lat = log.latitude!;
      const lng = log.longitude!;
      const isPrimary = index === 0;

      const el = createLiveMarkerElement(log.user || 'Loraine', isPrimary);

      const divIcon = L.divIcon({
        className: 'leaflet-clean-marker',
        html: el,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
        popupAnchor: [0, -25]
      });

      const popupHtml = `
        <div class="map-popup-header">
          <span>💖</span>
          <span>${escapeHtml(log.user || 'Visitor')}</span>
          <span class="badge-section ${log.section === 'Scrapbook' ? 'scrapbook' : 'space'}">${escapeHtml(log.section)}</span>
        </div>
        <div class="map-popup-address">📍 ${escapeHtml(log.fullAddress || 'Address details in log')}</div>
        <div class="map-popup-meta">
          <span>🌐 ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
          <span>💻 IP: ${escapeHtml(log.ip)}</span>
          <span>⏱ ${escapeHtml(timeAgo(log.timestamp))}</span>
          <span style="color:#2ecc71;font-weight:600;margin-top:4px;">🖐 Drag marker to reposition</span>
        </div>
      `;

      const marker = L.marker([lat, lng], {
        icon: divIcon,
        draggable: true
      })
        .bindPopup(popupHtml)
        .addTo(leafletMarkersLayer);

      marker.on('dragstart', () => {
        isDraggingPin = true;
        userInteractedWithMap = true;
        el.classList.add('is-dragging');
        updateHudCoords(marker.getLatLng().lat, marker.getLatLng().lng);
      });

      marker.on('drag', () => {
        const pos = marker.getLatLng();
        updateHudCoords(pos.lat, pos.lng);
      });

      marker.on('dragend', async () => {
        isDraggingPin = false;
        el.classList.remove('is-dragging');
        const pos = marker.getLatLng();
        await handlePinRepositioned(pos.lat, pos.lng, log.user || 'Loraine');
      });

      mapMarkers.push({ marker, lat, lng, log });
      latLngs.push([lat, lng]);
    });

    if (latLngs.length > 0 && !userInteractedWithMap) {
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
