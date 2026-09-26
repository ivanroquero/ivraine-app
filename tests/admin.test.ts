import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app';

test('Admin & IP Tracking: tracks visits, extracts IP, records proposal responses and dodges', async () => {
  const app = createApp({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key',
    origins: ['http://localhost:5173'],
    trustProxy: 1
  });

  // Clear existing logs
  await request(app).post('/api/admin/clear-logs').expect(200);

  // 1. Get current IP
  const ipRes = await request(app)
    .get('/api/ip')
    .set('X-Forwarded-For', '203.0.113.195')
    .expect(200);
  assert.equal(ipRes.body.ip, '203.0.113.195');

  // 2. Track Scrapbook visit from desktop IP
  const track1 = await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '203.0.113.195')
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    .send({
      section: 'Scrapbook',
      action: 'Opened Scrapbook',
      user: 'Loraine'
    })
    .expect(201);

  assert.equal(track1.body.success, true);
  assert.equal(track1.body.ip, '203.0.113.195');

  // 3. Track proposal opened and button dodges
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '203.0.113.195')
    .send({
      section: 'Scrapbook',
      action: "Opened 'Would you date with me?' proposal",
      dodgeCount: 5
    })
    .expect(201);

  // 4. Track Private Space visit from mobile IP with geolocation
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '198.51.100.42')
    .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    .send({
      section: 'Private Space',
      action: 'Shared Location',
      user: 'Ivan',
      latitude: 14.5995,
      longitude: 120.9842,
      fullAddress: 'Rizal Park, Ermita, Manila, Metro Manila, 1000, Philippines',
      city: 'Manila',
      country: 'Philippines'
    })
    .expect(201);

  // 5. Track proposal accepted (Said YES!)
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '203.0.113.195')
    .send({
      section: 'Scrapbook',
      action: "Said YES to 'Would you date with me?' proposal! 💖",
      dodgeCount: 2
    })
    .expect(201);

  // 6. Fetch admin logs and check stats
  const adminRes = await request(app)
    .get('/api/admin/logs')
    .expect(200);

  const { logs, stats } = adminRes.body;
  assert.equal(logs.length, 4);
  assert.equal(stats.uniqueIps, 2);
  assert.equal(stats.scrapbookVisits, 3);
  assert.equal(stats.spaceVisits, 1);
  assert.equal(stats.proposalAccepted, true);
  assert(stats.proposalAcceptedAt);
  assert.equal(stats.totalDodges, 7);

  // Verify IPs and Location in logs
  const ips = logs.map((l: { ip: string }) => l.ip);
  assert(ips.includes('203.0.113.195'));
  assert(ips.includes('198.51.100.42'));

  const geoLog = logs.find((l: { city?: string }) => l.city === 'Manila');
  assert(geoLog);
  assert.equal(geoLog.latitude, 14.5995);
  assert.equal(geoLog.longitude, 120.9842);
  assert.equal(geoLog.country, 'Philippines');
  assert.match(geoLog.fullAddress, /Manila/);

  // 7. Clear logs
  await request(app).post('/api/admin/clear-logs').expect(200);
  const afterClear = await request(app).get('/api/admin/logs').expect(200);
  assert.equal(afterClear.body.logs.length, 0);
  assert.equal(afterClear.body.stats.totalVisits, 0);
});
