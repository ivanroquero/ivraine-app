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
