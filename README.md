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

**Recommended next step:** After Vercel picks up `ui/professional-blue-theme`, confirm backend `/` is non-500, set Resend trio + frontend `PUBLIC_APP_URL` in Vercel env if signup/reset email is needed, then run an authorized live smoke (not claimed from unit tests alone).

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

### BLOCKED
- **Live email delivery (local):** `backend/.env` may still have empty placeholders for `RESEND_API_KEY` and `PASSWORD_RESET_FROM_EMAIL`. Signup correctly fails closed until real Resend values are set. Secrets must never be committed.
- **Live Resend smoke test:** not run (no real sends claimed from this push).
- **Vercel deployment proof:** git push alone is not proof; confirm the preview/production deployment after Vercel builds.

### PENDING (pre-deploy email)
1. Operator pastes real local `RESEND_API_KEY` + verified `PASSWORD_RESET_FROM_EMAIL` into `backend/.env` (placeholders already present; `PUBLIC_APP_URL` already set to local Vite origin).
2. Authorized live smoke: signup → verify link → Admin notify → approve → login; plus password-reset link open from email.
3. For Vercel backend deploy: set the Resend trio with `PUBLIC_APP_URL` = actual Vercel **frontend** origin (not the API URL). Hostinger same-origin uses `PUBLIC_APP_URL=https://duke.com.pk`.
4. Frontend build: `VITE_API_BASE_URL` pointing at the backend `/api` base when frontend and API are on separate origins (see `frontend/.env.example`).

### PENDING (Vercel VAPID / push after code fix)
1. Optional: in the Vercel **backend** project env, set valid `VAPID_SUBJECT` (`mailto:` / `https:`) plus URL-safe Base64 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` if browser push is desired; otherwise omit/leave invalid and keep push disabled (in-app bell still works).
2. After deploy: confirm `/` and `/favicon.ico` return non-500; optional push smoke only when keys + subject are valid.

### FUTURE
- Visual QA pass in a running browser: toggle Light/Dark on Admin, Teacher, and Student dashboards and confirm charts, active nav, and CTAs all use the shared blue.

### MANUAL GROUP TESTING
- After Resend credentials are configured: authorized provider smoke test of verification link, password-reset link, and Admin new-registration email (mocked unit coverage exists; live delivery not claimed).
- Browser Light/Dark visual QA across Admin, Teacher, and Student dashboards.
- After Vercel deploy of push soft-fail: hit `/` and confirm no module-load 500; push subscribe only if intentionally enabled with valid VAPID env.
