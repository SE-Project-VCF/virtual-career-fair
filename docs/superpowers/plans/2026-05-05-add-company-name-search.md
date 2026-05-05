# Add Company Name Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw Firestore ID text field in the "Add Company to Fair" dialog with a name-search autocomplete that also supports re-enrolling already-enrolled companies.

**Architecture:** New admin-only `GET /api/companies/search?q=` endpoint does a Firestore prefix range query on `companyName`. The frontend Autocomplete debounces keystrokes (300 ms), fetches results, marks already-enrolled companies with an "(Enrolled)" chip, and switches the submit button to "Re-enroll" when one is selected. Re-enroll DELETEs the existing enrollment then POSTs a fresh one.

**Tech Stack:** Express + Firestore Admin SDK (backend); React + MUI Autocomplete + vitest (frontend)

---

## Files

| Action | Path |
|--------|------|
| Modify | `backend/routes/companies.js` |
| Modify | `frontend/src/pages/FairAdminDashboard.tsx` |
| Modify | `frontend/src/pages/__tests__/FairAdminDashboard.test.tsx` |

---

## Task 1: Backend — company search endpoint

**Files:**
- Modify: `backend/routes/companies.js` (add before `module.exports`)

- [ ] **Step 1: Write the failing test**

Add to `backend/__tests__/routes/companies.test.js` (or create if it doesn't exist) — check existing test file first. If the companies route test file doesn't exist yet, create it with this boilerplate:

```js
// backend/__tests__/routes/companies.test.js
const request = require("supertest");
const express = require("express");

// Mock firebase and helpers before requiring route
jest.mock("../../firebase", () => ({
  db: {
    collection: jest.fn(),
  },
}));
jest.mock("../../helpers", () => ({
  verifyFirebaseToken: (req, _res, next) => {
    req.user = { uid: "admin-uid" };
    next();
  },
  generateInviteCode: jest.fn(() => "ABC123"),
  removeUndefined: (obj) => obj,
}));

const { db } = require("../../firebase");
const companiesRouter = require("../../routes/companies");

const app = express();
app.use(express.json());
app.use("/api", companiesRouter);

describe("GET /api/companies/search", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when caller is not an admin", async () => {
    db.collection.mockReturnValue({
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: "companyOwner" }) }) }),
    });
    const res = await request(app)
      .get("/api/companies/search?q=Acme")
      .set("Authorization", "Bearer tok");
    expect(res.status).toBe(403);
  });

  it("returns 400 when q param is missing", async () => {
    db.collection.mockReturnValue({
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: "administrator" }) }) }),
    });
    const res = await request(app)
      .get("/api/companies/search")
      .set("Authorization", "Bearer tok");
    expect(res.status).toBe(400);
  });

  it("returns matching companies as [{id, companyName}]", async () => {
    const mockDocs = [
      { id: "c1", data: () => ({ companyName: "Acme Corp" }) },
      { id: "c2", data: () => ({ companyName: "Acme Ltd" }) },
    ];
    db.collection.mockImplementation((col) => {
      if (col === "users") {
        return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: "administrator" }) }) }) };
      }
      // companies collection with where chain
      return {
        where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: mockDocs }) }) }) }),
      };
    });
    const res = await request(app)
      .get("/api/companies/search?q=Acme")
      .set("Authorization", "Bearer tok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "c1", companyName: "Acme Corp" },
      { id: "c2", companyName: "Acme Ltd" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest __tests__/routes/companies.test.js --testNamePattern="GET /api/companies/search" 2>&1 | tail -20
```

Expected: FAIL — route not found (404) or similar.

- [ ] **Step 3: Add the route to `backend/routes/companies.js`**

Insert before the `module.exports = router;` line:

```js
/* ----------------------------------------------------
   SEARCH COMPANIES BY NAME (admin only)
---------------------------------------------------- */
router.get("/companies/search", verifyFirebaseToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "administrator") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const prefix = q.trim();
    const end = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

    const snap = await db
      .collection("companies")
      .where("companyName", ">=", prefix)
      .where("companyName", "<", end)
      .limit(20)
      .get();

    const results = snap.docs.map((d) => ({ id: d.id, companyName: d.data().companyName }));
    return res.json(results);
  } catch (err) {
    console.error("GET /api/companies/search error:", err);
    return res.status(500).json({ error: "Failed to search companies" });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest __tests__/routes/companies.test.js --testNamePattern="GET /api/companies/search" 2>&1 | tail -20
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/companies.js backend/__tests__/routes/companies.test.js
git commit -m "feat: add GET /api/companies/search admin endpoint"
```

---

## Task 2: Frontend — state & search logic

**Files:**
- Modify: `frontend/src/pages/FairAdminDashboard.tsx`

- [ ] **Step 1: Replace add-dialog state**

Find this block (around line 84–88):

```ts
  // Add company dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addCompanyId, setAddCompanyId] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
```

Replace with:

```ts
  // Add company dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; companyName: string } | null>(null)
  const [companySearchInput, setCompanySearchInput] = useState("")
  const [companySearchResults, setCompanySearchResults] = useState<{ id: string; companyName: string }[]>([])
  const [companySearchLoading, setCompanySearchLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
```

- [ ] **Step 2: Add debounced search effect**

After the state block you just edited, add:

```ts
  useEffect(() => {
    if (!companySearchInput.trim() || !addDialogOpen) {
      setCompanySearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setCompanySearchLoading(true)
      try {
        const token = await getToken()
        const res = await fetch(
          `${API_URL}/api/companies/search?q=${encodeURIComponent(companySearchInput.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const data = await res.json()
          setCompanySearchResults(data)
        }
      } catch {
        // silently ignore search errors
      } finally {
        setCompanySearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [companySearchInput, addDialogOpen])
```

- [ ] **Step 3: Update `handleAddCompany` to support re-enroll**

Find the existing `handleAddCompany` function and replace it entirely:

```ts
  const handleAddCompany = async () => {
    if (!selectedCompany) return
    setAdding(true)
    setAddError("")
    const token = await getToken()
    const isEnrolled = enrollments.some((e) => e.id === selectedCompany.id)
    try {
      if (isEnrolled) {
        const delRes = await fetch(`${API_URL}/api/fairs/${fairId}/enrollments/${selectedCompany.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!delRes.ok) {
          const d = await delRes.json().catch(() => ({}))
          throw new Error(d.error || "Failed to remove existing enrollment")
        }
      }
      const res = await fetch(`${API_URL}/api/fairs/${fairId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: selectedCompany.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add company")
      setAddDialogOpen(false)
      setSelectedCompany(null)
      setCompanySearchInput("")
      setSuccess(isEnrolled ? "Company re-enrolled successfully" : "Company enrolled successfully")
      loadEnrollments()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }
```

- [ ] **Step 4: No test yet — move to Task 3 for UI + tests together**

---

## Task 3: Frontend — dialog UI + tests

**Files:**
- Modify: `frontend/src/pages/FairAdminDashboard.tsx`
- Modify: `frontend/src/pages/__tests__/FairAdminDashboard.test.tsx`

- [ ] **Step 1: Write new failing tests**

In `frontend/src/pages/__tests__/FairAdminDashboard.test.tsx`, find the `describe("FairAdminDashboard — add company dialog"` block and **replace** the entire block with:

```tsx
describe("FairAdminDashboard — add company dialog", () => {
  const baseUseFair = {
    fair: { id: "f1", name: "Test Fair", isLive: false, inviteCode: "ABC" },
    setFair: vi.fn(),
    isLive: false,
    loading: false,
    fairId: "f1",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin1",
      role: "administrator",
      email: "admin@test.com",
    } as any)
    vi.mocked(useFair).mockReturnValue(baseUseFair as any)
  })

  function setupFetch(searchResults: { id: string; companyName: string }[] = []) {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/companies/search")) return Promise.resolve({ ok: true, json: async () => searchResults })
      if (u.includes("/f1/announcements")) return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
    })
  }

  it("opens dialog when Add Company button clicked", async () => {
    setupFetch()
    const user = userEvent.setup()
    renderFairAdminDashboard()
    await waitFor(() => expect(screen.getByRole("button", { name: /\+ add company/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    expect(screen.getByText("Add Company to Fair")).toBeInTheDocument()
  })

  it("searches companies by name and shows results", async () => {
    setupFetch([{ id: "c1", companyName: "Acme Corp" }])
    const user = userEvent.setup()
    renderFairAdminDashboard()
    await waitFor(() => expect(screen.getByRole("button", { name: /\+ add company/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    const input = screen.getByRole("combobox")
    await user.type(input, "Acme")
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())
  })

  it("shows (Enrolled) chip for already-enrolled companies in results", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/companies/search")) return Promise.resolve({ ok: true, json: async () => [{ id: "c1", companyName: "Acme Corp" }] })
      if (u.includes("/f1/announcements")) return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [{ id: "c1", companyName: "Acme Corp", enrollmentMethod: "admin", enrolledAt: null }] }) })
    })
    const user = userEvent.setup()
    renderFairAdminDashboard()
    await waitFor(() => expect(screen.getByRole("button", { name: /\+ add company/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    const input = screen.getByRole("combobox")
    await user.type(input, "Acme")
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())
    expect(screen.getByText("Enrolled")).toBeInTheDocument()
  })

  it("shows Re-enroll button when an enrolled company is selected", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/companies/search")) return Promise.resolve({ ok: true, json: async () => [{ id: "c1", companyName: "Acme Corp" }] })
      if (u.includes("/f1/announcements")) return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [{ id: "c1", companyName: "Acme Corp", enrollmentMethod: "admin", enrolledAt: null }] }) })
    })
    const user = userEvent.setup()
    renderFairAdminDashboard()
    await waitFor(() => expect(screen.getByRole("button", { name: /\+ add company/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    const input = screen.getByRole("combobox")
    await user.type(input, "Acme")
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())
    await user.click(screen.getByText("Acme Corp"))
    await waitFor(() => expect(screen.getByRole("button", { name: /re-enroll/i })).toBeInTheDocument())
  })

  it("calls DELETE then POST on re-enroll", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      const u = String(url)
      if (u.includes("/companies/search")) return Promise.resolve({ ok: true, json: async () => [{ id: "c1", companyName: "Acme Corp" }] })
      if (u.includes("/f1/announcements")) return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      if (u.includes("/enrollments/c1") && opts?.method === "DELETE") return Promise.resolve({ ok: true, json: async () => ({}) })
      if (u.includes("/enroll") && opts?.method === "POST") return Promise.resolve({ ok: true, json: async () => ({ boothIds: ["b1"] }) })
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [{ id: "c1", companyName: "Acme Corp", enrollmentMethod: "admin", enrolledAt: null }] }) })
    })
    const user = userEvent.setup()
    renderFairAdminDashboard()
    await waitFor(() => expect(screen.getByRole("button", { name: /\+ add company/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    const input = screen.getByRole("combobox")
    await user.type(input, "Acme")
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())
    await user.click(screen.getByText("Acme Corp"))
    await waitFor(() => expect(screen.getByRole("button", { name: /re-enroll/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /re-enroll/i }))
    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls.map(([url, opts]: any) => `${opts?.method ?? "GET"} ${url}`)
      expect(calls).toEqual(expect.arrayContaining([
        expect.stringContaining("DELETE"),
        expect.stringContaining("/enroll"),
      ]))
    })
  })

  it("shows error in dialog on API failure", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      const u = String(url)
      if (u.includes("/companies/search")) return Promise.resolve({ ok: true, json: async () => [{ id: "bad-id", companyName: "Bad Corp" }] })
      if (u.includes("/f1/announcements")) return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      if (u.includes("/enroll") && opts?.method === "POST") return Promise.resolve({ ok: false, json: async () => ({ error: "Company not found" }) })
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
    })
    const user = userEvent.setup()
    renderFairAdminDashboard()
    await waitFor(() => expect(screen.getByRole("button", { name: /\+ add company/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    const input = screen.getByRole("combobox")
    await user.type(input, "Bad")
    await waitFor(() => expect(screen.getByText("Bad Corp")).toBeInTheDocument())
    await user.click(screen.getByText("Bad Corp"))
    await waitFor(() => expect(screen.getByRole("button", { name: /^add company$/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^add company$/i }))
    await waitFor(() => expect(screen.getByText("Company not found")).toBeInTheDocument())
  })

  it("canceling dialog clears selected company", async () => {
    setupFetch([{ id: "c1", companyName: "Acme Corp" }])
    const user = userEvent.setup()
    renderFairAdminDashboard()
    await waitFor(() => expect(screen.getByRole("button", { name: /\+ add company/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    const input = screen.getByRole("combobox")
    await user.type(input, "Acme")
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())
    await user.click(screen.getByText("Acme Corp"))
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    // reopen — input should be clear
    await user.click(screen.getByRole("button", { name: /\+ add company/i }))
    expect(screen.getByRole("combobox")).toHaveValue("")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/__tests__/FairAdminDashboard.test.tsx 2>&1 | tail -30
```

Expected: multiple FAIL — "combobox" not found, "Re-enroll" not found, etc.

- [ ] **Step 3: Replace the Add Company dialog in `FairAdminDashboard.tsx`**

Find the `{/* Add Company Dialog */}` block (around line 999–1021) and replace it entirely:

```tsx
      {/* Add Company Dialog */}
      <Dialog open={addDialogOpen} onClose={() => {
        setAddDialogOpen(false)
        setSelectedCompany(null)
        setCompanySearchInput("")
        setAddError("")
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Company to Fair</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Search by company name. Already-enrolled companies can be re-enrolled to fix broken enrollments.
          </Typography>
          <Autocomplete
            options={companySearchResults}
            getOptionLabel={(o) => o.companyName}
            inputValue={companySearchInput}
            onInputChange={(_e, val) => setCompanySearchInput(val)}
            value={selectedCompany}
            onChange={(_e, val) => setSelectedCompany(val)}
            loading={companySearchLoading}
            filterOptions={(x) => x}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderOption={(props, option) => {
              const isEnrolled = enrollments.some((e) => e.id === option.id)
              return (
                <li {...props} key={option.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                    <span>{option.companyName}</span>
                    {isEnrolled && <Chip label="Enrolled" size="small" variant="outlined" />}
                  </Box>
                </li>
              )
            }}
            renderInput={(params) => (
              <TextField {...params} label="Search companies" placeholder="Start typing a company name..." />
            )}
          />
          {addError && <Alert severity="error" sx={{ mt: 2 }}>{addError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAddDialogOpen(false)
            setSelectedCompany(null)
            setCompanySearchInput("")
            setAddError("")
          }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddCompany}
            disabled={adding || !selectedCompany}
          >
            {adding
              ? "..."
              : selectedCompany && enrollments.some((e) => e.id === selectedCompany.id)
                ? "Re-enroll"
                : "Add Company"}
          </Button>
        </DialogActions>
      </Dialog>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/__tests__/FairAdminDashboard.test.tsx 2>&1 | tail -30
```

Expected: all tests in the file passing.

- [ ] **Step 5: Run full frontend test suite to check for regressions**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/FairAdminDashboard.tsx frontend/src/pages/__tests__/FairAdminDashboard.test.tsx
git commit -m "feat: replace company ID field with name-search autocomplete, add re-enroll"
```
