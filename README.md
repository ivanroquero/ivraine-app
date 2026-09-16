# Ivraine — Our Little Space, v2

A private, mobile-first scrapbook for Ivan & Loraine. Official date: September 2, 2026.

## What is included

| Feature | Working behavior |
| --- | --- |
| Our Story Timeline | Chronological stories, dates, places, chapters, and up to 12 photos per memory. Future-dated memories are marked as upcoming. Create, edit, favorite, and delete entries. |
| Open When Letters | Write personal letters, seal them as envelopes, open them in a reading dialog, edit, favorite, or delete them. Both accounts can open all letters. |
| Memory Gallery | Chapter filter, caption/title/date, search, favorites, full-window viewer, swipe and arrow-key navigation, optional browser fullscreen. |
| Milestone Calendar | Month navigation, daily agenda, annual birthdays, monthly milestones, anniversary countdown, upcoming bucket-list dates. Month-end dates clamp to the final day of shorter months. |
| Shared Bucket List | Add dreams with a target date and place; mark complete, reopen, and turn completed experiences into new photo memories. The completed dream stays in the list. |
| Our Playlist | Song, artist, personal note, favorite, edit, delete, and intentional Play links to Spotify, Apple Music, YouTube, or SoundCloud. No autoplay. Playback opens the provider; availability depends on the provider. |
| Privacy & sync | Two pre-created accounts; Supabase Auth; membership-based PostgreSQL RLS; private photo bucket; five-minute signed photo URLs. Background refresh every 60 seconds while the app is visible, with manual refresh. |
| Other | Password reset/change; PWA manifest; safe offline landing page; JSON story export; original encrypted scrapbook retained with local passcode photo import. |

This is a source package with deployment configuration. It is **not already deployed**, and it contains **no real credentials**. A new feature list was supplied during implementation; the six features above define this version's scope. The encrypted original's inner features could not be inspected without its passcode.

## Architecture

- **Vercel:** `frontend/`, Vite + strict TypeScript + Supabase Auth client.
- **Railway:** `backend/`, Express + strict TypeScript. Validates input and Supabase bearer tokens and performs all content operations.
- **Supabase:** Auth, PostgreSQL, and private Storage. There is no second Railway database to configure.
- The API uses the **publishable key plus each user's access token**. RLS remains active. Neither app needs a service-role secret or a database password.
- Two member accounts share editing/deletion privileges for their book. Membership is only configured by the database administrator. Public signup is not part of the app.

## 1. Set up Supabase

Use a **dedicated Supabase project** for this private app. This package has not changed any existing connected project.

1. Create/select the project in Supabase.
2. In SQL Editor, open `database/setup.sql` and run the complete script **once**. It creates the tables, indexes, policies, timestamp trigger, and private `ivraine-photos` bucket in one transaction. An existing installation should use reviewed migrations instead of rerunning this initial setup.
3. Open **Authentication → Users**. Create the two email/password accounts, one for Ivan and one for Loraine. Mark both emails confirmed. Choose unique strong passwords; do not reuse the old scrapbook passcode.
4. Open `database/add-couple.sql`. Search for `REPLACE_IVAN_EMAIL` and `REPLACE_LORAINE_EMAIL`; replace them with the exact emails from step 3. Run the script. It refuses to attach existing members to a new book or use unconfirmed/missing accounts.
5. Disable public new-user signups in Authentication settings. RLS still blocks unrelated users if signup is accidentally left on.
6. Copy the **Project URL** and **publishable key** (`sb_publishable_…`) from the project's Connect/API Keys settings. Do **not** copy a secret or service-role key.
7. For password reset emails, configure a production SMTP provider in Supabase Auth. Set the Auth **Site URL** to the production frontend URL and allow that exact URL as a redirect. Add `http://localhost:5173` for local development. Password recovery uses PKCE and should be opened in the same browser that requested it.
8. Run the Supabase Security Advisor on the chosen project after setup.

Membership verification in SQL Editor:

```sql
select b.title, m.display_name, u.email
from public.ivraine_books b
join public.ivraine_members m on m.book_id = b.id
join auth.users u on u.id = m.user_id;
```

Expect exactly the two intended members. To change names or the official date, update the corresponding `ivraine_books` row as the administrator. Birthdays are added in the app's Calendar with **Repeat → Every year**; the app does not invent birthday entries.

## 2. Backend environment — Railway

Use **repository root** as the Railway root directory. The included root `Dockerfile` and `railway.json` build only the API. Keep the default start command from the Dockerfile.

Add these variables in Railway:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
FRONTEND_ORIGINS=https://YOUR_SITE.vercel.app
TRUST_PROXY_HOPS=1
NODE_ENV=production
```

- Railway supplies `PORT`; leave it unset in production unless your service explicitly requires one.
- `FRONTEND_ORIGINS` accepts comma-separated **exact origins**, without paths or wildcard domains. Include a custom domain if applicable. Add a specific preview origin if testing a Vercel preview.
- Deploy the Railway service, generate its public domain, and open `/health`. Expect `{"status":"ok","service":"ivraine-api"}`. This is a process health check; authenticated app tests below verify the database connection.
- Run one API replica for this personal app. The in-memory rate limiter is per replica; a multi-replica deployment needs a shared limiter store.
- Verify the proxy hop count if you introduce Cloudflare or another proxy before Railway. Do not indiscriminately trust forwarded IP headers.

## 3. Frontend environment — Vercel

Import the extracted project as a Git repository in Vercel. Choose **Other** as the framework preset and keep **Root Directory at the repository root**. Root `vercel.json` provides:

- Install command: `npm ci`
- Build command: `npm run build -w frontend`
- Output directory: `frontend/dist`

Add these environment variables **before building**:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_API_URL=https://YOUR_SERVICE.up.railway.app
```

Deploy, then ensure this exact Vercel origin is in Railway's `FRONTEND_ORIGINS` and Supabase Auth Site/Redirect URL settings. Environment changes require rebuilding the Vite frontend. A build without these values intentionally shows a setup message instead of pretending to connect.

Vercel builds this source repository. Uploading the ZIP itself as a static website does not build or configure a backend. Extract it and import/push the source repository, or use the Vercel CLI from its root.

## 4. Local development

Use Node **22.12+** (Node 22 LTS recommended) and npm. Dependencies are pinned in the package manifests and lockfile.

Copy `frontend/.env.example` to `frontend/.env.local` and `backend/.env.example` to `backend/.env`, then replace the placeholders with values from the same Supabase project. Keep the frontend API URL `http://localhost:3001` and backend allowed origin `http://localhost:5173` for local development.

From the repository root:

```bash
npm ci
npm run dev:api
```

In a second terminal:

```bash
npm run dev:web
```

Open `http://localhost:5173`. The production API reads Railway environment variables; the local dev API reads `backend/.env`.

## 5. Bring over the original scrapbook

The original encrypted `scrapbook.sealed`, images/icons, and lock interface are preserved under `frontend/public/legacy/`. The original passcode was not guessed, changed, or uploaded.

1. Sign in to the new app.
2. Open **Settings & keepsakes → Import original photos**.
3. Enter the original eight-digit passcode. Decryption happens locally in the browser.
4. The importer uploads photos through the authenticated API, using captions or alt text from the original when available. Import IDs are deterministic so restarting skips successfully imported photos.
5. Imported photo dates default to the import date because the original layout does not guarantee machine-readable dates. Review and edit each date/story/chapter.
6. Original story text and layout remain accessible through **Open original scrapbook**. Automatic migration of arbitrary original interactive code is not attempted.

The original icon/couple photo and encrypted file are publicly downloadable static assets, as in the uploaded app. New uploaded photos and letter/story content are protected by authentication. If you want a neutral public app icon, replace the icon assets before deployment.

## Data behavior and limits

- Entries are loaded in pages of 100; searches/filters operate on the retrieved book. Both partners see changes within 60 seconds while visible or after Refresh.
- Every edit includes the previous update timestamp. If another partner edited first, the API returns a conflict; close the draft, refresh, and reapply the change.
- Each new memory supports up to 12 JPEG/PNG/WebP photos, each at most 8 MB. HEIC must be converted first. Existing attachments stay with the memory; title, caption/story, date, place, and chapter are editable. Create a new memory to attach another set of photos.
- Deletes affect both users. A confirmation is required. If remote photo cleanup fails, the app reports the remaining cleanup instead of claiming success. Inspect the private bucket for orphan files if uploads were interrupted by closing the browser.
- JSON export contains story/entry metadata and photo paths, **not the photo binaries**. It is not a complete database/storage backup or a restore file. Keep separate Supabase database and Storage backups.
- The app does not queue private writes offline. Offline content is a generic landing page. Session tokens use tab session storage; private API responses/photos are not cached by the new service worker. The preserved original retains its encrypted offline behavior.
- Signed photo URLs remain usable until their five-minute expiry. This is access-controlled cloud storage, not end-to-end encryption.
- PWA installation is supported in compatible browsers. A native App Store iOS app is outside this package's scope.
- The service worker replaces the previous root worker when updating the same origin, clearing stale app caches. Reload once after an existing install receives the upgrade.

## Verification

```bash
npm run typecheck
npm run build
npm test
```

`tests/` uses PGlite (real PostgreSQL semantics/RLS) behind a local Supabase-shaped transport emulator. The actual API and Supabase SDK run against it. Auth credentials and Storage transfer responses are test fixtures. These tests do **not** prove live Supabase Auth email delivery, live Storage behavior, Railway runtime, or Vercel deployment.

For browser verification, run `npx playwright install chromium` once, then `npm run test:browser`. This launches only local test services.

See `TEST-REPORT.md` for checks completed in this build, including browser coverage and remaining live-service checks.

After deployment, verify with both real accounts:

1. Sign in, upload a memory with photos, and see it from the other account after refresh.
2. Edit it from each account; try a stale edit in two tabs and confirm conflict handling.
3. Open a letter; favorite a memory; filter its chapter; swipe photos; navigate calendar months.
4. Add an annually repeating birthday and a bucket-list plan. Complete the plan and create a photo memory.
5. Add a real song URL and tap Play.
6. Delete a test entry and confirm its photo objects were removed from the private bucket.
7. Test password reset email delivery, install on your phones, and check offline/reconnection behavior.
8. Check an unrelated authenticated account cannot read the book through either the API or Supabase Data API.

Never deploy `tests/serve-fixture.ts`. It uses fake authentication and ephemeral data only for local verification.

## Save to your Git repository

Run these from the extracted project's repository root after configuring your Git remote. Actual `.env` files are ignored.

```bash
git add .
git commit -m "Build private Ivraine scrapbook with six features and Supabase backend"
git push origin main
```

## Official references used

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase private Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase storage downloads and signed URLs](https://supabase.com/docs/guides/storage/serving/downloads)
- [Vercel project configuration](https://vercel.com/docs/project-configuration)
- [Railway configuration as code](https://docs.railway.com/config-as-code/reference)
