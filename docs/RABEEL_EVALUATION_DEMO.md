# QuickCheck Hub — Evaluation Demo Script (10–15 minutes)

Use this sequence for university evaluation. Steps marked **UNVERIFIED** need a real MongoDB + configured secrets on the machine used for the demo.

**Do not claim live Gemini/Resend success unless those providers were configured and tested on that machine.**

---

## Before the demo (5 minutes)

1. Confirm Node app is running locally with `APP_RUNTIME_MODE=full`.
2. Confirm `MONGO_URI` points at the evaluation database (`quickcheck_hub_demo` recommended).
3. Confirm Admin account exists (offline first-admin CLI or already seeded).
4. Have one small synthetic PDF/TXT ready for submission (not from the original 87 academic uploads).
5. Optional: Gemini key for AI grading; otherwise demonstrate **manual grade + publish**.

---

## Demo sequence

### 1) Admin login — IMPLEMENTED / TESTED WITH MOCKS
- Open the app login page.
- Sign in as Admin (Rabeel).
- Open Admin dashboard.

### 2) User management — IMPLEMENTED / TESTED WITH MOCKS
- Add Teacher (or show demo Teacher 1 / Teacher 2 if seeded).
- Add Student (or show demo students).
- Confirm public signup is unavailable.
- Confirm Add Admin is only via authorized admin path (not public).

### 3) Teacher login — IMPLEMENTED / TESTED WITH MOCKS
- Log out Admin.
- Log in as Teacher 1.
- Open Teacher dashboard.

### 4) Create assignment — IMPLEMENTED / TESTED WITH MOCKS
- Create an assignment with title, dates, total marks.
- Attach a small instruction file if desired.
- Save and confirm it appears in the teacher list.

### 5) Student login + submit — IMPLEMENTED / TESTED WITH MOCKS
- Log in as Student 1.
- Open active assignments.
- Download/preview instructions through the app (authenticated file API).
- Submit the synthetic file before the deadline.
- Confirm status shows submitted.

### 6) Teacher grades submission — IMPLEMENTED / TESTED WITH MOCKS
- Teacher opens submissions.
- Enter marks + feedback (manual path is the reliable demo).
- **Publish** results so the student can see them.
- Optional AI grading: **UNVERIFIED** unless Gemini key/model were validated live.

### 7) Student views marks — IMPLEMENTED / TESTED WITH MOCKS
- Student refreshes assignments.
- Confirm marks/feedback appear only after publish.
- Confirm another student cannot open this submission file.

### 8) Plagiarism (optional) — IMPLEMENTED / TESTED WITH MOCKS
- Teacher runs plagiarism check on selected submissions.
- Explain this is local similarity scoring, not an external Turnitin-class verdict.
- Real accuracy on production documents: **NOT TESTED** without live data.

### 9) Reports / messages / notifications (optional) — IMPLEMENTED / TESTED WITH MOCKS
- Show dashboard stats/reports for the logged-in role.
- Send a short message Teacher ↔ Student if time allows.
- Notifications are recipient-scoped in code; live push depends on browser permission setup (**UNVERIFIED** on Hostinger).

---

## Honest stop lines

| Item | Status for evaluation claims |
|------|-------------------------------|
| Local/full-mode academic UI flows | Ready after Mongo + accounts |
| Protected file downloads | Code-complete; mock-tested |
| Hostinger public site | Maintenance-locked until approved unlock |
| Real Gemini grading on Hostinger | Not verified in overnight automation |
| Real Resend email recovery | Not verified without live keys |
| Original historical student data | Not required for demo; keep separate |

---

## If something fails during the viva

1. Show maintenance/health page if Hostinger is locked.
2. Fall back to laptop local demo with `npm run dev`.
3. Prefer manual grading over AI if Gemini is unavailable.
4. Do not invent marks or pretend provider calls succeeded.
