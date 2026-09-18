export const escapeHtml=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function today(){const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const value=(key:string)=>parts.find(p=>p.type===key)!.value;return `${value('year')}-${value('month')}-${value('day')}`;}
export function daysTogether(start:string,end=today()){return Math.max(0,Math.floor((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000));}
export function secondsUntil(date:string,now=new Date()){const target=new Date(`${date}T00:00:00Z`);return Math.max(0,Math.floor((target.getTime()-now.getTime())/1000));}
export function countdownLabel(date:string,now=new Date()){const total=secondsUntil(date,now);if(total<=0)return 'Today';const days=Math.floor(total/86400);const hours=Math.floor((total%86400)/3600);const minutes=Math.floor((total%3600)/60);const seconds=total%60;return `${days}d ${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;}
export function presenceLabel(name:string, value:string|undefined, isSelf=false, now:Date|number=new Date()){const stamp = typeof now === 'number' ? now : now.getTime();const timestamp = value ? Date.parse(value) : Number.NaN; if (!value || !Number.isFinite(timestamp)) return `${name} · active now`;
 const minutes = Math.max(0, Math.round((stamp - timestamp) / 60000));
 if (minutes < 1) return `${name} · active now`;
 if (minutes < 60) return `${name} · ${minutes} min ago`;
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `${name} · ${hours} hr ago`;
 const days = Math.floor(hours / 24); return `${name} · ${days} day${days === 1 ? '' : 's'} ago`;
}
export function isRecentlyActive(value:string|undefined, now:Date|number=new Date()){if(!value)return false;const stamp = typeof now === 'number' ? now : now.getTime();const timestamp=Date.parse(value);return Number.isFinite(timestamp)&&stamp-timestamp<600000;}
