import { dialog } from './dialogs';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string; platform: string }>;
}

/**
 * Detects if the app is currently running in standalone native mode:
 * - Standalone PWA window
 * - Fullscreen display mode
 * - iOS standalone webclip (navigator.standalone)
 * - Android TWA (Trusted Web Activity via referrer 'android-app://')
 */
export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith('android-app://')
  );
};

let prompt: InstallEvent | null = null;
let wakeLockSentinel: any = null;

// Immediately mark document mode for instant CSS styling without layout jump
if (typeof document !== 'undefined') {
  const markDisplayMode = () => {
    const standalone = isStandalone();
    document.documentElement.dataset.pwa = standalone ? 'standalone' : 'browser';
    document.documentElement.classList.toggle('is-standalone', standalone);
  };
  markDisplayMode();
  window.matchMedia('(display-mode: standalone)').addEventListener('change', markDisplayMode);
}

// Intercept browser install prompt
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  prompt = event as InstallEvent;
  window.dispatchEvent(new CustomEvent('ivraine-can-install'));
});

window.addEventListener('appinstalled', () => {
  prompt = null;
  document.documentElement.dataset.pwa = 'standalone';
  document.documentElement.classList.add('is-standalone');
});

/**
 * Prevents iOS Safari & Android WebViews from breaking out to a browser window
 * when internal links are clicked. Keeps 100% of navigations inside the native container.
 */
export function initStandaloneLinkInterceptor() {
  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a') as HTMLAnchorElement | null;
    if (!anchor || !anchor.href) return;

    // Ignore anchors meant for download, hash navigation, mailto, tel, or javascript
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || anchor.hasAttribute('download')) {
      return;
    }

    // Only intercept same-origin links
    if (anchor.origin === window.location.origin) {
      if (isStandalone() || /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        // Prevent opening Mobile Safari or Chrome tab
        event.preventDefault();
        window.location.assign(anchor.href);
      }
    }
  }, { capture: true });
}

/**
 * Screen Wake Lock: Keeps the device screen on during memory viewing, letters, or audio listening.
 */
export async function requestWakeLock(): Promise<boolean> {
  if ('wakeLock' in navigator && !wakeLockSentinel) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

/**
 * App Badging API: Shows unread badges on the home screen/dock icon.
 */
export async function setBadge(count?: number) {
  if ('setAppBadge' in navigator) {
    try {
      if (count === undefined || count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch {}
  }
}

export async function clearBadge() {
  if ('clearAppBadge' in navigator) {
    try {
      await (navigator as any).clearAppBadge();
    } catch {}
  }
}

/**
 * Haptic Vibration Feedback
 */
export function buzz(pattern: number[] = [15]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

/**
 * Web Share API: Native sharing sheet for memories or photos
 */
export async function shareContent(data: { title: string; text: string; url?: string }): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Network Connectivity Monitor: Displays sleek native pill indicator on state changes.
 */
export function initNetworkStatusMonitor() {
  let indicator = document.getElementById('ivraine-network-pill') as HTMLDivElement | null;
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'ivraine-network-pill';
    indicator.className = 'network-pill';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    document.body.appendChild(indicator);
  }

  let dismissTimer: ReturnType<typeof setTimeout>;

  const showPill = (msg: string, isOnline: boolean) => {
    if (!indicator) return;
    clearTimeout(dismissTimer);
    indicator.innerHTML = msg;
    indicator.className = `network-pill is-visible ${isOnline ? 'is-online' : 'is-offline'}`;
    buzz(isOnline ? [20, 30] : [50]);

    if (isOnline) {
      dismissTimer = setTimeout(() => {
        indicator?.classList.remove('is-visible');
      }, 2600);
    }
  };

  window.addEventListener('offline', () => {
    showPill('<span>⚡ Offline Mode</span> &bull; <span>Viewing cached scrapbook</span>', false);
  });

  window.addEventListener('online', () => {
    showPill('<span>✓ Back Online</span> &bull; <span>Synced</span>', true);
  });

  if (!navigator.onLine) {
    showPill('<span>⚡ Offline Mode</span> &bull; <span>Viewing cached scrapbook</span>', false);
  }
}

/**
 * Modern In-App Install Experience
 */
export async function install() {
  if (isStandalone()) {
    const el = dialog(
      'Ivraine is Already Installed',
      `<div style="text-align:center;padding:12px 0;">
        <div style="font-size:36px;margin-bottom:12px;">✨</div>
        <p style="margin:0 0 10px;font-size:14px;color:var(--text);">You're already running Ivraine in full native standalone mode.</p>
        <p style="font-size:12px;color:var(--muted);line-height:1.5;">Enjoy full-screen immersion without browser bars, smooth offline caching, and push notifications.</p>
      </div>`
    );
    el.querySelector<HTMLButtonElement>('.close-button')?.addEventListener('click', () => el.close(), { once: true });
    return;
  }

  // 1. Android / Chrome / Edge native install prompt
  if (prompt) {
    const el = dialog(
      'Install Ivraine',
      `<div class="install-sheet-body">
        <div class="install-badge-row">
          <img src="/icons/couple-192.png" alt="Ivraine App" class="install-app-icon" width="64" height="64">
          <div class="install-badge-info">
            <h3 style="margin:0;font-size:18px;">Ivraine</h3>
            <span style="font-size:11px;color:var(--muted);">Our Little Scrapbook &bull; Just between us</span>
            <div class="install-tags" style="margin-top:4px;">
              <span class="tag">⚡ Standalone</span>
              <span class="tag">🔒 Private</span>
              <span class="tag">♡ Offline Ready</span>
            </div>
          </div>
        </div>
        <p style="font-size:13px;color:var(--muted);line-height:1.6;margin:16px 0;">
          Install to your home screen or desktop for a true full-screen native experience with zero browser address bar, instant startup, and push notifications.
        </p>
        <div class="install-actions" style="display:flex;gap:10px;margin-top:16px;">
          <button class="primary" id="install-app-now" style="flex:1;">Install App</button>
          <button class="secondary" id="install-later">Maybe later</button>
        </div>
      </div>`
    );

    el.querySelector<HTMLButtonElement>('#install-app-now')?.addEventListener('click', async () => {
      try {
        buzz([20, 40]);
        await prompt!.prompt();
        const choice = await prompt!.userChoice;
        if (choice.outcome === 'accepted') {
          prompt = null;
        }
        el.close();
      } catch {
        el.close();
      }
    });
    el.querySelector<HTMLButtonElement>('#install-later')?.addEventListener('click', () => el.close());
    return;
  }

  // 2. iOS Safari or browser guidance
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instructions = isIOS
    ? `<div class="ios-install-steps">
        <div class="ios-step">
          <span class="step-num">1</span>
          <p>Tap the <strong>Share</strong> button <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;display:inline-block;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> at the bottom of Safari.</p>
        </div>
        <div class="ios-step">
          <span class="step-num">2</span>
          <p>Scroll down and tap <strong>Add to Home Screen</strong> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;display:inline-block;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>.</p>
        </div>
        <div class="ios-step">
          <span class="step-num">3</span>
          <p>Tap <strong>Add</strong> in the top-right corner. Ivraine will open with <strong>no Safari address bar</strong>!</p>
        </div>
      </div>`
    : `<p>On Android or Desktop: open the browser menu (⋮) and choose <strong>Install Ivraine</strong> or <strong>Add to Home Screen</strong>.</p>
       <p style="font-size:12px;color:var(--muted);">Private memories stay offline and protected on your device.</p>`;

  const el = dialog(
    'Add Ivraine to Home Screen',
    `<div class="install-sheet-body">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <img src="/icons/couple-192.png" alt="Ivraine App" style="border-radius:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);" width="52" height="52">
        <div>
          <h3 style="margin:0;font-size:16px;">Ivraine</h3>
          <span style="font-size:11px;color:var(--muted);">Our Little Scrapbook &bull; Standalone Web App</span>
        </div>
      </div>
      ${instructions}
    </div>`
  );
  el.querySelector<HTMLButtonElement>('.close-button')?.addEventListener('click', () => el.close(), { once: true });
}

/**
 * Service Worker Registration & Modern App Lifecycle
 */
export async function registerPwa() {
  initStandaloneLinkInterceptor();
  initNetworkStatusMonitor();

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          const el = dialog(
            'A New Update is Ready',
            `<p>A fresh update for Ivraine is ready with the latest memories and optimizations.</p>
             <button class="primary" id="reload-app" style="width:100%;margin-top:12px;">Reload App</button>`
          );
          el.querySelector<HTMLButtonElement>('#reload-app')?.addEventListener('click', () => {
            buzz([20]);
            location.reload();
          });
        }
      });
    });

    // When returning online, trigger service worker update check
    window.addEventListener('online', () => {
      registration.update().catch(() => {});
    });
  } catch {
    /* Safe fallback if SW unsupported */
  }
}
