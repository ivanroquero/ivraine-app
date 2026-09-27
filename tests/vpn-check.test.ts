import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vpnCheckHandler from '../api/vpn-check.js';
import { createApp } from '../backend/src/app.js';

test('Strict VPN: api/vpn-check handler returns clean status for local connection without proxy headers', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const req: any = {
    method: 'GET',
    headers: {},
    query: {}
  };

  const res: any = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
    },
    end: () => {}
  };

  await vpnCheckHandler(req, res);

  assert.equal(statusCode, 200);
  assert.equal(responseData.status, 'ok');
  assert.equal(responseData.isVpn, false);
  assert.equal(responseData.clientIp, '127.0.0.1');
  assert.ok(responseData.details, 'Response contains details');
});

test('Strict VPN: api/vpn-check detects simulation and flags isVpn=true with high confidence', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const req: any = {
    method: 'GET',
    headers: {},
    query: { simulateVpn: '1' }
  };

  const res: any = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
    },
    end: () => {}
  };

  await vpnCheckHandler(req, res);

  assert.equal(statusCode, 200);
  assert.equal(responseData.status, 'ok');
  assert.equal(responseData.isVpn, true);
  assert.equal(responseData.confidence, 'high');
  assert.ok(responseData.details.flags.includes('SIMULATED_TEST_VPN'));
  assert.match(responseData.reason, /continuous|vpn|tunnel/i);
});

test('Strict VPN: api/vpn-check detects known datacenter ASN (Cloudflare WARP / DigitalOcean / M247)', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const req: any = {
    method: 'GET',
    headers: {
      'x-vercel-ip-as-number': '13335', // Cloudflare WARP
      'x-forwarded-for': '104.28.192.1'
    },
    query: {}
  };

  const res: any = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
    },
    end: () => {}
  };

  await vpnCheckHandler(req, res);

  assert.equal(statusCode, 200);
  assert.equal(responseData.isVpn, true);
  assert.ok(responseData.details.flags.includes('DATACENTER_ASN'));
  assert.match(responseData.reason, /datacenter|asn|vpn/i);
});

test('Strict VPN: api/vpn-check detects forwarding proxy via header and chain', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const req: any = {
    method: 'GET',
    headers: {
      'via': '1.1 squid-proxy.local',
      'x-forwarded-for': '185.220.101.5, 10.0.0.1, 192.168.1.1'
    },
    query: {}
  };

  const res: any = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
    },
    end: () => {}
  };

  await vpnCheckHandler(req, res);

  assert.equal(statusCode, 200);
  assert.equal(responseData.isVpn, true);
  assert.ok(responseData.details.flags.includes('VIA_PROXY_HEADER'));
  assert.ok(responseData.details.flags.includes('PROXY_CHAIN_FORWARDED'));
});

test('Strict VPN: backend Express app serves /api/vpn-check GET and POST', async () => {
  const app = createApp({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key',
    origins: ['http://localhost:5173'],
    trustProxy: 1
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/vpn-check
    const resGet = await fetch(`${baseUrl}/api/vpn-check?simulateVpn=1`);
    assert.equal(resGet.status, 200);
    const dataGet = (await resGet.json()) as any;
    assert.equal(dataGet.status, 'ok');
    assert.equal(dataGet.isVpn, true);
    assert.equal(dataGet.confidence, 'high');

    // 2. POST /api/vpn-check
    const resPost = await fetch(`${baseUrl}/api/vpn-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulateVpn: false })
    });
    assert.equal(resPost.status, 200);
    const dataPost = (await resPost.json()) as any;
    assert.equal(dataPost.status, 'ok');
  } finally {
    server.close();
  }
});

test('Strict VPN: UI files contain the improved required warning message', () => {
  const vpnDetectorSrc = readFileSync(resolve('frontend/src/vpnDetector.ts'), 'utf8');
  const legacyShieldJs = readFileSync(resolve('frontend/public/legacy/vpn-shield.js'), 'utf8');
  const legacyIndexHtml = readFileSync(resolve('frontend/public/legacy/index.html'), 'utf8');

  // Verify the exact continuous VPN detection phrase requested by the user
  const requiredPhrase = /the system detected that you[’']re continuously using a vpn/i;
  assert.match(vpnDetectorSrc, requiredPhrase, 'vpnDetector.ts includes continuous VPN message');
  assert.match(legacyShieldJs, requiredPhrase, 'vpn-shield.js includes continuous VPN message');

  // Verify legacy index.html references the shield
  assert.ok(legacyIndexHtml.includes('vpn-shield.css'), 'legacy index.html links vpn-shield.css');
  assert.ok(legacyIndexHtml.includes('vpn-shield.js'), 'legacy index.html imports vpn-shield.js');

  // Verify CSS files exist
  assert.ok(existsSync(resolve('frontend/src/vpn-shield.css')), 'frontend/src/vpn-shield.css exists');
  assert.ok(existsSync(resolve('frontend/public/legacy/vpn-shield.css')), 'legacy vpn-shield.css exists');
});

test('Strict VPN: Admin override passcode is strictly set to 02252006$$', () => {
  const vpnDetectorSrc = readFileSync(resolve('frontend/src/vpnDetector.ts'), 'utf8');
  const legacyShieldJs = readFileSync(resolve('frontend/public/legacy/vpn-shield.js'), 'utf8');
  const adminSrc = readFileSync(resolve('frontend/src/admin.ts'), 'utf8');
  const adminHtml = readFileSync(resolve('frontend/admin.html'), 'utf8');

  // Verify 02252006$$ is explicitly checked
  assert.ok(vpnDetectorSrc.includes("'02252006$$'"), 'vpnDetector.ts verifies 02252006$$');
  assert.ok(legacyShieldJs.includes("'02252006$$'"), 'legacy vpn-shield.js verifies 02252006$$');
  assert.ok(adminSrc.includes("'02252006$$'"), 'admin.ts verifies 02252006$$');

  // Verify bypasses with arbitrary "admin" or length === 8 were removed from vpnDetector
  assert.ok(!vpnDetectorSrc.includes("input.toLowerCase() === 'admin'"), 'generic "admin" string removed from vpnDetector');
  assert.ok(!legacyShieldJs.includes("input.toLowerCase() === 'admin'"), 'generic "admin" string removed from legacy shield');

  // Verify admin.html allows up to 20 chars for 02252006$$
  assert.match(adminHtml, /id="admin-passcode-input"[^>]*maxlength="20"/, 'admin.html passcode input allows 20 chars');
});

test('Strict VPN: Proton VPN ASNs, partner relays, and keywords are covered', () => {
  const apiHandlerSrc = readFileSync(resolve('api/vpn-check.ts'), 'utf8');
  const backendHandlerSrc = readFileSync(resolve('backend/src/vpnCheck.ts'), 'utf8');
  const vpnDetectorSrc = readFileSync(resolve('frontend/src/vpnDetector.ts'), 'utf8');

  // Key Proton ASNs: 55081 (24-7 Internet / Proton), 62371, 44133, 205120, 208476, 209854, 206216
  const protonAsns = ['55081', '62371', '44133', '205120', '208476', '209854', '206216'];
  for (const asn of protonAsns) {
    assert.ok(apiHandlerSrc.includes(asn), `api/vpn-check.ts includes Proton ASN ${asn}`);
    assert.ok(backendHandlerSrc.includes(asn), `backend/src/vpnCheck.ts includes Proton ASN ${asn}`);
    assert.ok(vpnDetectorSrc.includes(asn), `frontend/src/vpnDetector.ts includes Proton ASN ${asn}`);
  }

  // Proton keywords
  const protonKeywords = ['proton', 'protonvpn', 'proton ag', '24-7 internet'];
  for (const kw of protonKeywords) {
    assert.ok(apiHandlerSrc.toLowerCase().includes(kw), `api/vpn-check.ts checks for keyword "${kw}"`);
  }
});

test('Anti-Inspect: Sources tab hiding, sourcemaps disabled, anonymous chunk hashing, and anti-inspect guards active', () => {
  const viteConfigSrc = readFileSync(resolve('frontend/vite.config.ts'), 'utf8');
  const antiInspectSrc = readFileSync(resolve('frontend/src/antiInspect.ts'), 'utf8');
  const mainSrc = readFileSync(resolve('frontend/src/main.ts'), 'utf8');
  const lockSrc = readFileSync(resolve('frontend/src/lock.ts'), 'utf8');
  const legacyShieldJs = readFileSync(resolve('frontend/public/legacy/vpn-shield.js'), 'utf8');

  // Verify sourcemap is explicitly false in build and esbuild
  assert.match(viteConfigSrc, /sourcemap:\s*false/, 'sourcemap is disabled in vite.config.ts');
  assert.match(viteConfigSrc, /legalComments:\s*'none'/, 'legalComments set to none to strip header comments');

  // Verify anonymous chunk hashing configuration
  assert.match(viteConfigSrc, /entryFileNames:\s*'assets\/\[hash\]\.js'/, 'entry files hashed anonymously');
  assert.match(viteConfigSrc, /chunkFileNames:\s*'assets\/\[hash\]\.js'/, 'chunks hashed anonymously');

  // Verify antiInspect module defenses
  assert.ok(antiInspectSrc.includes('contextmenu'), 'antiInspect disables context menu');
  assert.ok(antiInspectSrc.includes('F12'), 'antiInspect intercepts F12');
  assert.ok(antiInspectSrc.includes('debugger'), 'antiInspect includes debugger trap');
  assert.ok(antiInspectSrc.includes('console.clear'), 'antiInspect clears console');

  // Verify integration in main.ts, lock.ts, and legacy shield
  assert.ok(mainSrc.includes('initAntiInspect'), 'main.ts integrates initAntiInspect');
  assert.ok(lockSrc.includes('initAntiInspect'), 'lock.ts integrates initAntiInspect');
  assert.ok(legacyShieldJs.includes('initAntiInspect'), 'legacy vpn-shield.js integrates initAntiInspect');
});

test('PWA Support: legacy service worker caches VPN shield files for offline PWA protection', () => {
  const swSrc = readFileSync(resolve('frontend/public/legacy/sw.js'), 'utf8');
  assert.ok(swSrc.includes('"vpn-shield.css"'), 'legacy sw.js caches vpn-shield.css');
  assert.ok(swSrc.includes('"vpn-shield.js"'), 'legacy sw.js caches vpn-shield.js');
});

