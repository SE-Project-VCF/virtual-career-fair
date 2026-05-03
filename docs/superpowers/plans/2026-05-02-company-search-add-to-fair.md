# Company Search When Adding to Fair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Firestore-ID paste field in the "Add Company to Fair" dialog with a debounced search-Autocomplete picker backed by a new `/api/companies/search` endpoint.

**Architecture:** Backend prefix-queries a new `companyNameLower` field (lazily backfilled, plus a one-time script), joins per-fair enrollment status, and returns `{ companyId, companyName, logoUrl, industry, primaryLocation, alreadyEnrolled }` rows. Frontend swaps the `TextField` for an MUI `Autocomplete` that debounces input 250 ms, disables already-enrolled rows, and feeds the selected `companyId` into the existing enroll POST.

**Tech Stack:** Node/Express + Firebase Admin SDK on the backend (Jest + supertest tests). React + MUI + Vite + Vitest on the frontend.

**Spec:** [docs/superpowers/specs/2026-05-01-company-search-add-to-fair-design.md](../specs/2026-05-01-company-search-add-to-fair-design.md)

---

## File Structure

**Backend — modify**
- `backend/routes/companies.js` — add `GET /api/companies/search`; write `companyNameLower` on POST `/companies`.
- `backend/__tests__/companiesSearch.test.js` — new test file for the search route + create-side write.

**Backend — create**
- `backend/scripts/backfillCompanyNameLower.js` — one-time idempotent backfill script.

**Frontend — modify**
- `frontend/src/pages/FairAdminDashboard.tsx` — replace the `TextField` in the Add Company dialog with `Autocomplete`; add debounced search effect; gate "Add Company" button on a selected (non-enrolled) option.
- `frontend/src/pages/__tests__/FairAdminDashboard.addCompany.test.tsx` — new test file for the search-driven dialog flow.

No changes to the existing `/api/fairs/:fairId/enroll` route or its tests — the enroll call from the dialog is byte-identical to today.

---

## Task 1: Backend — write `companyNameLower` on company creation

**Files:**
- Modify: `backend/routes/companies.js:32-38`
- Test: `backend/__tests__/companiesSearch.test.js`

- [ ] **Step 1: Create the test file with the failing create-side test**

Create `backend/__tests__/companiesSearch.test.js`:

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
  db: { collection: jest.fn(), batch: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

jest.mock("../streamServerClient", () => ({
  streamServerClient: {
    upsertUser: jest.fn().mockResolvedValue({}),
    createToken: jest.fn().mockReturnValue("tok"),
    queryChannels: jest.fn().mockResolvedValue([]),
  },
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin } = require("../helpers");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "owner-uid", email: "o@test.com" });
});

describe("POST /api/companies — companyNameLower write", () => {
  it("writes companyNameLower alongside companyName on creation", async () => {
    const setSpy = jest.fn().mockResolvedValue();
    const updateSpy = jest.fn().mockResolvedValue();
    const ownerDoc = mockDocSnap({ role: "companyOwner" }, true, "owner-uid");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(ownerDoc),
            update: updateSpy,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            id: "new-company-id",
            set: setSpy,
          })),
        };
      }
      return {};
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", VALID_TOKEN)
      .send({ companyName: "Acme Corp" });

    expect(res.status).toBe(201);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const written = setSpy.mock.calls[0][0];
    expect(written.companyName).toBe("Acme Corp");
    expect(written.companyNameLower).toBe("acme corp");
  });

  it("lowercases trimmed companyName for companyNameLower", async () => {
    const setSpy = jest.fn().mockResolvedValue();
    const ownerDoc = mockDocSnap({ role: "companyOwner" }, true, "owner-uid");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(ownerDoc),
            update: jest.fn().mockResolvedValue(),
          })),
        };
      }
      if (name === "companies") {
        return { doc: jest.fn(() => ({ id: "c2", set: setSpy })) };
      }
      return {};
    });

    await request(app)
      .post("/api/companies")
      .set("Authorization", VALID_TOKEN)
      .send({ companyName: "  MixedCASE Co  " });

    const written = setSpy.mock.calls[0][0];
    expect(written.companyName).toBe("MixedCASE Co");
    expect(written.companyNameLower).toBe("mixedcase co");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && npx jest __tests__/companiesSearch.test.js -t "companyNameLower write"`
Expected: 2 failing tests — `written.companyNameLower` is `undefined`.

- [ ] **Step 3: Add `companyNameLower` to the create payload**

In `backend/routes/companies.js`, modify the `set()` call (currently lines 32-38):

```javascript
const trimmedName = companyName.trim();
await companyRef.set(removeUndefined({
  companyId,
  companyName: trimmedName,
  companyNameLower: trimmedName.toLowerCase(),
  ownerId,
  inviteCode: rawCode,
  createdAt: admin.firestore.Timestamp.now(),
}));

// Update user doc with companyId (no invite code stored on user)
await db.collection("users").doc(ownerId).update({ companyId, companyName: trimmedName });
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && npx jest __tests__/companiesSearch.test.js -t "companyNameLower write"`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/companies.js backend/__tests__/companiesSearch.test.js
git commit -m "feat(companies): write companyNameLower on company creation"
```

---

## Task 2: Backend — one-time backfill script

**Files:**
- Create: `backend/scripts/backfillCompanyNameLower.js`

This script is run manually; it has no automated test. Verify locally with the Firebase emulator if available, otherwise rely on idempotency + dry-run output.

- [ ] **Step 1: Create the script**

Create `backend/scripts/backfillCompanyNameLower.js`:

```javascript
/**
 * One-time backfill: writes companyNameLower on every company doc that lacks it.
 * Idempotent — safe to re-run. Skips docs that already have a matching value.
 *
 * Usage:
 *   node backend/scripts/backfillCompanyNameLower.js          # dry run
 *   node backend/scripts/backfillCompanyNameLower.js --apply  # write changes
 */
const { db } = require("../firebase");

async function main() {
  const apply = process.argv.includes("--apply");
  const snap = await db.collection("companies").get();
  let toUpdate = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const expected = (data.companyName || "").trim().toLowerCase();
    if (!expected) {
      skipped += 1;
      continue;
    }
    if (data.companyNameLower === expected) {
      skipped += 1;
      continue;
    }
    toUpdate += 1;
    console.log(`[${apply ? "apply" : "dry"}] ${doc.id}: "${data.companyName}" -> "${expected}"`);
    if (apply) {
      await doc.ref.update({ companyNameLower: expected });
    }
  }

  console.log(`Done. ${toUpdate} ${apply ? "updated" : "would update"}, ${skipped} skipped.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
```

- [ ] **Step 2: Verify script syntax**

Run: `cd backend && node --check scripts/backfillCompanyNameLower.js`
Expected: no output (exit 0) — no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/backfillCompanyNameLower.js
git commit -m "chore(backend): add backfillCompanyNameLower one-time script"
```

---

## Task 3: Backend — `GET /api/companies/search` route

**Files:**
- Modify: `backend/routes/companies.js` (add new route above `module.exports = router`)
- Test: `backend/__tests__/companiesSearch.test.js` (extend existing file)

**Firestore prefix pattern:** A Firestore string prefix query uses a range where the upper bound is `q + ""`. The character `` (U+F8FF) is a high private-use code point that sorts after all normal text, so `where("field", "<", q + "")` matches everything that starts with `q`.

- [ ] **Step 1: Append the following test blocks to `backend/__tests__/companiesSearch.test.js`**

```javascript
describe("GET /api/companies/search", () => {
  function setupSearchMocks({
    matches = [],
    enrollments = {},
    isAdmin = true,
  } = {}) {
    if (isAdmin) {
      verifyAdmin.mockResolvedValue(null);
    } else {
      verifyAdmin.mockResolvedValue({ status: 403, error: "Only administrators..." });
    }

    const updateSpy = jest.fn().mockResolvedValue();

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const docs = matches.map((m) => ({
          id: m.companyId,
          data: () => m,
          ref: { update: updateSpy },
        }));
        const querySnap = { docs, empty: docs.length === 0 };
        const chain = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
        return chain;
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn((cid) => ({
                get: jest.fn().mockResolvedValue(
                  mockDocSnap(enrollments[cid] ?? null, !!enrollments[cid], cid)
                ),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    return { updateSpy };
  }

  it("returns 401 when unauthenticated", async () => {
    auth.verifyIdToken.mockRejectedValueOnce(new Error("invalid"));
    const res = await request(app).get("/api/companies/search?q=acme&fairId=f1");
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not an administrator", async () => {
    setupSearchMocks({ isAdmin: false });
    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(403);
  });

  it("returns 400 when q is missing", async () => {
    setupSearchMocks();
    const res = await request(app)
      .get("/api/companies/search?fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/q/i);
  });

  it("returns 400 when q is empty after trim", async () => {
    setupSearchMocks();
    const res = await request(app)
      .get("/api/companies/search?q=%20%20&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
  });

  it("returns 400 when fairId is missing", async () => {
    setupSearchMocks();
    const res = await request(app)
      .get("/api/companies/search?q=acme")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fairId/i);
  });

  it("returns matching companies with shaped fields", async () => {
    setupSearchMocks({
      matches: [
        {
          companyId: "c1",
          companyName: "Acme Corp",
          companyNameLower: "acme corp",
          logoUrl: "https://logo/acme.png",
          industry: "Software",
          remoteEmployer: false,
          officeLocations: [{ city: "Austin", state: "TX" }],
        },
      ],
    });

    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      {
        companyId: "c1",
        companyName: "Acme Corp",
        logoUrl: "https://logo/acme.png",
        industry: "Software",
        primaryLocation: "Austin, TX",
        alreadyEnrolled: false,
      },
    ]);
  });

  it("marks already-enrolled companies", async () => {
    setupSearchMocks({
      matches: [
        { companyId: "c1", companyName: "Acme", companyNameLower: "acme" },
        { companyId: "c2", companyName: "Acme Two", companyNameLower: "acme two" },
      ],
      enrollments: { c1: { companyId: "c1" } },
    });

    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.results.map((r) => [r.companyId, r]));
    expect(byId.c1.alreadyEnrolled).toBe(true);
    expect(byId.c2.alreadyEnrolled).toBe(false);
  });

  it("lowercases q before querying (case-insensitive search)", async () => {
    let receivedLowerBound = null;

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const chain = {
          where: jest.fn(function (field, op, value) {
            if (op === ">=") receivedLowerBound = value;
            return chain;
          }),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        };
        return chain;
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
            })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/companies/search?q=ACME&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(receivedLowerBound).toBe("acme");
  });

  it("resolves primaryLocation to 'Remote' for remote employers", async () => {
    setupSearchMocks({
      matches: [
        {
          companyId: "c1",
          companyName: "Remote Co",
          companyNameLower: "remote co",
          remoteEmployer: true,
          officeLocations: [],
        },
      ],
    });
    const res = await request(app)
      .get("/api/companies/search?q=remote&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.body.results[0].primaryLocation).toBe("Remote");
  });

  it("resolves primaryLocation to null when no remote and no offices", async () => {
    setupSearchMocks({
      matches: [
        { companyId: "c1", companyName: "Mystery", companyNameLower: "mystery" },
      ],
    });
    const res = await request(app)
      .get("/api/companies/search?q=mystery&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.body.results[0].primaryLocation).toBeNull();
  });

  it("clamps limit to 50", async () => {
    let receivedLimit = null;
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const chain = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn(function (n) { receivedLimit = n; return chain; }),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        };
        return chain;
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    verifyAdmin.mockResolvedValue(null);

    await request(app)
      .get("/api/companies/search?q=a&fairId=f1&limit=999")
      .set("Authorization", VALID_TOKEN);

    expect(receivedLimit).toBe(50);
  });

  it("lazy-backfills companyNameLower for hits that lack it", async () => {
    const { updateSpy } = setupSearchMocks({
      matches: [
        { companyId: "c1", companyName: "Acme" /* no companyNameLower */ },
      ],
    });

    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(updateSpy).toHaveBeenCalledWith({ companyNameLower: "acme" });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest __tests__/companiesSearch.test.js -t "companies/search"`
Expected: every test in the new `describe` block fails (route does not exist yet, returns 404).

- [ ] **Step 3: Add `verifyAdmin` to the import at the top of `backend/routes/companies.js`**

Change:
```javascript
const { verifyFirebaseToken, generateInviteCode, removeUndefined } = require("../helpers");
```
To:
```javascript
const { verifyFirebaseToken, generateInviteCode, removeUndefined, verifyAdmin } = require("../helpers");
```

- [ ] **Step 4: Add the search route to `backend/routes/companies.js` just above `module.exports = router;`**

```javascript
/* ----------------------------------------------------
   SEARCH COMPANIES BY NAME PREFIX (admin only)
   GET /api/companies/search?q=<prefix>&fairId=<id>&limit=20
---------------------------------------------------- */
router.get("/companies/search", verifyFirebaseToken, async (req, res) => {
  try {
    const adminError = await verifyAdmin(req.user.uid);
    if (adminError) {
      return res.status(adminError.status).json({ error: adminError.error });
    }

    const rawQ = (req.query.q ?? "").toString().trim();
    if (!rawQ) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const fairId = (req.query.fairId ?? "").toString().trim();
    if (!fairId) {
      return res.status(400).json({ error: "Query parameter 'fairId' is required" });
    }
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(50, requestedLimit))
      : 20;

    const q = rawQ.toLowerCase();
    const prefixEnd = q + "\uf8ff"; // U+F8FF — high private-use char, sorts after all normal text

    const querySnap = await db
      .collection("companies")
      .where("companyNameLower", ">=", q)
      .where("companyNameLower", "<", prefixEnd)
      .orderBy("companyNameLower")
      .limit(limit)
      .get();

    const enrollmentDocs = await Promise.all(
      querySnap.docs.map((d) =>
        db.collection("fairs").doc(fairId).collection("enrollments").doc(d.id).get()
      )
    );

    const results = querySnap.docs.map((d, i) => {
      const data = d.data();
      const office = Array.isArray(data.officeLocations) ? data.officeLocations[0] : null;
      let primaryLocation = null;
      if (data.remoteEmployer) {
        primaryLocation = "Remote";
      } else if (office && office.city && office.state) {
        primaryLocation = `${office.city}, ${office.state}`;
      } else if (office && office.city) {
        primaryLocation = office.city;
      }

      if (typeof data.companyNameLower !== "string") {
        const expected = (data.companyName || "").trim().toLowerCase();
        if (expected) {
          d.ref
            .update({ companyNameLower: expected })
            .catch((err) => console.error("companyNameLower backfill failed:", err));
        }
      }

      return {
        companyId: d.id,
        companyName: data.companyName || "",
        logoUrl: data.logoUrl || null,
        industry: data.industry || null,
        primaryLocation,
        alreadyEnrolled: enrollmentDocs[i].exists,
      };
    });

    return res.json({ results });
  } catch (err) {
    console.error("GET /api/companies/search error:", err);
    return res.status(500).json({ error: "Failed to search companies" });
  }
});
```

- [ ] **Step 5: Run the tests and verify they all pass**

Run: `cd backend && npx jest __tests__/companiesSearch.test.js`
Expected: all tests in the file PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/companies.js backend/__tests__/companiesSearch.test.js
git commit -m "feat(companies): add GET /api/companies/search with enrollment status"
```

---

## Task 4: Frontend — replace TextField with Autocomplete in Add Company dialog

**Files:**
- Modify: `frontend/src/pages/FairAdminDashboard.tsx`
- Test: `frontend/src/pages/__tests__/FairAdminDashboard.addCompany.test.tsx`

- [ ] **Step 1: Create the failing frontend test**

Create `frontend/src/pages/__tests__/FairAdminDashboard.addCompany.test.tsx`:

```typescript
/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAdminDashboard from "../FairAdminDashboard"
import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => vi.fn() }
})
vi.mock("../../utils/auth", () => ({
  authUtils: { getCurrentUser: vi.fn() },
}))
vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
  FairProvider: ({ children }: any) => <>{children}</>,
}))
vi.mock("../ProfileMenu", () => ({ default: () => <div data-testid="profile-menu" /> }))
vi.mock("../../config", () => ({ API_URL: "http://localhost:5000" }))
vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => ({ options: [], loading: false }),
}))
vi.mock("../../firebase", () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") } },
}))

const renderDashboard = () =>
  render(<BrowserRouter><FairAdminDashboard /></BrowserRouter>)

function fairContextValue() {
  return {
    setFair: vi.fn(),
    loading: false,
    fair: { id: "f1", name: "Spring Fair", adminId: "admin-1", isLive: false, startTime: null, endTime: null },
    fairId: "f1",
    isLive: false,
  } as any
}

describe("FairAdminDashboard — Add Company search", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1", email: "admin@example.com", role: "administrator",
    })
    vi.mocked(useFair).mockReturnValue(fairContextValue())
  })

  function installFetch(searchResults: any[], onEnroll?: (body: any) => void) {
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
      const u = String(url)
      if (u.includes("/companies/search")) {
        return Promise.resolve({ ok: true, json: async () => ({ results: searchResults }) })
      }
      if (u.includes("/enroll") && init?.method === "POST") {
        if (onEnroll) onEnroll(JSON.parse(init.body))
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ boothIds: ["b1"] }) })
      }
      if (u.includes("/announcements")) {
        return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
    }) as any
  }

  it("queries the search endpoint after typing and renders options", async () => {
    installFetch([
      { companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: "Software", primaryLocation: "Austin, TX", alreadyEnrolled: false },
    ])
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole("button", { name: /add company/i }))
    const input = await screen.findByLabelText(/search company/i)
    await user.type(input, "acme")

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    })
    expect(
      (globalThis.fetch as any).mock.calls.some(([u]: [string]) =>
        String(u).includes("/companies/search") && String(u).includes("q=acme")
      )
    ).toBe(true)
  })

  it("disables already-enrolled options and shows label", async () => {
    installFetch([
      { companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: null, primaryLocation: null, alreadyEnrolled: true },
    ])
    const user = userEvent.setup()
    renderDashboard()
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "acme")

    const option = await screen.findByText("Acme Corp")
    expect(option.closest("li")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/already enrolled/i)).toBeInTheDocument()
  })

  it("posts the selected companyId to the enroll endpoint", async () => {
    let enrollBody: any = null
    installFetch(
      [{ companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: null, primaryLocation: null, alreadyEnrolled: false }],
      (body) => { enrollBody = body }
    )
    const user = userEvent.setup()
    renderDashboard()
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "acme")
    await user.click(await screen.findByText("Acme Corp"))
    await user.click(screen.getByRole("button", { name: /^add company$/i }))

    await waitFor(() => {
      expect(enrollBody).toEqual({ companyId: "c1" })
    })
  })

  it("shows search error message when the search request fails", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/companies/search")) {
        return Promise.resolve({ ok: false, json: async () => ({ error: "Search failed" }) })
      }
      if (u.includes("/announcements")) {
        return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
    }) as any

    const user = userEvent.setup()
    renderDashboard()
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "xyz")

    await waitFor(() => {
      expect(screen.getByText(/search failed/i)).toBeInTheDocument()
    })
  })

  it("clears state when the dialog is cancelled", async () => {
    installFetch([
      { companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: null, primaryLocation: null, alreadyEnrolled: false },
    ])
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "acme")
    await screen.findByText("Acme Corp")

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    // Re-open — input should be empty
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    expect(screen.getByLabelText(/search company/i)).toHaveValue("")
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && npx vitest run src/pages/__tests__/FairAdminDashboard.addCompany.test.tsx`
Expected: tests fail — `getByLabelText("search company")` does not exist (current dialog shows "Company ID").

- [ ] **Step 3: Replace state declarations (lines 84-88) in `frontend/src/pages/FairAdminDashboard.tsx`**

Remove:
```typescript
  // Add company dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addCompanyId, setAddCompanyId] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
```

Replace with:
```typescript
  // Add company dialog
  type CompanySearchResult = {
    companyId: string
    companyName: string
    logoUrl: string | null
    industry: string | null
    primaryLocation: string | null
    alreadyEnrolled: boolean
  }
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [companyQuery, setCompanyQuery] = useState("")
  const [companyOptions, setCompanyOptions] = useState<CompanySearchResult[]>([])
  const [companySearchLoading, setCompanySearchLoading] = useState(false)
  const [companySearchError, setCompanySearchError] = useState("")
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
```

- [ ] **Step 4: Add the `useRef` import and debounced search effect**

Add `useRef` to the React import at line 1 (it currently reads `import { useState, useEffect } from "react"`):
```typescript
import { useState, useEffect, useRef } from "react"
```

Then add the debounced search effect inside the component body, near the other `useEffect` hooks:
```typescript
  useEffect(() => {
    if (!addDialogOpen) return
    const trimmed = companyQuery.trim()
    if (trimmed.length < 2) {
      setCompanyOptions([])
      setCompanySearchError("")
      setCompanySearchLoading(false)
      return
    }

    let cancelled = false
    setCompanySearchLoading(true)
    setCompanySearchError("")

    const timer = setTimeout(async () => {
      try {
        const token = await getToken()
        const url = `${API_URL}/api/companies/search?q=${encodeURIComponent(trimmed)}&fairId=${encodeURIComponent(fairId || "")}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setCompanyOptions([])
          setCompanySearchError(data.error || "Search failed — try again")
          return
        }
        setCompanyOptions(data.results || [])
      } catch {
        if (!cancelled) {
          setCompanyOptions([])
          setCompanySearchError("Search failed — try again")
        }
      } finally {
        if (!cancelled) setCompanySearchLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [companyQuery, addDialogOpen, fairId])
```

- [ ] **Step 5: Replace `handleAddCompany` (lines 401-423)**

```typescript
  const handleAddCompany = async () => {
    if (!selectedCompany || selectedCompany.alreadyEnrolled) return
    setAdding(true)
    setAddError("")
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: selectedCompany.companyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add company")
      setAddDialogOpen(false)
      setCompanyQuery("")
      setSelectedCompany(null)
      setCompanyOptions([])
      setSuccess("Company enrolled successfully")
      loadEnrollments()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }
```

- [ ] **Step 6: Replace the Add Company Dialog block (lines 1000-1021)**

```tsx
      {/* Add Company Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false)
          setCompanyQuery("")
          setSelectedCompany(null)
          setCompanyOptions([])
          setAddError("")
          setCompanySearchError("")
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Company to Fair</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Search for a company by name and select it from the list.
          </Typography>
          <Autocomplete
            options={companyOptions}
            value={selectedCompany}
            onChange={(_, value) => setSelectedCompany(value)}
            inputValue={companyQuery}
            onInputChange={(_, value) => setCompanyQuery(value)}
            loading={companySearchLoading}
            filterOptions={(opts) => opts}
            getOptionLabel={(opt) => opt.companyName}
            isOptionEqualToValue={(a, b) => a.companyId === b.companyId}
            getOptionDisabled={(opt) => opt.alreadyEnrolled}
            noOptionsText={
              companyQuery.trim().length < 2
                ? "Type at least 2 characters"
                : companySearchError || "No companies found"
            }
            renderOption={(props, option) => (
              <li {...props} key={option.companyId}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%" }}>
                  <Box
                    component="img"
                    src={option.logoUrl || ""}
                    alt=""
                    sx={{ width: 32, height: 32, borderRadius: 1, objectFit: "cover", bgcolor: "grey.200", flexShrink: 0 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden" }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{option.companyName}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {option.alreadyEnrolled
                        ? "Already enrolled in this fair"
                        : [option.industry, option.primaryLocation].filter(Boolean).join(" • ") || "—"}
                    </Typography>
                  </Box>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search company"
                placeholder="Start typing a company name"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {companySearchLoading ? <CircularProgress color="inherit" size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          {addError && <Alert severity="error" sx={{ mt: 2 }}>{addError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddDialogOpen(false)
              setCompanyQuery("")
              setSelectedCompany(null)
              setCompanyOptions([])
              setAddError("")
              setCompanySearchError("")
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddCompany}
            disabled={adding || !selectedCompany || selectedCompany.alreadyEnrolled}
          >
            {adding ? "Adding..." : "Add Company"}
          </Button>
        </DialogActions>
      </Dialog>
```

- [ ] **Step 7: Run the new tests and verify they pass**

Run: `cd frontend && npx vitest run src/pages/__tests__/FairAdminDashboard.addCompany.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 8: Run the existing FairAdminDashboard tests and fix any regressions**

Run: `cd frontend && npx vitest run src/pages/__tests__/FairAdminDashboard.test.tsx src/pages/__tests__/FairAdminDashboard.announcements.test.tsx src/pages/__tests__/FairAdminDashboard.hub.test.tsx`

If any test asserts on the old "Company ID" label or `addCompanyId` state, update that assertion to match the new search UX (the underlying enroll flow is unchanged). Only update the assertion strings — no logic changes should be needed.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/FairAdminDashboard.tsx frontend/src/pages/__tests__/FairAdminDashboard.addCompany.test.tsx
git commit -m "feat(fair-admin): replace company-ID input with search picker"
```

---

## Task 5: Manual smoke + final verification

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npx jest`
Expected: all tests PASS.

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 3: Start the dev servers**

In one terminal: check `backend/package.json` scripts for the dev start command (typically `npm run dev` or `node index.js`), then run it.
In another: `cd frontend && npm run dev`.

- [ ] **Step 4: Browser smoke test (as an administrator)**

1. Sign in as an admin and navigate to a fair's admin dashboard.
2. Click "Add Company" — the dialog opens with the new search field.
3. Type 1 character — no request fires; helper text reads "Type at least 2 characters".
4. Type a partial name in mixed case (e.g. "ac" for "Acme Corp") — after ~250 ms, results appear with logo, name, and secondary line (industry/location).
5. An already-enrolled row is visibly disabled and shows "Already enrolled in this fair".
6. Select a non-enrolled row — "Add Company" button enables.
7. Click "Add Company" — dialog closes, success message appears, new row appears in the enrollments table.
8. Re-open the dialog, search same name — the just-enrolled company is now disabled.

- [ ] **Step 5: Run the backfill script (when connected to a real Firebase project)**

```bash
cd backend
node scripts/backfillCompanyNameLower.js          # dry run — shows what would change
node scripts/backfillCompanyNameLower.js --apply  # writes changes
```

Running `--apply` a second time should print `0 updated` (idempotent).

---

## Rollout order

1. Land Tasks 1–3 first (backend write-side + search route + script). New companies immediately get `companyNameLower`.
2. Run the backfill script in dev → staging → prod.
3. Land Task 4 (frontend). The paste-ID field disappears; no feature flag needed.
