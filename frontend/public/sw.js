/* Cache only a non-private offline page; never cache sessions, API, or photo data. */
const CACHE='ivraine-offline-v5';
const CONFIG='ivraine-push-config-v1';
const KEY_PATH='/ivraine-push-key';
const SCRAPBOOK_URL='/#story';
// Push payloads are untrusted input. Only fixed, allow-listed text is ever rendered, so a
// spoofed or corrupted payload can never inject a private message into the notification tray.
const TEXT={
 heart:'A little “I miss you” is waiting in your private scrapbook. ♡',
 test:'Notifications are connected on this device. ♡'
};
function cleanId(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value)?value:'new';}
function base64Bytes(value){const padded=value.replace(/-/g,'+').replace(/_/g,'/');const raw=atob(padded.padEnd(Math.ceil(padded.length/4)*4,'='));const bytes=new Uint8Array(raw.length);for(let index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);return bytes.buffer;}
// The Badging API is optional; iOS and older browsers simply ignore it.
async function badge(count){try{const api=self.navigator;if(api&&typeof api.setAppBadge==='function')await api.setAppBadge(count);}catch{}}
async function storeKey(value){try{if(typeof caches==='undefined'||typeof Response==='undefined'||!value)return;const cache=await caches.open(CONFIG);await cache.put(KEY_PATH,new Response(value));}catch{}}
async function loadKey(){try{if(typeof caches==='undefined')return null;const cache=await caches.open(CONFIG);const hit=await cache.match(KEY_PATH);if(!hit)return null;const value=await hit.text();return value?base64Bytes(value):null;}catch{return null;}}
async function notify(title,options){try{await self.registration.showNotification(title,{...options,silent:false,requireInteraction:true,persistent:true});}catch{await self.registration.showNotification(title,{body:options.body,icon:options.icon,badge:options.badge,image:options.image,tag:options.tag,data:options.data});}}
async function toApp(type,payload){try{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows)client.postMessage({type,...payload});}catch{}}
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/offline.css'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key!==CONFIG).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(new URL(event.request.url).pathname==='/offline.css'){event.respondWith(caches.match('/offline.css'));return;}if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));}});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  const test=payload.type==='test'||payload.kind==='test';
  const eventId=test?'device-test':cleanId(payload.eventId);
  await notify('Ivraine ♡',{
   body:test?TEXT.test:TEXT.heart,
   icon:'/icons/couple-192.png',
   badge:'/icons/couple-32.png',
   image:'/icons/couple-512.png',
   tag:`ivraine-heart-${eventId}`,
   renotify:true,
   timestamp:Date.now(),
   lang:'en',
   dir:'ltr',
   vibrate:test?[40]:[120,60,120],
   data:{url:SCRAPBOOK_URL,eventId,test},
   actions:test?[{action:'open',title:'Open Ivraine'}]:[{action:'open',title:'Open our scrapbook'},{action:'heart-back',title:'Send one back ♡'}]
  });
  await badge(test?0:1);
  await toApp('ivraine-heart',{eventId,test});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const action=typeof event.action==='string'?event.action:'';
 event.waitUntil((async()=>{
  const target=new URL(SCRAPBOOK_URL,self.location.origin);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin===target.origin){
    await client.navigate(target.href);
    await client.focus();
    if(action==='heart-back')client.postMessage({type:'ivraine-heart-back'});
    return;
   }
  }
  await self.clients.openWindow(target.href);
 })());
});
// The push service rotates or expires endpoints on its own schedule; re-subscribe and let the
// signed-in page persist the new endpoint instead of silently losing notifications.
self.addEventListener('pushsubscriptionchange',event=>{
 event.waitUntil((async()=>{
  try{
   const key=await loadKey();
   const subscription=await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key??undefined});
   await toApp('ivraine-resubscribed',{subscription:subscription.toJSON()});
  }catch{}
 })());
});
self.addEventListener('message',event=>{
 const data=event?.data||{};
 const task=data.type==='ivraine-push-key'&&typeof data.publicKey==='string'&&data.publicKey.length>0&&data.publicKey.length<512?storeKey(data.publicKey):data.type==='ivraine-badge-clear'?badge(0):null;
 if(task&&typeof event.waitUntil==='function')event.waitUntil(task);else if(task)void task;
});
