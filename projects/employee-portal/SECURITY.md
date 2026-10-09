# Adplix Security Hardening and Portal Security Requirements

Reviewed: 7 October 2026. Initial hardening findings below remain historical. The portal is now implemented and verified locally; current deployment/security limitations are in DELIVERY.md. Production is not provisioned.

## 1. What changed locally

### Browser and deployment policy

- Retained all six existing security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Moved the Worker's policy into `src/security-headers.mjs`; parity tests ensure `assets/_headers` applies the same policy when Cloudflare serves static assets before the Worker.
- Restricted the external script source from the entire jsDelivr origin to the exact EmailJS 4.4.1 bundle path.
- Pinned the HTML script to that release and added SHA-384 subresource integrity plus anonymous CORS. The integrity value was independently checked against the fetched release bytes.
- Explicitly disallowed child frames and workers. Preserved required Google Fonts, EmailJS API connections, local media, and current inline styles.
- Added the explicit `ASSETS` binding in `wrangler.toml`, matching the Worker's `env.ASSETS` reference.
- Preserved response bodies, statuses, redirects, cache headers, range responses, and HEAD responses when adding Worker headers.

Do not relax the policy to broad `https:`, script `unsafe-inline`, or `unsafe-eval` merely to pass a scanner. CSP cannot replace safe rendering or server-side authorisation.

### Dependencies and development environment

- Updated Vite from the old 5.x line to 7.3.7 and Wrangler to 4.148.0; regenerated the lockfile.
- Removed the unused direct dependency on `@cloudflare/kv-asset-handler`. Cloudflare tooling still brings its own transitive asset-handler dependency.
- Restricted dev/preview servers to loopback, with CORS disabled and no arbitrary allowed hosts.
- Denied development-server access to environment files, Cloudflare local secrets, certificate/key files, private runtime directories, git metadata, and logs. Tests use synthetic fixtures, not real private files.
- Added ignores for `.dev.vars*`, local Cloudflare directories, generated Worker output, and private runtime/log folders. Shareable skills are not blanket-ignored.
- Added `.nvmrc` selecting Node 22 and `engines.node >=22.12.0`. This is a repository runtime requirement, not a global Node installation/configuration change.

## 2. Verification performed

| Check | Result |
| --- | --- |
| `npm test` | 4 tests passed |
| Same test files under Node 22 | 4 tests passed |
| Production Vite build into temporary output | Passed |
| Wrangler deployment dry-run under Node 22, using built temporary assets | Passed; `env.ASSETS` binding present |
| Local Cloudflare runtime | HTML, built JS asset, HEAD response, and six security headers passed |
| EmailJS release-byte integrity comparison | Matched configured SHA-384 |
| `npm audit --omit=dev` | 0 reported vulnerabilities |
| Full `npm audit` after updates | 3 high findings remain in development tooling |

The build was directed to temporary output to avoid committing regenerated tracked website assets. No live deployment, commit, or push was performed for this hardening pass. A dry run and local response checks do not prove live deployment or a browser end-to-end contact-form submission. No test message was sent to the company's EmailJS service.

### Reproduce checks

With Node 22.12+ active:

```sh
npm ci
npm test
npm run build
npm run deploy:preview
npm audit
npm audit --omit=dev
```

Use the committed lockfile rather than silently resolving a different toolchain. `npm run build` regenerates `.worker-dist`; some historical build outputs are still tracked, so review git status rather than accidentally committing generated files. Ignore rules do not untrack existing files.

After an authorised deployment, check `https://adplixmedia.in/` using an actual HTTP response and a browser. Verify fonts, navigation, video loading, EmailJS script loading, CSP violations, and a separately authorised contact-form submission. Do not promise a scanner grade as proof of application security.

## 3. Known gaps and operational actions

### Remaining audit findings

The baseline audit reported 8 affected packages (7 high, 1 moderate). After updates, 3 high findings remain along this development-tool chain:

`wrangler → miniflare → sharp`

The remaining advisory is against sharp's inherited librsvg dependency: `GHSA-wq5f-xc86-pv6w`, affected sharp versions below 0.35.5. npm reports each affected package in the chain; this is not evidence of three independent production application bugs.

The installed current Wrangler dependency chain does not yet provide a patched sharp. npm proposes a forced downgrade to Wrangler 4.15.2; that downgrade was not applied. No unverified cross-major override was added. Track the upstream fix and rerun the audit after upgrading. Avoid feeding untrusted images into affected local image-transformation tooling in the meantime.

Zero production dependency audit findings does not cover external CDN code, Cloudflare infrastructure, account configuration, or future portal dependencies.

### Runtime and deployment

The workstation default was Node 20.19.2. It can run the current tests/build but the updated Wrangler requires Node 22. Dry-run and local Worker checks were successfully run with a temporary Node 22 runner. Activate Node 22 for ordinary development/deployment and configure the connected Cloudflare build environment to use Node 22 before deploying this update. No global runtime or Cloudflare account setting was changed.

### Other limitations

- Inline style attributes remain permitted because the existing site relies on them. Script execution is not granted the same exception.
- HSTS `includeSubDomains` was already present. Verify HTTPS readiness for all subdomains; no preload submission was made.
- Frontend EmailJS identifiers are public integration identifiers, not server secrets. Enforce allowed origins and abuse controls in the EmailJS account; browser-only throttling cannot secure the service.
- Never put credentials or employee data in `assets/` or build outputs; these are publicly served. Inspect generated assets before release. Existing tracked OS metadata/build outputs were not silently removed in this pass.
- Rate limits, account protection, backup policy, and production edge rules require explicit account configuration and are not proven by repository headers.
- The original hardening pass did not implement the portal. A subsequent implementation added authentication, persistence, absence logic, analytics, and tests. These have not been validated in a production Cloudflare deployment; see DELIVERY.md.

## 4. Mandatory security requirements for the future portal

1. Closed Admin provisioning: first Admin is operator-created. Public Employee registration requests never issue a session; only an authenticated Admin can approve or reject. Enforce role server-side, rate-limit registration and bound pending requests. Confirm applicant identity/email externally until verification delivery exists.
2. Vetted password hashing and authentication implementation; temporary-password lifecycle; no readable password recovery. Personal portal passwords must never be personal mailbox passwords.
3. Secure expiring/revocable sessions, HttpOnly cookies, CSRF/origin protection, rate-limited login/reset, and stronger Admin protection such as MFA.
4. Per-object authorisation: employees can mutate only their own permitted task states, updates, profiles, and requests. Role/ownership checks apply to direct API calls, not just UI controls.
5. Transactional/idempotent task transitions and audited Admin rejection, absence decisions, credential resets, account deactivation, deadline changes, and exports.
6. Validated dates/times and server-owned timestamps; absence subtraction uses merged intervals and cannot be manipulated by device time.
7. Safe text rendering for notes, descriptions, reasons, and updates; validated link schemes; no unsanitised user-input `innerHTML`.
8. Private non-cacheable authenticated responses; no shared CDN caching of sessions, exports, or employee data. Authenticated API failures must not fall back to public HTML with a successful status.
9. Minimal personal-data exposure: read-only team task views cannot return colleagues' private emails, notes, absence reasons, or credentials.
10. Admin-only Excel export; treat text as text to prevent spreadsheet formula injection. Exclude credentials, reset tokens, and push subscriptions.
11. Private push-subscription handling, optional browser permission, generic lock-screen content, and subscription cleanup on account removal.
12. Deliberate route-specific CSP changes when enabling a same-origin portal service worker; today's `worker-src 'none'` intentionally blocks workers. Do not broadly relax public-site security for future functionality.
13. Secrets stored through deployment secret facilities, never committed examples or account exports; encrypted transport, database access restrictions, backup/restore testing, and an agreed retention policy.

See `SPECIFICATION.md` for the confirmed feature requirements, timing examples, proposed defaults, and acceptance tests.
