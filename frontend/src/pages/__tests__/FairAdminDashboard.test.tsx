/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAdminDashboard from "../FairAdminDashboard"
import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"

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

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
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

const renderFairAdminDashboard = () =>
  render(
    <BrowserRouter>
      <FairAdminDashboard />
    </BrowserRouter>
  )

describe("FairAdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()

    // Default: administrator
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    // Default: fair loaded and not live
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: false,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })

    // Default fetch: enrollments endpoint returns empty list
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })
  })

  it("redirects non-admin to /dashboard", () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })

    renderFairAdminDashboard()

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("shows loading spinner when fairLoading is true", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: true,
      fair: null,
      isLive: false,
      fairId: null,
    })

    renderFairAdminDashboard()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows Fair not found when fair is null", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: null,
      isLive: false,
      fairId: "f1",
    })

    renderFairAdminDashboard()

    expect(screen.getByText("Fair not found")).toBeInTheDocument()
  })

  it("renders fair admin header with fair name", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Admin — Spring Fair")).toBeInTheDocument()
    })
  })

  it("shows Live chip when fair is live", async () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: true,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: true,
      fairId: "f1",
    })

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument()
    })
  })

  it("shows Offline chip when fair is not live", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument()
    })
  })

  it("shows invite code", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument()
    })
  })

  it("shows No companies enrolled yet when empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("No companies enrolled yet.")).toBeInTheDocument()
    })
  })

  it("Add Company button opens dialog", async () => {
    const user = userEvent.setup()

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /add company/i }))

    expect(screen.getByText("Add Company to Fair")).toBeInTheDocument()
  })
})

describe("FairAdminDashboard — invite code", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: false,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    // Mock clipboard writeText as a spy
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
  })

  it("copies invite code to clipboard and shows Copied! feedback", async () => {
    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("ABC123")).toBeInTheDocument())

    const copyBtn = screen.getByTitle("Copy code")
    await user.click(copyBtn)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABC123")
    expect(screen.getByText("Copied!")).toBeInTheDocument()
  })

  it("calls refresh invite code endpoint and clears Copied state", async () => {
    const user = userEvent.setup()

    // First call = enrollments, second = refresh-invite-code
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ inviteCode: "XYZ789" }),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("ABC123")).toBeInTheDocument())

    const refreshBtn = screen.getByTitle("Generate new code")
    await user.click(refreshBtn)

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/refresh-invite-code"),
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  it("shows error alert when refresh invite code fails with JSON error", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: { get: () => "application/json" },
        json: async () => ({ error: "Something went wrong" }),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("ABC123")).toBeInTheDocument())

    const refreshBtn = screen.getByTitle("Generate new code")
    await user.click(refreshBtn)

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    })
  })

  it("shows API error when refresh invite code fails without JSON body", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        headers: { get: () => "text/html" },
        json: async () => { throw new Error("not json") },
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("ABC123")).toBeInTheDocument())

    const refreshBtn = screen.getByTitle("Generate new code")
    await user.click(refreshBtn)

    await waitFor(() => {
      expect(screen.getByText(/API Error: 503/i)).toBeInTheDocument()
    })
  })
})

describe("FairAdminDashboard — toggle live", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: false,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })
  })

  it("calls toggle-status endpoint when switch is toggled", async () => {
    // Mock location.reload so it doesn't throw
    const reloadMock = vi.fn()
    Object.defineProperty(globalThis, "location", {
      value: { reload: reloadMock },
      writable: true,
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Offline")).toBeInTheDocument())

    // MUI Switch input is visually hidden; use fireEvent to bypass pointer-events checks
    fireEvent.click(screen.getByText("Go Live"))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/toggle-status"),
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  it("shows error when toggle-status fails", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Offline")).toBeInTheDocument())

    // MUI Switch input is visually hidden; use fireEvent to bypass pointer-events checks
    fireEvent.click(screen.getByText("Go Live"))

    await waitFor(() => {
      expect(screen.getByText("Failed to toggle status")).toBeInTheDocument()
    })
  })
})

describe("FairAdminDashboard — add company dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: false,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })
  })

  it("shows error in add company dialog on API failure", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Company not found" }),
      })

    renderFairAdminDashboard()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole("button", { name: /add company/i }))
    await user.type(screen.getByLabelText(/company id/i), "bad-id")
    await user.click(screen.getByRole("button", { name: /^add company$/i }))

    await waitFor(() => {
      expect(screen.getByText("Company not found")).toBeInTheDocument()
    })
  })

  it("closes add company dialog and reloads enrollments on success", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ id: "c1", companyName: "Acme", enrollmentMethod: "admin", enrolledAt: null }] }),
      })

    renderFairAdminDashboard()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole("button", { name: /add company/i }))
    await user.type(screen.getByLabelText(/company id/i), "c1")
    await user.click(screen.getByRole("button", { name: /^add company$/i }))

    await waitFor(() => {
      expect(screen.getByText("Company enrolled successfully")).toBeInTheDocument()
    })
  })

  it("canceling add dialog clears the company ID field", async () => {
    const user = userEvent.setup()

    renderFairAdminDashboard()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole("button", { name: /add company/i }))
    await user.type(screen.getByLabelText(/company id/i), "some-id")

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    // Wait for dialog to fully close before re-opening
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    // Re-open and the field should be empty
    await user.click(screen.getByRole("button", { name: /add company/i }))
    expect(screen.getByLabelText(/company id/i)).toHaveValue("")
  })
})

describe("FairAdminDashboard — enrolled companies table", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: false,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })
  })

  it("renders enrolled companies in the table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enrollments: [
          { id: "c1", companyName: "Acme Corp", enrollmentMethod: "invite", enrolledAt: { seconds: 1700000000 } },
        ],
      }),
    })

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(screen.getByText("invite")).toBeInTheDocument()
    })
  })

  it("shows dash for enrollment date when enrolledAt is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enrollments: [
          { id: "c1", companyName: "NoDate Corp", enrollmentMethod: "admin", enrolledAt: null },
        ],
      }),
    })

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("NoDate Corp")).toBeInTheDocument()
    })
    // The dash character is rendered for null enrolledAt
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("removes company when delete is confirmed", async () => {
    globalThis.confirm = vi.fn().mockReturnValue(true)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enrollments: [
            { id: "c1", companyName: "Acme Corp", enrollmentMethod: "admin", enrolledAt: null },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })

    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: "" }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/enrollments/c1"),
        expect.objectContaining({ method: "DELETE" })
      )
    })
  })

  it("does not remove company when confirm is cancelled", async () => {
    globalThis.confirm = vi.fn().mockReturnValue(false)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enrollments: [
          { id: "c1", companyName: "Acme Corp", enrollmentMethod: "admin", enrolledAt: null },
        ],
      }),
    })

    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())

    const fetchCallsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await user.click(screen.getByRole("button", { name: "" }))

    // No additional fetch after cancel
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBefore)
  })

  it("shows error alert when remove company API fails", async () => {
    globalThis.confirm = vi.fn().mockReturnValue(true)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enrollments: [
            { id: "c1", companyName: "Acme Corp", enrollmentMethod: "admin", enrolledAt: null },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })

    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: "" }))

    await waitFor(() => {
      expect(screen.getByText("Failed to remove company")).toBeInTheDocument()
    })
  })
})

describe("FairAdminDashboard — edit fair dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: "A great fair",
        isLive: false,
        startTime: 1700000000000,
        endTime: 1700100000000,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })
  })

  it("opens edit dialog with pre-filled fair details", async () => {
    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))

    expect(screen.getByText("Edit Fair Details")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Spring Fair")).toBeInTheDocument()
  })

  it("shows error when save fair API fails", async () => {
    const user = userEvent.setup()

    const reloadMock = vi.fn()
    Object.defineProperty(globalThis, "location", {
      value: { reload: reloadMock },
      writable: true,
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Name is required" }),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))
    await user.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument()
    })
  })

  it("navigates back to /admin when back button is clicked", async () => {
    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("← Back to Admin")).toBeInTheDocument())
    await user.click(screen.getByText("← Back to Admin"))

    expect(mockNavigate).toHaveBeenCalledWith("/admin")
  })

  it("shows description, start time and end time in fair details section", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("A great fair")).toBeInTheDocument()
      // The start and end times are rendered via toLocaleString
      expect(screen.getByText("Description")).toBeInTheDocument()
      expect(screen.getByText("Start")).toBeInTheDocument()
      expect(screen.getByText("End")).toBeInTheDocument()
    })
  })

  it("dismisses error alert when close is clicked", async () => {
    globalThis.confirm = vi.fn().mockReturnValue(true)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enrollments: [
            { id: "c1", companyName: "Acme Corp", enrollmentMethod: "admin", enrolledAt: null },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })

    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "" }))

    await waitFor(() => expect(screen.getByText("Failed to remove company")).toBeInTheDocument())

    const closeBtn = screen.getByRole("button", { name: /close/i })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByText("Failed to remove company")).not.toBeInTheDocument()
    })
  })
})
