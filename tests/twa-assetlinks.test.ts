import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../backend/src/app.js';

test('TWA: manifest.webmanifest has standalone display and root scope "/" for Android TWA', () => {
  const rootManifestPath = resolve('frontend/public/manifest.webmanifest');
  const legacyManifestPath = resolve('frontend/public/legacy/manifest.webmanifest');

  assert.ok(existsSync(rootManifestPath), 'Root manifest exists');
  assert.ok(existsSync(legacyManifestPath), 'Legacy manifest exists');

  const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8'));
  const legacyManifest = JSON.parse(readFileSync(legacyManifestPath, 'utf8'));

  // Both manifests must have scope: "/" so navigation never breaks out of the TWA to Chrome
  assert.equal(rootManifest.scope, '/', 'Root manifest scope must be "/"');
  assert.equal(legacyManifest.scope, '/', 'Legacy manifest scope must be "/"');

  // Both must have standalone display
  assert.equal(rootManifest.display, 'standalone', 'Root manifest display must be standalone');
  assert.equal(legacyManifest.display, 'standalone', 'Legacy manifest display must be standalone');

  // Must have 512 maskable icon
  const rootMaskable = rootManifest.icons.some((i: any) => i.purpose && i.purpose.includes('maskable'));
  const legacyMaskable = legacyManifest.icons.some((i: any) => i.purpose && i.purpose.includes('maskable'));
  assert.ok(rootMaskable, 'Root manifest has maskable icon');
  assert.ok(legacyMaskable, 'Legacy manifest has maskable icon');
});

test('TWA: frontend/public/.well-known/assetlinks.json exists and is valid Digital Asset Links array', () => {
  const assetlinksPath = resolve('frontend/public/.well-known/assetlinks.json');
  assert.ok(existsSync(assetlinksPath), 'assetlinks.json exists in frontend/public/.well-known/');

  const data = JSON.parse(readFileSync(assetlinksPath, 'utf8'));
  assert.ok(Array.isArray(data), 'assetlinks.json must be a JSON array');
  assert.ok(data.length > 0, 'assetlinks.json must contain at least one statement');

  for (const statement of data) {
    assert.ok(statement.relation.includes('delegate_permission/common.handle_all_urls'), 'Statement includes handle_all_urls relation');
    assert.equal(statement.target.namespace, 'android_app', 'Namespace must be android_app');
    assert.ok(typeof statement.target.package_name === 'string' && statement.target.package_name.length > 0, 'Package name must be non-empty string');
    assert.ok(Array.isArray(statement.target.sha256_cert_fingerprints) && statement.target.sha256_cert_fingerprints.length > 0, 'Fingerprints array must be non-empty');
  }
});

test('TWA: backend serves /.well-known/assetlinks.json and handles /api/admin/assetlinks', async () => {
  const app = createApp({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key',
    origins: ['http://localhost:5173'],
    trustProxy: 1
  });

  const server = app.listen(0, '127.0.0.1');
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Check GET /.well-known/assetlinks.json
    const res = await fetch(`${baseUrl}/.well-known/assetlinks.json`);
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Content-Type should be application/json, got ${contentType}`);

    const data = await res.json();
    assert.ok(Array.isArray(data), 'Returns JSON array');
    assert.ok(data.length >= 1, 'Contains statements');

    // 2. Check GET /api/admin/assetlinks
    const adminGet = await fetch(`${baseUrl}/api/admin/assetlinks`);
    assert.equal(adminGet.status, 200);
    const adminData = await adminGet.json();
    assert.equal(adminData.status, 'ok');

    // 3. Check POST /api/admin/assetlinks with custom PWABuilder package and fingerprint
    const adminPost = await fetch(`${baseUrl}/api/admin/assetlinks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageName: 'com.test.pwabuilder.twa',
        sha256Fingerprint: 'AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00'
      })
    });
    assert.equal(adminPost.status, 200);
    const postData = await adminPost.json();
    assert.equal(postData.success, true);
    assert.equal(postData.assetlinks[0].target.package_name, 'com.test.pwabuilder.twa');

    // 4. Verify /.well-known/assetlinks.json now serves the updated custom credentials
    const updatedRes = await fetch(`${baseUrl}/.well-known/assetlinks.json`);
    const updatedData = await updatedRes.json();
    assert.equal(updatedData[0].target.package_name, 'com.test.pwabuilder.twa');
    assert.ok(updatedData[0].target.sha256_cert_fingerprints.includes('AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00'));
  } finally {
    server.close();
  }
});
