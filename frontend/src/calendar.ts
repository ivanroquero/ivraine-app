import type { Book, Entry } from './types';
import { today } from './utils';
export interface Occurrence {id:string;title:string;date:string;automatic?:boolean;}
const iso=(y:number,m:number,d:number)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
function clampDay(y:number,m:number,d:number){return Math.min(d,new Date(Date.UTC(y,m+1,0)).getUTCDate());}
export function monthEvents(book:Book,entries:Entry[],year:number,month:number):Occurrence[]{
 const out:Occurrence[]=[];
 const [ay,am,ad]=book.anniversary.split('-').map(Number);
 if(year*12+month>=ay*12+am-1){
  const isAnniversary=month===am-1 && year>ay;
  const isFirstDay=month===am-1 && year===ay;
  const title=isAnniversary?`${year-ay} year${year-ay===1?'':'s'} together`:isFirstDay?'The Day We Met / Our Official Date':'Our monthly milestone';
  out.push({id:'anniversary',title,date:iso(year,month,clampDay(year,month,ad)),automatic:true});
 }
 for(const e of entries.filter(e=>e.kind==='date'||(e.kind==='plan'&&!e.completed))){
  const [y,m,d]=e.event_date.split('-').map(Number);
  if(year*12+month<y*12+m-1)continue;
  if(e.recurrence==='monthly'||(e.recurrence==='yearly'&&month===m-1)||(year===y&&month===m-1))out.push({id:e.id,title:e.title,date:iso(year,month,clampDay(year,month,d))});
 }
 return out.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
export function nextEvent(book:Book,entries:Entry[],now=today()):Occurrence|undefined{
 const date=new Date(`${now}T00:00:00Z`);
 for(let i=0;i<14;i++){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+i,1));const next=monthEvents(book,entries,d.getUTCFullYear(),d.getUTCMonth()).find(e=>e.date>=now);if(next)return next;}
}
