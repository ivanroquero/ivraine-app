import { test } from 'node:test';
import assert from 'node:assert/strict';
import handleIp from '../api/ip';
import handleTrack from '../api/track';
import handleDateLocation from '../api/date-location';
import handleAdminLogs from '../api/admin/logs';
import handleAdminClearLogs from '../api/admin/clear-logs';
import type {
  IpResponse,
  TrackRequestBody,
  TrackResponse,
  DateLocationRequestBody,
  DateLocationResponse,
  AdminLogsResponse,
  AdminClearLogsResponse
} from '../api/types';

// Mock request and response generator for testing serverless handlers
function createMockReqRes(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let responseData: any = null;
  let ended = false;

  const req: any = {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || {},
    socket: { remoteAddress: '127.0.0.1' }
  };

  const res: any = {
    setHeader(key: string, val: string) {
      headers[key.toLowerCase()] = val;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      ended = true;
      return this;
    },
    send(data: any) {
      responseData = data;
      ended = true;
      return this;
    },
    end() {
      ended = true;
      return this;
    }
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
    getHeader: (k: string) => headers[k.toLowerCase()]
  };
}

test('Standalone API: /api/ip handler returns valid client IP and coordinates', async () => {
  const { req, res, getStatus, getData } = createMockReqRes({
    headers: {
      'x-forwarded-for': '203.177.100.25',
      'x-vercel-ip-latitude': '9.6496',
      'x-vercel-ip-longitude': '123.8647',
      'x-vercel-ip-city': 'Tagbilaran%20City',
      'x-vercel-ip-country': 'PH'
    }
  });

  await handleIp(req, res);

  assert.equal(getStatus(), 200);
  const data = getData() as IpResponse;
  assert.equal(data.status, 'ok');
  assert.equal(data.ip, '203.177.100.25');
  assert.equal(data.latitude, 9.6496);
  assert.equal(data.longitude, 123.8647);
  assert.equal(data.city, 'Tagbilaran City');
  assert.equal(data.country, 'PH');
});

test('Standalone API: /api/track records visitor actions and dodge counts', async () => {
  // First clear logs
  const clear = createMockReqRes({ method: 'POST' });
  await handleAdminClearLogs(clear.req, clear.res);
  assert.equal(clear.getStatus(), 200);

  const trackPayload: TrackRequestBody = {
    section: 'Scrapbook',
    action: 'Opened Scrapbook',
    user: 'Loraine',
    deviceId: 'test_dev_01',
    dodgeCount: 2
  };

  const { req, res, getStatus, getData } = createMockReqRes({
    method: 'POST',
    headers: {
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Mozilla/5.0 Test'
    },
    body: trackPayload
  });

  await handleTrack(req, res);

  assert.equal(getStatus(), 200);
  const data = getData() as TrackResponse;
  assert.equal(data.status, 'ok');
  if ('recorded' in data) {
    assert.equal(data.recorded, true);
    assert.equal(data.log.user, 'Loraine');
    assert.equal(data.log.dodgeCount, 2);
    assert.equal(data.log.deviceId, 'test_dev_01');
  }
});

test('Standalone API: /api/date-location saves and removes location pins', async () => {
  // 1. Record location pin
  const locationPayload: DateLocationRequestBody = {
    deviceId: 'test_dev_01',
    user: 'Loraine',
    source: 'Scrapbook',
    latitude: 9.6500,
    longitude: 123.8650,
    fullAddress: 'Bool, Tagbilaran City, Bohol',
    city: 'Tagbilaran City',
    country: 'Philippines'
  };

  const { req, res, getStatus, getData } = createMockReqRes({
    method: 'POST',
    headers: {
      'x-forwarded-for': '192.168.1.100'
    },
    body: locationPayload
  });

  await handleDateLocation(req, res);

  assert.equal(getStatus(), 201);
  const data = getData() as DateLocationResponse;
  assert.equal(data.status, 'ok');
  if ('latitude' in data) {
    assert.equal(data.latitude, 9.6500);
    assert.equal(data.longitude, 123.8650);
    assert.equal(data.fullAddress, 'Bool, Tagbilaran City, Bohol');
  }

  // 2. Query /api/admin/logs to verify the pin exists
  const logsQuery = createMockReqRes({ method: 'GET' });
  await handleAdminLogs(logsQuery.req, logsQuery.res);
  const logsData = logsQuery.getData() as AdminLogsResponse;
  assert.equal(logsQuery.getStatus(), 200);
  assert(logsData.logs.length > 0);
  const foundPin = logsData.logs.find(l => l.deviceId === 'test_dev_01');
  assert(foundPin);
  assert.equal(foundPin.latitude, 9.6500);

  // 3. Remove pin with removePin: true
  const removeReq = createMockReqRes({
    method: 'POST',
    body: {
      deviceId: 'test_dev_01',
      user: 'Loraine',
      removePin: true
    }
  });

  await handleDateLocation(removeReq.req, removeReq.res);
  assert.equal(removeReq.getStatus(), 200);
  const removeData = removeReq.getData() as DateLocationResponse;
  assert.equal(removeData.status, 'ok');
  if ('removed' in removeData) {
    assert.equal(removeData.removed, true);
  }

  // 4. Verify pin was removed from admin logs
  const afterLogsQuery = createMockReqRes({ method: 'GET' });
  await handleAdminLogs(afterLogsQuery.req, afterLogsQuery.res);
  const afterLogsData = afterLogsQuery.getData() as AdminLogsResponse;
  const pinAfter = afterLogsData.logs.find(l => l.deviceId === 'test_dev_01' && l.latitude != null);
  assert.equal(pinAfter, undefined);
});
