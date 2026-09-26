import type {
  ApiRequest,
  ApiResponse,
  IpResponse
} from './types';

export type { IpResponse };

export default async function handler(
  req: ApiRequest<undefined>,
  res: ApiResponse<IpResponse>
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

  // Extract Vercel Edge geolocation headers if available
  let latitude = req.headers['x-vercel-ip-latitude']
    ? parseFloat(String(req.headers['x-vercel-ip-latitude']))
    : null;
  let longitude = req.headers['x-vercel-ip-longitude']
    ? parseFloat(String(req.headers['x-vercel-ip-longitude']))
    : null;
  let city = req.headers['x-vercel-ip-city']
    ? decodeURIComponent(String(req.headers['x-vercel-ip-city']))
    : '';
  let country = req.headers['x-vercel-ip-country']
    ? String(req.headers['x-vercel-ip-country'])
    : '';

  // If Vercel headers not present and IP is not local, try public geolocation fallback
  if ((!latitude || !longitude) && ip !== '127.0.0.1') {
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: AbortSignal.timeout(3000)
      });
      if (geoRes.ok) {
        const data = await geoRes.json() as { latitude?: number; longitude?: number; city?: string; country_name?: string };
        if (data.latitude && data.longitude) {
          latitude = data.latitude;
          longitude = data.longitude;
          city = city || data.city || '';
          country = country || data.country_name || '';
        }
      }
    } catch {}
  }

  // Default coordinates to Tagbilaran City, Bohol if completely unknown
  const fullAddress = city
    ? `${city}${country ? ', ' + country : ''}`
    : 'Tagbilaran City, Bohol';

  return res.status(200).json({
    status: 'ok',
    ip,
    latitude: latitude || 9.6496,
    longitude: longitude || 123.8647,
    city: city || 'Tagbilaran City',
    country: country || 'Philippines',
    fullAddress
  });
}
