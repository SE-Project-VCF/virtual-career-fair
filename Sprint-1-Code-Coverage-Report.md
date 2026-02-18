# Sprint 1 Code Coverage Report

Generated: 2026-02-17

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
| Line coverage | 82.95% |
| Branch coverage | 73.04% |
| Function / Method coverage | 81.35% |
| Statement coverage | 82.01% |

**Frontend** (`frontend/src/`)

| Metric | Percentage |
|--------|-----------|
| Line coverage | 89.93% |
| Branch coverage | 81.52% |
| Function / Method coverage | 85.12% |
| Statement coverage | 88.21% |

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
| Sprint 0 | _(update manually)_ |
| Sprint 1 | 82.95% |

**Frontend**

| Sprint | Line Coverage |
|--------|--------------|
| Sprint 0 | _(update manually)_ |
| Sprint 1 | 89.93% |

---

## 5. Weak Areas

| File | Coverage | Reason |
|------|----------|--------|
| `frontend/src/components/NotificationBell.tsx` | 59.57% lines / 50% branches | Low test priority this sprint — additional tests pending |
| `frontend/src/pages/Company.tsx` | 69.91% lines / 64.91% branches | Low test priority this sprint — additional tests pending |
| `backend/server.js` | 82.29% lines / 72.21% branches | Low test priority this sprint — additional tests pending |

---

## 6. Evidence

- Backend HTML report: [`backend/coverage/lcov-report/index.html`](backend/coverage/lcov-report/index.html)
- Frontend HTML report: [`frontend/coverage/index.html`](frontend/coverage/index.html)

---

## 7. Statement of Integrity

This coverage was generated from automated tests executed during this sprint.
