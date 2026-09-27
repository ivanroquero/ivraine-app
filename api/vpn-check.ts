import type {
  ApiRequest,
  ApiResponse,
  VpnCheckResponse,
  VpnCheckDetails
} from './types';

// Known VPN, Proxy, and Cloud Datacenter ASNs
const KNOWN_VPN_AND_DATACENTER_ASNS = new Set<number>([
  13335,  // Cloudflare WARP / 1.1.1.1
  14061,  // DigitalOcean
  62240,  // DigitalOcean
  20473,  // The Constant Company / Vultr
  204957, // Choopa / Vultr
  16509,  // Amazon AWS
  14618,  // Amazon AWS
  15169,  // Google Cloud
  396982, // Google Cloud
  8075,   // Microsoft Azure
  63949,  // Linode / Akamai
  209,    // CenturyLink / Akamai
  16276,  // OVH SAS
  24940,  // Hetzner Online
  9009,   // M247 Ltd (Major VPN hosting provider)
  60068,  // Datacamp Limited / CDN77
  212238, // Datacamp Limited
  51167,  // Contabo GmbH
  51852,  // Private Layer INC
  39351,  // 31173 Services AB (Mullvad)
  206013, // Mullvad
  202425, // IP Volume inc
  36352,  // ColoCrossing
  174,    // Cogent Communications
  12876,  // SCALEWAY
  20001,  // Hostinger
  45102,  // Alibaba Cloud
  31898,  // Oracle Cloud
  55081,  // 24-7 Internet / Proton AG
  62371,  // Proton AG
  44133,  // Proton AG
  205120, // Proton AG
  208476, // Proton S.A.
  209854, // Proton AG
  206216, // Proton AG
  8100,   // QuadraNet Enterprises LLC
  28753,  // Leaseweb
  60781,  // LeaseWeb Netherlands
  30890,  // EVOSWITCH
  42831,  // UK Dedicated Servers
  6079,   // RcodeZero
  46562,  // Performive
  54600,  // Peg Tech
  200651, // FlokiNET
  49981,  // WorldStream
  62567   // Digital Energy Technologies
]);

const VPN_KEYWORDS = [
  'vpn', 'proxy', 'tor', 'relay', 'datacenter', 'hosting', 'cloud', 'digitalocean',
  'ovh', 'hetzner', 'm247', 'datacamp', 'linode', 'vultr', 'choopa', 'leaseweb',
  'quadranet', 'expressvpn', 'nordvpn', 'surfshark', 'mullvad', 'proton', 'protonvpn',
  'proton-vpn', 'proton ag', 'protonmail', 'proton mail', 'proton technologies',
  '24-7 internet', 'privatelayer', 'private layer', 'dclnet', 'cyberghost',
  'private internet access', 'ipvanish', 'windscribe', 'hidemyass', 'purevpn',
  'tunnels', 'hostinger', 'kamatera', 'scaleway', 'fastly', 'cogent', 'wireguard',
  'openvpn', 'zenmate', 'private relay', 'anonymizer'
];

export default async function handler(
  req: ApiRequest<undefined, { deviceTimezone?: string; deviceOffset?: string; simulateVpn?: string }>,
  res: ApiResponse<VpnCheckResponse>
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Timezone, X-Device-Offset');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const forwarded = req.headers['x-forwarded-for'];
  let ip = '127.0.0.1';
  let isMultipleHops = false;

  if (typeof forwarded === 'string' && forwarded.trim()) {
    const parts = forwarded.split(',').map((p) => p.trim());
    ip = parts[0];
    if (parts.length > 2) isMultipleHops = true;
  } else if (req.headers['x-real-ip']) {
    ip = String(req.headers['x-real-ip']).trim();
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';

  const query = req.query || {};
  const deviceTimezone = query.deviceTimezone || (req.headers['x-device-timezone'] as string) || '';
  const deviceOffsetRaw = query.deviceOffset ?? (req.headers['x-device-offset'] as string);
  const deviceOffsetNum = deviceOffsetRaw !== undefined && deviceOffsetRaw !== '' ? Number(deviceOffsetRaw) : null;
  const simulateVpn = query.simulateVpn === '1' || query.simulateVpn === 'true';

  const flags: string[] = [];
  let reason = '';
  let isp = '';
  let org = '';
  let asn: string | number = '';
  let country = (req.headers['x-vercel-ip-country'] as string) || '';
  let city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(String(req.headers['x-vercel-ip-city'])) : '';
  let ipTimezone = (req.headers['x-vercel-ip-timezone'] as string) || '';
  let ipOffsetSeconds: number | null = null;

  // 1. Check Proxy / Tunneling Headers
  if (req.headers['via']) {
    flags.push('VIA_PROXY_HEADER');
    reason = 'Forwarding proxy gateway header identified (Via)';
  }
  if (isMultipleHops) {
    flags.push('PROXY_CHAIN_FORWARDED');
    if (!reason) reason = 'Multi-hop proxy tunnel identified in forwarded headers';
  }

  // 2. Check Vercel Edge ASN if available
  const vercelAsn = req.headers['x-vercel-ip-as-number'] ? Number(req.headers['x-vercel-ip-as-number']) : null;
  if (vercelAsn && KNOWN_VPN_AND_DATACENTER_ASNS.has(vercelAsn)) {
    flags.push('DATACENTER_ASN');
    asn = `AS${vercelAsn}`;
    if (!reason) reason = `Known VPN / Datacenter ASN detected (${asn})`;
  }

  // 3. Live IP Intelligence API Query
  if (ip !== '127.0.0.1') {
    try {
      const geoRes = await fetch(`https://ipwho.is/${ip}`, {
        signal: AbortSignal.timeout(2800)
      });
      if (geoRes.ok) {
        const data = (await geoRes.json()) as any;
        if (data && data.success !== false) {
          country = country || data.country || '';
          city = city || data.city || '';
          isp = data.connection?.isp || '';
          org = data.connection?.org || '';
          const remoteAsn = data.connection?.asn ? Number(data.connection.asn) : null;
          if (remoteAsn) asn = `AS${remoteAsn}`;

          if (data.timezone) {
            ipTimezone = data.timezone.id || ipTimezone;
            if (typeof data.timezone.offset === 'number') {
              ipOffsetSeconds = data.timezone.offset;
            }
          }

          // Check direct security flags from ipwho.is
          const sec = data.security || {};
          if (sec.vpn === true) {
            flags.push('VPN_SERVICE_FLAG');
            if (!reason) reason = 'Active VPN service endpoint detected by threat intelligence';
          }
          if (sec.proxy === true) {
            flags.push('PROXY_TUNNEL_FLAG');
            if (!reason) reason = 'Encrypted proxy tunnel identified';
          }
          if (sec.tor === true) {
            flags.push('TOR_EXIT_NODE');
            if (!reason) reason = 'Tor network anonymization node detected';
          }
          if (sec.relay === true) {
            flags.push('RELAY_TUNNEL');
            if (!reason) reason = 'Anonymizing relay tunnel detected (e.g. iCloud Private Relay / Warp)';
          }

          // Check ASN against known VPN list
          if (remoteAsn && KNOWN_VPN_AND_DATACENTER_ASNS.has(remoteAsn)) {
            flags.push('DATACENTER_ASN');
            if (!reason) reason = `Datacenter / Tunneling ASN verified (${asn} ${org || isp})`;
          }

          // Check ISP and Org text for keywords
          const combinedOrg = `${isp} ${org}`.toLowerCase();
          for (const kw of VPN_KEYWORDS) {
            if (combinedOrg.includes(kw)) {
              flags.push(`KEYWORD_MATCH_${kw.toUpperCase().replace(/\s+/g, '_')}`);
              if (!reason) reason = `Hosting or VPN provider signature found (${isp || org})`;
              break;
            }
          }
        }
      }
    } catch {
      // Fallback: try demo.ip-api.com
      try {
        const fbRes = await fetch(
          `https://demo.ip-api.com/json/${ip}?fields=status,country,city,timezone,offset,isp,org,as,mobile,proxy,hosting`,
          { signal: AbortSignal.timeout(2000) }
        );
        if (fbRes.ok) {
          const fb = (await fbRes.json()) as any;
          if (fb && fb.status === 'success') {
            country = country || fb.country || '';
            city = city || fb.city || '';
            isp = isp || fb.isp || '';
            org = org || fb.org || '';
            asn = asn || fb.as || '';
            ipTimezone = ipTimezone || fb.timezone || '';
            if (typeof fb.offset === 'number') ipOffsetSeconds = fb.offset;

            if (fb.proxy === true) {
              flags.push('PROXY_FLAG');
              if (!reason) reason = 'Active proxy service verified';
            }
            if (fb.hosting === true) {
              flags.push('DATACENTER_HOSTING');
              if (!reason) reason = `Commercial datacenter / hosting IP detected (${fb.isp || fb.org || asn})`;
            }
          }
        }
      } catch {
        // Threat intelligence service unavailable or timed out
      }
    }
  }

  // 4. Device Timezone vs IP Geolocation Conflict Check
  if (deviceOffsetNum !== null && ipOffsetSeconds !== null) {
    // deviceOffsetNum is in JS minutes (e.g. UTC+8 = -480)
    const deviceHours = -deviceOffsetNum / 60;
    const ipHours = ipOffsetSeconds / 3600;
    const diffHours = Math.abs(deviceHours - ipHours);

    // If there is any discrepancy (>= 0.5 hours) between the user's system clock and IP geo
    if (diffHours >= 0.5) {
      flags.push('TIMEZONE_GEO_MISMATCH');
      const conflictMsg = `Timezone conflict: device clock is UTC${deviceHours >= 0 ? '+' : ''}${deviceHours} (${deviceTimezone || 'local'}) but connection routes via UTC${ipHours >= 0 ? '+' : ''}${ipHours} (${ipTimezone || country || 'remote'})`;
      if (!reason) reason = conflictMsg;
    }
  } else if (deviceTimezone && ipTimezone && deviceTimezone !== ipTimezone) {
    flags.push('TIMEZONE_MISMATCH');
    if (!reason) reason = `Location mismatch: system timezone (${deviceTimezone}) differs from network origin (${ipTimezone})`;
  }

  // 5. Simulation flag for test suites and dev inspection
  if (simulateVpn) {
    flags.push('SIMULATED_TEST_VPN');
    if (!reason) reason = 'Continuous VPN / tunnel simulated for verification';
    isp = isp || 'M247 Ltd (Simulation)';
    org = org || 'NordVPN Gateway';
    asn = asn || 'AS9009';
  }

  const isVpn = flags.length > 0;
  const confidence = flags.some((f) =>
    ['VPN_SERVICE_FLAG', 'PROXY_TUNNEL_FLAG', 'TOR_EXIT_NODE', 'RELAY_TUNNEL', 'DATACENTER_ASN', 'DATACENTER_HOSTING', 'SIMULATED_TEST_VPN'].includes(f)
  )
    ? 'high'
    : flags.length >= 2
    ? 'high'
    : isVpn
    ? 'medium'
    : 'low';

  const details: VpnCheckDetails = {
    ip,
    isp: isp || 'Direct Network',
    org: org || 'Residential / Mobile Carrier',
    asn: asn || 'N/A',
    country: country || 'Unknown',
    city: city || 'Unknown',
    timezone: ipTimezone || 'Unknown',
    deviceTimezone: deviceTimezone || undefined,
    flags
  };

  return res.status(200).json({
    status: 'ok',
    isVpn,
    confidence,
    reason: isVpn ? reason : 'Direct, authentic connection verified',
    clientIp: ip,
    details
  });
}
