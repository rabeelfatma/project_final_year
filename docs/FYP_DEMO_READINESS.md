# QuickCheck Hub — FYP Demo Readiness Checklist

Evidence labels: `CODE COMPLETE` · `MOCK TESTED` · `ISOLATED INTEGRATION VERIFIED` · `LIVE VERIFIED` · `NOT TESTED` · `BLOCKED` · `UNVERIFIED`.

**Do not claim live success without matching evidence.** Production DB `quickcheck_rabeel_demo` must not be used for seeds, cleanup, or automated writes.

---

## Production hosts (intended only)

| Role | URL |
|------|-----|
| Frontend | https://quick-check-hub-frontend.vercel.app |
| Backend API | https://quickcheck-hub-backend.vercel.app/api |
| Admin login | https://quick-check-hub-frontend.vercel.app/admin |
| Teacher/Student login | https://quick-check-hub-frontend.vercel.app/login |

Do not use `duke.com.pk`, Hostinger, or the unrelated Vercel project `portfolio-dba5/frontend`.

---

## Local startup (after confirming this repo)

```bash
# Backend — port 5000 (see backend/.env.example PORT)
cd backend
cp .env.example .env   # placeholders only; fill locally, never commit
npm install
npm run dev            # sets APP_RUNTIME_MODE=full via dev-start.js

# Frontend — Vite default http://localhost:5173
cd frontend
# Optional: copy .env.example → .env for API override
npm install
npm run dev            # DEV API defaults to http://<page-hostname>:5000/api
```

Health (local): `GET http://localhost:5000/api/health` and `/health` when the API is running.

Production API fallback baked into the frontend build: `https://quickcheck-hub-backend.vercel.app/api`.

---

## A. Three-role Logout (manual)

Logout is a **shared top-right header** control (`DashboardTopBar` + `DashboardLogoutButton`). Handlers clear `localStorage` and navigate to `/admin` (Admin) or `/login` (Teacher/Student).

| Role | Login URL | After login | Logout check |
|------|-----------|-------------|--------------|
| Admin | `/admin` | `/dashboard/admin` | Top-right **Logout** → `/admin`; reopen dashboard requires auth |
| Teacher | `/login` | `/dashboard/teacher` | Same button → `/login`; protected route blocked |
| Student | `/login` | `/dashboard/student` | Same button → `/login`; protected route blocked |

QC-22 isolated UI contracts: `MOCK TESTED`. Live click-through: **operator / MANUAL GROUP TESTING**.

---

## B. Academic workflow (manual)

1. Admin approves pending Teacher/Student (verify ≠ approve).
2. Teacher creates/publishes assignment.
3. Student submits text/file (synthetic only for demo).
4. Teacher runs AI grade **or** manual grade (prefer manual if Gemini unavailable).
5. Teacher **publishes** results (separate from AI run).
6. Student sees marks only after publish; other students cannot open the file.
7. Optional: peer Jaccard similarity — **peer submissions on the same assignment**, not web-wide plagiarism.

Full live walkthrough: **MANUAL GROUP TESTING** / `NOT TESTED` until performed with authorized accounts.

---

## C. Safe email verification / password-reset (manual only)

**Do not run this until:**

1. Preview vs Production Mongo isolation is confirmed offline (`UNVERIFIED` until then).
2. An **unused mailbox** is available and cleanup/deletion of the test user is authorized.
3. You accept that Production sender may still show the configured Resend From address (historically associated with `duke.com.pk` — **do not change env without separate approval**).

### Distinguish environments

| | Production | Preview |
|--|------------|---------|
| Frontend host | `quick-check-hub-frontend.vercel.app` | `*-git-*.vercel.app` (not allowlisted for CORS by default) |
| API host | `quickcheck-hub-backend.vercel.app` | Deployment-specific unless `PUBLIC_API_URL` set |
| DB | Intended: `quickcheck_rabeel_demo` | Separate `MONGO_URI` entry **does not prove** a different DB name |

### Procedure (once approved)

1. Prefer **Preview** only after isolation is proven; otherwise use Production with an unused mailbox and cleanup SOP.
2. Register Teacher or Student once (public signup never creates Admin).
3. Open the verification link from the inbox — link must hit **`GET /api/auth/verify-email?token=…`** then redirect to FE `/verify-email?status=…` **without** the raw token in the Location URL.
4. Confirm account is verified but still **pending approval** until Admin approves.
5. For reset: request once; wait; do not spam Resend (rate limits). Confirm link uses the allowlisted frontend origin, not localhost/LAN/`duke.com.pk`.
6. Clean up the test user only with explicit authorization.

### Resend notes

- Server-only: `RESEND_API_KEY`, `PASSWORD_RESET_FROM_EMAIL`.
- Do **not** assume `onboarding@resend.dev` delivers to arbitrary recipients (`UNVERIFIED` / provider-restricted).
- No automated test in this repo sends real mail.

---

## D. Uploads / downloads

- Local disk under `backend/uploads` when R2 unset: fine for laptop demos.
- On Vercel, local disk is **ephemeral** — durable files need R2 env vars (`backend/.env.example`). Persistence on Production: **UNVERIFIED** without an authorized upload smoke test.
- Downloads must stay behind authenticated `/api/files` (or equivalent) with ownership/role checks: `CODE COMPLETE` / `MOCK TESTED`.

---

## E. AI / similarity

- Gemini calls are server-side; do not burn quota during dry runs.
- Teacher review/publication remains a separate step from AI grading.
- Peer Jaccard ≠ Turnitin / web plagiarism.

---

## F. Pre-demo smoke (read-only)

```text
GET https://quickcheck-hub-backend.vercel.app/api/health
GET https://quickcheck-hub-backend.vercel.app/health
GET https://quick-check-hub-frontend.vercel.app/
GET https://quick-check-hub-frontend.vercel.app/login
GET https://quick-check-hub-frontend.vercel.app/admin
```

Invalid verify token (non-secret): expect `302` → `/verify-email?status=invalid` with **no** raw token in `Location`.

---

## Honest blockers (do not paper over)

| Item | Status |
|------|--------|
| Preview Mongo ≠ `quickcheck_rabeel_demo` | `UNVERIFIED` |
| Real inbox verify/reset | `BLOCKED` until isolation + mailbox + cleanup approval |
| Production From-address / duke domain | Leave env unchanged until approved |
| Teacher/Student live Logout clicks | `NOT TESTED` (manual) |
| Live Gemini on Production | `NOT TESTED` unless operator validates |
| Phone / LAN access | Optional `npm run dev:lan`; `NOT TESTED` by default |
| Atlas network/permissions review | Operator / `UNVERIFIED` |
| FYP report, diagrams, slides, viva | Outside this repo sprint |
