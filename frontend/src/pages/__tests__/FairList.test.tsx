/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairList from "../FairList"
import * as authUtils from "../../utils/auth"

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

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

vi.mock("../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}))

// The source imports NotificationBell from "../components/NotificationBell"
// relative to FairList.tsx which lives in src/pages/, so the resolved path
// is src/components/NotificationBell. Vitest resolves module mocks by the
// specifier used in the source file, so we mock it at that path.
vi.mock("../../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
    onAuthStateChanged: vi.fn((cb: (u: any) => void) => {
      cb({ getIdToken: vi.fn().mockResolvedValue("mock-token") })
      return vi.fn()
    }),
  },
}))

const renderFairList = () =>
  render(
    <BrowserRouter>
      <FairList />
    </BrowserRouter>
  )

describe("FairList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()

    // Default: student user (no company controls)
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })
  })

  it("shows loading spinner initially", async () => {
    // Never-resolving promise keeps loading state true
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    renderFairList()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows fairs list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "f1",
            name: "Spring Fair",
            description: null,
            isLive: true,
            startTime: null,
            endTime: null,
          },
        ],
      }),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText("Spring Fair")).toBeInTheDocument()
    })
  })

  it("shows Live Now chip for live fair", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "f1",
            name: "Spring Fair",
            description: null,
            isLive: true,
            startTime: null,
            endTime: null,
          },
        ],
      }),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument()
    })
  })

  it("shows No career fairs available when list is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [] }),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText("No career fairs available")).toBeInTheDocument()
    })
  })

  it("shows error alert on fetch failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
    })
  })

  it("shows Join Fair button for company owner on non-enrolled fair", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    // First call: /api/fairs — returns fair list
    // Second call: /api/fairs/my-enrollments — returns empty enrollments
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "f1",
              name: "Spring Fair",
              description: null,
              isLive: false,
              startTime: null,
              endTime: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join fair/i })).toBeInTheDocument()
    })
  })

  it("opens join dialog when Join Fair is clicked", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "f1",
              name: "Spring Fair",
              description: null,
              isLive: false,
              startTime: null,
              endTime: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join fair/i }))

    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument()
  })
})

describe("FairList — View Fair navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })
  })

  it("navigates to fair detail page when View Fair is clicked", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [{ id: "f1", name: "Spring Fair", description: null, isLive: false, startTime: null, endTime: null }],
      }),
    })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Spring Fair")).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /view fair/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1")
  })

  it("navigates to /dashboard when back arrow is clicked", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [] }),
    })

    renderFairList()

    await waitFor(() => expect(screen.getByText("No career fairs available")).toBeInTheDocument())

    // The back arrow is an IconButton, find by its ArrowBackIcon aria-hidden or use the button role
    const buttons = screen.getAllByRole("button")
    // First button in the header is the back button
    await user.click(buttons[0])

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("shows Upcoming chip for future fair", async () => {
    const futureTime = Date.now() + 86400000 // tomorrow

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [{ id: "f1", name: "Future Fair", description: null, isLive: false, startTime: futureTime, endTime: null }],
      }),
    })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Upcoming")).toBeInTheDocument())
  })

  it("shows Ended chip for past fair", async () => {
    const pastTime = Date.now() - 86400000 // yesterday

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [{ id: "f1", name: "Past Fair", description: null, isLive: false, startTime: null, endTime: pastTime }],
      }),
    })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Ended")).toBeInTheDocument())
  })

  it("shows Scheduled chip for fair without start or end time", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [{ id: "f1", name: "TBD Fair", description: null, isLive: false, startTime: null, endTime: null }],
      }),
    })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Scheduled")).toBeInTheDocument())
  })

  it("shows fair description when present", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [{ id: "f1", name: "Described Fair", description: "Meet top employers", isLive: false, startTime: null, endTime: null }],
      }),
    })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Meet top employers")).toBeInTheDocument())
  })
})

describe("FairList — enrolled company actions", () => {
  const enrolledCompanyUser = {
    uid: "owner-1",
    email: "owner@company.com",
    role: "companyOwner" as const,
    companyId: "co1",
    companyName: "Acme Inc",
  }

  const liveFair = {
    id: "f1",
    name: "Spring Fair",
    description: null,
    isLive: true,
    startTime: null,
    endTime: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(enrolledCompanyUser as any)
  })

  it("shows Edit Booth and Leave Fair buttons for enrolled company", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit booth/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument()
    })
  })

  it("navigates to booth editor when Edit Booth is clicked (with boothId and companyId)", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit booth/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /edit booth/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1/company/co1/booth?bid=b1")
  })

  it("navigates to fair page when Edit Booth is clicked without boothId", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: null }] }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit booth/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /edit booth/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/fair/f1")
  })

  it("shows 'Your company is enrolled' banner without companyName", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
      companyId: "co1",
    } as any)

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Your company is enrolled")).toBeInTheDocument())
  })

  it("shows company name in enrolled banner when companyName is set", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Acme Inc is enrolled")).toBeInTheDocument())
  })

  it("opens leave dialog when Leave Fair is clicked", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /leave fair/i }))

    expect(screen.getByText(/Your company's booth and job listings will be removed/i)).toBeInTheDocument()
  })

  it("calls leave endpoint and removes fair from enrolled map on success", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /leave fair/i }))

    // Confirm leave
    await user.click(screen.getByRole("button", { name: /^leave fair$/i }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/leave"),
        expect.objectContaining({ method: "DELETE" })
      )
    })

    // The Leave Fair button should disappear after leaving
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /leave fair/i })).not.toBeInTheDocument()
    })
  })

  it("shows error in leave dialog when leave API fails", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Cannot leave active fair" }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /leave fair/i }))
    await user.click(screen.getByRole("button", { name: /^leave fair$/i }))

    await waitFor(() => {
      expect(screen.getByText("Cannot leave active fair")).toBeInTheDocument()
    })
  })

  it("closes leave dialog when Cancel is clicked", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [liveFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [{ fairId: "f1", boothId: "b1" }] }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /leave fair/i }))
    expect(screen.getByText(/Your company's booth and job listings will be removed/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText(/Your company's booth and job listings will be removed/i)).not.toBeInTheDocument()
    })
  })
})

describe("FairList — join fair flow", () => {
  const companyUser = {
    uid: "owner-1",
    email: "owner@company.com",
    role: "companyOwner" as const,
    companyId: "co1",
  }

  const openFair = {
    id: "f1",
    name: "Spring Fair",
    description: null,
    isLive: false,
    startTime: null,
    endTime: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(companyUser as any)
  })

  it("shows join error when API returns error", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [openFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Invalid invite code" }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /join fair/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /join fair/i }))
    await user.type(screen.getByLabelText(/invite code/i), "BADCODE")
    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    await waitFor(() => {
      expect(screen.getByText("Invalid invite code")).toBeInTheDocument()
    })
  })

  it("closes join dialog and marks fair as enrolled on success", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [openFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ boothId: "b99" }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /join fair/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /join fair/i }))
    await user.type(screen.getByLabelText(/invite code/i), "GOODCODE")
    await user.click(screen.getByRole("button", { name: /^join fair$/i }))

    // After success: join dialog closes and company is marked enrolled → Edit Booth button appears
    await waitFor(() => {
      expect(screen.queryByText(/Enter the invite code/i)).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: /edit booth/i })).toBeInTheDocument()
    })
  })

  it("cancels join dialog and clears invite code", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fairs: [openFair] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })

    renderFairList()

    await waitFor(() => expect(screen.getByRole("button", { name: /join fair/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /join fair/i }))
    await user.type(screen.getByLabelText(/invite code/i), "ABCDEF")

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    // Wait for dialog to fully close before re-opening
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    // Re-open: invite code field should be empty
    await user.click(screen.getByRole("button", { name: /join fair/i }))
    expect(screen.getByLabelText(/invite code/i)).toHaveValue("")
  })
})
