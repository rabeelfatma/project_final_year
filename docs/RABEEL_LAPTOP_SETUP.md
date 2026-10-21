# QuickCheck Hub — Rabeel Laptop Setup Guide

This guide helps you run QuickCheck Hub on a Windows laptop using either GitHub clone or a USB ZIP copy.

**Important:** Real academic upload files and production MongoDB data are **not** included in the USB package. You will create a fresh demo database for evaluation.

---

## 1. Required Windows tools

1. **Node.js** — use **20.19+** or **22.12+** (see root `package.json` `engines`).
2. **Git** (for Method A).
3. A code editor (optional).
4. MongoDB Atlas account **or** local MongoDB (for evaluation data).

Check versions:

```powershell
node -v
npm -v
```

---

## 2. Method A — GitHub clone (preferred if you are a collaborator)

```powershell
cd $HOME\Desktop
git clone https://github.com/xohaibhsn/project_final_year.git quickcheck-hub
cd quickcheck-hub
git checkout main
git pull
```

Use your authorized GitHub account. Do **not** modify `rabeelfatma/final_year_project` unless you intentionally maintain that original repo separately.

---

## 3. Method B — USB ZIP extraction

1. Copy `QuickCheck-Hub-Rabeel-Handover-2026-10-12.zip` to the laptop.
2. Extract to a short path, for example:

```powershell
Expand-Archive -Path "D:\QuickCheck-Hub-Rabeel-Handover-2026-10-12.zip" -DestinationPath "$HOME\Desktop\quickcheck-hub"
cd $HOME\Desktop\quickcheck-hub
```

The ZIP does **not** include `node_modules`, `.env`, `.git`, or real student uploads. That is intentional.

---

## 4. Install dependencies

From the project root (where the root `package.json` lives):

```powershell
npm install
```

This installs backend and frontend packages via the root `postinstall` script.

If you prefer explicit installs:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
```

Do **not** copy `node_modules` from another PC.

---

## 5. Configure environment files

1. Copy examples (never commit real secrets):

```powershell
Copy-Item backend\.env.example backend\.env
# If a root .env.example exists, copy it too for local notes only.
```

2. Edit `backend\.env` and set at least:

| Variable | Purpose |
|----------|---------|
| `APP_RUNTIME_MODE=full` | Local full app. `npm start` stays maintenance until this is set. The Vercel API project must set `full`. |
| `MONGO_URI` | Your Atlas/local URI including database name |
| `JWT_SECRET` | Long random secret (generate a new one) |
| `GEMINI_API_KEY` | Only if AI grading is required |
| `GEMINI_MODEL` | Confirm against Google AI Studio model list |
| `RESEND_API_KEY` / `PASSWORD_RESET_FROM_EMAIL` / `PUBLIC_APP_URL` | Only if password recovery email is required |
| `UPLOADS_DIR` | Optional absolute folder for durable uploads |

Never paste production secrets into chat or screenshots.

---

## 6. MongoDB (two valid paths)

**PATH A — Professor configures Atlas demo DB**  
Ask for the `MONGO_URI` for database `quickcheck_hub_demo` (or the URI Professor provides).

**PATH B — You create Atlas/local yourself**

1. Create a cluster.
2. Create database user + network access.
3. Create / use database name `quickcheck_hub_demo` for evaluation.
4. Put the full URI into `backend\.env` as `MONGO_URI`.

Do not merge old historical data into the demo DB without explicit approval.

---

## 7. First Admin (offline CLI — required once)

The app does **not** auto-create admins and public signup is disabled.

Dry-run (safe):

```powershell
cd backend
node scripts/provisionFirstAdmin.js --dry-run --name "Rabeel Ramzan" --email "YOUR_REAL_EMAIL@example.com"
```

Execute only after `MONGO_URI` points at the intended database:

```powershell
$env:MONGO_URI = "mongodb+srv://USER:PASS@CLUSTER/quickcheck_hub_demo"
node scripts/provisionFirstAdmin.js --execute --name "Rabeel Ramzan" --email "YOUR_REAL_EMAIL@example.com"
```

Enter the password at the hidden prompt. Do not pass `--password` on the command line.

---

## 8. Optional demo teachers/students/assignments

Dry-run only first:

```powershell
cd backend
node scripts/seedDemoData.js --dry-run --admin-email "YOUR_REAL_EMAIL@example.com" --confirm DEMO_SEED_OK
```

Execute later only against `quickcheck_hub_demo`:

```powershell
$env:MONGO_URI = "mongodb+srv://USER:PASS@CLUSTER/quickcheck_hub_demo"
node scripts/seedDemoData.js --execute --admin-email "YOUR_REAL_EMAIL@example.com" --confirm DEMO_SEED_OK
```

This creates fictional `*.demo.quickcheck.local` teachers/students and sample assignments. It never drops collections and never uses the original 87 academic upload files.

---

## 9. Run locally

**Development (recommended for laptop testing):**

```powershell
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

**Production-like local build:**

```powershell
npm run build
$env:APP_RUNTIME_MODE = "full"
npm start
```

Default local `npm start` without `full` stays in **maintenance** mode on purpose. The Vercel API project sets `APP_RUNTIME_MODE=full` in its own environment.

Optional public **preview** page only (no APIs/DB):

```powershell
$env:APP_RUNTIME_MODE = "preview"
npm start
```

---

## 10. Smoke-test the academic flow

1. Log in as Admin → create Teacher/Student if not using the demo seeder.
2. Teacher login → create assignment (attach a small test PDF/TXT you create yourself).
3. Student login → submit a file before the deadline.
4. Teacher → grade manually and **publish** results.
5. Student → confirm marks appear only after publish.
6. Optional: plagiarism check / Gemini grading if keys are configured.

---

## 11. Troubleshooting

| Problem | What to check |
|---------|----------------|
| MongoDB connection failure | URI, DB user password, Atlas IP allowlist, database name in URI |
| Invalid login | Account exists, password correct, `isAllowedLogin`, tokenVersion after password reset |
| CORS / API routing | Local API is `http://<page-hostname>:5000/api`. Production frontend calls `https://quickcheck-hub-backend.vercel.app/api`. |
| Missing uploaded files | Local files live under `backend/uploads` or `UPLOADS_DIR`. Vercel durable files use R2. |
| Gemini error | `GEMINI_API_KEY`, verify `GEMINI_MODEL` in Google AI Studio |
| Resend / forgot password | Server-only Resend vars; without them recovery fails closed |
| Port in use | Change `PORT` or stop the other process |
| Env not loaded | Confirm `backend/.env` path; restart the Node process |
| Node version mismatch | Install Node 20.19+ or 22.12+ |

---

## 12. Laptop vs Vercel

| | Laptop local | Vercel |
|--|--------------|--------|
| Purpose | Development / evaluation demo | Frontend and API deployment |
| Frontend | `npm run dev` at `http://localhost:5173` | https://quick-check-hub-frontend.vercel.app |
| API | `http://localhost:5000/api` | https://quickcheck-hub-backend.vercel.app/api |
| Default mode | `full` via `npm run dev` | API project must set `APP_RUNTIME_MODE=full` |
| Uploads | Local disk / optional `UPLOADS_DIR` | Private R2 bucket |
| Secrets | Your local `.env` | Vercel project env (operator only) |

`duke.com.pk` / Hostinger is retired and is not a deployment target. Do not point `PUBLIC_APP_URL` or `CLIENT_ORIGIN` at it.
