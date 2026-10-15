# audex-web

The AudEx web app: a mobile-first, offline-capable PWA (React + TypeScript + Vite) for housekeeping audits at WPC Health Care Division.
The server lives in a separate private repository, **audex-api**.

```
src/       the app (scoring twin of the server engine, audits, sites, photos, dashboard, PDF report, sign-in)
public/    icons, logos, splash screens, manifest
shared/    template.json, rulesets.json, scoring-fixtures.json  <- COPY, see below
brand/     logo artwork (source/) and generated exports
tools/     build_brand_assets.py
```

## Run
```
npm install
npm test
npm run dev                 # without VITE_API_URL the app runs on the phone only, with no sign-in
```
Copy `.env.example` to `.env` and set `VITE_API_URL` to talk to a server (sign-in switches on automatically).

## The shared/ folder is a copy
`audex-api` has the identical `shared/` folder. If the checklist or scoring rules change, change **both** copies. The tests in each
repository run the same `scoring-fixtures.json`, so a copy that drifts makes tests fail.

## Scoring rule sets
| Code | Status | What it does |
| --- | --- | --- |
| `WPC_V1` | **Active (default)** | The current WPC sheet: 95% / 85% thresholds, Critical Non-Compliant override |
| `WPC_V2_PROPOSED` | Pending IPC approval | V1 plus four caps (see the proposal doc): Critical Partial, 3+ Major failures, high-risk section under 85%, N/A over 10% flags review |

Switch the default in `src/scoring/catalog.ts` (`activeRuleSetCode`). Every audit stores the rule set it was
scored under, so past results and trends are never silently re-scored. Thresholds are integer tenths of a percent and
points are half-points, so every comparison is exact in both Java and TypeScript.

## Brand
The logo artwork in `brand/source/` is the single source. `python3 tools/build_brand_assets.py` derives everything from it:
favicon, home-screen icons (standard, maskable and Apple), the white and teal lockups, the unframed A mark, one-colour
marks, `manifest.webmanifest` and the colour variables in `src/brand.css` (teal `#0b4d60`, amber `#f29934`,
both sampled from the artwork).

| Where | Asset |
| --- | --- |
| Browser tab, bookmarks | `favicon.ico`, `favicon-32.png` |
| Android home screen / install | `icons/icon-*.png`, `icons/maskable-*.png` via the manifest |
| iPhone home screen | `apple-touch-icon.png` (full-bleed; iOS rounds it) |
| App header (teal bar) | `logo/audex-lockup-white.png` |
| Cold-start splash, empty states | `logo/audex-mark.png` |
| PDF report header, light pages | `logo/audex-lockup.png` |
| Print / one-colour use | `logo/audex-mark-mono-dark.png`, `logo/audex-mark-mono-white.png` |

The artwork is raster (PNG). Ask Copilot for an SVG version if you want perfectly sharp logos at any size.

## Dashboard and PDF report

- `src/analytics/` - `computeAnalytics()` is the single source for both the dashboard and the PDF, so the numbers agree. Periods: presets or a custom range; KPIs compare with the previous equal-length period; training effect compares the 90 days before and after each logged session (needs 2+ audits per side to count).
- `src/components/dashboard/` - filter row, hero figure, status split, trend chart (training markers), weakest sections, "Does training help?", recurring failures. Every chart has a Table view.
- `src/report/pdf.ts` - client-side jsPDF report (works offline), "Prepared by" taken from `src/config.ts`. Filename `AudEx-report_<from>_to_<to>.pdf`.
- **Demo data:** until audits are saved to the server, the dashboard runs on made-up sites from `analytics/demo.ts` (clearly labelled on screen and in the PDF). Replace `useDashboardData` with the real read.
- Backend migration `V2__training_sessions.sql` adds the `training_session` table.

## Saving, sync and training log

- Audits are saved on the device as you answer (resume from "Your audits"); "Finalise audit" needs every item answered and freezes the result under the audit's own rule set.
- Sites (with unit manager and housekeeping supervisor) and training sessions are also stored on the device.
- Sync: set `VITE_API_URL` (e.g. your Railway URL) when building the app. Finalised audits are sent with `PUT /api/audits/{id}` whenever the phone is online; the client-made id makes retries safe. Without `VITE_API_URL`, audits simply stay on the device.
- Server: `AuditSyncController` re-scores the answers itself and upserts site, audit and responses. Set `AUDEX_ALLOWED_ORIGINS` to the web app's address. **Not yet run:** Maven is blocked in the build environment, so test this against a real Postgres before relying on it.
- N/A answers need a written reason before an audit can be finalised; it is sent to the server and printed in the audit PDF.
- Photos: taken with the phone camera on failed/partial items (and one for the site as a whole), shrunk to about 200 KB, stored in IndexedDB, uploaded after their audit syncs to `PUT /api/audits/{id}/photos/{photoId}`, and shown in the audit PDF. The server keeps them in the Railway storage bucket: set `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` to match the bucket's variables (untested until the bucket exists).
- Not yet built: sites and training syncing to the server, login, pulling server data to a second device.

## Image sizes

- Photos: long edge 1600 px, WebP at quality 0.82 (steps down to 0.72 only if a photo is still over 400 KB), JPEG fallback where the browser cannot encode WebP. The PDF uses a small JPEG copy because jsPDF cannot embed WebP.
- Logos: `tools/build_brand_assets.py` also writes `audex-lockup-white.webp` (header) and `audex-mark.webp` (boot splash), sized at 3x their display size, with the PNG kept as a fallback. Install icons, the iOS icon, the favicon and the PDF logo stay PNG on purpose.

## Splash screen

- In-app: `index.html` shows a teal splash (white lockup, "Audit with confidence", sweeping amber line) until React mounts; `main.tsx` keeps it up for at least 0.8 s and fades it out.
- Android builds its launch screen from the manifest (teal `background_color` + icon). iPhone launch images for 12 screen sizes are generated into `public/splash/` and linked in `index.html` by `tools/build_brand_assets.py`. A new iPhone size needs one more row in that script's `SPLASH` list.

## Offline and ease of use

- A service worker (vite-plugin-pwa) caches the whole app on first visit, so it opens with no signal; tested by going offline, reloading, finishing an audit and downloading its PDF.
- The app asks the browser to keep stored audits safe (`storage.persist`) and suggests adding it to the home screen.
- Audit screen: progress ("42 of 264 answered"), per-section counts, "Next item to complete" button, large colour-and-icon answer buttons, "How to answer" help, a confirmation before finalising, and a confirmation before deleting a draft. The scoring-rules choice is tucked under "Advanced".

## Settings, profile and dark mode

- Gear icon in the header opens Settings: Appearance (Light, Dark, Match my phone), Your profile (name, job title, optional email and phone) and Account.
- The profile is stored on the phone and is printed as the author on every PDF; each audit keeps the name that was active when it was started, and the server stores it as the auditor. Default: Chernay Hildebrandt, Housekeeping Trainer.
- Sign-in and password management are not built; the Account section says so. They go in the same screen once login exists.
- Theme: colours are tokens in `styles.css` (light, dark, and a media query for "Match my phone"). The saved choice is applied by a small script in `index.html` before first paint, so there is no flash. PDFs are always light.

## Sign-in, sign-out, username recovery and password reset

Turns on automatically when the app is built with `VITE_API_URL`; without it the app opens straight in, as before.

**How it behaves for the auditor**
- First time only: a setup screen creates the account (needs the setup code, and only works while no account exists).
- Sign in with username and password (username is not case sensitive). Show/Hide on password boxes.
- Once signed in, the app opens instantly and works with no signal. The sign-in lasts 30 days of use (90 days at most).
- If the server ever ends the sign-in, the person lands on the sign-in screen with "Your audits are safe on this phone". Audits are never deleted by signing out.
- Settings > Account: change password, change email (asks for the password), Sign out (warns if audits have not uploaded), Sign out everywhere.
- Forgot username: enter email, get the username by email. Forgot password: enter username or email, get a link valid 30 minutes, usable once. Both screens give the same answer whether or not the account exists.

**Security design**
- Passwords: BCrypt (cost 12), 10 to 128 characters, no composition rules, rejects common passwords, repeated characters, and passwords containing the username or email name.
- Tokens: random 256-bit, only a SHA-256 hash is stored. Reset tokens are single-use; a new request cancels older ones; a reset signs out every device and sends a "your password was changed" email.
- Unknown usernames take the same time as wrong passwords. Failures are slowed: 5 per 15 min per username, 30 per 15 min per address; recovery requests 3 per hour; password confirmations 5 per 15 min.
- Every `/api` call except `/api/auth/**` needs `Authorization: Bearer <token>`. The audit's auditor is stamped from the signed-in account (`audit.created_by`).

**Server settings (Railway variables)**
| Variable | Purpose |
|---|---|
| `AUDEX_SETUP_CODE` | Required once, to create the first account. Remove it afterwards. |
| `AUDEX_APP_URL` | Address of the web app, used in the reset link (for example `https://audex.example.co.za`). |
| `AUDEX_ALLOWED_ORIGINS` | Same address, so the browser may call the API. |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD` | Outgoing email (SMTP). Without them, emails are written to the server log instead of sent, which means recovery will not work for real. |
| `AUDEX_MAIL_FROM` | The "from" address. |

The web host must serve `index.html` for `/reset-password` (single-page-app fallback). Vite preview does this; for Railway static hosting or Caddy/nginx, add the fallback rule.

**Testing status**: the browser flows (setup, sign-in, wrong password, offline open, forced sign-out, forgot username/password, reset link, reuse of a link, sign out everywhere) pass against a mock server (`tools` do not include it). The Java auth rules pass a javac harness (`tools/AuthHarness.java`). The Spring controllers and SQL could not be run where this was built (Maven Central unreachable), so run `mvn test` and one real sign-in against a database before relying on them.

## Hosting on GitHub Pages (free)

`.github/workflows/pages.yml` tests, builds and publishes the app whenever `main` changes. This repository is **public** so Pages is free.
Nothing secret belongs here: the server address is public anyway, and every password and key lives in the server's variables. Never commit a `.env` file.

One-time setup:
1. Push this folder as the repository `audex-web`.
2. **Settings > Pages > Source: GitHub Actions**.
3. **Settings > Secrets and variables > Actions > Variables**: add `AUDEX_API_URL` = your Railway API address (no trailing slash).
4. **Settings > Pages > Custom domain**: a sub-domain such as `audex.mrhdigital.co.za` (DNS `CNAME` to `<your-github-user>.github.io`), tick **Enforce HTTPS**.
5. On the server set `AUDEX_APP_URL` and `AUDEX_ALLOWED_ORIGINS` to that same `https://...` address.

Why a custom domain: the app expects to live at the root of its address; `user.github.io/audex-web/` would break icons, the offline cache and reset links.
The workflow copies `index.html` to `404.html` so password-reset links from email open the app.
