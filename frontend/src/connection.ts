import { api, ApiError, supabase } from './api';
import { install } from './pwa';
import type { RealtimeChannel } from '@supabase/supabase-js';
interface Heart {id:string;senderId:string;senderName:string;message?:string;createdAt:string;}
interface Partner {name:string;devices:number;last_active_at?:string|null;}
interface Deliveries {pending:number;sending:number;accepted:number;failed:number;lastError:string|null;}
interface Diagnostics {storage:{configured:boolean;schemaReady:boolean;error:string|null;code:string};vapid:{configured:boolean};worker:{running:boolean};devices:{own:number;partner:number};deliveries:Deliveries|null;}
interface PushMessage {type?:string;subscription?:PushSubscriptionJSON;eventId?:string;}
interface ConnectionState {enabled:boolean;pushEnabled:boolean;workerRunning:boolean;publicKey:string|null;received:Heart[];lastSent:{nextAllowedAt:string;accepted:number;pending:number;failed:number}|null;deviceCount:number;partner:Partner|null;}
let state:ConnectionState|null=null,userId:string|null=null,epoch=0,loading=false,sending=false,enabling=false,localSubscribed=false,blockedUntil=0,failures=0;
let issue='',status='',diagnostics:Diagnostics|null=null,poll:ReturnType<typeof setInterval>|undefined,clock:ReturnType<typeof setInterval>|undefined;
let notify:(s:string)=>void=()=>{};
let isSimultaneous=false, presenceChannel:RealtimeChannel|null=null;

export function connectionMarkup(){
 return `<section class="connection-card" aria-labelledby="connection-title">
  <div class="connection-copy">
   <span class="eyebrow">A LITTLE CLOSER</span>
   <h2 id="connection-title">Same feeling.<br>Different places.</h2>
   <p>One little heart to say <em>“I’m thinking of you.”</em></p>
   <div class="heart-quick-notes" role="radiogroup" aria-label="Micro-message for heart">
    <button type="button" class="quick-note-chip active" data-note="Thinking of you">💭 Thinking of you</button>
    <button type="button" class="quick-note-chip" data-note="Need a hug">🫂 Need a hug</button>
    <button type="button" class="quick-note-chip" data-note="On my way home">🏠 On my way home</button>
    <button type="button" class="quick-note-chip" data-note="Can't wait to see you">✨ Can't wait to see you</button>
    <button type="button" class="quick-note-chip" data-note="custom">✏️ Custom note</button>
    <input type="text" class="quick-note-input" id="quick-note-input" maxlength="160" placeholder="Type a sweet message…" hidden>
   </div>
   <p class="heart-partner" id="heart-partner"></p>
   <p class="heart-received" id="heart-received"></p>
   <p class="heart-status" id="heart-status" role="status" aria-live="polite"></p>
  </div>
  <div class="heart-stage">
   <button class="heart-button" data-heart-action="send" aria-label="Send I miss you to my partner" disabled>
    <span class="heart-orbit" aria-hidden="true"></span>
    <svg class="heart-gem" viewBox="0 0 120 110" aria-hidden="true">
     <defs>
      <linearGradient id="heart-face" x1="0" y1="0" x2="1" y2="1">
       <stop id="heart-stop-0" stop-color="#ffcbdc"/>
       <stop id="heart-stop-1" offset=".35" stop-color="#ed729b"/>
       <stop id="heart-stop-2" offset=".72" stop-color="#b73165"/>
       <stop id="heart-stop-3" offset="1" stop-color="#6c1745"/>
      </linearGradient>
      <linearGradient id="heart-shine" x1="0" y1="0" x2="0" y2="1">
       <stop stop-color="#fff" stop-opacity=".9"/>
       <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
     </defs>
     <path class="heart-depth" d="M60 101 12 57C-16 28 24-10 60 23 95-10 136 28 108 57Z"/>
     <path fill="url(#heart-face)" d="M60 95 12 51C-16 22 24-16 60 17 95-16 136 22 108 51Z"/>
     <path fill="url(#heart-shine)" d="M16 39C9 19 35 6 51 22 33 14 20 26 16 39Z"/>
    </svg>
    <span class="heart-button-label" id="heart-button-label">I miss you</span>
   </button>
   <span class="heart-hint" id="heart-hint">Send a little love</span>
  </div>
  <div class="notification-row">
   <span id="push-device-status">Checking this device…</span>
   <div>
    <button class="notification-button" data-heart-action="enable">Enable notifications</button>
    <button class="notification-button" data-heart-action="install" hidden>Add to Home Screen</button>
    <button class="notification-button" data-heart-action="diagnose">Check notifications</button>
    <button class="text-button" data-heart-action="disable" hidden>Turn off on this device</button>
    <button class="text-button" data-heart-action="all-off" hidden>Remove all my devices</button>
    <button class="text-button" data-heart-action="retry" hidden>Retry connection</button>
   </div>
  </div>
  <ul class="push-diagnostics" id="push-diagnostics" hidden></ul>
 </section>`;
}

function supported(){return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function iosNeedsInstall(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?!(matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone):false;}
function permission(){return 'Notification' in window?Notification.permission:'unsupported';}
let configuredPartnerName = '';
function partnerName(){
 const name = state?.partner?.name?.trim();
 if(name && name.toLowerCase() !== 'your partner') return name;
 if(configuredPartnerName && configuredPartnerName.toLowerCase() !== 'your partner') return configuredPartnerName;
 return '';
}
function partnerReady(){return (state?.partner?.devices??0)>0;}
function reducedMotion(){return matchMedia('(prefers-reduced-motion: reduce)').matches;}
function buzz(pattern:number[]){try{navigator.vibrate?.(pattern);}catch{ /* Vibration is optional on most devices. */ }}

export function setSimultaneousPresence(active:boolean){
 if(isSimultaneous!==active){
  isSimultaneous=active;
  paintConnection();
 }
}

function diagnosticRows(report:Diagnostics){
 const rows:{ok:boolean;text:string}[]=[];
 rows.push({ok:report.storage.configured&&report.storage.schemaReady,text:report.storage.configured?(report.storage.schemaReady?'Heart storage is connected.':'Heart storage is not ready yet.'):'The API service has no PUSH_DATABASE_URL, so hearts cannot be saved.'});
 if(report.storage.error)rows.push({ok:false,text:report.storage.error});
 rows.push({ok:report.vapid.configured,text:report.vapid.configured?'The server push keys are configured.':'The server is missing the VAPID push keys.'});
 rows.push({ok:report.worker.running,text:report.worker.running?'The delivery worker is running.':'The delivery worker is not running. Add the push keys, then redeploy the API.'});
 rows.push({ok:localSubscribed,text:localSubscribed?'This device is registered to receive hearts.':'This device is not registered yet. Tap “Enable notifications”.'});
 rows.push({ok:report.devices.partner>0,text:report.devices.partner>0?`${partnerName()} has a phone ready to receive hearts.`:`${partnerName()} has not enabled notifications on a phone yet.`});
 if(report.deliveries)rows.push({ok:report.deliveries.failed===0,text:`Hearts queued: ${report.deliveries.pending+report.deliveries.sending} · accepted by the push service: ${report.deliveries.accepted} · failed: ${report.deliveries.failed}${report.deliveries.lastError?` (last error: ${report.deliveries.lastError})`:''}`});
 return rows;
}

function paintDiagnostics(root:Element){
 const list=root.querySelector<HTMLUListElement>('#push-diagnostics')!;
 list.hidden=!diagnostics;if(!diagnostics)return;
 list.replaceChildren(...diagnosticRows(diagnostics).map(row=>{
  const item=document.createElement('li');item.className=row.ok?'ok':'bad';
  const mark=document.createElement('span');mark.setAttribute('aria-hidden','true');mark.textContent=row.ok?'✓':'•';
  const text=document.createElement('span');text.textContent=row.text;
  item.append(mark,text);return item;
 }));
}

export function paintConnection(){
 const root=document.querySelector('.connection-card');if(!root)return;
 const next=state?.lastSent?.nextAllowedAt?Date.parse(state.lastSent.nextAllowedAt):0;
 const remaining=Number.isFinite(next)&&next>0?Math.max(0,Math.ceil((next-Date.now())/1000)):0;
 const button=root.querySelector<HTMLButtonElement>('[data-heart-action=send]')!;
 button.disabled=!state?.enabled||sending||remaining>0;
 button.classList.toggle('is-sent',remaining>0);
 button.classList.toggle('is-sending',sending);
 button.classList.toggle('is-simultaneous',isSimultaneous);
 button.setAttribute('aria-busy',String(sending));

 // Gradient stops for normal rose vs radiant gold
 const stop0=root.querySelector('#heart-stop-0');
 const stop1=root.querySelector('#heart-stop-1');
 const stop2=root.querySelector('#heart-stop-2');
 const stop3=root.querySelector('#heart-stop-3');
 if(stop0&&stop1&&stop2&&stop3){
  if(isSimultaneous){
   stop0.setAttribute('stop-color','#fffbee');
   stop1.setAttribute('stop-color','#ffd700');
   stop2.setAttribute('stop-color','#e6a817');
   stop3.setAttribute('stop-color','#9c6508');
  }else{
   stop0.setAttribute('stop-color','#ffcbdc');
   stop1.setAttribute('stop-color','#ed729b');
   stop2.setAttribute('stop-color','#b73165');
   stop3.setAttribute('stop-color','#6c1745');
  }
 }

 root.querySelector('#heart-button-label')!.textContent=sending?'Sending…':remaining?'Heart sent':isSimultaneous?'Together now ✨':'I miss you';
 root.querySelector('#heart-hint')!.textContent=remaining?`Send again in ${remaining}s`:isSimultaneous?'✨ Both of you are here right now! Touch the gold heart ♡':'Send a little love';
 const partner=root.querySelector('#heart-partner')!;
 const pName=partnerName();
 partner.textContent=!state?.enabled?'':!state.partner?(pName?`Share hearts with ${pName}.`:'Add your love to this private space to share hearts.'):partnerReady()?`${pName||'Your love'} gets your hearts on their phone. ♡`:`${pName||'Your love'} has not enabled notifications on a phone yet — ask them to open Ivraine and tap “Enable notifications”.`;
 partner.classList.toggle('is-ready',partnerReady());
 const latest=state?.received[0];
 const noteMsg=latest?.message?`“${latest.message}”`:'';
 root.querySelector('#heart-received')!.textContent=latest?`${latest.senderName} sent you a heart ${noteMsg?`(${noteMsg}) `:''}· ${new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(latest.createdAt))}`:'Our little way to feel close.';
 const last=state?.lastSent;const delivery=last?.pending?'Saved. Push delivery is queued.':last?.accepted?'Saved. The push service accepted the notification.':last?.failed?'Saved in your private space. Push could not be delivered.':'';
 root.querySelector('#heart-status')!.textContent=issue||status||delivery||(!state?'Connecting…':!state.enabled?'Heart sharing needs the notification database setup.':'Hearts stay in your private space, even when notifications are off.');
 const device=root.querySelector('#push-device-status')!;
 device.textContent=iosNeedsInstall()?'On iPhone: add Ivraine to your Home Screen, then open it there.':!supported()?'This browser cannot receive Web Push. You can still exchange hearts here.':permission()==='denied'?'Notifications are blocked. Allow them in your browser or device settings.':!state?.pushEnabled?'Push notifications need server configuration.':localSubscribed?'Notifications enabled on this device.':'Enable notifications to receive hearts when the app is closed.';
 const enable=root.querySelector<HTMLButtonElement>('[data-heart-action=enable]')!;enable.hidden=localSubscribed||iosNeedsInstall();enable.disabled=enabling||!supported()||iosNeedsInstall()||permission()==='denied'||!state?.pushEnabled;enable.textContent=enabling?'Enabling…':'Enable notifications';
 const installButton=root.querySelector<HTMLButtonElement>('[data-heart-action=install]')!;installButton.hidden=!iosNeedsInstall();
 const disable=root.querySelector<HTMLButtonElement>('[data-heart-action=disable]')!;disable.hidden=!localSubscribed;disable.disabled=enabling;
 root.querySelector<HTMLButtonElement>('[data-heart-action=all-off]')!.hidden=!(state?.deviceCount);
 root.querySelector<HTMLButtonElement>('[data-heart-action=retry]')!.hidden=!issue;
 paintDiagnostics(root);
}

async function readLocalSubscription(){if(!supported())return null;try{return (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription()??null;}catch{return null;}}
async function shareKeyWithWorker(publicKey:string){try{const registration=await navigator.serviceWorker.getRegistration('/');const target=navigator.serviceWorker.controller??registration?.active??registration?.waiting??registration?.installing;target?.postMessage({type:'ivraine-push-key',publicKey});}catch{ /* The worker learns the key on the next visit. */ }}
async function clearBadge(){try{await (navigator as Navigator&{clearAppBadge?:()=>Promise<void>}).clearAppBadge?.();}catch{ /* Badging is optional. */ }
 try{const registration=await navigator.serviceWorker?.getRegistration('/');registration?.active?.postMessage({type:'ivraine-badge-clear'});}catch{ /* Older workers ignore this. */ }}

function celebrate(gold=false){
 buzz(gold?[30,40,70,40,30]:[20,30,20]);
 const stage=document.querySelector('.heart-stage');if(!stage||reducedMotion())return;
 stage.querySelector('.heart-burst')?.remove();
 const burst=document.createElement('span');burst.className='heart-burst';burst.setAttribute('aria-hidden','true');
 for(let index=0;index<7;index++){
  const i=document.createElement('i');
  if(gold) i.style.background='linear-gradient(140deg,#fff2b2,#f59e0b)';
  burst.append(i);
 }
 stage.append(burst);setTimeout(()=>burst.remove(),1500);
}

async function load(){if(!userId||loading)return;loading=true;const current=epoch;
 try{const next=await api<ConnectionState>('/notifications/state');if(current!==epoch)return;
  const seen=state?.received[0]?.id;state=next;issue='';failures=0;blockedUntil=0;if(next.lastSent?.pending===0)status='';
  if(seen&&next.received[0]&&seen!==next.received[0].id){
   const heartMsg=next.received[0].message?` “${next.received[0].message}”`:'';
   notify(`${next.received[0].senderName} sent you a heart${heartMsg}. ♡`);void clearBadge();
  }
  const sub=await readLocalSubscription();if(current!==epoch)return;localSubscribed=!!sub&&(!sub.expirationTime||sub.expirationTime>Date.now())&&localStorage.getItem('ivraine-push-owner')===userId&&permission()==='granted';
  if(localSubscribed&&sub){const {active}=await api<{active:boolean}>('/notifications/subscriptions/check','POST',{endpoint:sub.endpoint});if(current!==epoch)return;localSubscribed=active;if(active&&next.publicKey)void shareKeyWithWorker(next.publicKey);}
 }catch(error){
  if(current!==epoch)return;
  let userMessage=error instanceof Error?error.message:'Could not load heart sharing.';
  let wait=Math.min(240,15*2**Math.min(4,failures++));
  if(error instanceof ApiError){
   if(error.status===503){userMessage='Heart sharing is temporarily unavailable. The app will retry on its own.';wait=error.retryAfter>0?error.retryAfter:wait;}
   else if(error.status===401||error.status===403){userMessage='Your session expired. Please sign in again.';wait=0;}
   else if(error.status===429){userMessage='Heart sharing is busy. The app will retry shortly.';wait=error.retryAfter>0?error.retryAfter:wait;}
  }else if(!navigator.onLine){userMessage='You are offline. Heart sharing will reconnect automatically.';wait=Math.min(300,wait);}
  issue=userMessage;blockedUntil=Date.now()+wait*1000;
 }finally{if(current===epoch){loading=false;paintConnection();}}
}

async function diagnose(report=true){
 if(!userId)return;
 try{diagnostics=await api<Diagnostics>('/notifications/diagnostics');}
 catch(error){diagnostics=null;if(report)issue=error instanceof Error?error.message:'Could not check notifications.';}
 paintConnection();
}

export function startConnection(id:string,toast:(message:string)=>void,partner?:string){
 notify=toast;if(partner)configuredPartnerName=partner;if(userId===id){paintConnection();return;}stopConnection();if(partner)configuredPartnerName=partner;userId=id;blockedUntil=0;failures=0;void load();
 poll=setInterval(()=>{if(!document.hidden&&navigator.onLine&&Date.now()>=blockedUntil)void load();},15000);
 clock=setInterval(()=>{if(!document.hidden)paintConnection();},1000);

 // Setup Realtime presence tracking for simultaneous touch
 if(supabase){
  try{
   presenceChannel=supabase.channel('ivraine-touch-room');
   presenceChannel.on('presence',{event:'sync'},()=>{
    if(!presenceChannel)return;
    const presenceState=presenceChannel.presenceState();
    const activeKeys=Object.keys(presenceState);
    const otherPresent=activeKeys.some(k=>k!==userId);
    setSimultaneousPresence(otherPresent);
   });
   presenceChannel.subscribe(async(status)=>{
    if(status==='SUBSCRIBED'&&userId){
     await presenceChannel?.track({user:userId,at:Date.now()});
    }
   });
  }catch{ /* Presence is best-effort */ }
 }
}

export function stopConnection(){
 epoch++;configuredPartnerName='';userId=null;state=null;loading=false;sending=false;enabling=false;issue='';status='';diagnostics=null;localSubscribed=false;blockedUntil=0;failures=0;isSimultaneous=false;
 if(presenceChannel){presenceChannel.unsubscribe();presenceChannel=null;}
 clearInterval(poll);clearInterval(clock);
}

function keyBytes(value:string):Uint8Array{const clean=value.replace(/-/g,'+').replace(/_/g,'/');const padded=clean.padEnd(Math.ceil(clean.length/4)*4,'=');return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}

async function enableNotifications(){
 if(!state?.publicKey||!supported()||iosNeedsInstall())return;
 const current=epoch,owner=userId!,publicKey=state.publicKey;enabling=true;issue='';paintConnection();
 try{
  const permissionRequest=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
  if(await permissionRequest!=='granted')throw new Error('Notifications are not enabled. You can still send and receive hearts inside the app.');
  if(current!==epoch)return;
  await navigator.serviceWorker.register('/sw.js',{scope:'/'});
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Notification setup timed out. Reload the app and retry.')),15000);})]).finally(()=>clearTimeout(timeout));
  let subscription=await registration.pushManager.getSubscription();
  const boundKey=subscription?.options.applicationServerKey;const expected=new Uint8Array(keyBytes(publicKey));
  const wrongKey=boundKey&&(!new Uint8Array(boundKey).every((value,i)=>value===expected[i])||boundKey.byteLength!==expected.byteLength);
  if(current!==epoch)return;
  if(subscription&&((subscription.expirationTime!=null&&subscription.expirationTime<=Date.now())||localStorage.getItem('ivraine-push-owner')!==owner||wrongKey)){await subscription.unsubscribe();subscription=null;}
  if(current!==epoch)return;
  const applicationServerKey=new Uint8Array(expected.buffer,expected.byteOffset,expected.byteLength);
  subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
  if(current!==epoch){await subscription.unsubscribe();return;}
  await api('/notifications/subscriptions','POST',subscription.toJSON());
  if(current!==epoch)return;
  localStorage.setItem('ivraine-push-owner',owner);localSubscribed=true;status=partnerName()?`Notifications enabled. ${partnerName()} can now send you a heart.`:'Notifications enabled. You can now exchange hearts.';notify(status);
  void shareKeyWithWorker(publicKey);buzz([15,25,15]);await load();
 }catch(error){if(current===epoch){issue=error instanceof Error?error.message:'Could not enable notifications.';notify(issue);}}
 finally{if(current===epoch){enabling=false;paintConnection();}}
}

async function disableNotifications(all=false){const current=epoch;enabling=true;paintConnection();try{
 const subscription=await readLocalSubscription();
 if(all)await api('/notifications/devices','DELETE');else if(subscription)await api('/notifications/subscriptions','DELETE',{endpoint:subscription.endpoint});
 if(subscription&&localStorage.getItem('ivraine-push-owner')===userId)await subscription.unsubscribe();
 if(current!==epoch)return;localStorage.removeItem('ivraine-push-owner');localSubscribed=false;status=all?'All your notification devices were removed.':'Notifications are off on this device.';issue='';await load();
 }catch(error){if(current===epoch)issue=error instanceof Error?error.message:'Could not turn off notifications.';}finally{if(current===epoch){enabling=false;paintConnection();}}}

async function sendHeart(){
 if(!userId||!state?.enabled||sending)return;const current=epoch,storageKey=`ivraine-pending-heart:${userId}`;sending=true;issue='';status='';paintConnection();
 const requestId=sessionStorage.getItem(storageKey)||crypto.randomUUID();sessionStorage.setItem(storageKey,requestId);

 // Extract micro-message
 const activeChip=document.querySelector<HTMLButtonElement>('.quick-note-chip.active');
 const customInput=document.querySelector<HTMLInputElement>('#quick-note-input');
 let selectedNote=activeChip?.dataset.note||'Thinking of you';
 if(selectedNote==='custom') selectedNote=(customInput?.value||'').trim()||'Thinking of you';

 try{
  const result=await api<{eventId:string;queuedDevices:number;nextAllowedAt:string}>('/notifications/hearts','POST',{requestId,message:selectedNote});
  if(current!==epoch)return;sessionStorage.removeItem(storageKey);
  state.lastSent={nextAllowedAt:result.nextAllowedAt,accepted:0,pending:result.queuedDevices,failed:0};
  if(result.queuedDevices){
   status=`Heart saved for ${partnerName()||'your love'}. Push delivery is queued.`;
   if(isSimultaneous){
    notify(`✨ Simultaneous touch! Both of you are here together ♡`);
    celebrate(true);
   }else{
    notify(`A little love is on its way. “${selectedNote}” ♡`);
    celebrate(false);
   }
  }
  else{
   status=`Heart saved. ${partnerName()||'They'} have not enabled notifications on a phone yet, so nothing was pushed.`;
   notify(isSimultaneous?`✨ Radiant touch! Heart saved together ♡`:`Heart saved in your scrapbook: “${selectedNote}” ♡`);
   buzz(isSimultaneous?[30,50,30]:[15]);
   void diagnose(false);
  }
 }catch(error){if(current===epoch){issue=error instanceof Error?error.message:'Could not send your heart.';if(error instanceof ApiError&&error.status===429){sessionStorage.removeItem(storageKey);state.lastSent={nextAllowedAt:new Date(Date.now()+Math.max(1,error.retryAfter)*1000).toISOString(),accepted:0,pending:0,failed:0};}}}
 finally{if(current===epoch){sending=false;paintConnection();}}
}

async function saveResubscription(subscription:PushSubscriptionJSON){
 if(!userId)return;
 try{await api('/notifications/subscriptions','POST',subscription);localStorage.setItem('ivraine-push-owner',userId);status='Notifications reconnected on this device.';await load();}
 catch(error){issue=error instanceof Error?error.message:'Could not reconnect notifications.';paintConnection();}
}

document.addEventListener('click',event=>{
 const target=event.target as Element;
 const chip=target.closest<HTMLButtonElement>('.quick-note-chip');
 if(chip){
  document.querySelectorAll('.quick-note-chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active');
  const input=document.querySelector<HTMLInputElement>('#quick-note-input');
  if(input){
   const isCustom=chip.dataset.note==='custom';
   input.hidden=!isCustom;
   if(isCustom) input.focus();
  }
  return;
 }

 const button=target.closest<HTMLButtonElement>('[data-heart-action]');
 if(!button||button.disabled)return;
 switch(button.dataset.heartAction){
  case'install':void install();break;
  case'send':void sendHeart();break;
  case'enable':void enableNotifications();break;
  case'disable':void disableNotifications();break;
  case'all-off':if(confirm('Turn off notifications on all your devices? You can enable them again on each device.'))void disableNotifications(true);break;
  case'diagnose':void diagnose();break;
  case'retry':blockedUntil=0;failures=0;void load();break;
 }
});

window.addEventListener('online',()=>{blockedUntil=0;void load();});
navigator.serviceWorker?.addEventListener('message',event=>{const data=(event.data??{}) as PushMessage;
 if(data.type==='ivraine-heart'){void clearBadge();void load();}
 else if(data.type==='ivraine-resubscribed'&&data.subscription)void saveResubscription(data.subscription);
 else if(data.type==='ivraine-heart-back'){notify('Sending a heart back. ♡');void sendHeart();}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()>=blockedUntil)void load();});