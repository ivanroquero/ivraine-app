import { dialog } from './dialogs';
interface InstallEvent extends Event {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>;}
let prompt:InstallEvent|null=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallEvent;});
export async function install(){
 if(prompt){await prompt.prompt();await prompt.userChoice;prompt=null;return;}
 dialog('Keep us close.',`<p>On iPhone or iPad: open this site in Safari, tap Share, then <strong>Add to Home Screen</strong>.</p><p>On Android: open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p><p>Private memories need an internet connection. The offline screen does not store your photos or letters.</p>`);
}
export async function registerPwa(){
 if(!('serviceWorker' in navigator)||!import.meta.env.PROD)return;
 try{
  const registration=await navigator.serviceWorker.register('/sw.js');
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){const el=dialog('A new version is ready.','<p>Save your work, then reload to use the latest version.</p><button class="primary" id="reload-app">Reload app</button>');el.querySelector('#reload-app')!.addEventListener('click',()=>location.reload());}});});
 }catch{ /* The app remains usable when installation is unavailable. */ }
}
