import './vpn-shield.css';
import type { VpnCheckResponse } from '@api/types';

export interface VpnStatus {
  isVpn: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  ip: string;
  isp?: string;
  org?: string;
  asn?: string | number;
  country?: string;
  city?: string;
  timezone?: string;
  flags: string[];
}

const STORAGE_VPN_KEY = 'ivraine_vpn_detected';
const STORAGE_VPN_DETAILS_KEY = 'ivraine_vpn_details';
const ADMIN_OVERRIDE_KEY = 'ivraine_vpn_admin_override';

let activeOverlay: HTMLDivElement | null = null;
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let isChecking = false;

function buzz(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

/**
 * Returns the client device's local timezone and offset in minutes.
 */
export function getDeviceTimeContext(): { timezone: string; offsetMinutes: number } {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const offsetMinutes = new Date().getTimezoneOffset();
    return { timezone, offsetMinutes };
  } catch {
    return { timezone: '', offsetMinutes: 0 };
  }
}

/**
 * Perform WebRTC probe to detect candidate suppression, proxy routing, or leaked interfaces.
 */
export async function probeWebRtc(): Promise<{ candidateIp?: string; blocked: boolean }> {
  return new Promise((resolve) => {
    if (!('RTCPeerConnection' in window)) {
      resolve({ blocked: false });
      return;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      let candidateFound = false;
      const timeout = setTimeout(() => {
        try { pc.close(); } catch {}
        resolve({ blocked: !candidateFound });
      }, 1200);

      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          candidateFound = true;
          const match = /([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/.exec(event.candidate.candidate);
          const ip = match ? match[1] : undefined;
          clearTimeout(timeout);
          try { pc.close(); } catch {}
          resolve({ candidateIp: ip, blocked: false });
        }
      };

      pc.createDataChannel('ivraine-vpn-probe');
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timeout);
          resolve({ blocked: true });
        });
    } catch {
      resolve({ blocked: true });
    }
  });
}

/**
 * Queries either the /api/vpn-check endpoint or falls back to direct browser intelligence.
 */
export async function checkVpnStatus(simulate = false): Promise<VpnStatus> {
  const { timezone, offsetMinutes } = getDeviceTimeContext();
  const url = `/api/vpn-check?deviceTimezone=${encodeURIComponent(timezone)}&deviceOffset=${offsetMinutes}${simulate ? '&simulateVpn=1' : ''}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'Accept': 'application/json',
        'X-Device-Timezone': timezone,
        'X-Device-Offset': String(offsetMinutes)
      }
    });

    if (res.ok) {
      const data = (await res.json()) as VpnCheckResponse;
      return {
        isVpn: data.isVpn,
        confidence: data.confidence,
        reason: data.reason || 'VPN tunnel detected',
        ip: data.details.ip || data.clientIp,
        isp: data.details.isp,
        org: data.details.org,
        asn: data.details.asn,
        country: data.details.country,
        city: data.details.city,
        timezone: data.details.timezone,
        flags: data.details.flags || []
      };
    }
  } catch {}

  // Direct client-side threat intelligence fallback (if /api is not deployed or static preview)
  try {
    const clientRes = await fetch('https://ipwho.is/', {
      signal: AbortSignal.timeout(3000)
    });
    if (clientRes.ok) {
      const data = await clientRes.json();
      if (data && data.success !== false) {
        const flags: string[] = [];
        let reason = '';
        const sec = data.security || {};

        if (sec.vpn === true) {
          flags.push('VPN_SERVICE_FLAG');
          reason = 'Commercial VPN service detected';
        }
        if (sec.proxy === true) {
          flags.push('PROXY_TUNNEL_FLAG');
          if (!reason) reason = 'Proxy tunnel detected';
        }
        if (sec.tor === true) {
          flags.push('TOR_EXIT_NODE');
          if (!reason) reason = 'Tor exit node identified';
        }
        if (sec.relay === true) {
          flags.push('RELAY_TUNNEL');
          if (!reason) reason = 'Private relay tunnel detected';
        }

        const isp = data.connection?.isp || '';
        const org = data.connection?.org || '';
        const rawAsn = data.connection?.asn ? Number(data.connection.asn) : 0;
        const asn = rawAsn ? `AS${rawAsn}` : '';
        const combined = `${isp} ${org}`.toLowerCase();

        // Check against known Proton and datacenter ASNs
        const PROTON_AND_VPN_ASNS = new Set<number>([
          55081, 62371, 44133, 205120, 208476, 209854, 206216, 51852, 60068,
          212238, 9009, 39351, 202425, 42831, 60781, 30890, 16276, 24940,
          204957, 36352, 14061, 62240, 13335, 8075, 16509, 14618, 15169,
          63949, 51167, 174, 12876, 20001, 45102, 31898, 6079, 46562, 54600,
          200651, 49981, 62567
        ]);
        if (rawAsn && PROTON_AND_VPN_ASNS.has(rawAsn)) {
          flags.push('DATACENTER_OR_VPN_PROVIDER');
          if (!reason) reason = `Proton or Datacenter VPN network identified (${asn} ${isp || org})`;
        }

        const vpnKeywords = [
          'vpn', 'proxy', 'tor', 'relay', 'datacenter', 'hosting', 'cloud', 'digitalocean',
          'ovh', 'hetzner', 'm247', 'datacamp', 'linode', 'vultr', 'choopa', 'mullvad',
          'proton', 'protonvpn', 'proton-vpn', 'proton ag', 'protonmail', 'proton technologies',
          '24-7 internet', 'privatelayer', 'private layer', 'dclnet', 'expressvpn', 'nordvpn',
          'surfshark', 'cyberghost', 'wireguard', 'openvpn', 'private relay'
        ];
        for (const kw of vpnKeywords) {
          if (combined.includes(kw)) {
            flags.push('DATACENTER_OR_VPN_PROVIDER');
            if (!reason) reason = `Hosting or VPN provider identified (${isp || org})`;
            break;
          }
        }

        // Timezone discrepancy check (0.5 hour or more difference)
        if (data.timezone && typeof data.timezone.offset === 'number') {
          const deviceHours = -offsetMinutes / 60;
          const ipHours = data.timezone.offset / 3600;
          if (Math.abs(deviceHours - ipHours) >= 0.5) {
            flags.push('TIMEZONE_GEO_MISMATCH');
            if (!reason) reason = `Timezone conflict: system is UTC${deviceHours >= 0 ? '+' : ''}${deviceHours} but network is UTC${ipHours >= 0 ? '+' : ''}${ipHours}`;
          }
        }

        const isVpn = flags.length > 0 || simulate;
        return {
          isVpn,
          confidence: flags.length > 1 ? 'high' : isVpn ? 'medium' : 'low',
          reason: isVpn ? (reason || 'Tunnel detected') : 'Direct connection verified',
          ip: data.ip || 'Direct Node',
          isp,
          org,
          asn,
          country: data.country || '',
          city: data.city || '',
          timezone: data.timezone?.id || '',
          flags
        };
      }
    }
  } catch {}

  // If completely offline or unreachable and was previously flagged
  const wasDetected = sessionStorage.getItem(STORAGE_VPN_KEY) === 'true' || localStorage.getItem(STORAGE_VPN_KEY) === 'true';
  return {
    isVpn: wasDetected || simulate,
    confidence: wasDetected ? 'high' : 'low',
    reason: wasDetected ? 'Continuous VPN connection previously flagged' : 'Connection unverified',
    ip: '127.0.0.1',
    flags: wasDetected ? ['PERSISTENT_VPN_FLAG'] : []
  };
}

/**
 * Report VPN detection to admin activity feed.
 */
function reportVpnDetection(status: VpnStatus, section = 'Scrapbook') {
  try {
    const details = `[VPN BLOCKED] ${status.reason} | IP: ${status.ip} | ISP: ${status.isp || 'Unknown'} | ASN: ${status.asn || 'N/A'} | Flags: ${status.flags.join(', ')}`;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section,
        action: '🚨 VPN / Proxy Detected [BLOCKED]',
        details,
        user: 'Visitor',
        latitude: null,
        longitude: null,
        city: status.city,
        country: status.country
      }),
      keepalive: true
    }).catch(() => {});

    const channel = new BroadcastChannel('ivraine_admin_channel');
    channel.postMessage({
      type: 'LOG_ADDED',
      entry: {
        id: 'vpn_' + Date.now(),
        ip: status.ip,
        section,
        action: '🚨 VPN / Proxy Detected [BLOCKED]',
        details,
        user: 'Visitor',
        userAgent: navigator.userAgent,
        city: status.city || '',
        country: status.country || '',
        timestamp: new Date().toISOString()
      }
    });
  } catch {}
}

/**
 * Render the ultra-modern VPN restriction overlay.
 */
export function showVpnGuard(status: VpnStatus, onResolved?: () => void) {
  if (sessionStorage.getItem(ADMIN_OVERRIDE_KEY) === 'true') {
    return;
  }

  // Persist detection state so it persists across reloads
  sessionStorage.setItem(STORAGE_VPN_KEY, 'true');
  localStorage.setItem(STORAGE_VPN_KEY, 'true');
  sessionStorage.setItem(STORAGE_VPN_DETAILS_KEY, JSON.stringify(status));

  document.body.classList.add('ivraine-vpn-locked');

  if (activeOverlay && document.body.contains(activeOverlay)) {
    updateVpnGuardContent(activeOverlay, status, onResolved);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'ivraine-vpn-guard-overlay';
  overlay.id = 'ivraine-vpn-guard-overlay';
  activeOverlay = overlay;

  updateVpnGuardContent(overlay, status, onResolved);
  document.body.appendChild(overlay);

  // Prevent keyboard dismissals / tab escaping
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') e.preventDefault();
  });
}

function updateVpnGuardContent(overlay: HTMLDivElement, status: VpnStatus, onResolved?: () => void) {
  const flagsText = status.flags.length ? status.flags.join(' · ') : 'ANONYMIZED_TUNNEL';
  const providerText = `${status.isp || status.org || 'Datacenter / Tunnel Provider'}${status.asn ? ` (${status.asn})` : ''}`;
  const locationText = status.city && status.country ? `${status.city}, ${status.country}` : (status.country || 'External Tunnel Exit');

  overlay.innerHTML = `
    <div class="ivraine-vpn-guard-card" id="ivraine-vpn-card" role="alertdialog" aria-modal="true" aria-labelledby="vpn-guard-title">
      <div class="ivraine-vpn-radar-wrap" aria-hidden="true">
        <div class="ivraine-vpn-radar-ring"></div>
        <div class="ivraine-vpn-radar-ring second"></div>
        <div class="ivraine-vpn-shield-icon">
          <svg class="ivraine-vpn-shield-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <circle cx="12" cy="16" r="1"/>
          </svg>
        </div>
      </div>

      <div class="ivraine-vpn-status-pill">
        <span class="ivraine-vpn-pulse-dot" aria-hidden="true"></span>
        <span>ACCESS RESTRICTED &bull; VPN PROTOCOL DETECTED</span>
      </div>

      <h2 class="ivraine-vpn-title" id="vpn-guard-title">
        Continuous VPN &amp; Proxy<br><span>Usage Detected</span>
      </h2>

      <div class="ivraine-vpn-notice-box">
        <p>The system detected that you’re continuously using a VPN or an unauthorized network proxy.</p>
        <p class="subtext">
          Access to this private environment is restricted strictly to verified, direct residential connections.
          Anonymizing tunnels, commercial VPNs, and proxy masking services are prohibited to safeguard the intimacy and integrity of this space.
          Even on your initial visit, access cannot be granted through a masked connection.
        </p>
      </div>

      <div class="ivraine-vpn-hud">
        <div class="ivraine-vpn-hud-header">
          <span>Security Telemetry</span>
          <span class="live">&bull; Live Inspection</span>
        </div>
        <div class="ivraine-vpn-hud-row">
          <span class="ivraine-vpn-hud-label">Client IP:</span>
          <span class="ivraine-vpn-hud-val">${status.ip || '127.0.0.1'}</span>
        </div>
        <div class="ivraine-vpn-hud-row">
          <span class="ivraine-vpn-hud-label">Network / ISP:</span>
          <span class="ivraine-vpn-hud-val">${providerText}</span>
        </div>
        <div class="ivraine-vpn-hud-row">
          <span class="ivraine-vpn-hud-label">Detected Node:</span>
          <span class="ivraine-vpn-hud-val">${locationText}</span>
        </div>
        <div class="ivraine-vpn-hud-row">
          <span class="ivraine-vpn-hud-label">Detection Flag:</span>
          <span class="ivraine-vpn-hud-val alert">${status.reason || flagsText}</span>
        </div>
      </div>

      <div class="ivraine-vpn-steps">
        <h4>How to Unlock Access</h4>
        <ol>
          <li><strong>Turn off your VPN</strong> application (e.g. NordVPN, ExpressVPN, Surfshark, Turbo, Cloudflare WARP, or Private Relay).</li>
          <li><strong>Disable browser proxy extensions</strong> or custom system tunnel configurations.</li>
          <li><strong>Connect directly</strong> using your mobile network data (LTE/5G) or home Wi-Fi.</li>
          <li>Tap <strong>“Recheck Connection &amp; Verify”</strong> below once your VPN is fully disconnected.</li>
        </ol>
      </div>

      <button class="ivraine-vpn-btn-recheck" id="ivraine-vpn-recheck-btn" type="button">
        <span>Recheck Connection &amp; Verify Direct Link</span>
      </button>

      <div class="ivraine-vpn-footer">
        <span>Ivraine Security &bull; Continuous Tunnel Shield</span>
        <button type="button" class="ivraine-vpn-admin-link" id="ivraine-vpn-admin-override-btn">Admin Override ⚙</button>
      </div>
    </div>
  `;

  const card = overlay.querySelector<HTMLDivElement>('#ivraine-vpn-card')!;
  const recheckBtn = overlay.querySelector<HTMLButtonElement>('#ivraine-vpn-recheck-btn')!;
  const overrideBtn = overlay.querySelector<HTMLButtonElement>('#ivraine-vpn-admin-override-btn')!;

  recheckBtn.addEventListener('click', async () => {
    recheckBtn.disabled = true;
    recheckBtn.innerHTML = '<span class="ivraine-vpn-spinner"></span><span>Verifying direct connection…</span>';

    try {
      const freshStatus = await checkVpnStatus(false);

      if (freshStatus.isVpn) {
        buzz([40, 60, 40]);
        card.classList.remove('is-shaking');
        void card.offsetWidth; // Trigger reflow
        card.classList.add('is-shaking');

        updateVpnGuardContent(overlay, freshStatus, onResolved);
      } else {
        // Direct clean connection verified!
        card.classList.add('is-verified');
        recheckBtn.innerHTML = '<span>✓ Direct Connection Verified! Unlocking…</span>';
        buzz([20, 40, 20]);

        sessionStorage.removeItem(STORAGE_VPN_KEY);
        localStorage.removeItem(STORAGE_VPN_KEY);
        sessionStorage.removeItem(STORAGE_VPN_DETAILS_KEY);

        setTimeout(() => {
          overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          overlay.style.opacity = '0';
          overlay.style.transform = 'scale(1.03)';
          setTimeout(() => {
            overlay.remove();
            activeOverlay = null;
            document.body.classList.remove('ivraine-vpn-locked');
            if (onResolved) onResolved();
          }, 400);
        }, 800);
      }
    } catch {
      recheckBtn.disabled = false;
      recheckBtn.innerHTML = '<span>Recheck Connection &amp; Verify Direct Link</span>';
    }
  });

  overrideBtn.addEventListener('click', () => {
    const input = prompt('Enter Administrator Passcode to bypass VPN lock:');
    const passcode = input ? input.trim() : '';
    if (passcode === '03201952') {
      sessionStorage.setItem(ADMIN_OVERRIDE_KEY, 'true');
      overlay.remove();
      activeOverlay = null;
      document.body.classList.remove('ivraine-vpn-locked');
      if (onResolved) onResolved();
    } else if (input) {
      alert('Invalid administrator passcode.');
    }
  });
}

/**
 * Initializes strict VPN detection across the application.
 * Runs instantly on page start, evaluates the connection, and sets up continuous background monitoring.
 */
export async function initVpnGuard(section = 'Scrapbook', onResolved?: () => void): Promise<boolean> {
  if (sessionStorage.getItem(ADMIN_OVERRIDE_KEY) === 'true') {
    return true;
  }

  // If user is already on admin page and authorized, skip
  if (location.pathname.includes('admin') && sessionStorage.getItem('ivraine-admin-unlocked') === 'true') {
    return true;
  }

  // If previously detected in this session/browser, show guard immediately to prevent content flash
  const cachedDetection = sessionStorage.getItem(STORAGE_VPN_KEY) === 'true' || localStorage.getItem(STORAGE_VPN_KEY) === 'true';
  if (cachedDetection) {
    let savedDetails: VpnStatus = {
      isVpn: true,
      confidence: 'high',
      reason: 'Continuous VPN connection detected',
      ip: '127.0.0.1',
      flags: ['PERSISTENT_VPN_FLAG']
    };
    try {
      const raw = sessionStorage.getItem(STORAGE_VPN_DETAILS_KEY);
      if (raw) savedDetails = JSON.parse(raw);
    } catch {}
    showVpnGuard(savedDetails, onResolved);
  }

  if (isChecking) return !cachedDetection;
  isChecking = true;

  try {
    const status = await checkVpnStatus(false);

    if (status.isVpn) {
      reportVpnDetection(status, section);
      showVpnGuard(status, onResolved);
      return false;
    } else {
      // Clean connection
      sessionStorage.removeItem(STORAGE_VPN_KEY);
      localStorage.removeItem(STORAGE_VPN_KEY);
      sessionStorage.removeItem(STORAGE_VPN_DETAILS_KEY);
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
        document.body.classList.remove('ivraine-vpn-locked');
      }
    }
  } finally {
    isChecking = false;
  }

  // Start continuous background monitoring every 25 seconds
  if (!monitorTimer) {
    monitorTimer = setInterval(async () => {
      if (sessionStorage.getItem(ADMIN_OVERRIDE_KEY) === 'true') return;
      if (document.hidden || !navigator.onLine) return;
      try {
        const check = await checkVpnStatus(false);
        if (check.isVpn && !activeOverlay) {
          reportVpnDetection(check, section);
          showVpnGuard(check, onResolved);
        }
      } catch {}
    }, 25000);

    window.addEventListener('online', () => {
      void checkVpnStatus(false).then((check) => {
        if (check.isVpn) {
          reportVpnDetection(check, section);
          showVpnGuard(check, onResolved);
        }
      });
    });
  }

  return true;
}
