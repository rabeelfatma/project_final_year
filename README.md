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

## Project backlog (UI/UX)

### Done (local, uncommitted redesign work)
- Unified QuickCheck Hub design tokens, typography, and shared dashboard shell.
- Aligned Admin / Teacher / Student branding, nav items, cards, tables, and auth layouts.
- Replaced student “EduCore” brand with QuickCheck Hub.
- Matched Light/Dark dashboards to the shared modern blue scheme (`#1683F8` / `#0969DA` / `#60B5FF`) with near-black sidebars and theme-dependent surfaces.

### Remaining / next
- Visual QA pass in a running browser: toggle Light/Dark on Admin, Teacher, and Student dashboards and confirm charts, active nav, and CTAs all use the shared blue.
- Do not commit/push/deploy until explicitly authorized.
