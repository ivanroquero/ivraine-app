import type {
  ApiRequest,
  ApiResponse,
  AppSection,
  TrackRequestBody,
  TrackResponse,
  TrackSuccessResponse,
  TrackErrorResponse,
  TrackLogEntry
} from './types';

export type {
  TrackRequestBody,
  TrackResponse,
  TrackSuccessResponse,
  TrackErrorResponse,
  TrackLogEntry
};

export default async function handler(
  req: ApiRequest<TrackRequestBody>,
  res: ApiResponse<TrackResponse>
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const forwarded = req.headers['x-forwarded-for'];
  let ip = '127.0.0.1';
  if (typeof forwarded === 'string' && forwarded.trim()) {
    ip = forwarded.split(',')[0].trim();
  } else if (req.headers['x-real-ip']) {
    ip = String(req.headers['x-real-ip']).trim();
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {}
  }

  const section = (['Scrapbook', 'Private Space', 'Admin'].includes(body.section as string) ? body.section : 'Scrapbook') as AppSection;
  const action = body.action || 'Visit';
  const details = body.details || '';
  const userName = body.user || body.userName || 'Visitor';
  const userAgent = (req.headers['user-agent'] as string) || '';
  const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim().slice(0, 100) : '';
  const dodgeCount = Number(body.dodgeCount) || 0;
  let latitude = typeof body.latitude === 'number' && !isNaN(body.latitude) ? body.latitude : null;
  let longitude = typeof body.longitude === 'number' && !isNaN(body.longitude) ? body.longitude : null;
  let fullAddress = typeof body.fullAddress === 'string' ? body.fullAddress : (typeof body.full_address === 'string' ? body.full_address : '');
  let city = typeof body.city === 'string' ? body.city : '';
  let country = typeof body.country === 'string' ? body.country : '';

  // If GPS coordinates were not provided, fallback to Vercel edge IP geolocation
  if ((!latitude || !longitude) && req.headers['x-vercel-ip-latitude']) {
    const edgeLat = parseFloat(String(req.headers['x-vercel-ip-latitude']));
    const edgeLng = parseFloat(String(req.headers['x-vercel-ip-longitude']));
    if (!isNaN(edgeLat) && !isNaN(edgeLng)) {
      latitude = edgeLat;
      longitude = edgeLng;
      city = city || decodeURIComponent(String(req.headers['x-vercel-ip-city'] || ''));
      country = country || String(req.headers['x-vercel-ip-country'] || '');
      fullAddress = fullAddress || (city ? `${city}${country ? ', ' + country : ''}` : '');
    }
  }

  const detailsWithDevice = deviceId && !details.includes('[Device:')
    ? `${details}${details ? ' ' : ''}[Device: ${deviceId}]`
    : details;

  const logEntry: TrackLogEntry = {
    id: 'track_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    ip,
    section,
    action,
    details: detailsWithDevice,
    user_name: userName,
    user: userName,
    user_agent: userAgent,
    userAgent,
    deviceId,
    dodge_count: dodgeCount,
    dodgeCount,
    latitude,
    longitude,
    full_address: fullAddress,
    fullAddress,
    city,
    country,
    created_at: new Date().toISOString(),
    timestamp: new Date().toISOString()
  };

  // Shared in-memory cache for Vercel functions:
  // 30-day retention policy: keep all logs, auto-remove only logs older than 30 days
  const thirtyDaysCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let memoryLogs: TrackLogEntry[] = Array.isArray((globalThis as any).__ivraine_logs) ? (globalThis as any).__ivraine_logs : [];
  memoryLogs = memoryLogs.filter((l) => {
    const ts = new Date(l.created_at || l.timestamp).getTime();
    return Number.isFinite(ts) ? ts >= thirtyDaysCutoff : true;
  });

  memoryLogs.unshift(logEntry);
  if (memoryLogs.length > 50000) memoryLogs.length = 50000;
  (globalThis as any).__ivraine_logs = memoryLogs;

  // If Supabase environment variables exist in Vercel, record to database
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (sbUrl && sbKey) {
    try {
      // 30-day auto retention policy: clean up rows older than 30 days
      const thirtyDaysAgoIso = new Date(thirtyDaysCutoff).toISOString();
      void fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?created_at=lt.${encodeURIComponent(thirtyDaysAgoIso)}`, {
        method: 'DELETE',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`
        }
      }).catch(() => {});

      await fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs`, {

        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          ip,
          section,
          action,
          details: detailsWithDevice,
          user_name: userName,
          user_agent: userAgent,
          dodge_count: dodgeCount,
          latitude,
          longitude,
          full_address: fullAddress,
          city,
          country
        })
      });
    } catch {}
  }

  return res.status(200).json({
    status: 'ok',
    recorded: true,
    ip,
    section,
    action,
    latitude,
    longitude,
    fullAddress,
    log: logEntry
  });
}
