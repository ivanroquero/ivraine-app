# Verification report — Ivraine v2

## Completed

- Strict TypeScript checks for frontend and backend: passed.
- Vite frontend production build and TypeScript API build: passed.
- Automated test suite: 4 suites/tests passed, covering API integration, PostgreSQL RLS, input validation, and calendar edge cases.
- Browser flow: 16 checkpoints passed in Chromium at desktop and 390-pixel mobile width, with no uncaught browser runtime errors.

## Browser checkpoints

1. Login screen loads without a framework error.
2. Sign in reaches the connected app through the actual Express API and Supabase SDK.
3. Create a dated memory with a story, chapter, and two uploaded photos.
4. Filter a gallery chapter and navigate photos with controls and arrow keys.
5. Favorite a memory, preserve the other fields, and filter favorites.
6. Write an Open When letter; its body stays inside the envelope until opened.
7. Navigate the calendar and save a repeating milestone.
8. Complete a bucket-list item and turn it into a photo memory.
9. Save a song link, artist, and personal note; verify playback is intentional.
10. Edit a memory without losing attachments.
11. At 390 px, all six navigation links exist and the page has no horizontal overflow.
12. Sign out, sign in as the second partner, and read the saved content.
13. Delete a shared memory from the second account.
14. Original-format import rejects a wrong passcode, decrypts a synthetic valid archive, imports its photo, and skips duplicates on re-import.
15. JSON export triggers a downloadable file.
16. No uncaught browser JavaScript exceptions.

## API/database coverage

- Missing and malformed tokens rejected.
- Unrelated authenticated user rejected by API; zero book/entry rows visible through direct SQL with the authenticated role.
- Membership spoofing, author spoofing, and author reassignment rejected.
- Both intended members can view, edit, and delete shared content.
- Exact-origin CORS policy rejects unconfigured origins.
- Upload validation rejects disguised script content.
- Photo upload, private signed URL generation, and cleanup after deletion.
- Referenced photo cannot be deleted through the orphan-cleanup endpoint.
- Stale updates return HTTP 409 and do not overwrite newer edits.
- Favorite-only update preserves caption/story and chapter (regression check).
- Invalid dates, unapproved song URLs, extra privileged fields, and excessive photo counts rejected.
- Monthly recurrence clamps day 31 to the last day of February; yearly leap-day recurrence handles leap/non-leap years.

## Environment and limits of this verification

The API tests use the actual application server and Supabase JavaScript client with a local Supabase-shaped transport emulator. PostgreSQL queries and RLS execute in PGlite. Authentication tokens and Storage transfer responses are simulated **only in the test harness**. Screenshots use fixture records and the uploaded app's public couple icon; fixture records are not seeded into production.

The agent-browser CLI could not start its daemon in this environment. Chromium was launched directly through Playwright for the completed browser checks.

Not verified against live accounts/services: Supabase project installation/advisors, hosted Auth, email delivery, remote Storage/CDN, Railway Docker runtime, Vercel build/deployment, actual iPhone installation, and offline service-worker behavior on physical devices. No live deployment or credentials are included.

The original encrypted scrapbook's passcode and inner source were not supplied, so its exact original interactive features and import of the real encrypted photo collection require user-side verification. The local decryption/import flow passed against a synthetic archive with the same encryption format. All 14 original files were verified byte-for-byte against the input ZIP and are retained unchanged under `frontend/public/legacy/`.

Use the post-deployment checklist in README.md before relying on the app for irreplaceable memories.
