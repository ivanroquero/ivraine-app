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
