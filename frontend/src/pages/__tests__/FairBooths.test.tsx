import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
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
})
