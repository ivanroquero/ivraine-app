# Exact code changes

`ivraine-push.patch` contains every changed/new code section. Apply it from the repository root using the commands in `PUSH-SETUP.md`. In each hunk, remove `-` lines, add `+` lines, and retain context lines. The patch was checked against the previous Ivraine package, not the inaccessible GitHub checkout.

## Existing files: search and replace/add

| File | Search anchor | Operation and purpose |
| --- | --- | --- |
| `frontend/src/api.ts` | `export async function api` | Replace the request handling with normalized API URLs, clear network/configuration errors, JSON validation, and HTTP retry metadata. Add `ApiError` and the normalization import. |
| `frontend/src/main.ts` | `function render`, `async function boot`, `case'logout'`, `SIGNED_OUT` | Add the connection stylesheet/imports; repaint the heart controls after rendering; start updates after authenticated book loading; stop updates when locking/signing out. |
| `frontend/src/views.ts` | `return \`${hero}` | Add the connection markup import and insert the heart card after the Our story hero. |
| `frontend/public/sw.js` | `const CACHE`, `self.addEventListener('fetch'` | Update the offline cache version; append push display and notification-click handlers. Navigation stays on this app's origin. |
| `backend/src/app.ts` | `export interface Config`, `app.use(cors`, `app.use(express.json`, `const handler:ErrorRequestHandler` | Add optional push services, normalize the exact CORS allowlist, expose `Retry-After`, mount authenticated notification routes, and handle push errors. |
| `backend/src/server.ts` | `const app=createApp`, `for(const signal` | Create the PostgreSQL/Web Push runtime, inject it into the API, and stop the queue worker/pool during shutdown. |
| `backend/.env.example` | `Core scrapbook operations` | Add commented optional push variables; keep secrets on the server. |
| `backend/package.json` | `scripts`, `dependencies` | Add `push:keys`, `pg`, and `web-push`. |
| `package.json` | `scripts`, `devDependencies` | Add the browser test command and TypeScript declarations for PostgreSQL/Web Push. |
| `package-lock.json` | dependency lockfile | Apply the matching dependency changes; use `npm ci`. |

## New files: create using the patch

| File | Purpose |
| --- | --- |
| `frontend/src/api-config.ts` | Normalize and validate the Railway API URL. |
| `frontend/src/connection.ts` | 3D heart markup, notification enrollment/revocation, received-heart updates, send status, cooldown, and browser support guidance. |
| `frontend/src/connection.css` | Responsive dimensional heart, press/hover states, and reduced-motion support. |
| `backend/src/push/validation.ts` | Validate subscription keys, trusted push destinations, and idempotent send IDs. |
| `backend/src/push/store.ts` | Private database storage, ownership, cooldown, recipient resolution, queue leases, and device cleanup. |
| `backend/src/push/worker.ts` | Encrypted push dispatch through the injected sender, retries, expiry, and delivery-state updates. |
| `backend/src/push/runtime.ts` | Verified-TLS PostgreSQL pool, VAPID configuration, and worker lifecycle. |
| `backend/src/push/routes.ts` | Authenticated state, subscription, revocation, and send-heart API routes. |
| `supabase/migrations/20260916205359_push_notifications.sql` | Private subscription, heart, and queue tables; indexes; RLS; client grant revocation. |
| `tests/push-fixture.ts` | Actual PostgreSQL fixture adapter for notification tests. |
| `tests/push.test.ts` | Database/API isolation, cooldowns, deduplication, CORS, retry, and cleanup checks. |
| `tests/service-worker.test.ts` | Notification display/click checks and real encrypted VAPID request generation. |
| `tests/push-browser-check.ts` | Browser interaction checks with simulated permission, subscription, and push transport. |
| `PUSH-SETUP.md` | Required migration, Railway/Vercel variables, deployment and physical-device checks. |

`frontend.env.example` and `railway.env.example` in this bundle are production variable templates. Fill in your real values in the respective dashboards; do not commit populated secrets. Railway supplies `PORT`.
