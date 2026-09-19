import { dialog } from './dialogs';
interface InstallEvent extends Event {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>;}
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone === true;
let prompt:InstallEvent|null=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallEvent;});
export async function install(){
 if(isStandalone())return;
 if(prompt){
  const el=dialog('Install IVRAINE',`<p>Keep your private space one tap away.</p><p>Install the app for a cleaner, app-like experience with a full-screen launch and smoother motion.</p><div class="install-actions"><button class="primary" id="install-app-now">Install app</button><button class="secondary" id="install-later">Maybe later</button></div>`);
  el.querySelector<HTMLButtonElement>('#install-app-now')?.addEventListener('click',async()=>{
   try{await prompt!.prompt();await prompt!.userChoice;prompt=null;el.close();}
   catch{el.close();}
  });
  el.querySelector<HTMLButtonElement>('#install-later')?.addEventListener('click',()=>el.close());
  return;
 }
 const el=dialog('Install IVRAINE',`<p>On iPhone or iPad: tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.</p><p>On Android: open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p><p>Private memories need a connection, and the offline page only keeps a basic fallback screen.</p>`);
 el.querySelector<HTMLButtonElement>('.close-button')?.addEventListener('click',()=>el.close(),{once:true});
}
export async function registerPwa(){
 if(!('serviceWorker' in navigator)||!import.meta.env.PROD)return;
 try{
  const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
  document.documentElement.dataset.pwa = isStandalone() ? 'standalone' : 'browser';
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){const el=dialog('A new version is ready.','<p>Save your work, then reload to use the latest version.</p><button class="primary" id="reload-app">Reload app</button>');el.querySelector<HTMLButtonElement>('#reload-app')?.addEventListener('click',()=>location.reload());}});});
 }catch{ /* The app remains usable when installation is unavailable. */ }
}
