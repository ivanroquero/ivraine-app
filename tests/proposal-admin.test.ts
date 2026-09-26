import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app';

test('Admin at /api/admin: records and reports IP addresses, visitor section, actions, and proposal statistics', async () => {
  const app = createApp({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key',
    origins: ['http://localhost:5173'],
    trustProxy: 1
  });

  // Clear existing
  await request(app).post('/api/admin/clear-logs').expect(200);

  // Visitor 1: Desktop user visits Scrapbook from IP 192.168.1.50
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '192.168.1.50')
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0')
    .send({
      section: 'Scrapbook',
      action: 'Opened Scrapbook',
      user: 'Loraine'
    })
    .expect(201);

  // Visitor 1: Clicks "Open this" pop up
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '192.168.1.50')
    .send({
      section: 'Scrapbook',
      action: "Opened 'Would you date with me?' proposal"
    })
    .expect(201);

  // Visitor 1: Tries to click NO, but button dodges!
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '192.168.1.50')
    .send({
      section: 'Scrapbook',
      action: 'Tried to click NO (button avoided cursor)',
      dodgeCount: 3
    })
    .expect(201);

  // Visitor 1: Clicks YES! (Proposal accepted)
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '192.168.1.50')
    .send({
      section: 'Scrapbook',
      action: "Said YES to 'Would you date with me?' proposal! 💖",
      dodgeCount: 4
    })
    .expect(201);

  // Visitor 2: Mobile user visits Private Space from IP 112.198.75.12
  await request(app)
    .post('/api/track')
    .set('X-Forwarded-For', '112.198.75.12')
    .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
    .send({
      section: 'Private Space',
      action: 'Visited Private Space',
      user: 'Ivan'
    })
    .expect(201);

  // Admin opens /admin to view IP addresses
  const adminRes = await request(app)
    .get('/api/admin/logs')
    .set('X-Forwarded-For', '192.168.1.1')
    .expect(200);

  const { logs, stats, currentIp } = adminRes.body;

  assert.equal(currentIp, '192.168.1.1');
  assert.equal(stats.totalVisits, 5);
  assert.equal(stats.uniqueIps, 2);
  assert.equal(stats.scrapbookVisits, 4);
  assert.equal(stats.spaceVisits, 1);
  assert.equal(stats.proposalAccepted, true);
  assert(stats.proposalAcceptedAt);
  assert.equal(stats.totalDodges, 7);

  // Check logs contain correct IP addresses and actions
  const scrapbookLogs = logs.filter((l: { section: string }) => l.section === 'Scrapbook');
  assert.equal(scrapbookLogs.length, 4);
  assert.equal(scrapbookLogs[0].ip, '192.168.1.50');

  const proposalAcceptedLog = logs.find((l: { action: string }) => l.action.includes('Said YES'));
  assert(proposalAcceptedLog);
  assert.equal(proposalAcceptedLog.ip, '192.168.1.50');

  const privateSpaceLog = logs.find((l: { section: string }) => l.section === 'Private Space');
  assert(privateSpaceLog);
  assert.equal(privateSpaceLog.ip, '112.198.75.12');
  assert.equal(privateSpaceLog.user, 'Ivan');
});

test('Location tracking: detects 1 pin per device and automatically removes old location log when device updates or turns off location', async () => {
  const app = createApp({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key',
    origins: ['http://localhost:5173'],
    trustProxy: 1
  });

  // Clear existing logs
  await request(app).post('/api/admin/clear-logs').expect(200);

  const deviceId1 = 'dev_loraine_phone_test';

  // 1. Device 1 sends initial GPS coordinates
  const res1 = await request(app)
    .post('/api/date-location')
    .set('X-Forwarded-For', '112.198.75.10')
    .send({
      latitude: 9.6496,
      longitude: 123.8647,
      user: 'Loraine',
      deviceId: deviceId1,
      source: 'Scrapbook'
    })
    .expect(201);

  assert.equal(res1.body.success, true);
  assert.equal(res1.body.deviceId, deviceId1);

  // Check admin logs: should have exactly 1 location log
  let adminRes = await request(app).get('/api/admin/logs').expect(200);
  let locationLogs = adminRes.body.logs.filter((l: any) => l.latitude != null && l.longitude != null);
  assert.equal(locationLogs.length, 1);
  assert.equal(locationLogs[0].deviceId, deviceId1);
  assert.equal(locationLogs[0].latitude, 9.6496);

  // 2. Device 1 moves / updates its location to new coordinates (or user turns off and turns on again)
  const res2 = await request(app)
    .post('/api/date-location')
    .set('X-Forwarded-For', '112.198.75.20') // IP may have rotated
    .send({
      latitude: 9.6550,
      longitude: 123.8700,
      user: 'Loraine',
      deviceId: deviceId1,
      source: 'Scrapbook'
    })
    .expect(201);

  assert.equal(res2.body.success, true);

  // Verify: old location log was AUTOMATICALLY REMOVED! Still strictly 1 location log for Device 1!
  adminRes = await request(app).get('/api/admin/logs').expect(200);
  locationLogs = adminRes.body.logs.filter((l: any) => l.latitude != null && l.longitude != null);
  assert.equal(locationLogs.length, 1, 'There must be strictly 1 location log/pin for Device 1!');
  assert.equal(locationLogs[0].latitude, 9.6550);
  assert.equal(locationLogs[0].longitude, 123.8700);

  // 3. A second device (Device 2) shares location
  const deviceId2 = 'dev_ivan_phone_test';
  await request(app)
    .post('/api/date-location')
    .set('X-Forwarded-For', '192.168.1.88')
    .send({
      latitude: 9.6600,
      longitude: 123.8800,
      user: 'Visitor',
      deviceId: deviceId2,
      source: 'Private Space'
    })
    .expect(201);

  adminRes = await request(app).get('/api/admin/logs').expect(200);
  locationLogs = adminRes.body.logs.filter((l: any) => l.latitude != null && l.longitude != null);
  assert.equal(locationLogs.length, 2, 'Two distinct devices have 1 pin each');

  // 4. Device 1 turns off location (sends removePin: true or turn_off action)
  const removeRes = await request(app)
    .post('/api/date-location')
    .send({
      action: 'turn_off',
      removePin: true,
      deviceId: deviceId1,
      user: 'Loraine'
    })
    .expect(200);

  assert.equal(removeRes.body.removed, true);

  // Verify: Device 1 location log/pin was automatically removed!
  adminRes = await request(app).get('/api/admin/logs').expect(200);
  locationLogs = adminRes.body.logs.filter((l: any) => l.latitude != null && l.longitude != null);
  assert.equal(locationLogs.length, 1, 'Only Device 2 pin remains after Device 1 turned off location');
  assert.equal(locationLogs[0].deviceId, deviceId2);
});

test("Proposal: 'Would you go out with me?' acceptance is recorded in admin statistics", async () => {
  const app = createApp({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key',
    origins: ['http://localhost:5173'],
    trustProxy: 1
  });

  await request(app).post('/api/admin/clear-logs').expect(200);

  // Loraine opens proposal
  await request(app)
    .post('/api/track')
    .send({
      section: 'Scrapbook',
      action: "Opened 'Would you go out with me?' proposal",
      user: 'Loraine'
    })
    .expect(201);

  // Loraine says YES!
  await request(app)
    .post('/api/track')
    .send({
      section: 'Scrapbook',
      action: "Said YES to 'Would you go out with me?' proposal! 💖",
      user: 'Loraine',
      dodgeCount: 5
    })
    .expect(201);

  const adminRes = await request(app).get('/api/admin/logs').expect(200);
  assert.equal(adminRes.body.stats.proposalAccepted, true);
  assert.equal(adminRes.body.stats.totalDodges, 5);
});

