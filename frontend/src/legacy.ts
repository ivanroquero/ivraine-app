import { api } from './api';
import { today } from './utils';
interface LegacyImage {path:string;data:string;}
interface Payload {version:number;images:LegacyImage[];html:string;css:string;js:string;}
export async function unlockLegacy(passcode:string):Promise<Payload>{
 const response=await fetch('/legacy/scrapbook.sealed',{cache:'no-store',signal:AbortSignal.timeout(45000)});
 if(!response.ok) throw new Error('Could not load the original scrapbook.');
 const buffer=await response.arrayBuffer();const bytes=new Uint8Array(buffer);
 if(new TextDecoder().decode(bytes.slice(0,4))!=='IVR1') throw new Error('Unsupported original scrapbook.');
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passcode),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes.slice(4,20),iterations:600000},material,{name:'AES-GCM',length:256},false,['decrypt']);
 let decrypted:ArrayBuffer;
 try{decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(20,32)},key,bytes.slice(32));}catch{throw new Error('That passcode did not open the original scrapbook.');}
 try{const p=JSON.parse(new TextDecoder().decode(decrypted)) as Payload;
 if(p.version!==1 || !Array.isArray(p.images)||p.images.length>200 || typeof p.html!=='string') throw new Error('Unsupported scrapbook content.');return p;
 }finally{new Uint8Array(decrypted).fill(0);}
}
async function stableId(path:string){const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`ivraine-legacy-v1:${path}`)));hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;const h=Array.from(hash.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export async function importLegacy(payload:Payload,existing:Set<string>,progress:(message:string)=>void){
 const doc=new DOMParser().parseFromString(payload.html,'text/html');let count=0;
 for(const [index,image] of payload.images.entries()){
  if(typeof image.path!=='string'||typeof image.data!=='string') throw new Error('Invalid image in original scrapbook.');
  const id=await stableId(image.path);if(existing.has(id)) continue;
  progress(`Importing photo ${index+1} of ${payload.images.length}…`);
  const bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));
  const {path}=await api<{path:string}>('/photos','POST',new Blob([bytes],{type:'image/jpeg'}));
  const element=Array.from(doc.images).find(el=>el.getAttribute('src')===image.path);
  const caption=element?.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
  try{await api('/entries','POST',{id,kind:'memory',title:(caption||element?.alt||`Original photo ${index+1}`).slice(0,160),body:'Imported from our original scrapbook. Update the date and story to match this memory.',event_date:today(),location:'',photo_paths:[path]});count++;}
  catch(error){await api('/photos','DELETE',{path}).catch(()=>undefined);throw error;}
 }
 return count;
}
