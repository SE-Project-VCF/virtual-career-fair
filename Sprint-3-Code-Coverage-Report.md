# Sprint 3 Code Coverage Report

Generated: 2026-03-17

---

## 1. Tool & Setup

| Item | Value |
|------|-------|
| Language | JavaScript (Node.js / React) |
| Backend Tests | Jest 30 |
| Frontend Tests | Vitest 4 |
| Coverage Tool | Istanbul / v8 (bundled with Jest & Vitest) |

---

## 2. Coverage Metrics

**Backend** (`backend/server.js`, `backend/helpers.js`)

| Metric | Percentage |
|--------|-----------|
| Line coverage | 82.84% |
| Branch coverage | 72.8% |
| Function / Method coverage | 81.35% |
| Statement coverage | 81.91% |

**Frontend** (`frontend/src/`)

| Metric | Percentage |
|--------|-----------|
| Line coverage | 89.97% |
| Branch coverage | 81.4% |
| Function / Method coverage | 84.89% |
| Statement coverage | 88.22% |

---

## 3. Scope of Coverage

**Included:**
- `backend/server.js` — core Express routes and business logic
- `backend/helpers.js` — utility/helper functions
- `frontend/src/` — React components, pages, hooks, contexts, utils

**Excluded:**
- `backend/firebase.js` — Firebase SDK initialization; mocked in all tests
- `frontend/src/test/` — test setup files
- Third-party libraries in `node_modules/`

---

## 4. Coverage Trend

**Backend**

| Sprint | Line Coverage |
|--------|--------------|
| Sprint 2 | _(update manually)_ |
| Sprint 3 | 82.84% |

**Frontend**

| Sprint | Line Coverage |
|--------|--------------|
| Sprint 2 | _(update manually)_ |
| Sprint 3 | 89.97% |

---

## 5. Weak Areas

| File | Coverage | Reason |
|------|----------|--------|
| `C:\Users\austi\OneDrive\Documents\virtual-career-fair\frontend\src\components\NotificationBell.tsx` | 62.5% lines / 47.05% branches | Low test priority this sprint — additional tests pending |
| `C:\Users\austi\OneDrive\Documents\virtual-career-fair\frontend\src\pages\Company.tsx` | 69.91% lines / 64.47% branches | Low test priority this sprint — additional tests pending |
| `C:\Users\austi\OneDrive\Documents\virtual-career-fair\backend\server.js` | 82.18% lines / 71.96% branches | Low test priority this sprint — additional tests pending |

---

## 6. Evidence

- Backend HTML report: [`backend/coverage/lcov-report/index.html`](backend/coverage/lcov-report/index.html)
- Frontend HTML report: [`frontend/coverage/index.html`](frontend/coverage/index.html)

---

## 7. Statement of Integrity

This coverage was generated from automated tests executed during this sprint.
