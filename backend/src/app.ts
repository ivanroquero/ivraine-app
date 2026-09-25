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
export interface Config { supabaseUrl:string; supabaseKey:string; origins:string[]; trustProxy:number; push?:PushServices; }
export class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
const bucket = 'ivraine-photos';
const voiceBucket = 'ivraine-voice';
function result<T>(r:{data:T;error:unknown}):T { if(r.error) throw new HttpError(502,'Our space service could not complete this request. Please retry.'); return r.data; }
function missingColumn(error:unknown){return !!(error && typeof error==='object' && 'code' in error && (error as {code?:string}).code==='42703');}
export function createApp(config:Config, clientFactory?:(token:string)=>SupabaseClient) {
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
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Permissions-Policy','geolocation=(), microphone=(), camera=(), payment=(), sync-xhr=()');next();});
  // Parse JSON before any auth/router middleware so POST bodies are never undefined.
  app.use(express.json({limit:'64kb'}));
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'ivraine-api'}));
  app.get('/health/push',(_req,res)=>{
    const push=config.push;
    if(!push?.store){res.status(200).json({status:'disabled',service:'ivraine-push',reason:'Push notifications not configured',checks:{database:false,vapid:false,worker:false}});return;}
    const databaseReady=push.storageReady??true;
    res.json({status:databaseReady&&push.publicKey?'ok':'degraded',service:'ivraine-push',configured:!!push.publicKey,checks:{database:databaseReady,vapid:!!push.publicKey,worker:!!push.workerRunning}});
  });
  app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many requests. Try again in a minute.'}}));
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
