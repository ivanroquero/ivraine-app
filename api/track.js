export default async function handler(req, res) {
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
    try { body = JSON.parse(body); } catch {}
  }

  const section = body.section || 'Scrapbook';
  const action = body.action || 'Visit';
  const details = body.details || '';
  const userName = body.user || 'Visitor';
  const userAgent = req.headers['user-agent'] || '';
  const dodgeCount = Number(body.dodgeCount) || 0;
  const latitude = typeof body.latitude === 'number' && !isNaN(body.latitude) ? body.latitude : null;
  const longitude = typeof body.longitude === 'number' && !isNaN(body.longitude) ? body.longitude : null;
  const fullAddress = typeof body.fullAddress === 'string' ? body.fullAddress : (typeof body.full_address === 'string' ? body.full_address : '');
  const city = typeof body.city === 'string' ? body.city : '';
  const country = typeof body.country === 'string' ? body.country : '';

  // If Supabase environment variables exist in Vercel, record to database
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
          section,
          action,
          details,
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
    fullAddress
  });
}
