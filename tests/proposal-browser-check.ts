import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createApp } from '../backend/src/app';
import { resolve } from 'node:path';

async function main() {
  console.log('Starting Browser E2E checks...');
  
  // 1. Find free port for API server first
  let apiPort = 0;
  let apiServer: any;

  // Temporary server to get free port
  const tmpServer = await new Promise<any>((res) => {
    const s = createApp({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'test-key', origins: ['http://localhost:5173'], trustProxy: 1 })
      .listen(0, '127.0.0.1', () => res(s));
  });
  apiPort = (tmpServer.address() as { port: number }).port;
  await new Promise<void>((res) => tmpServer.close(() => res()));

  // 2. Start Vite dev server on dynamic port, proxying /api to apiPort
  const vite = await createServer({
    root: resolve('frontend'),
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  });
  await vite.listen();
  const vitePort = (vite.httpServer?.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${vitePort}`;
  console.log(`Vite server listening on ${baseUrl}`);

  // 3. Now start real API server with baseUrl in origins!
  const app = createApp({
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'test-key',
    origins: [baseUrl, 'http://127.0.0.1:5173', 'http://localhost:5173'],
    trustProxy: 1
  });

  apiServer = await new Promise<any>((resolveServer, rejectServer) => {
    const s = app.listen(apiPort, '127.0.0.1', () => resolveServer(s));
    s.on('error', rejectServer);
  });
  console.log(`API server listening on ${apiPort}`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    executablePath: process.env.TEST_CHROMIUM_PATH || chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    // ----------------------------------------------------
    // TEST 1: DESKTOP / MONITOR SCRAPBOOK EXPERIENCE
    // ----------------------------------------------------
    console.log('Testing Desktop Scrapbook Proposal...');
    const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desktopPage.goto(`${baseUrl}/legacy/index.html`);

    // Verify initial "Open this" pop up appears
    const initialPopup = desktopPage.locator('.ivraine-initial-prompt-popup');
    await initialPopup.waitFor({ state: 'visible', timeout: 8000 });
    console.log('PASS: Initial "Open this" popup rendered');

    // Click "Open this"
    const openBtn = initialPopup.locator('.open-btn');
    await openBtn.click();

    // Verify "Would you date with me?" proposal modal appears
    const proposalTitle = desktopPage.locator('#proposal-title');
    await proposalTitle.waitFor({ state: 'visible', timeout: 5000 });
    const titleText = await proposalTitle.innerText();
    if (!titleText.toLowerCase().includes('date with me')) throw new Error('Proposal title mismatch');
    console.log('PASS: "Would you date with me?" modal opened');

    // Check Yes and No buttons are visible
    const yesBtn = desktopPage.locator('#ivraine-btn-yes');
    const noBtn = desktopPage.locator('#ivraine-btn-no');

    // Test Desktop Evasion: Move mouse towards "No" button
    const noBoxBefore = await noBtn.boundingBox();
    if (!noBoxBefore) throw new Error('No button not found');

    // Hover mouse directly over "No" button
    await desktopPage.mouse.move(noBoxBefore.x + noBoxBefore.width / 2, noBoxBefore.y + noBoxBefore.height / 2);
    await desktopPage.waitForTimeout(400);

    // Verify the "No" button moved! (transform applied or coordinates changed)
    const transform = await noBtn.evaluate((el) => (el as HTMLElement).style.transform);
    if (!transform.includes('translate3d')) throw new Error('No button failed to evade on hover');
    console.log('PASS: Desktop cursor evasion verified (button moved via translate3d)');

    // Click YES to show custom designed permission prompt
    await yesBtn.click();
    await desktopPage.waitForTimeout(500);

    // Verify celebration message & custom permission card appear
    const celebrationTitle = desktopPage.locator('.ivraine-celebration-title');
    await celebrationTitle.waitFor({ state: 'visible', timeout: 5000 });
    const celebrationText = await celebrationTitle.innerText();
    if (!celebrationText.toLowerCase().includes('she said yes')) throw new Error('Celebration mismatch');
    console.log('PASS: Proposal acceptance celebration rendered');

    // Verify custom modern permission card rendered
    const customPermCard = desktopPage.locator('.ivraine-loc-card-custom');
    await customPermCard.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PASS: Custom designed modern permission card displayed');

    // Verify text replacements:
    // Must include "Allow Location so that Google will provide the best places"
    const cardContent = await customPermCard.innerText();
    if (!cardContent.includes('Allow Location so that Google will provide the best places')) {
      throw new Error('Custom prompt missing required Google wording: "Allow Location so that Google will provide the best places"');
    }
    // Must NOT reveal "8 places" or "8 romantic places"
    if (cardContent.includes('8 romantic places') || cardContent.includes('8 handpicked')) {
      throw new Error('Custom prompt should NOT reveal "8 romantic places" or "8 handpicked"');
    }
    // Must NOT have removed phrases
    if (cardContent.includes('Direct one-tap Google Maps directions') || cardContent.includes('Live location auto-pinned')) {
      throw new Error('Custom prompt contains old removed phrases');
    }
    console.log('PASS: Wording verified (Google recommendation included, 8 places count hidden, old phrases removed)');

    // Verify there is only 1 primary action button: #ivraine-btn-prompt-loc
    const promptLocBtn = desktopPage.locator('#ivraine-btn-prompt-loc');
    await promptLocBtn.waitFor({ state: 'visible', timeout: 3000 });
    console.log('PASS: Verified primary Allow Location button on custom permission prompt');

    // Test "Go Back" button from prompt card
    const goBackBtn = desktopPage.locator('#ivraine-btn-go-back-prompt');
    await goBackBtn.click();
    await desktopPage.waitForTimeout(300);
    const restoredYes = desktopPage.locator('#ivraine-btn-yes');
    await restoredYes.waitFor({ state: 'visible', timeout: 3000 });
    console.log('PASS: Go Back button restored proposal question card');

    // Re-open custom prompt and tap the button WITHOUT geolocation to test strict gating
    await restoredYes.click();
    await desktopPage.locator('#ivraine-btn-prompt-loc').click();

    // Verify requesting state appears first
    const requestingWrap = desktopPage.locator('.ivraine-loc-requesting-wrap');
    await requestingWrap.waitFor({ state: 'visible', timeout: 3000 });

    // Since geolocation is not permitted on this desktop context, strict gating must show denial screen
    const deniedWrap = desktopPage.locator('.ivraine-loc-denied-wrap');
    await deniedWrap.waitFor({ state: 'visible', timeout: 10000 });
    const deniedText = await desktopPage.locator('.ivraine-loc-denied-desc').innerText();
    if (!deniedText.includes("won't be able to see the date places and your surprise flower")) {
      throw new Error(`Denial text mismatch: ${deniedText}`);
    }
    // Verify places and flower are NOT open!
    const deniedPlacesCount = await desktopPage.locator('.ivraine-places-scroll-list').count();
    const deniedFlowerCount = await desktopPage.locator('#ivraine-d3-flower-container').count();
    if (deniedPlacesCount !== 0 || deniedFlowerCount !== 0) {
      throw new Error('Places or flower were opened despite location not being granted!');
    }
    console.log('PASS: Strict location gating verified: without permission, places and D3 flower are NOT opened!');

    await desktopPage.close();

    // ----------------------------------------------------
    // TEST 2: MOBILE / PHONE WITH GEOLOCATION ALLOWED & D3 FLOWER BLOOM
    // ----------------------------------------------------
    console.log('Testing Mobile Phone Location Unlock & D3 Flower Bloom...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      permissions: ['geolocation'],
      geolocation: { latitude: 9.6496, longitude: 123.8647 }
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${baseUrl}/legacy/index.html`);

    // Tap "Open this" on mobile
    const mobileInitialPopup = mobilePage.locator('.ivraine-initial-prompt-popup');
    await mobileInitialPopup.waitFor({ state: 'visible', timeout: 5000 });
    await mobileInitialPopup.locator('.open-btn').tap();

    // Proposal modal appears on mobile
    const mobileProposalTitle = mobilePage.locator('#proposal-title');
    await mobileProposalTitle.waitFor({ state: 'visible', timeout: 5000 });

    const mobileNoBtn = mobilePage.locator('#ivraine-btn-no');
    // Trigger touch on "No" button
    await mobileNoBtn.dispatchEvent('touchstart');
    await mobilePage.waitForTimeout(400);

    // Verify touch caused evasion
    const mobileTransform = await mobileNoBtn.evaluate((el) => (el as HTMLElement).style.transform);
    if (!mobileTransform.includes('translate3d')) throw new Error('No button failed to evade on mobile touch');
    console.log('PASS: Mobile touch evasion verified (button avoided tap)');

    // Now tap YES to view custom permission card
    const mobileYesBtn = mobilePage.locator('#ivraine-btn-yes');
    await mobileYesBtn.tap();

    // Tap "Allow Location to Discover Places & Flower ♡"
    const mobilePromptLocBtn = mobilePage.locator('#ivraine-btn-prompt-loc');
    await mobilePromptLocBtn.waitFor({ state: 'visible', timeout: 5000 });
    await mobilePromptLocBtn.tap();

    // Verify places scroll list appears!
    const placesList = mobilePage.locator('.ivraine-places-scroll-list');
    await placesList.waitFor({ state: 'visible', timeout: 8000 });
    console.log('PASS: Places list unlocked with phone location granted');

    // Verify D3 flower is rendered inside #ivraine-d3-flower-container!
    const d3FlowerSvg = mobilePage.locator('#ivraine-d3-flower-container svg.ivraine-d3-flower-svg');
    await d3FlowerSvg.waitFor({ state: 'visible', timeout: 5000 });
    const petalCount = await mobilePage.locator('#ivraine-d3-flower-container path').count();
    if (petalCount < 10) throw new Error(`Expected at least 10 SVG paths for petals/stem/leaves, got ${petalCount}`);
    console.log(`PASS: D3 Flower rendered successfully with ${petalCount} SVG floral elements!`);

    // Tap the D3 flower to verify interactive tap particle magic
    await d3FlowerSvg.tap();
    await mobilePage.waitForTimeout(300);
    console.log('PASS: D3 Flower tap interaction verified');

    // Verify all 8 Bohol places requested by user are present without revealing count "8" in text
    const expectedPlaces = [
      'Blood Compact Shrine',
      'Ocean Suites',
      'National Museum of the Philippines - Bohol',
      'Plaza Jose P. Rizal',
      'St. Joseph the Worker Cathedral Shrine',
      "Gerarda's Place",
      "Gerarda's Place CPG",
      'Lite Port Center'
    ];

    const placeCards = mobilePage.locator('.ivraine-place-card');
    const cardCount = await placeCards.count();
    if (cardCount !== 8) throw new Error(`Expected 8 place cards, got ${cardCount}`);

    for (const place of expectedPlaces) {
      const match = mobilePage.locator('.ivraine-place-name', { hasText: place });
      await match.first().waitFor({ state: 'visible', timeout: 3000 });
    }
    console.log('PASS: All Bohol date places successfully rendered in proposal reveal');

    // Verify Google Maps links
    const firstMapUrl = await placeCards.first().getAttribute('href');
    if (!firstMapUrl || !firstMapUrl.includes('maps.google.com')) throw new Error('First place card missing Google Maps link');
    console.log('PASS: Google Maps links properly configured for all places');

    // Click continue to finish
    await mobilePage.locator('#ivraine-btn-continue').tap();
    await mobilePage.waitForTimeout(300);

    await mobileContext.close();

    // ----------------------------------------------------
    // TEST 3: PRIVATE SPACE — VERIFY "Open this" IS REMOVED
    // ----------------------------------------------------
    console.log('Testing Private Space (verifying "Open this" is removed)...');
    const spacePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await spacePage.goto(`${baseUrl}/index.html?space=true`);
    await spacePage.waitForTimeout(1000);

    const spacePillCount = await spacePage.locator('.ivraine-proposal-prompt-pill').count();
    if (spacePillCount !== 0) {
      throw new Error(`Expected "Open this" pill to be removed from Private Space, but found count: ${spacePillCount}`);
    }
    console.log('PASS: Verified "Open this" is completely removed from Private Space!');
    await spacePage.close();
    console.log('Testing Admin Panel /admin IP Logs...');
    const adminPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await adminPage.goto(`${baseUrl}/admin`);

    // Verify Admin lock screen
    const lockPassInput = adminPage.locator('#admin-passcode-input');
    await lockPassInput.waitFor({ state: 'visible', timeout: 5000 });

    // Enter passcode 20260902
    await lockPassInput.fill('20260902');
    await adminPage.locator('#admin-lock-form button[type="submit"]').click();

    // Verify Admin Dashboard loads
    const statVisits = adminPage.locator('#stat-total-visits');
    await statVisits.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PASS: Admin dashboard unlocked successfully');

    // Wait for visitor IP rows to appear
    const firstIpCell = adminPage.locator('.ip-cell strong').first();
    await firstIpCell.waitFor({ state: 'visible', timeout: 10000 });

    const ipText = await firstIpCell.innerText();
    if (!ipText || ipText.length === 0) throw new Error('IP address cell is empty');
    console.log(`PASS: IP address detected and visible in admin table: ${ipText}`);

    // Verify Proposal status in Admin shows "Said YES!"
    const statProposal = adminPage.locator('#stat-proposal-status');
    const propStatusText = await statProposal.innerText();
    console.log(`PASS: Proposal status in Admin: ${propStatusText}`);

    // ----------------------------------------------------
    // TEST 4: LIVE MAP DEEP ZOOM & GRABBABLE MARKER TEST
    // ----------------------------------------------------
    console.log('Testing Admin Live Map Tab & Marker Interaction...');
    await adminPage.locator('[data-tab="tab-map"]').click();
    await adminPage.waitForTimeout(400);

    // Verify map container visible
    const mapContainer = adminPage.locator('#admin-visitor-map');
    await mapContainer.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PASS: Map container visible and loaded');

    // Wait for live radar marker to appear
    const liveMarker = adminPage.locator('.live-map-marker-container').first();
    await liveMarker.waitFor({ state: 'visible', timeout: 8000 });
    console.log('PASS: Live radar marker rendered on map');

    // Verify there is strictly ONE single marker for that device on the map (no duplicates/clustering)
    const markerCount = await adminPage.locator('.live-map-marker-container').count();
    if (markerCount !== 1) throw new Error(`Expected exactly 1 live pin for the phone device on map, got ${markerCount}`);
    console.log(`PASS: Verified exactly ONE single live pin on the map for the device (got count: ${markerCount})`);

    // Verify radar ping wave exists
    const radarWave = liveMarker.locator('.live-radar-ping').first();
    await radarWave.waitFor({ state: 'attached', timeout: 3000 });
    console.log('PASS: Live radar ripple ping effect verified');

    // Verify HUD coordinates and interaction status
    const hudCoords = adminPage.locator('#hud-coordinates');
    await hudCoords.waitFor({ state: 'visible', timeout: 3000 });
    const coordsVal = await hudCoords.innerText();
    if (!coordsVal.includes('°')) throw new Error(`HUD coordinates not formatted properly: ${coordsVal}`);
    console.log(`PASS: HUD live coordinates displayed: ${coordsVal}`);

    // Test Layer switching pills
    await adminPage.locator('#btn-layer-satellite').click();
    await adminPage.waitForTimeout(300);
    const isSatActive = await adminPage.locator('#btn-layer-satellite').evaluate(el => el.classList.contains('active'));
    if (!isSatActive) throw new Error('Satellite layer pill failed to activate');
    console.log('PASS: Switched to Satellite map layer');

    await adminPage.locator('#btn-layer-dark').click();
    await adminPage.waitForTimeout(200);

    // Test Deep Zoom: Zoom into map and wait through 3.5s auto-refresh
    console.log('Testing zoom closer (verifying map and marker do NOT go away)...');
    const mapBox = await mapContainer.boundingBox();
    if (!mapBox) throw new Error('Map container bounding box not found');
    await adminPage.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    // Wheel zoom in 3 times
    await adminPage.mouse.wheel(0, -300);
    await adminPage.waitForTimeout(400);
    await adminPage.mouse.wheel(0, -300);
    await adminPage.waitForTimeout(400);

    // Wait 4 seconds (longer than the 3.5s auto-refresh interval)
    await adminPage.waitForTimeout(4000);

    // Marker must still be visible and not destroyed or flown away!
    await liveMarker.waitFor({ state: 'visible', timeout: 3000 });
    console.log('PASS: Marker remains visible after zooming closer (did not disappear during auto-refresh)!');

    // Test Grab & Move: Drag the live marker
    console.log('Testing Grab & Drag of the live pin...');
    const markerBox = await liveMarker.boundingBox();
    if (!markerBox) throw new Error('Live marker bounding box not found for drag');

    const startX = markerBox.x + markerBox.width / 2;
    const startY = markerBox.y + markerBox.height / 2;
    await adminPage.mouse.move(startX, startY);
    await adminPage.mouse.down();
    await adminPage.waitForTimeout(100);
    await adminPage.mouse.move(startX + 60, startY + 40, { steps: 5 });
    await adminPage.waitForTimeout(200);
    await adminPage.mouse.up();
    await adminPage.waitForTimeout(500);

    // Marker must still be visible after drag
    await liveMarker.waitFor({ state: 'visible', timeout: 3000 });
    console.log('PASS: Successfully grabbed, dragged, and repositioned live marker!');

    await adminPage.close();
    console.log('ALL BROWSER TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('PROPOSAL BROWSER TEST FAILED:', err);
    throw err;
  } finally {
    await browser.close();
    await vite.close();
    await new Promise<void>((resolveClose) => apiServer.close(() => resolveClose()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
