# Employee Portal — Delivery and Setup

## Device notifications and mobile setup

The portal now includes an install manifest with real local 192/512-pixel PNG icons, scoped to `/portal/`. This enables the Home Screen web-app path required for iOS/iPadOS Web Push. No authenticated responses are cached by the service worker and no external assets or weaker CSP were added.

- **iPhone/iPad:** use iOS/iPadOS 16.4 or newer. Open `/portal/` in Safari, choose **Share → Add to Home Screen**, then open **Adplix Portal** from its icon, sign in and enable notifications in Inbox. Permission must be granted from that installed app. See [WebKit's platform requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- **Android:** open the portal in an up-to-date compatible browser such as Chrome; in Inbox choose **Enable notifications** and allow the device prompt. Home Screen installation is available but is not required for Android Web Push.
- **Desktop:** enable notifications in Inbox and allow the prompt. OS/browser notification settings, Focus/Do Not Disturb and browser/device restrictions can mute delivery.

Permission is requested directly from the user's tap before asynchronous registration; subscription waits for an active service worker. Existing subscriptions for a different VAPID key are replaced. Subscription persistence is verified before declaring the device enabled. Phone and desktop subscriptions no longer overwrite each other; up to five devices are retained per account. Disabling/signing out affects this known device, not the others. The first re-enable binds older unbound subscriptions to the shared-browser safety cookie.

Newly committed inbox events trigger optional device notifications for both roles, not just Employee notes/broadcasts. The service worker displays a generic OS notification without exposing private note/message text, even when the portal is closed, and notification clicks open Inbox. **Send test notification** sends to the account's registered devices and reports provider acceptance/failure without claiming display. To verify, enable on the target device, send a test, leave the portal and check Notification Center/notification shade. Then send a real note/broadcast from a different authorized account. Physical-device/background delivery remains a required user smoke check; simulated unit/browser coverage cannot certify it.

No billing changes or secret rotation are required. Delivery is bounded to 20 endpoints per action (five concurrent requests with five-second timeouts) and five per test; a large audience needs a durable send queue before universal device delivery can be promised. Inbox records persist even if push fails or a device is unsupported/offline.

Verification: Node 22 unit/integration run passed **154 tests**. Lint, formatting, marketing browser checks, portal browser checks, deployment packaging and `git diff --check` passed. The portal browser suite checked the linked production-built install manifest and iPhone Home Screen guidance without pretending to be a physical iOS device. Unit/API checks cover gesture-before-registration ordering, active-worker readiness, permission denial, key-mismatch repair, safe multi-device ownership, device-bound login/logout revocation, Admin and Employee push dispatch, protected/rate-limited test delivery, and provider failure without inbox rollback. Provider calls use mocks with synthetic cryptographic keys in tests; no real-user notification was sent during automated verification. The updated deployment verifier also checks the exact service-worker, manifest and icon bytes on production. Graphify was updated locally; manifest, icons, CSS and service-worker behavior were checked directly where AST coverage is absent.

Release: commit `a0c1826` was pushed to `main` and deployed as Worker version `348d876c-a6fa-4055-ba62-4cf35ca6be91`. Both production origins passed exact-build, service-worker, manifest/icon and security verification. The three previously configured VAPID secret names were confirmed present; their values were neither read nor changed. Reload the portal, enable/re-enable notifications on each device once, then use **Send test notification** and inspect the device notification shade/Notification Center outside the portal. Physical-device display is not yet confirmed by a user receipt.

## Live inbox, sender attribution and unread count

Visible signed-in portals now poll every 15 seconds, with an immediate check on focus/visibility return and a service-worker push signal. The inbox list, sidebar unread badge and visible notes update without reloading or replacing draft forms. Poll requests do not overlap and stale responses after a newer snapshot/session change are discarded. Busy writes or an open editing modal defer polling until the next check.

New unread arrivals show a nonmodal in-app pop-up with **Open inbox** and **Dismiss**. It does not request browser notification permission or steal focus; it expires after 10 seconds unless a control has keyboard focus. Existing unread history on sign-in/reload is counted but not repeatedly announced. Dismissing a pop-up does not mark messages read. **Mark as read** updates the persistent inbox state and count; each new note has one inbox alert, avoiding double-counting.

Notes and new broadcasts show the sender's name and role using explicit safe summary fields. Legacy notes resolve their saved author IDs, without exposing hidden Admin profiles, email, phone or passwords. Legacy broadcasts without a sender ID cannot be reliably attributed. Optional browser push remains generic on the lock screen and opens the Inbox; actual closed-tab delivery still requires permission and browser/device support.

Verification: `npm run quality` passed lint, formatting, **143 tests**, marketing browser checks and the portal browser suite against isolated local D1. The browser flow verified a note arriving on the regular timer without reload/focus, new-message pop-ups, sender display, badge increments and mark-as-read decrements. Unit/API checks cover initial-history suppression, announcement deduplication, ownership/read persistence, legacy note attribution and sender-field privacy; service-worker checks cover generic notifications and update signals to portal windows only. `npm run deploy:preview` and `git diff --check` passed. The local Graphify AST graph was updated; CSS/service-worker coverage is supplemented by source and explicit tests. No production account, note or broadcast was created by these checks.

Release: code commit `5c796bc` was pushed and deployed as Worker version `2da098ae-cfa5-4a7e-a1f8-790123dde5c5`. Read-only deployment verification passed on both production origins after an initial custom-domain check briefly returned the previous asset build during propagation; no redeploy was needed. Reload each already-open portal once to load the new client, then send a new note/broadcast with the recipient portal visible to verify the pop-up and badge privately. Real-device OS push delivery was not certified by these read-only checks. No database migration, billing or credential change was required.

## Profile glimpses and gesture photo editing

Authorized team names in task cards, team lists, daily updates, time-off requests, Analytics, visible note authors and the signed-in identity open a compact profile glimpse on hover, keyboard focus or click/tap. The card shows the saved photo (or initials), name, role, designation and work types. Clicking the card's photo opens a larger uncropped view of the saved image. Escape/close restores focus; popups close on navigation/auth changes. Native select options and input values remain plain text.

Snapshot `profileGlimpses` whitelists only team-visible summary fields and validated photos. Employees still cannot preview hidden Admins/inactive peers or access private email, phone or biography fields. Existing full-profile permissions are unchanged; registration requests do not become public profiles.

Both Admins and Employees can choose/edit their own photo in a WhatsApp-style gesture crop dialog: **drag to position, pinch or scroll to zoom**, then **Use photo**. Plus/minus and arrow keys provide keyboard alternatives. No position sliders or pixel-size dropdown remain. Use photo stages a local preview; **Save photo** persists it and **Cancel changes** restores the saved image. The original upload is retained only while staged, preserving quality across repeated edits. New saved photos are 512 × 512 baseline JPEGs under 32 KiB; the authenticated action body allows up to 50,000 characters for that bounded base64 payload while other JSON endpoints remain capped at 20,000. Existing 128 × 128 photos must be edited or re-uploaded to regain detail. No original photo is retained remotely, no new external image host is used and the CSP remains unchanged.

Graphify was used locally to trace snapshot/name/profile relationships, then updated after implementation. `.graphifyignore` scopes extraction to portal source and synthetic tests; generated `graphify-out/` is ignored. The AST graph does not cover CSS or several symbol-free tests, and diagnostics reported three self-loop edges; source reads and browser checks supplied the missing validation. No remote semantic extraction or global graph merge was enabled.

Verification: `npm run quality` passed lint, formatting, **136 tests**, marketing browser checks and portal browser checks against isolated local D1/Durable Objects. Browser coverage includes drag, wheel and keyboard zoom/reset, simulated two-pointer pinch, saved/pending photo cancel, failed saves, actual emulated-touch profile opening, enlarged-photo focus return, peer task-name preview, 320-pixel/mobile/landscape layout and axe/CSP checks. `npm run deploy:preview` passed packaging. Screenshots contain only synthetic data in ignored `.portal-local/previews/`, including `admin-gesture-crop-mobile.png` and `admin-profile-glimpse.png`. Pinch tests exercise the handlers and geometry, not a physical-device certification. No production photo/account was changed during testing.

Release: code commit `a16cf0b` was pushed to `main` and deployed as Worker version `c552bffe-4bf1-4fef-a6ea-dab6fc86ed24`. Read-only `npm run deploy:verify` checks passed for both `https://adplixmedia.in` and `https://withered-pine-ee0b.adplixmarketingagency.workers.dev`, confirming the expected build, routing and security headers without modifying production accounts. No billing change, credential reset or database migration was required. Authenticated production crop/profile interactions and physical-phone pinch behavior still need a private user smoke check.

To try the release, reload `/portal/`, hover/focus or tap a visible team name, and click its photo for the larger view. In your profile, choose a photo, drag to position and pinch/scroll to zoom, select **Use photo**, then **Save photo**. Confirm Cancel leaves the previous image unchanged on your device.

Follow-up release: commit `5fb3007` was pushed to `main` and deployed as Worker version `e833fea7-37a5-4c09-bb05-b2706cbf0890`. New photos now save at up to 512 × 512 baseline JPEG under 32 KiB; existing 128 × 128 photos need one edit or re-upload to regain detail. Three newly generated production-only VAPID secrets are configured (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` with the site URL as subject); their values are not stored in the repository. Both production origins passed read-only deployment verification. Users must reload and enable browser notifications once on each browser; delivery still depends on browser/device permission and support.

## Admin in-time and Analytics follow-up

The owner confirmed that production sign-in/password change works and additional Admin accounts were created after the Cloudflare-native release. The account counts and pending-rotation evidence in the previous release section are historical snapshots, not current account inventory.

Admin logins now persist the same first-login-per-Asia/Kolkata-date records as Employees. Repeated sign-ins do not replace the day's first in-time. Login duration runs from that first login to the earlier of now or 17:30 IST; the live today fields clear at cutoff and day rollover while selected-period totals retain saved history. This is elapsed login time, not active attendance, task working time or a clock-out system. Existing signed-in Admins should sign out and sign back in once to start recording; no earlier Admin in-times were backfilled.

Analytics includes Admin and Employee rows with role labels under **Team attendance & work**, and the **Team member** filter supports either role. Matching Admin time contributes to selected report totals; task/client/function filters keep their existing scoping. The Excel **Team** sheet includes a Role column and Admin login metrics. Admins are not counted as missing employee daily updates. Employee access to Admin analytics remains denied. No schema migration, database reset or credentials change is required.

Verification: `npm run quality` passed lint, formatting, **124 tests**, marketing browser checks and portal browser checks. The browser flow selected an Admin in Analytics and downloaded an Admin Excel report. Regression coverage includes first-login persistence/deduplication, Admin summary totals, 17:30 cutoff, day rollover and employee authorization boundaries. Code commit `87d652d` was pushed and deployed as Worker version `104e0952-70f4-4e0c-ad18-8216a0c7a0c4`; read-only deployment checks passed on both production origins. These checks verify deployed build/routing, not a real Admin's newly recorded production in-time; sign out and back in privately to verify that final account-specific result.

## Current release readiness (9 October 2026)

The historical notes below describe earlier local-only milestones. The Worker is now deployed to `https://adplixmedia.in/portal/` and `https://withered-pine-ee0b.adplixmarketingagency.workers.dev/portal/`, with the `PORTAL_DB` binding to `adplix-portal`. The latest aggregate production check confirmed one provisioned Admin with initial password rotation still required and no completed password-change audit event. No database reset or credential replacement was performed during debugging.

- The previous production authentication failure was a Worker CPU-limit error, not missing Admin provisioning. A bounded, redacted live trace confirmed `exceededCpu` and HTTP 503 for both `/api/portal/login` and `/api/portal/password`. The HTML error page explains the screenshot's non-JSON response. Do not re-bootstrap, reset the database, or lower password-hashing strength to address this.
- Owner decision: remain on Cloudflare Free and implement internal Durable Object hashing. `PORTAL_PASSWORDS` now routes every password operation to the SQLite-backed `PortalPasswordHasher` class, with an isolated-memory work queue and no plaintext logging or storage. The regular Worker retains routing, rate limits, sessions, CSRF and authorization; existing account/session/business data remains in D1. Scrypt parameters and hash encoding are unchanged, so existing accounts need no migration.
- Cloudflare documents SQLite-backed Durable Objects as available on Free with a 30-second default CPU allowance. Free daily request/compute quotas still apply; exhaustion causes failures rather than a paid-plan upgrade. No billing change is authorized. See [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/) and [pricing/free quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/). Deployed synthetic password verification passed; private first rotation must still be verified.
- The profile photo layout now clips images correctly, supports 64/96/128-pixel resizing, previews changes, and saves or cancels explicitly. Browser tests exercise both Admin and Employee roles against isolated local D1.
- ESLint (zero warnings), Prettier, unit/integration tests and both self-building browser suites are exposed through `npm run quality` and `.github/workflows/quality.yml`. Legacy code and original source media were preserved under `archive/`; generated bundles, logs and screenshots are no longer tracked.
- `npm run deploy:verify -- https://adplixmedia.in` verifies the deployed build and unauthenticated security boundaries without modifying production data. It does not exercise password hashing and cannot establish authenticated usability or adequate CPU allowance.
- Do not treat a successful build, a 200 login-page response, or local synthetic tests as proof that a real production account works.

Local release evidence: clean `npm ci`; `npm run lint` with zero warnings; `npm run format:check`; 106 passing unit/integration tests; both marketing and portal Chromium E2E suites; `npm audit` reporting zero vulnerabilities; and `npm run deploy:preview` packaging with the production D1 binding. The portal E2E suite was explicitly rerun after recovering an interrupted formatting write. Browser runners now require each suite's completion receipt as well as exit status zero.

Cloudflare-native follow-up (deployed): incorrect current-password validation returns HTTP 400 rather than a misleading session-expiry 401; the UI retains the authenticated form and permits correction. Non-JSON 5xx errors report a server failure with HTTP status and an optional validated Cloudflare reference, never the raw response. `npm run quality` passed: lint, formatting, 119 tests, marketing browser checks, and portal browser checks using real local D1 and the Durable Object. Coverage includes wrong-current-password recovery, correct retry, session rotation/reload, legacy hashes, internal-service validation, bounded queue overload and fail-closed missing bindings. `npm run deploy:preview` packaged the production D1 and Durable Object bindings successfully.

The `v1-password-hasher` Wrangler migration creates the SQLite-backed class namespace only; it does not migrate or reset D1 accounts. The object exposes only internal `/hash` and `/verify` requests over its namespace binding; no public hashing route was added. Missing/unavailable bindings return safe JSON 503 with no Worker-local hashing fallback. Private bootstrap generation still uses the same local hashing helpers. Serialized work is deliberately sized for a small employee portal, not unlimited authentication throughput.

Release evidence: code commit `2328d6a` pushed to `main`; `npm run deploy` deployed Worker version `27782edc-7080-420f-aef1-68c5c035bdb2`, with the Durable Object binding and migration confirmed by version inspection. `npm run deploy:verify` passed for both production origins. One nonexistent synthetic login per origin completed verification and returned JSON 401 `Invalid credentials.` with no session cookie. Redacted outer Worker traces reported `ok`, 6 ms and 3 ms CPU, and no CPU-limit errors in the bounded observation. Separate Durable Object invocation timings were not returned by that tail, so those figures describe only the outer Worker. This verifies the deployed verification path, not a successful real-account login or password rotation. Aggregate D1 state remained revision 1, one user, one pending initial rotation and zero password-change events. Reload the portal and complete the existing Admin's rotation privately; never send credentials through chat.

## Earlier implementation history

7 October 2026. Working local implementation. No commit, push, production database creation, or deployment performed.

## Delivered functionality

- Employee Portal link in desktop/mobile public navigation; separate Vite portal entry at `/portal/`.
- Closed email/password accounts, Admin provisioning, temporary-password change, salted scrypt hashes, HttpOnly session cookies, CSRF/origin protection, persisted login limits, reset/deactivation session revocation.
- Self-registration requests with chosen email/password, Admin-only approval/rejection in Team, and no pending-user session or workspace access. This replaces the previous no-public-registration restriction; first Admin still requires operator setup.
- Admin employee/client management, job-function-specific assignment, task review approval/rejection, explicit deadline adjustments.
- Employee own-task start/completion/reopening, read-only team task summaries, red overdue task surfaces, daily updates and original submission history.
- Red text-labelled **Update overdue** badges on employee daily updates and Admin team rows; in-place status refresh preserves unsaved update text.
- Concurrent task working duration: Monday–Saturday 10:00–13:00 and 14:00–17:30 Asia/Kolkata, approved absence subtraction, no lunch/Sunday/overnight counting. Rejection resumes an interval with required feedback. Absence does not automatically extend deadlines.
- Full-day/multi-day leave and same-day hourly permission requests; Admin decisions; retrospective approved absence recalculates totals.
- Shared/individual notes, broadcast inbox, read state, optional Web Push subscriptions and generic lock-screen messages.
- Admin team/individual labelled charts and metric tables, all-time/month/year/custom date filters, employee/client/function scoping, and real six-sheet Excel workbook download with formula-safe text. Historical tasks, state events, work intervals, daily updates, absences, and login records remain in the D1 business document for reporting.
- Responsive charcoal/off-white/red interface; bundled Geist font, keyboard focus, native dialogs, mobile drawer, reduced-motion handling, no untrusted HTML execution.
- Private/no-store portal/API responses; same-origin portal policy and service worker. Public policy stays separate.

Source: `portal/`, `src/portal/`, `migrations/0001_portal.sql`, `src/index.js`, `vite.config.js`, `wrangler.portal.toml`.

## Verified evidence

- Node 22 unit/integration run: **61 tests passed**, including moderated registration, overdue badge states, routing, response parsing, historical month/year analytics, Vite dev/preview proxies, and database-backed workflow checks.
- SQLite-backed tests cover account provisioning, forced password change, CSRF, ownership, forbidden approval, review/reopen flows, concurrent-version conflicts, absence privacy, updates, notes, Excel, reset and access revocation.
- Real local Cloudflare D1 migration and browser flow passed with isolated synthetic accounts. Browser exercised registration, blocked pending login, Admin approval/rejection, approved Employee login, employee/client/task creation, forced passwords, work review, leave/permission approvals, inbox, month/year plus per-employee analytics filters, and Excel download. A controlled snapshot response separately verified overdue styling/accessibility independently of the test clock; business deadline rules are covered by domain tests.
- Chromium axe checks passed for login, employee overview, Admin analytics and mobile employee dashboard. No uncaught JavaScript or CSP errors in that flow.
- Responsive checks at 1440px, 375px portrait, 812px landscape and 768px tablet; no horizontal document overflow. Mobile drawer Escape restores keyboard focus.
- Vite production multi-entry build passed; Wrangler packaging dry-run passed (does not provision production).
- Runtime dependencies: `npm audit --omit=dev` reported zero vulnerabilities. Three high audit findings remain in Wrangler's development chain as recorded in SECURITY.md.

Screenshots contain **synthetic test data only**:

- `previews/admin-analytics.png`
- `previews/employee-desktop.png`
- `previews/employee-mobile.png`

## Local preview

Use Node 22.12+; `.nvmrc` selects Node 22. No global Node configuration was changed.

```sh
nvm use
npm ci
npm run portal:build
npm run portal:migrate
npm run portal:dev
```

Open http://127.0.0.1:8787/portal/. `wrangler.portal.toml` is local-only with a placeholder database ID and explicit loopback HTTP allowance. Never deploy that config.

There is intentionally no default login. For your local Admin, supply `PORTAL_ADMIN_NAME`, `PORTAL_ADMIN_EMPLOYEE_ID`, `PORTAL_ADMIN_EMAIL`, and `PORTAL_ADMIN_PASSWORD` privately in the terminal process environment, then run:

```sh
npm run portal:bootstrap
npx wrangler d1 execute adplix-portal-local --config wrangler.portal.toml --local --file .portal-local/admin-bootstrap.sql
```

Generator writes a private, ignored, restrictive-permission SQL file containing only a password hash, never prints credentials. The guarded SQL only modifies an empty initial state; confirm **one affected row**. Zero rows means bootstrap did not apply; never reset an existing database to make it succeed. Remove the private SQL after successful application; clear temporary environment values. Admin must replace the temporary password at first login.

For browser checks instead of creating your own account:

```sh
npx playwright install chromium
npm run portal:build
npm run portal:test:e2e
```

The test creates/removes a private isolated local D1 instance with synthetic credentials. It does not leave a test login in the ordinary preview database or touch Cloudflare production. Unit and database-backed tests: `npm test` with Node 22. Node 20 skips the SQLite integration group; do not count a skipped group as passed.

## Production launch — required before real employees use it

**Git-connected static asset deployment alone is not enough for this portal.** Its API needs the Worker and D1 binding. If the current custom domain uses Cloudflare Pages static hosting, either deploy this Worker with the domain or explicitly integrate a Pages Functions adapter; no adapter was silently installed. Confirm the actual domain routing before enabling employee accounts.

1. Provision a production D1 database in the intended Cloudflare account. Add its real binding to `wrangler.toml`:

   ```toml
   [[d1_databases]]
   binding = "PORTAL_DB"
   database_name = "<actual-production-database-name>"
   database_id = "<actual-database-id>"
   migrations_dir = "migrations"
   ```

2. Apply `migrations/0001_portal.sql` to that explicitly selected production database. Bootstrap the first Admin with the private operator generator and apply its guarded SQL to that database; check one affected row. Do not reuse synthetic browser credentials.
3. Configure build/deploy Node 22 and confirm the domain executes Worker routes for `/api/portal/*` and `/portal/*`. Keep `PORTAL_ALLOW_HTTP_LOCAL` absent in production. Use HTTPS.
4. Deploy the `PORTAL_PASSWORDS` binding and `v1-password-hasher` SQLite-backed Durable Object migration from `wrangler.toml`. Scrypt uses N=32768/r=8/p=3 and substantial CPU/memory; it must run in the Durable Object, not the regular free Worker. Verify runtime outcomes and monitor Durable Object free quotas before enabling employees. Do not weaken the work factor or change billing without approval.
5. To enable closed-tab browser push, generate one P-256 VAPID key pair with approved tooling and provide the resulting values to the **production Worker**. Do not commit VAPID material or add private keys to frontend environment variables. From this repository, run the following commands and enter each value only at the Wrangler prompt:

   ```sh
   npx wrangler secret put VAPID_PUBLIC_KEY --config wrangler.toml
   npx wrangler secret put VAPID_PRIVATE_KEY --config wrangler.toml
   npx wrangler secret put VAPID_SUBJECT --config wrangler.toml
   npx wrangler secret list --config wrangler.toml
   npx wrangler deploy --config wrangler.toml
   ```

   `VAPID_SUBJECT` must be a contact URI such as `mailto:operator@example.com`; use the same public key for browser subscription and Worker delivery. The application reports the exact missing variable names to signed-in users and refuses to store new subscriptions until all three are present. Without them, inbox/broadcasts still work but closed-tab browser push is unavailable. The local `wrangler.portal.toml` intentionally has no VAPID values.
6. Enable database backups/recovery, monitoring, privacy retention, and account security. Rehearse restore. No live backup or MFA setup was completed in this implementation.
7. Run preview-to-production smoke checks with authorised accounts: login, changed passwords, roles, assignment, absence, report, push, and public website/contact form. Check headers, no-store responses, cookie flags, and absence of CSP errors.

No production account credentials are required in chat. Provide them directly through the local/private setup flow.

Registration requires an existing active Admin. Public requests are rate-limited, capped at 100 Pending, and receive a generic receipt for duplicate emails without changing credentials. Decided registration records expire after 30 days during subsequent new-request writes; pending records are not silently removed. Rejection/approval purges the request's stored hash. Pending applicants are not employees and do not enter analytics. Email ownership is not yet verified by delivery—Admin must confirm identity/address before approving.

## Known limitations and next improvements

- Initial storage uses one D1 JSON business document with atomic revision comparison, plus separate session/rate-limit tables. This avoids lost updates but is **not an unlimited-scale relational design**. It refuses writes above 1,500,000 UTF-8 bytes. Before sustained production use, plan normalized tables/retention and migrate safely; history is not silently deleted to fit the cap.
- Rate-limit/session expiry is enforced, but periodic cleanup/retention and Admin MFA/passkeys are not implemented. User records and audit data need agreed retention. Archived accounts/clients remain in history.
- Browser push delivery was tested for guarded destinations and expiry handling, not with live VAPID/browser delivery. Only configured known push provider domains are allowed. Scheduled reminders are not implemented; daily status is calculated dynamically and UI polls on minute boundaries.
- Initial leave scope excludes cancellation, leave balances, half-day leave, holidays and payroll. No automatic deadline extensions. In-progress reassignment and unlocking approved tasks are not implemented.
- Trend graphs count completion **events**, including repeated completion after reopening; current-state counts count tasks. Month/year/custom date filters select task counts by creation date and trends by event date. Employee filters scope tasks, charts, updates, absences, and login records to that employee. Charts/export document these distinct semantics.
- Current UI shows graphs and individual metrics, not a composite productivity score. Concurrent durations may overlap and are not attendance. No surveillance is included.
- No deliverable file uploads, Canva/Instagram integrations, or external storage permissions are included.
- Test screenshots and scripts use synthetic data. Automated accessibility checks are not proof of every WCAG criterion or every browser; Safari/Firefox/mobile push and production end-to-end still require validation.

## Next concrete step

Provision the production D1 binding and first Admin in a preview Worker deployment, confirm how adplixmedia.in routes dynamic requests, then verify the production CPU/auth and recovery setup before a live launch. No Git push or deployment has been performed in this implementation session.

## Login preview repair

The local preview formerly running on port 3000 used stale routing and returned the public HTML page for `/api/portal/session`. The client attempted to parse it as JSON, producing `Unexpected token '<'`.

Both Vite dev and preview now proxy `/api/portal` to the local Worker on port 8787, preserving request Origin/Host; an unavailable Worker produces a JSON 503 rather than an HTML fallback. The portal validates JSON content type and payload, never displays raw fallback HTML, and still handles authentication errors and Excel downloads correctly.

The old port-3000 process was restarted. HTTP and Chromium checks verified JSON 401 for an unauthenticated session and a clean login screen at http://127.0.0.1:3000/portal/. The real local D1 browser workflow passed again. No production routing or account provisioning was implied by this repair.

## 8 October 2026 — marketing integration verification

- The canonical `Adplix_website` React marketing UI is now mounted at `/`, with its components in `src/App.jsx`, `src/components/`, and `src/sections/`. Vite still builds the independent `/portal/` entry and retains the `/api/portal` proxy and service worker output.
- Marketing edits are complete: “Let's talk” is retained in the desktop/mobile navbar per the latest request, but removed from the hero; lighter Selected Work charcoal; red project titles; aligned, slightly shorter Founder portraits; circular testimonial logos; smaller footer brand lockup. Desktop/mobile Employee Portal links and social-preview metadata are preserved.
- Portal JavaScript and API behavior were not changed during the marketing port. The only portal source adjustment in that verification pass was the separately authorized contrast fix: `.employee-attendance small` now uses the existing `--muted` token instead of its lighter hard-coded color. No layout or workflow changes were made in that pass.
- Analytics now reads the persisted D1 business history for all-time, month, year, and custom date reports. Admins can scope a report to one employee, client, and/or job function; the selected scope is retained for Excel export. The UI explains that historical reports are live views of saved records rather than immutable snapshots.
- Existing browser tests were updated for the already-delivered designation field, employee/admin assignment label, client service-type labels, rating approval dialog, current-state employee chart, and the new month/year/per-employee analytics flow. They also verify that an Employee completion appears in the Admin inbox with approval-waiting text.

Actual checks with the installed Node **22.23.3** runtime:

- `npm run build` and `npm run portal:build`: passed.
- `npm test`: **61 passed, 0 failed, 0 skipped**, including SQLite-backed integration, historical analytics filters, and Admin completion-notification tests.
- `npm run marketing:test:e2e`: passed for visual requirements, media playback, draft-only forms, mobile navigation, animation controls, accessibility, responsive layouts, and isolated portal entry.
- `npm run portal:test:e2e`: passed using an isolated local D1 database and synthetic accounts, including registration, password rotation, completion inbox notification, rated review, month/year/per-employee analytics filters, aligned Excel export, leave/permission approvals, desktop/mobile, accessibility, and CSP checks.
- `git diff --check`: passed.
- The workspace Vite preview was restarted after stale development module-resolution errors; Chromium verified both `/` and `/portal/` at http://localhost:3000/. No global Node setting was changed.

No commit, push, production migration, account provisioning, or deployment was performed. The next production step remains the explicit D1/Worker routing and first-Admin setup described above; local test success is not evidence of a production launch.

## Local API process restored — 8 October 2026

The website preview on port 3000 was running without its Wrangler backend on port 8787. The frontend session request returned JSON 503 `Portal API unavailable.`, and the direct backend connection was refused.

Rebuilt the portal assets and started the local Worker with Node 22.23.3 and the existing `wrangler.portal.toml` configuration. A read-only query confirmed the existing local D1 state record. No migration, bootstrap, password reset, or account/data mutation was performed.

Both direct and proxied unauthenticated session requests now return the expected JSON 401 `Sign in required.` Chromium verified the actual session request and a clean login screen at http://localhost:3000/portal/ with no unavailable message or uncaught JavaScript error. The targeted Vite proxy test passed. This verifies API availability, not an authenticated user login.

For future fresh starts, use Node 22 and `npm run portal:build` followed by `npm run dev:all` to start both services. `npm run dev` alone starts only the frontend.
