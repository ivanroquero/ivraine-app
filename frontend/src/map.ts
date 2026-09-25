import L from 'leaflet';
import type { Entry } from './types';
import { escapeHtml as h, dateLabel } from './utils';

// Common travel destinations dictionary
const KNOWN_DESTINATIONS: Record<string, [number, number]> = {
  tokyo: [35.6762, 139.6503],
  kyoto: [35.0116, 135.7681],
  osaka: [34.6937, 135.5023],
  manila: [14.5995, 120.9842],
  bgc: [14.5547, 121.0494],
  taguig: [14.5176, 121.0509],
  makati: [14.5547, 121.0244],
  'el nido': [11.1956, 119.4124],
  palawan: [9.8349, 118.7384],
  boracay: [11.9674, 121.9248],
  cebu: [10.3157, 123.8854],
  siargao: [9.8587, 126.0469],
  baguio: [16.4023, 120.5960],
  tagaytay: [14.1153, 120.9621],
  batangas: [13.7565, 121.0583],
  paris: [48.8566, 2.3522],
  seoul: [37.5665, 126.9780],
  'new york': [40.7128, -74.0060],
  london: [51.5074, -0.1278],
  rome: [41.9028, 12.4964],
  singapore: [1.3521, 103.8198],
  bali: [-8.4095, 115.1889],
  bangkok: [13.7563, 100.5018],
  taipei: [25.0330, 121.5654],
  'hong kong': [22.3193, 114.1694],
  'san francisco': [37.7749, -122.4194],
  'los angeles': [34.0522, -118.2437],
  sydney: [-33.8688, 151.2093],
  melbourne: [-37.8136, 144.9631],
  barcelona: [41.3879, 2.1699],
  switzerland: [46.8182, 8.2275],
  amsterdam: [52.3676, 4.9041],
};

function parseCoordString(loc: string): [number, number] | null {
  const match = loc.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [lat, lng];
    }
  }
  return null;
}

function resolveKnownLocation(loc: string): [number, number] | null {
  const clean = loc.toLowerCase().trim();
  for (const [key, coords] of Object.entries(KNOWN_DESTINATIONS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return coords;
    }
  }
  return null;
}

let activeMap: L.Map | null = null;

export function renderMemoryMap(container: HTMLElement, entries: Entry[], onOpenViewer: (entry: Entry) => void) {
  if (activeMap) {
    activeMap.remove();
    activeMap = null;
  }

  container.innerHTML = '';
  const mapElement = document.createElement('div');
  mapElement.className = 'interactive-leaflet-map';
  container.append(mapElement);

  const memoriesWithLoc = entries.filter(e => e.kind === 'memory' && e.location && e.location.trim().length > 0);
  const map = L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView([14.5995, 120.9842], 4);
  activeMap = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  const customIcon = L.divIcon({
    className: 'custom-leaflet-heart-pin',
    html: '<span class="pin-stem"></span><span class="pin-heart-disc">♥</span>',
    iconSize: [32, 42],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
  });

  const bounds: [number, number][] = [];

  for (const entry of memoriesWithLoc) {
    let coords = parseCoordString(entry.location);
    if (!coords) {
      coords = resolveKnownLocation(entry.location);
    }
    // If not found in known dict, generate deterministic pseudo coords based on hash for private locations
    if (!coords) {
      let hash = 0;
      for (let i = 0; i < entry.location.length; i++) hash = (hash << 5) - hash + entry.location.charCodeAt(i);
      const latOffset = ((Math.abs(hash) % 1000) / 1000) * 8 - 4;
      const lngOffset = ((Math.abs(hash * 3) % 1000) / 1000) * 8 - 4;
      coords = [14.5995 + latOffset, 120.9842 + lngOffset];
    }

    bounds.push(coords);

    const marker = L.marker(coords, { icon: customIcon }).addTo(map);

    const popupHtml = `
      <div class="map-popup-card">
        ${entry.photo_urls?.[0] ? `<img src="${h(entry.photo_urls[0])}" class="map-popup-thumb" alt="${h(entry.title)}" loading="lazy">` : ''}
        <div class="map-popup-body">
          <span class="eyebrow">${h(entry.chapter)}</span>
          <h4>${h(entry.title)}</h4>
          <span class="metadata">${h(entry.location)} · ${h(dateLabel(entry.event_date))}</span>
          <button type="button" class="primary map-popup-btn" data-popup-id="${entry.id}">View photos ♡</button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, { maxWidth: 260, className: 'couple-map-popup' });
    marker.on('popupopen', (e) => {
      const btn = e.popup.getElement()?.querySelector<HTMLButtonElement>('[data-popup-id]');
      if (btn) {
        btn.onclick = () => onOpenViewer(entry);
      }
    });
  }

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }

  // Invalidate size on next frame to ensure crisp tile layout
  requestAnimationFrame(() => {
    map.invalidateSize();
  });

  return map;
}

export function cleanupMemoryMap() {
  if (activeMap) {
    activeMap.remove();
    activeMap = null;
  }
}
