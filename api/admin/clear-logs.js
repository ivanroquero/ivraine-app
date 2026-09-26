export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  globalThis.__ivraine_logs = [];

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (sbUrl && sbKey) {
    try {
      await fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs`, {
        method: 'DELETE',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`
        }
      });
    } catch {}
  }

  return res.status(200).json({ status: 'ok', success: true });
}
