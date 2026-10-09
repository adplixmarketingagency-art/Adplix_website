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
├── spec.md
├── vite.config.js
├── wrangler.toml
├── assets/
├── scripts/
├── src/
├── styles/
└── README.md
```

## Notes

This project follows a clean static-site structure for fast local preview and production deployment.

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

The portal has a working **local implementation**, not a live production launch. Requirements are in [projects/employee-portal/SPECIFICATION.md](projects/employee-portal/SPECIFICATION.md); local run and deployment instructions are in [projects/employee-portal/DELIVERY.md](projects/employee-portal/DELIVERY.md). This documentation folder must never contain employee passwords, account exports, or private configuration.

With Node 22 active, `npm run portal:build`, `npm run portal:migrate`, and `npm run portal:dev` serve the portal at http://127.0.0.1:8787/portal/. Provision a local Admin as described in the delivery guide. `npm run portal:test:e2e` verifies actual local Cloudflare D1 workflows with isolated synthetic accounts; install Chromium with `npx playwright install chromium` first. It never seeds the production database.
