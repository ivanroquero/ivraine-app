import { connectionMarkup } from './connection';
import type { Entry, BookResponse, Kind } from './types';
import { escapeHtml as h, daysTogether, dateLabel, today, countdownLabel, secondsUntil, partnerDisplayName, parseLetterMeta, getMusicEmbed, getPeriodsFromEntries, matchesPeriod } from './utils';
import { renderVoicePlayer } from './voiceUtils';
import { monthEvents, nextEvent } from './calendar';
export type Page='story'|'letters'|'gallery'|'calendar'|'plans'|'playlist';
export const navigation:[Page,string,string][]=[['story','Our story','⌁'],['letters','Letters','✉'],['gallery','Gallery','▧'],['calendar','Calendar','▦'],['plans','Bucket list','✧'],['playlist','Playlist','♫']];
export const pageKind:Record<Page,Kind>={story:'memory',letters:'note',gallery:'memory',calendar:'date',plans:'plan',playlist:'song'};
export const pageTitles:Record<Page,[string,string]>={story:['Every chapter, with you.','The big moments. The little things. All of us.'],letters:['A little love, for later.','Words to find you when you need them most.'],gallery:['The moments we keep.','A collection of us, one photograph at a time.'],calendar:['More days to look forward to.','Our milestones, celebrations, and plans.'],plans:['Someday, with you.','Little adventures and big dreams we share.'],playlist:['Sounds a little like us.','Every song has a story. These are ours.']};
export const icons={heart:'♡',filled:'♥'};
export interface Filters {query:string;chapter:string;period?:string;favorites:boolean;viewMode?:'grid'|'map';}
export function login(configured:boolean, alertNotice?: string){
  const alertHtml = alertNotice ? `
    <div class="login-perm-notice" role="alert" style="background:rgba(255,107,129,0.12);border:1.5px solid rgba(255,107,129,0.4);border-radius:14px;padding:14px 16px;margin:0 0 18px;display:flex;align-items:flex-start;gap:12px;color:var(--text,#fff);text-align:left;animation:ivraineFadeIn 0.3s ease;">
      <span style="font-size:20px;line-height:1;flex-shrink:0;">⚠️</span>
      <div style="font-size:13px;line-height:1.5;">
        <strong style="display:block;font-size:13.5px;color:#ff6b81;margin-bottom:3px;">Permissions Required ♡</strong>
        <span>${h(alertNotice)}</span>
      </div>
    </div>
  ` : '';
  return `<main class="login"><div class="login-art"><div class="brand">ivraine<span>♡</span></div><div class="paper"><img src="/icons/couple-512.png" alt="Ivan and Loraine" width="280" height="280"><span>you, me & all our little moments.</span></div><p>Our story is my favorite.</p></div><section class="login-form"><span class="eyebrow">JUST BETWEEN US</span><h1>A little space<br>for <em>us.</em></h1><p>A few memories, a whole lot of love.<br>Come in and stay a while.</p>${alertHtml}${configured?`<form id="login-form"><label>Your email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required minlength="8"></label><button class="primary" type="submit">Open our private space <span>→</span></button><button class="text-button" data-action="reset" type="button">Forgot your password?</button><p id="auth-status" role="status"></p></form>`:`<div class="setup"><strong>Our space is almost ready.</strong><p>Add the frontend environment values and complete the database setup in README.md to connect your private space.</p></div>`}<a class="secondary" href="/legacy/index.html" style="display:inline-block;text-align:center;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;margin:10px 0;">Open original passcode scrapbook ↗</a><small>PRIVATE MEMORIES. SHARED WITH LOVE.</small></section></main>`;}
function navIcon(page:Page){const paths:Record<Page,string>={"story":"<path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z\"/><path d=\"M8 7h8M8 11h5\"/>","letters":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3\"/><path d=\"m3 7 9 6 9-6\"/>","gallery":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"4\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><path d=\"m21 15-5-5L5 21\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2\"/>","plans":"<path d=\"m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z\"/>","playlist":"<path d=\"M9 18V5l12-2v13M9 9l12-2\"/><ellipse cx=\"6\" cy=\"18\" rx=\"3\" ry=\"3\"/><ellipse cx=\"18\" cy=\"16\" rx=\"3\" ry=\"3\"/>"};return '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[page]+'</svg>'; }
export function shell(info:BookResponse,page:Page){const partnerName=partnerDisplayName(info);const theme = typeof localStorage === 'undefined' ? 'dark' : (localStorage.getItem('ivraine-theme') === 'light' ? 'light' : 'dark');return `<div class="layout"><aside class="sidebar"><a class="brand" href="#story">ivraine<span>♡</span></a><p class="brand-note">OUR PRIVATE SPACE</p><nav aria-label="Private space">${navigation.map(([key,name])=>`<a href="#${key}" ${key===page?'aria-current="page"':''}><span aria-hidden="true">${navIcon(key)}</span>${name}</a>`).join('')}</nav><div class="sidebar-bottom"><span class="tiny-heart">♡</span><p>Made of little moments.<br>Kept with a lot of love.</p><button class="text-button" data-action="settings">Settings & keepsakes</button></div></aside><div class="workspace"><header class="topbar"><span>OUR PRIVATE SPACE <span aria-hidden="true">/</span> ${h(navigation.find(n=>n[0]===page)?.[1])}</span><div class="topbar-status"><span class="partner-presence" data-presence="partner" title="${h(partnerName)}">${h(partnerName)}</span><span class="connection ${navigator.onLine?'online':'offline'}" id="connection">${navigator.onLine?'Connected':'Offline'}</span><button class="theme-toggle" data-action="theme" aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode">${theme === 'dark' ? '☀' : '☾'}</button><button class="avatar" data-action="settings" aria-label="Open settings">${h(info.member.display_name.slice(0,1))}</button><button class="text-button" data-action="logout">Lock</button></div></header><main id="content" tabindex="-1"></main></div></div>`;}
function controls(e:Entry){return `<div class="card-actions"><button data-action="favorite" data-id="${e.id}" aria-label="${e.favorite?'Unfavorite':'Favorite'} ${h(e.title)}" aria-pressed="${e.favorite}" class="favorite ${e.favorite?'active':''}">${e.favorite?'♥':'♡'}</button><button class="text-button" data-action="edit" data-id="${e.id}">Edit</button><button class="text-button danger" data-action="delete" data-id="${e.id}">Delete</button></div>`;}
function photo(e:Entry,classes=''){return e.photo_urls?.[0]?`<button class="photo-button ${classes}" data-action="view" data-id="${e.id}" aria-label="View photos: ${h(e.title)}"><img src="${h(e.photo_urls[0])}" alt="${h(e.title)}" loading="lazy" decoding="async">${e.photo_paths.length>1?`<span class="photo-count">+${e.photo_paths.length-1}</span>`:''}</button>`:'';}
function empty(page:Page,filtered:boolean){return `<div class="empty"><span aria-hidden="true">${navigation.find(n=>n[0]===page)?.[2]}</span><h2>${filtered?'No matches just yet.':'A new chapter starts here.'}</h2><p>${filtered?'Try another search or clear your filters.':'Add something worth keeping. You can both come back to it.'}</p><button class="primary" data-action="${filtered?'clear-filters':'add'}">${filtered?'Clear filters':'Add the first one'} +</button></div>`;}

export function renderItems(page:Page,info:BookResponse,entries:Entry[],filters:Filters,month:Date,selectedDate:string):string{
 const selected=entries.filter(e=>page==='story'?(e.kind==='memory'||e.kind==='voice'):page==='gallery'?e.kind==='memory'&&e.photo_paths.length:e.kind===pageKind[page])
  .filter(e=>(!filters.favorites||e.favorite)&&(!filters.chapter||e.chapter===filters.chapter)&&(!filters.period||matchesPeriod(e.event_date,filters.period))&&`${e.title} ${e.body} ${e.location} ${e.artist}`.toLowerCase().includes(filters.query.toLowerCase()));
 if(page==='story') selected.sort((a,b)=>a.event_date.localeCompare(b.event_date)||a.created_at.localeCompare(b.created_at));

 let content='';
 if(page==='calendar'){
  const year=month.getUTCFullYear(),m=month.getUTCMonth();const events=monthEvents(info.book,entries,year,m);const start=new Date(Date.UTC(year,m,1)).getUTCDay(),total=new Date(Date.UTC(year,m+1,0)).getUTCDate();
  const calendarEvents=events.filter(e=>e.date===selectedDate);
  const selectedLabel=dateLabel(selectedDate);

  // Custom countdowns
  const pinnedId=typeof localStorage!=='undefined'?localStorage.getItem('ivraine-pinned-countdown'):null;
  const upcoming=entries.filter(e=>(e.kind==='date'||(e.kind==='plan'&&!e.completed))&&e.event_date>=today()).sort((a,b)=>a.event_date.localeCompare(b.event_date));
  const next=nextEvent(info.book,entries);
  const pinnedItem=upcoming.find(e=>e.id===pinnedId)||(pinnedId==='anniversary'&&next?.id==='anniversary'?{id:'anniversary',title:next.title,event_date:next.date}:null)||upcoming[0]||(next?{id:next.id,title:next.title,event_date:next.date}:null);

  const countdownHero=pinnedItem?`
   <section class="pinned-countdown-card">
    <div class="countdown-badge-row">
     <span class="badge">✈ PINNED COUNTDOWN</span>
     <span class="countdown-target">${h(dateLabel(pinnedItem.event_date))}</span>
    </div>
    <h3 class="countdown-title">${h(pinnedItem.title)}</h3>
    <div class="countdown-timer-display" data-countdown-target="${pinnedItem.event_date}">
     <div class="time-unit"><span class="unit-num" id="hero-cd-days">00</span><span class="unit-lbl">days</span></div>
     <span class="unit-colon">:</span>
     <div class="time-unit"><span class="unit-num" id="hero-cd-hours">00</span><span class="unit-lbl">hours</span></div>
     <span class="unit-colon">:</span>
     <div class="time-unit"><span class="unit-num" id="hero-cd-mins">00</span><span class="unit-lbl">mins</span></div>
     <span class="unit-colon">:</span>
     <div class="time-unit"><span class="unit-num" id="hero-cd-secs">00</span><span class="unit-lbl">secs</span></div>
    </div>
    <div class="countdown-card-footer">
     <span>${secondsUntil(pinnedItem.event_date)<=0?'Today is the day! ♡':`in ${Math.max(1,Math.ceil(secondsUntil(pinnedItem.event_date)/86400))} days`}</span>
     ${upcoming.length>1?`<button class="text-button" data-action="pick-countdown">Change countdown (${upcoming.length} available) ▾</button>`:''}
    </div>
   </section>
  `:'';

  content=`${countdownHero}<section class="calendar"><div class="calendar-nav"><button data-action="prev-month" aria-label="Previous month">←</button><h2>${new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(month)}</h2><button data-action="next-month" aria-label="Next month">→</button><button class="text-button" data-action="this-month">Today</button></div><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span class="weekday">${d}</span>`).join('')}${Array.from({length:start},()=>'<div class="day blank"></div>').join('')}${Array.from({length:total},(_,i)=>{const day=`${year}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;const items=events.filter(e=>e.date===day);const selected=day===selectedDate;return `<button class="day ${selected?'selected':''} ${day===today()?'today':''} ${items.length?'has-events':''}" data-action="day" data-date="${day}" aria-label="${h(dateLabel(day))}${items.length?`: ${h(items.map(e=>e.title).join(', '))}`:''}"><strong>${i+1}</strong>${items.slice(0,2).map(e=>`<span>${h(e.title)}</span>`).join('')}${items.length>2?`<small>+${items.length-2}</small>`:''}</button>`;}).join('')}</div></section><section class="calendar-focus"><div class="calendar-focus-header"><span class="eyebrow">${selectedDate===today()?'Today':'Selected day'}</span><h3>${h(selectedLabel)}</h3></div><div class="calendar-focus-body">${calendarEvents.length?`<ul>${calendarEvents.map(e=>`<li><strong>${h(e.title)}</strong><div class="event-actions">${e.automatic?'<span class="badge">Milestone</span>':`<button class="text-button" data-action="pin-countdown" data-id="${e.id}" title="Pin as countdown">📌 Pin</button><button class="text-button" data-action="edit" data-id="${e.id}">Edit</button>`}</div></li>`).join('')}</ul>`:`<p>No plans or milestones on this day yet. Add one and keep the story moving.</p>`}<button class="primary" data-action="day" data-date="${selectedDate}">Open day details</button></div></section><section class="agenda"><h2>This month, together.</h2>${events.map(e=>`<div><time>${h(dateLabel(e.date))}</time><strong>${h(e.title)}</strong>${e.automatic?'<span class="badge">'+(e.title.includes('First Day')||e.title.includes('Day We Met')?'Our landmark':'Our milestone')+'</span>':`<button class="text-button" data-action="pin-countdown" data-id="${e.id}" title="Pin as countdown">📌 Pin</button><button class="text-button" data-action="edit" data-id="${e.id}">Edit</button><button class="text-button danger" data-action="delete" data-id="${e.id}">Delete</button>`}</div>`).join('')||'<p>No plans yet. Pick a day and make one.</p>'}</section>`;
 }else if(!selected.length && filters.viewMode!=='map') content=empty(page,!!(filters.query||filters.chapter||filters.period||filters.favorites));
 else if(page==='story') content=`<div class="timeline">${selected.map(e=>`<article class="timeline-item"><div class="timeline-date"><span>${h(new Intl.DateTimeFormat('en',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(e.event_date+'T00:00:00Z')))}</span><strong>${Number(e.event_date.slice(-2))}</strong></div><div class="timeline-card">${photo(e)}<div class="card-copy"><span class="eyebrow">${h(e.chapter)} ${e.kind==='voice'?'· 🎙 VOICE MEMO':''} ${e.event_date>today()?'· AHEAD OF US':''}</span><h3>${h(e.title)}</h3><p class="preserve">${h(e.body)}</p>${e.voice_url?renderVoicePlayer(e.voice_url,e.title):''}${e.location?`<span class="metadata">⌖ ${h(e.location)}</span>`:''}${controls(e)}</div></div></article>`).join('')}</div>`;
 else if(page==='gallery'){
  if(filters.viewMode==='map'){
   const mappedMemories=entries.filter(e=>e.kind==='memory'&&e.location&&e.location.trim().length>0);
   content=`<div class="gallery-map-stage" id="gallery-map-container"><div class="map-view-header"><h3>Travel Map · Our Footprints</h3><span>${mappedMemories.length} pinned places visited together ♡</span></div><div id="memory-map" class="interactive-leaflet-map-host"></div></div>`;
  }else{
   content=`<div class="gallery-grid">${selected.map(e=>`<article class="gallery-card">${photo(e)}<div class="card-copy"><span class="eyebrow">${h(e.chapter)}</span><h3>${h(e.title)}</h3><span class="metadata">${h(dateLabel(e.event_date))}${e.location?' · ⌖ '+h(e.location):''}</span>${controls(e)}</div></article>`).join('')}</div>`;
  }
 }
 else if(page==='letters'){
  const myName=(info.member.display_name||'Ivan').trim();
  const pName=partnerDisplayName(info)||'Loraine';
  content=`<div class="letter-grid">${selected.map((e,i)=>{
   const author=e.author_id===info.userId?myName:pName;
   const recipient=e.author_id===info.userId?pName:myName;
   const meta=parseLetterMeta(e.location);
   const isLocked=!e.completed&&!!meta.lockUntil&&meta.lockUntil>today();
   const isOpened=e.completed;
   const openedLabel=isOpened?`Opened by ${h(meta.openedBy||recipient)} on ${h(dateLabel(meta.openedAt||e.updated_at.slice(0,10)))} ♡`:isLocked?`🔒 Sealed until ${h(dateLabel(meta.lockUntil!))}`:'Wax sealed · Tap to unseal ♡';
   const voiceBadge=e.voice_url?'<span class="letter-voice-chip">🎙 Voice memo</span>':'';
   return `<article class="letter-card tone-${i%3} ${isOpened?'is-opened':isLocked?'is-locked':'is-sealed'}"><button class="envelope" data-action="letter" data-id="${e.id}"><span class="envelope-fold" aria-hidden="true"></span><span class="wax ${isOpened?'wax-cracked':isLocked?'wax-locked':'wax-intact'}" aria-hidden="true">${isLocked?'🔒':isOpened?'♡':'♥'}</span><span class="letter-badge">From ${h(author)} for ${h(recipient)}</span><small>OPEN WHEN…</small><h3>${h(e.title.replace(/^open when\s*/i,''))}</h3>${voiceBadge}<span class="letter-state-label ${isOpened?'state-opened':isLocked?'state-locked':'state-sealed'}">${openedLabel}</span></button>${controls(e)}</article>`;
  }).join('')}</div>`;
 }
 else if(page==='plans'){
  content=`<div class="plan-summary"><span>${selected.filter(e=>e.completed).length} of ${selected.length} dreams checked off</span><progress value="${selected.filter(e=>e.completed).length}" max="${selected.length}" aria-label="Completed dreams"></progress></div><div class="plan-grid">${selected.map(e=>{
   // Find linked memory if dream is completed
   const linkedMemory=e.completed?entries.find(m=>m.kind==='memory'&&m.photo_paths.length>0&&(m.title.toLowerCase()===e.title.toLowerCase()||m.body.includes(e.id)||(e.location&&e.location.includes(m.id))||(m.location&&m.location.includes(e.id)))):null;
   return `<article class="plan-card ${e.completed?'completed':''}"><div class="plan-top"><button class="check-button" data-action="complete" data-id="${e.id}" aria-label="${e.completed?'Reopen':'Complete'} ${h(e.title)}" aria-pressed="${e.completed}">${e.completed?'✓':'○'}</button><span class="badge">${e.completed?'WE DID IT':'SOMEDAY WITH YOU'}</span></div><h3>${h(e.title)}</h3><p class="preserve">${h(e.body)}</p><p class="metadata">${h(dateLabel(e.event_date))}${e.location?' · '+h(e.location):''}</p>${linkedMemory?`<div class="linked-memory-preview" data-action="view" data-id="${linkedMemory.id}" role="button" tabindex="0" aria-label="View photo memory for ${h(e.title)}"><img src="${h(linkedMemory.photo_urls[0]||'')}" alt="${h(linkedMemory.title)}" class="linked-memory-thumb"><div class="linked-memory-copy"><span class="badge linked-tag">📸 PHOTO MEMORY KEPT</span><strong>${h(linkedMemory.title)}</strong><small>${h(dateLabel(linkedMemory.event_date))} · View photos ♡</small></div></div>`:e.completed?`<button class="secondary" data-action="convert" data-id="${e.id}">Make this a memory +</button>`:''}${controls(e)}</article>`;
  }).join('')}</div>`;
 }
 else{
  // Playlist page: Couple Soundtrack Theme Song of the Month highlighted banner
  const themeSong=selected.find(e=>e.location==='theme-song'||e.chapter==='Theme Song of the Month')||(selected.find(e=>e.favorite)||selected[0]);
  const monthName=new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(new Date());

  const themeHero=themeSong?`
   <section class="couple-soundtrack-card">
    <div class="soundtrack-vinyl-wrap">
     <div class="spinning-vinyl" aria-hidden="true">
      <div class="vinyl-center-dot">♫</div>
     </div>
    </div>
    <div class="soundtrack-info">
     <div class="soundtrack-eyebrow">
      <span class="badge">✧ COUPLE SOUNDTRACK</span>
      <span class="soundtrack-tag">THEME SONG OF THE MONTH · ${h(monthName.toUpperCase())}</span>
     </div>
     <h2>${h(themeSong.title)}</h2>
     <span class="soundtrack-artist">${h(themeSong.artist)}</span>
     ${themeSong.body?`<p class="soundtrack-note">“${h(themeSong.body)}”</p>`:''}
     ${getMusicEmbed(themeSong.song_url)?`
      <div class="soundtrack-embed">
       <iframe src="${h(getMusicEmbed(themeSong.song_url)!.embedUrl)}" width="100%" height="${getMusicEmbed(themeSong.song_url)!.height}" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
      </div>`:''}
     <div class="soundtrack-controls">
      ${themeSong.song_url?`<a class="play-button" href="${h(themeSong.song_url)}" target="_blank" rel="noopener noreferrer" aria-label="Play theme track: ${h(themeSong.title)}">▶ <span>Play song</span></a>`:''}
     </div>
    </div>
   </section>
  `:'';

  content=`${themeHero}<div class="playlist">${selected.map((e,i)=>{
   const embed=getMusicEmbed(e.song_url);
   const isTheme=e.id===themeSong?.id;
   return `<article class="song ${isTheme?'is-theme-song':''}">
    <div class="record" aria-hidden="true"><span>♫</span></div>
    <div class="song-copy">
     <div class="song-header-line">
      <span class="eyebrow">TRACK ${String(i+1).padStart(2,'0')}</span>
      ${isTheme?'<span class="badge theme-badge">★ Theme Song</span>':''}
     </div>
     <h3>${h(e.title)}</h3>
     <span class="metadata">${h(e.artist)}</span>
     <p class="preserve">${h(e.body)}</p>
     ${embed?`
      <div class="song-mini-embed">
       <iframe src="${h(embed.embedUrl)}" width="100%" height="${embed.height}" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
      </div>`:''}
    </div>
    <div class="song-actions-wrap">
     ${e.song_url?`<a class="play-button" href="${h(e.song_url)}" target="_blank" rel="noopener noreferrer" aria-label="Play ${h(e.title)}">▶ <span>Play song</span></a>`:''}
     <button class="text-button theme-toggle-btn" data-action="set-theme-song" data-id="${e.id}">${isTheme?'★ Current theme':'☆ Set as Theme Song'}</button>
     ${controls(e)}
    </div>
   </article>`;
  }).join('')}</div>`;
 }
 return content;
}

export function renderPage(page:Page,info:BookResponse,entries:Entry[],filters:Filters,month:Date,selectedDate:string){
 const next=nextEvent(info.book,entries);const [title,subtitle]=pageTitles[page];
 const nextCountdown = next ? (secondsUntil(next.date) <= 0 ? 'Today' : countdownLabel(next.date)) : '';
 const hero=page==='story'?`<section class="hero"><div><span class="eyebrow">${h(info.book.partner_one)} & ${h(info.book.partner_two)}</span><h1>Our favorite<br><em>kind of forever.</em></h1><p>Collecting the little things that make us, us.</p><div class="hero-stats"><div><strong>${daysTogether(info.book.anniversary).toLocaleString()}</strong><span>days together</span></div><i></i><div><strong>${entries.filter(e=>e.kind==='memory').length}</strong><span>memories kept</span></div><i></i><div><strong>∞</strong><span>more to come</span></div></div><span class="since">SINCE ${h(dateLabel(info.book.anniversary).toUpperCase())}</span></div><div class="hero-photo"><span class="tape"></span><img src="/icons/couple-512.png" alt="Ivan and Loraine together"><span>my favorite person. ♡</span></div><span class="hero-doodle" aria-hidden="true">♡</span></section>`:'';
 const chapters=[...new Set(entries.filter(e=>e.kind==='memory').map(e=>e.chapter))].sort();
 const periods=getPeriodsFromEntries(entries.filter(e=>e.kind==='memory'));

 const heading=`<div class="page-heading"><div><span class="eyebrow">${page==='story'?'THE STORY SO FAR':'MADE FOR THE TWO OF US'}</span><h${page==='story'?'2':'1'}>${title}</h${page==='story'?'2':'1'}><p>${subtitle}</p></div><button class="primary" data-action="add">+ ${page==='letters'?'Write a letter':page==='playlist'?'Add a song':page==='plans'?'Add a dream':page==='calendar'?'Add a date':'Add a memory'}</button></div>`;

 const toolbar=page!=='calendar'?`<div class="toolbar">
  <label class="search"><span aria-hidden="true">⌕</span><input id="search" aria-label="Search ${page}" type="search" placeholder="Search our ${page==='plans'?'dreams':page}…" value="${h(filters.query)}"></label>
  ${['story','gallery'].includes(page)?`
   <select id="chapter-filter" aria-label="Filter by chapter">
    <option value="">All chapters</option>
    ${chapters.map(c=>`<option ${c===filters.chapter?'selected':''}>${h(c)}</option>`).join('')}
   </select>
   <select id="date-filter" aria-label="Filter by date">
    <option value="">All dates</option>
    ${periods.map(p=>`<option value="${h(p.id)}" ${p.id===filters.period?'selected':''}>${h(p.label)}</option>`).join('')}
   </select>
  `:''}
  ${page==='gallery'?`
   <div class="segmented-control" role="group" aria-label="Gallery view mode">
    <button class="chip ${filters.viewMode!=='map'?'active':''}" data-action="gallery-view" data-mode="grid">▧ Grid</button>
    <button class="chip ${filters.viewMode==='map'?'active':''}" data-action="gallery-view" data-mode="map">⌖ Map view</button>
   </div>
  `:''}
  <button class="chip" data-action="filter-favorites" aria-pressed="${filters.favorites}">♡ Favorites</button>
  <button class="text-button" data-action="refresh" aria-label="Refresh scrapbook">↻ Refresh</button>
 </div>`:'';

 const content=renderItems(page,info,entries,filters,month,selectedDate);
 return `${hero}${page==='story'?connectionMarkup():''}${next?`<div class="next-date"><span>✧</span><p><strong>${h(next.title)}</strong><span>${h(dateLabel(next.date))}</span></p><span class="badge countdown-live" data-live-countdown="${next.date}">${nextCountdown}</span><a href="#calendar">View calendar →</a></div>`:''}${heading}${toolbar}<div id="page-items">${content}</div><footer>Every little moment belongs here. <span>♡</span></footer>`;
}
