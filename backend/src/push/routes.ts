import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { Deliver } from './worker.js';
import { PushStore, PushError } from './store.js';
import { heartSchema, subscriptionSchema } from './validation.js';
export interface PushServices {store:PushStore|null;publicKey:string|null;keyId:string|null;deliver?:Deliver;workerRunning?:boolean;poolStatus?:{idleCount:number;waitingCount:number;totalCount:number}|null;}
// Storage outages (missing migration, unreachable database) must answer a calm 503 with
// Retry-After instead of a bare 500, so the app shows a status line and backs off.
let schemaLogged=false,storeErrorLoggedAt=0;
function storeFailure(error:unknown):PushError{
 if(error instanceof PushError)return error;
 const code=typeof error==='object'&&error!==null&&'code' in error?String((error as {code:unknown}).code):'';
 if(code==='42P01'){
  if(!schemaLogged){schemaLogged=true;console.error('push_schema_missing: apply supabase/migrations/20260916205359_push_notifications.sql to the PUSH_DATABASE_URL database; heart sharing stays disabled until it is applied');}
  return new PushError(503,'Heart sharing needs the notification database setup.',300);
 }
 if(Date.now()-storeErrorLoggedAt>300000){
  storeErrorLoggedAt=Date.now();
  console.error(`push_store_error: the notification database rejected a query (${code||'unexpected error'}); check PUSH_DATABASE_URL connectivity and credentials`, error);
 }
 return new PushError(503,'Hearts are briefly unavailable. The app retries on its own.',30);
}
// A short, non-technical reason reused by the in-app notification health check.
function storageReason(error:unknown){
 if(error instanceof PushError)return error.message;
 const code=typeof error==='object'&&error!==null&&'code' in error?String((error as {code:unknown}).code):'';
 if(code==='42P01')return 'The notification tables are missing. Run supabase/migrations/20260916205359_push_notifications.sql in the Supabase SQL editor.';
 return 'The notification database could not be reached. Verify PUSH_DATABASE_URL on the API service.';
}
function storageCode(error:unknown){return typeof error==='object'&&error!==null&&'code' in error?String((error as {code:unknown}).code):'';}
function guarded(handler:(req:Request,res:Response)=>Promise<void>){
 return async(req:Request,res:Response,next:NextFunction)=>{try{await handler(req,res);}catch(error){next(error instanceof z.ZodError?error:storeFailure(error));}};
}
export function pushRouter(services:PushServices){
 const router=Router();
 router.post('/test',rateLimit({windowMs:60000,limit:3,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Wait a minute before testing again.'}}),guarded(async(req,res)=>{
  if(!services.store||!services.keyId||!services.deliver)throw new PushError(503,'Push notifications need server setup.');
  const subscription=subscriptionSchema.parse(req.body);
  if(!await services.store.subscriptionActive(res.locals.userId,subscription.endpoint,services.keyId))throw new PushError(409,'Enable notifications on this device before testing.');
  try{
   await services.deliver(subscription,JSON.stringify({type:'test',eventId:'device-test'}));
  }catch(error){
   const status=typeof error==='object'&&error!==null&&'statusCode' in error?Number(error.statusCode):0;
   if(status===404||status===410){await services.store.unsubscribe(res.locals.userId,subscription.endpoint);throw new PushError(410,'This device subscription expired. Enable notifications again.');}
   if(status===401||status===403)throw new PushError(503,'The push service rejected the server credentials. Check the VAPID key pair and contact address.');
   throw new PushError(503,'The push service could not be reached. Please try again shortly.',30);
  }
  res.json({accepted:true});
 }));
 router.get('/state',guarded(async(_req,res)=>{
  if(!services.store){res.json({enabled:false,pushEnabled:false,publicKey:null,received:[],lastSent:null,deviceCount:0,partner:null,workerRunning:false});return;}
  const state=await services.store.state(res.locals.userId,res.locals.member.book_id,services.keyId);
  res.json({enabled:true,pushEnabled:!!services.publicKey,workerRunning:!!services.workerRunning,publicKey:services.publicKey,...state});
 }));
 // Answers with a plain-language report instead of an error, so the couple can fix the missing
 // step (migration, VAPID pair, partner device) without reading server logs.
 router.get('/diagnostics',rateLimit({windowMs:60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Wait a minute before checking notifications again.'}}),guarded(async(_req,res)=>{
  const report:{storage:{configured:boolean;schemaReady:boolean;error:string|null;code:string};vapid:{configured:boolean};worker:{running:boolean};devices:{own:number;partner:number};deliveries:{pending:number;sending:number;accepted:number;failed:number;lastError:string|null}|null}=
   {storage:{configured:!!services.store,schemaReady:false,error:null,code:''},vapid:{configured:!!services.publicKey},worker:{running:!!services.workerRunning},devices:{own:0,partner:0},deliveries:null};
  if(!services.store){report.storage.error='PUSH_DATABASE_URL is not set on the API service.';res.json(report);return;}
  try{
   const data=await services.store.diagnostics(res.locals.userId,res.locals.member.book_id,services.keyId);
   report.storage.schemaReady=true;report.devices=data.devices;report.deliveries=data.deliveries;
  }catch(error){report.storage.error=storageReason(error);report.storage.code=storageCode(error);}
  res.json(report);
 }));
 router.post('/subscriptions',guarded(async(req,res)=>{
  if(!services.store||!services.publicKey||!services.keyId)throw new PushError(503,'Push notifications need server setup.');
  const sub=subscriptionSchema.parse(req.body);
  await services.store.subscribe(res.locals.userId,res.locals.member.book_id,sub,services.keyId);
  res.status(201).json({subscribed:true});
 }));
 router.post('/subscriptions/check',guarded(async(req,res)=>{
  const {endpoint}=z.object({endpoint:z.string().max(4096)}).strict().parse(req.body);
  res.json({active:services.store?await services.store.subscriptionActive(res.locals.userId,endpoint,services.keyId):false});
 }));
 router.delete('/subscriptions',guarded(async(req,res)=>{
  if(!services.store)throw new PushError(503,'Notification storage is not configured.');
  const {endpoint}=z.object({endpoint:z.string().max(4096)}).strict().parse(req.body);
  await services.store.unsubscribe(res.locals.userId,endpoint);res.json({subscribed:false});
 }));
 router.delete('/devices',guarded(async(_req,res)=>{
  if(!services.store)throw new PushError(503,'Notification storage is not configured.');
  await services.store.unsubscribeAll(res.locals.userId);res.json({subscribed:false});
 }));
 router.post('/hearts',guarded(async(req,res)=>{
  if(!services.store)throw new PushError(503,'Heart sharing needs the notification database setup.');
  const {requestId}=heartSchema.parse(req.body);
  const saved=await services.store.sendHeart(res.locals.userId,res.locals.member.book_id,requestId,services.keyId);
  res.status(saved.duplicate?200:201).json({saved:true,...saved});
 }));
 return router;
}
