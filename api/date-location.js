export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    try { body = JSON.parse(body); } catch {}
  }

  let latitude = typeof body.latitude === 'number' && !isNaN(body.latitude) ? body.latitude : null;
  let longitude = typeof body.longitude === 'number' && !isNaN(body.longitude) ? body.longitude : null;
  const user = typeof body.user === 'string' && body.user.trim() ? body.user.trim().slice(0, 80) : 'Loraine';
  const source = body.source || 'Scrapbook';

  // Fallback to Vercel edge IP geolocation if coordinates not provided
  if ((!latitude || !longitude) && req.headers['x-vercel-ip-latitude']) {
    latitude = parseFloat(String(req.headers['x-vercel-ip-latitude']));
    longitude = parseFloat(String(req.headers['x-vercel-ip-longitude']));
  }
  if (!latitude || !longitude) {
    latitude = 9.6496;
    longitude = 123.8647;
  }

  let fullAddress = typeof body.fullAddress === 'string' ? body.fullAddress : '';
  let city = typeof body.city === 'string' ? body.city : '';
  let country = typeof body.country === 'string' ? body.country : '';

  if (!fullAddress) {
    fullAddress = city ? `${city}, Bohol, Philippines` : 'Tagbilaran City, Bohol, Philippines';
  }

  const logEntry = {
    id: 'loc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    ip,
    section: source,
    action: '📍 Date Location Captured ♡',
    details: `Location: ${fullAddress} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    user_name: user,
    user,
    user_agent: req.headers['user-agent'] || '',
    userAgent: req.headers['user-agent'] || '',
    dodge_count: 0,
    dodgeCount: 0,
    latitude,
    longitude,
    full_address: fullAddress,
    fullAddress,
    city: city || 'Tagbilaran City',
    country: country || 'Philippines',
    created_at: new Date().toISOString(),
    timestamp: new Date().toISOString()
  };

  // Shared in-memory cache for Vercel serverless functions
  globalThis.__ivraine_logs = globalThis.__ivraine_logs || [];
  globalThis.__ivraine_logs.unshift(logEntry);
  if (globalThis.__ivraine_logs.length > 500) globalThis.__ivraine_logs.length = 500;

  // Record to Supabase
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (sbUrl && sbKey) {
    try {
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
          section: source,
          action: '📍 Date Location Captured ♡',
          details: logEntry.details,
          user_name: user,
          user_agent: logEntry.userAgent,
          dodge_count: 0,
          latitude,
          longitude,
          full_address: fullAddress,
          city: logEntry.city,
          country: logEntry.country
        })
      });
    } catch {}
  }

  return res.status(201).json({
    status: 'ok',
    success: true,
    latitude,
    longitude,
    fullAddress,
    city: logEntry.city,
    country: logEntry.country,
    log: logEntry
  });
}
