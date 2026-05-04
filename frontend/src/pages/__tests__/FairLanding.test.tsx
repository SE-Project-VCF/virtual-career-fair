/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairLanding from "../FairLanding"
import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"
import { fetchOwnedCompaniesForUser } from "../../utils/ownedCompanies"

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
  },
}))

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
  FairProvider: ({ children }: any) => <>{children}</>,
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children?: ReactNode; pageTitle?: string }) => (
    <div data-testid="base-layout">
      {pageTitle && <h6>{pageTitle}</h6>}
      {children}
    </div>
  ),
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

const fairLandingFirebaseMocks = vi.hoisted(() => {
  const getIdToken = vi.fn().mockResolvedValue("mock-token")
  const user = { getIdToken: () => getIdToken() as Promise<string> }
  return {
    getIdToken,
    waitForFirebaseUser: vi.fn(() => Promise.resolve(user)),
  }
})

vi.mock("../../firebase", () => ({
  waitForFirebaseUser: fairLandingFirebaseMocks.waitForFirebaseUser,
  auth: {
    currentUser: {
      getIdToken: fairLandingFirebaseMocks.getIdToken,
    },
  },
}))

vi.mock("../../utils/ownedCompanies", () => ({
  fetchOwnedCompaniesForUser: vi.fn().mockResolvedValue([]),
}))

const renderFairLanding = () =>
  render(
    <BrowserRouter>
      <FairLanding />
    </BrowserRouter>
  )

describe("FairLanding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()
    fairLandingFirebaseMocks.getIdToken.mockResolvedValue("mock-token")

    // Default: non-company student user
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })
  })

  it("shows loading spinner while loading", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: true,
      fair: null,
      isLive: false,
      fairId: null,
    })

    renderFairLanding()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows not found alert when fair is null", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: null,
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText("Career fair not found")).toBeInTheDocument()
  })

  it("renders fair name and not live chip", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getAllByText("Spring Fair")[0]).toBeInTheDocument()
    expect(screen.getByText("Not Live")).toBeInTheDocument()
  })

  it("renders Live Now chip when fair is live", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: true,
      },
      isLive: true,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText("Live Now")).toBeInTheDocument()
  })

  it("Browse Booths button is disabled when fair not live", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    // When not live the button text is "Fair Not Live Yet"
    const browseButton = screen.getByRole("button", { name: /browse booths|fair not live/i })
    expect(browseButton).toBeDisabled()
  })

  it("shows Join This Fair button for company owner", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })
  })

  it("shows Leave Fair button when enrolled", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [{ fairId: "f1", boothId: "booth-1", companyId: "company-1" }] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument()
    })
  })

  it("opens join dialog when Join This Fair is clicked", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    expect(screen.getByLabelText(/fair invite code/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^join fair$/i })).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Additional tests added to improve coverage
  // ---------------------------------------------------------------------------

  it("shows fair description when present", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: "Annual recruiting event for top companies.",
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText("Annual recruiting event for top companies.")).toBeInTheDocument()
  })

  it("shows formatted date range from startTime and endTime", () => {
    // Use a fixed timestamp so the formatted output is deterministic enough to assert existence
    const startMs = new Date("2025-03-15T10:00:00Z").getTime()
    const endMs = new Date("2025-03-15T17:00:00Z").getTime()

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: startMs,
        endTime: endMs,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    // The component renders: {formatDate(startTime)} – {formatDate(endTime)}
    // We just verify the separator is present, proving both dates rendered
    const dateText = screen.getByText(/–/)
    expect(dateText).toBeInTheDocument()
  })

  it("shows TBD when startTime and endTime are null", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    // formatDate(null) returns "TBD"; both start and end should be TBD
    const dateText = screen.getByText(/TBD.*TBD/)
    expect(dateText).toBeInTheDocument()
  })

  it("join dialog: Join Fair button is disabled when invite code input is empty", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    const joinButton = screen.getByRole("button", { name: /^join fair$/i })
    expect(joinButton).toBeDisabled()
  })

  it("join dialog: invite code input converts text to uppercase", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    const input = screen.getByLabelText(/fair invite code/i)
    await user.type(input, "abcd1234")

    expect(input).toHaveValue("ABCD1234")
  })

  it("join dialog: cancel button closes the dialog", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))
    expect(screen.getByText(/enter the fair invite code/i)).toBeInTheDocument()

    // Click the Cancel button inside the join dialog
    const cancelButtons = screen.getAllByRole("button", { name: /^cancel$/i })
    await user.click(cancelButtons[0])

    await waitFor(() => {
      expect(screen.queryByText(/enter the fair invite code/i)).not.toBeInTheDocument()
    })
  })

  it("handleJoinFair: shows error when API returns an error", async () => {
    const user = userEvent.setup()

    vi.mocked(fetchOwnedCompaniesForUser).mockResolvedValue([
      { id: "company-1", companyName: "Test Company" },
    ])

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
      companyId: "company-1",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    // First call: load enrollments; second: booths fetch (on dialog open); third: enroll fails
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Invalid invite code" }),
      })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    const input = screen.getByLabelText(/fair invite code/i)
    await user.type(input, "BADCODE")

    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    await waitFor(() => {
      expect(screen.getByText("Invalid invite code")).toBeInTheDocument()
    })
  })

  it("handleJoinFair: navigates to company dashboard on success when companyId is present", async () => {
    const user = userEvent.setup()

    vi.mocked(fetchOwnedCompaniesForUser).mockResolvedValue([
      { id: "company-1", companyName: "Test Company" },
    ])

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
      companyId: "company-1",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ boothId: "booth-99", fairId: "f1" }),
      })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    const input = screen.getByLabelText(/fair invite code/i)
    await user.type(input, "GOODCODE")

    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1")
    })
  })

  it("handleJoinFair: navigates to company dashboard when companyId is present even without boothId", async () => {
    const user = userEvent.setup()

    vi.mocked(fetchOwnedCompaniesForUser).mockResolvedValue([
      { id: "company-1", companyName: "Test Company" },
    ])

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
      companyId: "company-1",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairId: "f1" }), // no boothId
      })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    const input = screen.getByLabelText(/fair invite code/i)
    await user.type(input, "GOODCODE")

    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1")
    })
  })

  it("shows leave dialog when Leave Fair button is clicked", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [{ fairId: "f1", boothId: "booth-1", companyId: "company-1" }] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /leave fair/i }))

    expect(screen.getByText(/leave career fair\?/i)).toBeInTheDocument()
    expect(screen.getByText(/your company will be unenrolled/i)).toBeInTheDocument()
  })

  it("leave dialog: cancel button closes the dialog", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [{ fairId: "f1", boothId: "booth-1", companyId: "company-1" }] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /leave fair/i }))
    expect(screen.getByText(/leave career fair\?/i)).toBeInTheDocument()

    const cancelButtons = screen.getAllByRole("button", { name: /^cancel$/i })
    await user.click(cancelButtons[0])

    await waitFor(() => {
      expect(screen.queryByText(/leave career fair\?/i)).not.toBeInTheDocument()
    })
  })

  it("handleLeaveFair: shows success message after successfully leaving fair", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    // First call: load enrollments (enrolled); second call: leave fair succeeds
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "booth-1", companyId: "company-1" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Left fair" }),
      })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /leave fair/i }))

    // Click the Leave Fair button inside the dialog (color="error" variant)
    const leaveButtons = screen.getAllByRole("button", { name: /leave fair/i })
    // The dialog's confirm button is the last one rendered
    await user.click(leaveButtons.at(-1)!)

    await waitFor(() => {
      expect(screen.getByText(/you have left this fair/i)).toBeInTheDocument()
    })
  })

  it("handleLeaveFair: shows error in dialog when API call fails", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "booth-1", companyId: "company-1" }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Failed to leave fair" }),
      })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /leave fair/i }))

    const leaveButtons = screen.getAllByRole("button", { name: /leave fair/i })
    await user.click(leaveButtons.at(-1)!)

    await waitFor(() => {
      expect(screen.getByText("Failed to leave fair")).toBeInTheDocument()
    })
  })

  it("Back to Fairs button navigates to /fairs when fair is null", async () => {
    const user = userEvent.setup()

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: null,
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    await user.click(screen.getByRole("button", { name: /back to fairs/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fairs")
  })

  it("All Fairs back button navigates to /fairs on fair detail page", async () => {
    const user = userEvent.setup()

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    // Back button is an IconButton with ArrowBackIcon, find it by testid
    const backButton = screen.getByTestId("ArrowBackIcon").closest("button")!
    await user.click(backButton)

    expect(mockNavigate).toHaveBeenCalledWith("/fairs")
  })

  it("Browse Booths button navigates when fair is live", async () => {
    const user = userEvent.setup()

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: true,
      },
      isLive: true,
      fairId: "f1",
    })

    renderFairLanding()

    const browseButton = screen.getByRole("button", { name: /browse booths/i })
    expect(browseButton).not.toBeDisabled()

    await user.click(browseButton)

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1/booths")
  })

  it("does not show Join/Leave button for non-company users (student)", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "student-1",
      email: "student@example.com",
      role: "student",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.queryByRole("button", { name: /join this fair/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /leave fair/i })).not.toBeInTheDocument()
  })

  it("Networking Lounge button navigates to lounge when fair is live", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "student-1",
      email: "student@example.com",
      role: "student",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: true,
      },
      isLive: true,
      fairId: "f1",
    })

    renderFairLanding()

    const loungeButton = screen.getByRole("button", { name: /networking lounge/i })
    expect(loungeButton).not.toBeDisabled()

    await user.click(loungeButton)

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1/lounge")
  })

  it("Networking Lounge button is disabled when fair is not live", () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "student-1",
      email: "student@example.com",
      role: "student",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    const loungeButton = screen.getByRole("button", { name: /networking lounge/i })
    expect(loungeButton).toBeDisabled()
  })

  it("does not show Networking Lounge button for company users", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: true,
      },
      isLive: true,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    expect(screen.queryByRole("button", { name: /networking lounge/i })).not.toBeInTheDocument()
  })

  it("shows Join This Fair button for representative role", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "rep-1",
      email: "rep@company.com",
      role: "representative",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })
  })

  it("renders venue city, state, and ZIP when present", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
        venueCity: "Charlotte",
        venueState: "NC",
        venueZip: "28202",
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText(/Charlotte,\s*NC\s+28202/)).toBeInTheDocument()
  })

  it("renders venue ZIP when only venueZip is present", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "ZIP Only Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
        venueCity: null,
        venueState: null,
        venueZip: "28202",
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText(/\s*28202/)).toBeInTheDocument()
  })

  it("passes fair name to BaseLayout as page title", () => {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Regional Hiring Day",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByTestId("base-layout")).toHaveTextContent("Regional Hiring Day")
  })

  it("handleJoinFair: navigates to company dashboard when response has boothId but no fairId", async () => {
    const user = userEvent.setup()

    vi.mocked(fetchOwnedCompaniesForUser).mockResolvedValue([
      { id: "company-1", companyName: "Test Company" },
    ])

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
      companyId: "company-1",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: { id: "f1", name: "Spring Fair", description: null, startTime: null, endTime: null, isLive: false },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ boothId: "booth-only" }),
      })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))
    await user.type(screen.getByLabelText(/fair invite code/i), "ABC")
    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1")
    })
  })

  it("skips enrollment fetch when getIdToken returns a falsy token", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    fairLandingFirebaseMocks.getIdToken.mockResolvedValueOnce("" as unknown as string)
    renderFairLanding()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("logs when loading enrollment fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "not ok" }),
    })
    renderFairLanding()
    await waitFor(() => {
      expect(errSpy).toHaveBeenCalledWith("Error loading enrollment:", expect.any(Error))
    })
    errSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------
  // Booth picker in the Join dialog (multi-booth enrollment)
  // ---------------------------------------------------------------------------

  const companyOwnerWithId = {
    uid: "owner-1",
    email: "owner@company.com",
    role: "companyOwner",
    companyId: "company-1",
  } as const

  const inactiveFair = {
    id: "f1",
    name: "Spring Fair",
    description: null,
    startTime: null,
    endTime: null,
    isLive: false,
  }

  function mockFairContextActive() {
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
      loading: false,
      fair: inactiveFair,
      isLive: false,
      fairId: "f1",
    })
    vi.mocked(fetchOwnedCompaniesForUser).mockResolvedValue([
      { id: "company-1", companyName: "Test Company" },
    ])
  }

  it("renders the company's booths as checkboxes when the join dialog opens", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyOwnerWithId)
    mockFairContextActive()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enrollments: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          booths: [
            { id: "b1", boothName: "Alpha" },
            { id: "b2", boothName: "Beta" },
          ],
        }),
      })

    renderFairLanding()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    await waitFor(() => {
      expect(screen.getByText(/select booths to bring to this fair/i)).toBeInTheDocument()
    })
    const alphaCheckbox = screen.getByRole("checkbox", { name: "Alpha" })
    const betaCheckbox = screen.getByRole("checkbox", { name: "Beta" })
    expect(alphaCheckbox).toBeChecked()
    expect(betaCheckbox).toBeChecked()
  })

  it("falls back to 'Untitled Booth' when booth has no name", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyOwnerWithId)
    mockFairContextActive()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enrollments: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [{ id: "b1" }] }),
      })

    renderFairLanding()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /untitled booth/i })).toBeInTheDocument()
    })
  })

  it("toggles a booth selection off and on", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyOwnerWithId)
    mockFairContextActive()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enrollments: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [{ id: "b1", boothName: "Alpha" }] }),
      })

    renderFairLanding()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    const checkbox = await screen.findByRole("checkbox", { name: "Alpha" })
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it("shows 'No booths found' when the company has no booths", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyOwnerWithId)
    mockFairContextActive()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enrollments: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ booths: [] }) })

    renderFairLanding()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    await waitFor(() => {
      expect(screen.getByText(/no booths found\. create a booth/i)).toBeInTheDocument()
    })
  })

  it("logs when fetching booths fails", async () => {
    const user = userEvent.setup()
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyOwnerWithId)
    mockFairContextActive()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enrollments: [] }) })
      .mockRejectedValueOnce(new Error("network down"))

    renderFairLanding()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith("Error fetching booths:", expect.any(Error))
    )
    errSpy.mockRestore()
  })

  it("sends selected boothIds in the enroll request body", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyOwnerWithId)
    mockFairContextActive()

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enrollments: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [{ id: "b1", boothName: "Alpha" }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ fairId: "f1" }) })
    globalThis.fetch = fetchMock

    renderFairLanding()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    await screen.findByRole("checkbox", { name: "Alpha" })
    await user.type(screen.getByLabelText(/fair invite code/i), "GOODCODE")
    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    await waitFor(() => {
      const enrollCall = fetchMock.mock.calls.find((c) =>
        typeof c[0] === "string" && c[0].includes("/enroll")
      )
      expect(enrollCall).toBeDefined()
      const body = JSON.parse(enrollCall![1].body)
      expect(body.inviteCode).toBe("GOODCODE")
      expect(body.boothIds).toEqual(["b1"])
    })
  })

  it("omits boothIds from body when no booths are selected", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyOwnerWithId)
    mockFairContextActive()

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enrollments: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ booths: [{ id: "b1", boothName: "Alpha" }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ fairId: "f1" }) })
    globalThis.fetch = fetchMock

    renderFairLanding()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    const checkbox = await screen.findByRole("checkbox", { name: "Alpha" })
    await user.click(checkbox) // deselect the only option

    await user.type(screen.getByLabelText(/fair invite code/i), "GOODCODE")
    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    await waitFor(() => {
      const enrollCall = fetchMock.mock.calls.find((c) =>
        typeof c[0] === "string" && c[0].includes("/enroll")
      )
      expect(enrollCall).toBeDefined()
      const body = JSON.parse(enrollCall![1].body)
      expect(body.boothIds).toBeUndefined()
    })
  })
})
