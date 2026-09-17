import { Pool } from 'pg';
import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { PushStore } from './store.js';
import { startPushWorker } from './worker.js';
import type { PushServices } from './routes.js';
// One boot-time probe turns silent per-request failures into an actionable deploy log line.
async function probeDatabase(pool:Pool){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await Promise.race([pool.query('select 1 from ivraine_private.push_subscriptions limit 1'),new Promise<never>((_,fail)=>{timer=setTimeout(()=>fail(new Error('probe_timeout')),8000);})]);
  console.log('push_database_ready: heart storage is reachable and the notification tables exist');
 }catch(error){
  const code=typeof error==='object'&&error!==null&&'code' in error?String((error as {code:unknown}).code):'';
  if(code==='42P01')console.error('push_schema_missing: apply supabase/migrations/20260916205359_push_notifications.sql to the PUSH_DATABASE_URL database; heart sharing stays disabled until it is applied');
  else console.error(`push_database_unreachable: heart storage did not answer (${code||'network error'}); verify PUSH_DATABASE_URL host, credentials, and TLS`);
 }finally{clearTimeout(timer);}
}
export async function createPushRuntime(env:NodeJS.ProcessEnv):Promise<{services:PushServices;stop:()=>Promise<void>}>{
 const services:PushServices={store:null,publicKey:null,keyId:null};
 if(!env.PUSH_DATABASE_URL)return {services,stop:async()=>{}};
 const database=new URL(env.PUSH_DATABASE_URL);
 if(!['postgres:','postgresql:'].includes(database.protocol))throw new Error('PUSH_DATABASE_URL must be a PostgreSQL connection string.');
 // Enforce verified TLS rather than allowing URL flags to disable certificate validation.
 for(const name of ['sslmode','sslcert','sslkey','sslrootcert'])database.searchParams.delete(name);
 const pool=new Pool({connectionString:database.toString(),max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:15000,ssl:{rejectUnauthorized:true,...(env.PUSH_DATABASE_CA?{ca:env.PUSH_DATABASE_CA.replace(/\\n/g,'\n')}:{})}});
 pool.on('error',()=>console.error('push_database_connection_error'));
 services.store=new PushStore(pool);
 await probeDatabase(pool);
 let stopWorker=async()=>{};
 const configured=[env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY,env.VAPID_SUBJECT].filter(Boolean).length;
 if(configured>0&&configured<3)throw new Error('Set all three VAPID variables together.');
 if(configured===3){
  if(!/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT!))throw new Error('VAPID_SUBJECT must be a contact mailto: or HTTPS URL.');
  webpush.setVapidDetails(env.VAPID_SUBJECT!,env.VAPID_PUBLIC_KEY!,env.VAPID_PRIVATE_KEY!);
  services.publicKey=env.VAPID_PUBLIC_KEY!;
  services.keyId=createHash('sha256').update(services.publicKey).digest('hex');
  services.deliver=(subscription,payload)=>webpush.sendNotification(subscription,payload,{TTL:3600,urgency:'high',timeout:10000});
  stopWorker=startPushWorker(services.store,services.deliver,services.keyId);
 }
 return {services,stop:async()=>{await stopWorker();await pool.end();}};
}
