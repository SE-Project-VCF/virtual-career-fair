# Ghost Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students hide their profile from the Networking Lounge Attendees list while still participating in group chat.

**Architecture:** Add a persistent `ghostMode` boolean to each user's Firestore document. The attendees endpoint filters ghosted users out. A new `PATCH /api/users/me/ghost-mode` endpoint updates the flag. A MUI `Switch` at the top of the Attendees tab calls the endpoint with optimistic UI.

**Tech Stack:** Express 5, Firebase Admin SDK (Firestore + Auth), Stream Chat, React + MUI, Jest + Supertest, Vitest + React Testing Library.

---

## File Structure

**Backend:**
- Modify `backend/routes/fairs.js` — filter ghosted users in the `lounge/attendees` endpoint (around line 1419)
- Modify `backend/routes/users.js` — add `PATCH /users/me/ghost-mode`
- Modify `backend/__tests__/lounge.test.js` — add test for the filter
- Create `backend/__tests__/ghostMode.test.js` — tests for the new endpoint

**Frontend:**
- Modify `frontend/src/pages/NetworkingLounge.tsx` — add toggle UI + PATCH call
- Modify `frontend/src/pages/__tests__/NetworkingLounge.test.tsx` — add toggle tests

---

## Task 1: Backend — filter ghosted users from Attendees endpoint

**Files:**
- Modify: `backend/routes/fairs.js:1419-1433`
- Test: `backend/__tests__/lounge.test.js` (extend existing `describe("GET /api/fairs/:fairId/lounge/attendees", ...)`)

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe("GET /api/fairs/:fairId/lounge/attendees", ...)` block in `backend/__tests__/lounge.test.js` (after the last existing `it` block, before the closing `});`):

```javascript
it("excludes users with ghostMode: true", async () => {
  mockChannel.query.mockResolvedValueOnce({
    members: [
      { user_id: "student-uid" },
      { user_id: "visible-uid" },
      { user_id: "ghost-uid" },
    ],
  });

  db.collection.mockImplementation((name) => {
    if (name === "users") {
      return {
        doc: jest.fn((id) => ({
          get: jest.fn().mockResolvedValue(
            id === "student-uid"
              ? mockDocSnap({ role: "student" })
              : id === "visible-uid"
              ? mockDocSnap({ role: "student", firstName: "Vi", ghostMode: false })
              : mockDocSnap({ role: "student", firstName: "Gh", ghostMode: true })
          ),
        })),
      };
    }
    return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
  });

  const res = await request(app)
    .get("/api/fairs/fair1/lounge/attendees")
    .set("Authorization", VALID_TOKEN);

  expect(res.status).toBe(200);
  const uids = res.body.attendees.map((a) => a.uid);
  expect(uids).toContain("visible-uid");
  expect(uids).not.toContain("ghost-uid");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest __tests__/lounge.test.js -t "excludes users with ghostMode"`
Expected: FAIL — `uids` array contains `"ghost-uid"`.

- [ ] **Step 3: Apply the filter**

In `backend/routes/fairs.js`, change the `.filter(...)` on line 1420 from:

```javascript
.filter((doc) => doc.exists && doc.data().role === "student")
```

to:

```javascript
.filter((doc) => doc.exists && doc.data().role === "student" && doc.data().ghostMode !== true)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest __tests__/lounge.test.js`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/fairs.js backend/__tests__/lounge.test.js
git commit -m "feat(lounge): filter ghost-mode users from attendees"
```

---

## Task 2: Backend — PATCH /users/me/ghost-mode endpoint

**Files:**
- Modify: `backend/routes/users.js`
- Create: `backend/__tests__/ghostMode.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/__tests__/ghostMode.test.js`:

```javascript
const { mockDocSnap } = require("./testUtils");

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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), batch: jest.fn() },
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
  auth.verifyIdToken.mockResolvedValue({ uid: "student-uid", email: "s@test.com" });
});

describe("PATCH /api/users/me/ghost-mode", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).patch("/api/users/me/ghost-mode").send({ ghostMode: true });
    expect(res.status).toBe(401);
  });

  it("returns 400 when ghostMode is not a boolean", async () => {
    const res = await request(app)
      .patch("/api/users/me/ghost-mode")
      .set("Authorization", VALID_TOKEN)
      .send({ ghostMode: "yes" });
    expect(res.status).toBe(400);
  });

  it("updates the user document and returns the new value", async () => {
    const updateMock = jest.fn().mockResolvedValue({});
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => ({ update: updateMock })) };
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .patch("/api/users/me/ghost-mode")
      .set("Authorization", VALID_TOKEN)
      .send({ ghostMode: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ghostMode: true });
    expect(updateMock).toHaveBeenCalledWith({ ghostMode: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest __tests__/ghostMode.test.js`
Expected: FAIL — endpoint returns 404 (not mounted).

- [ ] **Step 3: Implement the endpoint**

In `backend/routes/users.js`, add this route just before `module.exports = router;` at the end:

```javascript
/* ----------------------------------------------------
   PATCH /users/me/ghost-mode - toggle ghost mode
---------------------------------------------------- */
router.patch("/users/me/ghost-mode", verifyFirebaseToken, async (req, res) => {
  const { ghostMode } = req.body;
  if (typeof ghostMode !== "boolean") {
    return res.status(400).json({ error: "ghostMode must be a boolean" });
  }
  try {
    await db.collection("users").doc(req.user.uid).update({ ghostMode });
    return res.json({ ghostMode });
  } catch (err) {
    console.error("PATCH /api/users/me/ghost-mode error:", err);
    return res.status(500).json({ error: "Failed to update ghost mode" });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest __tests__/ghostMode.test.js`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/users.js backend/__tests__/ghostMode.test.js
git commit -m "feat(users): add PATCH /users/me/ghost-mode endpoint"
```

---

## Task 3: Frontend — Ghost Mode toggle in Networking Lounge

**Files:**
- Modify: `frontend/src/pages/NetworkingLounge.tsx`
- Test: `frontend/src/pages/__tests__/NetworkingLounge.test.tsx`

- [ ] **Step 1: Read the existing test file first**

Run: `cat frontend/src/pages/__tests__/NetworkingLounge.test.tsx | head -60`

Note the existing mocking patterns (fetch mocks, `authUtils` mock, etc.) and match them in the new tests.

- [ ] **Step 2: Write the failing tests**

Add these tests to `frontend/src/pages/__tests__/NetworkingLounge.test.tsx` at the end of the main `describe` block. Adapt the fetch mock setup to match whatever pattern the file already uses; the assertions below describe the behavior:

```typescript
it("renders the Ghost Mode toggle on the Attendees tab", async () => {
  render(<NetworkingLounge />);
  // switch to attendees tab
  const attendeesTab = await screen.findByRole("tab", { name: /attendees/i });
  fireEvent.click(attendeesTab);
  expect(await screen.findByLabelText(/ghost mode/i)).toBeInTheDocument();
});

it("calls PATCH /api/users/me/ghost-mode when toggled", async () => {
  const fetchSpy = vi.mocked(global.fetch);
  render(<NetworkingLounge />);
  const attendeesTab = await screen.findByRole("tab", { name: /attendees/i });
  fireEvent.click(attendeesTab);
  const toggle = await screen.findByLabelText(/ghost mode/i);
  fireEvent.click(toggle);
  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/me/ghost-mode"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ ghostMode: true }),
      })
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/NetworkingLounge.test.tsx`
Expected: FAIL — toggle not present.

- [ ] **Step 4: Add imports and state**

In `frontend/src/pages/NetworkingLounge.tsx`, add `FormControlLabel` and `Switch` to the MUI import block at the top:

```typescript
import {
  Box,
  CircularProgress,
  Typography,
  Button,
  Tabs,
  Tab,
  Card,
  CardContent,
  CardActions,
  Chip,
  Container,
  Grid,
  FormControlLabel,
  Switch,
} from "@mui/material"
```

Inside the `NetworkingLounge` component, after the `loadingAttendees` state declaration (around line 142), add:

```typescript
const [ghostMode, setGhostMode] = useState<boolean>(
  Boolean((user as any)?.ghostMode)
)
```

- [ ] **Step 5: Add the handler**

Add this function inside the component, after the `handleMessageAttendee` function (around line 256):

```typescript
const handleToggleGhostMode = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const next = e.target.checked
  const prev = ghostMode
  setGhostMode(next)
  try {
    const idToken = await auth.currentUser?.getIdToken()
    const res = await fetch(`${API_URL}/api/users/me/ghost-mode`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ghostMode: next }),
    })
    if (!res.ok) throw new Error("Failed to update ghost mode")
    const stored = localStorage.getItem("currentUser")
    if (stored) {
      const parsed = JSON.parse(stored)
      parsed.ghostMode = next
      localStorage.setItem("currentUser", JSON.stringify(parsed))
    }
  } catch (err) {
    console.error(err)
    setGhostMode(prev)
  }
}
```

- [ ] **Step 6: Render the toggle**

In the Attendees tab panel (inside `{activeTab === 1 && ...}` around line 373), add the toggle just inside the `<Container>` and before the loading/empty checks:

{% raw %}
```tsx
<Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
  <FormControlLabel
    control={
      <Switch
        checked={ghostMode}
        onChange={handleToggleGhostMode}
        inputProps={{ "aria-label": "Ghost Mode" }}
      />
    }
    label="Ghost Mode — hide my profile from other attendees"
  />
</Box>
```
{% endraw %}

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/__tests__/NetworkingLounge.test.tsx`
Expected: PASS.

- [ ] **Step 8: Manually smoke-test in the browser**

Run: `cd frontend && npm run dev` (and `cd backend && npm start` in another shell)
- Log in as a student, enter a fair, open the Networking Lounge, switch to Attendees tab
- Toggle Ghost Mode ON, reload page, confirm toggle persists ON
- Log in as a different student, enter the same fair, confirm the first student does not appear in the list
- Toggle Ghost Mode OFF, repeat — first student should reappear on a fresh session

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/NetworkingLounge.tsx frontend/src/pages/__tests__/NetworkingLounge.test.tsx
git commit -m "feat(lounge): add Ghost Mode toggle to Attendees tab"
```

---

## Done

All three tasks committed. The feature:
- Filters ghosted students from the lounge attendees list (Task 1)
- Lets a student persist their ghost preference via PATCH (Task 2)
- Exposes the toggle in the Networking Lounge UI with optimistic updates and rollback on error (Task 3)
