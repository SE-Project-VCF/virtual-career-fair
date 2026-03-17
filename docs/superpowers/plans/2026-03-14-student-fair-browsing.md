# Student Fair Browsing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students browse career fairs freely and click into live fairs to see booths, removing the invite code gate.

**Architecture:** New `StudentFairBoothsPage` at `/fairs/:fairId/booths` shows booths for a specific fair. EventList becomes clickable for students on live fairs. Invite code gate removed from `Booths.tsx` and `BoothView.tsx`. Company invite code flow untouched.

**Tech Stack:** React (Vite), Firebase/Firestore, MUI, Vitest, React Router

**Spec:** `docs/superpowers/specs/2026-03-14-student-fair-browsing-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/pages/StudentFairBoothsPage.tsx` | New page: fetch & display booths for a specific fair |
| Create | `frontend/src/pages/__tests__/StudentFairBoothsPage.test.tsx` | Tests for the new page |
| Modify | `frontend/src/App.tsx` | Add route `/fairs/:fairId/booths` |
| Modify | `frontend/src/components/EventList.tsx` | Make fair cards clickable for students |
| Modify | `frontend/src/components/__tests__/EventList.test.tsx` | Add navigation tests for students |
| Modify | `frontend/src/pages/Dashboard.tsx` | Rework student card (remove "View All Booths", keep booth history) |
| Modify | `frontend/src/pages/__tests__/Dashboard.test.tsx` | Update student card assertions |
| Modify | `frontend/src/pages/Booths.tsx` | Remove invite code gate state, functions, dialog |
| Modify | `frontend/src/pages/BoothView.tsx` | Remove `hasInviteCodeAccess` function and its call |

---

## Chunk 1: New StudentFairBoothsPage

### Task 1: Create StudentFairBoothsPage test file

**Files:**
- Create: `frontend/src/pages/__tests__/StudentFairBoothsPage.test.tsx`

- [ ] **Step 1: Write tests for StudentFairBoothsPage**

Create the test file with mocks matching the project's existing pattern (see `BoothView.test.tsx` for reference). Uses Vitest, `@testing-library/react`, and mocks for `firebase/firestore`, `react-router-dom`, `../../firebase`, `../../utils/auth`, and `../ProfileMenu`.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import StudentFairBoothsPage from "../StudentFairBoothsPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ fairId: "fair-1" }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  Timestamp: {
    now: vi.fn(),
  },
}));

vi.mock("../../firebase", () => ({
  db: {},
}));

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}));

vi.mock("../../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell">Bell</div>,
}));

import * as firestore from "firebase/firestore";

const now = Date.now();

const mockFairSchedule = (overrides: Record<string, any> = {}) => ({
  exists: () => true,
  id: "fair-1",
  data: () => ({
    name: "Spring Career Fair 2026",
    description: "Annual spring recruiting event",
    startTime: now - 3600000, // started 1 hour ago
    endTime: now + 3600000, // ends in 1 hour
    registeredBoothIds: ["booth-1", "booth-2"],
    ...overrides,
  }),
});

const mockBoothDoc = (id: string, data: Record<string, any>) => ({
  exists: () => true,
  id,
  data: () => ({
    companyName: `Company ${id}`,
    industry: "software",
    companySize: "100",
    location: "New York, NY",
    description: `Description for ${id}`,
    logoUrl: null,
    openPositions: 3,
    ...data,
  }),
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <StudentFairBoothsPage />
    </MemoryRouter>
  );

describe("StudentFairBoothsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: live fair with 2 booths
    (firestore.getDoc as any).mockResolvedValue(mockFairSchedule());
    (firestore.getDocs as any).mockResolvedValue({
      docs: [],
      forEach: vi.fn(),
    });
    (firestore.doc as any).mockReturnValue({});
    (firestore.collection as any).mockReturnValue({});
    (firestore.query as any).mockReturnValue({});
    (firestore.where as any).mockReturnValue({});
  });

  it("shows loading state initially", () => {
    (firestore.getDoc as any).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders fair name and booths for a live fair", async () => {
    // Mock getDoc to return fair schedule first, then booth docs
    (firestore.getDoc as any)
      .mockResolvedValueOnce(mockFairSchedule())
      .mockResolvedValueOnce(mockBoothDoc("booth-1", { companyName: "Tech Corp" }))
      .mockResolvedValueOnce(mockBoothDoc("booth-2", { companyName: "Data Inc" }));

    // Mock getDocs for companies collection (for boothId -> companyId mapping)
    (firestore.getDocs as any).mockResolvedValue({
      docs: [],
      forEach: vi.fn(),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Spring Career Fair 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    expect(screen.getByText("Data Inc")).toBeInTheDocument();
  });

  it("shows 'not live yet' for upcoming fairs", async () => {
    (firestore.getDoc as any).mockResolvedValue(
      mockFairSchedule({
        startTime: now + 86400000, // starts tomorrow
        endTime: now + 172800000,
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/isn't live yet/i)).toBeInTheDocument();
    });
  });

  it("shows 'fair has ended' for past fairs", async () => {
    (firestore.getDoc as any).mockResolvedValue(
      mockFairSchedule({
        startTime: now - 172800000, // 2 days ago
        endTime: now - 86400000, // 1 day ago
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/fair has ended/i)).toBeInTheDocument();
    });
  });

  it("shows message when no booths registered for live fair", async () => {
    (firestore.getDoc as any).mockResolvedValue(
      mockFairSchedule({ registeredBoothIds: [] })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no companies have registered/i)).toBeInTheDocument();
    });
  });

  it("shows error for non-existent fair", async () => {
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => false,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/fair not found/i)).toBeInTheDocument();
    });
  });

  it("displays fair description", async () => {
    (firestore.getDoc as any).mockResolvedValue(
      mockFairSchedule({ registeredBoothIds: [] })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Annual spring recruiting event")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/__tests__/StudentFairBoothsPage.test.tsx`
Expected: FAIL — `StudentFairBoothsPage` module not found

- [ ] **Step 3: Commit test file**

```bash
git add frontend/src/pages/__tests__/StudentFairBoothsPage.test.tsx
git commit -m "test: add StudentFairBoothsPage tests (red)"
```

### Task 2: Implement StudentFairBoothsPage

**Files:**
- Create: `frontend/src/pages/StudentFairBoothsPage.tsx`

- [ ] **Step 4: Write the StudentFairBoothsPage component**

This component fetches a specific fair schedule by `fairId`, validates it's live, fetches its registered booths, maps company data, and renders a booth card grid. The booth card layout matches the existing design in `Booths.tsx` (lines 335-471).

```tsx
import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material"
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore"
import { db } from "../firebase"
import { authUtils } from "../utils/auth"
import BusinessIcon from "@mui/icons-material/Business"
import PeopleIcon from "@mui/icons-material/People"
import WorkIcon from "@mui/icons-material/Work"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import ProfileMenu from "./ProfileMenu"
import NotificationBell from "../components/NotificationBell"

interface Booth {
  id: string
  companyName: string
  industry: string
  companySize: string
  location: string
  description: string
  logoUrl?: string
  openPositions: number
  companyId?: string
}

const INDUSTRY_LABELS: Record<string, string> = {
  software: "Software Development",
  data: "Data Science & Analytics",
  healthcare: "Healthcare Technology",
  finance: "Financial Services",
  energy: "Renewable Energy",
  education: "Education Technology",
  retail: "Retail & E-commerce",
  manufacturing: "Manufacturing",
  other: "Other",
}

const FIRESTORE_IN_QUERY_LIMIT = 30

export default function StudentFairBoothsPage() {
  const { fairId } = useParams<{ fairId: string }>()
  const navigate = useNavigate()
  const user = authUtils.getCurrentUser()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [fairName, setFairName] = useState<string | null>(null)
  const [fairDescription, setFairDescription] = useState<string | null>(null)
  const [fairStatus, setFairStatus] = useState<"live" | "upcoming" | "ended" | null>(null)
  const [fairStartTime, setFairStartTime] = useState<number | null>(null)
  const [booths, setBooths] = useState<Booth[]>([])
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({})
  const [totalJobs, setTotalJobs] = useState(0)

  useEffect(() => {
    fetchFairBooths()
  }, [fairId])

  const fetchJobCounts = async (companyIds: string[]) => {
    if (companyIds.length === 0) return
    try {
      const counts: Record<string, number> = {}
      let total = 0
      const batches = []
      for (let i = 0; i < companyIds.length; i += FIRESTORE_IN_QUERY_LIMIT) {
        batches.push(companyIds.slice(i, i + FIRESTORE_IN_QUERY_LIMIT))
      }
      for (const batch of batches) {
        const q = query(collection(db, "jobs"), where("companyId", "in", batch))
        const jobsSnapshot = await getDocs(q)
        jobsSnapshot.forEach((jobDoc) => {
          const companyId = jobDoc.data().companyId
          if (companyId) {
            counts[companyId] = (counts[companyId] || 0) + 1
            total++
          }
        })
      }
      setJobCounts(counts)
      setTotalJobs(total)
    } catch (err) {
      console.error("Error fetching job counts:", err)
    }
  }

  const fetchFairBooths = async () => {
    if (!fairId) return

    setLoading(true)
    setError("")
    try {
      const fairDoc = await getDoc(doc(db, "fairSchedules", fairId))
      if (!fairDoc.exists()) {
        setError("Fair not found")
        setLoading(false)
        return
      }

      const fairData = fairDoc.data()
      setFairName(fairData.name || "Career Fair")
      setFairDescription(fairData.description || null)

      // Determine fair status
      const now = Date.now()
      const startTime = fairData.startTime?.toMillis
        ? fairData.startTime.toMillis()
        : fairData.startTime
      const endTime = fairData.endTime?.toMillis
        ? fairData.endTime.toMillis()
        : fairData.endTime

      setFairStartTime(startTime)

      if (startTime && endTime) {
        if (now < startTime) {
          setFairStatus("upcoming")
          setLoading(false)
          return
        } else if (now > endTime) {
          setFairStatus("ended")
          setLoading(false)
          return
        }
      }
      setFairStatus("live")

      // Fetch registered booths
      const registeredBoothIds: string[] = fairData.registeredBoothIds || []
      if (registeredBoothIds.length === 0) {
        setBooths([])
        setLoading(false)
        return
      }

      const boothDocs = await Promise.all(
        registeredBoothIds.map((id) => getDoc(doc(db, "booths", id)))
      )

      // Map boothId -> companyId via companies collection
      const companiesSnapshot = await getDocs(collection(db, "companies"))
      const boothIdToCompanyId: Record<string, string> = {}
      companiesSnapshot.forEach((companyDoc) => {
        const companyData = companyDoc.data()
        if (companyData.boothId) {
          boothIdToCompanyId[companyData.boothId] = companyDoc.id
        }
      })

      const boothsList: Booth[] = []
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

      setBooths(boothsList)

      const companyIds = boothsList
        .map((b) => b.companyId)
        .filter((id): id is string => !!id)
      fetchJobCounts([...new Set(companyIds)])
    } catch (err) {
      console.error("Error fetching fair booths:", err)
      setError("Failed to load fair")
    } finally {
      setLoading(false)
    }
  }

  const getJobCountForBooth = (booth: Booth): number => {
    if (booth.companyId) {
      return jobCounts[booth.companyId] || 0
    }
    return 0
  }

  const formatDateTime = (timestamp: number | null) => {
    if (!timestamp) return ""
    return new Date(timestamp).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // --- Render ---

  let content
  if (loading) {
    content = (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    )
  } else if (error) {
    content = (
      <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
        {error}
      </Alert>
    )
  } else if (fairStatus === "upcoming") {
    content = (
      <Card sx={{ textAlign: "center", p: 6, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <BusinessIcon sx={{ fontSize: 80, color: "#ccc", mb: 2 }} />
        <Typography variant="h5" sx={{ mb: 2, color: "text.secondary" }}>
          This fair isn't live yet
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Starts at {formatDateTime(fairStartTime)}
        </Typography>
      </Card>
    )
  } else if (fairStatus === "ended") {
    content = (
      <Card sx={{ textAlign: "center", p: 6, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <BusinessIcon sx={{ fontSize: 80, color: "#ccc", mb: 2 }} />
        <Typography variant="h5" sx={{ mb: 2, color: "text.secondary" }}>
          This fair has ended
        </Typography>
      </Card>
    )
  } else if (booths.length === 0) {
    content = (
      <Card sx={{ textAlign: "center", p: 6, border: "1px solid rgba(56, 133, 96, 0.3)" }}>
        <BusinessIcon sx={{ fontSize: 80, color: "#ccc", mb: 2 }} />
        <Typography variant="h5" sx={{ mb: 2, color: "text.secondary" }}>
          No companies have registered for this fair yet
        </Typography>
      </Card>
    )
  } else {
    content = (
      <>
        {/* Stats Bar */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BusinessIcon sx={{ fontSize: 28, color: "#388560" }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                      {booths.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Booths
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ border: "1px solid rgba(56, 133, 96, 0.3)", height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <WorkIcon sx={{ fontSize: 28, color: "#b03a6c" }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                      {totalJobs}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Open Positions
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Booth Cards */}
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: "#1a1a1a" }}>
          Company Booths
        </Typography>
        <Grid container spacing={3}>
          {booths.map((booth) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={booth.id}>
              <Card
                sx={{
                  height: "100%",
                  border: "1px solid rgba(56, 133, 96, 0.3)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: "0 8px 24px rgba(56, 133, 96, 0.3)",
                  },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", alignItems: "start", gap: 2, mb: 2 }}>
                    {booth.logoUrl ? (
                      <Box
                        component="img"
                        src={booth.logoUrl}
                        alt={`${booth.companyName} logo`}
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 2,
                          objectFit: "cover",
                          border: "1px solid rgba(0,0,0,0.1)",
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 64,
                          height: 64,
                          borderRadius: 2,
                          background: "linear-gradient(135deg, rgba(56, 133, 96, 0.1) 0%, rgba(176, 58, 108, 0.1) 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <BusinessIcon sx={{ fontSize: 32, color: "#388560" }} />
                      </Box>
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.2 }}>
                        {booth.companyName}
                      </Typography>
                      <Chip
                        label={INDUSTRY_LABELS[booth.industry] || booth.industry}
                        size="small"
                        sx={{
                          bgcolor: "rgba(56, 133, 96, 0.1)",
                          color: "#388560",
                          fontWeight: 500,
                          fontSize: "0.75rem",
                        }}
                      />
                    </Box>
                  </Box>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      minHeight: 40,
                    }}
                  >
                    {booth.description}
                  </Typography>

                  <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <LocationOnIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                      <Typography variant="body2" color="text.secondary">
                        {booth.location}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <PeopleIcon sx={{ fontSize: 16, color: "#b03a6c" }} />
                      <Typography variant="body2" color="text.secondary">
                        {booth.companySize} employees
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      pt: 2,
                      borderTop: "1px solid rgba(0,0,0,0.1)",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#388560" }}>
                      {getJobCountForBooth(booth)} open position{getJobCountForBooth(booth) === 1 ? "" : "s"}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      endIcon={<ArrowForwardIcon />}
                      onClick={() => navigate(`/booth/${booth.id}`)}
                      sx={{
                        borderColor: "#388560",
                        color: "#388560",
                        "&:hover": {
                          borderColor: "#2d6b4d",
                          bgcolor: "rgba(56, 133, 96, 0.05)",
                        },
                      }}
                    >
                      Visit Booth
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </>
    )
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <Box
        sx={{
          background: "linear-gradient(135deg, #b03a6c 0%, #388560 100%)",
          py: 3,
          px: 4,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color: "white" }}>
                {fairName || "Career Fair"}
              </Typography>
              <Typography variant="body1" sx={{ color: "rgba(255,255,255,0.9)", mt: 1 }}>
                Explore opportunities from top companies
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate("/dashboard")}
                sx={{
                  color: "white",
                  borderColor: "white",
                  "&:hover": {
                    borderColor: "white",
                    bgcolor: "rgba(255,255,255,0.1)",
                  },
                }}
              >
                Dashboard
              </Button>
              {user && <NotificationBell />}
              <ProfileMenu />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Fair description banner */}
        {fairDescription && fairStatus === "live" && (
          <Alert
            severity="success"
            sx={{
              mb: 4,
              borderRadius: 2,
              bgcolor: "rgba(56, 133, 96, 0.1)",
              border: "1px solid rgba(56, 133, 96, 0.3)",
            }}
          >
            <Typography variant="body1">{fairDescription}</Typography>
          </Alert>
        )}

        {content}
      </Container>
    </Box>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/__tests__/StudentFairBoothsPage.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/StudentFairBoothsPage.tsx frontend/src/pages/__tests__/StudentFairBoothsPage.test.tsx
git commit -m "feat: add StudentFairBoothsPage for fair-scoped booth browsing"
```

### Task 3: Add route in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx:18,39`

- [ ] **Step 7: Add import and route**

Add import after existing page imports (around line 18):
```tsx
import StudentFairBoothsPage from "./pages/StudentFairBoothsPage"
```

Add route after the existing `/booths` route (around line 39):
```tsx
<Route path="/fairs/:fairId/booths" element={<StudentFairBoothsPage />} />
```

- [ ] **Step 8: Verify app compiles**

Run: `cd frontend && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add /fairs/:fairId/booths route"
```

---

## Chunk 2: EventList Navigation for Students

### Task 4: Update EventList test for student navigation

**Files:**
- Modify: `frontend/src/components/__tests__/EventList.test.tsx`

- [ ] **Step 10: Add navigation tests**

The existing EventList tests have no router wrapper or auth mocks. Add them, plus new test cases. Add these imports, mocks, and tests to the existing file:

At the top of the file, add mocks and update imports:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import EventList from "../EventList";
import { getDocs, Timestamp } from "firebase/firestore";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

import { authUtils } from "../../utils/auth";
```

Update ALL existing `render(<EventList />)` calls to wrap in `<MemoryRouter>`:
```tsx
render(<MemoryRouter><EventList /></MemoryRouter>);
```

Add new test cases at the end of the `describe` block:

```tsx
  it("student can click live fair to navigate to fair booths", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });

    const now = Date.now();
    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Live Fair",
            startTime: now - 1800000,
            endTime: now + 1800000,
          }),
        });
      },
    };
    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Live Fair")).toBeInTheDocument();
    });

    const browseButton = screen.getByRole("button", { name: /browse booths/i });
    await userEvent.click(browseButton);
    expect(mockNavigate).toHaveBeenCalledWith("/fairs/fair-1/booths");
  });

  it("student does not see browse button for upcoming fairs", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });

    const now = Date.now();
    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Upcoming Fair",
            startTime: now + 86400000,
            endTime: now + 172800000,
          }),
        });
      },
    };
    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Upcoming Fair")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /browse booths/i })).not.toBeInTheDocument();
  });

  it("company user does not see browse booths button", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "owner-1",
      role: "companyOwner",
    });

    const now = Date.now();
    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Live Fair",
            startTime: now - 1800000,
            endTime: now + 1800000,
          }),
        });
      },
    };
    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Live Fair")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /browse booths/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 11: Run tests to verify new ones fail**

Run: `cd frontend && npx vitest run src/components/__tests__/EventList.test.tsx`
Expected: New navigation tests FAIL (no "Browse Booths" button exists yet). Existing tests should still pass (they just got wrapped in MemoryRouter).

- [ ] **Step 12: Commit failing tests**

```bash
git add frontend/src/components/__tests__/EventList.test.tsx
git commit -m "test: add EventList student navigation tests (red)"
```

### Task 5: Update EventList component

**Files:**
- Modify: `frontend/src/components/EventList.tsx:1-2,17,39,229-249,270-316`

- [ ] **Step 13: Add navigation and student browse button to EventList**

Add `useNavigate` import at top of file:
```tsx
import { useNavigate } from "react-router-dom"
```

Inside the component function (after `const isCompanyUser = ...` on line 39), add:
```tsx
const navigate = useNavigate()
const isStudent = user?.role === "student"
```

In the fair card render (inside the `schedules.map` callback, after the time display `Box` that ends around line 315), add a "Browse Booths" button for students when the fair is live:

```tsx
{/* Browse Booths button for students on live fairs */}
{isStudent && status?.type === "active" && (
  <Box sx={{ mt: 2 }}>
    <Button
      variant="contained"
      size="small"
      onClick={() => navigate(`/fairs/${schedule.id}/booths`)}
      sx={{
        background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
        textTransform: "none",
        fontWeight: 600,
        "&:hover": {
          background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
        },
      }}
    >
      Browse Booths
    </Button>
  </Box>
)}
```

This button goes right before the closing `</Box>` of each schedule card (just before the `</Box>` that closes the card with `sx={{ p: 2, borderRadius: 2, ... }}`).

- [ ] **Step 14: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/EventList.test.tsx`
Expected: All tests PASS (existing + 3 new navigation tests)

- [ ] **Step 15: Commit**

```bash
git add frontend/src/components/EventList.tsx
git commit -m "feat: add Browse Booths button for students on live fairs in EventList"
```

---

## Chunk 3: Dashboard and Cleanup

### Task 6: Update Dashboard student card

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx:748-817`
- Modify: `frontend/src/pages/__tests__/Dashboard.test.tsx:125-165`

- [ ] **Step 16: Update Dashboard test assertions**

In `Dashboard.test.tsx`, update the student tests:

Replace the test "displays Browse Company Booths card for students" (lines 125-144):
```tsx
    it("displays Booth History card for students", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText("Booth History")).toBeInTheDocument()
      })

      expect(screen.queryByRole("button", { name: /view all booths/i })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: /view booth history/i })).toBeEnabled()
    })
```

Replace the test "navigates to booths page when button clicked" (lines 146-165):
```tsx
    it("booth history button is always enabled for students", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText("Career Opportunities")).toBeInTheDocument()
      })

      const historyButton = screen.getByRole("button", { name: /view booth history/i })
      expect(historyButton).toBeEnabled()
    })
```

- [ ] **Step 17: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/Dashboard.test.tsx`
Expected: Updated tests FAIL (old card text still present)

- [ ] **Step 18: Update Dashboard student card**

In `Dashboard.tsx`, replace the student "Browse Company Booths" card content (lines ~748-819). Replace the entire `<Grid size={{ xs: 12, md: 6 }}>` card block (the first one in the student section) with:

```tsx
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card
                    sx={{
                      bgcolor: "white",
                      border: "1px solid rgba(176, 58, 108, 0.3)",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 8px 24px rgba(176, 58, 108, 0.3)",
                      },
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                        <BusinessIcon sx={{ fontSize: 40, color: "#b03a6c", mr: 2 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Booth History
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        View your booth visit history and revisit companies you've explored.
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => navigate("/dashboard/booth-history")}
                        sx={{
                          background: "linear-gradient(135deg, #b03a6c 0%, #8a2d54 100%)",
                          "&:hover": {
                            background: "linear-gradient(135deg, #8a2d54 0%, #b03a6c 100%)",
                          },
                        }}
                      >
                        View Booth History
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
```

- [ ] **Step 19: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/__tests__/Dashboard.test.tsx`
Expected: All tests PASS

- [ ] **Step 20: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/pages/__tests__/Dashboard.test.tsx
git commit -m "feat: replace student Browse Booths card with Booth History card"
```

### Task 7: Remove invite code gate from Booths.tsx

**Files:**
- Modify: `frontend/src/pages/Booths.tsx:14-18,124-128,166-184,281-304,669-702`

- [ ] **Step 21: Remove invite code state, functions, and dialog from Booths.tsx**

Remove these state variables (lines ~124-128):
```tsx
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null)
  const [activeScheduleInviteCode, setActiveScheduleInviteCode] = useState("")
  const [inviteCodeInput, setInviteCodeInput] = useState("")
  const [inviteCodeError, setInviteCodeError] = useState("")
```

Remove `checkAndHandleInviteCode` function (lines ~166-185).

Remove `handleJoinFairWithCode` function (lines ~281-304).

Remove `setActiveScheduleId(status.activeScheduleId)` from `fetchBooths` (line ~198).

Remove the `if (await checkAndHandleInviteCode(status)) return` line (line ~200).

Remove the invite code `<Dialog>` component (lines ~669-702).

Remove unused imports from `@mui/material`: `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `TextField`.

Keep `activeScheduleId` only if it's used elsewhere in the component (check — it's used in `fetchBooths` for booth loading). Actually, `activeScheduleId` is set from `status.activeScheduleId` and is only used in `checkAndHandleInviteCode` and `handleJoinFairWithCode` — both being removed. So remove it too.

Wait — re-check: `activeScheduleId` is NOT used in the booth fetching logic. The booth fetching uses `status.activeScheduleId` directly. So `setActiveScheduleId` and the state variable can be removed.

- [ ] **Step 22: Run existing Booths tests to verify nothing broke**

Run: `cd frontend && npx vitest run src/pages/__tests__/Booths.test.tsx`
Expected: All existing tests PASS

- [ ] **Step 23: Commit**

```bash
git add frontend/src/pages/Booths.tsx
git commit -m "fix: remove invite code gate from Booths page"
```

### Task 8: Remove invite code gate from BoothView.tsx

**Files:**
- Modify: `frontend/src/pages/BoothView.tsx:327-335,354-357`

- [ ] **Step 24: Remove hasInviteCodeAccess and its call**

Remove the `hasInviteCodeAccess` function (lines ~327-335):
```tsx
  const hasInviteCodeAccess = async (status: { isLive: boolean; requiresInviteCode: boolean; activeScheduleId: string | null }): Promise<boolean> => {
    if (!status.isLive || !status.requiresInviteCode || !status.activeScheduleId) return true
    const scheduleDoc = await getDoc(doc(db, "fairSchedules", status.activeScheduleId))
    const requiredCode = scheduleDoc.exists()
      ? String(scheduleDoc.data().inviteCode || "").trim().toUpperCase()
      : ""
    const savedAccessCode = localStorage.getItem(`fairAccess:${status.activeScheduleId}:${user?.uid || "guest"}`)
    return !requiredCode || savedAccessCode === requiredCode
  }
```

Remove the invite code check in `fetchBooth` (lines ~354-357):
```tsx
      if (!await hasInviteCodeAccess(status)) {
        setError("This fair requires an invite code. Go to the Booths page and enter the fair invite code first.")
        return
      }
```

Do NOT touch the company-side "Join a Career Fair" card (lines ~613-654).

- [ ] **Step 25: Run BoothView tests to verify nothing broke**

Run: `cd frontend && npx vitest run src/pages/__tests__/BoothView.test.tsx`
Expected: All existing tests PASS

- [ ] **Step 26: Commit**

```bash
git add frontend/src/pages/BoothView.tsx
git commit -m "fix: remove invite code access gate from BoothView"
```

### Task 9: Run full test suite

**Files:** None (verification only)

- [ ] **Step 27: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 28: Verify build**

Run: `cd frontend && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 29: Final commit (if any fixes needed)**

Only if Step 27 or 28 required fixes. Otherwise skip.
