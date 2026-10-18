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

## Project backlog

**Recommended next step:** On the local laptop, set real Resend trio values in `backend/.env` (names only in `.env.example`), keep `PUBLIC_APP_URL=http://localhost:5173` for laptop email links (or temporarily the laptop LAN origin for phone email tests), then run one authorized signup → verify → Admin notify smoke. Do not claim Hostinger/Vercel live until those deploys are tested separately.

### DONE (email verification URL / LAN / CORS — local code, 2026-10-18)
- Root causes: DEV API base hardcoded to `localhost:5000` (phone could not reach laptop API); Vite localhost-only bind blocked LAN UI; production public URL rejected only loopback (not private LAN); Admin notify link fell back to `duke.com.pk` when origin missing; Vercel SPA domain is not in the repo.
- Fix: hostname-based DEV API URL; opt-in `npm run dev:lan` / `VITE_LAN=1`; production fail-closed on private-LAN `PUBLIC_APP_URL`; non-prod CORS allows private-LAN origins without weakening production allowlists; Admin links use configured origin only.
- Isolated tests: Hostinger `https://duke.com.pk`, Vercel frontend placeholder, localhost + LAN links, production loopback/LAN rejection, reset-link + CORS — **PASS**. Frontend `npm run build` — **PASS**. Live email / deployed envs — **NOT TESTED**.
- Commit/push/deploy — **NOT AUTHORIZED** (local worktree only).

### DONE (Vercel optional web-push disablement — 2026-10-18)
- Root causes at module load of `backend/config/push.js`: (1) invalid `VAPID_SUBJECT` (not `mailto:` / `https:`), and/or (2) invalid VAPID key material (e.g. Base64 with `=` → `Vapid public key must be a URL safe Base 64 (without "=")`). Either threw from `webpush.setVapidDetails` and crashed Vercel startup (`/` / `/favicon.ico` → 500).
- Fix: validate subject; wrap `setVapidDetails` in try/catch; set `vapidConfigured=false` and warn without echoing secrets. Missing Vercel keys still disable push (no `.vapid.json` write). No invented/fake keys.
- In-app notifications unchanged: MongoDB `Notification` docs, routes/controller CRUD, `DashboardTopBar` 10s polling, unread/mark-read/clear, assignment/submission/grade/message alerts. Browser/OS push remains optional and gated on `vapidConfigured`.
- Isolated suite: `backend/tests/vercelCompat.isolated.test.js` — **9 pass / 0 fail** (mailto, https, invalid subject, invalid Base64 keys, missing keys, Mongo/uploads soft-fail). No production MongoDB; no real push sends.
- Committed on `ui/professional-blue-theme` @ `6a83ddc` (`fix(push): soft-fail invalid VAPID subject…`). Live Vercel behavior still needs post-deploy confirmation.

### DONE (email / auth / artifact-download security — 2026-10-18)
- Unified QuickCheck Hub design tokens, typography, and shared dashboard shell.
- Aligned Admin / Teacher / Student branding, nav items, cards, tables, and auth layouts.
- Replaced student “EduCore” brand with QuickCheck Hub.
- Matched Light/Dark dashboards to the shared modern blue scheme (`#1683F8` / `#0969DA` / `#60B5FF`) with near-black sidebars and theme-dependent surfaces.
- Shared email format validation + stronger password policy (min 8 + upper/lower/digit/special) on signup/reset/first-admin; login keeps a lighter check for legacy accounts.
- Resend-only transactional email path for signup verification, password reset, and Admin registration notify (no SMTP/Nodemailer fallback). Fail-closed `503 EMAIL_NOT_CONFIGURED` when the Resend trio is incomplete. `PUBLIC_APP_URL` falls back to `FRONTEND_URL` / first `CLIENT_ORIGIN`.
- AI chatbot artifact downloads restricted to same-origin `/api/ai/generated/...` paths (backend sanitize + frontend JWT attach gate).
- Hostinger production assumptions for `duke.com.pk` documented in `backend/.env.example` (names/comments only).
- Isolated email/auth/security suite exercised locally before push (`authPassword`, `provisionFirstAdmin`, `qc18aEmailVerification`, `authSignupValidation`, `passwordReset`, `aiChatbotDownloadSecurity`, `demoSeed`) — all **mocked**; **not** live Resend delivery.

### ACTIVE
- Local Resend credentials + one authorized laptop verification smoke (code path ready; live send not claimed).
- Optional same-Wi-Fi mobile: `npm run dev:lan`, phone opens `http://<laptop-lan-ip>:5173`, temporarily set `PUBLIC_APP_URL` to that LAN origin for email links; allow Windows Firewall for Node/Vite.

### BLOCKED
- **Live email delivery (local):** real `RESEND_API_KEY` + `PASSWORD_RESET_FROM_EMAIL` must be set by operator in `backend/.env` (never commit). Until then signup/reset correctly return `503 EMAIL_NOT_CONFIGURED`.
- **Vercel frontend public domain:** not present in repo/config evidence — operator must paste the real Vercel SPA HTTPS origin into backend `PUBLIC_APP_URL` + `CLIENT_ORIGIN`, and frontend build `VITE_API_BASE_URL` to the backend `/api` URL.
- **Hostinger / Vercel live verification:** not exercised from this session (code-tested only).

### NEXT
1. Operator configures local Resend trio; run laptop signup → email link → verify page → Admin notify.
2. If mobile LAN email testing is needed: `dev:lan` + temporary LAN `PUBLIC_APP_URL` (never commit the IP; restore localhost afterward).
3. For Vercel: set dashboard env from the real frontend/backend project URLs (do not invent).
4. For Hostinger: confirm `PUBLIC_APP_URL=https://duke.com.pk` (+ Resend trio) in Hostinger Node env, then live smoke.

### FUTURE
- Visual QA pass in a running browser: toggle Light/Dark on Admin, Teacher, and Student dashboards and confirm charts, active nav, and CTAs all use the shared blue.
- Optional Vercel VAPID keys if browser push is desired (in-app bell works without them).

### MANUAL GROUP TESTING
- Laptop: signup verification + password-reset link from a real inbox after Resend is configured.
- Mobile LAN: open Vite via laptop private IP; confirm API calls hit laptop `:5000`; open a verification email whose link uses the LAN origin.
- Hostinger `https://duke.com.pk`: live verification/reset after Hostinger env confirmed.
- Vercel SPA + API: live verification/reset after dashboard env set to the real frontend origin (not the API domain).
- Browser Light/Dark visual QA across Admin, Teacher, and Student dashboards.
