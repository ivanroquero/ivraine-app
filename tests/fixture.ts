/** Test-only Supabase transport emulator: real PostgreSQL queries/RLS via PGlite.
 * Auth tokens and Storage objects are deterministic local fixtures, never production services.
 */
import express from 'express';
import cors from 'cors';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
export const USER1='11111111-1111-4111-8111-111111111111',USER2='22222222-2222-4222-8222-222222222222',OUTSIDER='33333333-3333-4333-8333-333333333333',BOOK='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const fixtureKey='sb_publishable_TEST_ONLY_DO_NOT_DEPLOY';
export const users:Record<string,string>={'ivan@test.local':USER1,'loraine@test.local':USER2,'outsider@test.local':OUTSIDER};
export async function fixtureDatabase(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 insert into auth.users values('${USER1}','ivan@test.local',now()),('${USER2}','loraine@test.local',now()),('${OUTSIDER}','outsider@test.local',now());`);
 await db.exec(await readFile(new URL('../database/setup.sql',import.meta.url),'utf8'));
 await db.exec(`insert into public.ivraine_books(id) values('${BOOK}');insert into public.ivraine_members values('${USER1}','${BOOK}','Ivan'),('${USER2}','${BOOK}','Loraine');`);
 return db;
}
export async function asUser<T=Record<string,unknown>>(db:PGlite,id:string,sql:string,params:unknown[]=[]){return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);return tx.query<T>(sql,params);});}
function user(id:string){return {id,aud:'authenticated',role:'authenticated',email:Object.entries(users).find(x=>x[1]===id)?.[0],email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};}
export function token(id:string){const part=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');return `${part({alg:'HS256',typ:'JWT'})}.${part({sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.fixture`}
function tokenUser(value:string|undefined){try{const id=JSON.parse(Buffer.from((value||'').replace('Bearer ','').split('.')[1],'base64url').toString()).sub;return Object.values(users).includes(id)?id:null;}catch{return null;}}
export async function startFixture(port=0){
 const db=await fixtureDatabase();const app=express();app.use(cors());app.use(express.json());
 const blobs=new Map<string,{body:Buffer;type:string}>(),signatures=new Map<string,string>();
 let base='';
 app.post('/auth/v1/token',(req,res)=>{const id=users[req.body.email];if(!id||req.body.password!=='test-password-123'){res.status(400).json({error:'invalid_grant',error_description:'Invalid login credentials'});return;}res.json({access_token:token(id),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'test-refresh',user:user(id)});});
 app.get('/auth/v1/user',(req,res)=>{const id=tokenUser(req.headers.authorization);if(!id){res.status(401).json({message:'Invalid token'});return;}res.json(user(id));});
 app.post('/auth/v1/logout',(_req,res)=>res.status(204).end());
 app.post('/auth/v1/recover',(_req,res)=>res.json({}));
 app.put('/auth/v1/user',(req,res)=>res.json(user(tokenUser(req.headers.authorization)||USER1)));
 app.get('/storage/v1/object/sign/*path',(req,res)=>{const key=String(req.params.path instanceof Array?req.params.path.join('/'):req.params.path);const allowed=signatures.get(String(req.query.token));const blob=blobs.get(key);if(!blob||allowed!==key){res.status(404).end();return;}res.type(blob.type).send(blob.body);});
 app.use((req,res,next)=>{const id=tokenUser(req.headers.authorization);if(!id){res.status(401).json({message:'Invalid token'});return;}res.locals.id=id;next();});
 app.all('/rest/v1/:table',async(req,res)=>{
  const table=String(req.params.table);if(!['ivraine_books','ivraine_members','ivraine_entries'].includes(table)){res.status(404).end();return;}
  try{
   const params:unknown[]=[];const arg=(v:unknown)=>{params.push(v);return '$'+params.length};
   const ident=(s:string)=>{if(!/^[a-z_]+$/.test(s))throw new Error('Invalid identifier');return '"'+s+'"';};
   const where=()=>Object.entries(req.query).filter(([k])=>!['select','order','offset','limit'].includes(k)).map(([k,v])=>{const value=String(v);if(value.startsWith('eq.'))return `${ident(k)}=${arg(value.slice(3))}`;if(value.startsWith('cs.'))return `${ident(k)} @> ${arg(value.slice(3))}::text[]`;throw new Error('Unsupported filter '+value);}).join(' and ')||'true';
   const columns=String(req.query.select||'*').split(',').map(s=>s==='*'?'*':ident(s)).join(',');let sql='';
   if(req.method==='GET'){
    sql=`select ${columns} from public.${table} where ${where()}`;
    if(req.query.order)sql+=' order by '+String(req.query.order).split(',').map(part=>{const [col,dir]=part.split('.');return ident(col)+' '+(dir==='desc'?'desc':'asc');}).join(',');
    sql+=` limit ${arg(Number(req.query.limit||1000))} offset ${arg(Number(req.query.offset||0))}`;
   }else if(req.method==='POST'){
    const pairs=Object.entries(req.body);sql=`insert into public.${table}(${pairs.map(([k])=>ident(k)).join(',')}) values(${pairs.map(([,v])=>arg(v)).join(',')}) returning ${columns}`;
   }else if(req.method==='PATCH'){
    const set=Object.entries(req.body).map(([k,v])=>`${ident(k)}=${arg(v)}`).join(',');sql=`update public.${table} set ${set} where ${where()} returning ${columns}`;
   }else if(req.method==='DELETE')sql=`delete from public.${table} where ${where()} returning ${columns}`;
   else{res.status(405).end();return;}
   const data=await asUser(db,res.locals.id,sql,params);
   const single=req.headers.accept?.includes('application/vnd.pgrst.object+json');
   if(single&&data.rows.length!==1){res.status(406).json({code:'PGRST116',message:'JSON object requested, multiple (or no) rows returned',details:`The result contains ${data.rows.length} rows`});return;}
   const normalized=data.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['anniversary','event_date'].includes(key)&&value instanceof Date?value.toISOString().slice(0,10):value])));
   res.status(req.method==='POST'?201:200).json(single?normalized[0]:normalized);
  }catch(error){res.status(400).json({message:error instanceof Error?error.message:'Query failed',code:'test_database_error'});}
 });
 app.post('/storage/v1/object/sign/:bucket',async(req,res)=>{
  const paths=req.body.paths as string[];const result=[];
  for(const path of paths){const {rows}=await asUser(db,res.locals.id,'select name from storage.objects where bucket_id=$1 and name=$2',[req.params.bucket,path]);const key=`${req.params.bucket}/${path}`;const sig=randomUUID();if(rows.length)signatures.set(sig,key);result.push({path,signedURL:rows.length?`/object/sign/${key}?token=${sig}`:null,error:rows.length?null:'not found'});}
  res.json(result);
 });
 app.post('/storage/v1/object/:bucket/*path',express.raw({type:['image/jpeg','image/png','image/webp'],limit:'8mb'}),async(req,res)=>{
  const path=Array.isArray(req.params.path)?req.params.path.join('/'):String(req.params.path);
  try{await asUser(db,res.locals.id,'insert into storage.objects(bucket_id,name) values($1,$2)',[req.params.bucket,path]);blobs.set(`${req.params.bucket}/${path}`,{body:req.body,type:req.headers['content-type']||'image/jpeg'});res.json({Key:`${req.params.bucket}/${path}`,Id:randomUUID()});}catch{res.status(403).json({message:'Access denied'});}
 });
 app.delete('/storage/v1/object/:bucket',async(req,res)=>{const output=[];for(const path of req.body.prefixes){const {rows}=await asUser(db,res.locals.id,'delete from storage.objects where bucket_id=$1 and name=$2 returning name',[req.params.bucket,path]);if(rows.length){blobs.delete(`${req.params.bucket}/${path}`);output.push({name:path});}}res.json(output);});
 const server:Server=await new Promise(resolve=>{const s=app.listen(port,'127.0.0.1',()=>resolve(s));});
 const address=server.address();base=`http://127.0.0.1:${typeof address==='object'&&address?address.port:port}`;
 return {db,server,url:base,close:async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));await db.close();}};
}
