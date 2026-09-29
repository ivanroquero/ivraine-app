import * as THREE from 'three';
import confetti from 'canvas-confetti';
import './monthsary3d.css';
import type {
  MonthsaryConfig,
  MonthsaryButtonVisibility,
  MonthsaryAnswerItem,
  MonthsarySubmission,
  MonthsaryAnswersResponse
} from '@api/types';

// Default configuration for 1st Monthsary
export const DEFAULT_MONTHSARY_DATA: MonthsaryConfig = {
  enabled: true,
  buttonVisibility: 'visible',
  letterTitle: 'Happy 1st Monthsary, My Love ♡',
  letterGreeting: 'Dearest Loraine,',
  letterBody: `Happy 1st Monthsary, my beautiful love! ✨

Can you believe it has already been 30 incredible days since September 2, 2026? Every single moment with you has felt like a dream I never want to wake up from. From our late-night conversations to the simple laughs that brighten my whole world, having you in my life is the greatest blessing I could ever ask for.

Thank you for your warmth, your pure heart, your gentle patience, and for loving me the way you do. You have turned ordinary days into unforgettable memories, and you make every single second worth cherishing.

This is only the very first page of our forever story. No matter what comes our way, I promise to hold your hand tighter, choose you every single day, and love you more than yesterday but less than tomorrow.

Happy 1st Month to us, my baby! Here is to a lifetime of love, laughter, and endless adventures with you.`,
  letterSignoff: 'Forever & Always Yours,\nIvan ♡',
  musicEnabled: true,
  vows: [
    'Promise to always make you smile even on the hardest days.',
    'Promise to listen to your stories with my whole heart.',
    'Promise to choose you and only you, today and for all our tomorrows.'
  ]
};

// 5 Romantic Monthsary Questions for Her
export interface MonthsaryQuestion {
  id: number;
  question: string;
  options: { key: string; text: string; reaction: string }[];
}

export const MONTHSARY_QUESTIONS: MonthsaryQuestion[] = [
  {
    id: 1,
    question: 'Do you know what makes today so magical, my love?',
    options: [
      { key: 'A', text: 'Exactly 1 month of falling deeper in love with you every single day ♡', reaction: 'Yes, my love! Exactly 1 month of pure bliss with you! 🥰' },
      { key: 'B', text: '30 days since our beautiful story officially began on September 2, 2026 ✨', reaction: 'September 2 will forever be my favorite landmark date! 💖' },
      { key: 'C', text: '720 hours of you being my favorite person in the entire universe 🌌', reaction: 'Every single second with you is a treasure to my heart! ✨' },
      { key: 'D', text: 'All of the above — and just the beginning of our forever! 💖', reaction: 'Bingo! All of the above and so much more! My whole heart is yours! 💕' }
    ]
  },
  {
    id: 2,
    question: 'What is my absolute favorite thing about you?',
    options: [
      { key: 'A', text: 'Your sweet, adorable smile that melts my heart instantly 😊', reaction: 'Your smile truly lights up every corner of my world! ✨' },
      { key: 'B', text: 'How gentle, caring, and genuine your beautiful heart is 💕', reaction: 'You have the purest, most wonderful heart I have ever known. 🥺' },
      { key: 'C', text: 'The way we laugh and make ordinary moments feel like magic ✨', reaction: 'Every little laugh with you is my absolute favorite sound. 💫' },
      { key: 'D', text: 'Every single little thing about you — you are my everything ♡', reaction: 'Every glance, every smile, every detail — I adore all of you! 💖' }
    ]
  },
  {
    id: 3,
    question: 'If I could pause time at one moment in our first month, when would it be?',
    options: [
      { key: 'A', text: 'The moment our eyes met and my heart whispered "She\'s the one" 🥺', reaction: 'My heart knew it before my words could even speak it! 💘' },
      { key: 'B', text: 'Those late-night talks where hours slipped away like minutes 💬', reaction: 'I could talk with you forever and never run out of love. 🌙' },
      { key: 'C', text: 'Every time I hold you close and the world disappears around us 🫂', reaction: 'In your arms is the safest, warmest place on earth. ♡' },
      { key: 'D', text: 'Right now — because every tomorrow with you is even brighter! ✨', reaction: 'Here\'s to all our tomorrows together, my love! 🥂' }
    ]
  },
  {
    id: 4,
    question: 'How long do I want to keep loving and cherishing you?',
    options: [
      { key: 'A', text: 'Through every sunrise, every season, and every year ahead 🌅', reaction: 'Through every season, I will stand right by your side. 🌸' },
      { key: 'B', text: 'For the rest of this lifetime and beyond 🌌', reaction: 'One lifetime is not enough to love you the way you deserve! ✨' },
      { key: 'C', text: 'Today, tomorrow, and every tomorrow that comes after that 💫', reaction: 'Day after day, my heart will always choose you. 💖' },
      { key: 'D', text: 'Infinity times infinity plus one ♡', reaction: 'To infinity and past the edge of the universe! 🚀♡' }
    ]
  },
  {
    id: 5,
    question: 'Are you ready to unlock my 1st Monthsary love letter written just for you?',
    options: [
      { key: 'A', text: 'Yes! Open it right now, Ivan! 💖', reaction: 'Opening your special letter right now, baby! 💌' },
      { key: 'B', text: 'My heart is so ready, show me! 🥰', reaction: 'Unsealing our 1st month keepsake with all my love! ✨' },
      { key: 'C', text: 'I love you so much, let\'s open it! 💌', reaction: 'I love you even more! Here it is, my Loraine! 💕' },
      { key: 'D', text: 'Yes with all my heart and soul ♡', reaction: 'Unfolding our first month love letter for you! 💖' }
    ]
  }
];

// Helper: Local Storage for Monthsary Config
export function getMonthsaryConfig(): MonthsaryConfig {
  try {
    const raw = localStorage.getItem('ivraine_monthsary_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_MONTHSARY_DATA, ...parsed };
      }
    }
  } catch {}
  return { ...DEFAULT_MONTHSARY_DATA };
}

export function saveMonthsaryConfig(config: Partial<MonthsaryConfig>): void {
  try {
    const current = getMonthsaryConfig();
    const updated = { ...current, ...config, updatedAt: new Date().toISOString() };
    localStorage.setItem('ivraine_monthsary_config', JSON.stringify(updated));
    const channel = new BroadcastChannel('ivraine_admin_channel');
    channel.postMessage({ type: 'MONTHSARY_CONFIG_UPDATE', config: updated });
  } catch {}
}

export function getMonthsaryVisibility(): MonthsaryButtonVisibility {
  const cfg = getMonthsaryConfig();
  return cfg.buttonVisibility || 'visible';
}

export function setMonthsaryVisibility(val: MonthsaryButtonVisibility): void {
  saveMonthsaryConfig({ buttonVisibility: val });
}

// -----------------------------------------------------------------------------
// Monthsary Quiz Answers Submission & Management Helpers
// -----------------------------------------------------------------------------
export async function submitMonthsaryAnswers(submission: MonthsarySubmission): Promise<boolean> {
  // 1. Save to local storage cache
  try {
    const list: MonthsarySubmission[] = getStoredMonthsaryAnswers();
    const updated = [submission, ...list.filter(s => s.id !== submission.id)];
    localStorage.setItem('ivraine_monthsary_submissions', JSON.stringify(updated));
  } catch {}

  // 2. Broadcast immediately to any open Admin dashboard tab
  try {
    const channel = new BroadcastChannel('ivraine_admin_channel');
    channel.postMessage({ type: 'MONTHSARY_ANSWERS_ADDED', submission });
  } catch {}

  // 3. Post to backend/Supabase API
  try {
    await fetch('/api/monthsary/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission)
    });
  } catch {}

  // 4. Also track in main visitor activity log
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'Private Space',
        action: '💌 Answered 1st Monthsary Quiz',
        user: submission.user || 'Loraine',
        details: `5 Questions Answered: ${submission.summary || ''}`
      })
    });
  } catch {}

  return true;
}

export function getStoredMonthsaryAnswers(): MonthsarySubmission[] {
  try {
    const raw = localStorage.getItem('ivraine_monthsary_submissions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export async function deleteMonthsarySubmission(id: string): Promise<boolean> {
  // 1. Delete from local storage
  try {
    if (id === 'all') {
      localStorage.removeItem('ivraine_monthsary_submissions');
    } else {
      const list = getStoredMonthsaryAnswers().filter(s => s.id !== id);
      localStorage.setItem('ivraine_monthsary_submissions', JSON.stringify(list));
    }
  } catch {}

  // 2. Broadcast to other tabs
  try {
    const channel = new BroadcastChannel('ivraine_admin_channel');
    channel.postMessage({ type: 'MONTHSARY_ANSWERS_DELETED', id });
  } catch {}

  // 3. Delete from backend/Supabase
  try {
    const res = await fetch(`/api/monthsary/answers?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch {
    return false;
  }
}


// -----------------------------------------------------------------------------
// Web Audio Synthesizer: Sweet Romantic Chimes & Background Music Box
// -----------------------------------------------------------------------------
let audioCtx: AudioContext | null = null;
let musicBoxInterval: ReturnType<typeof setInterval> | null = null;
let isMusicPlaying = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Play sweet harmonic chime when user answers quiz question
export function playChimeSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Chime chord: E5, G#5, B5, E6
    const freqs = [659.25, 830.61, 987.77, 1318.51];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.95);
    });
  } catch {}
}

// Start gentle ambient romantic lullaby / music box chords
export function startRomanticMusicBox(onStateChange?: (playing: boolean) => void): void {
  if (isMusicPlaying) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  isMusicPlaying = true;
  onStateChange?.(true);

  // Romantic chord progression arpeggios (Cmaj9, Am9, Fmaj7, G6)
  const notes = [
    523.25, 659.25, 783.99, 987.77, 1046.50, // C5, E5, G5, B5, C6
    440.00, 523.25, 659.25, 830.61, 880.00,  // A4, C5, E5, G#5, A5
    349.23, 440.00, 523.25, 659.25, 698.46,  // F4, A4, C5, E5, F5
    392.00, 493.88, 587.33, 783.99, 880.00   // G4, B4, D5, G5, A5
  ];
  let noteIndex = 0;

  musicBoxInterval = setInterval(() => {
    if (!isMusicPlaying || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freq = notes[noteIndex % notes.length];
      noteIndex++;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 1.25);
    } catch {}
  }, 450);
}

export function stopRomanticMusicBox(onStateChange?: (playing: boolean) => void): void {
  if (!isMusicPlaying) return;
  isMusicPlaying = false;
  if (musicBoxInterval) {
    clearInterval(musicBoxInterval);
    musicBoxInterval = null;
  }
  onStateChange?.(false);
}

export function toggleRomanticMusicBox(onStateChange?: (playing: boolean) => void): boolean {
  if (isMusicPlaying) {
    stopRomanticMusicBox(onStateChange);
    return false;
  } else {
    startRomanticMusicBox(onStateChange);
    return true;
  }
}

// -----------------------------------------------------------------------------
// Live Relationship Time Elapsed Calculator (Sept 2, 2026 Anniversary)
// -----------------------------------------------------------------------------
export function calculateAnniversaryElapsed(): {
  days: number;
  hours: number;
  mins: number;
  secs: number;
  totalDays: number;
} {
  // Relationship start date: September 2, 2026 00:00:00 UTC
  const startDate = new Date('2026-09-02T00:00:00Z').getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - startDate);

  const totalSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  return { days, hours, mins, secs, totalDays: days };
}

// -----------------------------------------------------------------------------
// Floating 3D Button (FAB) Management
// -----------------------------------------------------------------------------
export function initMonthsaryFloatingButton(source: 'Private Space' | 'Scrapbook' = 'Private Space'): void {
  if (typeof document === 'undefined') return;

  const vis = getMonthsaryVisibility();
  const existing = document.querySelector('.ivraine-3d-monthsary-fab');

  if (vis === 'hidden') {
    if (existing) existing.remove();
    return;
  }

  if (existing) return;

  const fab = document.createElement('button');
  fab.className = 'ivraine-3d-monthsary-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Open 1st Monthsary 3D Experience');
  fab.innerHTML = `
    <div class="fab-3d-icon-wrap" aria-hidden="true">
      <span class="fab-3d-heart-emoji">💖</span>
    </div>
    <div class="fab-text-wrap">
      <span class="fab-badge-pill">1st Month</span>
      <span class="fab-main-title">Our Monthsary ✨</span>
    </div>
  `;

  // Interactive 3D tilt tracking on pointer move
  const handlePointerMove = (e: MouseEvent | TouchEvent) => {
    const rect = fab.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;

    const rotX = -(y / rect.height) * 16;
    const rotY = (x / rect.width) * 16;

    fab.style.transform = `perspective(600px) rotateX(${rotX.toFixed(1)}deg) rotateY(${rotY.toFixed(1)}deg) scale3d(1.04, 1.04, 1.04)`;
  };

  const handlePointerLeave = () => {
    fab.style.transform = '';
  };

  fab.addEventListener('mousemove', handlePointerMove as EventListener);
  fab.addEventListener('mouseleave', handlePointerLeave);

  fab.addEventListener('click', () => {
    try { navigator.vibrate?.([30, 20, 40]); } catch {}
    openMonthsaryExperience(source);
  });

  document.body.appendChild(fab);
}

export function getCurrentAppTheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined') {
    const docTheme = document.documentElement.dataset.theme;
    if (docTheme === 'light' || docTheme === 'dark') return docTheme;
    try {
      const saved = localStorage.getItem('ivraine-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  }
  return 'dark';
}

// -----------------------------------------------------------------------------
// Fullscreen 3D Monthsary Experience
// -----------------------------------------------------------------------------
export function openMonthsaryExperience(source: 'Private Space' | 'Scrapbook' | 'Admin' = 'Private Space'): void {
  if (typeof document === 'undefined') return;

  // Remove any open instance
  const existing = document.querySelector('.ivraine-monthsary-modal-overlay');
  if (existing) existing.remove();

  let activeTheme = getCurrentAppTheme();

  const overlay = document.createElement('div');
  overlay.className = 'ivraine-monthsary-modal-overlay';
  overlay.dataset.theme = activeTheme;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  // Topbar with Theme Toggle and Close
  overlay.innerHTML = `
    <div class="monthsary-three-canvas-container" id="monthsary-canvas-host"></div>
    <header class="monthsary-modal-topbar">
      <div class="monthsary-top-brand">
        ivraine <span>♡</span> 1st Monthsary
      </div>
      <div class="monthsary-modal-actions">
        <button class="monthsary-glass-btn monthsary-theme-btn" id="btn-toggle-monthsary-theme" aria-label="Toggle dark/light theme" title="Switch theme">
          ${activeTheme === 'dark' ? '☀' : '☾'}
        </button>
        <button class="monthsary-glass-btn monthsary-close-btn" id="btn-close-monthsary" aria-label="Close">✕</button>
      </div>
    </header>
    <div id="monthsary-stage-host" style="position:relative;z-index:10;width:100%;display:flex;align-items:center;justify-content:center;"></div>
  `;

  document.body.appendChild(overlay);

  const canvasHost = overlay.querySelector<HTMLDivElement>('#monthsary-canvas-host')!;
  const stageHost = overlay.querySelector<HTMLDivElement>('#monthsary-stage-host')!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>('#btn-close-monthsary')!;
  const themeToggleBtn = overlay.querySelector<HTMLButtonElement>('#btn-toggle-monthsary-theme')!;

  // 1. Initialize Three.js WebGL Scene with Active Theme
  const sceneController = initMonthsary3DScene(canvasHost, activeTheme);

  // Theme toggle handler
  themeToggleBtn.addEventListener('click', () => {
    activeTheme = activeTheme === 'dark' ? 'light' : 'dark';
    overlay.dataset.theme = activeTheme;
    themeToggleBtn.textContent = activeTheme === 'dark' ? '☀' : '☾';
    sceneController.updateTheme(activeTheme);
    try {
      localStorage.setItem('ivraine-theme', activeTheme);
      document.documentElement.dataset.theme = activeTheme;
      document.documentElement.style.colorScheme = activeTheme;
    } catch {}
  });

  // Close handler
  const cleanup = () => {
    stopRomanticMusicBox();
    sceneController.dispose();
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 350);
  };
  closeBtn.addEventListener('click', cleanup);

  // 2. Start Phase 1: 5-Second 3D Galaxy Animation
  startPhase1IntroAnimation(stageHost, sceneController, () => {
    // 3. Phase 2: 5 Interactive Monthsary Questions
    startPhase2Quiz(stageHost, sceneController, () => {
      // 4. Phase 3: 3D Wax Seal Unfolding
      startPhase3UnsealAnimation(stageHost, sceneController, () => {
        // 5. Phase 4: 1st Monthsary Letter & Memory Experience
        startPhase4LetterExperience(stageHost, sceneController, cleanup, source);
      });
    });
  });
}

// -----------------------------------------------------------------------------
// Three.js Scene Implementation: Particle Galaxy, 3D Heart & Faceted Crystals
// -----------------------------------------------------------------------------
interface SceneController {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  heartMesh: THREE.Mesh;
  warpSpeed: (speed: number) => void;
  setAmbientMode: () => void;
  triggerHeartExplosion: () => void;
  updateTheme: (theme: 'light' | 'dark') => void;
  dispose: () => void;
}

function initMonthsary3DScene(container: HTMLDivElement, initialTheme: 'light' | 'dark' = 'dark'): SceneController {
  const isLight = initialTheme === 'light';
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(isLight ? 0xf7eff3 : 0x0c0914, 0.035);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(isLight ? 0xf7eff3 : 0x0c0914, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = isLight ? 1.05 : 1.25;
  container.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, isLight ? 1.15 : 0.85);
  scene.add(ambientLight);

  const lightPink = new THREE.PointLight(isLight ? 0xd63384 : 0xff3388, isLight ? 2.6 : 3.5, 50);
  lightPink.position.set(5, 5, 8);
  scene.add(lightPink);

  const lightPurple = new THREE.PointLight(isLight ? 0x7c3aed : 0x8a2be2, isLight ? 2.0 : 3.0, 50);
  lightPurple.position.set(-6, -4, 6);
  scene.add(lightPurple);

  const lightGold = new THREE.PointLight(isLight ? 0xd97706 : 0xffd700, isLight ? 1.8 : 2.5, 40);
  lightGold.position.set(0, 8, 4);
  scene.add(lightGold);

  // 1. Procedural 3D Heart Geometry
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, 0.8);
  heartShape.bezierCurveTo(0, 1.4, -0.6, 2.0, -1.6, 2.0);
  heartShape.bezierCurveTo(-2.8, 2.0, -3.2, 1.0, -3.2, 0.4);
  heartShape.bezierCurveTo(-3.2, -0.8, -2.0, -2.0, 0, -3.4);
  heartShape.bezierCurveTo(2.0, -2.0, 3.2, -0.8, 3.2, 0.4);
  heartShape.bezierCurveTo(3.2, 1.0, 2.8, 2.0, 1.6, 2.0);
  heartShape.bezierCurveTo(0.6, 2.0, 0, 1.4, 0, 0.8);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 0.7,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 2,
    bevelSize: 0.25,
    bevelThickness: 0.25
  };
  const heartGeo = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
  heartGeo.center();

  const heartMat = new THREE.MeshStandardMaterial({
    color: isLight ? 0xd63384 : 0xff2d75,
    emissive: isLight ? 0x5a0b2c : 0x991144,
    emissiveIntensity: isLight ? 0.2 : 0.35,
    metalness: isLight ? 0.2 : 0.3,
    roughness: 0.2,
    wireframe: false
  });
  const heartMesh = new THREE.Mesh(heartGeo, heartMat);
  heartMesh.scale.set(0.9, 0.9, 0.9);
  scene.add(heartMesh);

  // 2. Orbiting Faceted Crystal Polyhedra
  const crystalsGroup = new THREE.Group();
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    emissive: isLight ? 0xd63384 : 0xff80bf,
    emissiveIntensity: isLight ? 0.25 : 0.4,
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.85,
    thickness: 0.5,
    transparent: true,
    opacity: 0.9
  });

  for (let i = 0; i < 18; i++) {
    const geo = i % 2 === 0 ? new THREE.OctahedronGeometry(0.35 + Math.random() * 0.25) : new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.2);
    const mesh = new THREE.Mesh(geo, crystalMat);
    const angle = (i / 18) * Math.PI * 2;
    const radius = 4.5 + (i % 3) * 1.5;
    mesh.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 3, Math.sin(angle) * radius);
    mesh.userData = { angle, radius, speed: 0.008 + Math.random() * 0.012, rotSpeed: 0.02 + Math.random() * 0.02 };
    crystalsGroup.add(mesh);
  }
  scene.add(crystalsGroup);

  // 3. Double-Armed Love Galaxy Particle System with Falling Snow Dynamics
  const particleCount = 2800;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const particleVelocities = new Float32Array(particleCount * 3);

  const darkSnowPalette = [
    new THREE.Color(0xff4081), // Hot Pink
    new THREE.Color(0xff758c), // Rose
    new THREE.Color(0xc084fc), // Lavender Purple
    new THREE.Color(0xffd700), // Celestial Gold
    new THREE.Color(0xffffff)  // Pure Stardust Snow
  ];

  const lightSnowPalette = [
    new THREE.Color(0xd63384), // Deep Romantic Rose
    new THREE.Color(0xbe185d), // Rich Crimson Berry
    new THREE.Color(0x7c3aed), // Vivid Violet Amethyst
    new THREE.Color(0xd97706), // Warm Amber Gold
    new THREE.Color(0x9d174d)  // Deep Raspberry Magenta
  ];

  const initialPalette = isLight ? lightSnowPalette : darkSnowPalette;

  for (let i = 0; i < particleCount; i++) {
    const arm = i % 2;
    const distance = Math.pow(Math.random(), 0.7) * 22 + 1;
    const spiralAngle = distance * 0.75 + (arm * Math.PI);

    const jitterX = (Math.random() - 0.5) * (distance * 0.28);
    const jitterY = (Math.random() - 0.5) * 20; // Spread vertically for falling snow effect
    const jitterZ = (Math.random() - 0.5) * (distance * 0.28);

    positions[i * 3] = Math.cos(spiralAngle) * distance + jitterX;
    positions[i * 3 + 1] = jitterY;
    positions[i * 3 + 2] = Math.sin(spiralAngle) * distance + jitterZ;

    const chosenColor = initialPalette[Math.floor(Math.random() * initialPalette.length)];
    colors[i * 3] = chosenColor.r;
    colors[i * 3 + 1] = chosenColor.g;
    colors[i * 3 + 2] = chosenColor.b;

    particleVelocities[i * 3] = (Math.random() - 0.5) * 0.02;
    particleVelocities[i * 3 + 1] = -(0.012 + Math.random() * 0.018); // Downward snow drift
    particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
  }

  const particlesGeo = new THREE.BufferGeometry();
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Generates a soft glowing circular snowflake/stardust sprite texture adapted to theme
  const createParticleTexture = (lightMode: boolean): THREE.CanvasTexture => {
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = 64;
    spriteCanvas.height = 64;
    const sCtx = spriteCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (lightMode) {
      grad.addColorStop(0, 'rgba(214, 51, 132, 0.95)');
      grad.addColorStop(0.35, 'rgba(190, 24, 93, 0.75)');
      grad.addColorStop(0.7, 'rgba(124, 58, 237, 0.35)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else {
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(255, 100, 180, 0.85)');
      grad.addColorStop(0.7, 'rgba(180, 50, 220, 0.3)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(spriteCanvas);
  };

  let particleTexture = createParticleTexture(isLight);

  const particlesMat = new THREE.PointsMaterial({
    size: isLight ? 0.34 : 0.38,
    vertexColors: true,
    map: particleTexture,
    transparent: true,
    opacity: isLight ? 0.82 : 0.92,
    blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false
  });

  const particlesSystem = new THREE.Points(particlesGeo, particlesMat);
  scene.add(particlesSystem);

  // Animation Loop State
  let animId = 0;
  let clock = new THREE.Clock();
  let warpFactor = 1.0;
  let isAmbientMode = false;

  const onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onWindowResize);

  // Render loop with dynamic falling snow & rotation
  const animate = () => {
    animId = requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // 1. Heart rotation & gentle hovering
    heartMesh.rotation.y = elapsedTime * 0.65;
    heartMesh.rotation.x = Math.sin(elapsedTime * 0.8) * 0.2;
    heartMesh.position.y = Math.sin(elapsedTime * 1.5) * 0.35;

    // 2. Orbiting crystals
    crystalsGroup.children.forEach((obj: any) => {
      obj.userData.angle += obj.userData.speed * warpFactor;
      obj.position.x = Math.cos(obj.userData.angle) * obj.userData.radius;
      obj.position.z = Math.sin(obj.userData.angle) * obj.userData.radius;
      obj.rotation.x += obj.userData.rotSpeed;
      obj.rotation.y += obj.userData.rotSpeed * 0.8;
    });

    // 3. Spiral galaxy rotation & gentle romantic snowfall
    particlesSystem.rotation.y = elapsedTime * 0.08 * warpFactor;
    particlesSystem.rotation.x = Math.sin(elapsedTime * 0.04) * 0.15;

    const posArray = particlesGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      // Downward snow drift
      posArray[i * 3 + 1] -= (0.015 + (i % 5) * 0.003) * warpFactor;
      if (posArray[i * 3 + 1] < -12) {
        posArray[i * 3 + 1] = 12;
      }
    }
    particlesGeo.attributes.position.needsUpdate = true;

    // 4. Moving Point Lights for shimmering specular highlights
    lightPink.position.x = Math.cos(elapsedTime * 1.2) * 7;
    lightPink.position.z = Math.sin(elapsedTime * 1.2) * 7;
    lightPurple.position.x = Math.cos(-elapsedTime * 0.9) * 8;
    lightPurple.position.z = Math.sin(-elapsedTime * 0.9) * 8;

    // Camera motion in ambient mode vs intro
    if (isAmbientMode) {
      camera.position.x = Math.sin(elapsedTime * 0.2) * 1.5;
      camera.position.y = Math.cos(elapsedTime * 0.15) * 1.0;
      camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
  };
  animate();

  return {
    scene,
    camera,
    renderer,
    heartMesh,
    warpSpeed: (speed: number) => {
      warpFactor = speed;
    },
    setAmbientMode: () => {
      isAmbientMode = true;
      camera.position.set(0, 0, 14);
      heartMesh.scale.set(0.65, 0.65, 0.65);
      heartMesh.position.set(0, 0, -3);
    },
    triggerHeartExplosion: () => {
      // Big celebratory burst of particles outwards
      const posAttr = particlesGeo.attributes.position as THREE.BufferAttribute;
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        posAttr.setXYZ(i, x * 1.4, y * 1.4, z * 1.4);
      }
      posAttr.needsUpdate = true;
    },
    updateTheme: (newTheme: 'light' | 'dark') => {
      const light = newTheme === 'light';
      scene.fog = new THREE.FogExp2(light ? 0xf7eff3 : 0x0c0914, 0.035);
      renderer.setClearColor(light ? 0xf7eff3 : 0x0c0914, 1);
      renderer.toneMappingExposure = light ? 1.05 : 1.25;

      ambientLight.intensity = light ? 1.15 : 0.85;
      lightPink.color.setHex(light ? 0xd63384 : 0xff3388);
      lightPink.intensity = light ? 2.6 : 3.5;

      lightPurple.color.setHex(light ? 0x7c3aed : 0x8a2be2);
      lightPurple.intensity = light ? 2.0 : 3.0;

      lightGold.color.setHex(light ? 0xd97706 : 0xffd700);
      lightGold.intensity = light ? 1.8 : 2.5;

      heartMat.color.setHex(light ? 0xd63384 : 0xff2d75);
      heartMat.emissive.setHex(light ? 0x5a0b2c : 0x991144);
      heartMat.emissiveIntensity = light ? 0.2 : 0.35;

      crystalMat.emissive.setHex(light ? 0xd63384 : 0xff80bf);

      // Dynamically update snow particle colors & texture based on theme
      const pal = light ? lightSnowPalette : darkSnowPalette;
      const colAttr = particlesGeo.attributes.color as THREE.BufferAttribute;
      const colArray = colAttr.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const c = pal[i % pal.length];
        colArray[i * 3] = c.r;
        colArray[i * 3 + 1] = c.g;
        colArray[i * 3 + 2] = c.b;
      }
      colAttr.needsUpdate = true;

      particleTexture.dispose();
      particleTexture = createParticleTexture(light);
      particlesMat.map = particleTexture;
      particlesMat.size = light ? 0.34 : 0.38;
      particlesMat.opacity = light ? 0.82 : 0.92;
      particlesMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      particlesMat.needsUpdate = true;
    },
    dispose: () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onWindowResize);
      renderer.dispose();
      heartGeo.dispose();
      heartMat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      particleTexture.dispose();
      container.innerHTML = '';
    }
  };
}

// -----------------------------------------------------------------------------
// Phase 1: 5-Second 3D Animation & Futuristic-Romantic HUD
// -----------------------------------------------------------------------------
function startPhase1IntroAnimation(
  host: HTMLDivElement,
  sceneCtrl: SceneController,
  onComplete: () => void
): void {
  host.innerHTML = `
    <div class="monthsary-intro-hud" id="phase1-hud">
      <div class="monthsary-intro-hud-card">
        <div class="hud-countdown-ring-wrap">
          <svg class="hud-ring-svg" viewBox="0 0 140 140">
            <defs>
              <linearGradient id="hudNeonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff2d75" />
                <stop offset="50%" stop-color="#ff758c" />
                <stop offset="100%" stop-color="#9333ea" />
              </linearGradient>
              <linearGradient id="hudNeonGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#d63384" />
                <stop offset="50%" stop-color="#b8144c" />
                <stop offset="100%" stop-color="#7c3aed" />
              </linearGradient>
            </defs>
            <circle class="hud-ring-bg" cx="70" cy="70" r="60" />
            <circle class="hud-ring-fill" id="hud-ring-fill" cx="70" cy="70" r="60" />
          </svg>
          <span class="hud-countdown-number" id="hud-counter-num">5</span>
        </div>
        <span class="hud-title-badge">✨ 1st Month Special Edition</span>
        <h2 class="hud-headline">Entering Our <em>Love Universe</em></h2>
        <p class="hud-subtext">30 Days · 720 Hours of Falling in Love with Loraine...</p>
        <div class="hud-skip-action">
          <button class="monthsary-glass-btn" id="btn-skip-intro">Skip to Quiz ⏭</button>
        </div>
      </div>
    </div>
  `;

  const hud = host.querySelector<HTMLDivElement>('#phase1-hud')!;
  const counterNum = host.querySelector<HTMLElement>('#hud-counter-num')!;
  const ringFill = host.querySelector<SVGCircleElement>('#hud-ring-fill')!;
  const skipBtn = host.querySelector<HTMLButtonElement>('#btn-skip-intro')!;

  const circumference = 2 * Math.PI * 60; // ~377
  ringFill.style.strokeDasharray = `${circumference}`;

  const totalDurationMs = 5000;
  const startTime = Date.now();
  let completed = false;

  const finishPhase1 = () => {
    if (completed) return;
    completed = true;
    hud.style.opacity = '0';
    sceneCtrl.warpSpeed(3.0);

    setTimeout(() => {
      sceneCtrl.setAmbientMode();
      onComplete();
    }, 450);
  };

  skipBtn.addEventListener('click', finishPhase1);

  // 5-second countdown timer interval
  const timerInterval = setInterval(() => {
    if (completed) {
      clearInterval(timerInterval);
      return;
    }
    const elapsed = Date.now() - startTime;
    const remainingSecs = Math.max(0, Math.ceil((totalDurationMs - elapsed) / 1000));
    const progressFraction = Math.min(1, elapsed / totalDurationMs);

    counterNum.textContent = String(remainingSecs);
    ringFill.style.strokeDashoffset = `${circumference * (1 - progressFraction)}`;

    // Camera zooms dynamically during 5 seconds
    const camZ = 16 - progressFraction * 5;
    sceneCtrl.camera.position.z = camZ;

    if (elapsed >= totalDurationMs) {
      clearInterval(timerInterval);
      finishPhase1();
    }
  }, 50);
}

// -----------------------------------------------------------------------------
// Phase 2: 5 Interactive Monthsary Questions for Her
// -----------------------------------------------------------------------------
function startPhase2Quiz(
  host: HTMLDivElement,
  sceneCtrl: SceneController,
  onComplete: () => void
): void {
  let currentQuestionIndex = 0;
  const collectedAnswers: MonthsaryAnswerItem[] = [];

  const renderQuestion = () => {
    const q = MONTHSARY_QUESTIONS[currentQuestionIndex];
    const total = MONTHSARY_QUESTIONS.length;

    host.innerHTML = `
      <div class="monthsary-quiz-container">
        <div class="quiz-header-row">
          <span class="quiz-step-indicator">
            Question ${q.id} of ${total}
          </span>
          <div class="quiz-hearts-progress">
            ${MONTHSARY_QUESTIONS.map((_, i) => `<span class="quiz-heart-dot ${i <= currentQuestionIndex ? 'active' : ''}">♥</span>`).join('')}
          </div>
        </div>

        <div class="quiz-question-box">
          <h3 class="quiz-question-text">${q.question}</h3>
        </div>

        <div class="quiz-options-list">
          ${q.options.map(opt => `
            <button class="quiz-option-btn" data-key="${opt.key}">
              <span class="quiz-option-letter">${opt.key}</span>
              <span class="quiz-option-text">${opt.text}</span>
            </button>
          `).join('')}
        </div>

        <div id="quiz-reaction-area"></div>
      </div>
    `;

    const optionBtns = host.querySelectorAll<HTMLButtonElement>('.quiz-option-btn');
    const reactionArea = host.querySelector<HTMLDivElement>('#quiz-reaction-area')!;

    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const matched = q.options.find(o => o.key === key);
        if (!matched) return;

        // Visual selection
        optionBtns.forEach(b => (b.disabled = true));
        btn.classList.add('selected');

        // Record chosen answer
        collectedAnswers.push({
          questionId: q.id,
          question: q.question,
          selectedKey: matched.key,
          selectedText: matched.text,
          reaction: matched.reaction
        });

        // Sound, haptics & confetti
        playChimeSound();
        try { navigator.vibrate?.([30, 20, 40]); } catch {}

        confetti({
          particleCount: 45,
          spread: 70,
          origin: { y: 0.65 },
          colors: ['#ff4081', '#ff758c', '#c084fc', '#ffd700']
        });

        // Reaction banner
        reactionArea.innerHTML = `
          <div class="quiz-reaction-banner">
            <span>💖</span>
            <strong>${matched.reaction}</strong>
          </div>
        `;

        // Progress to next question or complete
        setTimeout(() => {
          if (currentQuestionIndex + 1 < MONTHSARY_QUESTIONS.length) {
            currentQuestionIndex++;
            renderQuestion();
          } else {
            // All 5 answered! Submit to backend, Supabase, and Admin
            const summaryParts = collectedAnswers.map(a => `Q${a.questionId}: ${a.selectedKey}`);
            const submission: MonthsarySubmission = {
              id: `ans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              user: 'Loraine',
              timestamp: new Date().toISOString(),
              answers: collectedAnswers,
              summary: summaryParts.join(' • ')
            };
            void submitMonthsaryAnswers(submission);

            confetti({
              particleCount: 100,
              spread: 100,
              origin: { y: 0.5 },
              colors: ['#ff4081', '#ff1493', '#ffd700', '#fff']
            });
            onComplete();
          }
        }, 1200);
      });
    });
  };

  renderQuestion();
}

// -----------------------------------------------------------------------------
// Phase 3: 3D Wax Seal Unfolding Animation Stage
// -----------------------------------------------------------------------------
function startPhase3UnsealAnimation(
  host: HTMLDivElement,
  sceneCtrl: SceneController,
  onComplete: () => void
): void {
  host.innerHTML = `
    <div class="monthsary-unseal-stage">
      <div class="unseal-envelope-3d-card">
        <span class="unseal-gold-badge">🏆 All 5 Questions Answered!</span>
        <button class="wax-seal-interactive-button" id="btn-unseal-letter" aria-label="Tap to unseal 1st Monthsary Letter">
          ♡
        </button>
        <h3 class="unseal-card-title">Your 1st Month Letter</h3>
        <p class="unseal-card-subtitle">
          Written with all my heart for our first 30 days together.<br>
          Tap the wax seal to unlock and unfold!
        </p>
        <button class="unseal-tap-cta" id="btn-unseal-cta">Unseal Our Letter 💌</button>
      </div>
    </div>
  `;

  const sealBtn = host.querySelector<HTMLButtonElement>('#btn-unseal-letter')!;
  const ctaBtn = host.querySelector<HTMLButtonElement>('#btn-unseal-cta')!;

  const doUnseal = () => {
    playChimeSound();
    sceneCtrl.triggerHeartExplosion();

    confetti({
      particleCount: 120,
      spread: 120,
      origin: { y: 0.55 },
      colors: ['#ff4081', '#ff1493', '#f7d070', '#ffffff', '#e056fd']
    });

    const card = host.querySelector<HTMLDivElement>('.unseal-envelope-3d-card')!;
    card.style.transform = 'scale(1.15)';
    card.style.opacity = '0';
    card.style.transition = 'all 0.5s ease';

    setTimeout(() => {
      onComplete();
    }, 550);
  };

  sealBtn.addEventListener('click', doUnseal);
  ctaBtn.addEventListener('click', doUnseal);
}

// -----------------------------------------------------------------------------
// Phase 4: 1st Monthsary Letter & Memory Experience (Editable from Admin!)
// -----------------------------------------------------------------------------
function startPhase4LetterExperience(
  host: HTMLDivElement,
  sceneCtrl: SceneController,
  onClose: () => void,
  source: 'Private Space' | 'Scrapbook' | 'Admin'
): void {
  const config = getMonthsaryConfig();
  const time = calculateAnniversaryElapsed();
  let heartsSent = 0;

  host.innerHTML = `
    <div class="monthsary-letter-container">
      <!-- Letter Wax Header -->
      <div class="letter-wax-stamp-header">
        <div class="stamp-left">
          <div class="letter-wax-emblem">♡</div>
          <div class="stamp-meta">
            <small>IVRAINE · 1ST MONTHSARY</small>
            <strong>September 2, 2026 → October 2, 2026</strong>
          </div>
        </div>
        <button class="letter-music-btn" id="btn-toggle-letter-music" title="Toggle romantic music">
          <span class="music-wave-bars">
            <span class="wave-bar"></span>
            <span class="wave-bar"></span>
            <span class="wave-bar"></span>
          </span>
          <span id="music-btn-text">Play Romantic Melody ♫</span>
        </button>
      </div>

      <!-- Live Milestone Counter Banner -->
      <div class="monthsary-clock-banner">
        <div class="clock-lead">
          <span class="clock-lead-tag">✨ Milestone Counter</span>
          <span class="clock-lead-title">Together as Ivan & Loraine</span>
        </div>
        <div class="clock-digits-row">
          <div class="clock-box">
            <strong id="counter-days">${time.days}</strong>
            <small>Days</small>
          </div>
          <div class="clock-box">
            <strong id="counter-hours">${time.hours}</strong>
            <small>Hours</small>
          </div>
          <div class="clock-box">
            <strong id="counter-mins">${time.mins}</strong>
            <small>Mins</small>
          </div>
          <div class="clock-box">
            <strong id="counter-secs">${time.secs}</strong>
            <small>Secs</small>
          </div>
        </div>
      </div>

      <!-- Letter Content (Editable from Admin!) -->
      <div class="letter-content-prose">
        <h2 class="letter-main-title">${escapeHtml(config.letterTitle || DEFAULT_MONTHSARY_DATA.letterTitle)}</h2>
        <div class="letter-greeting">${escapeHtml(config.letterGreeting || DEFAULT_MONTHSARY_DATA.letterGreeting)}</div>
        <div class="letter-body-paragraphs">${escapeHtml(config.letterBody || DEFAULT_MONTHSARY_DATA.letterBody)}</div>
        <div class="letter-signoff">${escapeHtml(config.letterSignoff || DEFAULT_MONTHSARY_DATA.letterSignoff)}</div>
      </div>

      <!-- Interactive Memory Polaroids Grid -->
      <div class="letter-polaroids-row">
        <div class="letter-polaroid-card" style="--rot: -2deg;">
          <div class="polaroid-img-wrap">
            <img src="/icons/couple-512.png" alt="Ivan and Loraine" loading="lazy">
          </div>
          <div class="polaroid-caption">Where Our Story Began ♡</div>
        </div>
        <div class="letter-polaroid-card" style="--rot: 2deg;">
          <div class="polaroid-img-wrap">
            <div style="font-size:36px;display:flex;align-items:center;justify-content:center;height:100%;color:#ff4081;">
              🌹
            </div>
          </div>
          <div class="polaroid-caption">30 Days of Endless Smiles ✨</div>
        </div>
        <div class="letter-polaroid-card" style="--rot: -1.5deg;">
          <div class="polaroid-img-wrap">
            <div style="font-size:36px;display:flex;align-items:center;justify-content:center;height:100%;color:#8a2be2;">
              🪐
            </div>
          </div>
          <div class="polaroid-caption">To Infinity & Beyond Us ♡</div>
        </div>
      </div>

      <!-- 3 Sacred Love Vows -->
      <div class="letter-vows-section">
        <h4 class="vows-heading"><span>📜</span> 3 Promises for Our 1st Month & Beyond</h4>
        <div class="vows-list">
          ${(config.vows || DEFAULT_MONTHSARY_DATA.vows || []).map(vow => `
            <div class="vow-item">
              <span class="vow-heart-bullet">♥</span>
              <span>${escapeHtml(vow)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Interactive Actions Toolbar -->
      <div class="letter-bottom-actions">
        <button class="monthsary-glass-btn" id="btn-replay-3d" style="color:#ff6b81;">
          ↺ Replay 3D Show
        </button>

        <button class="letter-heart-send-btn" id="btn-send-heart">
          <span>💖</span>
          <span id="send-heart-text">Send Love to Ivan ♡</span>
        </button>

        <button class="monthsary-glass-btn" id="btn-finish-letter">
          Keep in My Heart (Close) ✕
        </button>
      </div>
    </div>
  `;

  // Start live clock ticker
  const clockInterval = setInterval(() => {
    const t = calculateAnniversaryElapsed();
    const dEl = host.querySelector('#counter-days');
    const hEl = host.querySelector('#counter-hours');
    const mEl = host.querySelector('#counter-mins');
    const sEl = host.querySelector('#counter-secs');
    if (dEl && hEl && mEl && sEl) {
      dEl.textContent = String(t.days);
      hEl.textContent = String(t.hours);
      mEl.textContent = String(t.mins);
      sEl.textContent = String(t.secs);
    } else {
      clearInterval(clockInterval);
    }
  }, 1000);

  // Music toggle button
  const musicBtn = host.querySelector<HTMLButtonElement>('#btn-toggle-letter-music')!;
  const musicText = host.querySelector<HTMLSpanElement>('#music-btn-text')!;

  musicBtn.addEventListener('click', () => {
    const isPlaying = toggleRomanticMusicBox((playing) => {
      musicBtn.classList.toggle('playing', playing);
      musicText.textContent = playing ? 'Playing Romantic Melody ♫' : 'Play Romantic Melody ♫';
    });
  });

  // Replay Show Button
  const replayBtn = host.querySelector<HTMLButtonElement>('#btn-replay-3d')!;
  replayBtn.addEventListener('click', () => {
    clearInterval(clockInterval);
    startPhase1IntroAnimation(host, sceneCtrl, () => {
      startPhase2Quiz(host, sceneCtrl, () => {
        startPhase3UnsealAnimation(host, sceneCtrl, () => {
          startPhase4LetterExperience(host, sceneCtrl, onClose, source);
        });
      });
    });
  });

  // Close Button
  const finishBtn = host.querySelector<HTMLButtonElement>('#btn-finish-letter')!;
  finishBtn.addEventListener('click', () => {
    clearInterval(clockInterval);
    onClose();
  });

  // "Send Love to Ivan" Interactive Heart Button
  const sendHeartBtn = host.querySelector<HTMLButtonElement>('#btn-send-heart')!;
  const sendHeartText = host.querySelector<HTMLSpanElement>('#send-heart-text')!;

  sendHeartBtn.addEventListener('click', (e) => {
    heartsSent++;
    sendHeartText.textContent = `Sent ${heartsSent} ${heartsSent === 1 ? 'Heart' : 'Hearts'} to Ivan! 💕`;
    playChimeSound();
    try { navigator.vibrate?.([20, 20]); } catch {}

    // Spawn floating heart particle
    const rect = sendHeartBtn.getBoundingClientRect();
    const particle = document.createElement('div');
    particle.className = 'floating-heart-particle';
    particle.textContent = ['💖', '💕', '💘', '✨', '🥰'][heartsSent % 5];
    particle.style.left = `${rect.left + rect.width / 2 + (Math.random() - 0.5) * 40}px`;
    particle.style.top = `${rect.top}px`;
    particle.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 120}px`);
    particle.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1800);

    // Track activity in admin log every 3 hearts
    if (heartsSent === 1 || heartsSent % 3 === 0) {
      try {
        void fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'Private Space',
            action: `Loraine sent 1st Monthsary Love ♡ (${heartsSent} hearts)`,
            user: 'Loraine',
            details: `Celebrated 1st Monthsary! Sent ${heartsSent} love hearts.`
          })
        });
      } catch {}
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
