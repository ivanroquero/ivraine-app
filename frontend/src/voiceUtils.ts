import { api, supabase } from './api';

export interface VoiceRecorderController {
 stop: () => Promise<{ blob: Blob; url: string; duration: number }>;
 cancel: () => void;
}

/**
 * Start recording a voice memo using MediaRecorder API.
 * Automatically limits recording to maxDurationSec (default 60s).
 */
export async function startVoiceRecording(
 onTick?: (seconds: number, formatted: string) => void,
 onLevel?: (level: number) => void,
 maxDurationSec = 60
): Promise<VoiceRecorderController> {
 if (!navigator.mediaDevices?.getUserMedia) {
  throw new Error('Microphone access is not supported by your browser.');
 }

 const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
 const mimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
  'audio/ogg'
 ];
 const supportedMime = mimeTypes.find(m => {
  try {
   return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m);
  } catch {
   return false;
  }
 }) || '';

 const recorder = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
 const chunks: BlobPart[] = [];
 let durationSec = 0;
 let timerInterval: ReturnType<typeof setInterval> | null = null;
 let animFrame: number | null = null;
 let audioCtx: AudioContext | null = null;
 let analyser: AnalyserNode | null = null;

 // Web Audio Analyser for live frequency levels
 try {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (AudioContextClass) {
   audioCtx = new AudioContextClass();
   const source = audioCtx.createMediaStreamSource(stream);
   analyser = audioCtx.createAnalyser();
   analyser.fftSize = 64;
   source.connect(analyser);

   const dataArray = new Uint8Array(analyser.frequencyBinCount);
   const updateLevel = () => {
    if (!analyser) return;
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const avg = sum / dataArray.length / 255;
    onLevel?.(avg);
    animFrame = requestAnimationFrame(updateLevel);
   };
   updateLevel();
  }
 } catch {
  // AudioContext not supported or blocked, continue recording gracefully
 }

 const cleanup = () => {
  if (timerInterval) clearInterval(timerInterval);
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => undefined);
  stream.getTracks().forEach(t => t.stop());
 };

 recorder.ondataavailable = e => {
  if (e.data && e.data.size > 0) chunks.push(e.data);
 };

 recorder.start(250);

 return new Promise<VoiceRecorderController>((resolve) => {
  timerInterval = setInterval(() => {
   durationSec++;
   const mins = Math.floor(durationSec / 60);
   const secs = durationSec % 60;
   const formatted = `${mins}:${String(secs).padStart(2, '0')}`;
   onTick?.(durationSec, formatted);

   if (durationSec >= maxDurationSec) {
    if (recorder.state === 'recording') recorder.stop();
   }
  }, 1000);

  resolve({
   stop: () => new Promise<{ blob: Blob; url: string; duration: number }>((resStop) => {
    recorder.onstop = () => {
     cleanup();
     const blobType = supportedMime || recorder.mimeType || 'audio/webm';
     const blob = new Blob(chunks, { type: blobType });
     const url = URL.createObjectURL(blob);
     resStop({ blob, url, duration: durationSec });
    };
    if (recorder.state === 'recording') recorder.stop();
    else recorder.onstop?.(new Event('stop'));
   }),
   cancel: () => {
    cleanup();
    if (recorder.state === 'recording') {
     recorder.ondataavailable = null;
     recorder.onstop = null;
     recorder.stop();
    }
   }
  });
 });
}

/**
 * Upload voice note audio blob directly to Supabase Storage, with fallback to backend /api/voice.
 */
export async function uploadVoiceNote(blob: Blob, bookId: string, userId: string): Promise<string> {
 const isM4a = blob.type.includes('mp4') || blob.type.includes('m4a');
 const isWav = blob.type.includes('wav');
 const isMp3 = blob.type.includes('mpeg') || blob.type.includes('mp3');
 const ext = isM4a ? 'm4a' : isWav ? 'wav' : isMp3 ? 'mp3' : 'webm';
 const filename = `${crypto.randomUUID()}.${ext}`;
 const path = `${bookId}/${userId}/${filename}`;

 // 1. Attempt direct Supabase Storage upload
 if (supabase) {
  try {
   const { error: upErr } = await supabase.storage.from('ivraine-voice').upload(path, blob, {
    contentType: blob.type || (isM4a ? 'audio/m4a' : 'audio/webm'),
    cacheControl: '31536000',
    upsert: false
   });
   if (!upErr) {
    // Check if signed URL or public URL is preferred
    const { data: signed } = await supabase.storage.from('ivraine-voice').createSignedUrl(path, 315360000);
    const { data: pub } = supabase.storage.from('ivraine-voice').getPublicUrl(path);
    const resultUrl = signed?.signedUrl || pub?.publicUrl;
    if (resultUrl && /^https:\/\//i.test(resultUrl)) {
     return resultUrl;
    }
   }
  } catch {
   // Fallback to API route
  }
 }

 // 2. Fallback to /api/voice endpoint
 const res = await api<{ path: string; url: string }>('/voice', 'POST', blob);
 return res.url;
}

/**
 * Generate 28 deterministic waveform bar heights between 15% and 100%
 */
export function generateWaveformHeights(seedStr: string, count = 28): number[] {
 let seed = 0;
 for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
 const heights: number[] = [];
 for (let i = 0; i < count; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const rand = (seed % 100) / 100;
  // Natural bell-shaped modulation with random peaks
  const bell = Math.sin((i / (count - 1)) * Math.PI) * 0.4 + 0.6;
  const height = Math.max(18, Math.round((rand * 0.7 + 0.3) * bell * 100));
  heights.push(height);
 }
 return heights;
}

export function formatAudioTime(seconds: number): string {
 if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
 const m = Math.floor(seconds / 60);
 const s = Math.floor(seconds % 60);
 return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Render inline waveform audio player markup
 */
export function renderVoicePlayer(voiceUrl: string, title?: string, extraClasses = ''): string {
 if (!voiceUrl) return '';
 const heights = generateWaveformHeights(voiceUrl, 28);
 return `
  <div class="voice-player ${extraClasses}" data-voice-player data-url="${voiceUrl}" role="region" aria-label="${title ? `Voice memo: ${title}` : 'Voice memo'}">
   <div class="voice-player-main">
    <button type="button" class="voice-play-toggle" aria-label="Play voice note">
     <span class="voice-icon-play">▶</span>
     <span class="voice-icon-pause" style="display:none;">❚❚</span>
    </button>
    <div class="voice-waveform-wrap" role="slider" aria-label="Audio scrubber" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
     <div class="waveform-bars">
      ${heights.map((h, i) => `<div class="waveform-bar" style="height:${h}%;" data-bar-idx="${i}"></div>`).join('')}
     </div>
     <div class="waveform-scrub-line"></div>
    </div>
    <div class="voice-duration-box">
     <span class="voice-time-current">0:00</span>
     <span class="voice-time-sep">/</span>
     <span class="voice-time-total">0:00</span>
    </div>
   </div>
   <audio src="${voiceUrl}" preload="metadata" playsinline class="voice-audio-element"></audio>
  </div>
 `;
}

/**
 * Initialize all interactive voice players within a root container
 */
export function initVoicePlayers(root: HTMLElement = document.body): void {
 const players = root.querySelectorAll<HTMLElement>('[data-voice-player]');
 players.forEach((player) => {
  if (player.dataset.initialized === 'true') return;
  player.dataset.initialized = 'true';

  const audio = player.querySelector<HTMLAudioElement>('.voice-audio-element');
  const playBtn = player.querySelector<HTMLButtonElement>('.voice-play-toggle');
  const playIcon = player.querySelector<HTMLElement>('.voice-icon-play');
  const pauseIcon = player.querySelector<HTMLElement>('.voice-icon-pause');
  const currentEl = player.querySelector<HTMLElement>('.voice-time-current');
  const totalEl = player.querySelector<HTMLElement>('.voice-time-total');
  const scrubWrap = player.querySelector<HTMLElement>('.voice-waveform-wrap');
  const scrubLine = player.querySelector<HTMLElement>('.waveform-scrub-line');
  const bars = player.querySelectorAll<HTMLElement>('.waveform-bar');

  if (!audio || !playBtn || !scrubWrap) return;

  const updateProgress = () => {
   const cur = audio.currentTime;
   const dur = audio.duration || 0;
   if (currentEl) currentEl.textContent = formatAudioTime(cur);
   if (totalEl && dur > 0) totalEl.textContent = formatAudioTime(dur);

   const percent = dur > 0 ? (cur / dur) * 100 : 0;
   if (scrubLine) scrubLine.style.left = `${percent}%`;
   scrubWrap.setAttribute('aria-valuenow', Math.round(percent).toString());

   const activeBarCount = Math.floor((percent / 100) * bars.length);
   bars.forEach((bar, idx) => {
    bar.classList.toggle('is-passed', idx <= activeBarCount);
   });
  };

  audio.addEventListener('loadedmetadata', () => {
   if (totalEl && audio.duration) {
    totalEl.textContent = formatAudioTime(audio.duration);
   }
   updateProgress();
  });

  audio.addEventListener('timeupdate', updateProgress);

  const setPlayingUi = (playing: boolean) => {
   player.classList.toggle('is-playing', playing);
   if (playIcon) playIcon.style.display = playing ? 'none' : 'inline';
   if (pauseIcon) pauseIcon.style.display = playing ? 'inline' : 'none';
   playBtn.setAttribute('aria-label', playing ? 'Pause voice note' : 'Play voice note');
  };

  audio.addEventListener('play', () => {
   // Pause other playing voice audios
   document.querySelectorAll<HTMLAudioElement>('.voice-audio-element').forEach((other) => {
    if (other !== audio && !other.paused) other.pause();
   });
   setPlayingUi(true);
   try { navigator.vibrate?.([15]); } catch {}
  });

  audio.addEventListener('pause', () => setPlayingUi(false));
  audio.addEventListener('ended', () => {
   setPlayingUi(false);
   audio.currentTime = 0;
   updateProgress();
  });

  playBtn.addEventListener('click', (e) => {
   e.stopPropagation();
   if (audio.paused) {
    audio.play().catch(() => undefined);
   } else {
    audio.pause();
   }
  });

  const seek = (clientX: number) => {
   const rect = scrubWrap.getBoundingClientRect();
   const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
   const percent = clickX / rect.width;
   if (audio.duration) {
    audio.currentTime = percent * audio.duration;
    updateProgress();
   }
  };

  scrubWrap.addEventListener('click', (e) => {
   e.stopPropagation();
   seek(e.clientX);
  });

  // Keyboard navigation for slider
  scrubWrap.addEventListener('keydown', (e) => {
   if (!audio.duration) return;
   if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault();
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
   } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault();
    audio.currentTime = Math.max(0, audio.currentTime - 5);
   } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
   }
  });
 });
}
