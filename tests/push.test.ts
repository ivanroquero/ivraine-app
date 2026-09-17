import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createECDH,randomBytes} from 'node:crypto';
import request from 'supertest';
import {fixtureDatabase,asUser,startFixture,USER1,USER2,OUTSIDER,BOOK,fixtureKey,token} from './fixture';
import {PushStore,PushError} from '../backend/src/push/store';
import {deliverNext} from '../backend/src/push/worker';
import {trustedPushEndpoint,subscriptionSchema} from '../backend/src/push/validation';
import {normalizeApiUrl} from '../frontend/src/api-config';
import {installPushSchema,pushPool} from './push-fixture';
import {createApp} from '../backend/src/app';
const keyId='a'.repeat(64);
function subscription(name='device'){const ecdh=createECDH('prime256v1');ecdh.generateKeys();return {endpoint:`https://fcm.googleapis.com/fcm/send/${name}`,keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};}
test('API URL normalizes trailing /api and prevents deployed localhost/mixed content',()=>{
 assert.equal(normalizeApiUrl(' https://api.example.com/api/ ','https://app.example.com'),'https://api.example.com/api');
 assert.equal(normalizeApiUrl('https://api.example.com/','https://app.example.com'),'https://api.example.com/api');
 assert.throws(()=>normalizeApiUrl('http://localhost:3001','https://app.example.com'),/localhost/);
 assert.throws(()=>normalizeApiUrl('http://api.example.com','https://app.example.com'),/HTTPS/);
 assert.throws(()=>normalizeApiUrl('https://user:secret@api.example.com','https://app.example.com'),/credentials/);
});
test('subscription validation blocks SSRF, fake suffixes, custom ports and bad keys',()=>{
 for(const endpoint of ['http://localhost:8000','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:8080/x','https://user@web.push.apple.com/x'])assert.equal(trustedPushEndpoint(endpoint),false);
 for(const endpoint of ['https://web.push.apple.com/x','https://fcm.googleapis.com/fcm/send/x','https://updates.push.services.mozilla.com/wpush/v2/x','https://wns2-a.notify.windows.com/w/?token=x'])assert.equal(trustedPushEndpoint(endpoint),true);
 assert(subscriptionSchema.safeParse(subscription()).success);
 assert(!subscriptionSchema.safeParse({...subscription(),keys:{auth:'bad',p256dh:'bad'}}).success);
});
test('private records, subscription ownership, idempotent hearts, durable cooldown, and two-way sharing',async()=>{
 const db=await fixtureDatabase();try{await installPushSchema(db);const store=new PushStore(pushPool(db));
 const sub=subscription();await store.subscribe(USER2,BOOK,sub,keyId);
 await assert.rejects(store.subscribe(USER1,BOOK,sub,keyId),(e:unknown)=>e instanceof PushError&&e.status===409);
 await assert.rejects(store.subscribe(OUTSIDER,BOOK,subscription('outsider'),keyId));
 await assert.rejects(asUser(db,USER1,'select * from ivraine_private.push_subscriptions'));
 const requestId=randomUUID(),saved=await store.sendHeart(USER1,BOOK,requestId,keyId);assert.equal(saved.queuedDevices,1);
 const duplicate=await store.sendHeart(USER1,BOOK,requestId,keyId);assert.equal(duplicate.eventId,saved.eventId);assert.equal(duplicate.duplicate,true);
 await assert.rejects(store.sendHeart(USER1,BOOK,randomUUID(),keyId),(e:unknown)=>e instanceof PushError&&e.status===429&&e.retryAfter>0);
 const receiver=await store.state(USER2,BOOK);assert.equal(receiver.received[0].senderName,'Ivan');
 const sender=await store.state(USER1,BOOK);assert.equal(sender.received.length,0);assert.equal(sender.lastSent.pending,1);
 await store.unsubscribe(USER1,sub.endpoint);assert.equal(await store.subscriptionActive(USER2,sub.endpoint,keyId),true);
 const reply=await store.sendHeart(USER2,BOOK,randomUUID(),keyId);assert.equal(reply.queuedDevices,0);assert.equal((await store.state(USER1,BOOK)).received[0].senderName,'Loraine');
 await assert.rejects(store.sendHeart(OUTSIDER,BOOK,randomUUID(),keyId));
 }finally{await db.close();}
});
test('worker accepts pushes, retries transient failures, prunes expired devices, and guards removed members',async()=>{
 const db=await fixtureDatabase();try{await installPushSchema(db);const store=new PushStore(pushPool(db));
 await store.subscribe(USER2,BOOK,subscription('retry'),keyId);await store.sendHeart(USER1,BOOK,randomUUID(),keyId);
 let attempts=0;
 await deliverNext(store,async()=>{attempts++;throw {statusCode:503};},keyId);
 assert.equal((await db.query<any>('select status,attempts from ivraine_private.push_deliveries')).rows[0].status,'pending');
 await db.exec("update ivraine_private.push_deliveries set next_attempt_at=now()-interval '1 second'");
 await deliverNext(store,async(_sub,payload)=>{attempts++;assert.equal(JSON.parse(payload).url,'/#story');assert(!payload.includes('Ivan'));},keyId);
 assert.equal(attempts,2);assert.equal((await store.state(USER1,BOOK)).lastSent.accepted,1);
 await db.exec("update ivraine_private.heart_events set created_at=now()-interval '2 minutes'");
 await store.sendHeart(USER1,BOOK,randomUUID(),keyId);
 await deliverNext(store,async()=>{throw {statusCode:410};},keyId);assert.equal((await db.query('select * from ivraine_private.push_subscriptions')).rows.length,0);
 assert.equal((await store.state(USER1,BOOK)).lastSent.failed,1);
 await store.subscribe(USER2,BOOK,subscription('revoked'),keyId);await db.exec("update ivraine_private.heart_events set created_at=now()-interval '2 minutes'");await store.sendHeart(USER1,BOOK,randomUUID(),keyId);
 await db.query('delete from public.ivraine_members where user_id=$1',[USER2]);
 let leaked=false;await deliverNext(store,async()=>{leaked=true;},keyId);assert.equal(leaked,false);
 }finally{await db.close();}
});
test('HTTP endpoints require auth, persist hearts, expose cooldown, and honor normalized CORS preflight',async()=>{
 const fixture=await startFixture();try{await installPushSchema(fixture.db);const store=new PushStore(pushPool(fixture.db));
 const app=createApp({supabaseUrl:fixture.url,supabaseKey:fixtureKey,origins:['https://site.example/'],trustProxy:0,push:{store,publicKey:'test-public-key',keyId}});
 const headers={Authorization:`Bearer ${token(USER1)}`};
 const preflight=await request(app).options('/api/notifications/hearts').set('Origin','https://site.example').set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','authorization,content-type').expect(204);assert.equal(preflight.headers['access-control-allow-origin'],'https://site.example');
 await request(app).post('/api/notifications/hearts').send({requestId:randomUUID()}).expect(401);
 await request(app).get('/api/notifications/state').set('Authorization',`Bearer ${token(OUTSIDER)}`).expect(403);
 await request(app).post('/api/notifications/subscriptions').set(headers).send({...subscription(),endpoint:'https://localhost/'}).expect(400);
 await request(app).post('/api/notifications/hearts').set(headers).send({requestId:randomUUID()}).expect(201);
 const tooSoon=await request(app).post('/api/notifications/hearts').set(headers).send({requestId:randomUUID()}).expect(429);assert(Number(tooSoon.headers['retry-after'])>0);
 }finally{await fixture.close();}
});
test('storage outages answer 503 with Retry-After and an actionable message instead of 500',async()=>{
 const dbFailure=(code:string)=>async()=>{const error=new Error(code==='42P01'?'relation "ivraine_private.push_subscriptions" does not exist':'connect ECONNREFUSED 127.0.0.1:5432');(error as {code?:string}).code=code;throw error;};
 const fixture=await startFixture();try{
  const headers={Authorization:`Bearer ${token(USER1)}`};
  const schemaMissing=createApp({supabaseUrl:fixture.url,supabaseKey:fixtureKey,origins:['https://site.example/'],trustProxy:0,push:{store:{state:dbFailure('42P01')} as unknown as PushStore,publicKey:null,keyId:null}});
  const missing=await request(schemaMissing).get('/api/notifications/state').set(headers).expect(503);
  assert.equal(missing.body.error,'Heart sharing needs the notification database setup.');assert.equal(missing.headers['retry-after'],'300');
  const unreachable=createApp({supabaseUrl:fixture.url,supabaseKey:fixtureKey,origins:['https://site.example/'],trustProxy:0,push:{store:{state:dbFailure('ECONNREFUSED')} as unknown as PushStore,publicKey:null,keyId:null}});
  const down=await request(unreachable).get('/api/notifications/state').set(headers).expect(503);
  assert.equal(down.body.error,'Hearts are briefly unavailable. The app retries on its own.');assert.equal(down.headers['retry-after'],'30');
 }finally{await fixture.close();}
});
