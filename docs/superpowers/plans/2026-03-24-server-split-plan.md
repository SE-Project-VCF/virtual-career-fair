# Server.js Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 4,449-line monolithic `backend/server.js` into domain-specific Express Router files, extract helpers and middleware, and restructure tests into isolated route tests + integration tests.

**Architecture:** Extract route handlers into `routes/*.js` files using Express Router. Each router uses relative paths and is mounted by `server.js` with `app.use("/api", router)`. Shared helpers move to `helpers.js`, resume tailor helpers to `resumeTailorHelpers.js`, multer config to `middleware/upload.js`. Tests split into `__tests__/routes/` (isolated) and `__tests__/integration/` (full app).

**Tech Stack:** Express 5, Firebase Admin SDK, Stream Chat, Jest 30, Supertest

**Spec:** `docs/superpowers/specs/2026-03-24-server-split-design.md`

**Key notes for implementers:**
- **Mock paths in route tests:** Jest resolves `jest.mock()` paths relative to the *module under test*, not the test file. So `jest.mock("../helpers")` remains correct in `__tests__/routes/` tests because the route file does `require("../helpers")`. Do NOT change mock paths when moving tests.
- **`req.path` with routers:** When routes move from `app.post("/api/upload-resume", ...)` to `router.post("/upload-resume", ...)` mounted with `app.use("/api", router)`, `req.path` inside the handler becomes `/upload-resume` (router-relative). The `middleware/upload.js` fileFilter uses `.includes()` which handles both cases.
- **`streamServer` → `streamServerClient`:** Any route file that uses the Stream Chat client must import from `../streamServerClient` (not reference the local `streamServer` variable that existed in server.js).
- **Duplicate route:** `POST /fairs/:fairId/refresh-invite-code` exists both at server.js line 187 and routes/fairs.js line 440. The server.js copy should be **removed** (not moved), since fairs.js already has it.

---

## Phase 1: Foundation (helpers, middleware, test utils)

### Task 1: Extract multer config to `middleware/upload.js`

**Files:**
- Create: `backend/middleware/upload.js`
- Modify: `backend/server.js:165-179`

- [ ] **Step 1: Create `middleware/upload.js`**

```js
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: process.env.NODE_ENV === "test" ? 10 * 1024 * 1024 : 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (req.path.includes("upload-resume") && file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    if (req.path.includes("upload-booth-logo") && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

module.exports = upload;
```

- [ ] **Step 2: Update `server.js` to import from `middleware/upload.js`**

Replace the inline multer config block (lines 165-179) with:

```js
const upload = require("./middleware/upload");
```

Remove the `const multer = require("multer");` import at line 6 of server.js.

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass (same count as before).

- [ ] **Step 4: Commit**

```bash
git add backend/middleware/upload.js backend/server.js
git commit -m "refactor: extract multer config to middleware/upload.js"
```

---

### Task 2: Migrate shared helpers from `server.js` to `helpers.js`

**Files:**
- Modify: `backend/helpers.js` (add 5 functions)
- Modify: `backend/server.js:15-94, 1212-1239` (remove migrated functions)

- [ ] **Step 1: Add the 5 shared helpers to `helpers.js`**

Add these functions to `helpers.js` before the `module.exports`:

1. `checkCompanyAuthorization` (server.js lines 16-27)
2. `resolveBooth` (server.js lines 29-53)
3. `resolveApplicantResumePathOrUrl` (server.js lines 59-83)
4. `requireCompanyResumeViewAccess` (server.js lines 88-94)
5. `verifyRepOrOwner` (server.js lines 1212-1239)

Add all 5 to the `module.exports` object. These functions use `db` from `require("./firebase")` which is already imported in helpers.js.

- [ ] **Step 2: Update `server.js` to import the helpers instead of defining them inline**

Add to the destructured import from `./helpers`:
```js
const { removeUndefined, generateInviteCode, validateJobInput, parseUTCToTimestamp, verifyAdmin, verifyFirebaseToken, checkCompanyAuthorization, resolveBooth, resolveApplicantResumePathOrUrl, requireCompanyResumeViewAccess, verifyRepOrOwner } = require("./helpers");
```

Remove the inline function definitions (lines 15-94 and 1212-1239) from server.js.

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/helpers.js backend/server.js
git commit -m "refactor: migrate shared helpers from server.js to helpers.js"
```

---

### Task 3: Extract resume tailor helpers to `resumeTailorHelpers.js`

**Files:**
- Create: `backend/resumeTailorHelpers.js`
- Modify: `backend/server.js:2702-2831, 3131-3274` (remove extracted functions)

- [ ] **Step 1: Create `resumeTailorHelpers.js`**

Extract these functions from server.js into a new file. They have no external dependencies beyond standard Node.js:

- `extractFirstJsonObject` (line 2702)
- `normalizeTokens` (line 2710)
- `containsNewNumbers` (line 2718)
- `GENERIC_VERBS` (line 2727)
- `findSuspiciousTokens` (line 2732)
- `parseGeminiJson` (line 2744)
- `buildBulletMap` (line 2765)
- `resolveOriginalText` (line 2779)
- `verifyPatches` (line 2786)
- `extractTextFromReason` (line 3131)
- `extractRemovedText` (line 3149)
- `normalizeRemovalPatch` (line 3169)
- `findMatchingExperience` (line 3201)
- `findMatchingProject` (line 3212)
- `mapSuppressSectionParentId` (line 3220)
- `mapPatchParentIds` (line 3243)
- `logTailorV2Debug` (line 3263)

Export all functions and the `GENERIC_VERBS` constant.

- [ ] **Step 2: Update `server.js` to import from `resumeTailorHelpers.js`**

Add at the top of server.js:
```js
const { extractFirstJsonObject, normalizeTokens, containsNewNumbers, GENERIC_VERBS, findSuspiciousTokens, parseGeminiJson, buildBulletMap, resolveOriginalText, verifyPatches, extractTextFromReason, extractRemovedText, normalizeRemovalPatch, findMatchingExperience, findMatchingProject, mapSuppressSectionParentId, mapPatchParentIds, logTailorV2Debug } = require("./resumeTailorHelpers");
```

Remove the inline function definitions from server.js.

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/resumeTailorHelpers.js backend/server.js
git commit -m "refactor: extract resume tailor helpers to resumeTailorHelpers.js"
```

---

### Task 4: Add `createTestApp` to `testUtils.js`

**Files:**
- Modify: `backend/__tests__/testUtils.js`

- [ ] **Step 1: Add `createTestApp` helper**

Add before `module.exports`:

```js
function createTestApp(router, prefix = "/api") {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use(prefix, router);
  return app;
}
```

Add `createTestApp` to the `module.exports` object.

- [ ] **Step 2: Commit**

```bash
git add backend/__tests__/testUtils.js
git commit -m "refactor: add createTestApp helper to testUtils.js"
```

---

### Task 5: Update `routes/fairs.js` to use relative paths

**Files:**
- Modify: `backend/routes/fairs.js` (strip `/api` prefix from all route paths)
- Modify: `backend/server.js:215` (change mount to `app.use("/api", fairsRouter)`)

- [ ] **Step 1: Strip `/api` prefix from all routes in `fairs.js`**

Replace all instances of `router.get("/api/` with `router.get("/` and `router.post("/api/` with `router.post("/`, etc. There are ~23 route definitions. For example:
- `router.get("/api/fairs", ...)` → `router.get("/fairs", ...)`
- `router.post("/api/fairs/:fairId/enroll", ...)` → `router.post("/fairs/:fairId/enroll", ...)`

- [ ] **Step 2: Update `server.js` mount**

Change line 215 from:
```js
app.use(fairsRouter);
```
to:
```js
app.use("/api", fairsRouter);
```

- [ ] **Step 3: Run fairs tests specifically**

Run: `cd backend && npx jest --no-coverage fairs 2>&1 | tail -20`
Expected: All fairs-related tests pass.

- [ ] **Step 4: Run full test suite**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/fairs.js backend/server.js
git commit -m "refactor: update fairs.js to relative paths, mount with /api prefix"
```

---

## Phase 2: Extract Route Files (one at a time, smallest first)

For each task in this phase: create the route file, remove the handlers from server.js, mount the router, run tests, commit.

**Important pattern for all route files:**
```js
const express = require("express");
const router = express.Router();
const { db, auth } = require("../firebase");
const admin = require("firebase-admin");
const { verifyFirebaseToken, /* other helpers */ } = require("../helpers");
// ... domain-specific imports

// ... route handlers using router.get/post/put/delete with relative paths

module.exports = router;
```

### Task 6: Extract `routes/debug.js` (~50 lines)

**Files:**
- Create: `backend/routes/debug.js`
- Modify: `backend/server.js` (remove debug endpoints, add router mount)

- [ ] **Step 1: Create `routes/debug.js`**

Extract these endpoints from server.js:
- `GET /debug/gemini-models` (lines 218-232) → `router.get("/debug/gemini-models", ...)`
- `GET /debug/storage-bucket` (lines 234-248) → `router.get("/debug/storage-bucket", ...)`
- `GET /debug/patch-cache` (lines 4432-4440) → `router.get("/debug/patch-cache", ...)`

The debug routes need: `require("../firebase")` for `db`, `require("firebase-admin")` for `admin`, `require("../helpers")` for `verifyFirebaseToken`, `require("@google/generative-ai")` for Gemini check, `require("../patchCache")` for cache stats.

- [ ] **Step 2: Remove those endpoints from `server.js` and add mount**

Add to server.js router mounts:
```js
app.use("/api", require("./routes/debug"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/debug.js backend/server.js
git commit -m "refactor: extract debug routes to routes/debug.js"
```

---

### Task 7: Extract `routes/companies.js` (~150 lines)

**Files:**
- Create: `backend/routes/companies.js`
- Modify: `backend/server.js` (remove companies endpoints, add router mount)

- [ ] **Step 1: Create `routes/companies.js`**

Extract these endpoints:
- `POST /companies` (lines 2488-2523) → `router.post("/companies", ...)`
- `POST /link-company` (lines 2528-2562) → `router.post("/link-company", ...)`
- `GET /companies/:companyId/invite-code` (lines 2567-2594) → `router.get("/companies/:companyId/invite-code", ...)`

Needs: `require("../firebase")`, `require("../helpers")` for `verifyFirebaseToken`, `checkCompanyAuthorization`.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/companies"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/companies.js backend/server.js
git commit -m "refactor: extract companies routes to routes/companies.js"
```

---

### Task 8: Extract `routes/stream.js` (~200 lines)

**Files:**
- Create: `backend/routes/stream.js`
- Modify: `backend/server.js` (remove stream endpoints, add router mount)

- [ ] **Step 1: Create `routes/stream.js`**

Extract these endpoints:
- `GET /stream-token` (lines 253-261)
- `GET /stream-unread` (lines 266-307)
- The CORS preflight: `app.options("/api/sync-stream-user", cors())` (line 607) — convert to `router.options("/sync-stream-user", cors())` or verify the global CORS middleware handles it
- `POST /sync-stream-user` (lines 608-641)
- `POST /sync-stream-users` (lines 748-801)

Needs: `require("../firebase")`, `require("../helpers")` for `verifyFirebaseToken`, `require("../streamServerClient")` for `streamServerClient`, `require("stream-chat")` for `StreamChat`.

**Note:** The current server.js creates a local `streamServer` via `StreamChat.getInstance(...)`. The route file should import from `../streamServerClient` instead, matching the pattern in `routes/fairs.js`.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/stream"));
```

Also remove the inline `StreamChat.getInstance(...)` block from server.js (lines 110-115) if no other routes still need it. If other routes still reference `streamServer`, keep it until those routes are extracted.

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage stream 2>&1 | tail -20`
Then: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/stream.js backend/server.js
git commit -m "refactor: extract stream routes to routes/stream.js"
```

---

### Task 9: Extract `routes/jobs.js` (~300 lines)

**Files:**
- Create: `backend/routes/jobs.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `routes/jobs.js`**

Extract these endpoints:
- `POST /jobs` (lines 806-855)
- `GET /jobs` (lines 856-902)
- `PUT /jobs/:id` (lines 903-965)
- `DELETE /jobs/:id` (lines 966-996)
- `PUT /jobs/:id/form` (lines 997-1032)
- `DELETE /jobs/:id/form` (lines 1037-1067)
- `GET /companies/:companyId/submissions` (lines 1072-1101)

Needs: `require("../firebase")`, `require("firebase-admin")`, `require("../helpers")` for `verifyFirebaseToken`, `validateJobInput`, `checkCompanyAuthorization`.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/jobs"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage jobs 2>&1 | tail -20`
Then: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/jobs.js backend/server.js
git commit -m "refactor: extract jobs routes to routes/jobs.js"
```

---

### Task 10: Extract `routes/users.js` (~350 lines)

**Files:**
- Create: `backend/routes/users.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `routes/users.js`**

Extract these endpoints:
- `POST /register-user` (lines 647-743)
- `POST /create-admin` (lines 2599-2700)
- `GET /students` (lines 1615-1706)

Needs: `require("../firebase")`, `require("firebase-admin")`, `require("../helpers")` for `verifyFirebaseToken`, `verifyRepOrOwner`, `require("../streamServerClient")` for Stream user creation during registration.

**Critical:** Replace all references to the local `streamServer` variable with the imported `streamServerClient`. This applies to `register-user` (stream upsertUser) and `create-admin` (stream upsertUser). Example: `streamServer.upsertUser(...)` → `streamServerClient.upsertUser(...)`.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/users"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage register students 2>&1 | tail -20`
Then: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/users.js backend/server.js
git commit -m "refactor: extract users routes to routes/users.js"
```

---

### Task 11: Extract `routes/fairStatus.js` (~350 lines)

**Files:**
- Create: `backend/routes/fairStatus.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `routes/fairStatus.js`**

Extract these endpoints and their domain-specific helpers:
- `evaluateFairStatus()` helper (lines 2073-2119) — stays as module-private function in this file
- `resolveScheduleTimes()` helper (lines 2318-2329) — stays as module-private function
- `GET /fair-status` (lines 2124-2137)
- `POST /toggle-fair-status` (lines 2143-2185)
- `GET /fair-schedules` (lines 2190-2228)
- `GET /public/fair-schedules` (lines 2229-2263)
- `POST /fair-schedules` (lines 2264-2311)
- `PUT /fair-schedules/:id` (lines 2334-2388)
- `DELETE /fair-schedules/:id` (lines 2393-2417)
- `POST /update-invite-code` (lines 2422-2483)
- `POST /fairs/:fairId/refresh-invite-code` (lines 187-212) — **DELETE this, do not move.** `routes/fairs.js` already has this endpoint at its line 440. Just remove the duplicate from server.js.

Needs: `require("../firebase")`, `require("firebase-admin")`, `require("../helpers")` for `verifyAdmin`, `verifyFirebaseToken`, `parseUTCToTimestamp`, `generateInviteCode`, `removeUndefined`.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/fairStatus"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage fairSchedules inviteCode 2>&1 | tail -20`
Then: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/fairStatus.js backend/server.js
git commit -m "refactor: extract fair status routes to routes/fairStatus.js"
```

---

### Task 12: Extract `routes/booths.js` (~500 lines)

**Files:**
- Create: `backend/routes/booths.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `routes/booths.js`**

Extract these endpoints:
- `POST /booths` (lines 1950-2008)
- `POST /upload-booth-logo` (lines 517-569)
- `GET /get-booth-logo-url/:companyId` (lines 570-601)
- `POST /booth/:boothId/track-view` (lines 4027-4106)
- `POST /booth/:boothId/track-leave` (lines 4112-4153)
- `GET /booth/:boothId/current-visitors` (lines 4159-4210)
- `GET /booth-visitors/:boothId` (lines 4210-4313)
- `GET /test-rating-route` (line 4318)
- `POST /booths/:boothId/ratings` (lines 4324-4353)
- `GET /booths/:boothId/ratings/me` (lines 4359-4379)
- `GET /booths/:boothId/ratings` (lines 4386-4427)

Needs: `require("../firebase")`, `require("firebase-admin")`, `require("../helpers")` for `verifyFirebaseToken`, `checkCompanyAuthorization`, `resolveBooth`, `require("../middleware/upload")` for file uploads.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/booths"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage booth 2>&1 | tail -20`
Then: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/booths.js backend/server.js
git commit -m "refactor: extract booths routes to routes/booths.js"
```

---

### Task 13: Extract `routes/jobInvitations.js` (~600 lines)

**Files:**
- Create: `backend/routes/jobInvitations.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `routes/jobInvitations.js`**

Extract these endpoints:
- `POST /job-invitations/send` (lines 1244-1343)
- `GET /job-invitations/received` (lines 1344-1469)
- `GET /job-invitations/sent` (lines 1473-1557)
- `PATCH /job-invitations/:id/status` (lines 1562-1610)
- `GET /job-invitations/stats/:jobId` (lines 1711-1762)
- `GET /job-invitations/details/:jobId` (lines 1767-1849)
- `GET /job-invitations/:invitationId` (lines 1850-1945) — **MUST be last** (dynamic param)

**Route ordering is critical:** The `:invitationId` catch-all route must be defined after all static `/job-invitations/*` routes.

Needs: `require("../firebase")`, `require("firebase-admin")`, `require("../helpers")` for `verifyFirebaseToken`, `verifyRepOrOwner`, `require("../streamServerClient")`.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/jobInvitations"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage jobInvitations invitationDetails 2>&1 | tail -20`
Then: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/jobInvitations.js backend/server.js
git commit -m "refactor: extract job invitations routes to routes/jobInvitations.js"
```

---

### Task 14: Extract `routes/resume.js` (~1400 lines)

**Files:**
- Create: `backend/routes/resume.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `routes/resume.js`**

Extract these endpoints:
- `POST /upload-resume` (lines 313-405)
- `GET /get-resume-url/:userId` (lines 406-443)
- `GET /student/:studentId/resume-url` (lines 450-516)
- `GET /applicant-resume-url/:applicationId` (lines 1108-1151)
- `GET /applicant-tailored-resume/:applicationId` (lines 1157-1207)
- `POST /resume/parse` (lines 2010-2067)
- `POST /resume/tailor` (lines 2833-2958)
- `POST /resume/tailor/simple` (lines 2964-3016)
- `POST /resume/tailored/simple/save` (lines 3022-3125)
- `POST /resume/tailor/v2` (lines 3279-3612)
- `POST /resume/tailored/save` (lines 3616-3801)
- `GET /resume/tailored` (lines 3806-3839) — **before** `:tailoredResumeId`
- `GET /resume/tailored/list` (lines 3842-3875) — **before** `:tailoredResumeId`
- `GET /resume/tailored/:tailoredResumeId` (lines 3880-3920)
- `PUT /resume/tailored/:tailoredResumeId` (lines 3925-3970)
- `DELETE /resume/tailored/:tailoredResumeId` (lines 3975-4017)

**Route ordering is critical:** `GET /resume/tailored` and `GET /resume/tailored/list` must be defined before `GET /resume/tailored/:tailoredResumeId`.

Needs: `require("../firebase")`, `require("firebase-admin")`, `require("../helpers")` for `verifyFirebaseToken`, `resolveApplicantResumePathOrUrl`, `requireCompanyResumeViewAccess`, `checkCompanyAuthorization`, `require("../middleware/upload")`, `require("../resumeParser")`, `require("../resumeTailorHelpers")`, `require("../resumeTailorSimple")`, `require("../patchValidator")`, `require("../patchApplier")`, `require("../patchCache")`, `require("@google/generative-ai")`.

- [ ] **Step 2: Remove from `server.js` and add mount**

```js
app.use("/api", require("./routes/resume"));
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest --no-coverage resume 2>&1 | tail -20`
Then: `cd backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/resume.js backend/server.js
git commit -m "refactor: extract resume routes to routes/resume.js"
```

---

### Task 15: Clean up `server.js`

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Verify server.js is now a thin shell**

After all extractions, server.js should contain only:
1. `require("dotenv").config()`
2. Express/CORS/rate-limit imports and setup
3. CORS config (allowedOrigins, corsOptions)
4. `app.use(cors(corsOptions))` and `app.options(/.*/, cors(corsOptions))` — **keep the global CORS preflight handler**
5. JSON body parser
6. Rate limiter
7. Router mounts (`app.use("/api", ...)` for each router)
8. `app.post("/test-endpoint", ...)` (stays in server.js)
9. Conditional listen + `module.exports = app`

Remove any unused imports (`multer`, `GoogleGenerativeAI`, `crypto`, `StreamChat`, `resumeParser`, `PatchValidator`, `PatchApplier`, `patchCache`, etc.).

Remove the `const streamServer = StreamChat.getInstance(...)` block.

Remove the `require("stream-chat")` import.

- [ ] **Step 2: Update `jest.config.js` `collectCoverageFrom`**

The current config only lists `server.js`, `helpers.js`, and `routes/fairs.js`. Add the new route files and `resumeTailorHelpers.js`:

```js
collectCoverageFrom: [
  "server.js", "helpers.js", "resumeTailorHelpers.js",
  "routes/**/*.js",
  "console.js", "resumeParser.js", "resumeTailorSimple.js",
  "patchApplier.js", "patchValidator.js",
],
```

- [ ] **Step 3: Verify server.js line count**

Run: `wc -l backend/server.js`
Expected: ~80-100 lines.

- [ ] **Step 4: Run full test suite**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js backend/jest.config.js
git commit -m "refactor: clean up server.js to thin router-mounting shell"
```

---

## Phase 3: Restructure Tests

### Task 16: Create test directories

- [ ] **Step 1: Create directories**

```bash
mkdir -p backend/__tests__/routes backend/__tests__/integration
```

- [ ] **Step 2: Commit (no-op, git doesn't track empty dirs)**

Directories will be committed when test files are added.

---

### Task 17: Create isolated route tests for `routes/debug.js`

**Files:**
- Create: `backend/__tests__/routes/debug.test.js`
- Migrate from: `backend/__tests__/serverMisc.test.js` (debug endpoint tests only)

- [ ] **Step 1: Create `__tests__/routes/debug.test.js`**

Minimal test — debug routes are simple. Mock firebase-admin, stream-chat, ../firebase. Import the router, use `createTestApp`. Test:
- `GET /api/debug/gemini-models` returns model list or error
- `GET /api/debug/storage-bucket` returns bucket info or error
- `GET /api/debug/patch-cache` returns 403 outside development

Migrate any `/debug/*` tests from `serverMisc.test.js` here.

Use the same mock pattern as existing tests (see `jobs.test.js` for template).

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/debug.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/debug.test.js
git commit -m "test: add isolated route tests for debug endpoints"
```

---

### Task 18: Create isolated route tests for `routes/stream.js`

**Files:**
- Create: `backend/__tests__/routes/stream.test.js`
- Migrate from: `backend/__tests__/stream.test.js`

- [ ] **Step 1: Create `__tests__/routes/stream.test.js`**

Migrate the test logic from `__tests__/stream.test.js`. Key changes:
- Import the router: `const streamRouter = require("../../routes/stream");`
- Use `createTestApp(streamRouter)` instead of importing `app` from `../server`
- Keep all existing `jest.mock()` calls — paths remain the same since Jest resolves relative to the module under test
- Keep all existing test cases and assertions

- [ ] **Step 2: Run the new test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/stream.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/stream.test.js
git commit -m "test: add isolated route tests for stream endpoints"
```

---

### Task 19: Create isolated route tests for `routes/companies.js`

**Files:**
- Create: `backend/__tests__/routes/companies.test.js`

- [ ] **Step 1: Create `__tests__/routes/companies.test.js`**

Write tests for:
- `POST /api/companies` — creates company, links owner
- `POST /api/link-company` — links user to company
- `GET /api/companies/:companyId/invite-code` — returns invite code

Mock firebase-admin, stream-chat, ../firebase, ../helpers (spread actual, override verifyAdmin). Import router, use createTestApp.

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/companies.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/companies.test.js
git commit -m "test: add isolated route tests for companies endpoints"
```

---

### Task 20: Create isolated route tests for `routes/jobs.js`

**Files:**
- Create: `backend/__tests__/routes/jobs.test.js`
- Migrate from: `backend/__tests__/jobs.test.js`, `backend/__tests__/applicationForms.test.js`

- [ ] **Step 1: Create `__tests__/routes/jobs.test.js`**

Migrate test logic from `jobs.test.js` and `applicationForms.test.js`. Key changes:
- Import the router: `const jobsRouter = require("../../routes/jobs");`
- Use `createTestApp(jobsRouter)` instead of `require("../server")`
- Merge applicationForms tests into the same file (they test `/jobs/:id/form` endpoints)
- Keep all mock patterns and assertions

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/jobs.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/jobs.test.js
git commit -m "test: add isolated route tests for jobs endpoints"
```

---

### Task 21: Create isolated route tests for `routes/users.js`

**Files:**
- Create: `backend/__tests__/routes/users.test.js`
- Migrate from: `backend/__tests__/register.test.js`, `backend/__tests__/students.test.js`, `backend/__tests__/serverMisc.test.js` (register-user tests)

- [ ] **Step 1: Create `__tests__/routes/users.test.js`**

Migrate from `register.test.js` and `students.test.js`. Key changes:
- Import the router: `const usersRouter = require("../../routes/users");`
- Use `createTestApp(usersRouter)`
- Merge register-user, create-admin, and students tests into one file
- Keep all mock patterns

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/users.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/users.test.js
git commit -m "test: add isolated route tests for users endpoints"
```

---

### Task 22: Create isolated route tests for `routes/fairStatus.js`

**Files:**
- Create: `backend/__tests__/routes/fairStatus.test.js`
- Migrate from: `backend/__tests__/fairSchedules.test.js`, `backend/__tests__/inviteCode.test.js`

- [ ] **Step 1: Create `__tests__/routes/fairStatus.test.js`**

Migrate from `fairSchedules.test.js` and `inviteCode.test.js`. Key changes:
- Import the router: `const fairStatusRouter = require("../../routes/fairStatus");`
- Use `createTestApp(fairStatusRouter)`
- Merge fair-status, toggle, schedules, and invite code tests
- Keep all mock patterns

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/fairStatus.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/fairStatus.test.js
git commit -m "test: add isolated route tests for fairStatus endpoints"
```

---

### Task 23: Create isolated route tests for `routes/booths.js`

**Files:**
- Create: `backend/__tests__/routes/booths.test.js`
- Migrate from: `backend/__tests__/booths.test.js`, `backend/__tests__/boothRatings.test.js`, `backend/__tests__/boothVisitors.test.js`, `backend/__tests__/boothVisitorsExecution.test.js`, `backend/__tests__/serverMisc.test.js` (upload-booth-logo, get-booth-logo-url tests)

- [ ] **Step 1: Create `__tests__/routes/booths.test.js`**

Migrate from all booth-related test files. Key changes:
- Import the router: `const boothsRouter = require("../../routes/booths");`
- Use `createTestApp(boothsRouter)`
- Merge booth creation, logo, visitors, and ratings tests
- Keep all mock patterns including storage mocks for logo upload

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/booths.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/booths.test.js
git commit -m "test: add isolated route tests for booths endpoints"
```

---

### Task 24: Create isolated route tests for `routes/jobInvitations.js`

**Files:**
- Create: `backend/__tests__/routes/jobInvitations.test.js`
- Migrate from: `backend/__tests__/jobInvitations.test.js`, `backend/__tests__/invitationDetails.test.js`

- [ ] **Step 1: Create `__tests__/routes/jobInvitations.test.js`**

Migrate from `jobInvitations.test.js` and `invitationDetails.test.js`. Key changes:
- Import the router: `const jobInvitationsRouter = require("../../routes/jobInvitations");`
- Use `createTestApp(jobInvitationsRouter)`
- Merge invitation send, receive, status, stats, and details tests
- Keep all mock patterns

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/jobInvitations.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/jobInvitations.test.js
git commit -m "test: add isolated route tests for jobInvitations endpoints"
```

---

### Task 25: Create isolated route tests for `routes/resume.js`

**Files:**
- Create: `backend/__tests__/routes/resume.test.js`
- Migrate from: `backend/__tests__/resumeAttachment.test.js`, `backend/__tests__/resumeTailoring.test.js`, `backend/__tests__/serverMisc.test.js` (upload-resume, get-resume-url, student resume-url tests)

- [ ] **Step 1: Create `__tests__/routes/resume.test.js`**

Migrate from `resumeAttachment.test.js` and `resumeTailoring.test.js`. Key changes:
- Import the router: `const resumeRouter = require("../../routes/resume");`
- Use `createTestApp(resumeRouter)`
- Merge resume upload, URL, tailoring, and CRUD tests
- Keep all mock patterns including storage mocks for file uploads
- Mock `../resumeTailorHelpers` if needed (or let actual implementations run since they're pure functions)
- Mock `../patchCache`, `../resumeParser`, `@google/generative-ai`

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest --no-coverage __tests__/routes/resume.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/routes/resume.test.js
git commit -m "test: add isolated route tests for resume endpoints"
```

---

## Phase 4: Integration Tests

### Task 26a: Create integration tests (jobs, jobInvitations, resume)

**Files:**
- Create: `backend/__tests__/integration/jobs.integration.test.js`
- Create: `backend/__tests__/integration/jobInvitations.integration.test.js`
- Create: `backend/__tests__/integration/resume.integration.test.js`

- [ ] **Step 1: Create integration test files**

Each integration test imports the full `app` from `../../server` and verifies:
1. Route is mounted at the correct path (returns non-404)
2. Auth middleware works (401 without token)
3. One representative happy path

Template for each file:

```js
const { mockDocSnap, mockQuerySnap } = require("../testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
  };
});

jest.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: jest.fn(() => ({
      upsertUser: jest.fn().mockResolvedValue({}),
      createToken: jest.fn().mockReturnValue("tok"),
      queryChannels: jest.fn().mockResolvedValue([]),
    })),
  },
}));

jest.mock("../../firebase", () => ({
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

const request = require("supertest");
const app = require("../../server");
const { db, auth } = require("../../firebase");

describe("[Domain] Integration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/[endpoint]");
    expect(res.status).toBe(401);
  });

  it("happy path works through full middleware chain", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "u1", email: "a@b.com" });
    // setup db mocks...
    const res = await request(app)
      .get("/api/[endpoint]")
      .set("Authorization", "Bearer tok");
    expect(res.status).toBe(200);
  });
});
```

**Note:** Integration tests are in `__tests__/integration/`, so firebase mock path is `../../firebase` (not `../firebase`). Server import is `../../server`.

**`serverMisc.test.js` distribution:** CORS and multer fileFilter tests from `serverMisc.test.js` go into integration tests (they test global middleware). The `/test-endpoint` test can stay in any integration file or be a standalone `integration/misc.integration.test.js`.

Migrate relevant tests from `serverIntegration.test.js` into the appropriate file.

- [ ] **Step 2: Run integration tests**

Run: `cd backend && npx jest --no-coverage __tests__/integration/ 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/integration/
git commit -m "test: add integration tests for jobs, jobInvitations, resume"
```

---

### Task 26b: Create integration tests (booths, stream, companies)

**Files:**
- Create: `backend/__tests__/integration/booths.integration.test.js`
- Create: `backend/__tests__/integration/stream.integration.test.js`
- Create: `backend/__tests__/integration/companies.integration.test.js`

- [ ] **Step 1: Create integration test files**

Same template as Task 26a. Migrate from `boothVisitorsIntegration.test.js` and `boothVisitorsIntegrationTests.test.js` into `booths.integration.test.js`.

- [ ] **Step 2: Run integration tests**

Run: `cd backend && npx jest --no-coverage __tests__/integration/ 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/integration/
git commit -m "test: add integration tests for booths, stream, companies"
```

---

### Task 26c: Create integration tests (users, fairStatus)

**Files:**
- Create: `backend/__tests__/integration/users.integration.test.js`
- Create: `backend/__tests__/integration/fairStatus.integration.test.js`

- [ ] **Step 1: Create integration test files**

Same template as Task 26a.

- [ ] **Step 2: Run integration tests**

Run: `cd backend && npx jest --no-coverage __tests__/integration/ 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/integration/
git commit -m "test: add integration tests for users, fairStatus"
```

---

## Phase 5: Cleanup

### Task 27: Migrate `resolveBooth.test.js` into `helpers.test.js`

**Files:**
- Modify: `backend/__tests__/helpers.test.js` (add tests for migrated helpers)
- Delete: `backend/__tests__/resolveBooth.test.js`

- [ ] **Step 1: Read `resolveBooth.test.js` and merge its tests into `helpers.test.js`**

Add a `describe("resolveBooth", ...)` block to `helpers.test.js` with all tests from `resolveBooth.test.js`. Also add basic tests for `checkCompanyAuthorization`, `resolveApplicantResumePathOrUrl`, `requireCompanyResumeViewAccess`, and `verifyRepOrOwner`.

- [ ] **Step 2: Run helpers tests**

Run: `cd backend && npx jest --no-coverage __tests__/helpers.test.js`
Expected: PASS

- [ ] **Step 3: Delete old file**

```bash
rm backend/__tests__/resolveBooth.test.js
```

- [ ] **Step 4: Commit**

```bash
git add backend/__tests__/helpers.test.js
git rm backend/__tests__/resolveBooth.test.js
git commit -m "test: migrate resolveBooth tests to helpers.test.js, add tests for migrated helpers"
```

---

### Task 28: Remove old test files

**Files:**
- Delete: old test files that have been migrated to `__tests__/routes/` and `__tests__/integration/`

- [ ] **Step 1: Run full test suite first to confirm everything passes**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -30`
Expected: All tests pass (old + new).

- [ ] **Step 2: Delete migrated test files**

```bash
cd backend/__tests__
rm jobs.test.js applicationForms.test.js
rm jobInvitations.test.js invitationDetails.test.js
rm resumeAttachment.test.js resumeTailoring.test.js
rm booths.test.js boothRatings.test.js boothVisitors.test.js boothVisitorsExecution.test.js
rm boothVisitorsIntegration.test.js boothVisitorsIntegrationTests.test.js
rm stream.test.js
rm register.test.js students.test.js
rm fairSchedules.test.js inviteCode.test.js
rm serverMisc.test.js serverIntegration.test.js
```

- [ ] **Step 3: Run full test suite again**

Run: `cd backend && npx jest --no-coverage 2>&1 | tail -30`
Expected: All tests pass (new tests only now).

- [ ] **Step 4: Commit**

```bash
cd backend && git add -A __tests__/
git commit -m "refactor: remove old test files migrated to routes/ and integration/"
```

---

### Task 29: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd backend && npx jest --no-coverage --verbose 2>&1 | tail -50`
Expected: All tests pass.

- [ ] **Step 2: Verify server.js line count**

Run: `wc -l backend/server.js`
Expected: ~80-100 lines.

- [ ] **Step 3: Verify no route handlers remain in server.js**

Run: `grep -c 'app\.\(get\|post\|put\|patch\|delete\)(' backend/server.js`
Expected: 1 (only `/test-endpoint`).

- [ ] **Step 4: Verify route file count**

Run: `ls backend/routes/`
Expected: 10 files (fairs.js, jobs.js, jobInvitations.js, resume.js, booths.js, stream.js, companies.js, users.js, fairStatus.js, debug.js)

- [ ] **Step 5: Commit any final cleanup**

```bash
git add -A backend/
git commit -m "refactor: complete server.js split — final cleanup"
```
