import './styles.css';
import './connection.css';
import './glass.css';
import 'leaflet/dist/leaflet.css';
import { startConnection, stopConnection, paintConnection } from './connection';
import { api, configured, supabase } from './api';
import type { Entry, BookResponse, Kind } from './types';
import { login, shell, renderPage, renderItems, pageKind, type Page, type Filters, navigation } from './views';
import { dialog, editor, sheet } from './dialogs';
import { escapeHtml as h, download, today, dateLabel, countdownLabel, secondsUntil, partnerDisplayName, presenceLabel, isRecentlyActive, parseLetterMeta, formatLetterMeta, triggerConfetti } from './utils';
import { unlockLegacy, importLegacy } from './legacy';
import { install, registerPwa } from './pwa';
import { monthEvents, nextEvent } from './calendar';
import { compressImages } from './imageUtils';
import { renderMemoryMap, cleanupMemoryMap } from './map';
import { uploadVoiceNote, renderVoicePlayer, initVoicePlayers } from './voiceUtils';

const app=document.querySelector<HTMLDivElement>('#app')!;
let info:BookResponse|null=null, entries:Entry[]=[], generation=0, refreshing=false, signingOut=false, toastTimer:ReturnType<typeof setTimeout>;
let filters:Filters={query:'',chapter:'',period:'',favorites:false,viewMode:'grid'};
let month=new Date(`${today().slice(0,7)}-01T00:00:00Z`);
let selectedDate=today();

function buzz(pattern:number[]){try{navigator.vibrate?.(pattern);}catch{}}

function currentTheme(): 'light'|'dark' {
  const saved = localStorage.getItem('ivraine-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}
function applyTheme(theme:'light'|'dark'){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;const themeColor=theme==='dark'?'#17141D':'#F6F3F8';document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m=>m.content=themeColor);try{localStorage.setItem('ivraine-theme',theme);}catch{};const button=document.querySelector<HTMLButtonElement>('[data-action="theme"]');if(button){const nextTheme=theme==='dark'?'light':'dark';button.textContent=theme==='dark'?'☀':'☾';button.setAttribute('aria-label',`Switch to ${nextTheme} mode`);button.setAttribute('title',`Switch to ${nextTheme} mode`);}}
applyTheme(currentTheme());

function page():Page{return navigation.some(n=>n[0]===location.hash.slice(1))?location.hash.slice(1) as Page:'story';}
function toast(message:string){const el=document.querySelector('#toast')!;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),6500);}
function message(error:unknown){return error instanceof Error?error.message:'Something went wrong. Please try again.';}

function updatePresenceStatus(){
 const youNodes=document.querySelectorAll<HTMLElement>('[data-presence="you"]');
 const partnerNodes=document.querySelectorAll<HTMLElement>('[data-presence="partner"]');
 const currentInfo=info;
 if(!currentInfo)return;
 const youName=currentInfo.member.display_name || 'You';
 const partnerName=partnerDisplayName(currentInfo);
 const partnerActive=currentInfo.partner?.last_active_at;
 const youActive=currentInfo.member?.last_active_at;
 youNodes.forEach((you)=>{
  const label=presenceLabel(youName,youActive,true);
  you.textContent=youName;you.classList.toggle('is-live',isRecentlyActive(youActive));
  you.setAttribute('title',label);
 });
 partnerNodes.forEach((partnerEl)=>{
  if(!partnerName){partnerEl.hidden=true;return;}
  partnerEl.hidden=false;
  const live=isRecentlyActive(partnerActive);
  const label=presenceLabel(partnerName,partnerActive);
  partnerEl.textContent=partnerName;partnerEl.classList.toggle('is-live',live);
  partnerEl.setAttribute('title',label);
 });
}

let lastHeartbeat=0;
async function heartbeat(){
 if(!info||!navigator.onLine)return;
 const now=Date.now();if(now-lastHeartbeat<90000)return;
 lastHeartbeat=now;
 try{const r=await api<{last_active_at:string}>('/active','POST');if(info&&r.last_active_at)info.member.last_active_at=r.last_active_at;}
 catch{ /* Heartbeat is best-effort. */ }
}
for(const ev of['click','keydown','touchstart'])document.addEventListener(ev,()=>void heartbeat(),{passive:true,capture:true});

async function refreshPresence(){if(!info||!navigator.onLine)return;try{const book=await api<BookResponse>('/book');if(!info)return;info.member=book.member;info.partner=book.partner;updatePresenceStatus();}catch{ /* Presence is best-effort and should not block the rest of the app. */ }}

function updateLiveCountdowns(){
 document.querySelectorAll<HTMLElement>('[data-live-countdown]').forEach(el=>{
  const value=el.dataset.liveCountdown;if(!value)return;
  const total=secondsUntil(value,new Date());
  el.textContent=total<=0?'Today':countdownLabel(value,new Date());
 });

 document.querySelectorAll<HTMLElement>('.countdown-timer-display').forEach(el=>{
  const target=el.dataset.countdownTarget;if(!target)return;
  const total=secondsUntil(target,new Date());
  if(total<=0){
   const d=el.querySelector('#hero-cd-days');if(d)d.textContent='00';
   const h=el.querySelector('#hero-cd-hours');if(h)h.textContent='00';
   const m=el.querySelector('#hero-cd-mins');if(m)m.textContent='00';
   const s=el.querySelector('#hero-cd-secs');if(s)s.textContent='00';
   return;
  }
  const days=Math.floor(total/86400);
  const hours=Math.floor((total%86400)/3600);
  const mins=Math.floor((total%3600)/60);
  const secs=total%60;
  const d=el.querySelector('#hero-cd-days');if(d)d.textContent=String(days).padStart(2,'0');
  const h=el.querySelector('#hero-cd-hours');if(h)h.textContent=String(hours).padStart(2,'0');
  const m=el.querySelector('#hero-cd-mins');if(m)m.textContent=String(mins).padStart(2,'0');
  const s=el.querySelector('#hero-cd-secs');if(s)s.textContent=String(secs).padStart(2,'0');
 });
}

function render(whole=false){
 if(!info)return;
 if(whole)app.innerHTML=shell(info,page());
 const target=document.querySelector('#content');
 if(target)target.innerHTML=renderPage(page(),info,entries,filters,month,selectedDate);
 updateLiveCountdowns();
 updatePresenceStatus();
 paintConnection();
 attachSentinel();
 initVoicePlayers(target as HTMLElement || app);

 if(page()==='gallery'&&filters.viewMode==='map'){
  const mapContainer=document.querySelector<HTMLElement>('#memory-map');
  if(mapContainer){
   renderMemoryMap(mapContainer,entries,showViewer);
  }
 }else{
  cleanupMemoryMap();
 }
}

let nextOffset:number|null=null,loadingMore=false;
async function fetchEntries(offset=0){const r:{entries:Entry[];nextOffset:number|null}=await api(`/entries?offset=${offset}`);return r;}

async function refresh(quiet=false){if(!info||refreshing)return;refreshing=true;const gen=generation;try{const r=await fetchEntries(0);if(gen!==generation)return;entries=r.entries;nextOffset=r.nextOffset;render();if(!quiet)toast('All caught up.');}catch(error){if(gen===generation)toast(message(error));}finally{refreshing=false;}}

async function loadMore(){if(!info||loadingMore||nextOffset===null||!navigator.onLine)return;loadingMore=true;const gen=generation;try{const r=await fetchEntries(nextOffset);if(gen!==generation)return;entries.push(...r.entries);nextOffset=r.nextOffset;const target=document.querySelector('#page-items');if(target&&info)target.innerHTML=renderItems(page(),info,entries,filters,month,selectedDate);attachSentinel();}catch{ /* best-effort */ }finally{loadingMore=false;}}

function attachSentinel(){const existing=document.querySelector('#scroll-sentinel');if(existing)existing.remove();if(nextOffset===null)return;const sentinel=document.createElement('div');sentinel.id='scroll-sentinel';sentinel.style.cssText='height:1px;margin-top:40px;';const target=document.querySelector('#page-items');if(!target)return;target.after(sentinel);const io=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting){io.disconnect();sentinel.remove();void loadMore();}},{rootMargin:'200px'});io.observe(sentinel);}

async function boot(){const gen=++generation;
 if(!location.search.includes('space')&&!location.hash.includes('space')){location.replace('/legacy/index.html');return;}
 if(!supabase){app.innerHTML=login(false);return;}
 const {data:{session}}=await supabase.auth.getSession();if(gen!==generation)return;
 if(!session){info=null;entries=[];app.innerHTML=login(configured);return;}
 app.innerHTML='<p class="loading">Opening our little world…</p>';
 try{const [book,firstPage]=await Promise.all([api<BookResponse>('/book'),fetchEntries(0)]);if(gen!==generation)return;info=book;entries=firstPage.entries;nextOffset=firstPage.nextOffset;render(true);attachSentinel();void refreshPresence();void heartbeat();startConnection(info.userId,toast,partnerDisplayName(info));}
 catch(error){if(gen!==generation)return;info=null;entries=[];app.innerHTML=`<main class="error-page"><span class="brand">ivraine ♡</span><h1>Let’s get you back in.</h1><p>${h(message(error))}</p><button class="primary" data-action="retry">Try again</button><button class="text-button" data-action="logout">Sign out</button></main>`;}
}

function passwordDialog(){const el=dialog('A fresh start.','<form id="password-form"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><p>Use at least 12 characters.</p><p id="password-status" role="status"></p><button class="primary" type="submit">Update password</button></form>');el.querySelector('form')!.addEventListener('submit',async event=>{event.preventDefault();const button=el.querySelector<HTMLButtonElement>('[type="submit"]')!;button.disabled=true;const value=new FormData(event.target as HTMLFormElement).get('password') as string;const {error}=await supabase!.auth.updateUser({password:value});if(error){el.querySelector('#password-status')!.textContent=error.message;button.disabled=false;}else{el.close();toast('Password updated.');void boot();}});}

async function saveEntry(el:HTMLDialogElement,kind:Kind,existing?:Entry,convert=false,getAddedFiles?:()=>File[],getRemovedPaths?:()=>string[],getRecordedAudio?:()=>Blob|null,isVoiceRemoved?:()=>boolean){
 const form=el.querySelector<HTMLFormElement>('#entry-form')!;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(form.dataset.busy)return;form.dataset.busy='true';const button=form.querySelector<HTMLButtonElement>('[type="submit"]')!;button.disabled=true;const status=form.querySelector('#form-status')!;
  const close=el.querySelector<HTMLButtonElement>('.close-button')!;close.disabled=true;const blockClose=(event:Event)=>event.preventDefault();el.addEventListener('cancel',blockClose);
  const data=new FormData(form);const uploaded:string[]=[];
  const edit=!!existing&&!convert;let saved=false;
  try{
   if(!navigator.onLine)throw new Error('Reconnect to save this safely. Your draft is still here.');
   const rawFiles:File[]=edit&&getAddedFiles?getAddedFiles():(data.getAll('photos') as File[]).filter(f=>f.size>0);
   if(rawFiles.some(f=>f.size>104857600))throw new Error('One or more files exceeds the 100 MB limit.');
   const removedPs:string[]=edit&&getRemovedPaths?getRemovedPaths():[];
   const existingKept=(existing?.photo_paths??[]).filter(p=>!removedPs.includes(p));
   if(rawFiles.length+existingKept.length>12)throw new Error('Choose up to 12 photos total.');
   let blobs:Blob[]=[];
   if(rawFiles.length){
    status.textContent='Compressing photos…';
    blobs=await compressImages(rawFiles);
   }
   for(const [i,blob] of blobs.entries()){
    status.textContent=`Uploading photo ${i+1} of ${blobs.length}…`;
    const webpBlob=new Blob([blob],{type:'image/webp'});
    uploaded.push((await api<{path:string}>('/photos','POST',webpBlob)).path);
   }

   let finalVoiceUrl=existing?.voice_url||'';
   if(isVoiceRemoved?.()){
    finalVoiceUrl='';
   }
   const recordedBlob=getRecordedAudio?.();
   if(recordedBlob&&info){
    status.textContent='Uploading voice memo…';
    try{
     finalVoiceUrl=await uploadVoiceNote(recordedBlob,info.book.id,info.userId);
    }catch(err){
     throw new Error(`Could not upload voice memo: ${err instanceof Error?err.message:'Upload failed'}`);
    }
   }

   status.textContent='Saving your little moment…';

   let locVal=(data.get('location') as string||'').trim();
   if(kind==='note'){
    const lockUntil=(data.get('lock_until') as string||'').trim();
    const existingMeta=parseLetterMeta(existing?.location);
    locVal=formatLetterMeta({...existingMeta,lockUntil:lockUntil||undefined});
   }else if(convert&&existing&&existing.kind==='plan'){
    locVal=locVal?`${locVal} (from dream)`:`dream:${existing.id}`;
   }

   const body={
    title:data.get('title'),
    body:data.get('body')||'',
    event_date:data.get('event_date'),
    location:locVal,
    chapter:data.get('chapter')||existing?.chapter||'Our story',
    recurrence:data.get('recurrence')||existing?.recurrence||'none',
    artist:data.get('artist')||'',
    song_url:data.get('song_url')||'',
    voice_url:finalVoiceUrl
   };

   if(edit){
    const newPhotoPaths=[...existingKept,...uploaded];
    await api(`/entries/${existing.id}`,'PATCH',{...body,photo_paths:newPhotoPaths,updated_at:existing.updated_at});
    for(const path of removedPs)await api('/photos','DELETE',{path}).catch(()=>undefined);
   }else{
    await api('/entries','POST',{...body,id:crypto.randomUUID(),kind,photo_paths:uploaded});
   }
   saved=true;el.close();await refresh(true);toast(edit?'Changes saved.':'A little moment, kept forever.');
  }catch(error){if(!saved)for(const path of uploaded)await api('/photos','DELETE',{path}).catch(()=>undefined);status.textContent=message(error);}
  finally{button.disabled=false;close.disabled=false;el.removeEventListener('cancel',blockClose);delete form.dataset.busy;}
 });
}

function openEditor(kind:Kind,existing?:Entry,convert=false,date?:string){const {el,getAddedFiles,getRemovedPaths,getRecordedAudio,isVoiceRemoved}=editor(kind,existing,convert,date);void saveEntry(el,kind,existing,convert,getAddedFiles,getRemovedPaths,getRecordedAudio,isVoiceRemoved);}

function showLetter(entry:Entry){
 const myName=(info?.member.display_name||'Ivan').trim();
 const pName=partnerDisplayName(info)||'Loraine';
 const author=entry.author_id===info?.userId?myName:pName;
 const recipient=entry.author_id===info?.userId?pName:myName;
 const meta=parseLetterMeta(entry.location);
 const isLocked=!entry.completed&&!!meta.lockUntil&&meta.lockUntil>today();

 if(isLocked){
  buzz([50]);
  dialog(`🔒 Sealed with love`,`
   <div class="letter-reading">
    <span class="letter-badge">From ${h(author)} for ${h(recipient)}</span>
    <h3 style="margin:16px 0 12px;font-family:Georgia,serif;">Open when ${h(entry.title.replace(/^open when\s*/i,''))}</h3>
    <p style="font-size:14px;color:#8a4f64;line-height:1.6;margin:16px 0;">
     🔒 This letter is sealed with love until <strong>${h(dateLabel(meta.lockUntil!))}</strong> (${countdownLabel(meta.lockUntil!)}).
    </p>
    <p class="field-help">No peeking early! Keep this little surprise safe until the special day arrives. ♡</p>
   </div>
  `,'reading-dialog');
  return;
 }

 const openedStamp=entry.completed
  ?`<div class="opened-stamp-badge">
     <span>♡ WAX SEAL OPENED</span>
     <p style="margin:4px 0 0;font-size:11px;">Opened by ${h(meta.openedBy||recipient)} on ${h(dateLabel(meta.openedAt||entry.updated_at.slice(0,10)))} ♡</p>
    </div>`
  :'';

 const unsealAnimationHtml=!entry.completed?`
  <div class="wax-unseal-stage" id="unseal-stage">
   <div class="wax-envelope-wrap" id="wax-envelope-wrap">
    <div class="wax-envelope-flap" id="wax-flap"></div>
    <button type="button" class="interactive-wax-seal" id="crack-wax-btn" aria-label="Tap to crack seal and open letter">
     <span class="seal-heart">♥</span>
     <span class="seal-tap-label">TAP TO UNSEAL</span>
    </button>
   </div>
   <p class="wax-prompt" id="wax-prompt">Tap the wax seal to crack it open ♡</p>
  </div>
 `:'';

 const el=dialog(`Open when ${entry.title.replace(/^open when\s*/i,'')}`,`
  <div class="letter-reading">
   <span class="letter-badge">From ${h(author)} for ${h(recipient)}</span>
   ${unsealAnimationHtml}
   <div class="letter-content-body" id="letter-content-body">
    <p class="preserve">${h(entry.body)}</p>
    ${entry.voice_url?renderVoicePlayer(entry.voice_url,entry.title,'letter-voice-player'):''}
    <span class="letter-signoff">With love, always. ♡</span>
    <p class="metadata">${h(dateLabel(entry.event_date))}</p>
    ${openedStamp}
   </div>
  </div>
 `,'reading-dialog');

 initVoicePlayers(el);

 const crackBtn=el.querySelector<HTMLButtonElement>('#crack-wax-btn');
 if(crackBtn&&!entry.completed){
  crackBtn.addEventListener('click',async()=>{
   crackBtn.disabled=true;
   buzz([25,45,60,25]);
   crackBtn.classList.add('is-cracked');
   const wrap=el.querySelector('#wax-envelope-wrap');
   if(wrap)wrap.classList.add('is-unsealed');
   const prompt=el.querySelector('#wax-prompt');
   if(prompt)prompt.textContent='✨ Seal cracked with love!';

   try{
    const updatedMeta={...meta,openedBy:info?.member.display_name||myName,openedAt:today()};
    const loc=formatLetterMeta(updatedMeta);
    await api(`/entries/${entry.id}`,'PATCH',{
     completed:true,
     location:loc,
     updated_at:entry.updated_at
    });
    entry.completed=true;
    entry.location=loc;
    toast('Letter unsealed. Kept forever in your private space. ♡');
    void refresh(true);
   }catch{ /* best-effort save */ }
  });
 }
}

function showViewer(entry:Entry){
 let index=0;const photos=entry.photo_urls.filter((u):u is string=>!!u);
 if(!photos.length){toast('The photo link expired or the file is missing. Refresh and try again.');return;}

 const el=dialog(entry.title,`<div class="lightbox">
  <div class="lightbox-stage"><img alt="${h(entry.title)}" id="viewer-img"></div>
  <div class="viewer-controls">
   <button id="previous-photo" aria-label="Previous photo">←</button>
   <span id="photo-number"></span>
   <button id="next-photo" aria-label="Next photo">→</button>
   <button id="zoom-out-photo" aria-label="Zoom out">−</button>
   <button id="zoom-reset-photo" aria-label="Reset zoom">1:1</button>
   <button id="zoom-in-photo" aria-label="Zoom in">+</button>
   <button id="fullscreen-photo" aria-label="Enter fullscreen">⛶ Full screen</button>
  </div>
  <p class="preserve">${h(entry.body)}</p>
  <p class="metadata">${h(entry.chapter)} · ${h(dateLabel(entry.event_date))}${entry.location?' · ⌖ '+h(entry.location):''}</p>
 </div>`,'viewer');

 let scale=1,panX=0,panY=0,lastTap=0;
 const img=el.querySelector<HTMLImageElement>('#viewer-img')!;

 const applyZoom=()=>{
  img.style.transform=`translate(${panX}px, ${panY}px) scale(${scale})`;
  img.style.transition=scale===1?'transform 0.25s ease':'none';
 };
 const resetZoom=()=>{
  scale=1;panX=0;panY=0;applyZoom();
 };

 let renewed=false;
 async function renewPhotoUrls(){if(renewed)return;renewed=true;try{const rows=await api<{entries:typeof entries}>(`/entries?offset=0`);const fresh=rows.entries?.find(r=>r.id===entry.id);if(fresh?.photo_urls)photos.splice(0,photos.length,...fresh.photo_urls.filter((u):u is string=>!!u));draw();}catch{toast('Could not renew photo links. Refresh the page.');}}
 const draw=()=>{
  resetZoom();
  img.src=photos[index];
  img.onerror=()=>void renewPhotoUrls();
  el.querySelector('#photo-number')!.textContent=`${index+1} / ${photos.length}`;
 };
 draw();

 const step=(dir:number)=>{index=(index+dir+photos.length)%photos.length;draw();};
 el.querySelector('#previous-photo')!.addEventListener('click',()=>step(-1));
 el.querySelector('#next-photo')!.addEventListener('click',()=>step(1));
 el.querySelector('#zoom-in-photo')!.addEventListener('click',()=>{scale=Math.min(4,scale+0.5);applyZoom();});
 el.querySelector('#zoom-out-photo')!.addEventListener('click',()=>{scale=Math.max(1,scale-0.5);if(scale===1){panX=0;panY=0;}applyZoom();});
 el.querySelector('#zoom-reset-photo')!.addEventListener('click',resetZoom);

 el.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')step(-1);if(event.key==='ArrowRight')step(1);});
 el.querySelector('#fullscreen-photo')!.addEventListener('click',async()=>{if(!el.requestFullscreen){toast('This browser uses the full-window photo viewer.');return;}try{if(document.fullscreenElement)await document.exitFullscreen();else await el.requestFullscreen();}catch{toast('Fullscreen is not available in this browser.');}});

 // Mobile double-tap zoom
 img.addEventListener('touchend',e=>{
  const now=Date.now();
  if(now-lastTap<300){
   e.preventDefault();
   if(scale>1)resetZoom();
   else{scale=2.5;panX=0;panY=0;buzz([20]);applyZoom();}
  }
  lastTap=now;
 });

 // Touch pinch-to-zoom & panning
 let touchX=0,initialPinchDist=0,initialScale=1;
 el.addEventListener('touchstart',e=>{
  if(e.touches.length===2){
   initialPinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
   initialScale=scale;
  }else if(e.touches.length===1){
   touchX=e.touches[0].clientX;
  }
 },{passive:true});

 el.addEventListener('touchmove',e=>{
  if(e.touches.length===2&&initialPinchDist>0){
   const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
   scale=Math.min(4,Math.max(1,initialScale*(dist/initialPinchDist)));
   applyZoom();
  }
 },{passive:true});

 el.addEventListener('touchend',e=>{
  if(e.touches.length===0&&scale===1){
   const delta=e.changedTouches[0].clientX-touchX;
   if(Math.abs(delta)>60)step(delta<0?1:-1);
  }
 },{passive:true});
}

function settings(){const {el,close}=sheet('Our private space.',`<p>Signed in as <strong>${h(info?.member.display_name)}</strong>. Only the two accounts added to this private space can access its content.</p><div class="settings-actions"><button class="secondary" id="install">Add to Home Screen</button><button class="secondary" id="export">Export our stories (JSON)</button><button class="secondary" id="password">Change password</button><a class="secondary" href="/legacy/index.html">Open original scrapbook ↗</a></div><hr><h3>Bring our old photos along.</h3><p>Unlock the original with its existing 8-digit passcode. Photos are imported into this private space; the original stories and layout remain available in the original version.</p><form id="import-form"><label>Original passcode<input type="password" name="passcode" inputmode="numeric" minlength="8" maxlength="8" required autocomplete="off"></label><p class="field-help">The passcode is used in this browser and is never sent to the backend. Imported photo dates need to be reviewed.</p><p id="import-status" role="status"></p><button class="primary" type="submit">Import original photos</button></form>`);
 el.querySelector('#install')!.addEventListener('click',()=>{close();void install();});
 el.querySelector('#password')!.addEventListener('click',()=>{close();passwordDialog();});
 el.querySelector('#export')!.addEventListener('click',()=>{download(`ivraine-stories-${today()}.json`,new Blob([JSON.stringify({version:2,exported_at:new Date().toISOString(),book:info?.book,entries:entries.map(({photo_urls,...e})=>e),note:'Photo files are stored separately. This is a stories export; keep a separate Supabase Storage backup.'},null,2)],{type:'application/json'}));toast('Stories exported. Photo files need a separate storage backup.');});
 el.querySelector('form')!.addEventListener('submit',async event=>{event.preventDefault();const form=event.target as HTMLFormElement;const button=form.querySelector<HTMLButtonElement>('button')!;const status=el.querySelector('#import-status')!;button.disabled=true;const blockClose=(e:Event)=>e.preventDefault();el.addEventListener('cancel',blockClose);
 try{status.textContent='Unlocking the original locally…';const passcode=(form.elements.namedItem('passcode') as HTMLInputElement).value;const payload=await unlockLegacy(passcode);form.reset();const count=await importLegacy(payload,new Set(entries.map(e=>e.id)),s=>{status.textContent=s;});status.textContent=`Imported ${count} photos. Already imported photos were skipped. Review their dates in Our Story.`;await refresh(true);}catch(error){status.textContent=message(error);await refresh(true);}finally{button.disabled=false;el.removeEventListener('cancel',blockClose);}});
}

document.addEventListener('submit',async event=>{const form=event.target as HTMLFormElement;if(form.id!=='login-form')return;event.preventDefault();const button=form.querySelector<HTMLButtonElement>('[type="submit"]')!;button.disabled=true;const data=new FormData(form);try{const {error}=await supabase!.auth.signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});if(error)throw error;await boot();}catch(error){form.querySelector('#auth-status')!.textContent=message(error);button.disabled=false;}});

document.addEventListener('click',async event=>{
 const button=(event.target as Element).closest<HTMLElement>('[data-action]');if(!button)return;const action=button.dataset.action;const entry=entries.find(e=>e.id===button.dataset.id);
 if(button instanceof HTMLButtonElement&&button.disabled)return;
 try{
 switch(action){
 case'retry':await boot();break;
 case'theme':{const nextTheme=currentTheme()==='dark'?'light':'dark';applyTheme(nextTheme);break;}
 case'logout':{stopConnection();generation++;signingOut=true;info=null;entries=[];document.querySelectorAll('dialog').forEach(d=>d.close());app.innerHTML='<p class="loading">Locking our little space…</p>';try{const {error}=await supabase!.auth.signOut({scope:'local'});if(error)toast('Locked on this device. Remote sign-out could not be confirmed.');}finally{localStorage.removeItem('ivraine-auth-v2');localStorage.removeItem('ivraine-auth-v2-code-verifier');sessionStorage.removeItem('ivraine-auth-v2');sessionStorage.removeItem('ivraine-auth-v2-code-verifier');signingOut=false;app.innerHTML=login(configured);}break;}
 case'reset':{const email=(document.querySelector<HTMLInputElement>('[name="email"]')?.value||'').trim();if(!email){toast('Enter your email above first.');return;}const {error}=await supabase!.auth.resetPasswordForEmail(email,{redirectTo:location.origin});if(error)throw error;toast('If this account exists, a password reset link is on its way.');break;}
 case'add':openEditor(pageKind[page()]);break;
 case'edit':if(entry)openEditor(entry.kind,entry);break;
 case'convert':if(entry)openEditor('memory',entry,true);break;
 case'letter':if(entry)showLetter(entry);break;
 case'view':if(entry)showViewer(entry);break;
 case'settings':settings();break;
 case'refresh':await refresh();break;
 case'filter-favorites':filters.favorites=!filters.favorites;render();break;
 case'clear-filters':filters={query:'',chapter:'',period:'',favorites:false,viewMode:'grid'};render();break;
 case'gallery-view':{const mode=button.dataset.mode as 'grid'|'map';filters.viewMode=mode;render();break;}
 case'pin-countdown':{
  if(button.dataset.id){
   localStorage.setItem('ivraine-pinned-countdown',button.dataset.id);
   toast('Pinned countdown updated! ✈');
   render();
  }
  break;
 }
 case'pick-countdown':{
  const upcoming=entries.filter(e=>(e.kind==='date'||(e.kind==='plan'&&!e.completed))&&e.event_date>=today()).sort((a,b)=>a.event_date.localeCompare(b.event_date));
  const el=dialog('Choose countdown to pin',`
   <div style="display:grid;gap:10px;">
    ${upcoming.map(u=>`<button type="button" class="secondary" style="justify-content:space-between;width:100%;" data-select-pinned="${u.id}"><span>${h(u.title)}</span><small>${h(dateLabel(u.event_date))}</small></button>`).join('')}
   </div>
  `);
  el.querySelectorAll<HTMLButtonElement>('[data-select-pinned]').forEach(btn=>{
   btn.onclick=()=>{
    localStorage.setItem('ivraine-pinned-countdown',btn.dataset.selectPinned!);
    el.close();
    toast('Pinned countdown changed! ✈');
    render();
   };
  });
  break;
 }
 case'set-theme-song':{
  if(!entry)return;
  // Clear any existing theme songs and set this one
  const prevTheme=entries.find(e=>e.kind==='song'&&e.location==='theme-song'&&e.id!==entry.id);
  if(prevTheme){
   await api(`/entries/${prevTheme.id}`,'PATCH',{location:'',updated_at:prevTheme.updated_at});
   prevTheme.location='';
  }
  const nextLoc=entry.location==='theme-song'?'':'theme-song';
  await api(`/entries/${entry.id}`,'PATCH',{location:nextLoc,updated_at:entry.updated_at});
  entry.location=nextLoc;
  toast(nextLoc?`“${entry.title}” is your Couple Theme Song of the Month! ♫`:'Theme song unset.');
  render();
  break;
 }
 case'prev-month':month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()-1,1));selectedDate=`${month.getUTCFullYear()}-${String(month.getUTCMonth()+1).padStart(2,'0')}-01`;render();break;
 case'next-month':month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,1));selectedDate=`${month.getUTCFullYear()}-${String(month.getUTCMonth()+1).padStart(2,'0')}-01`;render();break;
 case'this-month':month=new Date(`${today().slice(0,7)}-01T00:00:00Z`);selectedDate=today();render();break;
 case'day':{const date=button.dataset.date!;selectedDate=date;render();const daily=monthEvents(info!.book,entries,month.getUTCFullYear(),month.getUTCMonth()).filter(e=>e.date===date);const el=dialog(dateLabel(date),`${daily.length?`<ul>${daily.map(e=>`<li>${h(e.title)}</li>`).join('')}</ul>`:'<p>A lovely day for a new plan.</p>'}<button class="primary" id="add-on-day">Add a date</button>`);el.querySelector('#add-on-day')!.addEventListener('click',()=>{el.close();openEditor('date',undefined,false,date);});break;}
 case'favorite':{
  if(!entry)return;
  if(button instanceof HTMLButtonElement)button.disabled=true;
  await api(`/entries/${entry.id}`,'PATCH',{favorite:!entry.favorite,updated_at:entry.updated_at});
  await refresh(true);
  break;
 }
 case'complete':{
  if(!entry)return;
  if(button instanceof HTMLButtonElement)button.disabled=true;
  const nextCompleted=!entry.completed;
  if(nextCompleted){
   triggerConfetti();
   toast(`“${entry.title}” checked off together! ✨ We did it!`);
  }
  await api(`/entries/${entry.id}`,'PATCH',{completed:nextCompleted,updated_at:entry.updated_at});
  await refresh(true);
  break;
 }
 case'delete':{if(!entry)return;const el=dialog('Delete this little moment?',`<p>“${h(entry.title)}” and its attached photos will be removed for both of you.</p><button class="danger-button" id="confirm-delete">Delete permanently</button><p id="delete-status" role="status"></p>`);el.querySelector('#confirm-delete')!.addEventListener('click',async event=>{const target=event.target as HTMLButtonElement;target.disabled=true;try{const result=await api<{warning?:string}>(`/entries/${entry.id}`,'DELETE');el.close();await refresh(true);toast(result.warning||'Entry deleted.');}catch(error){el.querySelector('#delete-status')!.textContent=message(error);target.disabled=false;}});break;}
 }
 }catch(error){toast(message(error));if(button instanceof HTMLButtonElement)button.disabled=false;}
});

let searchTimer:ReturnType<typeof setTimeout>;
document.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.id==='search'){filters.query=input.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const target=document.querySelector('#page-items');if(target&&info)target.innerHTML=renderItems(page(),info,entries,filters,month,selectedDate);},220);}});
document.addEventListener('change',event=>{
 const input=event.target as HTMLSelectElement;
 if(input.id==='chapter-filter'){filters.chapter=input.value;render();}
 else if(input.id==='date-filter'){filters.period=input.value;render();}
});
window.addEventListener('hashchange',()=>{filters={query:'',chapter:'',period:'',favorites:false,viewMode:'grid'};if(info){render(true);window.scrollTo({top:0,behavior:'smooth'});}});
for(const name of ['online','offline'])window.addEventListener(name,()=>{const status=document.querySelector('#connection');if(status){status.textContent=navigator.onLine?'Connected':'Offline';status.classList.toggle('online',navigator.onLine);status.classList.toggle('offline',!navigator.onLine);}toast(navigator.onLine?'Back online.':'You are offline. Reconnect before saving.');if(navigator.onLine)void refresh(true);});
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('hidden-page',document.hidden);if(!document.hidden&&!document.querySelector('dialog[open]')){void refresh(true);}});
setInterval(()=>{if(info&&!document.hidden&&navigator.onLine&&!document.querySelector('dialog[open]')){updateLiveCountdowns();paintConnection();}},1000);
setInterval(()=>{if(info&&!document.hidden&&navigator.onLine&&!document.querySelector('dialog[open]'))void refresh(true);},60000);
setInterval(()=>{if(info&&!document.hidden&&navigator.onLine)void refreshPresence();},300000);
if(supabase)supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){stopConnection();generation++;info=null;entries=[];document.querySelectorAll('dialog').forEach(d=>d.close());if(!signingOut)app.innerHTML=login(configured);}if(event==='PASSWORD_RECOVERY')setTimeout(passwordDialog,0);});
void boot();void registerPwa();
