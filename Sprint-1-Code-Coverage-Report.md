# Sprint 1 Code Coverage Report

Generated: 2026-02-17

---

## 1. Tool & Setup

| Item | Value |
|------|-------|
| Language | JavaScript (Node.js) |
| Tests | Jest 30 |
| Coverage Tool | Istanbul (bundled with Jest) |

---

## 2. Coverage Metrics

| Metric | Percentage |
|--------|-----------|
| Line coverage | 82.95% |
| Branch coverage | 73.04% |
| Function / Method coverage | 81.35% |
| Statement coverage | 82.01% |

---

## 3. Scope of Coverage

**Included:**
- `backend/server.js` — core Express routes and business logic
- `backend/helpers.js` — utility/helper functions

**Excluded:**
- `frontend/` — React UI components; tested separately with Vitest, not instrumented here
- `backend/firebase.js` — Firebase SDK initialization; mocked in all tests, not meaningful to instrument
- Third-party libraries in `node_modules/`

---

## 4. Coverage Trend

| Sprint | Line Coverage |
|--------|--------------|
| Sprint 0 | _(update manually)_ |
| Sprint 1 | 82.95% |

---

## 5. Weak Areas

| File | Line Coverage | Reason |
|------|--------------|--------|
| `backend/server.js` | 82.29% | |
| `backend/helpers.js` | 100% | |

---

## 6. Evidence

- Coverage HTML report: [`backend/coverage/lcov-report/index.html`](backend/coverage/lcov-report/index.html)
- Raw summary: [`backend/coverage/coverage-summary.json`](backend/coverage/coverage-summary.json)

---

## 7. Statement of Integrity

This coverage was generated from automated tests executed during this sprint.
