---
render_with_liquid: false
---
# Fair Booth Registration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow company reps/owners to register their booth for a specific fair by entering the fair's invite code, so only registered booths appear in the admin view and student listing.

**Architecture:** Add `registeredBoothIds: string[]` to `fairSchedules` documents. A new `POST /api/fairs/join` endpoint validates the invite code, finds the caller's booth (via owner or representative lookup), and appends it idempotently to the schedule. The admin endpoint and student booth listing both filter to only registered booth IDs. When the fair is live via manual toggle but has no active schedule, all booths are shown as before (no regression).

**Tech Stack:** Express 5, Firebase Admin SDK (Firestore), React + MUI, Jest + Supertest

---

## Chunk 1: Backend — join endpoint

### Task 1: Failing tests for `POST /api/fairs/join`

**Files:**
- Create: `backend/__tests__/fairJoin.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/fairJoin.test.js`:

```js
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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), runTransaction: jest.fn() },
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
  auth.verifyIdToken.mockResolvedValue({ uid: "user1", email: "u@test.com" });
});

describe("POST /api/fairs/join", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/fairs/join").send({ inviteCode: "ABC12345" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when inviteCode is missing", async () => {
    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inviteCode/i);
  });

  it("returns 404 when no schedule matches the invite code", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "NOTFOUND" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/invite code/i);
  });

  it("returns 404 when user has no company with a booth", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([mockDocSnap({ name: "Spring Fair", inviteCode: "CODE1234" }, true, "sched1")])
          ),
        };
      }
      if (name === "companies") {
        // Return empty for both ownerId query and representativeIDs query
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/booth/i);
  });

  it("registers booth for company owner and returns fairId and fairName", async () => {
    const scheduleDocRef = {
      id: "sched1",
      update: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              {
                ...mockDocSnap(
                  { name: "Spring Fair", inviteCode: "CODE1234", registeredBoothIds: [] },
                  true,
                  "sched1"
                ),
                ref: scheduleDocRef,
              },
            ])
          ),
        };
      }
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([mockDocSnap({ ownerId: "user1", boothId: "booth1" }, true, "comp1")])
          ),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });

    expect(res.status).toBe(200);
    expect(res.body.fairId).toBe("sched1");
    expect(res.body.fairName).toBe("Spring Fair");
    expect(scheduleDocRef.update).toHaveBeenCalledWith({
      registeredBoothIds: expect.arrayContaining(["booth1"]),
    });
  });

  it("registers booth for representative (ownerId query returns empty, rep query succeeds)", async () => {
    const scheduleDocRef = {
      id: "sched1",
      update: jest.fn().mockResolvedValue(undefined),
    };

    let companiesCallCount = 0;
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              {
                ...mockDocSnap(
                  { name: "Spring Fair", inviteCode: "CODE1234", registeredBoothIds: [] },
                  true,
                  "sched1"
                ),
                ref: scheduleDocRef,
              },
            ])
          ),
        };
      }
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockImplementation(() => {
            companiesCallCount++;
            // First call: ownerId query returns empty
            // Second call: representativeIDs query returns the company
            if (companiesCallCount === 1) return Promise.resolve(mockQuerySnap([]));
            return Promise.resolve(
              mockQuerySnap([mockDocSnap({ boothId: "booth-rep1", representativeIDs: ["user1"] }, true, "comp2")])
            );
          }),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });

    expect(res.status).toBe(200);
    expect(res.body.fairId).toBe("sched1");
    expect(scheduleDocRef.update).toHaveBeenCalledWith({
      registeredBoothIds: expect.arrayContaining(["booth-rep1"]),
    });
  });

  it("does not call update when booth is already registered (idempotent)", async () => {
    const scheduleDocRef = {
      id: "sched1",
      update: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              {
                ...mockDocSnap(
                  { name: "Spring Fair", inviteCode: "CODE1234", registeredBoothIds: ["booth1"] },
                  true,
                  "sched1"
                ),
                ref: scheduleDocRef,
              },
            ])
          ),
        };
      }
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([mockDocSnap({ ownerId: "user1", boothId: "booth1" }, true, "comp1")])
          ),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });

    expect(res.status).toBe(200);
    // The update should be skipped entirely when booth is already registered
    expect(scheduleDocRef.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest __tests__/fairJoin.test.js --no-coverage
```

Expected: All tests FAIL (endpoint doesn't exist yet).

---

### Task 2: Implement `POST /api/fairs/join` in server.js

**Files:**
- Modify: `backend/server.js` — add after the closing `});` of `GET /api/fairs/:fairId/booths` (around line 1406)

- [ ] **Step 3: Add the endpoint**

Insert after the closing `});` of `GET /api/fairs/:fairId/booths`:

```js
/* ----------------------------------------------------
   JOIN FAIR WITH INVITE CODE (Company owner/rep)
---------------------------------------------------- */
app.post("/api/fairs/join", verifyFirebaseToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) {
      return res.status(400).json({ error: "inviteCode is required" });
    }

    const normalizedCode = String(inviteCode).trim().toUpperCase();

    // Find the schedule with this invite code
    const schedulesSnapshot = await db.collection("fairSchedules")
      .where("inviteCode", "==", normalizedCode)
      .get();

    if (schedulesSnapshot.empty) {
      return res.status(404).json({ error: "Invalid invite code" });
    }

    const scheduleDoc = schedulesSnapshot.docs[0];
    const scheduleData = scheduleDoc.data();

    // Find the user's booth via company ownership
    let boothId = null;
    const ownerSnapshot = await db.collection("companies")
      .where("ownerId", "==", req.user.uid)
      .get();

    if (!ownerSnapshot.empty) {
      boothId = ownerSnapshot.docs[0].data().boothId || null;
    }

    // Fall back to representative role
    if (!boothId) {
      const repSnapshot = await db.collection("companies")
        .where("representativeIDs", "array-contains", req.user.uid)
        .get();
      if (!repSnapshot.empty) {
        boothId = repSnapshot.docs[0].data().boothId || null;
      }
    }

    if (!boothId) {
      return res.status(404).json({ error: "No booth found for this account" });
    }

    // Append boothId idempotently
    const existing = scheduleData.registeredBoothIds || [];
    if (!existing.includes(boothId)) {
      await scheduleDoc.ref.update({
        registeredBoothIds: [...existing, boothId],
      });
    }

    return res.json({
      fairId: scheduleDoc.id,
      fairName: scheduleData.name || "",
    });
  } catch {
    console.error("Error joining fair");
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest __tests__/fairJoin.test.js --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/__tests__/fairJoin.test.js backend/server.js
git commit -m "feat: add POST /api/fairs/join endpoint for booth fair registration"
```

---

## Chunk 2: Backend — filter booths by registration

### Task 3: Migrate existing fairBooths test and update endpoint

**Files:**
- Modify: `backend/__tests__/fairBooths.test.js`
- Modify: `backend/server.js` lines 1356–1394 (the booths-fetching block inside `GET /api/fairs/:fairId/booths`)

The endpoint currently does `db.collection("booths").get()` (all booths). After this change it reads `registeredBoothIds` from the schedule and does `db.collection("booths").doc(id).get()` per booth. The existing test's mock must be updated first, then the endpoint logic changed.

- [ ] **Step 1: Update the existing "returns fair data" test mock**

In `backend/__tests__/fairBooths.test.js`, update the test "returns fair data with booths and their ratings in time window":

Change the `fairSchedules` mock to include `registeredBoothIds`:
```js
// Before:
data: () => ({ name: "Spring Fair 2025", startTime, endTime }),

// After:
data: () => ({ name: "Spring Fair 2025", startTime, endTime, registeredBoothIds: ["booth1"] }),
```

Change the `booths` mock so `doc(id).get()` works (the collection-level `get()` is no longer called):
```js
// Before:
if (col === "booths") {
  return {
    get: jest.fn().mockResolvedValue({
      docs: [
        {
          id: "booth1",
          data: () => ({ companyName: "Acme Corp" }),
        },
      ],
    }),
    doc: () => ({
      collection: () => ({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          forEach: (cb) => cb(mockRatingDoc),
        }),
      }),
    }),
  };
}

// After:
if (col === "booths") {
  return {
    doc: (id) => ({
      get: jest.fn().mockResolvedValue(
        id === "booth1"
          ? { exists: true, id: "booth1", data: () => ({ companyName: "Acme Corp" }) }
          : { exists: false, data: () => ({}) }
      ),
      collection: () => ({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          forEach: (cb) => cb(mockRatingDoc),
        }),
      }),
    }),
  };
}
```

- [ ] **Step 2: Run existing tests to verify the mock update alone doesn't break anything**

```bash
cd backend && npx jest __tests__/fairBooths.test.js --no-coverage
```

Expected: All existing tests still PASS (no endpoint change yet, just mock update).

- [ ] **Step 3: Write failing test for registration filter**

Add a new test inside the `describe("GET /api/fairs/:fairId/booths")` block in `fairBooths.test.js`:

```js
it("returns only registered booths (ignores unregistered booth IDs)", async () => {
  const startTime = { toMillis: () => 1000, seconds: 1 };
  const endTime = { toMillis: () => 9000, seconds: 9 };

  db.collection.mockImplementation((col) => {
    if (col === "fairSchedules") {
      return {
        doc: () => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              name: "Test Fair",
              startTime,
              endTime,
              registeredBoothIds: ["booth1"], // booth2 is NOT registered
            }),
          }),
        }),
      };
    }
    if (col === "booths") {
      return {
        doc: (id) => ({
          get: jest.fn().mockResolvedValue(
            id === "booth1"
              ? { exists: true, id: "booth1", data: () => ({ companyName: "Acme Corp" }) }
              : { exists: false, data: () => ({}) }
          ),
          collection: () => ({
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ forEach: () => {} }),
          }),
        }),
      };
    }
  });

  const res = await request(app)
    .get("/api/fairs/fair1/booths")
    .set("Authorization", "Bearer token");

  expect(res.status).toBe(200);
  expect(res.body.booths).toHaveLength(1);
  expect(res.body.booths[0].boothId).toBe("booth1");
});

it("returns empty booths array when no booths are registered", async () => {
  const startTime = { toMillis: () => 1000, seconds: 1 };
  const endTime = { toMillis: () => 9000, seconds: 9 };

  db.collection.mockImplementation((col) => {
    if (col === "fairSchedules") {
      return {
        doc: () => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              name: "Empty Fair",
              startTime,
              endTime,
              registeredBoothIds: [],
            }),
          }),
        }),
      };
    }
    return { doc: jest.fn(), get: jest.fn() };
  });

  const res = await request(app)
    .get("/api/fairs/fair1/booths")
    .set("Authorization", "Bearer token");

  expect(res.status).toBe(200);
  expect(res.body.booths).toHaveLength(0);
});
```

- [ ] **Step 4: Run to verify new tests fail**

```bash
cd backend && npx jest __tests__/fairBooths.test.js --no-coverage
```

Expected: New tests FAIL, existing tests still PASS.

- [ ] **Step 5: Update the endpoint logic in server.js**

In `backend/server.js`, inside `GET /api/fairs/:fairId/booths`, replace the booths-fetching block. Find this section (starts with `// Get all booths`):

```js
    // Get all booths
    const boothsSnapshot = await db.collection("booths").get();

    const boothResults = await Promise.all(
      boothsSnapshot.docs.map(async (boothDoc) => {
        const boothData = boothDoc.data();
        const boothId = boothDoc.id;

        // Get ratings created within the fair's time window
        const ratingsSnapshot = await db.collection("booths").doc(boothId)
          .collection("ratings")
          .where("createdAt", ">=", startTime)
          .where("createdAt", "<=", endTime)
          .get();

        const ratings = [];
        let sum = 0;
        ratingsSnapshot.forEach((rDoc) => {
          const d = rDoc.data();
          ratings.push({
            studentId: d.studentId,
            rating: d.rating,
            comment: d.comment || null,
            createdAt: d.createdAt ? d.createdAt.toMillis() : null,
          });
          sum += d.rating;
        });

        const averageRating = ratings.length > 0 ? Math.round((sum / ratings.length) * 10) / 10 : null;

        return {
          boothId,
          companyName: boothData.companyName || "",
          averageRating,
          totalRatings: ratings.length,
          ratings,
        };
      })
    );
```

Replace with:

```js
    // Get only registered booths
    const registeredBoothIds = fairData.registeredBoothIds || [];
    const boothDocs = await Promise.all(
      registeredBoothIds.map((id) => db.collection("booths").doc(id).get())
    );

    const boothResults = await Promise.all(
      boothDocs
        .filter((boothDoc) => boothDoc.exists)
        .map(async (boothDoc) => {
          const boothData = boothDoc.data();
          const boothId = boothDoc.id;

          // Get ratings created within the fair's time window
          const ratingsSnapshot = await db.collection("booths").doc(boothId)
            .collection("ratings")
            .where("createdAt", ">=", startTime)
            .where("createdAt", "<=", endTime)
            .get();

          const ratings = [];
          let sum = 0;
          ratingsSnapshot.forEach((rDoc) => {
            const d = rDoc.data();
            ratings.push({
              studentId: d.studentId,
              rating: d.rating,
              comment: d.comment || null,
              createdAt: d.createdAt ? d.createdAt.toMillis() : null,
            });
            sum += d.rating;
          });

          const averageRating = ratings.length > 0 ? Math.round((sum / ratings.length) * 10) / 10 : null;

          return {
            boothId,
            companyName: boothData.companyName || "",
            averageRating,
            totalRatings: ratings.length,
            ratings,
          };
        })
    );
```

- [ ] **Step 6: Run all booth tests**

```bash
cd backend && npx jest __tests__/fairBooths.test.js --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/server.js backend/__tests__/fairBooths.test.js
git commit -m "feat: filter /api/fairs/:fairId/booths to registeredBoothIds only"
```

---

## Chunk 3: Frontend — join fair UI and student listing filter

### Task 4: "Join a Fair" card in BoothView.tsx

**Files:**
- Modify: `frontend/src/pages/BoothView.tsx`

- [ ] **Step 1: Add state and handler for joining a fair**

In `BoothView.tsx`, add inside the component body near other `useState` declarations:

```tsx
const [joinCode, setJoinCode] = useState("")
const [joinError, setJoinError] = useState("")
const [joinSuccess, setJoinSuccess] = useState("")
const [joiningFair, setJoiningFair] = useState(false)
```

Add the handler function inside the component:

```tsx
const handleJoinFair = async () => {
  setJoinError("")
  setJoinSuccess("")
  if (!joinCode.trim()) {
    setJoinError("Please enter an invite code")
    return
  }
  if (!auth.currentUser) {
    setJoinError("You must be logged in to join a fair")
    return
  }
  setJoiningFair(true)
  try {
    const token = await auth.currentUser.getIdToken()
    const res = await fetch(`${API_URL}/api/fairs/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ inviteCode: joinCode.trim() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setJoinError(data.error || "Failed to join fair")
    } else {
      setJoinSuccess(`Joined "${data.fairName || "fair"}" successfully`)
      setJoinCode("")
    }
  } catch {
    setJoinError("Network error. Please try again.")
  } finally {
    setJoiningFair(false)
  }
}
```

- [ ] **Step 2: Add "Join a Fair" card to JSX**

In `BoothView.tsx`, add this card inside the returned JSX. Place it right before the job listings section. Only render it for `companyOwner` and `representative` roles:

```tsx
{(user?.role === "companyOwner" || user?.role === "representative") && (
  <Card sx={{ mb: 3 }}>
    <CardContent>
      <Typography variant="h6" gutterBottom>
        Join a Career Fair
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter the invite code provided by the fair organizer to register your booth.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        <TextField
          label="Fair Invite Code"
          size="small"
          value={joinCode}
          onChange={(e) => {
            setJoinCode(e.target.value.toUpperCase())
            setJoinError("")
            setJoinSuccess("")
          }}
          error={!!joinError}
          helperText={joinError}
          inputProps={{ maxLength: 20 }}
          sx={{ flex: 1 }}
        />
        <Button
          variant="contained"
          onClick={handleJoinFair}
          disabled={joiningFair}
          sx={{ mt: 0.5 }}
        >
          {joiningFair ? "Joining…" : "Join Fair"}
        </Button>
      </Box>
      {joinSuccess && (
        <Alert severity="success" sx={{ mt: 1 }}>
          {joinSuccess}
        </Alert>
      )}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Verify the build passes**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/BoothView.tsx
git commit -m "feat: add Join a Fair card to BoothView for company owners and reps"
```

---

### Task 5: Filter student booth listing to registered booths

**Files:**
- Modify: `frontend/src/pages/Booths.tsx` — lines ~204–227 (the `if (fairIsLive)` block)

When the fair is live via a schedule, fetch only registered booths. When the fair is live via manual toggle only (`fairIsLive && !activeScheduleId`), fall back to showing all booths so no regression occurs.

- [ ] **Step 1: Update the live fair booth-fetching block**

In `Booths.tsx`, replace the `if (fairIsLive)` block:

**Before:**
```tsx
      if (fairIsLive) {
        // Fair is live - show all booths
        const q = query(collection(db, "booths"), orderBy("companyName"))
        const querySnapshot = await getDocs(q)

        // Also fetch companies to map boothId to companyId
        const companiesSnapshot = await getDocs(collection(db, "companies"))
        const boothIdToCompanyId: Record<string, string> = {}
        companiesSnapshot.forEach((companyDoc) => {
          const companyData = companyDoc.data()
          if (companyData.boothId) {
            boothIdToCompanyId[companyData.boothId] = companyDoc.id
          }
        })

        querySnapshot.forEach((doc) => {
          const boothData = doc.data()
          const companyId = boothData.companyId || boothIdToCompanyId[doc.id] || undefined
          boothsList.push({
            id: doc.id,
            ...boothData,
            companyId,
          } as Booth)
        })
      }
```

**After:**
```tsx
      if (fairIsLive && status.activeScheduleId) {
        // Fair is live with an active schedule — show only registered booths
        const scheduleDoc = await getDoc(doc(db, "fairSchedules", status.activeScheduleId))
        const registeredBoothIds: string[] = scheduleDoc.exists()
          ? (scheduleDoc.data().registeredBoothIds || [])
          : []

        if (registeredBoothIds.length > 0) {
          const boothDocs = await Promise.all(
            registeredBoothIds.map((id) => getDoc(doc(db, "booths", id)))
          )

          // Fetch companies to map boothId -> companyId
          const companiesSnapshot = await getDocs(collection(db, "companies"))
          const boothIdToCompanyId: Record<string, string> = {}
          companiesSnapshot.forEach((companyDoc) => {
            const companyData = companyDoc.data()
            if (companyData.boothId) {
              boothIdToCompanyId[companyData.boothId] = companyDoc.id
            }
          })

          boothDocs.forEach((boothDoc) => {
            if (!boothDoc.exists()) return
            const boothData = boothDoc.data()
            const companyId = boothData.companyId || boothIdToCompanyId[boothDoc.id] || undefined
            boothsList.push({
              id: boothDoc.id,
              ...boothData,
              companyId,
            } as Booth)
          })
        }
      } else if (fairIsLive) {
        // Fair is live via manual toggle only (no active schedule) — show all booths
        const q = query(collection(db, "booths"), orderBy("companyName"))
        const querySnapshot = await getDocs(q)

        const companiesSnapshot = await getDocs(collection(db, "companies"))
        const boothIdToCompanyId: Record<string, string> = {}
        companiesSnapshot.forEach((companyDoc) => {
          const companyData = companyDoc.data()
          if (companyData.boothId) {
            boothIdToCompanyId[companyData.boothId] = companyDoc.id
          }
        })

        querySnapshot.forEach((boothDoc) => {
          const boothData = boothDoc.data()
          const companyId = boothData.companyId || boothIdToCompanyId[boothDoc.id] || undefined
          boothsList.push({
            id: boothDoc.id,
            ...boothData,
            companyId,
          } as Booth)
        })
      }
```

- [ ] **Step 2: Verify the build passes**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run all backend tests to catch regressions**

```bash
cd backend && npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Booths.tsx
git commit -m "feat: show only registered booths to students during live fair"
```
