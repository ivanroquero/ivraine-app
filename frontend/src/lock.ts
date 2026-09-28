import type { TrackRequestBody, TrackResponse } from '@api/track';
import { initVpnGuard } from './vpnDetector';
import { initAntiInspect } from './antiInspect';
import { detectIsPwa, getSessionDurationSeconds, getSessionOpenedIso, initSessionDurationTracker } from './proposal';
import { sessionMetaTag } from './geo';

initAntiInspect();

export interface LegacyImage {
  path: string;
  data: string;
}

export interface DecryptedScrapbookPayload {
  version: number;
  images: LegacyImage[];
  html: string;
  css: string;
  js: string;
}

export interface LockScreenElements {
  screen: HTMLElement | null;
  host: HTMLElement | null;
  form: HTMLFormElement | null;
  input: HTMLInputElement | null;
  status: HTMLElement | null;
  submit: HTMLButtonElement | null;
  reveal: HTMLButtonElement | null;
}

let busy = false;
let frame: HTMLIFrameElement | null = null;
let imageUrls: string[] = [];
let generation = 0;

/**
 * Revoke object URLs allocated for decrypted image blobs to prevent memory leaks.
 */
export function clearImages(): void {
  for (const url of imageUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  imageUrls = [];
}

/**
 * Report lock screen activity to the /api/track route using strict TrackRequestBody.
 */
export async function trackLockActivity(action: string, details = '', dodgeCount = 0): Promise<TrackResponse | null> {
  try {
    const isPwa = detectIsPwa();
    const durationSeconds = getSessionDurationSeconds();
    const openedAt = getSessionOpenedIso();
    const sessionTag = sessionMetaTag({ isPwa, openedAt, durationSeconds });
    const fullDetails = `${details ? `${details} ` : ''}${sessionTag}`.trim();

    const payload: TrackRequestBody = {
      section: 'Scrapbook',
      action,
      details: fullDetails,
      dodgeCount
    };

    const res = await fetch('/api/track', {

      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });

    if (res.ok) {
      return (await res.json()) as TrackResponse;
    }
  } catch {}
  return null;
}

/**
 * Lock the scrapbook, clearing all decrypted assets from memory and restoring the passcode UI.
 */
export function lock(): void {
  generation += 1;
  if (frame) {
    frame.remove();
    frame = null;
  }

  const host = document.getElementById('scrapbook-host');
  const screen = document.getElementById('lock-screen');
  const form = document.getElementById('unlock-form') as HTMLFormElement | null;
  const input = document.getElementById('passcode') as HTMLInputElement | null;
  const status = document.getElementById('unlock-status');
  const reveal = document.getElementById('show-passcode') as HTMLButtonElement | null;

  if (host) {
    host.replaceChildren();
    host.hidden = true;
  }
  clearImages();

  if (screen) screen.hidden = false;
  if (form) form.reset();
  if (input) {
    input.type = 'password';
    input.focus({ preventScroll: true });
  }
  if (reveal) {
    reveal.textContent = 'Show';
    reveal.setAttribute('aria-label', 'Show passcode');
    reveal.setAttribute('aria-pressed', 'false');
  }
  if (status) status.textContent = '';
  document.title = 'Our Little Scrapbook';
}

/**
 * Fetches the encrypted payload from disk.
 */
export async function readSealedBook(url = 'scrapbook.sealed'): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('download');
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Renders the decrypted scrapbook into a sandboxed iframe.
 */
export async function renderDecryptedPayload(payload: DecryptedScrapbookPayload, attempt: number): Promise<void> {
  if (
    payload.version !== 1 ||
    !Array.isArray(payload.images) ||
    typeof payload.html !== 'string' ||
    typeof payload.css !== 'string' ||
    typeof payload.js !== 'string'
  ) {
    throw new Error('payload');
  }

  let html = payload.html;
  let script = payload.js;

  for (const image of payload.images) {
    const decoded = atob(image.data);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      bytes[i] = decoded.charCodeAt(i);
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    imageUrls.push(url);
    html = html.split(image.path).join(url);
    script = script.split(image.path).join(url);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (attempt !== generation || document.hidden) {
      lock();
      return;
    }
  }

  html = html
    .replace('<link rel="stylesheet" href="styles.css">', `<style>${payload.css}</style>`)
    .replace('<script src="app.js" defer></script>', '');
  html = html.replace(
    '<head>',
    '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob: data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\';">'
  );
  html = html.replace('</body>', `<script>${script.replace(/<\/script/gi, '<\\/script')}</script></body>`);

  const host = document.getElementById('scrapbook-host');
  const screen = document.getElementById('lock-screen');

  frame = document.createElement('iframe');
  frame.title = 'Ivan and Loraine\u2019s scrapbook';
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('allow', 'geolocation');
  frame.srcdoc = html;
  frame.addEventListener('load', () => frame?.focus(), { once: true });

  if (host) {
    host.append(frame);
    host.hidden = false;
  }
  if (screen) screen.hidden = true;
  document.title = 'Ivan & Loraine \u2014 Our Little Scrapbook';
}

/**
 * Attempts to unlock the scrapbook using the provided passcode.
 */
export async function unlockWithPasscode(passcode: string, sealedUrl = 'scrapbook.sealed'): Promise<void> {
  if (busy) return;
  if (!globalThis.crypto?.subtle) {
    throw new Error('Please open the HTTPS website link in your browser to unlock.');
  }

  const screen = document.getElementById('lock-screen');
  const form = document.getElementById('unlock-form') as HTMLFormElement | null;
  const input = document.getElementById('passcode') as HTMLInputElement | null;
  const status = document.getElementById('unlock-status');
  const submit = document.getElementById('unlock-button') as HTMLButtonElement | null;
  const reveal = document.getElementById('show-passcode') as HTMLButtonElement | null;

  const attempt = ++generation;
  busy = true;
  if (submit) submit.disabled = true;
  if (input) input.disabled = true;
  if (reveal) reveal.disabled = true;
  if (form) form.setAttribute('aria-busy', 'true');
  if (status) status.textContent = 'Opening our little memories\u2026';

  let phase = 'download';
  let plaintext: Uint8Array | undefined;

  try {
    const sealed = await readSealedBook(sealedUrl);
    if (sealed.length < 48 || new TextDecoder().decode(sealed.slice(0, 4)) !== 'IVR1') {
      throw new Error('format');
    }

    phase = 'unlock';
    const passwordBytes = new TextEncoder().encode(passcode);
    if (input) input.value = '';

    let keyMaterial: CryptoKey;
    try {
      keyMaterial = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
    } finally {
      passwordBytes.fill(0);
    }

    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: sealed.slice(4, 20), iterations: 600000 },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(20, 32), tagLength: 128 },
      key,
      sealed.slice(32)
    );
    plaintext = new Uint8Array(decryptedBuffer);

    phase = 'render';
    if (attempt !== generation || document.hidden) {
      lock();
      return;
    }

    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as DecryptedScrapbookPayload;
    await renderDecryptedPayload(payload, attempt);
    if (status) status.textContent = '';

    // Log successful unlock event using TrackRequestBody
    void trackLockActivity('Unlocked Scrapbook', 'Passcode verified successfully');
  } catch (err) {
    if (attempt !== generation) return;
    if (frame) {
      frame.remove();
      frame = null;
    }
    clearImages();
    const host = document.getElementById('scrapbook-host');
    if (host) host.hidden = true;
    if (screen) screen.hidden = false;

    const errMsg =
      phase === 'unlock'
        ? 'That passcode didn\u2019t open it. Please try again.'
        : phase === 'download'
        ? 'Couldn\u2019t load the scrapbook. Check your connection and try again.'
        : 'Couldn\u2019t open the scrapbook. Please reload and try again.';

    if (status) status.textContent = errMsg;

    // Log failed attempt event using TrackRequestBody
    if (phase === 'unlock') {
      void trackLockActivity('Failed Passcode Attempt', 'Incorrect passcode entered');
    }
  } finally {
    plaintext?.fill(0);
    busy = false;
    if (submit) submit.disabled = false;
    if (input) input.disabled = false;
    if (reveal) reveal.disabled = false;
    if (form) form.removeAttribute('aria-busy');
    if (screen && !screen.hidden && input) input.focus({ preventScroll: true });
  }
}

/**
 * Initializes DOM listeners for the lock screen.
 */
export function initLockScreen(): void {
  void initVpnGuard('Scrapbook');
  initSessionDurationTracker('Scrapbook', 'Visitor');
  void trackLockActivity('Opened Scrapbook', 'Visitor opened the Scrapbook web app');
  const form = document.getElementById('unlock-form') as HTMLFormElement | null;
  const input = document.getElementById('passcode') as HTMLInputElement | null;
  const reveal = document.getElementById('show-passcode') as HTMLButtonElement | null;
  const status = document.getElementById('unlock-status');

  if (reveal && input) {
    reveal.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      reveal.textContent = show ? 'Hide' : 'Show';
      reveal.setAttribute('aria-label', show ? 'Hide passcode' : 'Show passcode');
      reveal.setAttribute('aria-pressed', String(show));
    });
  }

  if (form && input) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      if (!globalThis.crypto?.subtle) {
        if (status) {
          status.textContent = 'Please open the HTTPS website link in your browser to unlock.';
        }
        return;
      }
      await unlockWithPasscode(input.value);
    });
  }

  window.addEventListener('message', (event) => {
    if (frame && event.source === frame.contentWindow && event.data?.type === 'ivraine-lock') {
      lock();
    }
  });

  window.addEventListener('ivraine-lock-request', lock);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (frame || busy)) {
      lock();
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      lock();
    }
  });
}

// Auto-initialize if DOM is ready and lock elements exist
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('unlock-form')) initLockScreen();
    });
  } else if (document.getElementById('unlock-form')) {
    initLockScreen();
  }
}
