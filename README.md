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

### Subscription-enabled deployment

The API rollout is feature-gated and requires server configuration and verified immutable account IDs; see `audex-api`'s **Subscription rollout** instructions before enabling it.

For a subscription deployment set `VITE_BILLING_REQUIRED=true` and `VITE_ENTITLEMENT_PUBLIC_KEY` to the API's base64 DER SPKI public P-256 key, alongside `VITE_API_URL`. Never copy its private signing key or Paystack secret into this app. GitHub Pages builds read repository **Variables** `AUDEX_API_URL`, `AUDEX_BILLING_REQUIRED`, and `AUDEX_ENTITLEMENT_PUBLIC_KEY`. Rebuild after changing any of them. Required subscription builds refuse missing API/public-key configuration and cannot fall back to unrestricted local-only mode.

Signup appears only when the API enables public registration. Users verify ownership through a single-use email link before editing or checking out. A verified new account receives a 14-day trial (one active site, 100 MB photos, no card); Solo is R199/month or R1,990/year (3 sites, 1 GB), Professional R399/month or R3,990/year (15 sites, 5 GB). All core features are included; accounts are individual, with no shared workspaces. Prices are charged without VAT because Mr. H Digital is not VAT registered.

Settings shows signed access, usage, test-mode status, plan choices, Paystack-hosted checkout/card management, cancellation and access refresh. A checkout return requests server verification; the URL is never accepted as proof of payment. Paid subscriptions renew until cancelled; cancellation preserves verified paid access. Existing subscriptions must be cancelled and their paid period finished before choosing a different plan. Test checkout is labelled and must not be represented as a live purchase.

Signed entitlements are pinned to the configured public key and signed-in account. Offline editing is limited to seven days from the latest access refresh, never beyond trial/paid expiry. Local clock rollback is detected as a usability safeguard, not a tamper-proof offline security boundary; the server enforces real access independently. A disconnected client may retain its existing lease until expiry after a refund/revocation.

When access expires, drafts and queued writes are preserved; sync pulls existing history without attempting writes. Finalised audits retain PDF exports, and all audits/drafts have JSON metadata export. Settings can export downloaded account records; photo files are saved separately from each audit. Remote photos need to be cached for offline reports. JSON exports are not an automatic restore/import mechanism or a full image backup. Do not clear browser storage to resolve billing problems.

The two approved existing-account complimentary grants are bound and verified by the API, not inferred from signup emails or frontend code. Only the approved administrator slot exposes the audited grant controls. Limited-plan legacy photo uploads stay paused until the administrator reconciles real object sizes; no guessed zero-byte allowance is used.

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
- **Optional guided tours:** a first-visit welcome introduces sites, audits, reporting, sync and settings. Choose **Explore on my own** to dismiss it, or use **Help** in the header to replay the introduction or select a focused feature guide at any time. Tours never create or change audit records.

### Guided-tour preferences

Deploy `audex-api` migration V9 and `/api/me/tour` before releasing the web tour. Dismissal and completion are stored per signed-in user and cached per account on the device; offline choices retry on reconnection. Preference errors are shown with a retry action rather than blocking the workspace. Without an API, the preference is device-local. A new device waits for the account preference before showing the welcome. Existing users without a preference are also offered the introduction once. Automatic prompting waits until the Audit page is idle and no audit is open.

Help remains available even when preferences cannot sync. Tours use a keyboard-accessible modal with Escape to exit, progress, Back/Next controls and highlighted workspace areas. Tours switch pages only after the user starts a guide; finish unsaved site/profile edits first. Closing a tour returns to the page from which it was started. Audit drafts remain saved.

### Account administration

Signed-in users can find their account role under **Settings > Account administration**. Admins and the Owner can search the paginated registered-user directory and view administrative history. Admins can suspend/restore ordinary Auditors. Only the Owner can appoint/remove Admins or manage Admin suspensions. Self-modification and Owner modification are prohibited by the API, not just hidden in the interface.

Every change identifies the target user and requires a reason, an explicit confirmation checkbox and the acting administrator's current password. The password is cleared from form state on submission/cancellation and is never stored in local storage, account exports or administrative history. Directory responses do not include passwords, hashes, tokens or other users' audit records. Never enter secrets in reasons. Use HTTPS in production.

Deploy `audex-api` migration V10 first and bootstrap the single Owner with an independently verified existing account UUID using `AUDEX_BOOTSTRAP_OWNER_ID` as described in its README. Account roles do not grant paid access or existing billing-administrator permissions. No user is automatically elevated based on email or billing status.

Administration requires a working server connection; changes are not queued offline. Suspension and role changes revoke the target's server sessions/reset links but cannot remotely erase offline data or cancel subscriptions. Restored users must sign in again. Facility-specific checklists and standards are not changed in this release.

### Facility types, audit scope and standards

AudEx is independent software by Mr. H Digital for healthcare and senior living: facility operators, housekeeping managers, independent auditors and cleaning contractors. Access is not restricted to WPC employees. Product identity is separate from checklist provenance: existing WPC checklist/rule names, internal codes and published definitions remain unchanged, and operational subsets are not independently validated industry-wide standards. Confirm source-material permissions and professional suitability before wider adoption; do not claim regulatory certification.

New report profiles have no assumed person, title or employer. Settings accepts an optional organisation/business byline; this is report text, not a team membership or account role. Existing saved profile values are retained, but profiles without an organisation field no longer acquire an automatic WPC employer; users should enter their own affiliation. New audits copy these details. Existing stored audit author/role strings, snapshots and scores remain untouched; missing historical attribution is labelled "Auditor not recorded" / "Role not recorded" rather than assigned to a named person. Individual plans do not include shared team workspaces or cross-user reporting.

Use **Sites > Facility type** to classify a hospital, clinic, retirement village or other facility. Selecting a classified site or changing facility type before an audit now defaults to its shorter operational checklist. Confirm all areas/services present, choose a **Checklist / audit standard**, and open **Preview checklist** to see its requirements. Areas are selected per audit to account for facilities with services not implied by their type.

| Default operational checklist | Starting checks | Mandatory area |
| --- | ---: | --- |
| Clinic | 74 | Consulting rooms |
| Hospital | 116 | Patient wards |
| Retirement village | 81 | Residential rooms |

The form shows the live check count and reduction from the full 264-check baseline. Core safety checks and the mandatory primary-area module cannot be removed. Select every additional service present: kitchens, laundry, emergency care, isolation, wards, residential rooms, frail care, shared areas, baths/showers and sluice/bedpan decontamination. Each adds only its mapped checks; overlaps appear once. For example, a clinic with a kitchen has 83 checks. All services together contain 200 unique checks. **These are reduced operational housekeeping reviews, not independently reviewed or certified compliance standards.** The notice appears before starting, in the frozen audit context and in PDFs. The shorter scope omits detailed/repeated low-risk requirements as well as unselected services; excluded checks are not a pass or evidence of whole-facility compliance.

**The full WPC housekeeping baseline remains available (264 checks)** in the checklist selector, and remains the default for unspecified/other facilities. Area selections do not reduce that baseline. The separate hospital/clinic/retirement-village compliance standards remain drafts pending qualified review and cannot be selected. Follow organisational policy and use the full baseline where required; genuine N/A answers still require reasons.

The resolver includes mandatory core requirements and required modules plus selected optional area modules. Scoring, progress, N/A requirements and PDF findings use the audit's own checklist, not every item in the global catalogue. The template, purpose and facility/area context are copied into an immutable audit snapshot at creation; changing a site affects future selection defaults, not existing drafts or finalised records. Existing 264-check drafts are deliberately not shortened in place: start a new draft to use a reduced checklist.

Existing drafts and finalised audits without a snapshot keep the original full WPC baseline. Synced audits download the server's frozen snapshot. Reports include standard name/version, facility and area context and the template notice. Dashboard averages/training comparisons are restricted to one comparable template, scoring rule set and area scope at a time; the exported report identifies that group.

Deploy `audex-api` migration V11 before this frontend. `shared/facility-templates.json`, `shared/template.json` and rule sets must match the API. The server independently resolves the selected standard and rejects unpublished templates, forged/reduced snapshots and answers outside scope. Snapshot/version mismatches are surfaced as sync conflicts; the original local audit remains intact.

To publish a certified/approved facility-specific standard, obtain the approved applicability matrix, sources, core item list, mandatory and optional area modules, scoring review and approval details. Follow the API README's publication procedure and release a new immutable template version. Operational checklists have distinct codes and `purpose: "OPERATIONAL"`; they do not carry invented approver details. Always deploy the matching API catalogue before the frontend. This operational release needs no migration beyond V11.

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

Records and photo blobs live in separate IndexedDB databases per account ID. Signing out hides that account's records without deleting them; switching accounts never reuses another account's records. Without an API URL, records use a separate local-only database.

When `VITE_API_URL` is configured, the same account can sync across devices. Sync runs after sign-in, when connectivity returns, after local changes, and through **Sync now**. Sites and training sessions use paginated `GET /api/sites` and `GET /api/training-sessions` and revision-checked `PUT /api/{resource}/{id}`. Archiving a site or removing training sends an archive tombstone, not a destructive delete. Dirty local records are never replaced by pulls.

Finalized audits upload through `PUT /api/audits/{id}`; `GET /api/audits` and `GET /api/audits/{id}` discover their answers, N/A reasons and photo metadata on other devices. Finalized audits are read-only everywhere; unfinished drafts stay only on their original device. There is no inter-account sharing.

Exact upload request snapshots are persisted before sending, so retrying after a lost response reuses the original body and revision. Edits made while a request is in flight remain pending and use the acknowledged revision next. Conflicts (409), sign-in failures, missing photos, storage failures and connection errors remain visible with retry controls; a conflict is never force-overwritten. Check the other device before retrying conflicting edits.

Photos upload after their audit. Discovered remote photo metadata is marked uploaded, not queued as a new attachment. Images download on demand using bearer-authenticated `GET /api/photos/{photoId}`, then remain available offline in that account's cache. Open photos or export the audit report while online once to cache its images. Reports refuse to silently omit uncached photos. Sign-out/account changes stop in-flight responses from changing another account's data.

Older unscoped `audex.*.v1` records and the `audex-photos` database are left untouched and are not automatically assigned to anyone. The app offers an explicit **Confirm ownership and import** action. Use it only when every older record belongs to the current account. It copies photos and records into that account, queues their upload, and records the claim only after persistence succeeds. Original legacy data is retained as a recovery copy. Do not clear browser storage before checking migration and sync.

### Accounts

With the API configured, the app provides first-account setup, sign-in, password and email changes, sign-out, username recovery and password reset. Sessions support offline app use; signing out does not delete locally saved audits.

### Welcome and workspace setup

The branded launch overlay exits when a usable authentication screen, workspace or storage-error screen has rendered, rather than holding returning users behind a mandatory timer. A stalled JavaScript/storage launch exposes reload guidance after ten seconds; no recovery action clears saved records. Authentication screens share a responsive editorial layout, with reduced-motion and light/dark support.

Signed-out users see a welcome screen; account creation appears only when the API enables registration. Password-reset and email-verification links retain priority. Signed-in accounts with a verified signed entitlement indicating an unverified email see a dedicated inbox stage with resend, access refresh, password-confirmed email correction, sign-out and read-only exploration. Unknown access/network failures do not masquerade as unverified accounts; local-only and legacy deployments remain supported.

New workspaces offer a skippable checklist: confirm report details in Settings, add the first site through the normal Sites form, then start an audit. Setup preferences use `audex.setup.v1.{encodedAccountId}` on this device only, independently of entitlement and audit storage. Skipping preserves progress and exposes **Resume setup** on the Audit landing page. Existing downloaded audits default to compact setup rather than an expanded welcome. Progress is derived from actual records plus explicit profile confirmation; setup storage failures are visible and never erase audits or change access.

Returning users can continue their latest-created unfinished draft without a forced tour. A first-report card follows a new workspace's first finalised audit, and home-screen installation guidance appears only after a finalised audit exists. Installation is not a backup; sync and exports remain separate. Profile confirmation requires successful device persistence; account-update errors remain visible and can be retried by saving the profile again.

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

The dashboard uses the current account's local finalized audit summaries, sites and active training records, including downloaded records. An empty account stays empty; made-up data from `src/analytics/demo.ts` appears only through the explicit demo preview. Reports are generated in the browser with jsPDF and work offline once their photo images have been cached.

## Brand assets

Desktop layouts (900 px and wider) use a distinct teal navigation panel with labelled icons, an active-page marker and keyboard-focus indicators. Page headings distinguish the workspace from navigation. Mobile keeps the existing bottom navigation.

Workspace and authentication screens (including sign-in, first-account setup and password recovery) use `src/assets/workspace-light-background.webp` in light mode and `src/assets/workspace-dark-background.webp` in dark mode, optimized from the supplied artwork. The backgrounds follow explicit and system theme settings; content cards remain opaque for readability. Both images are included in the offline app cache.

The startup splash keeps its teal base with the dark artwork at 12% opacity behind the white logo, tagline and loading indicator. This splash stays teal in both themes and respects reduced-motion settings.

Settings > About shows the version from `package.json`, the short Git commit ID and the build date (UTC). Vite embeds these at build time, so offline installations show their own build details. GitHub Actions uses `GITHUB_SHA`; local builds use Git HEAD and append `-dirty` when there are uncommitted changes. Local builds require Git and a repository checkout. Update the package version when releasing a new version.

Settings > About credits Mr. H Digital using the supplied badge, optimized as WebP at `public/logo/mrh-digital-badge.webp`. The black background is removed so only the lime-green logo remains, with transparency for both themes.

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

- Draft audits are deliberately device-local; only finalized audits sync.
- Concurrent changes to the same site/training revision require reviewing the visible conflict; there is no force-overwrite action.
- Device storage is browser-managed, not a backup. Keep successful server syncs and report copies; clearing browser data removes unsent records and cached photos.
- Validate the Spring controllers, SQL and photo-storage integration against a real database and bucket before relying on them in production.

The web workflow runs `npm test` and `npm run build`. The server-side integration still needs its own end-to-end validation in the target hosting environment.

---

### Developed by Mr. H Digital

![Mr. H Digital — Digital Solutions for Growing Businesses](public/logo/mrh-digital-logo-transparent.png)
