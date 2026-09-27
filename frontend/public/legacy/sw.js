'use strict';
// Each release has a complete, separate cache: shell and encrypted book move together.
const CACHE = 'ivraine-pwa-vpn-fedc82066a37cee1';
const PREFIX = 'ivraine-pwa-';
const FILES = ["index.html", "lock.css", "lock.js", "proposal.css", "proposal.js", "vpn-shield.css", "vpn-shield.js", "pwa.js", "manifest.webmanifest", "scrapbook.sealed", "icons/couple-180.png", "icons/couple-192.png", "icons/couple-32.png", "icons/couple-512.png", "icons/couple-maskable-512.png"];
const ROOT = new URL('./', self.registration.scope).href;
const urls = FILES.map(path => new URL(path, ROOT).href);
const allowed = new Set(urls);
const homepage = new URL('index.html', ROOT).href;
self.addEventListener('install', event => {
 event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
   await cache.addAll(urls.map(url => new Request(url, {cache: 'reload', credentials: 'same-origin'})));
  } catch (error) {
   await caches.delete(CACHE);
   throw error;
  }
  // Updates wait until the user accepts them, or all older app windows close.
 })());
});
self.addEventListener('activate', event => {
 event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('message', event => {
 if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET') return;
 const requested = new URL(event.request.url);
 if (requested.origin !== self.location.origin) return;
 const normalized = new URL(requested.href);
 normalized.search = '';
 normalized.hash = '';
 const isRoot = normalized.href === ROOT || normalized.href === homepage;
 const target = isRoot ? homepage : normalized.href;
 if (!allowed.has(target)) return;
 event.respondWith((async () => {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(target);
  if (cached) return cached;
  // If storage is evicted, fall back to the network without caching mismatched releases.
  try { return await fetch(event.request); }
  catch { return new Response('Offline copy unavailable. Reconnect and reopen Ivraine.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}}); }
 })());
});
