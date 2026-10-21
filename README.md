# QuickCheck Hub

QuickCheck Hub is a React + Node/Express + MongoDB academic assignment checking platform.

## Project structure

- `frontend/` — React + Vite frontend
- `backend/` — Node.js + Express + MongoDB API server
- `docs/` — project documentation and diagrams

## Backend setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Add your MongoDB connection string, JWT secret, and Gemini API key.
3. Keep `GEMINI_MODEL=gemini-3.8-flash` or set another model available to your Google AI Studio project.
4. Run `npm install` inside `backend/`.
5. Start with `npm start`.

## Frontend setup

1. Copy `frontend/.env.example` to `frontend/.env` if the API is not running at the default URL.
2. Run `npm install` inside `frontend/`.
3. Start with `npm run dev`.

## Updated features

- AI assistant model fallback updated from the retired `gemini-2.5-flash` value to `gemini-3.8-flash`.
- AI grading exposes AI score and feedback to students.
- Added a dedicated **Checked Results** section for students.
- Teacher evaluation sends result notifications to students.
- Messages now support edit/delete for text messages and voice playback through authenticated file loading.
- AI Assistant and Messages are available from the sidebar on admin, teacher, and student dashboards.
- AI and message panels have visible close buttons.
- Theme/accent variables are used by dashboard charts and shared UI colors.
- Removed the admin maintenance/system-control settings tab; only the shared sidebar Settings remains.
- Added Back to Admin Dashboard buttons on Add Student and Add Teacher pages.

## Deployment

QuickCheck Hub deploys as two Vercel projects:

| Project | URL | Root directory |
| --- | --- | --- |
| Frontend | https://quick-check-hub-frontend.vercel.app | `frontend` |
| API | https://quickcheck-hub-backend.vercel.app | `backend` |

The production frontend calls `https://quickcheck-hub-backend.vercel.app/api`. Local `npm run dev` still uses `http://<page-hostname>:5000/api`. Same-Wi-Fi phone testing stays opt-in via `npm run dev:lan`.

The frontend `vercel.json` rewrites client routes to `index.html`. It does not proxy `/api`. Email links and browser CORS use `https://quick-check-hub-frontend.vercel.app`. `duke.com.pk` is a retired host and is not a deployment target.

## Project backlog

**Recommended next step:** Review this uncommitted Vercel compatibility diff and authorize a commit. Push and Vercel redeploy stay separate and are not authorized by this change.

### DONE (Vercel-only API, CORS, and email origins — local code, 2026-10-21)
- Root causes: production API base fell through to same-origin `/api`, which the frontend SPA rewrite serves as `index.html`; production CORS reflected every origin when `CLIENT_ORIGIN` was unset; email links had no Vercel frontend default and deployment docs still named Hostinger `duke.com.pk`.
- Fix: production API base is `https://quickcheck-hub-backend.vercel.app/api` (DEV laptop and LAN behavior kept; loopback, private LAN, and relative `/api` are not used for a production build). CORS allows the exact origin `https://quick-check-hub-frontend.vercel.app` and rejects other production origins. Production email links use that frontend origin when no public URL is configured, and fail closed for loopback, private LAN, non-HTTPS, the backend API host, and `duke.com.pk` / `www.duke.com.pk`.
- Verification: `node --test` on the API-base, CORS/preflight, email URL, auth regression, and Vercel compatibility files — **126 pass / 0 fail**. Frontend `npm run build` — **PASS**. The production bundle contains `https://quickcheck-hub-backend.vercel.app/api` once and does not contain `http://localhost:5000` or a `192.168.` address. Live Vercel traffic is **NOT TESTED**.
- Commit/push/deploy — **NOT AUTHORIZED**.

### DONE (email verification URL / LAN / CORS — local code, 2026-10-18)
- Root causes at that time: DEV API base hardcoded to `localhost:5000` (phone could not reach laptop API); Vite localhost-only bind blocked LAN UI; production public URL rejected only loopback (not private LAN); Admin notify link fell back to `duke.com.pk` when origin missing.
- Fix from that pass: hostname-based DEV API URL; opt-in `npm run dev:lan` / `VITE_LAN=1`; production fail-closed on private-LAN `PUBLIC_APP_URL`; non-prod CORS allows private-LAN origins; Admin links use the configured origin only.
- The 2026-10-21 pass above replaces the Hostinger production assumption from this entry. Live email / deployed envs from that session were **NOT TESTED**.

### DONE (Vercel optional web-push disablement — 2026-10-18)
- Root causes at module load of `backend/config/push.js`: (1) invalid `VAPID_SUBJECT` (not `mailto:` / `https:`), and/or (2) invalid VAPID key material (e.g. Base64 with `=` → `Vapid public key must be a URL safe Base 64 (without "=")`). Either threw from `webpush.setVapidDetails` and crashed Vercel startup (`/` / `/favicon.ico` → 500).
- Fix: validate subject; wrap `setVapidDetails` in try/catch; set `vapidConfigured=false` and warn without echoing secrets. Missing Vercel keys still disable push (no `.vapid.json` write). No invented/fake keys.
- In-app notifications unchanged: MongoDB `Notification` docs, routes/controller CRUD, `DashboardTopBar` 10s polling, unread/mark-read/clear, assignment/submission/grade/message alerts. Browser/OS push remains optional and gated on `vapidConfigured`.
- Isolated suite: `backend/tests/vercelCompat.isolated.test.js` — **9 pass / 0 fail** at that time (mailto, https, invalid subject, invalid Base64 keys, missing keys, Mongo/uploads soft-fail). No production MongoDB; no real push sends.
- Committed on `ui/professional-blue-theme` @ `6a83ddc` (`fix(push): soft-fail invalid VAPID subject…`). Live Vercel behavior still needs post-deploy confirmation.

### DONE (email / auth / artifact-download security — 2026-10-18)
- Unified QuickCheck Hub design tokens, typography, and shared dashboard shell.
- Aligned Admin / Teacher / Student branding, nav items, cards, tables, and auth layouts.
- Replaced student “EduCore” brand with QuickCheck Hub.
- Matched Light/Dark dashboards to the shared modern blue scheme (`#1683F8` / `#0969DA` / `#60B5FF`) with near-black sidebars and theme-dependent surfaces.
- Shared email format validation + stronger password policy (min 8 + upper/lower/digit/special) on signup/reset/first-admin; login keeps a lighter check for legacy accounts.
- Resend-only transactional email path for signup verification, password reset, and Admin registration notify (no SMTP/Nodemailer fallback). Fail-closed `503 EMAIL_NOT_CONFIGURED` when Resend key or from-address is missing.
- AI chatbot artifact downloads restricted to generated `/api/ai/generated/...` paths (backend sanitize + frontend JWT attach gate). The fetch origin follows `getApiOrigin()`.
- Isolated email/auth/security suite exercised locally before that push (`authPassword`, `provisionFirstAdmin`, `qc18aEmailVerification`, `authSignupValidation`, `passwordReset`, `aiChatbotDownloadSecurity`, `demoSeed`) — all **mocked**; **not** live Resend delivery.

### ACTIVE
- Uncommitted Vercel compatibility diff on `ui/professional-blue-theme` (this working tree). Awaiting review before any commit.
- Local Resend credentials + one authorized laptop verification smoke (code path ready; live send not claimed).
- Optional same-Wi-Fi mobile: `npm run dev:lan`, phone opens `http://<laptop-lan-ip>:5173`, temporarily set `PUBLIC_APP_URL` to that LAN origin for email links; allow Windows Firewall for Node/Vite.

### BLOCKED
- **Live email delivery:** real `RESEND_API_KEY` + `PASSWORD_RESET_FROM_EMAIL` must be set by the operator in local `backend/.env` and, separately, on the Vercel API project. Until then signup/reset return `503 EMAIL_NOT_CONFIGURED`.
- **Live Vercel user acceptance:** this diff is not deployed. Dashboard secrets (`APP_RUNTIME_MODE`, `MONGO_URI`, `JWT_SECRET`, Resend, R2) were not changed.
- **Durable Vercel uploads:** still require the R2 variables already named in `backend/.env.example`.

### NEXT
1. Review this diff and authorize a commit. Do not push or redeploy until that is a separate instruction.

### FUTURE
- Visual QA pass in a running browser: toggle Light/Dark on Admin, Teacher, and Student dashboards and confirm charts, active nav, and CTAs all use the shared blue.
- Optional Vercel VAPID keys if browser push is desired (in-app bell works without them).
- Vercel preview URLs (`*-git-*.vercel.app`) are not allowlisted. Add an exact origin with `CLIENT_ORIGIN` only if preview deployments must call the API.

### MANUAL GROUP TESTING
- Laptop: signup verification + password-reset link from a real inbox after Resend is configured.
- Mobile LAN: open Vite via laptop private IP; confirm API calls hit laptop `:5000`; open a verification email whose link uses the LAN origin.
- Vercel Production, after an authorized deploy: open https://quick-check-hub-frontend.vercel.app, confirm API calls go to https://quickcheck-hub-backend.vercel.app/api, login preflight succeeds, and a verification email link uses the frontend origin.
- Browser Light/Dark visual QA across Admin, Teacher, and Student dashboards.
