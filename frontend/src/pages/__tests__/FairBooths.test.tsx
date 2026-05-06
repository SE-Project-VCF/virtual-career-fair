import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import FairBooths from "../FairBooths"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
}))

vi.mock("../../utils/auth", () => ({
  authUtils: { getCurrentUser: vi.fn(() => null) },
}))

vi.mock("../../firebase", () => ({
  auth: { currentUser: null },
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { useFair } from "../../contexts/FairContext"
import { authUtils } from "../../utils/auth"
import type { Mock } from "vitest"

function renderFairBooths() {
  return render(
    <MemoryRouter>
      <FairBooths />
    </MemoryRouter>
  )
}

describe("FairBooths", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it("shows loading when fair context is still loading", () => {
    ;(useFair as Mock).mockReturnValue({
      fair: null,
      isLive: false,
      loading: true,
      fairId: "fair-1",
    })

    renderFairBooths()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("fetches and shows booth cards when fair is ready", async () => {
    ;(useFair as Mock).mockReturnValue({
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
      fairId: "fair-1",
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        booths: [
          {
            id: "b1",
            companyName: "Acme Co",
            boothName: "Engineering",
            industry: "software",
            companySize: "100-500",
            location: "Remote",
            description: "Great place",
            companyId: "c1",
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    renderFairBooths()

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument()
    })
    expect(screen.getByText("Acme Co")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
    vi.unstubAllGlobals()
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
