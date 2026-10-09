# Adplix Media

Adplix Media is a portfolio-style marketing website built with Vite and designed as a bold, editorial landing page. The project showcases agency-style services, featured work, and a strong visual identity inspired by premium creative studios.

## Live site

https://adplixmedia.in

## Stack

- Vite
- React 19, Motion, and Lucide for the public marketing website
- Vanilla JavaScript for the separate Employee Portal
- CSS
- Cloudflare Wrangler deployment setup

## Local development

Use Node.js 22.12 or newer (Node 22 LTS is selected in `.nvmrc`). The updated Cloudflare Wrangler requires Node 22; older Node versions may build the site but cannot run the deployment tooling.

```bash
nvm use
npm ci
npm run dev
```

`npm run dev` starts only the website frontend. The Employee Portal also needs the local Wrangler API on port 8787; without it, the preview reports `Portal API unavailable.`

For a fresh startup of both services with an already-initialized local portal database:

```bash
nvm use
npm run portal:build
npm run dev:all
```

Use the [portal delivery guide](projects/employee-portal/DELIVERY.md) for first-time database/Admin setup. Do not reset or re-bootstrap an existing database to resolve a stopped API server.

The dev and preview servers bind to loopback only. Do not expose them publicly or override their host/CORS restrictions for production use.

## Production build

```bash
npm run build
```

## Deployment

```bash
npm run deploy
```

## Project structure

```text
.
├── index.html
├── package.json
├── eslint.config.mjs
├── .prettierrc.json
├── vite.config.js
├── wrangler.toml
├── .github/workflows/quality.yml
├── archive/             # preserved originals and retired marketing code
├── assets/
├── migrations/          # D1 schema
├── portal/              # employee portal UI
├── projects/employee-portal/  # specifications and operator docs
├── scripts/
├── src/                 # marketing UI and portal Worker API
├── tests/
└── README.md
```

## Notes

Generated builds (`.worker-dist/`, `.portal-dist/`, `dist/`), logs, local D1 data and browser screenshots are ignored, not source files. Original media and retired code are preserved in `archive/`, never included in the deployment. Do not delete or commit `.portal-local/` or private agent/runtime folders during cleanup.

## Code quality and release gate

```bash
npm ci
npm run lint
npm run format:check
npm test
npm run marketing:test:e2e
npm run portal:test:e2e
npm audit
```

`npm run quality` runs lint (zero warnings), formatting, unit/integration tests, and both browser suites sequentially. Both E2E commands rebuild the correct assets first; do not run a build while a browser suite is reading that output. Test screenshots are written to `.portal-local/previews/`. `npm run format` applies the shared source-code style. GitHub Actions runs the same gate on pushes and pull requests without production credentials.

This is ESLint/TypeScript-syntax linting, not a claim of whole-project static type coverage. Do not suppress failing rules or tests to ship a release.

## Security checks

```bash
npm test
npm audit
npm audit --omit=dev
npm run deploy:preview
```

`npm run deploy:preview` is a packaging dry run, not a production deployment. Keep `src/security-headers.mjs` and `assets/_headers` synchronised; the tests check parity for Worker and assets-first delivery. EmailJS is pinned with subresource integrity, so changing its version requires reviewing the URL, integrity hash, CSP, and tests together.

Current hardening, known audit gaps, and deployment requirements: [Security notes](projects/employee-portal/SECURITY.md).

## Marketing website checks

```bash
npm run build
npm run marketing:test:e2e
```

The Chromium check verifies the production marketing build at desktop, mobile, tablet, and landscape sizes. It covers the requested visual edits, project media, forms, keyboard navigation, reduced motion, accessibility, and links to the separate `/portal/` entry. External requests are blocked and form input is synthetic; no enquiries or subscriptions are sent. Install Chromium with `npx playwright install chromium` if it is not already available.

The source marketing UI lives in `src/App.jsx`, `src/components/`, and `src/sections/`. It shares the Vite build with the portal but does not import portal UI or API modules. The contact form prepares an email draft only, and the newsletter has no connected subscription service.

## Employee portal project

The portal Worker and D1 schema have been deployed and the first Admin is provisioned. The Cloudflare Free adaptation moves expensive password work into an internal SQLite-backed Durable Object (`PORTAL_PASSWORDS`), preserving existing hashes and account data. Deploy its binding/migration alongside the Worker and verify authentication; static checks alone do not exercise hashing. No paid-plan change, password weakening or database reset is needed by this design. Requirements are in [projects/employee-portal/SPECIFICATION.md](projects/employee-portal/SPECIFICATION.md); operator instructions and current readiness are in [projects/employee-portal/DELIVERY.md](projects/employee-portal/DELIVERY.md). Never put passwords, account exports, or private configuration in the repository.

With Node 22 active, `npm run portal:build`, `npm run portal:migrate`, and `npm run portal:dev` serve the portal at http://127.0.0.1:8787/portal/. Provision a local Admin as described in the delivery guide. `npm run portal:test:e2e` verifies actual local Cloudflare D1 workflows with isolated synthetic accounts; install Chromium with `npx playwright install chromium` first. It never seeds the production database.

For first production Admin setup, run `npm run portal:admin:setup` **in a private interactive terminal**. Enter the Admin details and a temporary password of at least 12 characters; password entry is hidden. The command creates owner-only, ignored `.portal-local/admin-bootstrap.sql` and prints the exact remote application command. Verify that command changes exactly one row. The guarded SQL refuses to replace existing accounts, and the first login requires a password change. Existing bootstrap files are not overwritten; keep any real credentials/private SQL out of Git and reports.

After `npm run deploy`, run `npm run deploy:verify -- https://adplixmedia.in` to verify exact entry-bundle hashes, security headers, portal routing and unauthenticated API denial. This read-only check does **not** verify a real account login. Complete first sign-in directly at https://adplixmedia.in/portal/ after provisioning.
