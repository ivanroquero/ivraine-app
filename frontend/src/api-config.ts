export function normalizeApiUrl(raw: string, pageOrigin: string): string {
  const value = raw.trim();
  if (!value) throw new Error('Set VITE_API_URL to your Railway HTTPS public URL, then redeploy Vercel.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('VITE_API_URL must be a complete URL, such as https://your-service.up.railway.app.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an HTTP(S) URL without credentials, query parameters, or fragments.');
  }
  const page = new URL(pageOrigin);
  const local = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!local(page.hostname) && local(url.hostname)) throw new Error('The published app is pointing to localhost. Set VITE_API_URL to Railway’s public URL and rebuild Vercel.');
  if (page.protocol === 'https:' && url.protocol !== 'https:') throw new Error('The published app requires an HTTPS API URL. Enable Railway’s public HTTPS domain and rebuild Vercel.');
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
  return url.toString().replace(/\/$/, '');
}
