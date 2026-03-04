# Sprint 2 Code Coverage Report

Generated: 2026-03-03

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
| Line coverage | 75.18% |
| Branch coverage | 66.94% |
| Function / Method coverage | 76.06% |
| Statement coverage | 73.95% |

**Frontend** (`frontend/src/`)

| Metric | Percentage |
|--------|-----------|
| Line coverage | 92.03% |
| Branch coverage | 80.53% |
| Function / Method coverage | 84.53% |
| Statement coverage | 88.66% |

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
| Sprint 1 | 82.95% |
| Sprint 2 | 75.18% |

**Frontend**

| Sprint | Line Coverage |
|--------|--------------|
| Sprint 1 | 89.93% |
| Sprint 2 | 92.03% |

---

## 5. Weak Areas

| File | Coverage | Reason |
|------|----------|--------|
| `backend/console.js` | 44.04% lines / 51.16% branches | Low test priority this sprint — additional tests pending |
| `backend/server.js` | 73.99% lines / 67.43% branches | Low test priority this sprint — additional tests pending |
| `frontend/src/pages/FairBoothView.tsx` | 77.33% lines / 69.89% branches | Low test priority this sprint — additional tests pending |

---

## 6. Evidence

- Backend HTML report: [`backend/coverage/lcov-report/index.html`](backend/coverage/lcov-report/index.html)
- Frontend HTML report: [`frontend/coverage/index.html`](frontend/coverage/index.html)

---

## 7. Statement of Integrity

This coverage was generated from automated tests executed during this sprint.
