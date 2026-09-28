// Shared geolocation accuracy helpers.
//
// The visitor app (proposal flow) writes a machine readable GPS tag into the log
// `details` text and the admin live map reads it back. Keeping both sides on the
// same helpers is what guarantees that a pin on the map is always a *real* device
// GPS fix and never an invented / IP based coordinate.
//
// This module is intentionally dependency free (no DOM, no imports) so it can be
// unit tested directly with tsx.

/** Where a coordinate actually came from. */
export type LocationSource = 'gps' | 'ip' | 'unknown';

export interface GpsMeta {
  source: LocationSource;
  /** Accuracy radius in metres reported by the device (null = device did not say). */
  accuracyMeters: number | null;
}

/** Typical phone GPS accuracy (5-30 m). Below this we call it "precise". */
export const GOOD_ACCURACY_METERS = 50;
/** Anything worse than this must never be presented as an exact phone position. */
export const MAX_USABLE_ACCURACY_METERS = 200;
/** A pin that has not been refreshed for this long is no longer "live". */
export const LIVE_PIN_STALE_MS = 2 * 60 * 1000;

const GPS_TAG_PATTERN = /\[GPS:\s*([^\]]*)\]/i;
const DEVICE_TAG_PATTERN = /\[Device:\s*([^\]]+)\]/i;

/** Builds the `[GPS:source=gps;acc=12]` tag that travels inside `details`. */
export function gpsMetaTag(accuracyMeters?: number | null, source: LocationSource = 'gps'): string {
  const acc = typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters > 0
    ? Math.round(accuracyMeters)
    : 0;
  return `[GPS:source=${source};acc=${acc}]`;
}

/** Reads the tag back. Rows written before this feature have no tag → 'unknown'. */
export function parseGpsMeta(details?: string | null): GpsMeta {
  const match = typeof details === 'string' ? details.match(GPS_TAG_PATTERN) : null;
  if (!match) return { source: 'unknown', accuracyMeters: null };

  const rawSource = /source\s*=\s*(gps|ip|unknown)/i.exec(match[1])?.[1]?.toLowerCase();
  const rawAcc = /acc\s*=\s*(\d+)/i.exec(match[1])?.[1];
  const acc = rawAcc ? Number(rawAcc) : 0;

  return {
    source: (rawSource as LocationSource | undefined) || 'unknown',
    accuracyMeters: Number.isFinite(acc) && acc > 0 ? acc : null
  };
}

export function hasGpsTag(details?: string | null): boolean {
  return typeof details === 'string' && GPS_TAG_PATTERN.test(details);
}

/** Reads the `[Device: dev_xxx]` tag written by the tracking endpoints. */
export function parseDeviceId(details?: string | null): string {
  const match = typeof details === 'string' ? details.match(DEVICE_TAG_PATTERN) : null;
  return match ? match[1].trim() : '';
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}

/** True only when a fix is accurate enough to be shown as the phone's exact spot. */
export function isPreciseGps(accuracyMeters?: number | null): boolean {
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return false;
  return accuracyMeters <= MAX_USABLE_ACCURACY_METERS;
}

export function formatCoordinate(value: number, kind: 'lat' | 'lng'): string {
  const hemisphere = kind === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${Math.abs(value).toFixed(5)}° ${hemisphere}`;
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${formatCoordinate(lat, 'lat')}, ${formatCoordinate(lng, 'lng')}`;
}

export function accuracyLabel(accuracyMeters?: number | null): string {
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return 'accuracy unknown';
  return `±${Math.round(accuracyMeters)} m`;
}

export function accuracyQuality(accuracyMeters?: number | null): 'good' | 'fair' | 'poor' | 'unknown' {
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return 'unknown';
  if (accuracyMeters <= GOOD_ACCURACY_METERS) return 'good';
  if (accuracyMeters <= MAX_USABLE_ACCURACY_METERS) return 'fair';
  return 'poor';
}

/** Great-circle distance in metres (used to decide if the phone really moved). */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  if (![aLat, aLng, bLat, bLng].every(v => typeof v === 'number' && Number.isFinite(v))) return Number.POSITIVE_INFINITY;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** [lng, lat] ring for a GeoJSON accuracy circle (Mapbox GL layers). */
export function accuracyCirclePolygon(lat: number, lng: number, radiusMeters: number, steps = 64): Array<[number, number]> {
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.abs(Math.cos(latRad)));
  const ring: Array<[number, number]> = [];

  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([
      lng + (radiusMeters * Math.sin(angle)) / metersPerDegreeLng,
      lat + (radiusMeters * Math.cos(angle)) / metersPerDegreeLat
    ]);
  }
  ring.push(ring[0]);
  return ring;
}

// ─────────────────────────────────────────────────────────────────────────────
// PWA, OPEN TIME & SESSION DURATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionMeta {
  isPwa: boolean;
  appMode: 'PWA' | 'Browser';
  openedAt?: string;
  durationLabel?: string;
}

const APP_MODE_TAG_PATTERN = /\[AppMode:\s*([^\]]+)\]/i;
const STAY_TAG_PATTERN = /\[Stay:\s*([^\]]+)\]/i;
const OPENED_AT_TAG_PATTERN = /\[OpenedAt:\s*([^\]]+)\]/i;

export function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '< 1m';
  if (seconds < 60) return '< 1m';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

/** Builds machine-readable tags for PWA status, open timestamp, and stay duration. */
export function sessionMetaTag(opts: { isPwa: boolean; openedAt?: string; durationSeconds?: number }): string {
  const parts: string[] = [];
  parts.push(`[AppMode:${opts.isPwa ? 'PWA' : 'Browser'}]`);
  if (opts.openedAt) {
    parts.push(`[OpenedAt:${opts.openedAt}]`);
  }
  if (typeof opts.durationSeconds === 'number' && Number.isFinite(opts.durationSeconds) && opts.durationSeconds >= 0) {
    const label = formatDurationLabel(opts.durationSeconds);
    parts.push(`[Stay:${label}]`);
  }
  return parts.join(' ');
}

/** Extracts session metadata from details tag and User-Agent fallback. */
export function parseSessionMeta(details?: string | null, userAgent?: string | null): SessionMeta {
  const text = typeof details === 'string' ? details : '';
  const appMatch = text.match(APP_MODE_TAG_PATTERN);
  const stayMatch = text.match(STAY_TAG_PATTERN);
  const openedMatch = text.match(OPENED_AT_TAG_PATTERN);

  let isPwa = false;
  if (appMatch) {
    isPwa = /pwa|standalone|installed/i.test(appMatch[1]);
  } else if (typeof userAgent === 'string') {
    isPwa = /standalone|twa|pwa/i.test(userAgent);
  }

  const durationLabel = stayMatch ? stayMatch[1].trim() : undefined;
  const openedAt = openedMatch ? openedMatch[1].trim() : undefined;

  return {
    isPwa,
    appMode: isPwa ? 'PWA' : 'Browser',
    openedAt,
    durationLabel
  };
}

/** Removes machine readable tags so humans see only clean details text. */
export function stripLocationTags(details?: string | null): string {
  if (typeof details !== 'string') return '';
  return details
    .replace(/\[GPS:[^\]]*\]/gi, '')
    .replace(/\[Device:[^\]]*\]/gi, '')
    .replace(/\[AppMode:[^\]]*\]/gi, '')
    .replace(/\[Stay:[^\]]*\]/gi, '')
    .replace(/\[OpenedAt:[^\]]*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface DeduplicatableLocation {
  log: {
    ip?: string | null;
    user?: string | null;
    userAgent?: string | null;
    details?: string | null;
  };
  deviceId?: string | null;
  precise?: boolean;
  updatedAtMs: number;
  accuracyMeters?: number | null;
}

export function normalizeIp(rawIp?: string | null): string {
  if (!rawIp) return '';
  let ip = rawIp.trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

export function isSyntheticIp(rawIp?: string | null): boolean {
  if (!rawIp) return true;
  const s = rawIp.trim().toLowerCase();
  return (
    s === '' ||
    s === 'client' ||
    s === 'phone gps pin' ||
    s === 'saved gps pin' ||
    s === 'unknown' ||
    s.includes('gps pin')
  );
}

export function normalizeDeviceId(rawDevId?: string | null): string {
  if (!rawDevId) return '';
  const d = rawDevId.trim().toLowerCase();
  if (d === 'dev_client_default') return '';
  return d;
}

export function isLoraineUser(user?: string | null): boolean {
  if (!user) return false;
  return user.toLowerCase().includes('loraine');
}

/**
 * Deduplicates location records so that the SAME device AND IP address strictly have 1 pin on the map.
 * Merges by:
 * - Device ID
 * - IP address (public IP, normalized IPv4/IPv6, or localhost)
 * - User name (Loraine phone is always unified into 1 pin)
 * - Transitive connections (e.g. Device A on IP X merges with other logs on IP X).
 *
 * For each cluster, exactly 1 winning pin is chosen (precise GPS fix beats approximate, newest timestamp wins).
 */
export function collapseLocationsPerDevice<T extends DeduplicatableLocation>(locations: T[]): T[] {
  if (locations.length <= 1) return locations;

  const n = locations.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);

  function find(i: number): number {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i: number, j: number): void {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      if (rank[rootI] < rank[rootJ]) {
        parent[rootI] = rootJ;
      } else if (rank[rootI] > rank[rootJ]) {
        parent[rootJ] = rootI;
      } else {
        parent[rootJ] = rootI;
        rank[rootI]++;
      }
    }
  }

  const deviceToIdx = new Map<string, number>();
  const ipToIdx = new Map<string, number>();
  let loraineRoot: number | null = null;
  const fallbackGroupToIdx = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const loc = locations[i];
    const devId = normalizeDeviceId(loc.deviceId || parseDeviceId(loc.log.details));
    const ip = normalizeIp(loc.log.ip);
    const userIsLoraine = isLoraineUser(loc.log.user);
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(loc.log.userAgent || '');

    // 1. Loraine user is always the same person/phone
    if (userIsLoraine) {
      if (loraineRoot === null) {
        loraineRoot = i;
      } else {
        union(i, loraineRoot);
      }
    }

    // 2. Same device ID -> same cluster
    if (devId) {
      const existing = deviceToIdx.get(devId);
      if (existing !== undefined) {
        union(i, existing);
      } else {
        deviceToIdx.set(devId, i);
      }
    }

    // 3. Same IP address (valid public IP or localhost) -> same cluster
    if (ip && !isSyntheticIp(ip)) {
      const existing = ipToIdx.get(ip);
      if (existing !== undefined) {
        union(i, existing);
      } else {
        ipToIdx.set(ip, i);
      }
    }

    // 4. Fallback for synthetic IPs without deviceId
    if (!devId && (!ip || isSyntheticIp(ip)) && !userIsLoraine) {
      const fallbackKey = `${(loc.log.user || 'visitor').trim().toLowerCase()}:${isMobile ? 'mobile' : 'desktop'}`;
      const existing = fallbackGroupToIdx.get(fallbackKey);
      if (existing !== undefined) {
        union(i, existing);
      } else {
        fallbackGroupToIdx.set(fallbackKey, i);
      }
    }
  }

  // Group by cluster root
  const clusters = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(locations[i]);
  }

  // For each cluster, pick the single newest & most precise location
  const result: T[] = [];
  for (const cluster of clusters.values()) {
    let best = cluster[0];
    for (let j = 1; j < cluster.length; j++) {
      const candidate = cluster[j];
      if (candidate.precise && !best.precise) {
        best = candidate;
      } else if (candidate.precise === best.precise) {
        if (candidate.updatedAtMs > best.updatedAtMs) {
          best = candidate;
        } else if (candidate.updatedAtMs === best.updatedAtMs) {
          const candAcc = candidate.accuracyMeters ?? Infinity;
          const bestAcc = best.accuracyMeters ?? Infinity;
          if (candAcc < bestAcc) {
            best = candidate;
          }
        }
      }
    }
    result.push(best);
  }

  return result.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}


