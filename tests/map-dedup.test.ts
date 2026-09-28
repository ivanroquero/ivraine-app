import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseLocationsPerDevice,
  normalizeIp,
  isSyntheticIp,
  normalizeDeviceId,
  isLoraineUser,
  type DeduplicatableLocation
} from '../frontend/src/geo.js';

interface TestLocation extends DeduplicatableLocation {
  id: string;
  lat: number;
  lng: number;
}

test('Map pin deduplication: same device and same IP address collapses to strictly 1 pin', () => {
  const locs: TestLocation[] = [
    {
      id: '1',
      lat: 9.6496,
      lng: 123.8647,
      deviceId: 'dev_phone_loraine',
      precise: true,
      updatedAtMs: 1000,
      log: { ip: '112.198.170.1', user: 'Visitor', userAgent: 'iPhone' }
    },
    {
      id: '2',
      lat: 9.6498,
      lng: 123.8649,
      deviceId: 'dev_phone_loraine',
      precise: true,
      updatedAtMs: 2000,
      log: { ip: '112.198.170.1', user: 'Visitor', userAgent: 'iPhone' }
    },
    {
      id: '3',
      lat: 9.6500,
      lng: 123.8651,
      deviceId: 'dev_phone_loraine',
      precise: true,
      updatedAtMs: 3000,
      log: { ip: '112.198.170.1', user: 'Visitor', userAgent: 'iPhone' }
    }
  ];

  const deduped = collapseLocationsPerDevice(locs);
  assert.equal(deduped.length, 1, 'Same device and IP must have strictly 1 pin on map');
  assert.equal(deduped[0].id, '3', 'Newest location update is the active pin');
  assert.equal(deduped[0].lat, 9.6500);
});

test('Map pin deduplication: same IP address with missing or rotated deviceId collapses to 1 pin', () => {
  const locs: TestLocation[] = [
    {
      id: 'old_no_dev',
      lat: 9.6490,
      lng: 123.8640,
      deviceId: '',
      precise: true,
      updatedAtMs: 1000,
      log: { ip: '124.106.130.5', user: 'Visitor', userAgent: 'Android' }
    },
    {
      id: 'new_with_dev',
      lat: 9.6510,
      lng: 123.8660,
      deviceId: 'dev_android_99',
      precise: true,
      updatedAtMs: 2500,
      log: { ip: '124.106.130.5', user: 'Visitor', userAgent: 'Android' }
    }
  ];

  const deduped = collapseLocationsPerDevice(locs);
  assert.equal(deduped.length, 1, 'Logs sharing same IP address collapse to 1 pin');
  assert.equal(deduped[0].id, 'new_with_dev');
});

test('Map pin deduplication: same deviceId with changed network IP collapses to 1 pin', () => {
  const locs: TestLocation[] = [
    {
      id: 'home_wifi',
      lat: 9.6491,
      lng: 123.8641,
      deviceId: 'dev_loraine_mobile',
      precise: true,
      updatedAtMs: 1000,
      log: { ip: '112.198.1.1', user: 'Visitor', userAgent: 'iPhone' }
    },
    {
      id: 'cellular',
      lat: 9.6520,
      lng: 123.8670,
      deviceId: 'dev_loraine_mobile',
      precise: true,
      updatedAtMs: 2000,
      log: { ip: '119.92.50.8', user: 'Visitor', userAgent: 'iPhone' }
    },
    {
      id: 'coffee_shop',
      lat: 9.6535,
      lng: 123.8685,
      deviceId: 'dev_loraine_mobile',
      precise: true,
      updatedAtMs: 3000,
      log: { ip: '175.158.12.3', user: 'Visitor', userAgent: 'iPhone' }
    }
  ];

  const deduped = collapseLocationsPerDevice(locs);
  assert.equal(deduped.length, 1, 'Same physical deviceId across network IPs collapses to 1 pin');
  assert.equal(deduped[0].id, 'coffee_shop');
});

test('Map pin deduplication: transitive linkage across device and IP clusters to 1 pin', () => {
  // Log A: Device 1, IP 1
  // Log B: Device 1, IP 2
  // Log C: Device 2 (newly generated), IP 2 (same Wi-Fi session)
  const locs: TestLocation[] = [
    {
      id: 'A',
      lat: 9.6490,
      lng: 123.8640,
      deviceId: 'dev_alpha',
      precise: true,
      updatedAtMs: 1000,
      log: { ip: '120.29.70.1', user: 'Visitor' }
    },
    {
      id: 'B',
      lat: 9.6500,
      lng: 123.8650,
      deviceId: 'dev_alpha',
      precise: true,
      updatedAtMs: 2000,
      log: { ip: '120.29.70.2', user: 'Visitor' }
    },
    {
      id: 'C',
      lat: 9.6510,
      lng: 123.8660,
      deviceId: 'dev_beta',
      precise: true,
      updatedAtMs: 3000,
      log: { ip: '120.29.70.2', user: 'Visitor' }
    }
  ];

  const deduped = collapseLocationsPerDevice(locs);
  assert.equal(deduped.length, 1, 'Transitively linked logs collapse to 1 pin');
  assert.equal(deduped[0].id, 'C');
});

test('Map pin deduplication: Loraine user is always unified into 1 pin', () => {
  const locs: TestLocation[] = [
    {
      id: 'lor_1',
      lat: 9.6496,
      lng: 123.8647,
      deviceId: 'dev_lor_1',
      precise: true,
      updatedAtMs: 1000,
      log: { ip: '112.198.170.1', user: 'Loraine' }
    },
    {
      id: 'lor_2',
      lat: 9.6520,
      lng: 123.8680,
      deviceId: '',
      precise: true,
      updatedAtMs: 4000,
      log: { ip: 'Phone GPS Pin', user: 'Loraine ♡' }
    },
    {
      id: 'lor_3',
      lat: 9.6530,
      lng: 123.8690,
      deviceId: 'dev_lor_2',
      precise: true,
      updatedAtMs: 5000,
      log: { ip: 'Saved GPS Pin', user: 'Loraine' }
    }
  ];

  const deduped = collapseLocationsPerDevice(locs);
  assert.equal(deduped.length, 1, 'Loraine phone logs always collapse to 1 pin');
  assert.equal(deduped[0].id, 'lor_3');
});

test('Map pin deduplication: distinct devices on distinct IPs produce distinct pins', () => {
  const locs: TestLocation[] = [
    {
      id: 'visitor_manila',
      lat: 14.5995,
      lng: 120.9842,
      deviceId: 'dev_manila',
      precise: true,
      updatedAtMs: 1000,
      log: { ip: '112.198.1.1', user: 'Visitor 1' }
    },
    {
      id: 'visitor_cebu',
      lat: 10.3157,
      lng: 123.8854,
      deviceId: 'dev_cebu',
      precise: true,
      updatedAtMs: 2000,
      log: { ip: '124.106.1.1', user: 'Visitor 2' }
    }
  ];

  const deduped = collapseLocationsPerDevice(locs);
  assert.equal(deduped.length, 2, 'Distinct devices on distinct IPs keep 1 pin each');
});

test('Map pin deduplication: precise GPS fix beats approximate location', () => {
  const locs: TestLocation[] = [
    {
      id: 'precise_fix',
      lat: 9.6496,
      lng: 123.8647,
      deviceId: 'dev_same',
      precise: true,
      updatedAtMs: 1000,
      accuracyMeters: 10,
      log: { ip: '112.198.170.1', user: 'Visitor' }
    },
    {
      id: 'approx_network',
      lat: 14.5995,
      lng: 120.9842,
      deviceId: 'dev_same',
      precise: false,
      updatedAtMs: 5000, // Newer, but only approximate network
      accuracyMeters: 5000,
      log: { ip: '112.198.170.1', user: 'Visitor' }
    }
  ];

  const deduped = collapseLocationsPerDevice(locs);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'precise_fix', 'Precise GPS fix wins over newer approximate reading');
});
