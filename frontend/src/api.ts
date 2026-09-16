import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const apiUrl=import.meta.env.VITE_API_URL;
export const configured=!!(url && key && apiUrl && !url.includes('YOUR_') && !key.includes('YOUR_') && !apiUrl.includes('YOUR_'));
export const supabase=configured?createClient(url,key,{global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)})},auth:{storageKey:'ivraine-auth-v2',persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}}):null;
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 if(!supabase) throw new Error('The app is not connected yet. Follow README.md to configure it.');
 const {data:{session}}=await supabase.auth.getSession();
 if(!session) throw new Error('Please sign in again.');
 const raw=body instanceof Blob;
 const response=await fetch(`${apiUrl.replace(/\/$/,'')}/api${path}`,{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':raw?body.type:'application/json'}:{})},body:body?(raw?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(45000),cache:'no-store'});
 const payload=await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
 if(!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
 return payload as T;
}
