import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { entrySchema, patchSchema, idSchema, imageExtension } from './validation.js';
export interface Config { supabaseUrl:string; supabaseKey:string; origins:string[]; trustProxy:number; }
export class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
const bucket = 'ivraine-photos';
function result<T>(r:{data:T;error:unknown}):T { if(r.error) throw new HttpError(502,'The scrapbook service could not complete this request. Please retry.'); return r.data; }
export function createApp(config:Config, clientFactory?:(token:string)=>SupabaseClient) {
  const app=express();
  app.disable('x-powered-by'); app.set('trust proxy',config.trustProxy);
  app.use(helmet());
  app.use(cors({origin(origin,cb){ cb(origin && !config.origins.includes(origin) ? new HttpError(403,'Origin not allowed') : null, true); },methods:['GET','POST','PATCH','DELETE'],allowedHeaders:['Authorization','Content-Type']}));
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'ivraine-api'}));
  app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many requests. Try again in a minute.'}}));
  app.use('/api', async(req,res,next)=>{
    const token=req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
    if(!token) throw new HttpError(401,'Please sign in.');
    const db=clientFactory?.(token) ?? createClient(config.supabaseUrl,config.supabaseKey,{global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await db.auth.getUser(token);
    if(error || !data.user) throw new HttpError(401,'Your session expired. Please sign in again.');
    const membership=result(await db.from('ivraine_members').select('book_id,display_name').eq('user_id',data.user.id).maybeSingle());
    if(!membership) throw new HttpError(403,'This account has not been added to the scrapbook.');
    res.locals.db=db;res.locals.userId=data.user.id;res.locals.member=membership;next();
  });
  app.use(express.json({limit:'64kb'}));
  app.get('/api/book',async(_req,res)=>{
    const db=res.locals.db as SupabaseClient;
    const book=result(await db.from('ivraine_books').select('*').eq('id',res.locals.member.book_id).single());
    res.json({book,member:res.locals.member,userId:res.locals.userId});
  });
  app.get('/api/entries',async(req,res)=>{
    const offset=z.coerce.number().int().min(0).max(1000000).parse(req.query.offset??0);
    const db=res.locals.db as SupabaseClient;
    const entries=result(await db.from('ivraine_entries').select('*').eq('book_id',res.locals.member.book_id).order('event_date',{ascending:false}).order('id').range(offset,offset+99)) ?? [];
    const paths=[...new Set(entries.flatMap(e=>e.photo_paths))] as string[];
    const urls=new Map<string,string>();
    if(paths.length){const signed=result(await db.storage.from(bucket).createSignedUrls(paths,300)) ?? []; for(const s of signed) if(s.path && s.signedUrl) urls.set(s.path,s.signedUrl);}
    res.json({entries:entries.map(e=>({...e,photo_urls:e.photo_paths.map((p:string)=>urls.get(p)??null)})),nextOffset:entries.length===100?offset+100:null});
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
  app.use((_req,_res,next)=>next(new HttpError(404,'Endpoint not found.')));
  const handler:ErrorRequestHandler=(err,_req,res,_next)=>{
    if(err instanceof z.ZodError){res.status(400).json({error:'Check your input.',details:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`)});return;}
    const status=err instanceof HttpError?err.status:err.type==='entity.too.large'?413:err.type==='entity.parse.failed'?400:500;
    if(status===500) console.error('request_failed',err instanceof Error?err.name:'Unknown');
    res.status(status).json({error:status===413?'Photo too large. Maximum size is 8 MB.':status===400?'Invalid JSON request.':err instanceof HttpError?err.message:'Something went wrong. Please try again.'});
  }; app.use(handler);return app;
}
