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
