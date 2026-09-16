'use strict';
(() => {
 const installButton = document.getElementById('install-app');
 const helpButton = document.getElementById('install-help');
 const installDialog = document.getElementById('install-dialog');
 const offlineStatus = document.getElementById('offline-status');
 const updateBar = document.getElementById('update-bar');
 const applyUpdate = document.getElementById('apply-update');
 let pendingPrompt = null;
 let installedThisSession = false;
 let registration = null;
 let reloadForUpdate = false;
 const standalone = window.matchMedia('(display-mode: standalone)');
 const isInstalled = () => installedThisSession || standalone.matches || navigator.standalone === true;
 function refreshInstallUI() {
  installButton.hidden = !pendingPrompt || isInstalled();
  helpButton.hidden = isInstalled() || !!pendingPrompt;
 }
 refreshInstallUI();
 standalone.addEventListener('change', refreshInstallUI);
 window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingPrompt = event;
  refreshInstallUI();
 });
 window.addEventListener('appinstalled', () => { installedThisSession = true; pendingPrompt = null; installButton.hidden = true; helpButton.hidden = true; });
 installButton.addEventListener('click', async () => {
  const prompt = pendingPrompt;
  if (!prompt) return;
  pendingPrompt = null;
  installButton.disabled = true;
  try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') installedThisSession = true; }
  catch { helpButton.hidden = false; }
  finally { installButton.disabled = false; refreshInstallUI(); }
 });
 helpButton.addEventListener('click', () => {
  const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  document.getElementById('install-instructions').textContent = isiOS
   ? 'Open this link in Safari. Tap Share, then Add to Home Screen, and confirm Add. If you see “Open as Web App”, leave it enabled.'
   : 'Open this link in Chrome or Edge. Open the browser menu and choose Install app or Add to Home screen. If you opened it inside Messenger, first choose Open in browser.';
  installDialog.showModal();
 });
 document.getElementById('close-install').addEventListener('click', () => installDialog.close());
 document.getElementById('dismiss-update').addEventListener('click', () => { updateBar.hidden = true; });
 applyUpdate.addEventListener('click', () => {
  if (!registration?.waiting) return;
  window.dispatchEvent(new Event('ivraine-lock-request'));
  reloadForUpdate = true;
  applyUpdate.disabled = true;
  registration.waiting.postMessage({type: 'ACTIVATE_UPDATE'});
 });
 function observeWorker(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
   if (worker.state === 'installed') {
    if (navigator.serviceWorker.controller) updateBar.hidden = false;
    else offlineStatus.textContent = 'Ready offline. Your passcode is still required.';
   }
   if (worker.state === 'redundant' && !registration?.active) offlineStatus.textContent = 'Offline setup isn’t ready. Keep the app online and reopen it to retry.';
  });
 }
 if ('serviceWorker' in navigator && window.isSecureContext) {
  offlineStatus.textContent = 'Preparing encrypted memories for offline use…';
  navigator.serviceWorker.addEventListener('controllerchange', () => {
   if (reloadForUpdate) { location.reload(); return; }
   offlineStatus.textContent = 'Ready offline. Your passcode is still required.';
  });
  navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'}).then(reg => {
   registration = reg;
   if (reg.active) offlineStatus.textContent = 'Ready offline. Your passcode is still required.';
   if (reg.waiting) updateBar.hidden = false;
   observeWorker(reg.installing);
   reg.addEventListener('updatefound', () => observeWorker(reg.installing));
  }).catch(() => { offlineStatus.textContent = 'You can use the scrapbook online. Offline setup is unavailable in this browser.'; });
  window.addEventListener('online', () => { registration?.update().catch(() => {}); });
 } else offlineStatus.textContent = 'Open the HTTPS website link to install the app.';
})();
