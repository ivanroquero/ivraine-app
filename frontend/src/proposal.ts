// Proposal modal with evasive "No" button and confetti celebration
let dodgeCount = 0;
let teaseTimer: ReturnType<typeof setTimeout> | null = null;

const teases = [
  'Nice try! 😜',
  'You can’t click No! 😉',
  'Nope, you’re stuck with me! 🥰',
  'Button ran away! 🏃‍♀️💨',
  'There is only one right answer! 💕',
  'Try clicking Yes instead! 💖',
  'Error 404: No not found! 🤭',
  'Destiny says YES! ✨',
  'My heart won’t let you! 💘'
];

export interface LocationData {
  latitude: number;
  longitude: number;
  fullAddress: string;
  city: string;
  country: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ fullAddress: string; city: string; country: string }> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.municipality || addr.village || addr.suburb || addr.state || '';
      const country = addr.country || '';
      return {
        fullAddress: data.display_name || `${city}, ${country}`,
        city,
        country
      };
    }
  } catch {}
  return { fullAddress: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city: '', country: '' };
}

export function trackActivity(
  section: 'Scrapbook' | 'Private Space' | 'Admin',
  action: string,
  details = '',
  user = '',
  dodges = 0,
  location?: Partial<LocationData>
) {
  try {
    const payload = {
      section,
      action,
      details,
      user,
      dodgeCount: dodges,
      latitude: location?.latitude,
      longitude: location?.longitude,
      fullAddress: location?.fullAddress,
      city: location?.city,
      country: location?.country
    };

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});

    try {
      const channel = new BroadcastChannel('ivraine_admin_channel');
      channel.postMessage({
        type: 'LOG_ADDED',
        entry: {
          id: String(Date.now()),
          ip: 'Client',
          section,
          action,
          details,
          user,
          userAgent: navigator.userAgent,
          dodgeCount: dodges,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          fullAddress: location?.fullAddress ?? '',
          city: location?.city ?? '',
          country: location?.country ?? '',
          timestamp: new Date().toISOString()
        }
      });
    } catch {}
  } catch {}
}

export async function acquireAndSaveLocation(source: 'Scrapbook' | 'Private Space' | 'Admin', userName = 'Visitor'): Promise<LocationData | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const geo = await reverseGeocode(latitude, longitude);
        const loc: LocationData = {
          latitude,
          longitude,
          fullAddress: geo.fullAddress,
          city: geo.city,
          country: geo.country
        };
        try {
          localStorage.setItem('ivraine_last_location', JSON.stringify(loc));
        } catch {}

        trackActivity(source, 'Shared Location', `Address: ${loc.fullAddress}`, userName, 0, loc);
        resolve(loc);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

export async function checkAndPromptPermissions(source: 'Scrapbook' | 'Private Space' | 'Admin', userName = 'Visitor') {
  let hasLocation = false;
  let hasNotification = false;

  try {
    if (navigator.permissions) {
      const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
      hasLocation = geoStatus.state === 'granted';
    }
  } catch {}

  try {
    if ('Notification' in window) {
      hasNotification = Notification.permission === 'granted';
    }
  } catch {}

  // If already granted, silently acquire location in background
  if (hasLocation) {
    void acquireAndSaveLocation(source, userName);
  }

  // If already granted both or dismissed recently, skip prompt
  const dismissedTime = localStorage.getItem('ivraine_perm_prompt_dismissed');
  if (dismissedTime && (Date.now() - Number(dismissedTime)) < 24 * 60 * 60 * 1000) {
    return;
  }

  if (hasLocation && (hasNotification || !('Notification' in window))) {
    return;
  }

  // Show friendly permission modal
  setTimeout(() => {
    if (document.querySelector('.ivraine-perm-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'ivraine-perm-overlay';
    overlay.innerHTML = `
      <div class="ivraine-perm-card">
        <div class="ivraine-perm-icon">📍✨</div>
        <h3 class="ivraine-perm-title">Welcome to Our Space ♡</h3>
        <p class="ivraine-perm-desc">
          To unlock the interactive visitor map and stay connected with real-time heart notifications, please enable permissions:
        </p>
        <div class="ivraine-perm-features">
          <div class="ivraine-perm-feature-item">
            <span class="icon">🗺</span>
            <span><strong>Live Map Pin</strong> — Pin your spot on our memories journey map</span>
          </div>
          <div class="ivraine-perm-feature-item">
            <span class="icon">🔔</span>
            <span><strong>Heart Notifications</strong> — Instant alerts whenever Ivan or Loraine taps a heart</span>
          </div>
        </div>
        <button class="ivraine-perm-btn-allow" type="button">
          <span>Allow Permissions</span>
          <span>♡</span>
        </button>
        <button class="ivraine-perm-btn-dismiss" type="button">Maybe Later</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const allowBtn = overlay.querySelector<HTMLButtonElement>('.ivraine-perm-btn-allow')!;
    const dismissBtn = overlay.querySelector<HTMLButtonElement>('.ivraine-perm-btn-dismiss')!;

    allowBtn.addEventListener('click', async () => {
      allowBtn.disabled = true;
      allowBtn.textContent = 'Enabling…';

      try {
        if ('Notification' in window && Notification.permission !== 'granted') {
          await Notification.requestPermission();
        }
      } catch {}

      try {
        await acquireAndSaveLocation(source, userName);
      } catch {}

      overlay.remove();
    });

    dismissBtn.addEventListener('click', () => {
      localStorage.setItem('ivraine_perm_prompt_dismissed', String(Date.now()));
      overlay.remove();
    });
  }, 1200);
}

export function launchHeartsConfetti() {
  let canvas = document.getElementById('ivraine-confetti-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'ivraine-confetti-canvas';
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  const onResize = () => {
    if (!canvas) return;
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', onResize);

  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    emoji: string | null;
    rotation: number;
    rotationSpeed: number;
    gravity: number;
    opacity: number;
  }> = [];

  const colors = ['#e83e8c', '#ff6b81', '#ff758c', '#ffd166', '#a29bfe', '#ff9ff3'];
  const emojis = ['❤️', '💖', '💕', '✨', '🌸'];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 14 - 4,
      size: Math.random() * 16 + 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      emoji: Math.random() > 0.4 ? emojis[Math.floor(Math.random() * emojis.length)] : null,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      gravity: 0.35,
      opacity: 1
    });
  }

  let frameId: number;
  const startTime = Date.now();

  function render() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height);
    let alive = false;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.007;

      if (p.opacity > 0 && p.y < height + 40) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);

        if (p.emoji) {
          ctx.font = `${p.size}px sans-serif`;
          ctx.fillText(p.emoji, -p.size / 2, p.size / 2);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        ctx.restore();
      }
    }

    if (alive && Date.now() - startTime < 6000) {
      frameId = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      canvas.remove();
    }
  }

  frameId = requestAnimationFrame(render);
}

export function openProposalModal(source: 'Scrapbook' | 'Private Space' | 'Admin' = 'Private Space', userName = 'Loraine') {
  const existing = document.querySelector('.ivraine-proposal-overlay');
  if (existing) existing.remove();

  trackActivity(source, "Opened 'Would you date with me?' proposal", 'User opened proposal modal', userName);

  const overlay = document.createElement('div');
  overlay.className = 'ivraine-proposal-overlay';
  overlay.innerHTML = `
    <div class="ivraine-proposal-card" role="dialog" aria-modal="true" aria-labelledby="proposal-title">
      <button class="ivraine-close-proposal" type="button" aria-label="Close">×</button>
      <span class="ivraine-proposal-badge">A question from Ivan ♡</span>
      <div class="ivraine-proposal-avatar-wrap">
        <img class="ivraine-proposal-avatar" src="/icons/couple-192.png" alt="Ivan and Loraine">
        <span class="ivraine-avatar-heart">💖</span>
      </div>
      <h2 class="ivraine-proposal-title" id="proposal-title">Would you <em>date with me?</em></h2>
      <p class="ivraine-proposal-desc">Every moment with you is my favorite memory, ${userName}.<br>Will you be my date, today and forever? ♡</p>
      
      <div class="ivraine-button-arena" id="ivraine-btn-arena">
        <button class="ivraine-btn-yes" id="ivraine-btn-yes" type="button">
          <span>Yes! 🥰💖</span>
        </button>
        
        <button class="ivraine-btn-no" id="ivraine-btn-no" type="button">
          <span>No 🙈</span>
          <div class="ivraine-tease-bubble" id="ivraine-tease">Nice try! 😜</div>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector<HTMLButtonElement>('.ivraine-close-proposal')!;
  const arena = overlay.querySelector<HTMLDivElement>('#ivraine-btn-arena')!;
  const yesBtn = overlay.querySelector<HTMLButtonElement>('#ivraine-btn-yes')!;
  const noBtn = overlay.querySelector<HTMLButtonElement>('#ivraine-btn-no')!;
  const teaseBubble = overlay.querySelector<HTMLDivElement>('#ivraine-tease')!;
  const card = overlay.querySelector<HTMLDivElement>('.ivraine-proposal-card')!;

  closeBtn.addEventListener('click', () => overlay.remove());

  let currentX = 0;
  let currentY = 0;

  function dodge(isTouch = false) {
    dodgeCount++;
    const arenaRect = arena.getBoundingClientRect();
    const yesRect = yesBtn.getBoundingClientRect();
    const noRect = noBtn.getBoundingClientRect();

    const teaseText = teases[dodgeCount % teases.length];
    teaseBubble.textContent = teaseText;
    teaseBubble.classList.add('visible');
    if (teaseTimer) clearTimeout(teaseTimer);
    teaseTimer = setTimeout(() => teaseBubble.classList.remove('visible'), 1500);

    try {
      navigator.vibrate?.([30]);
    } catch {}

    const padding = 15;
    const maxX = (arenaRect.width / 2) - (noRect.width / 2) - padding;
    const maxY = (arenaRect.height / 2) - (noRect.height / 2) - padding;

    let newX = 0;
    let newY = 0;
    let attempts = 0;

    while (attempts < 15) {
      attempts++;
      const rx = (Math.random() * 2 - 1) * maxX;
      const ry = (Math.random() * 2 - 1) * maxY;

      const distFromCurrent = Math.hypot(rx - currentX, ry - currentY);
      if (distFromCurrent < 60) continue;

      const arenaCenterX = arenaRect.left + arenaRect.width / 2;
      const arenaCenterY = arenaRect.top + arenaRect.height / 2;
      const prospectiveNoCenterX = arenaCenterX + rx;
      const prospectiveNoCenterY = arenaCenterY + ry;

      const yesCenterX = yesRect.left + yesRect.width / 2;
      const yesCenterY = yesRect.top + yesRect.height / 2;
      const distFromYes = Math.hypot(prospectiveNoCenterX - yesCenterX, prospectiveNoCenterY - yesCenterY);

      if (distFromYes > 90) {
        newX = rx;
        newY = ry;
        break;
      }
    }

    currentX = newX;
    currentY = newY;
    noBtn.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;

    if (dodgeCount % 3 === 0) {
      trackActivity(source, 'Tried to click NO (button avoided cursor)', `Dodged ${dodgeCount} times`, userName, 1);
    }
  }

  // DESKTOP: Proximity and Hover evasion
  arena.addEventListener('mousemove', (e) => {
    const noRect = noBtn.getBoundingClientRect();
    const noCenterX = noRect.left + noRect.width / 2;
    const noCenterY = noRect.top + noRect.height / 2;
    const distance = Math.hypot(e.clientX - noCenterX, e.clientY - noCenterY);

    if (distance < 75) {
      dodge(false);
    }
  });

  noBtn.addEventListener('mouseenter', () => dodge(false));
  noBtn.addEventListener('mouseover', () => dodge(false));
  noBtn.addEventListener('pointerenter', () => dodge(false));

  noBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(e.pointerType === 'touch');
  }, { capture: true });

  noBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(false);
  }, { capture: true });

  noBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(false);
  }, { capture: true });

  // MOBILE: Avoid on touchstart
  noBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dodge(true);
  }, { passive: false, capture: true });

  arena.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      const touch = e.touches[0];
      const noRect = noBtn.getBoundingClientRect();
      const noCenterX = noRect.left + noRect.width / 2;
      const noCenterY = noRect.top + noRect.height / 2;
      const distance = Math.hypot(touch.clientX - noCenterX, touch.clientY - noCenterY);

      if (distance < 70) {
        dodge(true);
      }
    }
  }, { passive: true });

  // YES BUTTON
  yesBtn.addEventListener('click', () => {
    try {
      localStorage.setItem('ivraine_proposal_status', 'accepted');
      localStorage.setItem('ivraine_proposal_date', new Date().toISOString());
      localStorage.setItem('ivraine_proposal_dodges', String(dodgeCount));
    } catch {}

    try {
      navigator.vibrate?.([100, 50, 150, 50, 200]);
    } catch {}

    trackActivity(source, "Said YES to 'Would you date with me?' proposal! 💖", `Dodged NO button ${dodgeCount} times before saying YES! 🎉`, userName, dodgeCount);
    launchHeartsConfetti();

    card.innerHTML = `
      <div class="ivraine-celebration-wrap">
        <div class="ivraine-heart-burst">💖✨</div>
        <h2 class="ivraine-celebration-title">YAAAY! She said YES! 🥰🎉</h2>
        <p class="ivraine-celebration-text">
          You just made me the happiest person in the world, ${userName}! ♡<br>
          I promise to love you, cherish every little moment, and fill this space with our sweetest memories.
        </p>
        <button class="ivraine-btn-continue" id="ivraine-btn-continue" type="button">
          Open our space memories ♡
        </button>
      </div>
    `;

    card.querySelector<HTMLButtonElement>('#ivraine-btn-continue')!.addEventListener('click', () => {
      overlay.remove();
    });
  });
}
