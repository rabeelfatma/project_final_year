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

## Demo readiness

See **[docs/FYP_DEMO_READINESS.md](docs/FYP_DEMO_READINESS.md)** for the COMSATS FYP checklist (Admin `/admin` login, three-role Logout, academic workflow, safe email procedure, health checks).

Also useful: [docs/RABEEL_EVALUATION_DEMO.md](docs/RABEEL_EVALUATION_DEMO.md), [docs/RABEEL_LAPTOP_SETUP.md](docs/RABEEL_LAPTOP_SETUP.md).

## Project backlog (summary)

Production merge (Logout header): `8e9f1c3` on `main`. Intended Vercel projects only: `quick-check-hub-frontend` / `quickcheck-hub-backend`.

### DONE
- Server-owned email verification redirect (`GET /api/auth/verify-email` → FE `?status=` without raw token).
- Production API/CORS defaults for the Vercel frontend origin; fail-closed on loopback, private LAN, backend host, and retired `duke.com.pk` in production public URLs.
- Shared top-right Logout for Admin / Teacher / Student (QC-22 isolated contracts).
- Resend-only transactional email path; stronger signup/reset password policy; protected artifact/download path checks (mocked suites).

### ACTIVE
- Operator three-role Logout click-through on Production.
- Full Admin → Teacher → Student academic demo walkthrough.

### BLOCKED
- Preview Mongo isolation vs Production DB `quickcheck_rabeel_demo` — **UNVERIFIED**.
- Real inbox verify/reset until isolation + unused mailbox + cleanup approval.
- Changing Production `PASSWORD_RESET_FROM_EMAIL` (historically duke-associated) — needs separate approval.
- Orphan Vercel project `frontend` CI noise — do not modify that project in-repo.

### NEXT
1. Sign into Production as Admin (`/admin`), Teacher, and Student (`/login`); confirm top-right Logout and protected-route lockout.

### FUTURE
- Replace non-desired Resend From domain after a verified sender is ready.
- Confirm Preview `MONGO_URI` database name offline; optional Production `PUBLIC_API_URL`.
- Disconnect orphan `portfolio-dba5/frontend`; optional Preview CORS allowlist via exact `CLIENT_ORIGIN`.
- Durable Vercel uploads require R2 vars in `backend/.env.example` (names only).

### MANUAL GROUP TESTING
- Three-role Logout; academic assignment → submit → grade → publish → student view.
- Authorized email verify/reset smoke (never against Prod DB without cleanup SOP).
- Optional same-Wi-Fi: `npm run dev:lan` (see `frontend/.env.example`).
- FYP report, diagrams, screenshots, presentation, viva (outside automated sprint).
