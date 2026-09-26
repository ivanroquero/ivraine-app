import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pushRouter, type PushServices } from './push/routes.js';
import { PushError } from './push/store.js';
import { entrySchema, patchSchema, idSchema, imageExtension } from './validation.js';
import { adminStore, extractClientIp } from './adminStore.js';
export interface Config { supabaseUrl:string; supabaseKey:string; origins:string[]; trustProxy:number; push?:PushServices; }
export class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
const bucket = 'ivraine-photos';
const voiceBucket = 'ivraine-voice';
function result<T>(r:{data:T;error:unknown}):T { if(r.error) throw new HttpError(502,'Our space service could not complete this request. Please retry.'); return r.data; }
function missingColumn(error:unknown){return !!(error && typeof error==='object' && 'code' in error && (error as {code?:string}).code==='42703');}
export function createApp(config:Config, clientFactory?:(token:string)=>SupabaseClient) {
  function buildDevicePurgeFilter(deviceId: string, ip: string): string {
  return deviceId
    ? `device_id=eq.${encodeURIComponent(deviceId)}`
    : `and=(device_id.eq.,ip.eq.${encodeURIComponent(ip)})`;
  }
  const app=express();
  app.disable('x-powered-by'); app.set('trust proxy',config.trustProxy);
  app.use(helmet({
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'https://*.supabase.co', 'https://*.supabase.com'],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: true,
    referrerPolicy: { policy: 'no-referrer' },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    xssFilter: false,
    ieNoOpen: true,
  }));
  const allowedOrigins=new Set(config.origins.map(origin=>new URL(origin.trim()).origin));
  app.use(cors({origin(origin,cb){ cb(origin && !allowedOrigins.has(origin) ? new HttpError(403,'Origin not allowed') : null, true); },methods:['GET','POST','PATCH','DELETE'],allowedHeaders:['Authorization','Content-Type'],exposedHeaders:['Retry-After'],maxAge:600}));
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Permissions-Policy','geolocation=(self), microphone=(), camera=(), payment=(), sync-xhr=()');next();});
  // Parse JSON before any auth/router middleware so POST bodies are never undefined.
  app.use(express.json({limit:'64kb'}));
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'ivraine-api'}));
  app.get('/health/push',(_req,res)=>{
    const push=config.push;
    if(!push?.store){res.status(200).json({status:'disabled',service:'ivraine-push',reason:'Push notifications not configured',checks:{database:false,vapid:false,worker:false}});return;}
    const databaseReady=push.storageReady??true;
    res.json({status:databaseReady&&push.publicKey?'ok':'degraded',service:'ivraine-push',configured:!!push.publicKey,checks:{database:databaseReady,vapid:!!push.publicKey,worker:!!push.workerRunning}});
  });

  // Digital Asset Links for Android TWA (PWABuilder / Bubblewrap) verification
  let customAssetLinks: any = null;

  app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    if (customAssetLinks) {
      return res.json(customAssetLinks);
    }
    
    const envPackage = process.env.TWA_PACKAGE_NAME;
    const envFingerprint = process.env.TWA_SHA256_FINGERPRINTS;
    
    const defaultStatements = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: envPackage || 'app.vercel.ivraine.twa',
          sha256_cert_fingerprints: envFingerprint
            ? envFingerprint.split(',').map(s => s.trim())
            : [
                '14:6D:E9:DE:8F:52:E2:E7:59:77:EC:8B:2A:B7:C5:16:8C:F5:2A:77:4B:97:DF:7B:6A:3E:92:07:95:67:BE:53:C9:8F',
                'A1:B2:C3:D4:E5:F6:A7:B8:C9:D0:E1:F2:A3:B4:C5:D6:E7:F8:A9:B0:C1:D2:E3:F4:A5:B6:C7:D8:E9:F0:A1:B2'
              ]
        }
      },
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.ivraine.twa',
          sha256_cert_fingerprints: [
            '14:6D:E9:DE:8F:52:E2:E7:59:77:EC:8B:2A:B7:C5:16:8C:F5:2A:77:4B:97:DF:7B:6A:3E:92:07:95:67:BE:53:C9:8F',
            'A1:B2:C3:D4:E5:F6:A7:B8:C9:D0:E1:F2:A3:B4:C5:D6:E7:F8:A9:B0:C1:D2:E3:F4:A5:B6:C7:D8:E9:F0:A1:B2'
          ]
        }
      },
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.ivanroquero.ivraine',
          sha256_cert_fingerprints: [
            '14:6D:E9:DE:8F:52:E2:E7:59:77:EC:8B:2A:B7:C5:16:8C:F5:2A:77:4B:97:DF:7B:6A:3E:92:07:95:67:BE:53:C9:8F',
            'A1:B2:C3:D4:E5:F6:A7:B8:C9:D0:E1:F2:A3:B4:C5:D6:E7:F8:A9:B0:C1:D2:E3:F4:A5:B6:C7:D8:E9:F0:A1:B2'
          ]
        }
      }
    ];

    res.json(defaultStatements);
  });

  app.get('/api/admin/assetlinks', (_req, res) => {
    res.json({
      status: 'ok',
      configured: !!customAssetLinks || !!process.env.TWA_PACKAGE_NAME,
      assetlinks: customAssetLinks || [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: process.env.TWA_PACKAGE_NAME || 'app.vercel.ivraine.twa',
            sha256_cert_fingerprints: process.env.TWA_SHA256_FINGERPRINTS ? process.env.TWA_SHA256_FINGERPRINTS.split(',').map(s => s.trim()) : []
          }
        }
      ]
    });
  });

  app.post('/api/admin/assetlinks', (req, res) => {
    const { packageName, sha256Fingerprint, statements } = req.body || {};
    if (Array.isArray(statements)) {
      customAssetLinks = statements;
      return res.json({ success: true, assetlinks: customAssetLinks });
    }
    if (typeof packageName === 'string' && packageName.trim() && typeof sha256Fingerprint === 'string' && sha256Fingerprint.trim()) {
      const cleanPkg = packageName.trim();
      const fingerprints = sha256Fingerprint
        .split('\n')
        .flatMap((line: string) => line.split(','))
        .map((f: string) => f.trim().toUpperCase())
        .filter(Boolean);

      customAssetLinks = [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: cleanPkg,
            sha256_cert_fingerprints: fingerprints
          }
        }
      ];
      return res.json({ success: true, assetlinks: customAssetLinks });
    }
    res.status(400).json({ error: 'Please provide packageName and sha256Fingerprint' });
  });
  app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many requests. Try again in a minute.'}}));
  app.post('/api/track', (req, res) => {
    const ip = extractClientIp(req);
    const body = req.body || {};
    const section = (['Scrapbook', 'Private Space', 'Admin'].includes(body.section) ? body.section : 'Scrapbook') as 'Scrapbook' | 'Private Space' | 'Admin';
    const action = typeof body.action === 'string' && body.action.trim() ? body.action.trim().slice(0, 200) : 'Visit';
    const details = typeof body.details === 'string' ? body.details.slice(0, 500) : '';
    const user = typeof body.user === 'string' && body.user.trim() ? body.user.trim().slice(0, 80) : 'Visitor';
    const dodgeCount = typeof body.dodgeCount === 'number' ? Math.max(0, Math.min(1000, body.dodgeCount)) : 0;
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : '';
    const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim().slice(0, 100) : '';

    const latitude = typeof body.latitude === 'number' && !isNaN(body.latitude) ? body.latitude : null;
    const longitude = typeof body.longitude === 'number' && !isNaN(body.longitude) ? body.longitude : null;
    const fullAddress = typeof body.fullAddress === 'string' ? body.fullAddress.slice(0, 500) : (typeof body.full_address === 'string' ? body.full_address.slice(0, 500) : '');
    const city = typeof body.city === 'string' ? body.city.slice(0, 100) : '';
    const country = typeof body.country === 'string' ? body.country.slice(0, 100) : '';

    const entry = adminStore.record({
      ip,
      section,
      action,
      details,
      user,
      userAgent,
      deviceId,
      dodgeCount,
      latitude,
      longitude,
      fullAddress,
      city,
      country
    });

    if (config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('example.supabase.co')) {
      try {
        // If this track log contains GPS coordinates, remove older location logs for this user/ip so only 1 pin exists
        if (latitude != null && longitude != null) {           const filterCol = buildDevicePurgeFilter(deviceId, ip);
          const filterCol = user && user !== 'Visitor' ? `user_name=eq.${encodeURIComponent(user)}` : `ip=eq.${encodeURIComponent(ip)}`;
          void fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?${filterCol}&latitude=not.is.null`, {
            method: 'DELETE',
            headers: {
              'apikey': config.supabaseKey,
              'Authorization': `Bearer ${config.supabaseKey}`
            }
          }).catch(() => {});
        }

        const detailsWithDevice = deviceId ? `${details}${details ? ' ' : ''}[Device: ${deviceId}]` : details;
        void fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            ip,
            section,
            action,
            details: detailsWithDevice,
            user_name: user,
            user_agent: userAgent,
            device_id: deviceId,
            dodge_count: dodgeCount,
            latitude,
            longitude,
            full_address: fullAddress,
            city,
            country
          })
        }).catch(() => {});
      } catch {}
    }

    res.status(201).json({ success: true, ip, log: entry });
  });

  // Mystery Date Generator — Location capture endpoint
  // Accepts GPS coordinates, reverse-geocodes via Mapbox (falls back to Nominatim),
  // and saves the exact address to the admin activity log. Automatically removes prior device pins.
  app.post('/api/date-location', async (req, res) => {
    const ip = extractClientIp(req);
    const body = req.body || {};
    const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim().slice(0, 100) : '';
    const user = typeof body.user === 'string' && body.user.trim() ? body.user.trim().slice(0, 80) : 'Visitor';
    const source = (['Scrapbook', 'Private Space', 'Admin'].includes(body.source) ? body.source : 'Private Space') as 'Scrapbook' | 'Private Space' | 'Admin';

    // Check if device turned off location or requested pin removal
    const isRemove = body.removePin === true || body.action === 'turn_off' || (typeof body.action === 'string' && body.action.toLowerCase().includes('turned off'));
    if (isRemove) {
      adminStore.removeDeviceLocation({ deviceId, ip, user });
      if (config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('example.supabase.co')) {
        try {
          const filterCol = buildDevicePurgeFilter(deviceId, ip);
          void fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?${filterCol}&latitude=not.is.null`, {
            method: 'DELETE',
            headers: {
              'apikey': config.supabaseKey,
              'Authorization': `Bearer ${config.supabaseKey}`
            }
          }).catch(() => {});
        } catch {}
      }
      return res.status(200).json({ success: true, removed: true, deviceId });
    }

    const latitude = typeof body.latitude === 'number' && !isNaN(body.latitude) && Math.abs(body.latitude) <= 90 ? body.latitude : null;
    const longitude = typeof body.longitude === 'number' && !isNaN(body.longitude) && Math.abs(body.longitude) <= 180 ? body.longitude : null;

    if (!latitude || !longitude) {
      res.status(400).json({ error: 'Valid latitude and longitude are required.' });
      return;
    }

    let fullAddress = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    let city = '';
    let country = '';
    let mapboxPlace = '';

    // Try Mapbox Geocoding API first (requires MAPBOX_SECRET_TOKEN env var)
    const mapboxToken = process.env.MAPBOX_SECRET_TOKEN || process.env.MAPBOX_TOKEN || '';
    if (mapboxToken) {
      try {
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxToken}&types=address,place,locality&language=en&limit=1`;
        const mapboxRes = await fetch(mapboxUrl, { signal: AbortSignal.timeout(5000) });
        if (mapboxRes.ok) {
          const mapboxData = await mapboxRes.json() as { features?: Array<{ place_name?: string; context?: Array<{ id?: string; text?: string }> }> };
          const feature = mapboxData.features?.[0];
          if (feature) {
            fullAddress = feature.place_name || fullAddress;
            const ctx = feature.context || [];
            city = ctx.find(c => c.id?.startsWith('place.') || c.id?.startsWith('locality.'))?.text || '';
            country = ctx.find(c => c.id?.startsWith('country.'))?.text || '';
            mapboxPlace = fullAddress;
          }
        }
      } catch { /* fall through to Nominatim */ }
    }

    // Fallback: Nominatim (OpenStreetMap) reverse geocoding
    if (!mapboxPlace) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
        const nomRes = await fetch(nomUrl, {
          headers: { 'Accept-Language': 'en', 'User-Agent': 'ivraine-app/1.0' },
          signal: AbortSignal.timeout(4000)
        });
        if (nomRes.ok) {
          const nomData = await nomRes.json() as { display_name?: string; address?: Record<string, string> };
          const addr = nomData.address || {};
          city = addr['city'] || addr['town'] || addr['municipality'] || addr['village'] || addr['suburb'] || addr['state'] || '';
          country = addr['country'] || '';
          fullAddress = nomData.display_name || `${city}, ${country}` || fullAddress;
        }
      } catch { /* use raw coords */ }
    }

    const detailsStr = `Exact Address: ${fullAddress} | Coords: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}${deviceId ? ' [Device: ' + deviceId + ']' : ''}`;

    const entry = adminStore.record({
      ip,
      section: source,
      action: 'Date Location Captured 📍',
      details: detailsStr,
      user,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : '',
      deviceId,
      dodgeCount: 0,
      latitude,
      longitude,
      fullAddress,
      city,
      country
    });

    if (config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('example.supabase.co')) {
      try {
        // Delete older location rows so Supabase retains only 1 active pin for this user
        const filterCol = buildDevicePurgeFilter(deviceId, ip);
        void fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?${filterCol}&latitude=not.is.null`, {
          method: 'DELETE',
          headers: {
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`
          }
        }).catch(() => {});

        void fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            ip,
            section: source,
            action: 'Date Location Captured 📍',
            details: entry.details,
            user_name: user,
            user_agent: entry.userAgent,
            device_id: deviceId,
            dodge_count: 0,
            latitude,
            longitude,
            full_address: fullAddress,
            city,
            country
          })
        }).catch(() => {});
      } catch {}
    }

    console.log(`[date-location] ${user} (${deviceId || 'no-id'}) @ ${fullAddress} (${latitude}, ${longitude})`);

    res.status(201).json({ success: true, fullAddress, city, country, latitude, longitude, deviceId, log: entry });
  });

  app.get('/api/ip', (req, res) => {
    const ip = extractClientIp(req);
    res.json({ ip });
  });
  app.get('/api/admin/logs', async (req, res) => {
    let logs = adminStore.getLogs();

    if (config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('example.supabase.co')) {
      try {
        const sbRes = await fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?select=*&order=created_at.desc&limit=1000`, {
          headers: {
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`
          },
          signal: AbortSignal.timeout(3000)
        });
        if (sbRes.ok) {
          const data = await sbRes.json();
          if (Array.isArray(data)) {
            const sbLogs = data.map((row: any) => ({
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
            const existingKeys = new Set(logs.map(l => l.id || `${l.ip}_${l.action}_${l.timestamp}`));
            for (const sb of sbLogs) {
              const k = sb.id || `${sb.ip}_${sb.action}_${sb.timestamp}`;
              if (!existingKeys.has(k)) {
                logs.push(sb);
                existingKeys.add(k);
              }
            }
            logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          }
        }
      } catch {}
    }

    const stats = adminStore.getStats();
    const currentIp = extractClientIp(req);
    res.json({ logs, stats, currentIp });
  });
  app.post('/api/admin/clear-logs', (_req, res) => {
    adminStore.clear();
    if (config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('example.supabase.co')) {
      try {
        void fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs`, {
          method: 'DELETE',
          headers: {
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`
          }
        }).catch(() => {});
      } catch {}
    }
    res.json({ success: true });
  });
  app.use('/api', async(req,res,next)=>{
    const token=req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
    if(!token) throw new HttpError(401,'Please sign in.');
    const db=clientFactory?.(token) ?? createClient(config.supabaseUrl,config.supabaseKey,{global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await db.auth.getUser(token);
    if(error || !data.user) throw new HttpError(401,'Your session expired. Please sign in again.');
    let membership;
    try{membership=result(await db.from('ivraine_members').select('user_id,book_id,display_name,last_active_at').eq('user_id',data.user.id).maybeSingle());}
    catch(err){
      if(!missingColumn(err)) throw err;
      membership=result(await db.from('ivraine_members').select('user_id,book_id,display_name').eq('user_id',data.user.id).maybeSingle());
      membership={...membership,last_active_at:new Date().toISOString()};
    }
    if(!membership) throw new HttpError(403,'This account has not been added to our space.');
    res.locals.db=db;res.locals.userId=data.user.id;res.locals.member=membership;next();
  });
  app.use('/api/notifications',pushRouter(config.push??{store:null,publicKey:null,keyId:null}));
  app.get('/api/book',async(_req,res)=>{
    const db=res.locals.db as SupabaseClient;
    const book=result(await db.from('ivraine_books').select('*').eq('id',res.locals.member.book_id).single());
    let members: Array<{user_id:string;book_id:string;display_name:string;last_active_at?:string|null}> = [];
    try{members=result(await db.from('ivraine_members').select('user_id,book_id,display_name,last_active_at').eq('book_id',res.locals.member.book_id)) ?? [];}catch(err){if(!missingColumn(err)) throw err; members=result(await db.from('ivraine_members').select('user_id,book_id,display_name').eq('book_id',res.locals.member.book_id)) ?? [];}
    const current=members.find((member)=>member.user_id===res.locals.userId) ?? res.locals.member;
    let partner=members.find((member)=>member.user_id!==res.locals.userId) ?? null;
    if(!partner && book){
      const currentName=(current.display_name||'').trim().toLowerCase();
      const p1=(book.partner_one||'').trim();
      const p2=(book.partner_two||'').trim();
      let fallbackName='';
      if(p1 && currentName && (p1.toLowerCase().includes(currentName) || currentName.includes(p1.toLowerCase()))){
        fallbackName=p2.split(' ')[0]||p2;
      }else if(p2 && currentName && (p2.toLowerCase().includes(currentName) || currentName.includes(p2.toLowerCase()))){
        fallbackName=p1.split(' ')[0]||p1;
      }else if(p2){
        fallbackName=p2.split(' ')[0]||p2;
      }else if(p1){
        fallbackName=p1.split(' ')[0]||p1;
      }
      if(fallbackName){
        partner={user_id:'',book_id:book.id,display_name:fallbackName,last_active_at:null};
      }
    }
    res.json({book,member:current,partner,userId:res.locals.userId});
  });
  app.post('/api/active',async(_req,res)=>{
    const db=res.locals.db as SupabaseClient;
    const now=new Date().toISOString();
    try{
      const row=result(await db.from('ivraine_members').update({last_active_at:now}).eq('user_id',res.locals.userId).eq('book_id',res.locals.member.book_id).select('last_active_at').maybeSingle());
      res.json({last_active_at: row?.last_active_at ?? now});
    }catch(err){
      if(!missingColumn(err)) throw err;
      res.json({last_active_at: now});
    }
  });
  app.get('/api/entries',async(req,res)=>{
    const offset=z.coerce.number().int().min(0).max(1000000).parse(req.query.offset??0);
    const db=res.locals.db as SupabaseClient;
    const entries=result(await db.from('ivraine_entries').select('*').eq('book_id',res.locals.member.book_id).order('event_date',{ascending:false}).order('id').range(offset,offset+29)) ?? [];
    const paths=[...new Set(entries.flatMap(e=>e.photo_paths))] as string[];
    const urls=new Map<string,string>();
    if(paths.length){const signed=result(await db.storage.from(bucket).createSignedUrls(paths,3600)) ?? []; for(const s of signed) if(s.path && s.signedUrl) urls.set(s.path,s.signedUrl);}
    res.json({entries:entries.map(e=>({...e,photo_urls:e.photo_paths.map((p:string)=>urls.get(p)??null)})),nextOffset:entries.length===30?offset+30:null});
  });
  app.post('/api/entries',async(req,res)=>{
    const body=entrySchema.parse(req.body);const db=res.locals.db as SupabaseClient;
    const prefix=`${res.locals.member.book_id}/${res.locals.userId}/`;
    if(body.photo_paths.some(path=>!path.startsWith(prefix)|| !/^[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path))) throw new HttpError(400,'Invalid photo path.');
    const row=result(await db.from('ivraine_entries').insert({...body,book_id:res.locals.member.book_id,author_id:res.locals.userId}).select().single());
    res.status(201).json(row);
  });
  app.patch('/api/entries/:id',async(req,res)=>{
    const id=idSchema.parse(req.params.id);const {updated_at,...body}=patchSchema.parse(req.body);const db=res.locals.db as SupabaseClient;
    const bookPrefix=`${res.locals.member.book_id}/`;
    if(body.photo_paths&&body.photo_paths.some(path=>!path.startsWith(bookPrefix)||!/^[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path))) throw new HttpError(400,'Invalid photo path.');
    const row=result(await db.from('ivraine_entries').update(body).eq('id',id).eq('book_id',res.locals.member.book_id).eq('updated_at',updated_at).select().maybeSingle());
    if(!row) throw new HttpError(409,'This entry changed or was deleted. Refresh before editing again.');
    res.json(row);
  });
  app.delete('/api/entries/:id',async(req,res)=>{
    const id=idSchema.parse(req.params.id);const db=res.locals.db as SupabaseClient;
    const row=result(await db.from('ivraine_entries').delete().eq('id',id).eq('book_id',res.locals.member.book_id).select('photo_paths').maybeSingle());
    if(!row) throw new HttpError(404,'Entry no longer exists.');
    let warning:string|undefined;
    if(row.photo_paths.length){const {error}=await db.storage.from(bucket).remove(row.photo_paths); if(error) warning='Entry deleted. Its photo could not be removed from storage; retry cleanup from the Supabase dashboard.';}
    res.json({deleted:true,warning});
  });
  app.post('/api/photos',express.raw({type:['image/jpeg','image/png','image/webp'],limit:'8mb'}),async(req,res)=>{
    if(!Buffer.isBuffer(req.body)) throw new HttpError(415,'Choose a JPEG, PNG, or WebP photo.');
    const ext=imageExtension(req.body);if(!ext) throw new HttpError(415,'The file is not a supported photo.');
    const path=`${res.locals.member.book_id}/${res.locals.userId}/${randomUUID()}.${ext}`;
    const db=res.locals.db as SupabaseClient;
    result(await db.storage.from(bucket).upload(path,req.body,{contentType:ext==='jpg'?'image/jpeg':`image/${ext}`,upsert:false,cacheControl:'0'}));
    res.status(201).json({path});
  });
  app.delete('/api/photos',async(req,res)=>{
    const {path}=z.object({path:z.string().max(220)}).strict().parse(req.body);
    if(!path.startsWith(`${res.locals.member.book_id}/${res.locals.userId}/`)) throw new HttpError(403,'Photo access denied.');
    const db=res.locals.db as SupabaseClient;
    const used=result(await db.from('ivraine_entries').select('id').contains('photo_paths',[path]).limit(1)) ?? [];
    if(used.length) throw new HttpError(409,'This photo belongs to an entry.');
    result(await db.storage.from(bucket).remove([path]));res.json({deleted:true});
  });
  app.post('/api/voice',express.raw({type:['audio/webm','audio/mp4','audio/x-m4a','audio/m4a','audio/mpeg','audio/wav','audio/ogg','audio/aac','application/octet-stream'],limit:'16mb'}),async(req,res)=>{
    if(!Buffer.isBuffer(req.body)) throw new HttpError(415,'Choose a supported audio recording (WebM, M4A, MP3, WAV).');
    const contentType=req.headers['content-type']||'audio/webm';
    const ext=contentType.includes('mp4')||contentType.includes('m4a')?'m4a':contentType.includes('mp3')||contentType.includes('mpeg')?'mp3':contentType.includes('wav')?'wav':contentType.includes('ogg')?'ogg':contentType.includes('aac')?'aac':'webm';
    const path=`${res.locals.member.book_id}/${res.locals.userId}/${randomUUID()}.${ext}`;
    const db=res.locals.db as SupabaseClient;
    const upRes=await db.storage.from(voiceBucket).upload(path,req.body,{contentType,upsert:false,cacheControl:'31536000'});
    if(upRes.error){
      const fb=await db.storage.from(bucket).upload(path,req.body,{contentType,upsert:false,cacheControl:'31536000'});
      if(fb.error) throw new HttpError(502,'Could not upload audio to storage.');
    }
    const signed=await db.storage.from(upRes.error?bucket:voiceBucket).createSignedUrl(path,315360000).catch(()=>null);
    const pub=db.storage.from(upRes.error?bucket:voiceBucket).getPublicUrl(path);
    const url=signed?.data?.signedUrl||pub?.data?.publicUrl||'';
    res.status(201).json({path,url});
  });
  app.use((_req,_res,next)=>next(new HttpError(404,'Endpoint not found.')));
  const handler:ErrorRequestHandler=(err,_req,res,_next)=>{
    if(err instanceof PushError){if(err.retryAfter)res.set('Retry-After',String(err.retryAfter));res.status(err.status).json({error:err.message});return;}
    if(err instanceof z.ZodError){res.status(400).json({error:'Check your input.',details:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`)});return;}
    const status=err instanceof HttpError?err.status:err.type==='entity.too.large'?413:err.type==='entity.parse.failed'?400:500;
    if(status===500) console.error('request_failed',err instanceof Error?err.name:'Unknown');
    res.status(status).json({error:status===413?'Photo too large. Maximum size is 8 MB.':status===400?'Invalid JSON request.':err instanceof HttpError?err.message:'Something went wrong. Please try again.'});
  }; app.use(handler);return app;
}
