import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDatabase,asUser,USER1,USER2,OUTSIDER,BOOK } from './fixture';
import { entrySchema, imageExtension } from '../backend/src/validation';
import { monthEvents, nextEvent } from '../frontend/src/calendar';
import { daysTogether, escapeHtml } from '../frontend/src/utils';
import type { Book,Entry } from '../frontend/src/types';
test('database RLS protects both direct API access and shared writes',async()=>{
 const db=await fixtureDatabase();try{
  const {rows}=await asUser(db,USER1,`insert into public.ivraine_entries(book_id,author_id,kind,title,event_date) values($1,$2,'memory','Private memory','2026-09-02') returning id`,[BOOK,USER1]);const id=(rows[0] as {id:string}).id;
  assert.equal((await asUser(db,USER2,'select * from public.ivraine_entries')).rows.length,1);
  assert.equal((await asUser(db,OUTSIDER,'select * from public.ivraine_entries')).rows.length,0);
  assert.equal((await asUser(db,OUTSIDER,'select * from public.ivraine_books')).rows.length,0);
  assert.equal((await asUser(db,USER1,'select * from public.ivraine_members')).rows.length,1);
  await asUser(db,USER2,'update public.ivraine_entries set title=$1 where id=$2',['Shared edit',id]);
  assert.equal((await asUser(db,USER1,'select title from public.ivraine_entries')).rows[0].title,'Shared edit');
  await assert.rejects(asUser(db,OUTSIDER,`insert into public.ivraine_entries(book_id,author_id,kind,title,event_date) values($1,$2,'note','Intrusion','2026-09-02')`,[BOOK,OUTSIDER]));
  await assert.rejects(asUser(db,USER1,`insert into public.ivraine_entries(book_id,author_id,kind,title,event_date) values($1,$2,'note','Spoofing','2026-09-02')`,[BOOK,USER2]));
  await assert.rejects(asUser(db,USER1,'update public.ivraine_entries set author_id=$1 where id=$2',[USER2,id]));
  await assert.rejects(asUser(db,USER1,'insert into public.ivraine_members values($1,$2,$3)',[OUTSIDER,BOOK,'Intruder']));
  await assert.rejects(asUser(db,USER1,`insert into storage.objects(bucket_id,name) values('ivraine-photos',$1)`,[`${BOOK}/${USER2}/x.jpg`]));
  await asUser(db,USER1,`insert into storage.objects(bucket_id,name) values('ivraine-photos',$1)`,[`${BOOK}/${USER1}/x.jpg`]);
  assert.equal((await asUser(db,USER2,'select * from storage.objects')).rows.length,1);
  assert.equal((await asUser(db,OUTSIDER,'select * from storage.objects')).rows.length,0);
  await asUser(db,USER2,'delete from public.ivraine_entries where id=$1',[id]);assert.equal((await asUser(db,USER1,'select * from public.ivraine_entries')).rows.length,0);
 }finally{await db.close();}
});
test('validation rejects unsafe song URLs, invalid dates, and unbounded photos',()=>{
 const base={kind:'song',title:'Our song',event_date:'2026-09-02'};
 assert(entrySchema.safeParse({...base,song_url:'https://open.spotify.com/track/123'}).success);
 for(const url of ['javascript:alert(1)','https://evil.example/song','https://open.spotify.com.evil.example/song'])assert(!entrySchema.safeParse({...base,song_url:url}).success);
 assert(!entrySchema.safeParse({...base,event_date:'2026-02-30'}).success);
 assert(!entrySchema.safeParse({...base,author_id:USER2}).success);
 assert(!entrySchema.safeParse({...base,photo_paths:Array(13).fill('a')}).success);
 assert.equal(imageExtension(Buffer.from('<script>alert(1)</script>')),null);
 assert.equal(imageExtension(Buffer.from([255,216,255,0])),'jpg');
 assert.equal(escapeHtml('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');
});
test('monthly and yearly calendar handles month ends, leap years, and next dates',()=>{
 const book={anniversary:'2024-01-31'} as Book;
 const e={id:'birthday',kind:'date',title:'Birthday',event_date:'2024-02-29',recurrence:'yearly'} as Entry;
 assert.equal(monthEvents(book,[e],2025,1).find(x=>x.id==='anniversary')?.date,'2025-02-28');
 assert.equal(monthEvents(book,[e],2025,1).find(x=>x.id==='birthday')?.date,'2025-02-28');
 assert.equal(monthEvents(book,[e],2028,1).find(x=>x.id==='birthday')?.date,'2028-02-29');
 assert.equal(nextEvent(book,[],'2026-09-16')?.date,'2026-09-30');
 assert.equal(daysTogether('2026-09-02','2026-09-16'),14);
});
