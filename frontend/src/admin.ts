import { openProposalModal } from './proposal';
import { supabase } from './api';

declare const mapboxgl: any;
declare const L: any;

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
let currentMapStyle = 'dark';
let mapInitialized = false;

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
// MAPBOX / LEAFLET LIVE VISITOR MAP ENGINE
// -----------------------------------------------------------------------------------------
function initVisitorMap() {
  const mapContainer = document.getElementById('admin-visitor-map');
  if (!mapContainer || mapInitialized) return;

  const mapboxToken = localStorage.getItem('ivraine-mapbox-token') || import.meta.env.VITE_MAPBOX_TOKEN || '';

  // 1. Attempt Mapbox GL JS if token is present
  if (mapboxToken && typeof mapboxgl !== 'undefined') {
    try {
      mapboxgl.accessToken = mapboxToken;
      mapInstance = new mapboxgl.Map({
        container: 'admin-visitor-map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [121.0, 14.5], // Default center around Manila/SE Asia
        zoom: 3
      });

      mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapType = 'mapbox';
      mapInitialized = true;

      mapInstance.on('load', () => {
        updateVisitorMap(allLogs);
      });
      return;
    } catch {}
  }

  // 2. Leaflet Fallback (CartoDB Dark Matter)
  if (typeof L !== 'undefined') {
    try {
      mapInstance = L.map('admin-visitor-map', {
        zoomControl: true
      }).setView([14.5995, 120.9842], 4);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB &copy; OpenStreetMap',
        maxZoom: 19
      }).addTo(mapInstance);

      leafletMarkersLayer = L.layerGroup().addTo(mapInstance);
      mapType = 'leaflet';
      mapInitialized = true;
      updateVisitorMap(allLogs);
    } catch {}
  }
}

function updateVisitorMap(logs: VisitorLog[]) {
  if (!mapInstance || !mapInitialized) return;

  const geoLogs = logs.filter(l => typeof l.latitude === 'number' && typeof l.longitude === 'number' && !isNaN(l.latitude) && !isNaN(l.longitude));
  renderRecentLocationsDeck(geoLogs);

  if (mapType === 'mapbox') {
    // Clear Mapbox markers
    mapMarkers.forEach(m => m.remove());
    mapMarkers = [];

    const bounds = new mapboxgl.LngLatBounds();

    geoLogs.forEach(log => {
      const lat = log.latitude!;
      const lng = log.longitude!;

      const el = document.createElement('div');
      el.className = 'map-heart-marker';
      el.innerHTML = '💖';

      const popupHtml = `
        <div class="map-popup-header">
          <span>💖</span>
          <span>${escapeHtml(log.user || 'Visitor')}</span>
          <span class="badge-section ${log.section === 'Scrapbook' ? 'scrapbook' : 'space'}">${escapeHtml(log.section)}</span>
        </div>
        <div class="map-popup-address">📍 ${escapeHtml(log.fullAddress || 'Address details in log')}</div>
        <div class="map-popup-meta">
          <span>🌐 ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
          <span>💻 IP: ${escapeHtml(log.ip)}</span>
          <span>⏱ ${escapeHtml(timeAgo(log.timestamp))}</span>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(mapInstance);

      mapMarkers.push(marker);
      bounds.extend([lng, lat]);
    });

    if (geoLogs.length > 0 && !bounds.isEmpty()) {
      try {
        mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      } catch {}
    }
  } else if (mapType === 'leaflet' && leafletMarkersLayer) {
    // Leaflet marker rendering
    leafletMarkersLayer.clearLayers();
    mapMarkers = [];

    const latLngs: any[] = [];

    geoLogs.forEach(log => {
      const lat = log.latitude!;
      const lng = log.longitude!;

      const heartIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="map-heart-marker">💖</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const popupHtml = `
        <div class="map-popup-header">
          <span>💖</span>
          <span>${escapeHtml(log.user || 'Visitor')}</span>
          <span class="badge-section ${log.section === 'Scrapbook' ? 'scrapbook' : 'space'}">${escapeHtml(log.section)}</span>
        </div>
        <div class="map-popup-address">📍 ${escapeHtml(log.fullAddress || 'Address details in log')}</div>
        <div class="map-popup-meta">
          <span>🌐 ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
          <span>💻 IP: ${escapeHtml(log.ip)}</span>
          <span>⏱ ${escapeHtml(timeAgo(log.timestamp))}</span>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon: heartIcon })
        .bindPopup(popupHtml)
        .addTo(leafletMarkersLayer);

      mapMarkers.push({ marker, lat, lng, log });
      latLngs.push([lat, lng]);
    });

    if (latLngs.length > 0) {
      try {
        if (latLngs.length === 1) {
          mapInstance.setView(latLngs[0], 14);
        } else {
          mapInstance.fitBounds(latLngs, { padding: [50, 50], maxZoom: 14 });
        }
        if (mapMarkers.length > 0 && mapMarkers[0]?.marker?.openPopup) {
          mapMarkers[0].marker.openPopup();
        }
      } catch {}
    }
  }
}

function flyToLocation(lat: number, lng: number) {
  if (!mapInstance) return;

  // Switch to Map tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="tab-map"]')?.classList.add('active');
  document.getElementById('tab-map')?.classList.add('active');

  setTimeout(() => {
    if (mapType === 'mapbox') {
      mapInstance.flyTo({ center: [lng, lat], zoom: 14, essential: true });
    } else if (mapType === 'leaflet') {
      mapInstance.invalidateSize();
      mapInstance.setView([lat, lng], 14, { animate: true });
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

  // 1. Try Backend API only if configured or in local dev
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

  // 2. Try Supabase
  let fetchedFromSupabase = false;
  if (!fetchedFromBackend && supabase) {
    try {
      const { data, error } = await supabase
        .from('ivraine_visitor_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (!error && Array.isArray(data) && data.length > 0) {
        fetchedLogs = data.map((row: any) => ({
          id: row.id,
          ip: row.ip || '127.0.0.1',
          section: row.section || 'Scrapbook',
          action: row.action || 'Visit',
          details: row.details || '',
          user: row.user_name || 'Visitor',
          userAgent: row.user_agent || '',
          dodgeCount: row.dodge_count || 0,
          latitude: typeof row.latitude === 'number' ? row.latitude : null,
          longitude: typeof row.longitude === 'number' ? row.longitude : null,
          fullAddress: row.full_address || '',
          city: row.city || '',
          country: row.country || '',
          timestamp: row.created_at || new Date().toISOString()
        }));
        fetchedFromSupabase = true;
        updateConnectionBadge('supabase');
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

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    void loadAdminData();
  }, 5000);
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

  // Mapbox Token
  const mapboxInput = document.getElementById('mapbox-token-input') as HTMLInputElement | null;
  const mapboxSaveBtn = document.getElementById('btn-save-mapbox-token') as HTMLButtonElement | null;
  const mapboxStatus = document.getElementById('mapbox-token-status') as HTMLParagraphElement | null;

  if (mapboxInput && mapboxSaveBtn) {
    mapboxInput.value = localStorage.getItem('ivraine-mapbox-token') || import.meta.env.VITE_MAPBOX_TOKEN || '';
    mapboxSaveBtn.onclick = () => {
      const val = mapboxInput.value.trim();
      if (!val) {
        localStorage.removeItem('ivraine-mapbox-token');
        if (mapboxStatus) {
          mapboxStatus.style.color = '#fbbf24';
          mapboxStatus.textContent = 'Cleared. Using CartoDB dark tiles via Leaflet.';
        }
      } else {
        localStorage.setItem('ivraine-mapbox-token', val);
        if (mapboxStatus) {
          mapboxStatus.style.color = '#2ecc71';
          mapboxStatus.textContent = '✓ Mapbox Token saved! Re-initializing map…';
        }
      }
      mapInitialized = false;
      setTimeout(() => initVisitorMap(), 200);
    };
  }

  // Map Toolbar Buttons
  document.getElementById('btn-center-latest-map')?.addEventListener('click', () => {
    const geoLogs = allLogs.filter(l => l.latitude && l.longitude);
    if (geoLogs.length > 0) {
      flyToLocation(geoLogs[0].latitude!, geoLogs[0].longitude!);
    } else {
      alert('No visitor locations logged yet. Have Loraine open the app and allow location to see her on the map!');
    }
  });

  document.getElementById('btn-toggle-map-style')?.addEventListener('click', () => {
    if (mapType === 'mapbox' && mapInstance) {
      currentMapStyle = currentMapStyle === 'dark' ? 'satellite' : 'dark';
      const styleUrl = currentMapStyle === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/satellite-streets-v12';
      mapInstance.setStyle(styleUrl);
    } else if (mapType === 'leaflet' && mapInstance) {
      alert('To use satellite imagery, enter a free Mapbox access token in the Settings & API tab.');
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
