import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import FairBooths from "../FairBooths"
import { useFair } from "../../contexts/FairContext"
import { authUtils } from "../../utils/auth"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}))

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
  FairProvider: ({ children }: any) => <>{children}</>,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}))

vi.mock("../../components/PageHeader", () => ({
  default: () => <div data-testid="page-header">Header</div>,
}))

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

const renderFairBooths = () =>
  render(
    <BrowserRouter>
      <FairBooths />
    </BrowserRouter>
  )

describe("FairBooths", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()
  })

  it("shows loading spinner while fairLoading is true", () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: true,
      loading: true,
      fair: null,
      fairId: null,
      isLive: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(null)

    renderFairBooths()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows booths when loaded successfully", async () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          {
            id: "booth-1",
            companyName: "Tech Corp",
            industry: null,
            companySize: null,
            location: null,
            description: null,
            companyId: "c1",
          },
        ],
      }),
    })

    renderFairBooths()

    await waitFor(() => expect(screen.getByText("Tech Corp")).toBeInTheDocument())
  })

  it("shows error when fair is not live (403)", async () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: false,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 403,
      ok: false,
    })

    renderFairBooths()

    await waitFor(() =>
      expect(screen.getByText(/not currently live/i)).toBeInTheDocument()
    )
  })

  it("shows info alert for non-admin when fair is not live", async () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: false,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderFairBooths()

    await waitFor(() =>
      expect(screen.getByText(/not currently live/i)).toBeInTheDocument()
    )
  })

  it("shows No booths yet when booth list is empty and fair is live", async () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderFairBooths()

    await waitFor(() =>
      expect(screen.getByText(/No booths yet/i)).toBeInTheDocument()
    )
  })

  it("redirects representative to fair hub when fairId is set", () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "representative",
    } as any)

    renderFairBooths()

    expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-1", { replace: true })
  })

  it("redirects representative to dashboard when fairId is missing", () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: null,
      fair: null,
      isLive: false,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "representative",
    } as any)

    renderFairBooths()

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true })
  })

  it("shows generic error when booth fetch fails with non-403", async () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderFairBooths()

    await waitFor(() =>
      expect(screen.getByText(/Failed to load booths/i)).toBeInTheDocument()
    )
  })

  it("shows Networking Lounge for student when fair is live", async () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderFairBooths()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /networking lounge/i })).toBeInTheDocument()
    )
  })

  it("admin sees empty state when fair is not live", async () => {
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: false,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      role: "administrator",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderFairBooths()

    await waitFor(() => {
      expect(screen.queryByText(/Booths will be visible when the fair begins/i)).not.toBeInTheDocument()
      expect(screen.getByText(/No booths yet/i)).toBeInTheDocument()
    })
  })

  it("navigates via View Booth without triggering card click propagation issues", async () => {
    const user = userEvent.setup()
    vi.mocked(useFair).mockReturnValue({
      fairLoading: false,
      fairId: "fair-1",
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
    } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          {
            id: "booth-1",
            companyName: "Tech Corp",
            boothName: "Engineering",
            industry: "quantum",
            companySize: "50-100",
            location: "Remote",
            description: "Hi",
            companyId: "c1",
            logoUrl: "https://example.com/l.png",
          },
        ],
      }),
    })

    renderFairBooths()

    await waitFor(() => expect(screen.getByText("Engineering")).toBeInTheDocument())
    expect(screen.getByText("Tech Corp")).toBeInTheDocument()
    expect(screen.getByAltText("Tech Corp")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /view booth/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-1/booth/booth-1")
  })
})
