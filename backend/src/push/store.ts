import type { PushSubscription } from 'web-push';
export interface SqlResult { rows:Record<string,any>[]; rowCount?:number|null; }
export interface SqlConnection {query:(sql:string,values?:any[])=>Promise<SqlResult>;release:()=>void;}
export interface SqlPool {query:(sql:string,values?:any[])=>Promise<SqlResult>;connect:()=>Promise<SqlConnection>;}
export class PushError extends Error {constructor(public status:number,message:string,public retryAfter=0){super(message);}}
export class PushStore {
 constructor(readonly pool:SqlPool){}

 async transaction<T>(fn:(sql:SqlConnection)=>Promise<T>):Promise<T>{const db=await this.pool.connect();try{await db.query('begin');const value=await fn(db);await db.query('commit');return value;}catch(error){await db.query('rollback').catch(()=>undefined);throw error;}finally{db.release();}}

 async subscribe(userId:string,bookId:string,subscription:PushSubscription,keyId:string){
  await this.transaction(async db=>{
   await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[userId]);
   const member=await db.query('select 1 from public.ivraine_members where user_id=$1 and book_id=$2',[userId,bookId]);
   if(!member.rows.length)throw new PushError(403,'This account is no longer part of the scrapbook.');
   const existing=await db.query('select user_id from ivraine_private.push_subscriptions where endpoint=$1',[subscription.endpoint]);
   if(existing.rows[0] && existing.rows[0].user_id!==userId)throw new PushError(409,'This browser subscription belongs to another account. Disable notifications, then enable them again.');
   await db.query('delete from ivraine_private.push_subscriptions where user_id=$1 and key_id<>$2',[userId,keyId]);
   if(!existing.rows.length){const count=await db.query('select count(*)::int as n from ivraine_private.push_subscriptions where user_id=$1',[userId]);const maxDevices = process.env.MAX_PUSH_DEVICES_PER_USER ? parseInt(process.env.MAX_PUSH_DEVICES_PER_USER, 10) : 5;if(count.rows[0].n>=maxDevices)throw new PushError(409,`You already have ${maxDevices} notification devices. Remove an old device first.`);}
   await db.query(`insert into ivraine_private.push_subscriptions(user_id,book_id,endpoint,p256dh,auth,key_id) values($1,$2,$3,$4,$5,$6)
   on conflict(endpoint) do update set book_id=excluded.book_id,p256dh=excluded.p256dh,auth=excluded.auth,key_id=excluded.key_id,updated_at=now() where ivraine_private.push_subscriptions.user_id=excluded.user_id`,[userId,bookId,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,keyId]);
  });
 }
 async subscriptionActive(userId:string,endpoint:string,keyId:string|null){const {rows}=await this.pool.query('select 1 from ivraine_private.push_subscriptions where user_id=$1 and endpoint=$2 and key_id=$3',[userId,endpoint,keyId]);return rows.length>0;}
 async unsubscribe(userId:string,endpoint:string){await this.pool.query('delete from ivraine_private.push_subscriptions where user_id=$1 and endpoint=$2',[userId,endpoint]);}
 async unsubscribeAll(userId:string){await this.pool.query('delete from ivraine_private.push_subscriptions where user_id=$1',[userId]);}
 async sendHeart(userId:string,bookId:string,requestId:string,keyId:string|null){
  return this.transaction(async db=>{
   await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[userId]);
   const member=await db.query('select 1 from public.ivraine_members where user_id=$1 and book_id=$2',[userId,bookId]);if(!member.rows.length)throw new PushError(403,'You no longer belong to this scrapbook.');
   const existing=await db.query(`select id,created_at from ivraine_private.heart_events where sender_id=$1 and request_id=$2`,[userId,requestId]);
   if(existing.rows.length){const e=existing.rows[0];const devices=await db.query('select count(*)::int as n from ivraine_private.push_deliveries where event_id=$1',[e.id]);return {eventId:e.id,queuedDevices:devices.rows[0].n,nextAllowedAt:new Date(new Date(e.created_at).getTime()+60000).toISOString(),duplicate:true};}
   const latest=await db.query(`select greatest(0,ceil(extract(epoch from (created_at+interval '60 seconds'-now()))))::int as remaining from ivraine_private.heart_events where sender_id=$1 order by created_at desc limit 1`,[userId]);
   if(latest.rows[0]?.remaining>0)throw new PushError(429,'Your heart is on its way. Give it a moment before sending another.',latest.rows[0].remaining);
   const partner=await db.query('select user_id from public.ivraine_members where book_id=$1 and user_id<>$2',[bookId,userId]);
   if(partner.rows.length!==1)throw new PushError(409,'Heart sharing requires exactly two members in this scrapbook.');
   const recipient=partner.rows[0].user_id;
   const {rows:[event]}=await db.query('insert into ivraine_private.heart_events(book_id,sender_id,recipient_id,request_id) values($1,$2,$3,$4) returning id,created_at',[bookId,userId,recipient,requestId]);
   const {rows:devices}=await db.query(`insert into ivraine_private.push_deliveries(event_id,subscription_id)
     select $1,id from ivraine_private.push_subscriptions where book_id=$2 and user_id=$3 and key_id=$4 returning id`,[event.id,bookId,recipient,keyId]);
   return {eventId:event.id,queuedDevices:devices.length,nextAllowedAt:new Date(new Date(event.created_at).getTime()+60000).toISOString(),duplicate:false};
  });
 }
 async state(userId:string,bookId:string,keyId:string|null=null){
  const result=await this.pool.query(`select e.id,e.sender_id as "senderId",m.display_name as "senderName",e.created_at as "createdAt"
   from ivraine_private.heart_events e join public.ivraine_members m on m.user_id=e.sender_id and m.book_id=e.book_id
   where e.recipient_id=$1 and e.book_id=$2 order by e.created_at desc limit 10`,[userId,bookId]);
  const sent=await this.pool.query(`select e.id,e.created_at+interval '60 seconds' as "nextAllowedAt",
   count(d.id) filter(where d.status='accepted')::int as accepted,
   count(d.id) filter(where d.status in ('pending','sending'))::int as pending,
   count(d.id) filter(where d.status='failed')::int as failed
   from ivraine_private.heart_events e left join ivraine_private.push_deliveries d on d.event_id=e.id
   where e.sender_id=$1 and e.book_id=$2 group by e.id order by e.created_at desc limit 1`,[userId,bookId]);
  const device=await this.pool.query('select count(*)::int as count from ivraine_private.push_subscriptions where user_id=$1 and book_id=$2',[userId,bookId]);
  const partner=await this.pool.query(`select m.display_name as name,
   (select count(*)::int from ivraine_private.push_subscriptions s where s.book_id=m.book_id and s.user_id=m.user_id and ($3::text is null or s.key_id=$3)) as devices
   from public.ivraine_members m where m.book_id=$1 and m.user_id<>$2 limit 1`,[bookId,userId,keyId]);
  return {received:result.rows,lastSent:sent.rows[0]??null,deviceCount:device.rows[0].count,partner:partner.rows[0]??null};
 }
 // Read-only health report so a signed-in couple can see exactly which notification step is missing.
 async diagnostics(userId:string,bookId:string,keyId:string|null){
  const devices=await this.pool.query(`select count(*) filter (where user_id=$1)::int as own,count(*) filter (where user_id<>$1)::int as partner
   from ivraine_private.push_subscriptions where book_id=$2 and ($3::text is null or key_id=$3)`,[userId,bookId,keyId]);
  const deliveries=await this.pool.query(`select count(*) filter (where d.status='pending')::int as pending,count(*) filter (where d.status='sending')::int as sending,
   count(*) filter (where d.status='accepted')::int as accepted,count(*) filter (where d.status='failed')::int as failed
   from ivraine_private.push_deliveries d join ivraine_private.heart_events e on e.id=d.event_id where e.book_id=$1`,[bookId]);
  const lastError=await this.pool.query(`select d.last_error as "lastError" from ivraine_private.push_deliveries d join ivraine_private.heart_events e on e.id=d.event_id
   where e.book_id=$1 and d.last_error is not null order by d.created_at desc limit 1`,[bookId]);
  return {devices:{own:Number(devices.rows[0].own),partner:Number(devices.rows[0].partner)},
   deliveries:{pending:Number(deliveries.rows[0].pending),sending:Number(deliveries.rows[0].sending),accepted:Number(deliveries.rows[0].accepted),failed:Number(deliveries.rows[0].failed),lastError:(lastError.rows[0]?.lastError as string|undefined)??null}};
 }
 async claim(){
  return this.transaction(async db=>{
   await db.query(`update ivraine_private.push_deliveries set status='failed',last_error='expired',locked_until=null where status in ('pending','sending') and (created_at<now()-interval '1 hour' or (attempts>=5 and (locked_until is null or locked_until<now())))`);
   const {rows}=await db.query(`with candidate as (
     select d.id from ivraine_private.push_deliveries d where ((d.status='pending' and d.next_attempt_at<=now()) or (d.status='sending' and d.locked_until<now())) and d.attempts<5
     order by d.created_at for update skip locked limit 1
   ) update ivraine_private.push_deliveries d set status='sending',attempts=attempts+1,locked_until=now()+interval '60 seconds',lease_id=gen_random_uuid()
     from candidate where d.id=candidate.id returning d.*`);
   const job=rows[0];if(!job)return null;
   const {rows:targets}=await db.query(`select s.endpoint,s.p256dh,s.auth,s.key_id,e.id as event_id,e.created_at,
    exists(select 1 from public.ivraine_members m where m.user_id=e.sender_id and m.book_id=e.book_id) and
    exists(select 1 from public.ivraine_members m where m.user_id=e.recipient_id and m.book_id=e.book_id) as allowed
    from ivraine_private.push_subscriptions s join ivraine_private.heart_events e on e.id=$1 where s.id=$2 and s.user_id=e.recipient_id and s.book_id=e.book_id`,[job.event_id,job.subscription_id]);
   if(!targets.length || !targets[0].allowed){await db.query("update ivraine_private.push_deliveries set status='failed',last_error='membership_removed',locked_until=null where id=$1",[job.id]);return null;}
   return {...job,...targets[0]};
  });
 }
 async finish(id:string,lease:string,status:'accepted'|'failed'|'pending',error:string|null,delay=0){await this.pool.query(`update ivraine_private.push_deliveries set status=$3,last_error=$4,locked_until=null,next_attempt_at=now()+($5::int*interval '1 second') where id=$1 and lease_id=$2`,[id,lease,status,error,delay]);}
 async removeExpired(subscriptionId:string){await this.transaction(async db=>{await db.query("update ivraine_private.push_deliveries set status='failed',last_error='subscription_expired',locked_until=null where subscription_id=$1 and status in ('pending','sending')",[subscriptionId]);await db.query('delete from ivraine_private.push_subscriptions where id=$1',[subscriptionId]);});}
}
