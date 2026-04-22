# Server.js Split Design

## Problem

`backend/server.js` is 4,449 lines with ~60 route handlers defined directly on the Express app. This makes it hard to navigate, understand, and maintain. Tests are flat files in `__tests__/` that all import the full app.

## Approach

Split route handlers into domain-specific Express Router files in `routes/`, following the existing pattern in `routes/fairs.js`. Restructure tests into isolated route tests and slim integration tests.

## Route Files

Each file exports an Express Router with relative paths (e.g., `router.post("/jobs", ...)`). `server.js` mounts all routers with `app.use("/api", router)`. The existing `routes/fairs.js` must be updated to use relative paths (strip `/api` prefix from its route definitions) for consistency, since it currently embeds full paths like `router.post("/api/fairs/...", ...)`.

| File | Endpoints | ~Lines |
|------|-----------|--------|
| `routes/jobs.js` | `POST /jobs`, `GET /jobs`, `PUT /jobs/:id`, `DELETE /jobs/:id`, `PUT /jobs/:id/form`, `DELETE /jobs/:id/form`, `GET /companies/:companyId/submissions` | ~300 |
| `routes/jobInvitations.js` | `POST /job-invitations/send`, `GET /job-invitations/received`, `GET /job-invitations/sent`, `PATCH /job-invitations/:id/status`, `GET /job-invitations/stats/:jobId`, `GET /job-invitations/details/:jobId`, `GET /job-invitations/:invitationId` | ~600 |
| `routes/resume.js` | `POST /upload-resume`, `GET /get-resume-url/:userId`, `GET /student/:studentId/resume-url`, `GET /applicant-resume-url/:applicationId`, `GET /applicant-tailored-resume/:applicationId`, `POST /resume/parse`, `POST /resume/tailor`, `POST /resume/tailor/simple`, `POST /resume/tailored/simple/save`, `POST /resume/tailor/v2`, `POST /resume/tailored/save`, `GET /resume/tailored`, `GET /resume/tailored/list`, `GET /resume/tailored/:tailoredResumeId`, `PUT /resume/tailored/:tailoredResumeId`, `DELETE /resume/tailored/:tailoredResumeId` | ~1400 |
| `routes/booths.js` | `POST /booths`, `POST /upload-booth-logo`, `GET /get-booth-logo-url/:companyId`, `POST /booth/:boothId/track-view`, `POST /booth/:boothId/track-leave`, `GET /booth/:boothId/current-visitors`, `GET /booth-visitors/:boothId`, `GET /test-rating-route`, `POST /booths/:boothId/ratings`, `GET /booths/:boothId/ratings/me`, `GET /booths/:boothId/ratings` | ~500 |
| `routes/stream.js` | `GET /stream-token`, `GET /stream-unread`, `POST /sync-stream-user`, `POST /sync-stream-users` | ~200 |
| `routes/companies.js` | `POST /companies`, `POST /link-company`, `GET /companies/:companyId/invite-code` | ~150 |
| `routes/users.js` | `POST /register-user`, `POST /create-admin`, `GET /students` | ~350 |
| `routes/fairStatus.js` | `GET /fair-status`, `POST /toggle-fair-status`, `GET /fair-schedules`, `GET /public/fair-schedules`, `POST /fair-schedules`, `PUT /fair-schedules/:id`, `DELETE /fair-schedules/:id`, `POST /update-invite-code`, `POST /fairs/:fairId/refresh-invite-code` | ~350 |
| `routes/debug.js` | `GET /debug/gemini-models`, `GET /debug/storage-bucket`, `GET /debug/patch-cache` | ~50 |
| `routes/fairs.js` | (existing, update route paths to be relative — strip `/api` prefix) | — |

## Helper Migration

### Shared helpers → `helpers.js`

Functions used across multiple route files move to `helpers.js`:

- `checkCompanyAuthorization(companyId, userId)` — used by jobs, booths, companies routes
- `resolveBooth(boothId)` — used by booths routes
- `resolveApplicantResumePathOrUrl(appData, studentId)` — used by resume routes
- `requireCompanyResumeViewAccess(companyId, userId)` — used by resume routes
- `verifyRepOrOwner(userId, companyId)` — used by jobInvitations, students routes

### Domain-specific helpers → stay in their route file as module-private functions

- `evaluateFairStatus()` → `routes/fairStatus.js`
- `resolveScheduleTimes(existingData, startTime, endTime)` → `routes/fairStatus.js`

### Resume tailor helpers → `resumeTailorHelpers.js` (new file)

These are only used by resume tailor endpoints but are numerous enough to warrant their own module:

- `extractFirstJsonObject`, `normalizeTokens`, `containsNewNumbers`, `GENERIC_VERBS`
- `findSuspiciousTokens`, `parseGeminiJson`, `buildBulletMap`, `resolveOriginalText`
- `verifyPatches`
- `extractTextFromReason`, `extractRemovedText`, `normalizeRemovalPatch`
- `findMatchingExperience`, `findMatchingProject`, `mapSuppressSectionParentId`, `mapPatchParentIds`
- `logTailorV2Debug`

### Stream client access

Route files that need the Stream client (`routes/stream.js`, `routes/users.js`) import from the existing `streamServerClient.js` module, matching the pattern already used by `routes/fairs.js`. The inline `streamServer` variable in `server.js` is removed.

## Middleware Extraction

The multer upload configuration moves to `middleware/upload.js` so route files (`resume.js`, `booths.js`) can import it without depending on `server.js`.

```js
// middleware/upload.js
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: process.env.NODE_ENV === "test" ? 10 * 1024 * 1024 : 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (req.path.includes("upload-resume") && file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    if (req.path.includes("upload-booth-logo") && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  }
});
module.exports = upload;
```

## Final server.js Shape (~80 lines)

```js
require("dotenv").config();
// imports: express, cors, rateLimit
// env validation (STREAM_API_KEY, STREAM_API_SECRET)
// express app setup: cors, json parsing, rate limiting
// mount routers (all with "/api" prefix):
//   app.use("/api", require("./routes/fairs"))
//   app.use("/api", require("./routes/jobs"))
//   app.use("/api", require("./routes/jobInvitations"))
//   app.use("/api", require("./routes/resume"))
//   app.use("/api", require("./routes/booths"))
//   app.use("/api", require("./routes/stream"))
//   app.use("/api", require("./routes/companies"))
//   app.use("/api", require("./routes/users"))
//   app.use("/api", require("./routes/fairStatus"))
//   app.use("/api", require("./routes/debug"))
//   app.post("/test-endpoint", ...)
// conditional listen + module.exports = app
```

**Note:** The existing `app.use(fairsRouter)` mount (no prefix) changes to `app.use("/api", fairsRouter)`, and `routes/fairs.js` route paths are updated to strip the `/api` prefix accordingly.

## Test Structure

### Isolated Route Tests (`__tests__/routes/`)

Each route file gets a corresponding test file. Tests create a minimal express app, mount the router, and test handler logic in isolation.

```js
// __tests__/routes/jobs.test.js
const express = require("express");
const request = require("supertest");
const { createTestApp } = require("../testUtils");
const jobsRouter = require("../../routes/jobs");

const app = createTestApp(jobsRouter);
// ... test individual endpoints
```

**What they test:** Validation, auth checks, success paths, error paths for each endpoint.

### Integration Tests (`__tests__/integration/`)

Import the full `app` from `server.js`. Slim tests that verify:
- Routes are mounted at the correct paths
- Middleware chain works (CORS, rate limiting, auth)
- One representative happy path per domain

**What they DON'T duplicate:** Edge cases already covered in isolated route tests.

### Test Utility Addition

Add `createTestApp(router, prefix)` to `testUtils.js`:

```js
function createTestApp(router, prefix = "/api") {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use(prefix, router);
  return app;
}
```

### Migration from Existing Tests

| Old File | Isolated Route Test | Integration Test |
|----------|-------------------|------------------|
| `jobs.test.js` | `routes/jobs.test.js` | `integration/jobs.integration.test.js` |
| `applicationForms.test.js` | merged into `routes/jobs.test.js` | — |
| `jobInvitations.test.js` | `routes/jobInvitations.test.js` | `integration/jobInvitations.integration.test.js` |
| `invitationDetails.test.js` | merged into `routes/jobInvitations.test.js` | — |
| `resumeAttachment.test.js` | `routes/resume.test.js` | `integration/resume.integration.test.js` |
| `resumeTailoring.test.js` | merged into `routes/resume.test.js` | — |
| `resumeTailorSimple.test.js` | stays as unit test (tests helper, not route) | — |
| `booths.test.js` | `routes/booths.test.js` | `integration/booths.integration.test.js` |
| `boothRatings.test.js` | merged into `routes/booths.test.js` | — |
| `boothVisitors.test.js` | merged into `routes/booths.test.js` | — |
| `boothVisitorsExecution.test.js` | merged into `routes/booths.test.js` | — |
| `boothVisitorsIntegration.test.js` | `integration/booths.integration.test.js` | — |
| `boothVisitorsIntegrationTests.test.js` | `integration/booths.integration.test.js` | — |
| `stream.test.js` | `routes/stream.test.js` | `integration/stream.integration.test.js` |
| `register.test.js` | `routes/users.test.js` | `integration/users.integration.test.js` |
| `students.test.js` | merged into `routes/users.test.js` | — |
| `fairSchedules.test.js` | `routes/fairStatus.test.js` | `integration/fairStatus.integration.test.js` |
| `inviteCode.test.js` | merged into `routes/fairStatus.test.js` | — |
| `serverMisc.test.js` | split across relevant route tests | — |
| `serverIntegration.test.js` | `integration/` (distribute across domains) | — |
| `helpers.test.js` | stays (add tests for migrated helpers) | — |
| `fairs.test.js`, `fairs2.test.js`, `fairs3.test.js` | stays (already tests `routes/fairs.js`) | — |
| `fairJoin.test.js`, `fairBooths.test.js` | stays (already tests fairs routes) | — |
| `resolveBooth.test.js` | merged into `helpers.test.js` | — |
| `resumeParser.test.js` | stays (unit test) | — |
| `patchValidator.test.js`, `patchApplier.test.js` | stays (unit tests) | — |
| `console.test.js`, `branches.test.js`, `lounge.test.js`, `firestoreRules.test.js` | stays (unrelated to server routes) | — |

### Files That Stay Unchanged
- `testUtils.js` (add `createTestApp` helper)
- `helpers.test.js` (add tests for migrated helpers including `checkCompanyAuthorization`, `resolveBooth`, etc.)
- `jest.config.js`, `jest.setup.js`
- All fairs-related test files (`fairs.test.js`, `fairs2.test.js`, `fairs3.test.js`, `fairJoin.test.js`, `fairBooths.test.js`)
- All standalone unit test files (`resumeParser.test.js`, `patchValidator.test.js`, `patchApplier.test.js`, `console.test.js`, `resumeTailorSimple.test.js`)
- `branches.test.js`, `lounge.test.js`, `firestoreRules.test.js`

### New Files Created
- `backend/resumeTailorHelpers.js` — extracted resume tailor utility functions
- `backend/middleware/upload.js` — extracted multer configuration

## Implementation Notes

### Route ordering
Dynamic parameter routes must be defined **after** static routes in each Router file to avoid conflicts:
- In `routes/jobInvitations.js`: `GET /job-invitations/received`, `/sent`, `/stats/:jobId`, `/details/:jobId` must all come before `GET /job-invitations/:invitationId`
- In `routes/resume.js`: `GET /resume/tailored` and `/resume/tailored/list` must come before `GET /resume/tailored/:tailoredResumeId`

### CORS preflight handler
The explicit `app.options("/api/sync-stream-user", cors())` handler (line 607 in current server.js) moves to `routes/stream.js`. Verify whether the global `cors()` middleware already handles this — if so, remove it.

### Require path changes
Route files in `routes/` use `../` to reach project-root modules:
- `require("../firebase")` instead of `require("./firebase")`
- `require("../helpers")` instead of `require("./helpers")`
- `require("../resumeParser")`, `require("../patchValidator")`, etc.

### Jest mock paths in route tests
Route test files in `__tests__/routes/` mock modules relative to the route file being tested, not relative to the test file. Jest resolves mock paths relative to the module under test, so `jest.mock("../firebase")` remains correct (the route file does `require("../firebase")`). No path changes needed in mock calls.

## Constraints

- All existing tests must pass after migration (same assertions, same coverage)
- Route files use relative paths; `server.js` mounts with `app.use("/api", router)`
- No behavior changes — pure structural refactor
- `server.js` still exports `app` for integration tests
