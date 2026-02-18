#!/usr/bin/env bash
# Usage: ./generate-report <SprintNumber>
# Example: ./generate-report 3
set -e

SPRINT="${1:?Usage: ./generate-report <SprintNumber>}"
REPORT="Sprint-${SPRINT}-Code-Coverage-Report.md"
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
BE_SUMMARY="$BACKEND/coverage/coverage-summary.json"
FE_SUMMARY="$FRONTEND/coverage/coverage-summary.json"

echo "Running backend tests..."
cd "$BACKEND"
npx jest --coverage --coverageReporters=text --coverageReporters=lcov --coverageReporters=json-summary --silent

echo "Running frontend tests..."
cd "$FRONTEND"
npx vitest run --coverage --reporter=silent --coverage.reporter=text --coverage.reporter=json-summary 2>/dev/null || \
  npx vitest run --coverage --coverage.reporter=json-summary --silent

cd "$ROOT"

# Pull backend totals
BE_LINES=$(node -e "console.log(require('$BE_SUMMARY').total.lines.pct)")
BE_BRANCHES=$(node -e "console.log(require('$BE_SUMMARY').total.branches.pct)")
BE_FUNCTIONS=$(node -e "console.log(require('$BE_SUMMARY').total.functions.pct)")
BE_STATEMENTS=$(node -e "console.log(require('$BE_SUMMARY').total.statements.pct)")

# Pull frontend totals
FE_LINES=$(node -e "console.log(require('$FE_SUMMARY').total.lines.pct)")
FE_BRANCHES=$(node -e "console.log(require('$FE_SUMMARY').total.branches.pct)")
FE_FUNCTIONS=$(node -e "console.log(require('$FE_SUMMARY').total.functions.pct)")
FE_STATEMENTS=$(node -e "console.log(require('$FE_SUMMARY').total.statements.pct)")

# Merge both summaries and find 3 lowest-covered files
WEAK=$(node -e "
const be = require('$BE_SUMMARY');
const fe = require('$FE_SUMMARY');
const root = '$ROOT/';

const allFiles = [
  ...Object.entries(be).filter(([k]) => k !== 'total'),
  ...Object.entries(fe).filter(([k]) => k !== 'total'),
];

allFiles
  .map(([k, v]) => ({
    file: k.replace(root, ''),
    linePct: v.lines.pct,
    branchPct: v.branches.pct,
  }))
  .filter(f => f.linePct < 100)
  .sort((a, b) => a.linePct - b.linePct)
  .slice(0, 3)
  .forEach(f => {
    console.log('| \`' + f.file + '\` | ' + f.linePct + '% lines / ' + f.branchPct + '% branches | Low test priority this sprint — additional tests pending |');
  });
")

DATE=$(date '+%Y-%m-%d')

cat > "$ROOT/$REPORT" <<EOF
# Sprint ${SPRINT} Code Coverage Report

Generated: ${DATE}

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

**Backend** (\`backend/server.js\`, \`backend/helpers.js\`)

| Metric | Percentage |
|--------|-----------|
| Line coverage | ${BE_LINES}% |
| Branch coverage | ${BE_BRANCHES}% |
| Function / Method coverage | ${BE_FUNCTIONS}% |
| Statement coverage | ${BE_STATEMENTS}% |

**Frontend** (\`frontend/src/\`)

| Metric | Percentage |
|--------|-----------|
| Line coverage | ${FE_LINES}% |
| Branch coverage | ${FE_BRANCHES}% |
| Function / Method coverage | ${FE_FUNCTIONS}% |
| Statement coverage | ${FE_STATEMENTS}% |

---

## 3. Scope of Coverage

**Included:**
- \`backend/server.js\` — core Express routes and business logic
- \`backend/helpers.js\` — utility/helper functions
- \`frontend/src/\` — React components, pages, hooks, contexts, utils

**Excluded:**
- \`backend/firebase.js\` — Firebase SDK initialization; mocked in all tests
- \`frontend/src/test/\` — test setup files
- Third-party libraries in \`node_modules/\`

---

## 4. Coverage Trend

**Backend**

| Sprint | Line Coverage |
|--------|--------------|
| Sprint $((SPRINT - 1)) | _(update manually)_ |
| Sprint ${SPRINT} | ${BE_LINES}% |

**Frontend**

| Sprint | Line Coverage |
|--------|--------------|
| Sprint $((SPRINT - 1)) | _(update manually)_ |
| Sprint ${SPRINT} | ${FE_LINES}% |

---

## 5. Weak Areas

| File | Coverage | Reason |
|------|----------|--------|
${WEAK}

---

## 6. Evidence

- Backend HTML report: [\`backend/coverage/lcov-report/index.html\`](backend/coverage/lcov-report/index.html)
- Frontend HTML report: [\`frontend/coverage/index.html\`](frontend/coverage/index.html)

---

## 7. Statement of Integrity

This coverage was generated from automated tests executed during this sprint.
EOF

echo "Done → $REPORT"
