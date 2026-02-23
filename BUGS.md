# Bug List — Virtual Career Fair

## CRITICAL

| # | Bug | File(s) | Lines |
|---|-----|---------|-------|
| 1 | **Hardcoded API URLs** — All backend calls use `http://localhost:5000`, breaking any non-local deployment | frontend/src/utils/auth.ts, frontend/src/pages/Dashboard.tsx, frontend/src/pages/Register.tsx, frontend/src/pages/ChatPage.tsx, frontend/src/pages/BoothView.tsx | multiple |
| 2 | **Hardcoded Firebase credentials** in source code committed to git | frontend/src/firebase.ts | 8-15 |
| 3 | **No authorization on job/booth endpoints** — Any user can create/update/delete jobs or booths for any company by passing a `companyId` | backend/server.js | 356-587 |
| 4 | **Stream Chat token spoofing** — `/api/stream-token` generates a token for any `userId` passed in the query string, no verification | backend/server.js | 100-114 |
| 5 | **Overly permissive CORS** — Allows ANY `.vercel.app` domain and any localhost port | backend/server.js | 38-45 |

## HIGH

| # | Bug | File(s) | Lines |
|---|-----|---------|-------|
| 6 | **Silent API failures** — Multiple fetch calls catch errors and only `console.error`, never showing feedback to the user | frontend/src/utils/auth.ts, frontend/src/pages/BoothView.tsx, frontend/src/pages/Dashboard.tsx | multiple |
| 7 | **Unprotected admin sync endpoint** — `POST /api/sync-stream-users` has no auth check; anyone can trigger a full user sync | backend/server.js | 304-351 |
| 8 | **Missing env var validation at startup** — Backend creates `StreamChat` client without checking if `STREAM_API_KEY`/`STREAM_API_SECRET` exist, causing silent failures | backend/server.js | 13-16 |
| 9 | **Incomplete `.env.example`** — Frontend example only has `VITE_STREAM_API_KEY`; missing `VITE_API_URL` and Firebase config vars. Backend example missing `PORT`, `FRONTEND_URL` | frontend/.env.example, backend/.env.example | — |
| 10 | **Password logged to console** in `createAdmin.js` script | backend/scripts/createAdmin.js | 130 |

## MEDIUM

| # | Bug | File(s) | Lines |
|---|-----|---------|-------|
| 11 | **Hardcoded backend port** — `const PORT = 5000` with no `process.env.PORT` fallback | backend/server.js | 19 |
| 12 | **Race condition in invite code generation** — Code uniqueness check and write are not in a transaction | backend/server.js | 1001-1018 |
| 13 | **Weak invite code generation** — Uses `Math.random()` instead of `crypto.randomBytes()` | backend/server.js | 233, 998 |
| 14 | **Inefficient full-collection scan for job counts** — Fetches ALL jobs client-side to count per company | frontend/src/pages/Booths.tsx | 77-98 |
| 15 | **Duplicate fair status fetch** — `fetchFairStatus()` is called directly AND again inside `fetchBooths()` | frontend/src/pages/Booths.tsx | 72-117 |
| 16 | **Memory leak risk** — Dashboard unread-count polling interval may not be cleared on logout | frontend/src/pages/Dashboard.tsx | 64-107 |
| 17 | **No click debounce on "Start Chat"** — `handleStartChat` has no loading state; rapid clicks fire duplicate Firestore queries | frontend/src/pages/BoothView.tsx | 84-109 |
| 18 | **No input validation on job application links** — Any string accepted, not validated as URL | frontend/src/pages/Company.tsx | 305 |
| 19 | **Inconsistent API route naming** — Mix of `/add-job`, `/add-booth`, `/register-user` vs `/api/jobs`, `/api/stream-token` | backend/server.js | multiple |
| 20 | **No rate limiting or request size limits** on any backend endpoint | backend/server.js | — |

## LOW

| # | Bug | File(s) | Lines |
|---|-----|---------|-------|
| 21 | **`"use client"` directives** on all pages — This is a React Router SPA, not Next.js; the directive has no effect | multiple frontend pages | — |
| 22 | **Swallowed error details in backend logging** — Several `console.error()` calls log a label but not the actual error object | backend/server.js | 111, 283, 584 |
| 23 | **Inconsistent API response shapes** — Some endpoints return `{ success, ... }`, others omit it | backend/server.js | multiple |
| 24 | **N+1 query for representatives** — Fetches each rep doc individually instead of batching | frontend/src/pages/Company.tsx | 177-201 |
| 25 | **No backend CI** — GitHub Actions workflow only builds the frontend; backend is not tested or validated | .github/ci.yml | — |
| 26 | **Mismatched Firebase SDK versions** — Frontend uses `^12.4.0`, backend uses `^12.3.0` | frontend/package.json, backend/package.json | — |

---

**Total: 26 bugs identified** (5 critical, 5 high, 10 medium, 6 low)
