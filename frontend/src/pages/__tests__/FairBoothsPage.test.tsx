import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import FairBoothsPage from "../FairBoothsPage"
import { authUtils } from "../../utils/auth"

const mockNavigate = vi.fn()
const mockUseParams = vi.fn(() => ({ fairId: "fair-1" }))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <FairBoothsPage />
    </BrowserRouter>
  )

describe("FairBoothsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockUseParams.mockReturnValue({ fairId: "fair-1" })

    vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      role: "administrator",
    } as any)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairName: "Spring Career Fair",
        startTime: Date.UTC(2026, 2, 16),
        endTime: Date.UTC(2026, 2, 17),
        booths: [
          {
            boothId: "booth-1",
            companyName: "Tech Corp",
            averageRating: 4.5,
            totalRatings: 2,
            ratings: [
              {
                studentId: "student-1",
                rating: 5,
                comment: "Great team",
                createdAt: Date.UTC(2026, 2, 15),
              },
            ],
          },
        ],
      }),
    }) as any
  })

  it("redirects non-admin users to /admin", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "student-1",
      role: "student",
    } as any)

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin")
    })
  })

  it("renders fetched fair and booth data for admins", async () => {
    renderPage()

    expect(await screen.findByText("Spring Career Fair")).toBeInTheDocument()
    expect(screen.getByText("Tech Corp")).toBeInTheDocument()
    expect(screen.getByText("Great team")).toBeInTheDocument()
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument()
  })

  it("shows empty-state message when there are no booths", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        fairName: "Spring Career Fair",
        startTime: Date.UTC(2026, 2, 16),
        endTime: Date.UTC(2026, 2, 17),
        booths: [],
      }),
    })

    renderPage()

    expect(await screen.findByText(/no booths found for this fair/i)).toBeInTheDocument()
  })

  it("shows API error message when request fails", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Boom" }),
    })

    renderPage()

    expect(await screen.findByText("Boom")).toBeInTheDocument()
  })

  it("shows generic error message on thrown request error", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"))

    renderPage()

    expect(await screen.findByText(/failed to load fair data/i)).toBeInTheDocument()
  })
})
