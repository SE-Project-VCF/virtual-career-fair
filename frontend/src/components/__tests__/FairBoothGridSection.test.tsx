import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import FairBoothGridSection from "../FairBoothGridSection"
import { useFair, type FairContextType, type FairData } from "../../contexts/FairContext"
import { authUtils } from "../../utils/auth"
import { auth } from "../../firebase"

const mockNavigate = vi.fn()

function fairFixture(name: string, overrides: Partial<FairData> = {}): FairData {
  return {
    id: "fixture-fair-id",
    name,
    description: null,
    isLive: true,
    startTime: null,
    endTime: null,
    ...overrides,
  }
}

function mockFairContext(overrides: Partial<FairContextType>): FairContextType {
  return {
    fairId: null,
    fair: null,
    setFair: vi.fn(),
    isLive: false,
    loading: true,
    ...overrides,
  }
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
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

function renderSection(props?: Readonly<{ sectionTitle?: string }>) {
  return render(
    <MemoryRouter>
      <FairBoothGridSection {...props} />
    </MemoryRouter>
  )
}

describe("FairBoothGridSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
    } as ReturnType<typeof authUtils.getCurrentUser>)
  })

  it("shows spinner while fair context is loading", () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: true,
        fair: null,
        fairId: null,
        isLive: false,
      })
    )

    renderSection()

    expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0)
  })

  it("uses sectionTitle for heading when provided", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderSection({ sectionTitle: "Exhibitors" })

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Exhibitors" })).toBeInTheDocument()
    })
  })

  it("defaults heading to fair name with booths suffix when sectionTitle omitted", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Fall Expo"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: /Fall Expo — Booths/ })).toBeInTheDocument()
    })
  })

  it("shows live subtitle and company count for one booth", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          {
            id: "b1",
            companyName: "Acme Corp",
            industry: "software",
            companySize: "51-200",
            location: "Austin, TX",
            companyId: "c1",
          },
        ],
      }),
    })

    renderSection({ sectionTitle: "Booths" })

    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())

    expect(screen.getByText("1 company")).toBeInTheDocument()
    expect(screen.getByText(/Browse exhibitors and visit company booths/i)).toBeInTheDocument()
    expect(screen.getByText("Software Development")).toBeInTheDocument()
    expect(screen.getByText("51-200")).toBeInTheDocument()
    expect(screen.getByText("Austin, TX")).toBeInTheDocument()
  })

  it("shows plural company count for multiple booths", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          { id: "b1", companyName: "A", industry: null, companySize: null, location: null, companyId: "c1" },
          { id: "b2", companyName: "B", industry: null, companySize: null, location: null, companyId: "c2" },
        ],
      }),
    })

    renderSection()

    await waitFor(() => expect(screen.getByText("2 companies")).toBeInTheDocument())
  })

  it("maps unknown industry keys to raw label", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          {
            id: "b1",
            companyName: "Odd Co",
            industry: "customVertical",
            companySize: null,
            location: null,
            companyId: "c1",
          },
        ],
      }),
    })

    renderSection()

    await waitFor(() => expect(screen.getByText("customVertical")).toBeInTheDocument())
  })

  it("shows info alert and unlock subtitle when fair is not live for students", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: false,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByText(/not currently live/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/Booths unlock when the fair goes live/i)).toBeInTheDocument()
  })

  it("does not show student info alert when user is administrator and fair is not live", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      role: "administrator",
    } as ReturnType<typeof authUtils.getCurrentUser>)
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: false,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderSection()

    await waitFor(() => {
      expect(screen.queryByText(/This fair is not currently live/i)).not.toBeInTheDocument()
    })
    expect(screen.queryByText(/Booths unlock when the fair goes live/i)).not.toBeInTheDocument()
  })

  it("shows empty state paper when live and booth list is empty", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByText("No booths yet")).toBeInTheDocument()
    })
    expect(screen.getByText(/Check back soon for participating employers/i)).toBeInTheDocument()
  })

  it("shows empty state for administrator when fair not live and API returns empty booths", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      role: "administrator",
    } as ReturnType<typeof authUtils.getCurrentUser>)
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: false,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })

    renderSection()

    await waitFor(() => expect(screen.getByText("No booths yet")).toBeInTheDocument())
  })

  it("sets 403 error message when fair is not live for API", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 403,
      ok: false,
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByText(/career fair is not currently live/i)).toBeInTheDocument()
    })
  })

  it("shows generic error when response is not ok", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 500,
      ok: false,
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByText("Failed to load booths")).toBeInTheDocument()
    })
  })

  it("shows generic error when fetch throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network"))

    renderSection()

    await waitFor(() => {
      expect(screen.getByText("Failed to load booths")).toBeInTheDocument()
    })
    errSpy.mockRestore()
  })

  it("navigates on card click", async () => {
    const user = userEvent.setup()
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          {
            id: "booth-x",
            companyName: "Click Co",
            industry: null,
            companySize: null,
            location: null,
            companyId: "c1",
          },
        ],
      }),
    })

    renderSection()

    await waitFor(() => expect(screen.getByText("Click Co")).toBeInTheDocument())

    await user.click(screen.getByText("Click Co"))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-1/booth/booth-x")
  })

  it("navigates when View Booth button is clicked", async () => {
    const user = userEvent.setup()
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          {
            id: "booth-y",
            companyName: "Btn Co",
            industry: null,
            companySize: null,
            location: null,
            companyId: "c1",
          },
        ],
      }),
    })

    renderSection()

    await waitFor(() => expect(screen.getByRole("button", { name: /view booth/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /view booth/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-1/booth/booth-y")
  })

  it("omits Authorization when token is missing", async () => {
    vi.mocked(auth.currentUser!.getIdToken).mockResolvedValueOnce("")
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ booths: [] }),
    })
    globalThis.fetch = fetchMock

    renderSection()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const [, opts] = fetchMock.mock.calls[0]
    expect(opts?.headers ?? {}).toMatchObject({})
    vi.mocked(auth.currentUser!.getIdToken).mockResolvedValue("mock-token")
  })

  it("defaults booths array when JSON omits booths key", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    renderSection()

    await waitFor(() => expect(screen.getByText("No booths yet")).toBeInTheDocument())
  })

  it("renders booth logo when logoUrl is set", async () => {
    vi.mocked(useFair).mockReturnValue(
      mockFairContext({
        loading: false,
        fair: fairFixture("Spring Fair"),
        fairId: "fair-1",
        isLive: true,
      })
    )
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        booths: [
          {
            id: "b-logo",
            companyName: "Logo Inc",
            industry: null,
            companySize: null,
            location: null,
            logoUrl: "https://example.com/logo.png",
            companyId: "c1",
          },
        ],
      }),
    })

    renderSection()

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "Logo Inc" })
      expect(img).toHaveAttribute("src", "https://example.com/logo.png")
    })
  })
})
