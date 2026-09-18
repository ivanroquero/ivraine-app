import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app';
import { isRecentlyActive, presenceLabel } from '../frontend/src/utils';
import { startFixture,token,USER1,USER2,OUTSIDER,fixtureKey } from './fixture';
test('API: auth, shared CRUD, photo upload, stale edits, and deletion end to end',async()=>{
 const fixture=await startFixture();const app=createApp({supabaseUrl:fixture.url,supabaseKey:fixtureKey,origins:['http://localhost:5173'],trustProxy:0});
 const auth1={Authorization:`Bearer ${token(USER1)}`},auth2={Authorization:`Bearer ${token(USER2)}`};
 try{
  await request(app).get('/health').expect(200);
  await request(app).get('/api/book').expect(401);
  await request(app).get('/api/book').set('Authorization','Bearer garbage').expect(401);
  await request(app).get('/api/book').set('Authorization',`Bearer ${token(OUTSIDER)}`).expect(403);
  await request(app).get('/api/book').set(auth1).set('Origin','https://evil.example').expect(403);
  const book=await request(app).get('/api/book').set(auth1).expect(200);assert.equal(book.body.member.display_name,'Ivan');
  const upload=await request(app).post('/api/photos').set(auth1).set('Content-Type','image/jpeg').send(Buffer.from([255,216,255,0])).expect(201);
  await request(app).post('/api/photos').set(auth1).set('Content-Type','image/jpeg').send(Buffer.from('<script>')).expect(415);
  const created=await request(app).post('/api/entries').set(auth1).send({kind:'memory',title:'Our first date',body:'Private story',event_date:'2026-09-02',photo_paths:[upload.body.path],chapter:'Our firsts'}).expect(201);
  const id=created.body.id;assert(id);
  const list=await request(app).get('/api/entries').set(auth2).expect(200);assert.equal(list.body.entries.length,1);assert(list.body.entries[0].photo_urls[0].includes('/object/sign/'));
  const favorited=await request(app).patch(`/api/entries/${id}`).set(auth2).send({favorite:true,updated_at:created.body.updated_at}).expect(200);
  assert.equal(favorited.body.chapter,'Our firsts');assert.equal(favorited.body.body,'Private story');assert.equal(favorited.body.favorite,true);
  await request(app).patch(`/api/entries/${id}`).set(auth1).send({title:'Stale edit',updated_at:created.body.updated_at}).expect(409);
  await request(app).post('/api/entries').set(auth1).send({kind:'note',title:'Bad date',event_date:'2026-02-30'}).expect(400);
  await request(app).post('/api/entries').set(auth1).send({kind:'song',title:'Bad link',event_date:'2026-09-02',song_url:'javascript:alert(1)'}).expect(400);
  await request(app).delete('/api/photos').set(auth1).send({path:upload.body.path}).expect(409);
  await request(app).delete(`/api/entries/${id}`).set(auth2).expect(200);
  const after=await request(app).get('/api/entries').set(auth1).expect(200);assert.equal(after.body.entries.length,0);
  assert.equal((await fixture.db.query('select * from storage.objects')).rows.length,0);
  await request(app).delete(`/api/entries/${id}`).set(auth1).expect(404);
 }finally{await fixture.close();}
});

test('API: presence timestamps are shared and updated for both members',async()=>{
 const fixture=await startFixture();const app=createApp({supabaseUrl:fixture.url,supabaseKey:fixtureKey,origins:['http://localhost:5173'],trustProxy:0});
 const auth1={Authorization:`Bearer ${token(USER1)}`},auth2={Authorization:`Bearer ${token(USER2)}`};
 try{
  const initial=await request(app).get('/api/book').set(auth1).expect(200);
  assert(initial.body.member.last_active_at);
  assert(initial.body.partner.display_name==='Loraine');
  const before=Date.parse(initial.body.partner.last_active_at);

  const heartbeat=await request(app).post('/api/active').set(auth1).expect(200);
  assert(heartbeat.body.last_active_at);

  const refreshed=await request(app).get('/api/book').set(auth2).expect(200);
  assert(refreshed.body.member.display_name==='Loraine');
  assert(refreshed.body.partner.display_name==='Ivan');
  assert(Date.parse(refreshed.body.member.last_active_at) >= before);
 }finally{await fixture.close();}
});

test('Presence labels no longer surface active status in the UI',()=>{
 const now=Date.parse('2026-09-18T12:00:00Z');
 assert.equal(presenceLabel('You', undefined, true, new Date(now)), 'You · offline');
 assert.equal(presenceLabel('Loraine', '2026-09-18T11:58:00Z', false, new Date(now)), 'Loraine · offline');
 assert.equal(presenceLabel('Loraine', '2026-09-18T11:30:00Z', false, new Date(now)), 'Loraine · offline');
 assert.equal(presenceLabel('Loraine', '2026-09-17T12:00:00Z', false, new Date(now)), 'Loraine · offline');
 assert.equal(isRecentlyActive('2026-09-18T11:58:00Z', new Date(now)), false);
 assert.equal(isRecentlyActive('2026-09-18T11:30:00Z', new Date(now)), false);
});
