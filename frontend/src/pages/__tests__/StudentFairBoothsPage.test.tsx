import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import StudentFairBoothsPage from "../StudentFairBoothsPage"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useParams: () => ({ fairId: "fair-1" }),
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn((_db: unknown, collectionName: string, docId: string) => ({
    _collection: collectionName,
    _id: docId,
  })),
  getDoc: vi.fn(),
}))

vi.mock("../../firebase", () => ({
  db: {},
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}))

import { authUtils } from "../../utils/auth"
import { getDoc, getDocs } from "firebase/firestore"
import type { Mock } from "vitest"

// Helper: create a mock Firestore doc snapshot
function mockDocSnap(
  exists: boolean,
  data: Record<string, unknown> = {},
  id = "doc-id"
) {
  return {
    exists: () => exists,
    data: () => data,
    id,
  }
}

const now = Date.now()

function liveFairDoc(overrides: Record<string, unknown> = {}) {
  return mockDocSnap(true, {
    name: "Spring Career Fair",
    description: "Annual spring recruiting event",
    startTime: { toMillis: () => now - 60_000 },
    endTime: { toMillis: () => now + 3_600_000 },
    registeredBoothIds: ["booth-1", "booth-2"],
    ...overrides,
  }, "fair-1")
}

const boothDoc1 = mockDocSnap(true, {
  companyName: "Tech Corp",
  industry: "software",
  companySize: "100-500",
  location: "San Francisco, CA",
  description: "Leading software company",
  logoUrl: "https://example.com/logo.png",
  openPositions: 5,
}, "booth-1")

const boothDoc2 = mockDocSnap(true, {
  companyName: "Finance Inc",
  industry: "finance",
  companySize: "500+",
  location: "New York, NY",
  description: "Top financial services firm",
  openPositions: 3,
}, "booth-2")

const renderPage = () =>
  render(
    <BrowserRouter>
      <StudentFairBoothsPage />
    </BrowserRouter>
  )

describe("StudentFairBoothsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    ;(authUtils.getCurrentUser as Mock).mockReturnValue(null)
  })

  it("shows loading state initially", () => {
    // getDoc never resolves so loading spinner stays visible
    ;(getDoc as Mock).mockImplementation(() => new Promise(() => {}))

    renderPage()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("renders fair name and booths for a live fair", async () => {
    // First getDoc call: fair schedule doc
    ;(getDoc as Mock).mockImplementation((ref: { _collection: string; _id: string }) => {
      if (ref._collection === "fairSchedules") return Promise.resolve(liveFairDoc())
      if (ref._collection === "booths" && ref._id === "booth-1") return Promise.resolve(boothDoc1)
      if (ref._collection === "booths" && ref._id === "booth-2") return Promise.resolve(boothDoc2)
      return Promise.resolve(mockDocSnap(false))
    })

    // Companies lookup for boothId -> companyId mapping
    ;(getDocs as Mock).mockResolvedValue({
      forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
        cb({ id: "company-1", data: () => ({ boothId: "booth-1" }) })
        cb({ id: "company-2", data: () => ({ boothId: "booth-2" }) })
      },
      docs: [
        { id: "company-1", data: () => ({ boothId: "booth-1" }) },
        { id: "company-2", data: () => ({ boothId: "booth-2" }) },
      ],
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Spring Career Fair")).toBeInTheDocument()
    })
    expect(screen.getByText("Tech Corp")).toBeInTheDocument()
    expect(screen.getByText("Finance Inc")).toBeInTheDocument()
  })

  it("shows 'not live yet' for upcoming fairs", async () => {
    const futureStart = now + 3_600_000
    const futureEnd = now + 7_200_000

    ;(getDoc as Mock).mockResolvedValue(
      mockDocSnap(true, {
        name: "Future Fair",
        description: "Coming soon",
        startTime: { toMillis: () => futureStart },
        endTime: { toMillis: () => futureEnd },
        registeredBoothIds: ["booth-1"],
      }, "fair-1")
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/isn't live yet/i)).toBeInTheDocument()
    })
  })

  it("shows 'fair has ended' for past fairs", async () => {
    const pastStart = now - 7_200_000
    const pastEnd = now - 3_600_000

    ;(getDoc as Mock).mockResolvedValue(
      mockDocSnap(true, {
        name: "Past Fair",
        description: "Already over",
        startTime: { toMillis: () => pastStart },
        endTime: { toMillis: () => pastEnd },
        registeredBoothIds: ["booth-1"],
      }, "fair-1")
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/fair has ended/i)).toBeInTheDocument()
    })
  })

  it("shows message when no booths registered for live fair", async () => {
    ;(getDoc as Mock).mockResolvedValue(
      liveFairDoc({ registeredBoothIds: [] })
    )

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText(/no companies have registered for this fair yet/i)
      ).toBeInTheDocument()
    })
  })

  it("shows error for non-existent fair", async () => {
    ;(getDoc as Mock).mockResolvedValue(mockDocSnap(false))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/fair not found/i)).toBeInTheDocument()
    })
  })

  it("displays fair description", async () => {
    ;(getDoc as Mock).mockImplementation((ref: { _collection: string; _id: string }) => {
      if (ref._collection === "fairSchedules") return Promise.resolve(liveFairDoc())
      if (ref._collection === "booths" && ref._id === "booth-1") return Promise.resolve(boothDoc1)
      if (ref._collection === "booths" && ref._id === "booth-2") return Promise.resolve(boothDoc2)
      return Promise.resolve(mockDocSnap(false))
    })

    ;(getDocs as Mock).mockResolvedValue({
      forEach: () => {},
      docs: [],
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Annual spring recruiting event")).toBeInTheDocument()
    })
  })
})
