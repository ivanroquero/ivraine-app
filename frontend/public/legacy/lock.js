'use strict';
(() => {
  const screen = document.getElementById('lock-screen');
  const host = document.getElementById('scrapbook-host');
  const form = document.getElementById('unlock-form');
  const input = document.getElementById('passcode');
  const status = document.getElementById('unlock-status');
  const submit = document.getElementById('unlock-button');
  const reveal = document.getElementById('show-passcode');
  let busy = false;
  let frame = null;
  let imageUrls = [];
  let generation = 0;
  function clearImages() { imageUrls.forEach(url => URL.revokeObjectURL(url)); imageUrls = []; }
  function lock() {
    generation += 1;
    if (frame) frame.remove();
    frame = null;
    host.replaceChildren();
    host.hidden = true;
    clearImages();
    screen.hidden = false;
    form.reset();
    input.type = 'password';
    reveal.textContent = 'Show';
    reveal.setAttribute('aria-label', 'Show passcode');
    reveal.setAttribute('aria-pressed', 'false');
    status.textContent = '';
    document.title = 'Our Little Scrapbook';
    input.focus({preventScroll: true});
  }
  reveal.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    reveal.textContent = show ? 'Hide' : 'Show';
    reveal.setAttribute('aria-label', show ? 'Hide passcode' : 'Show passcode');
    reveal.setAttribute('aria-pressed', String(show));
  });
  async function readSealedBook() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('scrapbook.sealed', {cache: 'no-store', credentials: 'omit', signal: controller.signal});
      if (!response.ok) throw new Error('download');
      return new Uint8Array(await response.arrayBuffer());
    } finally { clearTimeout(timeout); }
  }
  async function render(payload, attempt) {
    if (payload.version !== 1 || !Array.isArray(payload.images) || typeof payload.html !== 'string' || typeof payload.css !== 'string' || typeof payload.js !== 'string') throw new Error('payload');
    let html = payload.html;
    let script = payload.js;
    for (const image of payload.images) {
      const decoded = atob(image.data);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], {type: 'image/jpeg'}));
      imageUrls.push(url);
      html = html.split(image.path).join(url);
      script = script.split(image.path).join(url);
      await new Promise(resolve => setTimeout(resolve, 0));
      if (attempt !== generation || document.hidden) { lock(); return; }
    }
    html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${payload.css}</style>`).replace('<script src="app.js" defer></script>', '');
    html = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; img-src blob: data:; style-src &apos;unsafe-inline&apos;; script-src &apos;unsafe-inline&apos;; base-uri &apos;none&apos;; form-action &apos;none&apos;">');
    html = html.replace('</body>', `<script>${script.replace(/<\/script/gi, '<\\/script')}</script></body>`);
    // Decrypted content stays in memory; the frame separates scrapbook layout from the lock UI.
    frame = document.createElement('iframe');
    frame.title = 'Ivan and Loraine’s scrapbook';
    // Authenticated, locally authored content. Same origin keeps blob photos reliable on mobile.
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.srcdoc = html;
    frame.addEventListener('load', () => frame?.focus(), {once: true});
    host.append(frame);
    host.hidden = false;
    screen.hidden = true;
    document.title = 'Ivan & Loraine — Our Little Scrapbook';
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    if (!globalThis.crypto?.subtle) { status.textContent = 'Please open the HTTPS website link in your browser to unlock.'; return; }
    const attempt = ++generation;
    busy = true;
    submit.disabled = true;
    input.disabled = true;
    reveal.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Opening our little memories…';
    let phase = 'download';
    let plaintext;
    try {
      const sealed = await readSealedBook();
      if (sealed.length < 48 || new TextDecoder().decode(sealed.slice(0, 4)) !== 'IVR1') throw new Error('format');
      phase = 'unlock';
      const passwordBytes = new TextEncoder().encode(input.value);
      input.value = '';
      let keyMaterial;
      try { keyMaterial = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']); }
      finally { passwordBytes.fill(0); }
      const key = await crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt: sealed.slice(4, 20), iterations: 600000}, keyMaterial, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
      plaintext = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: sealed.slice(20, 32), tagLength: 128}, key, sealed.slice(32)));
      phase = 'render';
      if (attempt !== generation || document.hidden) { lock(); return; }
      await render(JSON.parse(new TextDecoder().decode(plaintext)), attempt);
      status.textContent = '';
    } catch {
      if (attempt !== generation) return;
      if (frame) { frame.remove(); frame = null; }
      clearImages();
      host.hidden = true;
      screen.hidden = false;
      status.textContent = phase === 'unlock' ? 'That passcode didn’t open it. Please try again.' : phase === 'download' ? 'Couldn’t load the scrapbook. Check your connection and try again.' : 'Couldn’t open the scrapbook. Please reload and try again.';
    } finally {
      plaintext?.fill(0);
      busy = false;
      submit.disabled = false;
      input.disabled = false;
      reveal.disabled = false;
      form.removeAttribute('aria-busy');
      if (!screen.hidden) input.focus({preventScroll: true});
    }
  });
  window.addEventListener('message', event => { if (frame && event.source === frame.contentWindow && event.data?.type === 'ivraine-lock') lock(); });
  window.addEventListener('ivraine-lock-request', lock);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (frame || busy)) lock();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) lock(); });
})();
