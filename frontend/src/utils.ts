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
export function presenceLabel(name:string, value:string|undefined, isSelf=false, now:Date|number=new Date()){const stamp = typeof now === 'number' ? now : now.getTime();const timestamp = value ? Date.parse(value) : Number.NaN;
 if (!value || !Number.isFinite(timestamp)) return `${name} · offline`;
 const minutes = Math.max(0, Math.round((stamp - timestamp) / 60000));
 if (minutes >= STALE_ACTIVITY_MINUTES) return `${name} · offline`;
 return `${name} · offline`;
}
export function isRecentlyActive(value:string|undefined, now:Date|number=new Date()){return false;}
