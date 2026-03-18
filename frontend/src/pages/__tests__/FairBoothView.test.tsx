import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairBoothView from "../FairBoothView"
import { useFair } from "../../contexts/FairContext"
import { authUtils } from "../../utils/auth"
import * as firestore from "firebase/firestore"
import { trackBoothView } from "../../utils/boothHistory"

const mockNavigate = vi.fn()
const mockBoothId = { boothId: "booth-1" }

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => mockBoothId }
})
vi.mock("../../utils/auth", () => ({ authUtils: { getCurrentUser: vi.fn(), getIdToken: vi.fn().mockResolvedValue("mock-token") } }))
vi.mock("../../contexts/FairContext", () => ({ useFair: vi.fn(), FairProvider: ({ children }: any) => <>{children}</> }))
vi.mock("../../config", () => ({ API_URL: "http://localhost:5000" }))
vi.mock("../ProfileMenu", () => ({ default: () => <div data-testid="profile-menu" /> }))
vi.mock("../../components/NotificationBell", () => ({ default: () => <div data-testid="notification-bell" /> }))
vi.mock("../../utils/boothHistory", () => ({ trackBoothView: vi.fn() }))
vi.mock("../../components/JobApplicationFormDialog", () => ({
  default: ({ open, onClose, job, boothId, studentId }: any) =>
    open ? (
      <div data-testid="job-application-dialog">
        <span data-testid="dialog-job-id">{job?.id}</span>
        <span data-testid="dialog-company-id">{job?.companyId}</span>
        <span data-testid="dialog-booth-id">{boothId}</span>
        <span data-testid="dialog-student-id">{studentId}</span>
        <button data-testid="dialog-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}))
vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: any) => (
    <div data-testid="base-layout">
      <button aria-label="menu">Menu</button>
      <span>Job Goblin</span>
      <span>Virtual Career Fair</span>
      {pageTitle && <h6>{pageTitle}</h6>}
      <button data-testid="notification-bell" />
      <button data-testid="profile-menu">Profile Menu</button>
      {children}
    </div>
  ),
}))
vi.mock("../../firebase", () => ({
  db: {},
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") } },
}))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))

const renderFairBoothView = () =>
  render(
    <BrowserRouter>
      <FairBoothView />
    </BrowserRouter>
  )

const boothFetchResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    companyName: "Tech Corp",
    industry: "software",
    companySize: "51-200",
    location: "NYC",
    description: "A great company",
    contactName: "Jane",
    contactEmail: "jane@tech.com",
    companyId: "c1",
  }),
})
const jobsFetchResponse = (jobs: any[] = []) => ({
  ok: true,
  status: 200,
  json: async () => ({ jobs }),
})

describe("FairBoothView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
    vi.mocked(useFair).mockReturnValue({ fair: { name: "Spring Fair" }, loading: false, fairId: "fair-1", isLive: true } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "u1", role: "student", email: "s@test.com" } as any)
  })

  it("shows loading spinner while fairLoading is true", () => {
    vi.mocked(useFair).mockReturnValue({ loading: true, fair: null, fairId: null, isLive: false } as any)

    renderFairBoothView()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("renders booth details after successful fetch", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))
  })

  it("shows error on 403 (fair not live)", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: 403, ok: false })
      .mockResolvedValueOnce({ status: 403, ok: false })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText(/not currently live/i)).toBeInTheDocument())
  })

  it("shows booth not found error on 404", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({ status: 404, ok: false })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText(/booth not found/i)).toBeInTheDocument())
  })

  it("shows jobs when they match the booth's companyId", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jobs: [
            {
              id: "j1",
              name: "Software Engineer",
              description: "Great role",
              majorsAssociated: "CS",
              applicationLink: null,
              companyId: "c1",
            },
          ],
        }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())
  })

  it("shows Message Representative button for student", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /message representative/i })).toBeInTheDocument()
    )
  })

  it("does not show Message Representative button for non-student", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "u1", role: "companyOwner", email: "o@test.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    expect(screen.queryByRole("button", { name: /message representative/i })).not.toBeInTheDocument()
  })

  it("includes Authorization header when fetching booth (line 191)", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    const boothFetchCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/booths/booth-1")
    )
    expect(boothFetchCall).toBeDefined()
    expect(boothFetchCall![1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer mock-token",
      }),
    })
  })

  it("back button navigates to booths", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    const backButton = screen.getByRole("button", { name: /back to spring fair booths/i })
    await user.click(backButton)

    expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-1/booths")
  })

  it("calls track-leave on unmount when student viewed booth (lines 94, 106)", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    const { unmount } = render(
      <BrowserRouter>
        <FairBoothView />
      </BrowserRouter>
    )

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    unmount()

    await waitFor(() => {
      const trackLeaveCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes("/track-leave")
      )
      expect(trackLeaveCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("uses originalBoothId for tracking when provided (line 154)", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
          originalBoothId: "original-booth-123",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    expect(trackBoothView).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ boothId: "original-booth-123" })
    )

    const trackViewCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes("/track-view")
    )
    expect(trackViewCalls.some((c) => String(c[0]).includes("original-booth-123"))).toBe(true)
  })

  it("calls trackBoothView and backend track-view when booth loads as student (lines 165, 169)", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    expect(trackBoothView).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        boothId: "booth-1",
        companyName: "Tech Corp",
      })
    )

    const trackViewCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes("/track-view")
    )
    expect(trackViewCalls.length).toBeGreaterThanOrEqual(1)
  })

  it("logs when backend booth track-view fails (line 177)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    const boothRes = {
      ok: true,
      status: 200,
      json: async () => ({
        companyName: "Tech Corp",
        industry: "software",
        companySize: "51-200",
        location: "NYC",
        description: "A great company",
        contactName: "Jane",
        contactEmail: "jane@tech.com",
        companyId: "c1",
      }),
    }
    const jobsRes = {
      ok: true,
      status: 200,
      json: async () => ({ jobs: [] }),
    }

    fetchMock
      .mockResolvedValueOnce(boothRes)
      .mockResolvedValueOnce(jobsRes)
      .mockRejectedValueOnce(new Error("Network error"))

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    expect(warnSpy).toHaveBeenCalledWith("Backend booth tracking failed:", expect.any(Error))
    warnSpy.mockRestore()
  })

  it("logs when trackBoothView (history) fails (line 184)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.mocked(trackBoothView).mockRejectedValueOnce(new Error("Firestore error"))

    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getAllByText("Tech Corp").length).toBeGreaterThan(0))

    expect(warnSpy).toHaveBeenCalledWith("History tracking failed:", expect.any(Error))
    warnSpy.mockRestore()
  })

  it("handleStartChat navigates to chat with repId when rep found (lines 219-234)", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    const mockDoc = { data: () => ({ uid: "rep-uid-123" }) }
    vi.mocked(firestore.getDocs).mockResolvedValueOnce({
      empty: false,
      docs: [mockDoc],
    } as any)

    renderFairBoothView()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /message representative/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole("button", { name: /message representative/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/chat", { state: { repId: "rep-uid-123" } })
    })
  })

  it("handleStartChat does not navigate when rep not found (snap.empty)", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    vi.mocked(firestore.getDocs).mockResolvedValueOnce({
      empty: true,
      docs: [],
    } as any)

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    renderFairBoothView()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /message representative/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole("button", { name: /message representative/i }))

    await waitFor(() => expect(firestore.getDocs).toHaveBeenCalled())

    expect(mockNavigate).not.toHaveBeenCalledWith("/dashboard/chat", expect.anything())
    expect(warnSpy).toHaveBeenCalledWith("Representative not found")
    warnSpy.mockRestore()
  })

  it("handleStartChat catches getDocs error and resets startingChat", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    vi.mocked(firestore.getDocs).mockRejectedValueOnce(new Error("Firestore unavailable"))

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    renderFairBoothView()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /message representative/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole("button", { name: /message representative/i }))

    await waitFor(() => expect(firestore.getDocs).toHaveBeenCalled())

    expect(errorSpy).toHaveBeenCalledWith("Chat init failed:", expect.any(Error))
    expect(mockNavigate).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  describe("job Apply buttons (lines 337-365)", () => {
    it("opens JobApplicationFormDialog when Apply Now is clicked for job with published applicationForm", async () => {
      const user = userEvent.setup()
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "c1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: "j1",
                name: "Software Engineer",
                description: "Great role",
                majorsAssociated: "CS",
                applicationLink: null,
                companyId: "c1",
                applicationForm: { status: "published" as const },
              },
            ],
          }),
        })

      renderFairBoothView()

      await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

      expect(screen.queryByTestId("job-application-dialog")).not.toBeInTheDocument()

      const applyButtons = screen.getAllByRole("button", { name: /apply now/i })
      await user.click(applyButtons[0])

      await waitFor(() => {
        expect(screen.getByTestId("job-application-dialog")).toBeInTheDocument()
      })
      expect(screen.getByTestId("dialog-job-id")).toHaveTextContent("j1")
      expect(screen.getByTestId("dialog-company-id")).toHaveTextContent("c1")
      expect(screen.getByTestId("dialog-booth-id")).toHaveTextContent("booth-1")
      expect(screen.getByTestId("dialog-student-id")).toHaveTextContent("u1")
    })

    it("shows external Apply Now link for job with applicationLink and no published form", async () => {
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "c1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: "j2",
                name: "Data Analyst",
                description: "Analyze data",
                majorsAssociated: "Data Science",
                applicationLink: "https://company.com/apply/j2",
                companyId: "c1",
                applicationForm: null,
              },
            ],
          }),
        })

      renderFairBoothView()

      await waitFor(() => expect(screen.getByText("Data Analyst")).toBeInTheDocument())

      const applyLink = screen.getByRole("link", { name: /apply now/i })
      expect(applyLink).toHaveAttribute("href", "https://company.com/apply/j2")
      expect(applyLink).toHaveAttribute("target", "_blank")
      expect(applyLink).toHaveAttribute("rel", "noopener noreferrer")
    })

    it("prioritizes published applicationForm over applicationLink when both exist", async () => {
      const user = userEvent.setup()
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "c1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: "j3",
                name: "DevOps Engineer",
                description: "DevOps role",
                majorsAssociated: "CS",
                applicationLink: "https://company.com/apply",
                companyId: "c1",
                applicationForm: { status: "published" as const },
              },
            ],
          }),
        })

      renderFairBoothView()

      await waitFor(() => expect(screen.getByText("DevOps Engineer")).toBeInTheDocument())

      const applyButton = screen.getByRole("button", { name: /apply now/i })
      await user.click(applyButton)

      await waitFor(() => {
        expect(screen.getByTestId("job-application-dialog")).toBeInTheDocument()
      })
      expect(screen.queryByRole("link", { name: /apply now/i })).not.toBeInTheDocument()
    })

    it("does not show Apply button when job has neither applicationLink nor published form", async () => {
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "c1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: "j4",
                name: "Intern",
                description: "Internship",
                majorsAssociated: "Any",
                applicationLink: null,
                companyId: "c1",
                applicationForm: { status: "draft" as const },
              },
            ],
          }),
        })

      renderFairBoothView()

      await waitFor(() => expect(screen.getByText("Intern")).toBeInTheDocument())

      expect(screen.queryByRole("button", { name: /apply now/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("link", { name: /apply now/i })).not.toBeInTheDocument()
    })
  })

  describe("JobApplicationFormDialog (lines 432-447)", () => {
    it("closes dialog and resets state when onClose is called", async () => {
      const user = userEvent.setup()
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "c1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: "j1",
                name: "Software Engineer",
                description: "Great role",
                majorsAssociated: "CS",
                applicationLink: null,
                companyId: "c1",
                applicationForm: { status: "published" as const },
              },
            ],
          }),
        })

      renderFairBoothView()

      await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

      await user.click(screen.getByRole("button", { name: /apply now/i }))

      await waitFor(() => expect(screen.getByTestId("job-application-dialog")).toBeInTheDocument())

      await user.click(screen.getByTestId("dialog-close"))

      await waitFor(() => {
        expect(screen.queryByTestId("job-application-dialog")).not.toBeInTheDocument()
      })
    })

    it("passes job.companyId to dialog and uses booth.companyId as fallback when job.companyId is null", async () => {
      const user = userEvent.setup()
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "booth-company-id",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: "j5",
                name: "Frontend Engineer",
                description: "Frontend role",
                majorsAssociated: "CS",
                applicationLink: null,
                companyId: "booth-company-id",
                applicationForm: { status: "published" as const },
              },
            ],
          }),
        })

      renderFairBoothView()

      await waitFor(() => expect(screen.getByText("Frontend Engineer")).toBeInTheDocument())

      await user.click(screen.getByRole("button", { name: /apply now/i }))

      await waitFor(() => expect(screen.getByTestId("job-application-dialog")).toBeInTheDocument())

      expect(screen.getByTestId("dialog-company-id")).toHaveTextContent("booth-company-id")
    })

  describe("Rating functionality", () => {
    const setupRatingFetch = (ratingData: any = null) => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/fairs/fair-1/booths/booth-1`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              companyName: "Tech Corp",
              industry: "software",
              companySize: "51-200",
              location: "NYC",
              description: "A great company",
              contactName: "Jane",
              contactEmail: "jane@tech.com",
              companyId: "c1",
              originalBoothId: "root-booth-1",
            }),
          });
        }
        if (url.includes("/jobs")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ jobs: [] }) });
        }
        if (url.includes("/track-view") || url.includes("/track-leave")) {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes("/ratings/me")) {
          return Promise.resolve({ ok: true, json: async () => ({ rating: ratingData }) });
        }
        if (url.includes("/ratings")) {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      });
    };

    it("shows rating form when booth has originalBoothId and no existing rating", async () => {
      setupRatingFetch(null);
      renderFairBoothView();

      await waitFor(() => {
        expect(screen.getByText("Rate This Booth")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Submit Review/ })).toBeInTheDocument();
      });
    });

    it("shows existing review when student already rated", async () => {
      setupRatingFetch({ rating: 5, comment: "Loved it!", createdAt: 2000000 });
      renderFairBoothView();

      await waitFor(() => {
        expect(screen.getByText("Your review")).toBeInTheDocument();
        expect(screen.getByText("Loved it!")).toBeInTheDocument();
      });
    });

    it("shows 'Rating not available' when booth has no originalBoothId", async () => {
      // booth without originalBoothId
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "c1",
          }),
        })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ jobs: [] }) });

      renderFairBoothView();

      await waitFor(() => {
        expect(screen.getByText(/rating not available/i)).toBeInTheDocument();
      });
    });

    it("submits rating successfully in FairBoothView", async () => {
      const user = userEvent.setup();
      setupRatingFetch(null);
      renderFairBoothView();

      await waitFor(() => {
        expect(screen.getByText("Rate This Booth")).toBeInTheDocument();
      });

      const radios = screen.getAllByRole("radio");
      fireEvent.click(radios[4]); // 5 stars

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Submit Review/ })).not.toBeDisabled();
      });

      await user.click(screen.getByRole("button", { name: /Submit Review/ }));

      await waitFor(() => {
        expect(screen.getByText("Review submitted!")).toBeInTheDocument();
      });
    });
  });

    it("passes boothId and studentId to JobApplicationFormDialog", async () => {
      const user = userEvent.setup()
      ;(globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            companyName: "Tech Corp",
            industry: "software",
            companySize: "51-200",
            location: "NYC",
            description: "A great company",
            contactName: "Jane",
            contactEmail: "jane@tech.com",
            companyId: "c1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: "j6",
                name: "Backend Engineer",
                description: "Backend role",
                majorsAssociated: "CS",
                applicationLink: null,
                companyId: "c1",
                applicationForm: { status: "published" as const },
              },
            ],
          }),
        })

      renderFairBoothView()

      await waitFor(() => expect(screen.getByText("Backend Engineer")).toBeInTheDocument())

      await user.click(screen.getByRole("button", { name: /apply now/i }))

      await waitFor(() => expect(screen.getByTestId("job-application-dialog")).toBeInTheDocument())

      expect(screen.getByTestId("dialog-booth-id")).toHaveTextContent("booth-1")
      expect(screen.getByTestId("dialog-student-id")).toHaveTextContent("u1")
    })
  })
})
