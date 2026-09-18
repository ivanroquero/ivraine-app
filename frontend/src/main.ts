import './styles.css';
import './connection.css';
import './glass.css';
import { startConnection, stopConnection, paintConnection } from './connection';
import { api, configured, supabase } from './api';
import type { Entry, BookResponse, Kind } from './types';
import { login, shell, renderPage, pageKind, type Page, type Filters, navigation } from './views';
import { dialog, editor } from './dialogs';
import { escapeHtml as h, download, today, dateLabel, countdownLabel, secondsUntil, presenceLabel, isRecentlyActive } from './utils';
import { unlockLegacy, importLegacy } from './legacy';
import { install, registerPwa } from './pwa';
import { monthEvents } from './calendar';
const app=document.querySelector<HTMLDivElement>('#app')!;
let info:BookResponse|null=null, entries:Entry[]=[], generation=0, refreshing=false, signingOut=false, toastTimer:ReturnType<typeof setTimeout>;
let filters:Filters={query:'',chapter:'',favorites:false};
let month=new Date(`${today().slice(0,7)}-01T00:00:00Z`);
let selectedDate=today();
let presenceTimer:ReturnType<typeof setInterval>|undefined;
const themeKey='ivraine-theme';
function applyTheme(theme:'light'|'dark'){document.documentElement.dataset.theme=theme;localStorage.setItem(themeKey,theme);}
function currentTheme(): 'light'|'dark'{const current=document.documentElement.dataset.theme;if(current==='dark'||current==='light')return current;return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
try{const saved=localStorage.getItem(themeKey);applyTheme(saved==='light'||saved==='dark'?saved:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}catch{document.documentElement.dataset.theme='light';}
function page():Page{return navigation.some(n=>n[0]===location.hash.slice(1))?location.hash.slice(1) as Page:'story';}
function toast(message:string){const el=document.querySelector('#toast')!;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),6500);}
function message(error:unknown){return error instanceof Error?error.message:'Something went wrong. Please try again.';}
function updatePresenceStatus(){
 const you=document.querySelector<HTMLElement>('[data-presence="you"]');
 const partnerEl=document.querySelector<HTMLElement>('[data-presence="partner"]');
 if(!info)return;
 if(you){you.textContent=presenceLabel('You', info.member.last_active_at, true);you.classList.toggle('is-live', isRecentlyActive(info.member.last_active_at));}
 if(partnerEl){const partnerName=info.partner?.display_name||'Your partner';const partnerValue=info.partner?.last_active_at;partnerEl.textContent=presenceLabel(partnerName, partnerValue, false);partnerEl.classList.toggle('is-live', isRecentlyActive(partnerValue));}
}
function updateLiveCountdowns(){document.querySelectorAll<HTMLElement>('[data-live-countdown]').forEach(el=>{const value=el.dataset.liveCountdown;if(!value)return;const total=secondsUntil(value,new Date());el.textContent=total<=0?'Today':countdownLabel(value,new Date());});}
function render(whole=false){if(!info)return;if(whole)app.innerHTML=shell(info,page());const target=document.querySelector('#content');if(target)target.innerHTML=renderPage(page(),info,entries,filters,month,selectedDate);updateLiveCountdowns();updatePresenceStatus();paintConnection();}
async function fetchEntries(){const all:Entry[]=[];let offset:number|null=0;while(offset!==null){const r: {entries:Entry[];nextOffset:number|null}=await api(`/entries?offset=${offset}`);all.push(...r.entries);offset=r.nextOffset;}return all;}
async function refresh(quiet=false){if(!info||refreshing)return;refreshing=true;const gen=generation;try{const rows=await fetchEntries();if(gen!==generation)return;entries=rows;render();if(!quiet)toast('All caught up.');}catch(error){if(gen===generation)toast(message(error));}finally{refreshing=false;}}
async function pingPresence(){if(!info||!navigator.onLine)return;try{const active=await api<{last_active_at:string}>('/active','POST');if(!info)return;info.member.last_active_at=active.last_active_at;updatePresenceStatus();}catch{ /* Presence updates are best-effort and should not block the rest of the app. */ }}
function startPresenceHeartbeat(){if(presenceTimer)clearInterval(presenceTimer);presenceTimer=setInterval(()=>{if(info&&!document.hidden&&navigator.onLine)void pingPresence();},30000);}
async function boot(){const gen=++generation;
 if(!supabase){app.innerHTML=login(false);return;}
 const {data:{session}}=await supabase.auth.getSession();if(gen!==generation)return;
 if(!session){info=null;entries=[];app.innerHTML=login(configured);return;}
 app.innerHTML='<p class="loading">Opening our little world…</p>';
 try{const [book,rows]=await Promise.all([api<BookResponse>('/book'),fetchEntries()]);if(gen!==generation)return;info=book;entries=rows;render(true);startPresenceHeartbeat();void pingPresence();startConnection(info.userId,toast);}
 catch(error){if(gen!==generation)return;info=null;entries=[];app.innerHTML=`<main class="error-page"><span class="brand">ivraine ♡</span><h1>Let’s get you back in.</h1><p>${h(message(error))}</p><button class="primary" data-action="retry">Try again</button><button class="text-button" data-action="logout">Sign out</button></main>`;}
}
function passwordDialog(){const el=dialog('A fresh start.','<form id="password-form"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><p>Use at least 12 characters.</p><p id="password-status" role="status"></p><button class="primary" type="submit">Update password</button></form>');el.querySelector('form')!.addEventListener('submit',async event=>{event.preventDefault();const button=el.querySelector<HTMLButtonElement>('[type="submit"]')!;button.disabled=true;const value=new FormData(event.target as HTMLFormElement).get('password') as string;const {error}=await supabase!.auth.updateUser({password:value});if(error){el.querySelector('#password-status')!.textContent=error.message;button.disabled=false;}else{el.close();toast('Password updated.');void boot();}});}
async function saveEntry(el:HTMLDialogElement,kind:Kind,existing?:Entry,convert=false){
 const form=el.querySelector<HTMLFormElement>('#entry-form')!;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(form.dataset.busy)return;form.dataset.busy='true';const button=form.querySelector<HTMLButtonElement>('[type="submit"]')!;button.disabled=true;const status=form.querySelector('#form-status')!;
  const close=el.querySelector<HTMLButtonElement>('.close-button')!;close.disabled=true;const blockClose=(event:Event)=>event.preventDefault();el.addEventListener('cancel',blockClose);
  const data=new FormData(form);const uploaded:string[]=[];
  const edit=!!existing&&!convert;let saved=false;
  try{
   if(!navigator.onLine)throw new Error('Reconnect to save this safely. Your draft is still here.');
   const files=(data.getAll('photos') as File[]).filter(f=>f.size>0);if(files.length>12)throw new Error('Choose up to 12 photos.');
   if(files.some(f=>f.size>8388608||!['image/jpeg','image/png','image/webp'].includes(f.type)))throw new Error('Use JPEG, PNG, or WebP photos, each under 8 MB.');
   for(const [i,file] of files.entries()){status.textContent=`Uploading photo ${i+1} of ${files.length}…`;uploaded.push((await api<{path:string}>('/photos','POST',file)).path);}
   status.textContent='Saving your little moment…';
   const body={title:data.get('title'),body:data.get('body')||'',event_date:data.get('event_date'),location:data.get('location')||'',chapter:data.get('chapter')||existing?.chapter||'Our story',recurrence:data.get('recurrence')||existing?.recurrence||'none',artist:data.get('artist')||'',song_url:data.get('song_url')||'',voice_url:data.get('voice_url')||''};
   if(edit)await api(`/entries/${existing.id}`,'PATCH',{...body,updated_at:existing.updated_at});
   else await api('/entries','POST',{...body,id:crypto.randomUUID(),kind,photo_paths:uploaded});
   saved=true;el.close();await refresh(true);toast(edit?'Changes saved.':'A little moment, kept forever.');
  }catch(error){if(!saved)for(const path of uploaded)await api('/photos','DELETE',{path}).catch(()=>undefined);status.textContent=message(error);}
  finally{button.disabled=false;close.disabled=false;el.removeEventListener('cancel',blockClose);delete form.dataset.busy;}
 });
}
function openEditor(kind:Kind,existing?:Entry,convert=false,date?:string){const el=editor(kind,existing,convert,date);void saveEntry(el,kind,existing,convert);}
function showLetter(entry:Entry){dialog(`Open when ${entry.title.replace(/^open when\s*/i,'')}`,`<div class="letter-reading"><span class="eyebrow">A LETTER FOR MY FAVORITE PERSON</span><p class="preserve">${h(entry.body)}</p><span class="letter-signoff">With love, always. ♡</span><p class="metadata">${h(dateLabel(entry.event_date))}</p></div>`,'reading-dialog');}
function showViewer(entry:Entry){let index=0;const photos=entry.photo_urls.filter((u):u is string=>!!u);if(!photos.length){toast('The photo link expired or the file is missing. Refresh and try again.');return;}
 const el=dialog(entry.title,`<div class="lightbox"><img alt="${h(entry.title)}"><div class="viewer-controls"><button id="previous-photo" aria-label="Previous photo">←</button><span id="photo-number"></span><button id="next-photo" aria-label="Next photo">→</button><button id="fullscreen-photo" aria-label="Enter fullscreen">⛶ Full screen</button></div><p class="preserve">${h(entry.body)}</p><p class="metadata">${h(entry.chapter)} · ${h(dateLabel(entry.event_date))}</p></div>`,'viewer');
 const draw=()=>{el.querySelector('img')!.src=photos[index];el.querySelector('#photo-number')!.textContent=`${index+1} / ${photos.length}`;};draw();
 const step=(dir:number)=>{index=(index+dir+photos.length)%photos.length;draw();};
 el.querySelector('#previous-photo')!.addEventListener('click',()=>step(-1));el.querySelector('#next-photo')!.addEventListener('click',()=>step(1));
 el.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')step(-1);if(event.key==='ArrowRight')step(1);});
 el.querySelector('#fullscreen-photo')!.addEventListener('click',async()=>{if(!el.requestFullscreen){toast('This browser uses the full-window photo viewer.');return;}try{if(document.fullscreenElement)await document.exitFullscreen();else await el.requestFullscreen();}catch{toast('Fullscreen is not available in this browser.');}});
 let touchX=0;el.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX;},{passive:true});el.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-touchX;if(Math.abs(delta)>60)step(delta<0?1:-1);},{passive:true});
}
function settings(){const el=dialog('Our little space.',`<p>Signed in as <strong>${h(info?.member.display_name)}</strong>. Only the two accounts added to this scrapbook can access its content.</p><div class="settings-actions"><button class="secondary" id="theme-toggle" data-action="theme">${currentTheme()==='dark'?'☀ Light mode':'☾ Dark mode'}</button><button class="secondary" id="install">Add to Home Screen</button><button class="secondary" id="export">Export our stories (JSON)</button><button class="secondary" id="password">Change password</button><a class="secondary" href="/legacy/index.html">Open original scrapbook ↗</a></div><hr><h3>Bring our old photos along.</h3><p>Unlock the original with its existing 8-digit passcode. Photos are imported into this private scrapbook; the original stories and layout remain available in the original version.</p><form id="import-form"><label>Original passcode<input type="password" name="passcode" inputmode="numeric" minlength="8" maxlength="8" required autocomplete="off"></label><p class="field-help">The passcode is used in this browser and is never sent to the backend. Imported photo dates need to be reviewed.</p><p id="import-status" role="status"></p><button class="primary" type="submit">Import original photos</button></form>`);
 el.querySelector('#install')!.addEventListener('click',()=>{el.close();void install();});
 el.querySelector('#password')!.addEventListener('click',()=>{el.close();passwordDialog();});
 el.querySelector('#export')!.addEventListener('click',()=>{download(`ivraine-stories-${today()}.json`,new Blob([JSON.stringify({version:2,exported_at:new Date().toISOString(),book:info?.book,entries:entries.map(({photo_urls,...e})=>e),note:'Photo files are stored separately. This is a stories export; keep a separate Supabase Storage backup.'},null,2)],{type:'application/json'}));toast('Stories exported. Photo files need a separate storage backup.');});
 el.querySelector('form')!.addEventListener('submit',async event=>{event.preventDefault();const form=event.target as HTMLFormElement;const button=form.querySelector<HTMLButtonElement>('button')!;const status=el.querySelector('#import-status')!;button.disabled=true;const close=el.querySelector<HTMLButtonElement>('.close-button')!;close.disabled=true;const blockClose=(e:Event)=>e.preventDefault();el.addEventListener('cancel',blockClose);
 try{status.textContent='Unlocking the original locally…';const passcode=(form.elements.namedItem('passcode') as HTMLInputElement).value;const payload=await unlockLegacy(passcode);form.reset();const count=await importLegacy(payload,new Set(entries.map(e=>e.id)),s=>{status.textContent=s;});status.textContent=`Imported ${count} photos. Already imported photos were skipped. Review their dates in Our Story.`;await refresh(true);}catch(error){status.textContent=message(error);await refresh(true);}finally{button.disabled=false;close.disabled=false;el.removeEventListener('cancel',blockClose);}});
}
document.addEventListener('submit',async event=>{const form=event.target as HTMLFormElement;if(form.id!=='login-form')return;event.preventDefault();const button=form.querySelector<HTMLButtonElement>('[type="submit"]')!;button.disabled=true;const data=new FormData(form);try{const {error}=await supabase!.auth.signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});if(error)throw error;await boot();}catch(error){form.querySelector('#auth-status')!.textContent=message(error);button.disabled=false;}});
document.addEventListener('click',async event=>{
 const button=(event.target as Element).closest<HTMLElement>('[data-action]');if(!button)return;const action=button.dataset.action;const entry=entries.find(e=>e.id===button.dataset.id);
 if(button instanceof HTMLButtonElement&&button.disabled)return;
 try{
 switch(action){
 case'retry':await boot();break;
 case'logout':{stopConnection();generation++;signingOut=true;info=null;entries=[];document.querySelectorAll('dialog').forEach(d=>d.close());app.innerHTML='<p class="loading">Locking our little space…</p>';try{const {error}=await supabase!.auth.signOut({scope:'local'});if(error)toast('Locked on this device. Remote sign-out could not be confirmed.');}finally{localStorage.removeItem('ivraine-auth-v2');localStorage.removeItem('ivraine-auth-v2-code-verifier');sessionStorage.removeItem('ivraine-auth-v2');sessionStorage.removeItem('ivraine-auth-v2-code-verifier');signingOut=false;app.innerHTML=login(configured);}break;}
 case'reset':{const email=(document.querySelector<HTMLInputElement>('[name="email"]')?.value||'').trim();if(!email){toast('Enter your email above first.');return;}const {error}=await supabase!.auth.resetPasswordForEmail(email,{redirectTo:location.origin});if(error)throw error;toast('If this account exists, a password reset link is on its way.');break;}
 case'add':openEditor(pageKind[page()]);break;
 case'edit':if(entry)openEditor(entry.kind,entry);break;
 case'convert':if(entry)openEditor('memory',entry,true);break;
 case'letter':if(entry)showLetter(entry);break;
 case'view':if(entry)showViewer(entry);break;
 case'settings':settings();break;
 case'theme':{const next=currentTheme()==='dark'?'light':'dark';applyTheme(next);const themeButton=document.querySelector<HTMLButtonElement>('#theme-toggle');if(themeButton)themeButton.textContent=next==='dark'?'☀ Light mode':'☾ Dark mode';break;}
 case'refresh':await refresh();break;
 case'filter-favorites':filters.favorites=!filters.favorites;render();break;
 case'clear-filters':filters={query:'',chapter:'',favorites:false};render();break;
 case'prev-month':month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()-1,1));selectedDate=`${month.getUTCFullYear()}-${String(month.getUTCMonth()+1).padStart(2,'0')}-01`;render();break;
 case'next-month':month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,1));selectedDate=`${month.getUTCFullYear()}-${String(month.getUTCMonth()+1).padStart(2,'0')}-01`;render();break;
 case'this-month':month=new Date(`${today().slice(0,7)}-01T00:00:00Z`);selectedDate=today();render();break;
 case'day':{const date=button.dataset.date!;selectedDate=date;render();const daily=monthEvents(info!.book,entries,month.getUTCFullYear(),month.getUTCMonth()).filter(e=>e.date===date);const el=dialog(dateLabel(date),`${daily.length?`<ul>${daily.map(e=>`<li>${h(e.title)}</li>`).join('')}</ul>`:'<p>A lovely day for a new plan.</p>'}<button class="primary" id="add-on-day">Add a date</button>`);el.querySelector('#add-on-day')!.addEventListener('click',()=>{el.close();openEditor('date',undefined,false,date);});break;}
 case'favorite':case'complete':{if(!entry)return;if(button instanceof HTMLButtonElement)button.disabled=true;const patch=action==='favorite'?{favorite:!entry.favorite}:{completed:!entry.completed};await api(`/entries/${entry.id}`,'PATCH',{...patch,updated_at:entry.updated_at});await refresh(true);break;}
 case'delete':{if(!entry)return;const el=dialog('Delete this little moment?',`<p>“${h(entry.title)}” and its attached photos will be removed for both of you.</p><button class="danger-button" id="confirm-delete">Delete permanently</button><p id="delete-status" role="status"></p>`);el.querySelector('#confirm-delete')!.addEventListener('click',async event=>{const target=event.target as HTMLButtonElement;target.disabled=true;try{const result=await api<{warning?:string}>(`/entries/${entry.id}`,'DELETE');el.close();await refresh(true);toast(result.warning||'Entry deleted.');}catch(error){el.querySelector('#delete-status')!.textContent=message(error);target.disabled=false;}});break;}
 }
 }catch(error){toast(message(error));if(button instanceof HTMLButtonElement)button.disabled=false;}
});
let searchTimer:ReturnType<typeof setTimeout>;
document.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.id==='search'){filters.query=input.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{render();const search=document.querySelector<HTMLInputElement>('#search');search?.focus();},220);}});
document.addEventListener('change',event=>{const input=event.target as HTMLSelectElement;if(input.id==='chapter-filter'){filters.chapter=input.value;render();}});
window.addEventListener('hashchange',()=>{filters={query:'',chapter:'',favorites:false};if(info){render(true);window.scrollTo({top:0,behavior:'smooth'});}});
for(const name of ['online','offline'])window.addEventListener(name,()=>{const status=document.querySelector('#connection');if(status){status.textContent=navigator.onLine?'Connected':'Offline';status.classList.toggle('online',navigator.onLine);status.classList.toggle('offline',!navigator.onLine);}toast(navigator.onLine?'Back online.':'You are offline. Reconnect before saving.');if(navigator.onLine)void refresh(true);});
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('hidden-page',document.hidden);if(!document.hidden&&!document.querySelector('dialog[open]')){void refresh(true);void pingPresence();}});
setInterval(()=>{if(info&&!document.hidden&&navigator.onLine&&!document.querySelector('dialog[open]')){updateLiveCountdowns();updatePresenceStatus();paintConnection();}},1000);
setInterval(()=>{if(info&&!document.hidden&&navigator.onLine&&!document.querySelector('dialog[open]'))void refresh(true);},60000);
if(supabase)supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){stopConnection();if(presenceTimer)clearInterval(presenceTimer);generation++;info=null;entries=[];document.querySelectorAll('dialog').forEach(d=>d.close());if(!signingOut)app.innerHTML=login(configured);}if(event==='PASSWORD_RECOVERY')setTimeout(passwordDialog,0);});
void boot();void registerPwa();
