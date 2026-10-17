![AudEx logo](public/logo/audex-lockup.png)

# Audit with confidence.

A mobile-first, offline-capable audit app for housekeeping teams at WPC Health Care Division, built with React, TypeScript and Vite.

**Capture audits offline** · **Score consistently** · **See what is improving**

---

## At a glance

AudEx helps housekeeping teams complete structured site audits on a phone, review performance, and create shareable PDF reports. Audits are stored on the device as they are completed, so the app remains useful without a network connection. Connect the separate **`audex-api`** server to enable sign-in and synchronization.

> **Project status:** the web app is actively developed. Some server integrations and cross-device features are not yet available; see [Current limitations](#current-limitations) before deployment.

## Contents

- [Get started](#get-started)
- [What the app does](#what-the-app-does)
- [Project layout](#project-layout)
- [Scoring and shared data](#scoring-and-shared-data)
- [Data, sync and authentication](#data-sync-and-authentication)
- [Reports and analytics](#reports-and-analytics)
- [Brand assets](#brand-assets)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Current limitations](#current-limitations)

## Get started

### Requirements

- Node.js 22 (the GitHub Actions workflow uses Node.js 22)
- npm
- Python 3 and Pillow, only if rebuilding brand assets

### Run locally

```bash
npm ci
npm test
npm run dev
```

The app runs without an API connection. To connect it to a server, copy `.env.example` to `.env` and set `VITE_API_URL`:

```dotenv
VITE_API_URL=http://localhost:8080
```

Restart the dev server after changing environment variables. Keep real secrets out of frontend environment variables: values prefixed with `VITE_` are included in the browser build.

### Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the Vitest test suite |
| `npm run typecheck` | Check TypeScript types without emitting files |
| `npm run build` | Type-check and create a production build in `dist/` |

## What the app does

- **Phone-first audits:** answer checklist items, track progress, add notes and capture photos for failed or partial items.
- **Offline use:** keep drafts and audit data on the device, then resume audits without a connection.
- **Consistent scoring:** score against versioned rules and preserve the rule set used for each finalized audit.
- **Dashboard:** explore audit trends, status breakdowns, weaker sections and recurring failures, with table views for charts.
- **PDF reports:** create reports on-device, including audit details, profile information and photos.
- **Installable PWA:** cache the app for offline launch and add it to a device home screen.
- **Optional accounts and sync:** connect to `audex-api` for sign-in, account management and audit uploads.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | React app, audit and site storage, scoring, authentication, analytics and PDF reports |
| `public/` | PWA manifest, icons, logos and launch screens |
| `shared/` | Checklist template, scoring rules and shared scoring fixtures |
| `brand/source/` | Source artwork for the app's visual identity |
| `brand/exports/` | Generated brand assets |
| `tools/build_brand_assets.py` | Generate the app's icons, logos and splash images |
| `.github/workflows/pages.yml` | Test, build and deploy the app to GitHub Pages |

The backend is maintained separately in the private **`audex-api`** repository.

## Scoring and shared data

| Rule set | Status | Summary |
| --- | --- | --- |
| `WPC_V1` | Active default | WPC thresholds (95% / 85%) with a Critical Non-Compliant override |
| `WPC_V2_PROPOSED` | Proposed | Adds review caps for Critical Partial, 3+ Major failures, a high-risk section below 85%, and N/A above 10% |

The active default is selected in `src/scoring/catalog.ts`. Each audit keeps the rule set it was scored against, so changes to current rules do not silently alter historical results. Scores use integer tenths of a percent and half-point increments for exact comparisons.

The `shared/` directory is copied between this repository and `audex-api`. When the checklist, scoring rules or fixtures change, update both copies. Both repositories should run their tests against the same `scoring-fixtures.json` to catch drift.

## Data, sync and authentication

### Local data and synchronization

Audit drafts are saved on the device as the auditor works. Finalizing an audit requires all items to be answered and records its result under the selected rule set. Sites, training sessions, profile settings and photos are also stored locally; photos use IndexedDB.

When `VITE_API_URL` is configured, finalized audits are uploaded to `PUT /api/audits/{id}` when the device is online. Client-generated IDs make retries safe. Photos upload after their audit syncs to `PUT /api/audits/{id}/photos/{photoId}`. Without the API URL, audits remain on the device.

### Accounts

With the API configured, the app provides first-account setup, sign-in, password and email changes, sign-out, username recovery and password reset. Sessions support offline app use; signing out does not delete locally saved audits.

Password and recovery protections are enforced by the server. The documented design uses BCrypt password hashes, single-use reset tokens stored as hashes, generic recovery responses and rate limits. **Do not expose server credentials in this frontend repository.**

### Server configuration

Configure these variables in the server's hosting environment, not in the web app:

| Variable | Purpose |
| --- | --- |
| `AUDEX_SETUP_CODE` | One-time code for creating the first account; remove it after setup |
| `AUDEX_APP_URL` | Public web-app origin used in password-reset links |
| `AUDEX_ALLOWED_ORIGINS` | Origin allowed to call the API from a browser |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD` | SMTP configuration for account recovery emails |
| `AUDEX_MAIL_FROM` | Sender address for account emails |
| `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` | Object-storage configuration for uploaded photos |

Account recovery requires working email delivery. Photo storage requires a configured bucket. For reset links, the web host must route `/reset-password` to the app; Vite preview supports the single-page-app fallback.

## Reports and analytics

The dashboard and PDF report share `computeAnalytics()` in `src/analytics/`, keeping their calculations aligned. Date filters include presets and custom ranges; period KPIs compare against the previous period of equal length. Training effect compares audit results in the 90 days before and after a session, and needs at least two audits on each side.

Until server-backed audits are available to the dashboard, it uses clearly labelled demo data from `src/analytics/demo.ts`. Reports are generated in the browser with jsPDF and work offline.

## Brand assets

Desktop layouts (900 px and wider) use a distinct teal navigation panel with labelled icons, an active-page marker and keyboard-focus indicators. Page headings distinguish the workspace from navigation. Mobile keeps the existing bottom navigation.

Workspace screens use `src/assets/workspace-light-background.webp` in light mode and `src/assets/workspace-dark-background.webp` in dark mode, optimized from the supplied artwork. The backgrounds follow explicit and system theme settings. The separate sign-in background is unchanged; content cards remain opaque for readability. Both workspace images are included in the offline app cache.

Settings > About shows the version from `package.json`, the short Git commit ID and the build date (UTC). Vite embeds these at build time, so offline installations show their own build details. GitHub Actions uses `GITHUB_SHA`; local builds use Git HEAD and append `-dirty` when there are uncommitted changes. Local builds require Git and a repository checkout. Update the package version when releasing a new version.

Settings > About credits Mr. H Digital using the supplied badge, optimized as WebP at `public/logo/mrh-digital-badge.webp`.

The logo artwork in `brand/source/` is the source of truth. To regenerate the icons and logos:

```bash
python tools/build_brand_assets.py
```

The script updates the generated assets in `brand/exports/`, `public/` and the colour tokens in `src/brand.css`. It requires Python 3 and Pillow.

Photos are resized to a 1600 px long edge and encoded as WebP where supported, with a JPEG fallback. The PDF uses JPEG copies because jsPDF cannot embed WebP. PNG remains intentional for install icons, the Apple touch icon, favicons and the PDF logo.

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` runs tests and builds the site when changes are pushed to `main`, then deploys it to GitHub Pages.

1. Push the project to a **public** GitHub repository.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Variables**, add `AUDEX_API_URL` with `https://audex-api.mrhdigital.co.za` (no trailing slash).
4. In **Settings → Pages → Custom domain**, enter `audex.mrhdigital.co.za` and save. In your DNS provider, create a `CNAME` record for `audex` pointing to `mr-h-digital.github.io`. Enable **Enforce HTTPS** once DNS verification completes.
5. Configure the backend host to serve the API at `https://audex-api.mrhdigital.co.za`. Set `AUDEX_APP_URL` and `AUDEX_ALLOWED_ORIGINS` on the server to the frontend origin, `https://audex.mrhdigital.co.za`.

The repository's `public/CNAME` file preserves the custom domain in the published site. The workflow also copies `index.html` to `404.html` so emailed password-reset links can load the single-page app on GitHub Pages. The app expects to be served from the root of its origin; a project subpath can break icons, offline caching and reset links.

## Current limitations

- Sites and training sessions do not sync to the server.
- Server data is not pulled onto a second device; local audits remain on the device where they were created.
- The dashboard currently uses labelled demo data until connected to real server-backed audit data.
- Validate the Spring controllers, SQL and photo-storage integration against a real database and bucket before relying on them in production.

The web workflow runs `npm test` and `npm run build`. The server-side integration still needs its own end-to-end validation in the target hosting environment.

---

### Developed by Mr. H Digital

![Mr. H Digital — Digital Solutions for Growing Businesses](public/logo/mrh-digital-logo-transparent.png)
