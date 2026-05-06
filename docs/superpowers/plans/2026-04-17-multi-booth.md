# Multi-Booth Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow companies to create multiple global booth profiles and enroll multiple booths in a single fair.

**Architecture:** Remove the 1:1 company-to-booth constraint (single `company.boothId` field). Companies create multiple global booths in the `booths` collection (already supports multiple via `companyId`). A new `GET /api/booths?companyId=X` endpoint lists them. The enrollment endpoint accepts an array of booth IDs, creates a fair-scoped snapshot per booth, and stores `boothIds[]` on the enrollment doc. The frontend Company dashboard shows a booth list, and the enrollment flow gets a multi-select picker.

**Tech Stack:** Express 5, Firebase Admin SDK (Firestore), React + MUI, Jest + Supertest, Vitest + React Testing Library.

---

## File Structure

**Backend (modified):**
- `backend/routes/booths.js` — add `GET /api/booths` endpoint (list by companyId)
- `backend/routes/fairs.js` — modify `getCompanyAndBoothSnapshot()`, rename/rewrite `createEnrollmentWithBooth()` → `createEnrollmentWithBooths()`, modify `POST /api/fairs/:fairId/enroll`

**Backend (new tests):**
- `backend/__tests__/multiBoothEnroll.test.js` — tests for the modified enrollment endpoint
- `backend/__tests__/listBooths.test.js` — tests for the new `GET /api/booths` endpoint

**Frontend (modified):**
- `frontend/src/pages/Company.tsx` — replace `BoothManagementCard` with multi-booth list
- `frontend/src/pages/BoothEditor.tsx` — remove `company.boothId` link, accept `boothId` URL param for editing
- `frontend/src/pages/FairLanding.tsx` — multi-select booth picker during enrollment
- `frontend/src/App.tsx` — add route for `/company/:companyId/booth/:boothId` (edit existing booth)

---

## Task 1: Backend — `GET /api/booths?companyId=X` endpoint

**Files:**
- Modify: `backend/routes/booths.js`
- Create: `backend/__tests__/listBooths.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/listBooths.test.js`:

```javascript
const { mockDocSnap, mockQuerySnap } = require("./testUtils");

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

jest.mock("../firebase", () => ({
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "owner-uid", email: "owner@test.com" });
});

describe("GET /api/booths", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/booths").query({ companyId: "c1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 without companyId query param", async () => {
    const res = await request(app)
      .get("/api/booths")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not owner or rep of the company", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "c1")
            ),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/booths")
      .query({ companyId: "c1" })
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(403);
  });

  it("returns all booths for the company", async () => {
    const boothDocs = [
      { id: "b1", data: { companyId: "c1", boothName: "Engineering", industry: "software" } },
      { id: "b2", data: { companyId: "c1", boothName: "Marketing", industry: "marketing" } },
    ];

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", representativeIDs: [] }, true, "c1")
            ),
          })),
        };
      }
      if (name === "booths") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockQuerySnap(boothDocs)),
          }),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/booths")
      .query({ companyId: "c1" })
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.booths).toHaveLength(2);
    expect(res.body.booths[0]).toMatchObject({ id: "b1", boothName: "Engineering" });
    expect(res.body.booths[1]).toMatchObject({ id: "b2", boothName: "Marketing" });
  });

  it("returns empty array when company has no booths", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", representativeIDs: [] }, true, "c1")
            ),
          })),
        };
      }
      if (name === "booths") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          }),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/booths")
      .query({ companyId: "c1" })
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.booths).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest __tests__/listBooths.test.js`
Expected: FAIL — endpoint returns 404.

- [ ] **Step 3: Implement the endpoint**

In `backend/routes/booths.js`, add this route after the existing `POST /api/booths` route (after line 76):

```javascript
/* ----------------------------------------------------
   LIST BOOTHS FOR A COMPANY
---------------------------------------------------- */
router.get("/booths", verifyFirebaseToken, async (req, res) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: "companyId query parameter is required" });
  }

  try {
    const authResult = await checkCompanyAuthorization(companyId, req.user.uid);
    if (!authResult.authorized) {
      return res.status(authResult.error === "Invalid company ID" ? 404 : 403)
        .json({ error: authResult.error });
    }

    const boothsSnap = await db.collection("booths").where("companyId", "==", companyId).get();
    const booths = boothsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return res.json({ booths });
  } catch (err) {
    console.error("GET /api/booths error:", err);
    return res.status(500).json({ error: "Failed to fetch booths" });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest __tests__/listBooths.test.js`
Expected: ALL 5 tests pass.

- [ ] **Step 5: Run existing booth tests for regression**

Run: `cd backend && npx jest __tests__/booths.test.js __tests__/routes/booths.test.js`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/booths.js backend/__tests__/listBooths.test.js
git commit -m "feat(booths): add GET /api/booths endpoint to list company booths"
```

---

## Task 2: Backend — modify helpers for multi-booth enrollment

**Files:**
- Modify: `backend/routes/fairs.js:102-183` (helper functions)

- [ ] **Step 1: Modify `getCompanyAndBoothSnapshot` to accept optional `boothId`**

In `backend/routes/fairs.js`, change the function signature and logic at lines 102-153. Replace the entire function with:

```javascript
async function getCompanyAndBoothSnapshot(companyId, boothId) {
  const companyDoc = await db.collection("companies").doc(companyId).get();
  if (!companyDoc.exists) throw buildHttpError(404, "Company not found");

  const company = companyDoc.data();
  let boothSnapshot = {
    companyId,
    companyName: company.companyName || "",
    industry: null,
    companySize: null,
    location: null,
    locationIsRemote: false,
    locationCity: null,
    locationState: null,
    description: null,
    logoUrl: null,
    website: null,
    careersPage: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    hiringFor: null,
  };

  // Use explicit boothId if provided, otherwise fall back to company.boothId
  const resolvedBoothId = boothId || company.boothId;
  if (resolvedBoothId) {
    const boothDoc = await db.collection("booths").doc(resolvedBoothId).get();
    if (boothDoc.exists) {
      const bData = boothDoc.data();
      boothSnapshot = {
        companyId,
        originalBoothId: resolvedBoothId,
        companyName: bData.companyName || company.companyName || "",
        industry: bData.industry || null,
        companySize: bData.companySize || null,
        location: bData.location || null,
        locationIsRemote: bData.locationIsRemote === true,
        locationCity: bData.locationCity ?? null,
        locationState: bData.locationState ?? null,
        description: bData.description || null,
        logoUrl: bData.logoUrl || null,
        website: bData.website || null,
        careersPage: bData.careersPage || null,
        contactName: bData.contactName || null,
        contactEmail: bData.contactEmail || null,
        contactPhone: bData.contactPhone || null,
        hiringFor: bData.hiringFor || null,
      };
    }
  }

  return { company, boothSnapshot };
}
```

- [ ] **Step 2: Replace `createEnrollmentWithBooth` with `createEnrollmentWithBooths`**

Replace the function at lines 155-183 with:

```javascript
async function createEnrollmentWithBooths({
  fairId,
  companyId,
  companyName,
  boothSnapshots,
  enrolledBy,
  enrollmentMethod,
}) {
  const batch = db.batch();
  const fairBoothIds = [];

  for (const snapshot of boothSnapshots) {
    const fairBoothRef = db.collection("fairs").doc(fairId).collection("booths").doc();
    batch.set(fairBoothRef, {
      ...removeUndefined(snapshot),
      enrolledAt: admin.firestore.Timestamp.now(),
      enrolledBy,
    });
    fairBoothIds.push(fairBoothRef.id);
  }

  batch.set(db.collection("fairs").doc(fairId).collection("enrollments").doc(companyId), {
    companyId,
    companyName,
    enrolledAt: admin.firestore.Timestamp.now(),
    enrolledBy,
    enrollmentMethod,
    boothIds: fairBoothIds,
  });

  await batch.commit();
  return fairBoothIds;
}
```

- [ ] **Step 3: Run existing enrollment tests to check backward compat**

Run: `cd backend && npx jest __tests__/fairs.test.js __tests__/fairJoin.test.js __tests__/fairs3.test.js`
Expected: some tests may fail because they reference the old `createEnrollmentWithBooth` name and expect `boothId` (singular) in responses. Note which ones fail — we'll fix them in the next step.

- [ ] **Step 4: Commit helper changes**

```bash
git add backend/routes/fairs.js
git commit -m "refactor(fairs): support multi-booth in enrollment helpers"
```

---

## Task 3: Backend — modify enrollment endpoint for multi-booth

**Files:**
- Modify: `backend/routes/fairs.js:753-800`
- Create: `backend/__tests__/multiBoothEnroll.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/multiBoothEnroll.test.js`:

```javascript
const { mockDocSnap, mockQuerySnap } = require("./testUtils");

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

jest.mock("../firebase", () => ({
  db: {
    collection: jest.fn(),
    collectionGroup: jest.fn(),
    batch: jest.fn(() => ({
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
  },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../streamServerClient", () => ({
  streamServerClient: { channel: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "owner-uid", email: "owner@test.com" });
});

function setupEnrollMocks({ companyExists = true, fairExists = true, enrollmentExists = false, boothDocs = [] } = {}) {
  const enrollmentDocRef = {
    get: jest.fn().mockResolvedValue(mockDocSnap(
      enrollmentExists ? { companyId: "c1" } : null,
      enrollmentExists
    )),
  };

  db.collection.mockImplementation((name) => {
    if (name === "companies") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(
              companyExists ? { ownerId: "owner-uid", companyName: "Test Co", representativeIDs: [] } : null,
              companyExists,
              "c1"
            )
          ),
        })),
      };
    }
    if (name === "fairs") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(fairExists ? { name: "Fair 1" } : null, fairExists, "f1")),
          collection: jest.fn((sub) => {
            if (sub === "enrollments") {
              return { doc: jest.fn(() => enrollmentDocRef) };
            }
            if (sub === "booths") {
              return { doc: jest.fn(() => ({ id: "fair-booth-" + Math.random().toString(36).slice(2, 6) })) };
            }
            if (sub === "jobs") {
              return { doc: jest.fn() };
            }
            return {};
          }),
        })),
      };
    }
    if (name === "booths") {
      return {
        doc: jest.fn((id) => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(
              boothDocs.find((b) => b.id === id)?.data || null,
              boothDocs.some((b) => b.id === id),
              id
            )
          ),
        })),
      };
    }
    if (name === "users") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ role: "companyOwner", companyId: "c1" }, true, "owner-uid")
          ),
        })),
      };
    }
    if (name === "jobs") {
      return {
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        }),
      };
    }
    return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
  });
}

describe("POST /api/fairs/:fairId/enroll (multi-booth)", () => {
  it("returns 400 when boothIds is empty", async () => {
    setupEnrollMocks({ boothDocs: [] });

    const res = await request(app)
      .post("/api/fairs/f1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "c1", boothIds: [] });

    expect(res.status).toBe(400);
  });

  it("returns 400 when boothIds is not an array", async () => {
    setupEnrollMocks();

    const res = await request(app)
      .post("/api/fairs/f1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "c1", boothIds: "b1" });

    expect(res.status).toBe(400);
  });

  it("returns 403 when a boothId does not belong to the company", async () => {
    setupEnrollMocks({
      boothDocs: [
        { id: "b1", data: { companyId: "c1", boothName: "Eng" } },
        { id: "b2", data: { companyId: "other-company", boothName: "Other" } },
      ],
    });

    const res = await request(app)
      .post("/api/fairs/f1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "c1", boothIds: ["b1", "b2"] });

    expect(res.status).toBe(403);
  });

  it("creates multiple fair-scoped booths and returns boothIds array", async () => {
    setupEnrollMocks({
      boothDocs: [
        { id: "b1", data: { companyId: "c1", boothName: "Engineering", industry: "software" } },
        { id: "b2", data: { companyId: "c1", boothName: "Marketing", industry: "marketing" } },
      ],
    });

    const res = await request(app)
      .post("/api/fairs/f1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "c1", boothIds: ["b1", "b2"] });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.boothIds)).toBe(true);
    expect(res.body.boothIds).toHaveLength(2);
    expect(res.body.fairId).toBe("f1");
  });

  it("still works with legacy single-booth enrollment (no boothIds)", async () => {
    setupEnrollMocks({
      boothDocs: [{ id: "legacy-booth", data: { companyId: "c1", boothName: "Main" } }],
    });

    // Simulate legacy: company has boothId on its doc
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", companyName: "Test Co", boothId: "legacy-booth", representativeIDs: [] }, true, "c1")
            ),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Fair 1" }, true, "f1")),
            collection: jest.fn((sub) => {
              if (sub === "enrollments") {
                return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
              }
              if (sub === "booths") {
                return { doc: jest.fn(() => ({ id: "fair-booth-legacy" })) };
              }
              return { doc: jest.fn() };
            }),
          })),
        };
      }
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "c1", boothName: "Main" }, true, "legacy-booth")
            ),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "companyOwner", companyId: "c1" }, true, "owner-uid")
            ),
          })),
        };
      }
      if (name === "jobs") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          }),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .post("/api/fairs/f1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "c1" });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.boothIds)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest __tests__/multiBoothEnroll.test.js`
Expected: FAIL — endpoint doesn't accept `boothIds` array yet.

- [ ] **Step 3: Modify the enrollment endpoint**

In `backend/routes/fairs.js`, replace the `POST /api/fairs/:fairId/enroll` handler (lines 753-800) with:

```javascript
/* POST /api/fairs/:fairId/enroll - enroll company in fair */
router.post("/fairs/:fairId/enroll", enrollmentLimiter, verifyFirebaseToken, async (req, res) => {
  const { fairId } = req.params;
  const { companyId, inviteCode, boothIds } = req.body;
  const requestingUid = req.user.uid;

  if (!companyId && !inviteCode) {
    return res.status(400).json({ error: "Either companyId or inviteCode is required" });
  }

  // Validate boothIds if provided
  if (boothIds !== undefined) {
    if (!Array.isArray(boothIds) || boothIds.length === 0) {
      return res.status(400).json({ error: "boothIds must be a non-empty array" });
    }
  }

  try {
    const resolvedFairId = await resolveFairIdFromInviteCode(fairId, inviteCode);
    await ensureFairExists(resolvedFairId);

    const resolvedCompanyId = await resolveCompanyIdForEnrollment(requestingUid, companyId);

    const accessError = await ensureAdminOrCompanyAccess(requestingUid, resolvedCompanyId);
    if (accessError) return res.status(accessError.status).json({ error: accessError.error });

    const enrollmentDoc = await db
      .collection("fairs")
      .doc(resolvedFairId)
      .collection("enrollments")
      .doc(resolvedCompanyId)
      .get();
    if (enrollmentDoc.exists) return res.status(400).json({ error: "Company is already enrolled in this fair" });

    const companyDoc = await db.collection("companies").doc(resolvedCompanyId).get();
    if (!companyDoc.exists) throw buildHttpError(404, "Company not found");
    const company = companyDoc.data();

    const enrollmentMethod = inviteCode ? "inviteCode" : "admin";
    let boothSnapshots = [];

    if (boothIds && boothIds.length > 0) {
      // Multi-booth: validate and snapshot each selected booth
      for (const bid of boothIds) {
        const boothDoc = await db.collection("booths").doc(bid).get();
        if (!boothDoc.exists) {
          return res.status(400).json({ error: `Booth ${bid} not found` });
        }
        if (boothDoc.data().companyId !== resolvedCompanyId) {
          return res.status(403).json({ error: `Booth ${bid} does not belong to this company` });
        }
        const { boothSnapshot } = await getCompanyAndBoothSnapshot(resolvedCompanyId, bid);
        boothSnapshots.push(boothSnapshot);
      }
    } else {
      // Legacy single-booth: use company.boothId fallback
      const { boothSnapshot } = await getCompanyAndBoothSnapshot(resolvedCompanyId);
      boothSnapshots.push(boothSnapshot);
    }

    const fairBoothIds = await createEnrollmentWithBooths({
      fairId: resolvedFairId,
      companyId: resolvedCompanyId,
      companyName: company.companyName || "",
      boothSnapshots,
      enrolledBy: requestingUid,
      enrollmentMethod,
    });

    await snapshotCompanyJobsToFair(resolvedFairId, resolvedCompanyId);

    return res.status(201).json({ boothIds: fairBoothIds, fairId: resolvedFairId });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("POST /api/fairs/:fairId/enroll error:", err);
    return res.status(500).json({ error: "Failed to enroll company" });
  }
});
```

- [ ] **Step 4: Fix existing enrollment tests**

The response shape changed from `{ boothId }` to `{ boothIds }`. Update any existing tests in `backend/__tests__/fairs.test.js` and `backend/__tests__/fairJoin.test.js` that assert `res.body.boothId` to instead assert `res.body.boothIds` (array). Find them with:

Run: `cd backend && grep -rn "res.body.boothId\b" __tests__/`

For each match, change `res.body.boothId` to `res.body.boothIds[0]` or adjust the assertion to check for an array. Also update any test that passes the old response to expect `boothIds`.

- [ ] **Step 5: Run all enrollment tests**

Run: `cd backend && npx jest __tests__/multiBoothEnroll.test.js __tests__/fairs.test.js __tests__/fairJoin.test.js __tests__/fairs3.test.js`
Expected: ALL pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/fairs.js backend/__tests__/multiBoothEnroll.test.js backend/__tests__/fairs.test.js backend/__tests__/fairJoin.test.js backend/__tests__/fairs3.test.js
git commit -m "feat(enrollment): support multi-booth enrollment"
```

---

## Task 4: Frontend — Company Dashboard multi-booth list

**Files:**
- Modify: `frontend/src/pages/Company.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add route for editing existing booth by ID**

In `frontend/src/App.tsx`, add a new route after the existing `/company/:companyId/booth` route (line 115):

```tsx
<Route path="/company/:companyId/booth/:boothId" element={<BoothEditor />} />
```

- [ ] **Step 2: Replace `BoothManagementCard` with multi-booth list**

In `frontend/src/pages/Company.tsx`, replace the `BoothManagementCard` component (lines 309-378) with:

{% raw %}
```tsx
function BoothManagementCard({ companyId, navigate }: Readonly<{
  companyId: string
  navigate: ReturnType<typeof useNavigate>
}>) {
  const [booths, setBooths] = useState<{ id: string; boothName?: string; industry?: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBooths = async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch(`${API_URL}/api/booths?companyId=${companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setBooths(data.booths || [])
        }
      } catch (err) {
        console.error("Error fetching booths:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchBooths()
  }, [companyId])

  return (
    <Grid size={{ xs: 12, md: 6 }}>
      <Card sx={{ height: "100%", border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <EditIcon sx={{ color: "#388560" }} />
            Booth Management
          </Typography>

          {loading && <CircularProgress size={24} />}

          {!loading && booths.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No booths created yet. Create your first booth to get started.
            </Typography>
          )}

          {!loading && booths.map((booth) => (
            <Box
              key={booth.id}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: 1.5,
                mb: 1,
                border: "1px solid #e0e0e0",
                borderRadius: 1,
              }}
            >
              <Box>
                <Typography variant="body1" fontWeight={600}>
                  {booth.boothName || "Untitled Booth"}
                </Typography>
                {booth.industry && (
                  <Typography variant="body2" color="text.secondary">
                    {booth.industry}
                  </Typography>
                )}
              </Box>
              <Button
                size="small"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/company/${companyId}/booth/${booth.id}`)}
                sx={{ color: "#388560" }}
              >
                Edit
              </Button>
            </Box>
          ))}

          <Button
            variant="contained"
            onClick={() => navigate(`/company/${companyId}/booth`)}
            sx={{
              mt: 2,
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            Create New Booth
          </Button>
        </CardContent>
      </Card>
    </Grid>
  )
}
```
{% endraw %}

- [ ] **Step 3: Update the `BoothManagementCard` call site**

At line 1139 in `Company.tsx`, change:

```tsx
<BoothManagementCard
  companyId={company.id}
  boothId={company.boothId}
  navigate={navigate}
/>
```

to:

```tsx
<BoothManagementCard
  companyId={company.id}
  navigate={navigate}
/>
```

- [ ] **Step 4: Add necessary imports**

Add `CircularProgress` to the MUI imports if not already present, and add imports for `auth` from firebase and `API_URL` from config if not already imported. Also add `useEffect` and `useState` to the React imports if needed. Check the top of the file and add only what's missing.

- [ ] **Step 5: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Company.tsx frontend/src/App.tsx
git commit -m "feat(company): show multi-booth list on dashboard"
```

---

## Task 5: Frontend — BoothEditor: remove `company.boothId` link, support `boothId` param

**Files:**
- Modify: `frontend/src/pages/BoothEditor.tsx`

- [ ] **Step 1: Accept `boothId` from URL params**

In `BoothEditor.tsx`, find where `useParams` is called (near the top of the component). It currently destructures `companyId` and `fairId`. Add `boothId` as a param alias to avoid clashing with internal state:

```tsx
const { companyId, fairId, boothId: urlBoothId } = useParams<{ companyId: string; fairId?: string; boothId?: string }>()
```

- [ ] **Step 2: Modify `fetchCompany` to load booth by URL param**

In `fetchCompany` (around line 254-261), change the logic that decides which booth to load. Replace:

```tsx
if (fairId) {
  await loadFairBooth(companyInfo)
} else if (companyInfo.boothId) {
  await loadBooth(companyInfo.boothId, companyInfo.companyName)
} else {
  setFormData((prev) => ({ ...prev, companyName: companyInfo.companyName }))
}
```

with:

```tsx
if (fairId) {
  await loadFairBooth(companyInfo)
} else if (urlBoothId) {
  await loadBooth(urlBoothId, companyInfo.companyName)
} else if (companyInfo.boothId) {
  await loadBooth(companyInfo.boothId, companyInfo.companyName)
} else {
  setFormData((prev) => ({ ...prev, companyName: companyInfo.companyName }))
}
```

- [ ] **Step 3: Remove the `company.boothId` link on create**

In the save handler (around lines 582-599), change the create path. Replace:

```tsx
let boothId = company.boothId

if (boothId) {
  // Update existing booth
  await updateDoc(doc(db, "booths", boothId), cleanedData)
  setSuccess("Booth updated successfully!")
} else {
  // Create new booth
  const boothRef = await addDoc(collection(db, "booths"), {
    ...cleanedData,
    createdAt: new Date().toISOString(),
  })
  boothId = boothRef.id

  // Link company to booth
  await updateDoc(doc(db, "companies", company.id), { boothId })
  setSuccess("Booth created successfully!")
}
```

with:

```tsx
const editBoothId = urlBoothId || company.boothId

if (editBoothId) {
  // Update existing booth
  await updateDoc(doc(db, "booths", editBoothId), cleanedData)
  setSuccess("Booth updated successfully!")
} else {
  // Create new booth — do NOT link to company.boothId
  await addDoc(collection(db, "booths"), {
    ...cleanedData,
    createdAt: new Date().toISOString(),
  })
  setSuccess("Booth created successfully!")
}
```

- [ ] **Step 4: Add `boothName` to the form if not already present**

Check if `boothName` is already a field in the form. The `POST /api/booths` endpoint requires `boothName`. Ensure the form has a `boothName` text field. If not present, add it as the first field in the form (before company name). This is critical for distinguishing booths.

Look for the form fields section and add a `boothName` `TextField` if missing.

- [ ] **Step 5: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/BoothEditor.tsx
git commit -m "feat(booth-editor): support editing by boothId, remove company.boothId link"
```

---

## Task 6: Frontend — Multi-select booth picker for enrollment

**Files:**
- Modify: `frontend/src/pages/FairLanding.tsx`

- [ ] **Step 1: Read the current enrollment dialog UI**

Read `frontend/src/pages/FairLanding.tsx` fully to understand the current join dialog. Note how `handleJoinFair` is called and what the dialog looks like.

- [ ] **Step 2: Add state for booth selection**

Inside the component, after existing state declarations, add:

```tsx
const [companyBooths, setCompanyBooths] = useState<{ id: string; boothName?: string }[]>([])
const [selectedBoothIds, setSelectedBoothIds] = useState<string[]>([])
const [loadingBooths, setLoadingBooths] = useState(false)
```

- [ ] **Step 3: Fetch company booths when enrollment dialog opens**

Add a `useEffect` that fires when the join dialog opens (or when the user is a company user). When the dialog opens, fetch `GET /api/booths?companyId=X`:

```tsx
useEffect(() => {
  if (!joinDialogOpen || !user?.companyId) return
  const fetchBooths = async () => {
    setLoadingBooths(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`${API_URL}/api/booths?companyId=${user.companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const booths = data.booths || []
        setCompanyBooths(booths)
        // Pre-select all booths by default
        setSelectedBoothIds(booths.map((b: { id: string }) => b.id))
      }
    } catch (err) {
      console.error("Error fetching booths:", err)
    } finally {
      setLoadingBooths(false)
    }
  }
  fetchBooths()
}, [joinDialogOpen, user?.companyId])
```

- [ ] **Step 4: Add booth checklist to the enrollment dialog**

In the join dialog JSX (look for the `Dialog` that contains the invite code input), add a booth selection section after the invite code field but before the submit button. Use MUI `FormGroup` with `Checkbox` items:

{% raw %}
```tsx
{companyBooths.length > 0 && (
  <Box sx={{ mt: 2 }}>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>
      Select booths to bring to this fair:
    </Typography>
    <FormGroup>
      {companyBooths.map((booth) => (
        <FormControlLabel
          key={booth.id}
          control={
            <Checkbox
              checked={selectedBoothIds.includes(booth.id)}
              onChange={(e) => {
                setSelectedBoothIds((prev) =>
                  e.target.checked
                    ? [...prev, booth.id]
                    : prev.filter((id) => id !== booth.id)
                )
              }}
            />
          }
          label={booth.boothName || "Untitled Booth"}
        />
      ))}
    </FormGroup>
  </Box>
)}
{companyBooths.length === 0 && !loadingBooths && (
  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
    No booths found. Create a booth on your company dashboard first.
  </Typography>
)}
```
{% endraw %}

Add the necessary MUI imports: `FormGroup`, `Checkbox`, `FormControlLabel` (if not already imported).

- [ ] **Step 5: Modify `handleJoinFair` to send `boothIds`**

Change the `body` in `handleJoinFair` from:

```tsx
body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
```

to:

```tsx
body: JSON.stringify({
  inviteCode: inviteCode.trim().toUpperCase(),
  ...(selectedBoothIds.length > 0 && { boothIds: selectedBoothIds }),
}),
```

And update the success navigation. Change:

```tsx
if (data.boothId && user?.companyId) {
  navigate(`/fair/${data.fairId || fairId}/company/${user.companyId}/booth`)
}
```

to:

```tsx
// Navigate to company dashboard after enrollment
if (user?.companyId) {
  navigate(`/company/${user.companyId}`)
}
```

- [ ] **Step 6: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Smoke-test in browser**

Run: `cd frontend && npm run dev` (and `cd backend && npm start`)
- Log in as a company owner with multiple booths
- Navigate to a fair and open the enrollment dialog
- Verify the booth checklist appears with all company booths
- Select some booths, submit invite code, and verify enrollment succeeds
- Check the fair's booths page to confirm multiple booths appear

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/FairLanding.tsx
git commit -m "feat(enrollment): add multi-select booth picker for fair enrollment"
```

---

## Done

All six tasks produce a working multi-booth system:
- Task 1: `GET /api/booths?companyId=X` lists company booths
- Task 2: Backend helpers support multiple booth snapshots
- Task 3: Enrollment endpoint accepts `boothIds[]` array
- Task 4: Company dashboard shows booth list with create/edit
- Task 5: BoothEditor creates booths without `company.boothId` link
- Task 6: Fair enrollment gets a multi-select booth picker
