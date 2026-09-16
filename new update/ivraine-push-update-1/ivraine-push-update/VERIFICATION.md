# Verification of this patch

- TypeScript frontend/backend checks: passed.
- Configured frontend production build and backend build: passed.
- Automated tests: 11 passed, 0 failed. These include the existing scrapbook CRUD, photo, RLS, validation, and calendar checks, plus the new notification/database/API checks.
- Browser walkthrough: 9 checkpoints passed, with no runtime errors.

Browser checkpoints:

1. Login succeeds with an API URL ending in `/api/` and a configured frontend origin ending in `/`.
2. Notification permission is requested from the button gesture; the subscription is persisted through the real authenticated API.
3. The 3D heart button saves and queues a heart; cooldown prevents repeated taps.
4. An incoming heart appears in-app; provider acceptance is described accurately.
5. The 390px mobile layout has no horizontal overflow.
6. Reduced-motion preference disables the heart animation.
7. Unsubscribe removes the current account's server record and browser subscription.
8. The second account sees the heart addressed to it.
9. No browser runtime errors occur.

The fixture uses actual PostgreSQL/RLS via PGlite and the real Express routes and Supabase client. Authentication is provided by a local fixture. Browser permission/subscription enrollment and push-provider delivery are simulated. Separate tests generate a real encrypted Web Push request and exercise service-worker push/click handlers.

This does not verify real device delivery, live Supabase credentials, Railway availability, or the Vercel deployment. Complete the physical-device check in `PUSH-SETUP.md` after applying the SQL and environment values. The GitHub connector returned 404 for the requested repository; no remote source was changed.
