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

  // IP / Activity tracking helper
  function trackEvent(action, details = '', dodges = 0) {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'Scrapbook',
          action: action,
          details: details,
          user: 'Loraine',
          dodgeCount: dodges
        }),
        keepalive: true
      }).catch(() => {});
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

  // Open Full Proposal Modal
  function openProposalModal() {
    // Remove existing if any
    const existing = document.querySelector('.ivraine-proposal-overlay');
    if (existing) existing.remove();

    trackEvent("Opened 'Would you date with me?' proposal", "User clicked Open this");

    const overlay = document.createElement('div');
    overlay.className = 'ivraine-proposal-overlay';
    overlay.innerHTML = `
      <div class="ivraine-proposal-card" role="dialog" aria-modal="true" aria-labelledby="proposal-title">
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
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.ivraine-close-proposal');
    const arena = overlay.querySelector('#ivraine-btn-arena');
    const yesBtn = overlay.querySelector('#ivraine-btn-yes');
    const noBtn = overlay.querySelector('#ivraine-btn-no');
    const teaseBubble = overlay.querySelector('#ivraine-tease');
    const card = overlay.querySelector('.ivraine-proposal-card');

    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    // Dodging Logic
    let currentX = 0;
    let currentY = 0;

    function dodge(isTouch = false) {
      dodgeCount++;
      const arenaRect = arena.getBoundingClientRect();
      const yesRect = yesBtn.getBoundingClientRect();
      const noRect = noBtn.getBoundingClientRect();

      // Show tease
      const teaseText = teases[dodgeCount % teases.length];
      teaseBubble.textContent = teaseText;
      teaseBubble.classList.add('visible');
      clearTimeout(teaseTimer);
      teaseTimer = setTimeout(() => {
        teaseBubble.classList.remove('visible');
      }, 1500);

      // Vibration on mobile
      try {
        navigator.vibrate?.([30]);
      } catch {}

      // Calculate safe boundaries inside arena
      const padding = 15;
      const maxX = (arenaRect.width / 2) - (noRect.width / 2) - padding;
      const maxY = (arenaRect.height / 2) - (noRect.height / 2) - padding;

      // Find a position far from Yes button and far from previous spot
      let newX = 0;
      let newY = 0;
      let attempts = 0;

      while (attempts < 15) {
        attempts++;
        const rx = (Math.random() * 2 - 1) * maxX;
        const ry = (Math.random() * 2 - 1) * maxY;

        // Check distance from current position
        const distFromCurrent = Math.hypot(rx - currentX, ry - currentY);
        if (distFromCurrent < 60) continue;

        // Compute where No button center would be relative to arena
        const arenaCenterX = arenaRect.left + arenaRect.width / 2;
        const arenaCenterY = arenaRect.top + arenaRect.height / 2;
        const prospectiveNoCenterX = arenaCenterX + rx;
        const prospectiveNoCenterY = arenaCenterY + ry;

        // Check distance from Yes button center
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

    // Pointerdown / Mousedown capture blocks fast clicks
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

    // MOBILE / TOUCH: Avoid immediately upon touch
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

    // YES BUTTON: Celebration!
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
      launchHeartsConfetti();

      card.innerHTML = `
        <div class="ivraine-celebration-wrap">
          <div class="ivraine-heart-burst">💖✨</div>
          <h2 class="ivraine-celebration-title">YAAAY! She said YES! 🥰🎉</h2>
          <p class="ivraine-celebration-text">
            You just made me the happiest person in the world, Loraine! ♡<br>
            I promise to love you, cherish every little moment, and fill this scrapbook with our sweetest memories.
          </p>
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
    });
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
