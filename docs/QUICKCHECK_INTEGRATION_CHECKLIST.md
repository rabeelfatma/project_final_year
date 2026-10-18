# QuickCheck Hub — Full Integration Readiness Checklist

Use this before any public/full unlock of duke.com.pk.

Legend: `[ ]` pending · `[x]` done locally in code · `[~]` partial / mock-only

---

## A. Database

- [ ] Atlas (or local) MongoDB reachable from the target runtime
- [ ] Database name agreed (`quickcheck_hub_demo` for evaluation)
- [ ] `MONGO_URI` set in Hostinger env / laptop `.env` (never committed)
- [ ] First Admin created via offline CLI (not public signup)
- [ ] Demo teachers/students seeded only if desired (`seedDemoData.js --execute`)
- [ ] Historical production DB kept separate (no silent merge)

## B. Auth & accounts

- [x] Password login with bcrypt
- [x] JWT + `tokenVersion` invalidation
- [x] Admin-only Teacher/Student creation
- [x] Public signup disabled
- [x] Offline first-admin provisioning (dry-run default)
- [ ] Real Admin email for Rabeel confirmed by humans
- [ ] Live password-reset email delivery (Resend) verified

## C. Academic files

- [x] Academic uploads not publicly static
- [x] Authenticated `/api/files/*` with role checks
- [x] Path traversal / uploads-root confinement
- [x] Configurable `UPLOADS_DIR`
- [ ] Durable Hostinger storage volume (if files must survive redeploy)
- [ ] Synthetic demo fixtures prepared (do not reuse original 87 files)

## D. Academic workflows

- [x] Teacher/student route role guards
- [x] Student marks hidden until `PUBLISHED`
- [x] Deadline checks on submit
- [x] Legacy evaluation ownership hardening
- [ ] Real E2E assignment → submit → grade → publish on live DB
- [ ] Gemini live model catalog verification (`GEMINI_MODEL`)
- [ ] Gemini live grading acceptance

## E. Supporting modules

- [x] Messaging sender cannot be forged (server sets sender)
- [x] Notifications recipient-scoped
- [x] Analytics student scores publish-gated
- [x] Plagiarism uses protected upload path resolver
- [ ] Live push notifications on target browsers
- [ ] Report figures accepted against real class data

## F. Hostinger / DNS / runtime

- [ ] duke.com.pk DNS/SSL confirmed healthy
- [ ] `/health` returns expected mode
- [ ] Hostinger env: `APP_RUNTIME_MODE`, `MONGO_URI`, `JWT_SECRET`, optional Gemini/Resend
- [ ] `trust proxy` already set for Hostinger hop (code)
- [ ] Deployed SHA matches intended GitHub SHA
- [ ] Node version strategy (panel currently 20.x; engines allow 20.19+/22.12+)
- [ ] Public unlock decision: keep `maintenance`, set `preview`, or approve `full`

## G. Security / ops

- [ ] Review `npm audit` findings on Hostinger build logs (do not blind `--force`)
- [ ] Secret scan of env panels / local `.env` hygiene
- [ ] Confirm no academic uploads committed to Git
- [ ] Backup plan for demo DB before evaluation day

## H. Explicit non-goals until approved

- Changing Hostinger DNS/SSL from automation
- Purchasing S3/R2
- Unlocking `APP_RUNTIME_MODE=full` without Mongo + secrets
- Using original student documents as demo data

## I. Separate Vercel deployment (frontend + backend API)

Code prep (local, Hostinger untouched):

- [x] Backend exports Express app without `listen` when `VERCEL=1`
- [x] `backend/vercel.json` routes all traffic to `server.js` (`@vercel/node`)
- [x] `frontend/vercel.json` SPA rewrites for client-side routing
- [x] Frontend `VITE_API_BASE_URL` supports separate API origin
- [x] MongoDB connection reuse + no `process.exit` on Vercel
- [x] VAPID via `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (no startup write on Vercel)
- [x] Invalid `VAPID_SUBJECT` no longer crashes module load (disable push + warn; mailto:/https: only)
- [x] Invalid VAPID key material (e.g. Base64 with `=`) soft-fails `setVapidDetails` — push disabled, app still boots; in-app Mongo notifications unchanged
- [x] CORS allowlist via `CLIENT_ORIGIN` / `FRONTEND_URL`
- [x] Body limit capped to ~4.5mb when `VERCEL=1`
- [x] Private Cloudflare R2 adapter (`backend/utils/objectStorage.js` + `storedFiles.js`)
- [x] Vercel uploads persist to R2; Hostinger/local keep disk multer behavior
- [x] Authenticated `/api/files/*`, grading, plagiarism, generated files resolve via adapter
- [ ] Create two Vercel projects (Root Directory `frontend` and `backend`) — operator
- [ ] Set backend env names listed in `backend/.env.example` (Vercel + R2 section)
- [ ] Set frontend build env `VITE_API_BASE_URL` to backend `/api` URL
- [ ] Atlas Network Access allows Vercel egress (or `0.0.0.0/0` for demo)
- [ ] Live smoke after deploy (auth, role isolation, file routes, R2 upload/download) — UNVERIFIED until then

### Upload storage (implemented locally; live R2 unverified)

- Bucket: private `quickcheck-hub-files` (no public access / no permanent public URLs)
- Mongo paths remain `uploads/<folder>/<file>` (no DB migration)
- Env names: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_NAME`, `R2_ENDPOINT` — never commit secrets
- When `VERCEL=1` and R2 env is incomplete, durable uploads return a clear 503
- Platform limit: Vercel Hobby ~4.5MB request body → multipart uploads capped ~4MB
- [x] Express error middleware maps `R2_NOT_CONFIGURED` → HTTP 503 (no secret leak)
- [x] Vercel multer: oversized uploads abort stream and settle Multer callback once
- [x] Ephemeral AI `/api/ai/chat` + `/evaluate-ai` uploads skip R2 assert (memory only)
- [x] Submission content + mounted evaluation paths return 503 when R2 required but missing
- [x] Generated AI download ownership (server-side `.owner.json` sidecar on generate; `downloadGenerated` enforces `req.user._id`; legacy/unowned → opaque 404; AIChat URLs not trusted)
