import type { BookResponse } from './types';
export const escapeHtml=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function partnerDisplayName(info:BookResponse|null|undefined):string{
 if(!info)return '';
 const pName=info.partner?.display_name?.trim();
 if(pName&&pName.toLowerCase()!=='your partner')return pName;
 const myName=(info.member?.display_name||'').trim().toLowerCase();
 const p1=(info.book?.partner_one||'').trim();
 const p2=(info.book?.partner_two||'').trim();
 if(p1&&myName&&(p1.toLowerCase().includes(myName)||myName.includes(p1.toLowerCase()))){
  return p2.split(' ')[0]||p2;
 }
 if(p2&&myName&&(p2.toLowerCase().includes(myName)||myName.includes(p2.toLowerCase()))){
  return p1.split(' ')[0]||p1;
 }
 return p2.split(' ')[0]||p2||p1.split(' ')[0]||p1||'';
}
export function today(){const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const value=(key:string)=>parts.find(p=>p.type===key)!.value;return `${value('year')}-${value('month')}-${value('day')}`;}
export function dateLabel(date:string){if(!date)return 'No date';const value=new Date(`${date}T00:00:00Z`);return new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(value);}
export function download(filename:string,blob:Blob){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function daysTogether(start:string,end=today()){return Math.max(0,Math.floor((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000));}
export function secondsUntil(date:string,now=new Date()){const target=new Date(`${date}T00:00:00Z`);return Math.max(0,Math.floor((target.getTime()-now.getTime())/1000));}
export function countdownLabel(date:string,now=new Date()){const total=secondsUntil(date,now);if(total<=0)return 'Today';const days=Math.floor(total/86400);const hours=Math.floor((total%86400)/3600);const minutes=Math.floor((total%3600)/60);const seconds=total%60;return `${days}d ${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;}
const STALE_ACTIVITY_MINUTES = 24 * 60;
const LIVE_ACTIVITY_MINUTES = 10;
export function presenceLabel(name:string, value:string|undefined, isSelf=false, now:Date|number=new Date()):string{
 const stamp = typeof now === 'number' ? now : now.getTime();
 const timestamp = value ? Date.parse(value) : Number.NaN;
 if (!value || !Number.isFinite(timestamp)) return `${name} · offline`;
 const elapsed = Math.max(0, stamp - timestamp);
 if (elapsed < 60000) return `${name} · active just now`;
 const minutes = Math.floor(elapsed / 60000);
 if (minutes >= STALE_ACTIVITY_MINUTES) return `${name} · offline`;
 if (minutes === 1) return `${name} · active 1 minute ago`;
 if (minutes < 60) return `${name} · active ${minutes} minutes ago`;
 const hours = Math.floor(minutes / 60);
 if (hours === 1) return `${name} · active 1 hour ago`;
 if (hours < 24) return `${name} · active ${hours} hours ago`;
 return `${name} · offline`;
}
export function isRecentlyActive(value:string|undefined, now:Date|number=new Date()):boolean{
 const stamp = typeof now === 'number' ? now : now.getTime();
 const timestamp = value ? Date.parse(value) : Number.NaN;
 if (!Number.isFinite(timestamp)) return false;
 return (stamp - timestamp) / 60000 < LIVE_ACTIVITY_MINUTES;
}
export interface LetterMeta {
 lockUntil?: string;
 openedBy?: string;
 openedAt?: string;
 recipient?: string;
}
export function parseLetterMeta(raw?: string): LetterMeta {
 if (!raw) return {};
 try {
  if (raw.startsWith('{') && raw.endsWith('}')) {
   const obj = JSON.parse(raw);
   if (typeof obj === 'object' && obj !== null) return obj;
  }
 } catch {}
 return {};
}
export function formatLetterMeta(meta: LetterMeta): string {
 const clean: Record<string, string> = {};
 if (meta.lockUntil) clean.lockUntil = meta.lockUntil;
 if (meta.openedBy) clean.openedBy = meta.openedBy;
 if (meta.openedAt) clean.openedAt = meta.openedAt;
 if (meta.recipient) clean.recipient = meta.recipient;
 return JSON.stringify(clean);
}
export interface MusicEmbed {
 embedUrl: string;
 platform: 'spotify'|'youtube'|'soundcloud'|'apple';
 height: number;
}
export function getMusicEmbed(url: string): MusicEmbed | null {
 if (!url) return null;
 try {
  const sp = url.match(/^https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
  if (sp) {
   return {
    embedUrl: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}?utm_source=generator&theme=0`,
    platform: 'spotify',
    height: sp[1] === 'track' ? 80 : 152
   };
  }
  const yt = url.match(/^https?:\/\/(?:www\.|music\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]+)/) ||
             url.match(/^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (yt) {
   return {
    embedUrl: `https://www.youtube.com/embed/${yt[1]}`,
    platform: 'youtube',
    height: 180
   };
  }
  const sc = url.match(/^https?:\/\/soundcloud\.com\/([^/]+)\/([^/?#]+)/);
  if (sc) {
   return {
    embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23f06292&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false`,
    platform: 'soundcloud',
    height: 80
   };
  }
  const am = url.match(/^https?:\/\/music\.apple\.com\/([a-z]{2})\/album\/([^/]+)\/([0-9]+)(?:\?i=([0-9]+))?/i);
  if (am) {
   const path = am[4] ? `${am[1]}/album/${am[2]}/${am[3]}?i=${am[4]}` : `${am[1]}/album/${am[2]}/${am[3]}`;
   return {
    embedUrl: `https://embed.music.apple.com/${path}`,
    platform: 'apple',
    height: 80
   };
  }
 } catch {}
 return null;
}
export interface PeriodOption {
 id: string;
 label: string;
}
export function getPeriodsFromEntries(entries: { event_date: string }[]): PeriodOption[] {
 const years = new Set<string>();
 const seasons = new Set<string>();
 for (const e of entries) {
  if (!e.event_date) continue;
  const year = e.event_date.slice(0, 4);
  const month = parseInt(e.event_date.slice(5, 7), 10);
  years.add(year);
  let season = '';
  if (month >= 3 && month <= 5) season = `Spring ${year}`;
  else if (month >= 6 && month <= 8) season = `Summer ${year}`;
  else if (month >= 9 && month <= 11) season = `Fall ${year}`;
  else season = `Winter ${year}`;
  seasons.add(season);
 }
 const sortedYears = Array.from(years).sort().reverse();
 const sortedSeasons = Array.from(seasons).sort().reverse();
 const options: PeriodOption[] = [];
 for (const y of sortedYears) options.push({ id: `year:${y}`, label: y });
 for (const s of sortedSeasons) options.push({ id: `season:${s}`, label: s });
 return options;
}
export function matchesPeriod(eventDate: string, periodId: string): boolean {
 if (!periodId || !eventDate) return true;
 if (periodId.startsWith('year:')) {
  return eventDate.startsWith(periodId.slice(5));
 }
 if (periodId.startsWith('season:')) {
  const parts = periodId.slice(7).split(' ');
  const season = parts[0], year = parts[1];
  if (!eventDate.startsWith(year)) return false;
  const month = parseInt(eventDate.slice(5, 7), 10);
  if (season === 'Spring') return month >= 3 && month <= 5;
  if (season === 'Summer') return month >= 6 && month <= 8;
  if (season === 'Fall') return month >= 9 && month <= 11;
  if (season === 'Winter') return month === 12 || month <= 2;
 }
 return true;
}
export function triggerConfetti() {
 try { navigator.vibrate?.([30, 40, 50, 40, 30]); } catch {}
 const container = document.createElement('div');
 container.className = 'confetti-burst-overlay';
 container.setAttribute('aria-hidden', 'true');
 const colors = ['#f06292', '#ba68c8', '#ffd54f', '#4dd0e1', '#81c784', '#ff8a65', '#ffd700'];
 const shapes = ['♡', '★', '✧', '✦', '•'];
 for (let i = 0; i < 48; i++) {
  const p = document.createElement('span');
  p.className = 'confetti-particle';
  p.textContent = shapes[i % shapes.length];
  const color = colors[i % colors.length];
  const left = Math.random() * 100;
  const delay = Math.random() * 0.4;
  const duration = 1.2 + Math.random() * 1.4;
  const xOffset = (Math.random() - 0.5) * 260;
  const size = 12 + Math.random() * 16;
  p.style.cssText = `left:${left}vw;top:-20px;color:${color};font-size:${size}px;animation:confetti-fall ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s forwards;--confetti-x:${xOffset}px;`;
  container.append(p);
 }
 document.body.append(container);
 setTimeout(() => container.remove(), 3000);
}
