# Booth Rating Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let company owners and reps see all of their booths' ratings and reviews on the Company page, with each review attributed to the fair it came from.

**Architecture:** Fix multi-booth authorization in `GET /api/booths/:boothId/ratings` (use `checkCompanyAuthorization` keyed by booth's `companyId`). Capture optional `fairId` on rating submission and annotate review-fetch responses with `fairName` and `fairStartTime` via batched fair lookups. Replace the single-booth `BoothReviewsSection` on `Company.tsx` with a `companyId`-driven version that lists all the company's booths in accordions, with reviews inside each booth sub-grouped by fair (most recent fair first; "Other" bucket for legacy reviews last).

**Tech Stack:** Express + Firebase Admin SDK (Firestore) on the backend; React + MUI on the frontend; Jest (backend) and Vitest + React Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-05-01-booth-rating-visibility-design.md`

---

## File Structure

**Backend — modify only:**
- `backend/routes/booths.js` — three endpoint handlers updated (`POST /booths/:boothId/ratings`, `GET /booths/:boothId/ratings/me`, `GET /booths/:boothId/ratings`).
- `backend/__tests__/routes/booths.test.js` — update existing rating tests to match new behavior; add new tests.

**Frontend — modify only:**
- `frontend/src/utils/boothConstants.ts` — `submitBoothRating` accepts optional `fairId`.
- `frontend/src/pages/FairBoothView.tsx` — pass `fairId` from URL into `submitBoothRating`.
- `frontend/src/pages/Company.tsx` — rewrite `BoothReviewsSection` to accept `companyId`, fetch all booths and all per-booth ratings, render accordions grouped by fair.
- `frontend/src/pages/__tests__/Company.test.tsx` — update existing reviews tests; add multi-booth + fair-grouping tests.

No new files. No new endpoints. No data migration.

---

## Task 1: Backend authorization — owner/rep access by booth's `companyId`

**Files:**
- Modify: `backend/routes/booths.js:602-643`
- Test: `backend/__tests__/routes/booths.test.js` — update tests in `describe("GET /api/booths/:boothId/ratings", ...)` (line 1024)

The current handler authorizes non-admins by reading the user's `companyId`, then checking `companyDoc.data().boothId === boothId`. After multi-booth, this is wrong — booths reference the company, not the other way around. We replace it with `checkCompanyAuthorization(boothData.companyId, userId)`, which already grants both owners and representatives.

- [ ] **Step 1: Update existing "returns 403 when company does not own the booth" test to reflect new auth path**

Open `backend/__tests__/routes/booths.test.js`. Replace the `it("returns 403 when company does not own the booth", ...)` block (currently at line 1089) with a test that uses companyId mismatch:

```js
  it("returns 403 when user's company does not own the booth", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([])),
            })),
          })),
        };
      }
      if (name === "companies") {
        // Booth's company exists; the requester is NOT owner or rep
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "different-owner", representativeIDs: ["different-rep"] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });
```

- [ ] **Step 2: Update "returns ratings for authorized company rep" test to authorize via booth.companyId**

Replace the `it("returns ratings for authorized company rep", ...)` block (currently at line 1132) with:

```js
  it("returns ratings for owner of the booth's company", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 3, comment: null, createdAt: { toMillis: () => 2000000 }, fairId: null },
      true,
      "rating-2"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "test-uid", representativeIDs: [] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(1);
    expect(res.body.averageRating).toBe(3);
    expect(res.body.ratings[0]).not.toHaveProperty("studentId");
  });

  it("returns ratings for representative of the booth's company", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 4, comment: "ok", createdAt: { toMillis: () => 2000000 }, fairId: null },
      true,
      "rating-3"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyId: "company-1" }, true, "booth-1")
            ),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap(
                { ownerId: "some-other-uid", representativeIDs: ["test-uid"] },
                true,
                "company-1"
              )
            ),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(1);
  });
```

- [ ] **Step 3: Delete "returns 404 when non-admin user does not exist" and "returns 403 when non-admin user has no companyId" tests**

Both are tied to the old code path that read `users/{uid}.companyId`. The new path doesn't read the user doc at all — it goes straight to `companies/{boothData.companyId}` and checks `ownerId` / `representativeIDs`. Delete those two `it(...)` blocks (currently at lines 1061 and 1075).

- [ ] **Step 4: Run tests; verify the updated/new tests fail**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "GET /api/booths/:boothId/ratings"`

Expected: the two new tests fail (one with 403 instead of 200, one with 200 instead of 403, etc.) — because the production code still uses the legacy check.

- [ ] **Step 5: Implement the auth fix in `backend/routes/booths.js`**

Open `backend/routes/booths.js`. Locate the handler at line 602:

```js
router.get("/booths/:boothId/ratings", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const userId = req.user.uid;

    const boothDoc = await db.collection("booths").doc(boothId).get();
    if (!boothDoc.exists) return res.status(404).json({ error: "Booth not found" });

    const adminErr = await verifyAdmin(userId);
    if (adminErr) {
      // Not admin — must be owner/rep of the company that owns this booth
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
      const companyId = userDoc.data().companyId;
      if (!companyId) return res.status(403).json({ error: "Unauthorized" });
      const companyDoc = await db.collection("companies").doc(companyId).get();
      if (!companyDoc.exists || companyDoc.data().boothId !== boothId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }
    // ... unchanged
```

Replace the body of the `if (adminErr)` block with:

```js
    if (adminErr) {
      const boothData = boothDoc.data();
      if (!boothData.companyId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const auth = await checkCompanyAuthorization(boothData.companyId, userId);
      if (!auth.authorized) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }
```

`checkCompanyAuthorization` is already imported at the top of `booths.js` (line 6).

- [ ] **Step 6: Run tests; verify all GET-ratings tests pass**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "GET /api/booths/:boothId/ratings"`

Expected: all tests in this `describe` block pass.

- [ ] **Step 7: Run the full booths route suite to make sure nothing else broke**

Run: `cd backend && npx jest __tests__/routes/booths.test.js`

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/routes/booths.js backend/__tests__/routes/booths.test.js
git commit -m "fix(booths): authorize ratings GET by booth's companyId

Owners and reps can now view ratings for any booth their company
owns, not just the legacy single boothId on the company doc."
```

---

## Task 2: Backend — `POST /ratings` accepts and validates `fairId`

**Files:**
- Modify: `backend/routes/booths.js:540-569`
- Test: `backend/__tests__/routes/booths.test.js` — `describe("POST /api/booths/:boothId/ratings", ...)` block (line 795)

Add an optional `fairId` field on the body. Validate that, when present, it is a non-empty string and the fair exists. Persist alongside the existing fields (`fairId: null` when absent).

- [ ] **Step 1: Add tests for fairId acceptance, rejection, and absence**

Open `backend/__tests__/routes/booths.test.js`. Inside `describe("POST /api/booths/:boothId/ratings", ...)`, before the closing `});`, add:

```js
  it("stores fairId when valid fairId is provided", async () => {
    const ratingsDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const ratingsCollectionRef = {
      doc: jest.fn(() => ratingsDocRef),
    };

    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, true, "booth-1")),
            collection: jest.fn(() => ratingsCollectionRef),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, "test-uid")),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Spring Fair" }, true, "fair-1")),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 5, comment: "Great", fairId: "fair-1" });

    expect(res.status).toBe(200);
    expect(ratingsDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ fairId: "fair-1" })
    );
  });

  it("returns 400 when fairId is provided but fair does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, true, "booth-1")),
            collection: jest.fn(() => ({ doc: jest.fn(() => ({ set: jest.fn() })) })),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, "test-uid")),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4, fairId: "nonexistent-fair" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid fairId/i);
  });

  it("stores fairId as null when no fairId provided", async () => {
    const ratingsDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const ratingsCollectionRef = { doc: jest.fn(() => ratingsDocRef) };
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({}, true, "booth-1")),
            collection: jest.fn(() => ratingsCollectionRef),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, "test-uid")),
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 5 });

    expect(res.status).toBe(200);
    expect(ratingsDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ fairId: null })
    );
  });
```

Update the existing `it("returns 200 and saves rating on success", ...)` test (around line 868) to also assert the new field. Find the `expect(ratingsDocRef.set).toHaveBeenCalledWith(...)` call inside that test and replace its arguments with:

```js
    expect(ratingsDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "test-uid",
        rating: 5,
        comment: "Excellent booth!",
        fairId: null,
      })
    );
```

- [ ] **Step 2: Run the new tests; verify they fail**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "POST /api/booths/:boothId/ratings"`

Expected: the three new tests fail (no `fairId` written).

- [ ] **Step 3: Implement `fairId` handling in the POST handler**

Open `backend/routes/booths.js`. Replace the handler body at lines 540-569 with:

```js
router.post("/booths/:boothId/ratings", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const studentId = req.user.uid;

    const userDoc = await db.collection("users").doc(studentId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    if (userDoc.data().role !== "student") return res.status(403).json({ error: "Only students can submit ratings" });

    const { rating, comment, fairId } = req.body;
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be a number between 1 and 5" });
    }

    let resolvedFairId = null;
    if (fairId !== undefined && fairId !== null) {
      if (typeof fairId !== "string" || fairId.trim() === "") {
        return res.status(400).json({ error: "Invalid fairId" });
      }
      const fairDoc = await db.collection("fairs").doc(fairId).get();
      if (!fairDoc.exists) {
        return res.status(400).json({ error: "Invalid fairId" });
      }
      resolvedFairId = fairId;
    }

    const boothDoc = await db.collection("booths").doc(boothId).get();
    if (!boothDoc.exists) return res.status(404).json({ error: "Booth not found" });

    await db.collection("booths").doc(boothId).collection("ratings").doc(studentId).set({
      studentId,
      rating,
      comment: comment?.trim() || null,
      createdAt: admin.firestore.Timestamp.now(),
      fairId: resolvedFairId,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /api/booths/:boothId/ratings error:", err);
    return res.status(500).json({ error: "Failed to submit rating" });
  }
});
```

- [ ] **Step 4: Run tests; verify all POST tests pass**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "POST /api/booths/:boothId/ratings"`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/booths.js backend/__tests__/routes/booths.test.js
git commit -m "feat(booths): accept and validate fairId on rating submission

POST /api/booths/:boothId/ratings now takes an optional fairId; when
provided, the fair must exist. Stored as null when omitted."
```

---

## Task 3: Backend — `GET /ratings` annotates each review with `fairName` and `fairStartTime`

**Files:**
- Modify: `backend/routes/booths.js:602-643`
- Test: `backend/__tests__/routes/booths.test.js` — same `GET /api/booths/:boothId/ratings` describe

Collect the unique non-null `fairId`s, batch-fetch fair docs (parallel `get`s), and annotate each review with `fairId`, `fairName`, and `fairStartTime` (ms epoch). Reviews without `fairId`, or whose fair has been deleted, get `null` values.

- [ ] **Step 1: Add tests for fair annotation, deleted fair, and legacy ratings**

In `backend/__tests__/routes/booths.test.js`, inside `describe("GET /api/booths/:boothId/ratings", ...)`, before the closing `});`, add:

```js
  it("annotates ratings with fairName and fairStartTime when fairId is set", async () => {
    const ratingDoc1 = mockDocSnap(
      { rating: 5, comment: "great", createdAt: { toMillis: () => 1000 }, fairId: "fair-1" },
      true,
      "rating-a"
    );
    const ratingDoc2 = mockDocSnap(
      { rating: 4, comment: null, createdAt: { toMillis: () => 2000 }, fairId: "fair-1" },
      true,
      "rating-b"
    );
    const ratingDoc3 = mockDocSnap(
      { rating: 3, comment: "ok", createdAt: { toMillis: () => 3000 }, fairId: "fair-2" },
      true,
      "rating-c"
    );
    const fairDocs = {
      "fair-1": mockDocSnap({ name: "Spring Fair", startTime: { toMillis: () => 50000 } }, true, "fair-1"),
      "fair-2": mockDocSnap({ name: "Fall Fair", startTime: { toMillis: () => 40000 } }, true, "fair-2"),
    };
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc1, ratingDoc2, ratingDoc3])),
            })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(fairDocs[id]),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ratings).toHaveLength(3);

    const byFair = res.body.ratings.reduce((acc, r) => {
      acc[r.fairId] = acc[r.fairId] || [];
      acc[r.fairId].push(r);
      return acc;
    }, {});
    expect(byFair["fair-1"]).toHaveLength(2);
    expect(byFair["fair-1"][0].fairName).toBe("Spring Fair");
    expect(byFair["fair-1"][0].fairStartTime).toBe(50000);
    expect(byFair["fair-2"]).toHaveLength(1);
    expect(byFair["fair-2"][0].fairName).toBe("Fall Fair");
  });

  it("returns null fair fields for ratings without fairId", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 5, comment: "legacy", createdAt: { toMillis: () => 1000 } },
      true,
      "rating-legacy"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ratings[0]).toMatchObject({
      fairId: null,
      fairName: null,
      fairStartTime: null,
    });
  });

  it("returns null fairName when fair has been deleted", async () => {
    const ratingDoc = mockDocSnap(
      { rating: 5, comment: "x", createdAt: { toMillis: () => 1000 }, fairId: "deleted-fair" },
      true,
      "rating-x"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "company-1" }, true, "booth-1")),
            collection: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockQuerySnap([ratingDoc])),
            })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
          })),
        };
      }
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ratings[0]).toMatchObject({
      fairId: "deleted-fair",
      fairName: null,
      fairStartTime: null,
    });
  });
```

- [ ] **Step 2: Run new tests; verify they fail**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "GET /api/booths/:boothId/ratings"`

Expected: the three new tests fail (response is missing `fairId`, `fairName`, `fairStartTime`).

- [ ] **Step 3: Implement fair annotation in the GET handler**

Open `backend/routes/booths.js`. Replace the body of the handler at line 602 with the version below. The structure is:

1. Auth (unchanged from Task 1).
2. Fetch ratings.
3. Collect unique non-null `fairId`s.
4. Batch-fetch fair docs in parallel.
5. Build map `fairId -> { name, startTime }` (or null when missing).
6. Annotate each review.

```js
router.get("/booths/:boothId/ratings", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const userId = req.user.uid;

    const boothDoc = await db.collection("booths").doc(boothId).get();
    if (!boothDoc.exists) return res.status(404).json({ error: "Booth not found" });

    const adminErr = await verifyAdmin(userId);
    if (adminErr) {
      const boothData = boothDoc.data();
      if (!boothData.companyId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const auth = await checkCompanyAuthorization(boothData.companyId, userId);
      if (!auth.authorized) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    const ratingsSnap = await db.collection("booths").doc(boothId).collection("ratings").get();
    const rawRatings = ratingsSnap.docs.map((doc) => doc.data());

    const fairIds = [...new Set(rawRatings.map((r) => r.fairId).filter(Boolean))];
    const fairMap = {};
    if (fairIds.length > 0) {
      const fairSnaps = await Promise.all(
        fairIds.map((id) => db.collection("fairs").doc(id).get())
      );
      fairSnaps.forEach((snap, idx) => {
        const id = fairIds[idx];
        if (snap.exists) {
          const data = snap.data();
          fairMap[id] = {
            name: data.name || null,
            startTime: data.startTime?.toMillis ? data.startTime.toMillis() : null,
          };
        } else {
          fairMap[id] = { name: null, startTime: null };
        }
      });
    }

    const ratings = rawRatings.map((data) => {
      const fairId = data.fairId || null;
      const fairInfo = fairId ? fairMap[fairId] : null;
      return {
        rating: data.rating,
        comment: data.comment || null,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
        fairId,
        fairName: fairInfo ? fairInfo.name : null,
        fairStartTime: fairInfo ? fairInfo.startTime : null,
      };
    });

    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
      : null;

    return res.json({ ratings, totalRatings, averageRating });
  } catch (err) {
    console.error("GET /api/booths/:boothId/ratings error:", err);
    return res.status(500).json({ error: "Failed to fetch ratings" });
  }
});
```

- [ ] **Step 4: Run tests; verify all GET tests pass**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "GET /api/booths/:boothId/ratings"`

Expected: all tests pass (including the existing admin/empty/owner tests).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/booths.js backend/__tests__/routes/booths.test.js
git commit -m "feat(booths): annotate ratings GET with fairName and fairStartTime

Each review now carries fairId, fairName, and fairStartTime so the
client can group reviews by fair. Deleted fairs and legacy ratings
return null fields gracefully."
```

---

## Task 4: Backend — `GET /ratings/me` includes `fairId` and `fairName`

**Files:**
- Modify: `backend/routes/booths.js:575-595`
- Test: `backend/__tests__/routes/booths.test.js` — `describe("GET /api/booths/:boothId/ratings/me", ...)` (line 946)

The student's own rating endpoint should also expose `fairId` and `fairName` so the rating card can display them. We don't need `fairStartTime` here — there's only one review.

- [ ] **Step 1: Add a test for fair annotation in /ratings/me**

In `backend/__tests__/routes/booths.test.js`, inside `describe("GET /api/booths/:boothId/ratings/me", ...)`, before the closing `});`, add:

```js
  it("includes fairId and fairName when the rating has a fairId", async () => {
    const ratingDocSnap = mockDocSnap(
      { rating: 5, comment: "ok", createdAt: { toMillis: () => 1000 }, fairId: "fair-1" },
      true,
      "test-uid"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(ratingDocSnap),
              })),
            })),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ name: "Spring Fair" }, true, "fair-1")
            ),
          })),
        };
      }
    });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings/me")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.rating).toMatchObject({
      rating: 5,
      fairId: "fair-1",
      fairName: "Spring Fair",
    });
  });

  it("returns null fairId/fairName for legacy ratings without fairId", async () => {
    const ratingDocSnap = mockDocSnap(
      { rating: 4, comment: null, createdAt: { toMillis: () => 1000 } },
      true,
      "test-uid"
    );
    db.collection.mockImplementation((name) => {
      if (name === "booths") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn().mockResolvedValue(ratingDocSnap),
              })),
            })),
          })),
        };
      }
    });

    const res = await request(app)
      .get("/api/booths/booth-1/ratings/me")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.rating).toMatchObject({
      fairId: null,
      fairName: null,
    });
  });
```

- [ ] **Step 2: Run; verify the new tests fail**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "GET /api/booths/:boothId/ratings/me"`

Expected: the two new tests fail (response shape missing fields).

- [ ] **Step 3: Implement fair annotation in /ratings/me**

Open `backend/routes/booths.js`. Replace the handler body at line 575 with:

```js
router.get("/booths/:boothId/ratings/me", verifyFirebaseToken, async (req, res) => {
  try {
    const { boothId } = req.params;
    const studentId = req.user.uid;

    const ratingDoc = await db.collection("booths").doc(boothId).collection("ratings").doc(studentId).get();
    if (!ratingDoc.exists) return res.json({ rating: null });

    const data = ratingDoc.data();
    const fairId = data.fairId || null;
    let fairName = null;
    if (fairId) {
      const fairDoc = await db.collection("fairs").doc(fairId).get();
      if (fairDoc.exists) {
        fairName = fairDoc.data().name || null;
      }
    }

    return res.json({
      rating: {
        rating: data.rating,
        comment: data.comment || null,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
        fairId,
        fairName,
      },
    });
  } catch (err) {
    console.error("GET /api/booths/:boothId/ratings/me error:", err);
    return res.status(500).json({ error: "Failed to fetch rating" });
  }
});
```

- [ ] **Step 4: Run tests; verify all /ratings/me tests pass**

Run: `cd backend && npx jest __tests__/routes/booths.test.js -t "GET /api/booths/:boothId/ratings/me"`

Expected: all tests pass.

- [ ] **Step 5: Run the entire booths.test.js suite as a final backend check**

Run: `cd backend && npx jest __tests__/routes/booths.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/booths.js backend/__tests__/routes/booths.test.js
git commit -m "feat(booths): include fairId and fairName on /ratings/me

Lets the student-facing rating card show which fair a previous review
came from."
```

---

## Task 5: Frontend — `submitBoothRating` accepts optional `fairId`; `FairBoothView` passes the URL fairId

**Files:**
- Modify: `frontend/src/utils/boothConstants.ts:25-56`
- Modify: `frontend/src/pages/FairBoothView.tsx:279-285`

Tiny mechanical change. We DON'T need a separate test for `boothConstants.ts` (existing FairBoothView tests will exercise the wiring). `BoothView.tsx` continues to call without `fairId` — no fair context there.

- [ ] **Step 1: Add `fairId` to `submitBoothRating` signature and body**

Open `frontend/src/utils/boothConstants.ts`. Replace the `submitBoothRating` definition (lines 25-56) with:

```ts
export async function submitBoothRating(
  ratingBoothId: string | null | undefined,
  value: number | null,
  comment: string,
  onSuccess: () => void,
  setters: RatingSetters,
  fairId?: string | null
): Promise<void> {
  if (!ratingBoothId || !value) return
  const { setSubmittingRating, setRatingError, setMyRating, setRatingSuccess } = setters
  setSubmittingRating(true)
  setRatingError("")
  try {
    const token = await authUtils.getIdToken()
    const body: Record<string, unknown> = {
      rating: value,
      comment: comment.trim() || undefined,
    }
    if (fairId) body.fairId = fairId
    const res = await fetch(`${API_URL}/api/booths/${ratingBoothId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      setRatingError(data.error || "Failed to submit rating")
      return
    }
    setMyRating({ rating: value, comment: comment.trim() || null, createdAt: Date.now() })
    setRatingSuccess("Review submitted!")
    onSuccess()
  } catch {
    setRatingError("Failed to submit rating")
  } finally {
    setSubmittingRating(false)
  }
}
```

- [ ] **Step 2: Pass `fairId` from `FairBoothView`**

Open `frontend/src/pages/FairBoothView.tsx`. Find the `submitRating` definition at line 279:

```ts
  const submitRating = (value: number | null, comment: string, onSuccess: () => void) =>
    submitBoothRating(ratingBoothId, value, comment, onSuccess, {
      setSubmittingRating,
      setRatingError,
      setMyRating,
      setRatingSuccess,
    })
```

Replace with (adding `fairId` as the 6th argument):

```ts
  const submitRating = (value: number | null, comment: string, onSuccess: () => void) =>
    submitBoothRating(ratingBoothId, value, comment, onSuccess, {
      setSubmittingRating,
      setRatingError,
      setMyRating,
      setRatingSuccess,
    }, fairId ?? null)
```

`fairId` comes from the existing `useFair()` hook destructure at the top of this component (line 93: `const { fair, loading: fairLoading, fairId } = useFair()`). Leave `BoothView.tsx` unchanged — it has no fair context.

- [ ] **Step 3: Run frontend tests for boothConstants and FairBoothView**

Run: `cd frontend && npx vitest run src/pages/__tests__/FairBoothView.test.tsx`

Expected: all tests pass (the new optional param is backwards-compatible).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/boothConstants.ts frontend/src/pages/FairBoothView.tsx
git commit -m "feat(ratings): pass fairId from FairBoothView when submitting a rating"
```

---

## Task 6: Frontend — Rewrite `BoothReviewsSection` to multi-booth, group by fair

**Files:**
- Modify: `frontend/src/pages/Company.tsx:750-824` (the `BoothReviewsSection` definition)
- Modify: `frontend/src/pages/Company.tsx:1916-1919` (the call site)
- Test: `frontend/src/pages/__tests__/Company.test.tsx:265-312` (existing BoothReviewsSection tests) — update to match new API; add multi-booth + fair-grouping tests.

The new section accepts `companyId`, fetches `GET /api/booths?companyId=<id>` for the company's booths, then for each booth fetches `GET /api/booths/<boothId>/ratings`. Renders one accordion per booth. Inside each accordion, reviews are sub-grouped by `fairId` (groups ordered by `fairStartTime` desc; the "Other" bucket — null fairId — last).

This task is TDD'd as one block: write the new tests first, watch them fail, refactor the component, then make them pass.

- [ ] **Step 1: Update existing `mockCompanyData` in Company.test.tsx and the existing two BoothReviewsSection tests**

Open `frontend/src/pages/__tests__/Company.test.tsx`. The existing tests pass a `boothId` on the company doc; we now expect the section to fetch `/api/booths?companyId=...`. Update `defaultFetchImpl` (currently around line 153) to handle the booths-list endpoint. Find the `return Promise.resolve({ ok: false, json: async () => ({ error: "Not found" }) });` line at the end of `defaultFetchImpl` and BEFORE that `return`, add:

```ts
  if (u.includes("/api/booths") && u.includes("companyId=") && (!init?.method || init.method === "GET")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        booths: [{ id: "booth-1", boothName: "Main Booth" }],
      }),
    });
  }
```

This lets every existing test continue to render a single booth without each test redefining its own booths-list mock.

Replace the two existing BoothReviewsSection tests (lines 265-312) with:

```ts
  it("BoothReviewsSection shows no reviews when ratings HTTP response is not ok", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("/api/booths/") && u.includes("/ratings")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "bad" }),
        });
      }
      return defaultFetchImpl(url, init);
    });

    renderComp();

    await waitFor(() => {
      expect(screen.getByText("Booth Reviews")).toBeInTheDocument();
    });
    // The accordion summary still renders "No reviews yet" for the booth
    expect(screen.getAllByText(/No reviews/i).length).toBeGreaterThan(0);
  });

  it("BoothReviewsSection groups reviews by fair within each booth", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("/api/booths") && u.includes("companyId=") && (!init?.method || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            booths: [
              { id: "booth-1", boothName: "Main Booth" },
              { id: "booth-2", boothName: "Engineering Booth" },
            ],
          }),
        });
      }
      if (u.includes("/api/booths/booth-1/ratings")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ratings: [
              {
                rating: 5,
                comment: "Excellent at Spring",
                createdAt: 2000,
                fairId: "fair-spring",
                fairName: "Spring 2026",
                fairStartTime: 50000,
              },
              {
                rating: 4,
                comment: "Decent at Fall",
                createdAt: 1000,
                fairId: "fair-fall",
                fairName: "Fall 2025",
                fairStartTime: 40000,
              },
              {
                rating: 3,
                comment: "Legacy review",
                createdAt: 500,
                fairId: null,
                fairName: null,
                fairStartTime: null,
              },
            ],
            totalRatings: 3,
            averageRating: 4,
          }),
        });
      }
      if (u.includes("/api/booths/booth-2/ratings")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ratings: [],
            totalRatings: 0,
            averageRating: null,
          }),
        });
      }
      return defaultFetchImpl(url, init);
    });

    renderComp();

    // Both booth accordions appear
    await waitFor(() => {
      expect(screen.getByText("Main Booth")).toBeInTheDocument();
      expect(screen.getByText("Engineering Booth")).toBeInTheDocument();
    });

    // Expand Main Booth to reveal grouped reviews
    fireEvent.click(screen.getByText("Main Booth"));

    await waitFor(() => {
      expect(screen.getByText("Spring 2026")).toBeInTheDocument();
      expect(screen.getByText("Fall 2025")).toBeInTheDocument();
      expect(screen.getByText("Other")).toBeInTheDocument();
    });

    // Group ordering: most-recent fair first; "Other" last
    const groupHeaders = screen.getAllByTestId("review-fair-group-header").map((el) => el.textContent);
    expect(groupHeaders).toEqual(["Spring 2026", "Fall 2025", "Other"]);

    // Reviews are rendered under the right groups
    expect(screen.getByText("Excellent at Spring")).toBeInTheDocument();
    expect(screen.getByText("Decent at Fall")).toBeInTheDocument();
    expect(screen.getByText("Legacy review")).toBeInTheDocument();
  });
```

`fireEvent` is already imported in this file (verify at the top); if not, add `fireEvent` to the existing `import { ... } from "@testing-library/react"`.

- [ ] **Step 2: Run the updated Company.test; verify the new test fails and the updated old test still works against the not-yet-rewritten component**

Run: `cd frontend && npx vitest run src/pages/__tests__/Company.test.tsx -t BoothReviewsSection`

Expected: at least the "groups reviews by fair within each booth" test fails (no accordions, no fair group headers, no `data-testid="review-fair-group-header"`).

- [ ] **Step 3: Rewrite `BoothReviewsSection` in Company.tsx**

Open `frontend/src/pages/Company.tsx`. Locate the `BoothReviewsSection` definition (line 750). Add `Accordion`, `AccordionSummary`, `AccordionDetails` to the `@mui/material` imports near the top of the file if not already imported; also add `ExpandMoreIcon` from `@mui/icons-material/ExpandMore` if not already imported. Then replace the entire `BoothReviewsSection` function (lines 750-824) with:

```tsx
type FairReview = {
  rating: number
  comment: string | null
  createdAt: number | null
  fairId: string | null
  fairName: string | null
  fairStartTime: number | null
}

type BoothWithReviews = {
  id: string
  boothName: string | null
  reviews: FairReview[]
  totalRatings: number
  averageRating: number | null
  loaded: boolean
}

function BoothReviewsSection({ companyId }: Readonly<{ companyId: string }>) {
  const [booths, setBooths] = useState<BoothWithReviews[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        const headers = { Authorization: `Bearer ${token}` }

        const boothsRes = await fetch(`${API_URL}/api/booths?companyId=${companyId}`, { headers })
        if (!boothsRes.ok) return
        const boothsData = await boothsRes.json()
        const boothList: { id: string; boothName?: string }[] = boothsData.booths || []

        const enriched: BoothWithReviews[] = await Promise.all(
          boothList.map(async (b) => {
            try {
              const r = await fetch(`${API_URL}/api/booths/${b.id}/ratings`, { headers })
              if (!r.ok) {
                return {
                  id: b.id,
                  boothName: b.boothName || null,
                  reviews: [],
                  totalRatings: 0,
                  averageRating: null,
                  loaded: true,
                }
              }
              const data = await r.json()
              return {
                id: b.id,
                boothName: b.boothName || null,
                reviews: (data.ratings || []) as FairReview[],
                totalRatings: data.totalRatings || 0,
                averageRating: data.averageRating ?? null,
                loaded: true,
              }
            } catch {
              return {
                id: b.id,
                boothName: b.boothName || null,
                reviews: [],
                totalRatings: 0,
                averageRating: null,
                loaded: true,
              }
            }
          })
        )

        if (!cancelled) setBooths(enriched)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [companyId])

  return (
    <Grid size={{ xs: 12 }}>
      <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <BarChartIcon sx={{ color: "#388560" }} />
            Booth Reviews
          </Typography>

          {loading && <CircularProgress size={24} />}

          {!loading && booths.length === 0 && (
            <Typography color="text.secondary">No booths yet.</Typography>
          )}

          {!loading && booths.map((booth) => (
            <Accordion key={booth.id} sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
                  <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>
                    {booth.boothName || booth.id}
                  </Typography>
                  {booth.totalRatings > 0 ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Rating value={booth.averageRating} readOnly precision={0.1} size="small" />
                      <Typography variant="body2" color="text.secondary">
                        {booth.averageRating?.toFixed(1)} ({booth.totalRatings})
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No reviews yet</Typography>
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {booth.reviews.length === 0 ? (
                  <Typography color="text.secondary">No reviews yet.</Typography>
                ) : (
                  <BoothReviewGroups reviews={booth.reviews} />
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </CardContent>
      </Card>
    </Grid>
  )
}

function BoothReviewGroups({ reviews }: Readonly<{ reviews: FairReview[] }>) {
  type Group = { fairId: string | null; fairName: string; sortKey: number; reviews: FairReview[] }
  const groupMap = new Map<string, Group>()
  for (const r of reviews) {
    const key = r.fairId ?? "__other__"
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        fairId: r.fairId,
        fairName: r.fairName || "Other",
        sortKey: r.fairStartTime ?? Number.NEGATIVE_INFINITY,
        reviews: [],
      })
    }
    groupMap.get(key)!.reviews.push(r)
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.fairId === null) return 1
    if (b.fairId === null) return -1
    return b.sortKey - a.sortKey
  })
  for (const g of groups) {
    g.reviews.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {groups.map((g) => (
        <Box key={g.fairId ?? "__other__"}>
          <Typography
            data-testid="review-fair-group-header"
            variant="subtitle2"
            sx={{ fontWeight: 600, color: "#388560", mb: 1 }}
          >
            {g.fairName}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {g.reviews.map((review) => (
              <Box
                key={`${review.fairId ?? "na"}-${review.createdAt ?? "na"}-${review.rating}-${review.comment ?? ""}`}
                sx={{ p: 1.5, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 2 }}
              >
                <Rating value={review.rating} readOnly size="small" />
                {review.comment && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{review.comment}</Typography>
                )}
                {review.createdAt && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {new Date(review.createdAt).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
```

- [ ] **Step 4: Update the call site in Company.tsx**

Open `frontend/src/pages/Company.tsx`. Find lines 1916-1919:

```tsx
          {/* Booth Reviews */}
          {company.boothId && (
            <BoothReviewsSection boothId={company.boothId} />
          )}
```

Replace with:

```tsx
          {/* Booth Reviews */}
          {company.id && (
            <BoothReviewsSection companyId={company.id} />
          )}
```

- [ ] **Step 5: Run BoothReviewsSection tests; verify they pass**

Run: `cd frontend && npx vitest run src/pages/__tests__/Company.test.tsx -t BoothReviewsSection`

Expected: both tests pass (no-reviews state and groups-by-fair).

- [ ] **Step 6: Run the full Company.test.tsx suite**

Run: `cd frontend && npx vitest run src/pages/__tests__/Company.test.tsx`

Expected: all tests pass — the `defaultFetchImpl` change in Step 1 keeps unrelated tests working with a single-booth booths-list response.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Company.tsx frontend/src/pages/__tests__/Company.test.tsx
git commit -m "feat(company): show all booths' reviews grouped by fair

Replaces the legacy single-boothId BoothReviewsSection with one that
fetches every booth for the company and groups each booth's reviews
under fair headings (most recent fair first; legacy 'Other' last)."
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && npx jest`

Expected: green.

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && npx vitest run`

Expected: green.

- [ ] **Step 3: Manual smoke (optional, if you have a dev environment)**

Log in as a company owner of a multi-booth company. Visit the Company page. Confirm the "Booth Reviews" section shows one accordion per booth and that expanding shows reviews grouped under fair headings. Log in as a student in a fair, submit a rating, then re-check the owner view to confirm the new review appears under the correct fair heading.
