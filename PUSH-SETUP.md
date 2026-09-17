# Push notifications

The current app includes saved hearts, background Web Push, and a **Send test notification** button for the signed-in device. Local tests simulate the push provider; confirm real delivery on each phone after deployment.

## Deploy the current source

Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. Deploy `frontend/dist` as the website and the backend using the existing Dockerfile. Configure the variables and database below. No update ZIP or patch needs to be applied to this checkout.

## Fix the post-login Failed to fetch error

Supabase sign-in happens directly against Supabase. After sign-in, `/api/book` and `/api/entries` are requested from Railway. Success at the first step does not verify the second service.

**Vercel → Environment Variables** — replace `VITE_API_URL` with the actual public HTTPS domain of the Railway API, then redeploy:

```dotenv
VITE_API_URL=https://YOUR_ACTUAL_RAILWAY_DOMAIN
```

**Railway → Variables** — replace `FRONTEND_ORIGINS` with the exact Vercel/custom origin you open in your browser, then redeploy:

```dotenv
FRONTEND_ORIGINS=https://YOUR_ACTUAL_VERCEL_DOMAIN
TRUST_PROXY_HOPS=1
NODE_ENV=production
```

Multiple trusted origins are comma-separated. Never use `*` or allow all Vercel projects. The API now normalizes trailing slashes and preflight origins. The client normalizes an accidental `/api/` suffix, rejects localhost from a published app, rejects HTTPS→HTTP mixed content, detects an HTML response from a wrong destination, and gives specific network/configuration errors.

Open `https://YOUR_ACTUAL_RAILWAY_DOMAIN/health`; it must return JSON with `status: ok`. If that address is down, fix the Railway deployment/startup logs before trying login again. This patch cannot make an undeployed or unreachable Railway service reachable. The exact cause in your deployment is not confirmed because its configuration was unavailable.

Keep the existing Supabase URL and publishable-key settings in both services. Do not replace them with the database connection string or private VAPID key.

## Database setup for hearts and push

Run this file once in the **same Supabase project's SQL Editor** after your existing `database/setup.sql`:

`supabase/migrations/20260916205359_push_notifications.sql`

It creates `ivraine_private.push_subscriptions`, `heart_events`, and `push_deliveries`, with RLS and no client grants. The private schema is not exposed through the Supabase Data API. The API still verifies the bearer token and book membership before using the server-only PostgreSQL connection. This is a deliberately privileged backend connection; never put it in a browser variable.

The PostgreSQL database should have exactly two `ivraine_members` rows for the scrapbook. The heart endpoint rejects other group sizes rather than guessing whom to notify.

## Railway secrets for push

Generate one VAPID pair on your own machine, once, from the repository root:

```bash
npm run push:keys -w backend
```

Save its public and private values securely. Do not regenerate them on each deploy; rotation requires devices to re-enable notifications.

Add these **Railway server variables**:

```dotenv
PUSH_DATABASE_URL=YOUR_SUPABASE_POSTGRES_SESSION_POOLER_CONNECTION_STRING
VAPID_PUBLIC_KEY=YOUR_GENERATED_PUBLIC_KEY
VAPID_PRIVATE_KEY=YOUR_GENERATED_PRIVATE_KEY
VAPID_SUBJECT=mailto:YOUR_REAL_CONTACT_EMAIL
```

For `PUSH_DATABASE_URL`, open Supabase **Connect → Session pooler** and copy the complete connection string. Replace its password placeholder with the percent-encoded database password. Use the provided host and username, not a guessed hostname. Session pooling works on IPv4-only networks. Use the database from this scrapbook's Supabase project, not a separate Railway database.

The connection verifies TLS certificates. If your project's certificate chain needs its CA, add `PUSH_DATABASE_CA` containing the PEM certificate from Supabase; literal `\n` line breaks are supported. Never disable certificate validation.

Keep `VAPID_PRIVATE_KEY`, `PUSH_DATABASE_URL`, and `PUSH_DATABASE_CA` off Vercel's frontend variables and out of Git. No `VITE_VAPID_*` value is needed: the authenticated API returns the public key.

Redeploy Railway, with app sleeping/serverless suspension **disabled** so the persistent worker can drain its queue. The normal API Dockerfile and start command are unchanged. Existing API behavior works when these optional push variables are omitted; heart sharing requires the database variable, and Web Push requires all three VAPID variables as well.

## Enable each device

1. Sign in as Ivan on Ivan's device and Loraine on Loraine's device.
2. Open **Our story** and tap **Enable notifications** on each device.
3. Accept the browser/OS permission prompt, then tap **Send test notification**. This sends a real encrypted push to this device through the server. ?Test accepted? means the provider accepted it; check the device notification center to confirm display. Permission is only requested from a button tap.
4. Tap the 3D **I miss you** button. A heart is saved for the other member, with one send per minute.
5. Close the recipient's app and send another heart after the cooldown to verify background push delivery on that device.

The self-test is limited to three requests per minute per IP and only accepts a subscription registered to the signed-in account. An expired subscription reveals the enable button again. If the provider rejects VAPID credentials, check the server key pair and contact address.

The enable/disable controls apply to the current account/device. **Remove all my devices** revokes every subscription belonging to that account. Subscriptions remain registered when the user locks the scrapbook so hearts can still arrive; use the notification controls to stop them. Lock-screen notification text is generic and opening it still requires app authentication. When switching accounts on a shared browser, enabling notifications renews the browser subscription so it cannot be reassigned to the other account silently.

## Browser support and truthful delivery states

- Android/Desktop browsers that expose the standard Push, Notifications, and Service Worker APIs can enroll; HTTPS and permission are required.
- iPhone/iPad: iOS/iPadOS **16.4+**, install to the Home Screen and open the installed app before enabling push.
- Embedded social browsers, private-browsing restrictions, permission denial, unsupported versions, OS battery/Focus settings, and offline devices can prevent or delay push. The app explains unsupported/blocked states and continues to save hearts in-app.
- Supported destination services are Google's FCM, Mozilla Push, Apple's Web Push, and Windows notification endpoints. Custom browser push providers need an explicitly reviewed allowlist update.
- The app polls in-app hearts every 15 seconds while visible and refreshes immediately when returning to the app or receiving a service-worker message.
- A heart is **saved** before push delivery is queued. A provider accepting a request is **not proof of device display or human reading**. The UI uses “queued” and “push service accepted,” never “your partner saw it.”
- The worker retries transient failures up to five attempts with increasing delays. Jobs expire after one hour. It removes 404/410 expired subscriptions and checks both memberships before delivery.
- A persisted request ID prevents duplicate hearts when the same send is retried after a lost response. Leased jobs recover after a Railway restart. Push systems can still deliver at least once; the notification tag reduces duplicate display for the same heart.
- There is no scheduling, email, SMS, location tracking, or notification broadcasting. This update specifically provides the requested miss-you heart notification.

## Verification

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:push-browser
git add .
git commit -m "Verify Ivraine push notifications and connection configuration"
git push origin main
```

The automated tests use the real API and PostgreSQL/RLS in a local fixture, with test authentication and simulated push transport. Browser enrollment is simulated in the browser test; no real partner received any test notification. VAPID/encrypted request generation and service-worker handlers are checked separately. Physical iPhone/Android delivery and live Railway/Supabase deployment must be tested after configuring your actual values.

## Why the hearts card may say the database is not set up (503, not 500)

The API deliberately answers `GET /api/notifications/state` with a calm **503 + Retry-After** while the storage is not ready; the browser then shows a status line instead of error toasts and retries on the server's schedule (5 minutes for a missing migration, 30 seconds for an outage). Railway's deploy logs say exactly which step is missing:

- `push_schema_missing: apply supabase/migrations/20260916205359_push_notifications.sql` — the migration has not been run in the Supabase SQL Editor yet. Run it once; the API picks it up on the next request without a redeploy.
- `push_database_unreachable: heart storage did not answer` — `PUSH_DATABASE_URL` is wrong, the database is paused, or the host/TLS is blocked. Copy the connection string again from Supabase → Connect (direct connection or session pooler), fix Railway variables, and redeploy.
- `push_database_ready` — storage is fine; look for another cause.

The same mapping applies to every `/api/notifications/*` endpoint, so a broken storage can no longer produce raw 500 responses or spam the browser console.

## Sources

- [Apple/WebKit: Web Push for Home Screen web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [MDN: PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
- [Supabase: database connections and session pooling](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [web-push: VAPID and encrypted push requests](https://github.com/web-push-libs/web-push)
