import { api, ApiError } from './api';
interface Heart {id:string;senderId:string;senderName:string;createdAt:string;}
interface ConnectionState {enabled:boolean;pushEnabled:boolean;publicKey:string|null;received:Heart[];lastSent:{nextAllowedAt:string;accepted:number;pending:number;failed:number}|null;deviceCount:number;}
let state:ConnectionState|null=null,userId:string|null=null,epoch=0,loading=false,sending=false,enabling=false,localSubscribed=false;
let issue='',status='',poll:ReturnType<typeof setInterval>|undefined,clock:ReturnType<typeof setInterval>|undefined;
let notify:(s:string)=>void=()=>{};
export function connectionMarkup(){return `<section class="connection-card" aria-labelledby="connection-title"><div class="connection-copy"><span class="eyebrow">A LITTLE CLOSER</span><h2 id="connection-title">Same feeling.<br>Different places.</h2><p>One little heart to say <em>“I’m thinking of you.”</em></p><p class="heart-received" id="heart-received"></p><p class="heart-status" id="heart-status" role="status" aria-live="polite"></p></div><div class="heart-stage"><button class="heart-button" data-heart-action="send" aria-label="Send I miss you to my partner" disabled><span class="heart-orbit" aria-hidden="true"></span><svg class="heart-gem" viewBox="0 0 120 110" aria-hidden="true"><defs><linearGradient id="heart-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffcbdc"/><stop offset=".35" stop-color="#ed729b"/><stop offset=".72" stop-color="#b73165"/><stop offset="1" stop-color="#6c1745"/></linearGradient><linearGradient id="heart-shine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path class="heart-depth" d="M60 101 12 57C-16 28 24-10 60 23 95-10 136 28 108 57Z"/><path fill="url(#heart-face)" d="M60 95 12 51C-16 22 24-16 60 17 95-16 136 22 108 51Z"/><path fill="url(#heart-shine)" d="M16 39C9 19 35 6 51 22 33 14 20 26 16 39Z"/></svg><span class="heart-button-label" id="heart-button-label">I miss you</span></button><span class="heart-hint" id="heart-hint">Send a little love</span></div><div class="notification-row"><span id="push-device-status">Checking this device…</span><div><button class="notification-button" data-heart-action="enable">Enable notifications</button><button class="text-button" data-heart-action="disable" hidden>Turn off on this device</button><button class="text-button" data-heart-action="all-off" hidden>Remove all my devices</button><button class="text-button" data-heart-action="retry" hidden>Retry connection</button></div></div></section>`;}
function supported(){return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function iosNeedsInstall(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?!(matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone):false;}
function permission(){return 'Notification' in window?Notification.permission:'unsupported';}
export function paintConnection(){
 const root=document.querySelector('.connection-card');if(!root)return;
 const remaining=state?.lastSent?Math.max(0,Math.ceil((Date.parse(state.lastSent.nextAllowedAt)-Date.now())/1000)):0;
 const button=root.querySelector<HTMLButtonElement>('[data-heart-action=send]')!;button.disabled=!state?.enabled||sending||remaining>0;button.classList.toggle('is-sent',remaining>0);button.setAttribute('aria-busy',String(sending));
 root.querySelector('#heart-button-label')!.textContent=sending?'Sending…':remaining?'Heart sent':'I miss you';
 root.querySelector('#heart-hint')!.textContent=remaining?`Send again in ${remaining}s`:'Send a little love';
 const latest=state?.received[0];root.querySelector('#heart-received')!.textContent=latest?`${latest.senderName} sent you a heart · ${new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(latest.createdAt))}`:'Our little way to feel close.';
 const last=state?.lastSent;const delivery=last?.pending?'Saved. Push delivery is queued.':last?.accepted?'Saved. The push service accepted the notification.':last?.failed?'Saved in your scrapbook. Push could not be delivered.':'';
 root.querySelector('#heart-status')!.textContent=issue||status||delivery||(!state?'Connecting…':!state.enabled?'Heart sharing needs the notification database setup.':'Hearts stay in our scrapbook, even when notifications are off.');
 const device=root.querySelector('#push-device-status')!;
 device.textContent=iosNeedsInstall()?'On iPhone: add Ivraine to your Home Screen, then open it there.':!supported()?'This browser cannot receive Web Push. You can still exchange hearts here.':permission()==='denied'?'Notifications are blocked. Allow them in your browser or device settings.':!state?.pushEnabled?'Push notifications need server configuration.':localSubscribed?'Notifications enabled on this device.':'Enable notifications to receive hearts when the app is closed.';
 const enable=root.querySelector<HTMLButtonElement>('[data-heart-action=enable]')!;enable.hidden=localSubscribed;enable.disabled=enabling||!supported()||iosNeedsInstall()||permission()==='denied'||!state?.pushEnabled;enable.textContent=enabling?'Enabling…':'Enable notifications';
 const disable=root.querySelector<HTMLButtonElement>('[data-heart-action=disable]')!;disable.hidden=!localSubscribed;disable.disabled=enabling;
 root.querySelector<HTMLButtonElement>('[data-heart-action=all-off]')!.hidden=!(state?.deviceCount);
 root.querySelector<HTMLButtonElement>('[data-heart-action=retry]')!.hidden=!issue;
}
async function readLocalSubscription(){if(!supported())return null;return (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription()??null;}
async function load(){if(!userId||loading)return;loading=true;const current=epoch;
 try{const next=await api<ConnectionState>('/notifications/state');if(current!==epoch)return;
  const seen=state?.received[0]?.id;state=next;issue='';if(next.lastSent?.pending===0)status='';
  if(seen&&next.received[0]&&seen!==next.received[0].id)notify(`${next.received[0].senderName} misses you. ♡`);
  const sub=await readLocalSubscription();if(current!==epoch)return;localSubscribed=!!sub&&localStorage.getItem('ivraine-push-owner')===userId&&permission()==='granted';
  if(localSubscribed&&sub){const {active}=await api<{active:boolean}>('/notifications/subscriptions/check','POST',{endpoint:sub.endpoint});if(current!==epoch)return;localSubscribed=active;}
 }catch(error){if(current===epoch)issue=error instanceof Error?error.message:'Could not load heart sharing.';}finally{if(current===epoch){loading=false;paintConnection();}}
}
export function startConnection(id:string,toast:(message:string)=>void){notify=toast;if(userId===id){paintConnection();return;}stopConnection();userId=id;void load();poll=setInterval(()=>{if(!document.hidden&&navigator.onLine)void load();},15000);clock=setInterval(()=>{if(!document.hidden)paintConnection();},1000);}
export function stopConnection(){epoch++;userId=null;state=null;loading=false;sending=false;enabling=false;issue='';status='';localSubscribed=false;clearInterval(poll);clearInterval(clock);}
function keyBytes(value:string):ArrayBuffer{const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));return bytes.buffer;}
async function enableNotifications(){
 if(!state?.publicKey||!supported()||iosNeedsInstall())return;
 const current=epoch,owner=userId!,publicKey=state.publicKey;enabling=true;issue='';paintConnection();
 // Request synchronously from the tap handler, before fetching/registering anything.
 const permissionRequest=Notification.requestPermission();
 try{
  if(await permissionRequest!=='granted')throw new Error('Notifications are not enabled. You can still send and receive hearts inside the app.');
  if(current!==epoch)return;
  await navigator.serviceWorker.register('/sw.js',{scope:'/'});
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Notification setup timed out. Reload the app and retry.')),15000);})]).finally(()=>clearTimeout(timeout));
  let subscription=await registration.pushManager.getSubscription();
  const boundKey=subscription?.options.applicationServerKey;const expected=new Uint8Array(keyBytes(publicKey));
  const wrongKey=boundKey&&(!new Uint8Array(boundKey).every((value,i)=>value===expected[i])||boundKey.byteLength!==expected.byteLength);
  if(subscription&&(localStorage.getItem('ivraine-push-owner')!==owner||wrongKey)){await subscription.unsubscribe();subscription=null;}
  subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:expected.buffer});
  if(current!==epoch){await subscription.unsubscribe();return;}
  await api('/notifications/subscriptions','POST',subscription.toJSON());
  if(current!==epoch)return;
  localStorage.setItem('ivraine-push-owner',owner);localSubscribed=true;status='Notifications enabled. Your partner can now send you a heart.';notify(status);await load();
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
 try{
  const result=await api<{eventId:string;queuedDevices:number;nextAllowedAt:string}>('/notifications/hearts','POST',{requestId});
  if(current!==epoch)return;sessionStorage.removeItem(storageKey);
  state.lastSent={nextAllowedAt:result.nextAllowedAt,accepted:0,pending:result.queuedDevices,failed:0};
  status=result.queuedDevices?'Heart saved. A notification is queued for your partner.':'Heart saved. Your partner can see it in the app; their device has no active push subscription.';
  notify(result.queuedDevices?'A little love is on its way. ♡':'Heart saved in your scrapbook. ♡');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)navigator.vibrate?.([20,30,20]);
 }catch(error){if(current===epoch){issue=error instanceof Error?error.message:'Could not send your heart.';if(error instanceof ApiError&&error.status===429){sessionStorage.removeItem(storageKey);state.lastSent={nextAllowedAt:new Date(Date.now()+Math.max(1,error.retryAfter)*1000).toISOString(),accepted:0,pending:0,failed:0};}}}
 finally{if(current===epoch){sending=false;paintConnection();}}
}
document.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('[data-heart-action]');if(!button||button.disabled)return;switch(button.dataset.heartAction){case'send':void sendHeart();break;case'enable':void enableNotifications();break;case'disable':void disableNotifications();break;case'all-off':if(confirm('Turn off notifications on all your devices? You can enable them again on each device.'))void disableNotifications(true);break;case'retry':void load();break;}});
window.addEventListener('online',()=>void load());
navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='ivraine-heart')void load();});
