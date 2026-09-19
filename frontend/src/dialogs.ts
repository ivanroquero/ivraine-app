import type { Entry, Kind } from './types';
import { escapeHtml as h, today } from './utils';
export function dialog(title:string,content:string,classes=''){
 const el=document.createElement('dialog');el.className=classes;
 el.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${h(title)}</h2><button type="button" class="close-button" aria-label="Close dialog">×</button></div>${content}`;
 el.setAttribute('aria-labelledby','dialog-title');document.body.append(el);
 el.querySelector('.close-button')!.addEventListener('click',()=>el.close());
 el.addEventListener('click',e=>{if(e.target===el&&!el.querySelector('button[type=submit]:disabled')){const r=el.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)el.close();}});
 el.addEventListener('close',()=>el.remove(),{once:true});el.showModal();return el;
}
export function sheet(title:string,content:string,classes=''){
 const overlay=document.createElement('div');overlay.className=`sheet-overlay ${classes}`.trim();
 const panel=document.createElement('div');panel.className='sheet-panel';
 panel.innerHTML=`<div class="sheet-grab" aria-hidden="true"></div><div class="sheet-header"><h2 id="sheet-title">${h(title)}</h2></div>${content}`;
 overlay.append(panel);document.body.append(overlay);
 document.body.style.overflow='hidden';
 const close=()=>{panel.classList.add('is-closing');setTimeout(()=>{overlay.remove();document.body.style.overflow='';},240);};
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 panel.addEventListener('keydown',e=>{if((e as KeyboardEvent).key==='Escape')close();});
 const interactiveSelector='button, input, textarea, select, a, label, [role="button"], [type="submit"], [type="button"], [type="checkbox"], [type="radio"]';
 let touchY=0,startTracking=false,mouseStartY=0,mouseTracking=false;
 const beginTracking=(y:number)=>{startTracking=true;touchY=y;};
 const updateTracking=(y:number)=>{
  if(!startTracking || panel.scrollTop>0)return;
  const delta=y-touchY;
  if(delta>0){panel.style.transform=`translateY(${delta}px)`;panel.style.opacity=`${Math.max(0,1-delta/220)}`;}
 };
 const endTracking=()=>{
  if(!startTracking)return;
  const transform=panel.style.transform.match(/translateY\(([-0-9.]+)px\)/);const delta=transform?Number(transform[1]):0;panel.style.transform='';panel.style.opacity='';startTracking=false;if(delta>120)close();
 };
 panel.addEventListener('mousedown',e=>{
  const target=e.target as HTMLElement;
  const rect=panel.getBoundingClientRect();
  const isHeaderTouch = e.clientY - rect.top < 72;
  if(!isHeaderTouch || target.closest(interactiveSelector) || panel.scrollTop>0)return;
  mouseTracking=true;mouseStartY=e.clientY;beginTracking(e.clientY);
 });
 panel.addEventListener('mousemove',e=>{
  if(!mouseTracking)return;updateTracking(e.clientY);
 });
 window.addEventListener('mouseup',()=>{
  if(mouseTracking){mouseTracking=false;endTracking();}
 });
 panel.addEventListener('touchstart',e=>{
  const target=e.target as HTMLElement;
  const touch=e.touches[0];
  const rect=panel.getBoundingClientRect();
  const isHeaderTouch = touch.clientY - rect.top < 72;
  if(!isHeaderTouch || target.closest(interactiveSelector) || panel.scrollTop>0){startTracking=false;return;}
  beginTracking(touch.clientY);
 },{passive:true});
 panel.addEventListener('touchmove',e=>{
  if(!startTracking || panel.scrollTop>0)return;
  const delta=e.touches[0].clientY-touchY;
  if(delta>0){e.preventDefault();panel.style.transform=`translateY(${delta}px)`;panel.style.opacity=`${Math.max(0,1-delta/220)}`;}
 },{passive:false});
 panel.addEventListener('touchend',()=>{endTracking();});
 requestAnimationFrame(()=>panel.classList.add('is-visible'));
 return {el:panel,close};
}
export function editor(kind:Kind,entry?:Entry,convert=false,date=today()){
 const names:Record<Kind,string>={memory:'memory',note:'letter',plan:'dream',date:'date',song:'song',voice:'voice note'};
 const e=entry;const editing=!!e&&!convert;
 const form=`<form id="entry-form" class="entry-form"><label>${kind==='note'?'Open when…':kind==='song'?'Song title':'Title'}<input name="title" maxlength="160" required value="${h(e?.title)}" placeholder="${kind==='note'?'you miss me':kind==='plan'?'Watch a sunrise together':'Give this moment a name'}" autofocus></label>${kind==='song'?`<label>Artist<input name="artist" maxlength="160" value="${h(e?.artist)}"></label><label>Song link<input name="song_url" type="url" required maxlength="2000" placeholder="https://open.spotify.com/track/…" value="${h(e?.song_url)}"></label><p class="field-help">Spotify, Apple Music, YouTube, or SoundCloud. Opens only when you press play.</p>`:''}<label>${kind==='note'?'Your letter':kind==='song'?'Why this song is ours':'The story'}<textarea name="body" rows="${kind==='note'?8:4}" maxlength="12000" ${kind==='note'?'required':''} placeholder="A little detail you never want to forget…">${h(e?.body)}</textarea></label><div class="form-row"><label>${kind==='plan'?'Target date':kind==='date'?'Date':kind==='note'?'Written on':kind==='song'?'Added on':'Memory date'}<input name="event_date" type="date" required value="${h(convert?today():e?.event_date||date)}"></label>${kind!=='song'&&kind!=='note'?`<label>Place<input name="location" maxlength="160" value="${h(e?.location)}" placeholder="Where was this?"></label>`:''}</div>${kind==='memory'?`<label>Chapter<input name="chapter" maxlength="80" value="${h(e?.chapter||'Our story')}" placeholder="Our firsts, Little adventures…"></label>${!editing?'<label class="upload-label">Add photos <span>Up to 12 · JPEG, PNG, WebP · 8 MB each</span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="photo-previews" class="photo-previews"></div>':`<p class="field-help">${e?.photo_paths.length||0} attached photos. Photo attachments stay with the original memory.</p>`}`:''}${kind==='date'?`<label>Repeat<select name="recurrence"><option value="none" ${e?.recurrence==='none'?'selected':''}>Once</option><option value="monthly" ${e?.recurrence==='monthly'?'selected':''}>Every month</option><option value="yearly" ${e?.recurrence==='yearly'?'selected':''}>Every year (birthdays & anniversaries)</option></select></label>`:''}<p id="form-status" role="status"></p><button type="submit" class="primary">${editing?'Save changes':kind==='note'?'Seal this letter':'Save '+names[kind]} <span>♡</span></button></form>`;
 const el=dialog(`${editing?'Edit':'A new'} ${names[kind]}`,form);let urls:string[]=[];
 el.querySelector<HTMLInputElement>('[name="photos"]')?.addEventListener('change',event=>{
  urls.forEach(URL.revokeObjectURL);urls=[];const input=event.target as HTMLInputElement;const preview=el.querySelector('#photo-previews')!;preview.replaceChildren();
  for(const file of Array.from(input.files||[]).slice(0,12)){const url=URL.createObjectURL(file);urls.push(url);const img=new Image();img.src=url;img.alt=file.name;preview.append(img);}
 });
 el.addEventListener('close',()=>urls.forEach(URL.revokeObjectURL));return el;
}
