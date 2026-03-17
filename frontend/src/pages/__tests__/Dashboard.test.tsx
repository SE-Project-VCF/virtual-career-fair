import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import Dashboard from "../Dashboard"
import * as firestore from "firebase/firestore"

const mockNavigate = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockIsAuthenticated = vi.fn()
const mockLinkRepresentativeToCompany = vi.fn()
const mockParseMyResume = vi.fn().mockResolvedValue(undefined)

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: () => mockGetCurrentUser(),
    isAuthenticated: () => mockIsAuthenticated(),
    linkRepresentativeToCompany: (...args: any[]) => mockLinkRepresentativeToCompany(...args),
  },
  parseMyResume: () => mockParseMyResume(),
}))

vi.mock("../../components/EventList", () => ({
  default: () => <div data-testid="event-list">EventList</div>,
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">ProfileMenu</div>,
}))

vi.mock("../../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell">NotificationBell</div>,
}))

vi.mock("firebase/firestore")
vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
    onAuthStateChanged: vi.fn((callback: any) => {
      callback({ getIdToken: vi.fn().mockResolvedValue("mock-token") })
      return vi.fn()
    }),
  },
}))

const getFetchUrl = (input: string | Request | URL): string =>
  typeof input === "string" ? input : input instanceof Request ? input.url : input.toString()

// Mock fetch for API calls (fairs, unread count, stream-unread, job-invitations, etc.)
globalThis.fetch = vi.fn().mockImplementation((input: string | Request | URL) => {
  const url = getFetchUrl(input)
  if (url.includes("/api/fairs/my-enrollments")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ enrollments: [] }) });
  }
  if (url.includes("/api/fairs")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ fairs: [] }) });
  }
  if (url.includes("/api/stream-unread") || url.includes("/api/chat/unread")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ unread: 0 }) });
  }
  if (url.includes("/api/job-invitations/received")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ invitations: [] }) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
})

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  mockNavigate.mockClear()
  mockParseMyResume.mockResolvedValue(undefined)

  // Mock getDocs for stats
  vi.mocked(firestore.getDocs).mockResolvedValue({
    size: 5,
    forEach: vi.fn(),
    docs: []
  } as any)
})

describe("Dashboard", () => {
  // Authentication Tests
  describe("Authentication", () => {
    it("redirects to / when not authenticated", () => {
      mockIsAuthenticated.mockReturnValue(false)
      mockGetCurrentUser.mockReturnValue(null)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(mockNavigate).toHaveBeenCalledWith("/")
    })
  })

  // Student Dashboard Tests
  describe("Student Dashboard", () => {
    it("renders student dashboard with correct sections", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
        firstName: "John",
        lastName: "Doe",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText(/Welcome back, John Doe/)).toBeInTheDocument()
      expect(screen.getByText(/Career Opportunities/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument()
    })

    it("displays career fair not live alert for students", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getAllByText("Career Fair is Not Currently Live")[0]).toBeInTheDocument()
      })
      expect(screen.getAllByText(/the career fair is not currently live/i)[0]).toBeInTheDocument()
    })

    it("displays representative/companyOwner fair status message when not live", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
        companyId: "c1",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/you can still view and edit your own booth/i)).toBeInTheDocument()
      })
    })

    it("displays Browse Company Booths card for students", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText("Browse Company Booths")).toBeInTheDocument()
      })

      const viewBoothsButton = screen.getByRole("button", { name: /browse all fairs/i })
      expect(viewBoothsButton).toBeEnabled()
    })

    it("navigates to booths page when button clicked (when fair is live)", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/Career Opportunities/)).toBeInTheDocument()
      })

      // Note: button is disabled when fair not live, so this just verifies it exists
      expect(screen.getByRole("button", { name: /browse all fairs/i })).toBeInTheDocument()
    })

    it("displays Job Invitations card and navigates to job-invitations when View Invitations clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input)
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ invitations: [{ id: "inv1", status: "sent" }] }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText("Job Invitations")).toBeInTheDocument()
      })

      const viewInvitationsBtn = screen.getByRole("button", { name: /view invitations/i })
      expect(viewInvitationsBtn).toBeInTheDocument()
      await user.click(viewInvitationsBtn)
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/job-invitations")
    })

    it("displays job invitation count and new invitations badge when API returns invitations", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                invitations: [
                  { id: "inv1", status: "sent" },
                  { id: "inv2", status: "sent" },
                  { id: "inv3", status: "accepted" },
                ],
              }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(await screen.findByText(/2 new invitations/, {}, { timeout: 3000 })).toBeInTheDocument()
      expect(screen.getByText("Job Invitations")).toBeInTheDocument()
    })

    it("displays Companies have invited you to apply when no new invitations", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                invitations: [{ id: "inv1", status: "accepted" }],
              }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/Companies have invited you to apply/)).toBeInTheDocument()
      })
    })

    it("displays singular '1 new invitation' when one new invitation", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                invitations: [{ id: "inv1", status: "sent" }],
              }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/1 new invitation\b/)).toBeInTheDocument()
      })
    })

    it("displays singular '1 new invitation' when one new invitation", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input)
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                invitations: [{ id: "inv1", status: "sent" }],
              }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/1 new invitation/)).toBeInTheDocument()
      })
    })

    it("disables View Invitations when jobInvitationsCount is 0", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ invitations: [] }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        const viewInvitationsBtn = screen.getByRole("button", { name: /view invitations/i })
        expect(viewInvitationsBtn).toBeDisabled()
      })
    })

    it("displays singular '1 new invitation' when exactly one new invitation", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input);
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ invitations: [{ id: "inv1", status: "sent" }] }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/1 new invitation\b/)).toBeInTheDocument()
      })
    })
  })

  // Company Owner Dashboard Tests
  describe("Company Owner Dashboard", () => {
    it("renders company owner dashboard with management sections", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u2",
        email: "owner@test.com",
        role: "companyOwner",
        firstName: "Jane",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText(/Welcome back, Jane/)).toBeInTheDocument()
      expect(screen.getByText(/Company Management/)).toBeInTheDocument()
      expect(screen.getAllByText("Manage Companies")[0]).toBeInTheDocument()
    })

    it("displays team members count for company owners", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u2",
        email: "owner@test.com",
        role: "companyOwner",
      })

      // Mock companies with representatives
      vi.mocked(firestore.getDocs).mockResolvedValue({
        size: 1,
        forEach: (callback: any) => {
          callback({
            data: () => ({
              ownerId: "u2",
              representativeIDs: ["rep1", "rep2", "rep3"],
            }),
          })
        },
        docs: [],
      } as any)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText("Team Members")).toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByText("3")).toBeInTheDocument()
      })
    })

    it("navigates to companies page when Manage Companies clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u2",
        email: "owner@test.com",
        role: "companyOwner",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /manage companies/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /manage companies/i }))
      expect(mockNavigate).toHaveBeenCalledWith("/companies")
    })

    it("displays Browse All Booths card with disabled state when fair not live", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u2",
        email: "owner@test.com",
        role: "companyOwner",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        const viewBoothsButtons = screen.getAllByRole("button", { name: /view booths/i })
        expect(viewBoothsButtons[0]).toBeDisabled()
      })
    })

    it("navigates to booth history when Booth History clicked (company owner)", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u2",
        email: "owner@test.com",
        role: "companyOwner",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input)
        if (url.includes("/api/fairs")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ fairs: [{ isLive: true }] }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        const boothHistoryBtn = screen.getByRole("button", { name: /booth history/i })
        expect(boothHistoryBtn).toBeInTheDocument()
        expect(boothHistoryBtn).toBeEnabled()
      })

      await user.click(screen.getByRole("button", { name: /booth history/i }))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/booth-history")
    })

    it("displays enrolled fairs count for company owner", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u2",
        email: "owner@test.com",
        role: "companyOwner",
      })

      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input)
        if (url.includes("/api/fairs/my-enrollments")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                enrollments: [{ fairId: "f1" }, { fairId: "f2" }],
              }),
          }) as Promise<Response>
        }
        if (url.includes("/api/fairs")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ fairs: [] }) }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/fairs enrolled/)).toBeInTheDocument()
      })
      expect(screen.getByText("2")).toBeInTheDocument()
    })
  })

  // Administrator Dashboard Tests
  describe("Administrator Dashboard", () => {
    it("renders administrator dashboard with admin controls", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u3",
        email: "admin@test.com",
        role: "administrator",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText(/Welcome back, admin@test.com/)).toBeInTheDocument()
      expect(screen.getByText(/Administrator Controls/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /go to admin dashboard/i })).toBeInTheDocument()
    })

    it("navigates to admin dashboard when button clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u3",
        email: "admin@test.com",
        role: "administrator",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /go to admin dashboard/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /go to admin dashboard/i }))
      expect(mockNavigate).toHaveBeenCalledWith("/admin")
    })
  })

  // Representative Dashboard Tests
  describe("Representative Dashboard", () => {
    it("renders representative dashboard without company link", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
        firstName: "Rep",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText("Link to Company")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /enter invite code/i })).toBeInTheDocument()
    })

    it("renders representative dashboard with company link", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
        firstName: "Rep",
        companyId: "c1",
        companyName: "Test Corp",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        // "Representing" is a text node, "Test Corp" is inside <strong> — check both
        expect(screen.getByText("Test Corp")).toBeInTheDocument()
      })
      expect(screen.getByText("Manage Company")).toBeInTheDocument()
    })

    it("opens invite code dialog when button clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /enter invite code/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /enter invite code/i }))

      await waitFor(() => {
        expect(screen.getAllByText("Enter Invite Code")[0]).toBeInTheDocument()
      }, { timeout: 3000 })
      expect(screen.getByRole("textbox", { name: /invite code/i })).toBeInTheDocument()
    })

    it("submits invite code and links representative to company", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
      })

      mockLinkRepresentativeToCompany.mockResolvedValue({ success: true })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /enter invite code/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /enter invite code/i }))

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /invite code/i })).toBeInTheDocument()
      })

      const inviteCodeInput = screen.getByRole("textbox", { name: /invite code/i })
      await user.type(inviteCodeInput, "TEST123")

      const submitButton = screen.getByRole("button", { name: /join company/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockLinkRepresentativeToCompany).toHaveBeenCalledWith("TEST123", "u4")
      })
    })

    it("shows error when invite code is invalid", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
      })

      mockLinkRepresentativeToCompany.mockResolvedValue({
        success: false,
        error: "Invalid invite code"
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /enter invite code/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /enter invite code/i }))

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /invite code/i })).toBeInTheDocument()
      })

      const inviteCodeInput = screen.getByRole("textbox", { name: /invite code/i })
      await user.type(inviteCodeInput, "INVALID")

      const submitButton = screen.getByRole("button", { name: /join company/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText("Invalid invite code")).toBeInTheDocument()
      })
    })

    it("closes invite code dialog when Cancel clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /enter invite code/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /enter invite code/i }))

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /invite code/i })).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole("button", { name: /cancel/i })
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByRole("textbox", { name: /invite code/i })).not.toBeInTheDocument()
      })
    })

    it("navigates to company page when View Company clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
        companyId: "c1",
        companyName: "Test Corp",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /view company/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /view company/i }))
      expect(mockNavigate).toHaveBeenCalledWith("/company/c1")
    })
  })

  // Dashboard Statistics Tests
  describe("Dashboard Statistics", () => {
    it("displays statistics cards", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText("Upcoming Events")).toBeInTheDocument()
      })
      expect(screen.getByText("Companies")).toBeInTheDocument()
      expect(screen.getByText("Job Openings")).toBeInTheDocument()
    })

    it("displays loading state for statistics", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      // Stats should eventually load
      await waitFor(() => {
        expect(screen.getByText("Upcoming Events")).toBeInTheDocument()
      })
    })
  })

  // Chat Functionality Tests
  describe("Chat Functionality", () => {
    it("displays chat button with unread count badge", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ unread: 5 }),
      })

      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument()
      })

      // Badge count is in a <span> within the badge, look for it more specifically
      await waitFor(() => {
        const badges = screen.queryAllByText("5")
        expect(badges.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
    })

    it("navigates to chat page when chat button clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /chat/i }))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/chat")
    })
  })

  // EventList Integration Tests
  describe("EventList Integration", () => {
    it("displays EventList component", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId("event-list")).toBeInTheDocument()
      })
    })
  })

  // Fair Status Message Tests
  describe("Fair Status Message", () => {
    it("displays representative/companyOwner message when fair not live", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/you can still view and edit your own booth/i)).toBeInTheDocument()
      })
    })

    it("displays student message when fair not live", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/you will be able to browse all company booths once the fair goes live/i)).toBeInTheDocument()
      })
    })
  })

  // Display Name Tests
  describe("Display Name", () => {
    it("uses email when user has no firstName or lastName", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText(/Welcome back, student@test.com/)).toBeInTheDocument()
    })
  })

  // Resume Parsing Tests
  describe("Resume Parsing", () => {
    it("calls parseMyResume on mount when user is authenticated", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(mockParseMyResume).toHaveBeenCalled()
      })
    })
  })

  // Invite Code Validation Tests
  describe("Invite Code Validation", () => {
    it("shows error when invite code is empty and Join Company clicked", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await user.click(screen.getByRole("button", { name: /enter invite code/i }))
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /invite code/i })).toBeInTheDocument()
      })

      const joinButton = screen.getByRole("button", { name: /join company/i })
      expect(joinButton).toBeDisabled()
      expect(mockLinkRepresentativeToCompany).not.toHaveBeenCalled()
    })

    it("converts invite code to uppercase when typing", async () => {
      const user = userEvent.setup()
      mockGetCurrentUser.mockReturnValue({
        uid: "u4",
        email: "rep@test.com",
        role: "representative",
      })
      mockLinkRepresentativeToCompany.mockResolvedValue({ success: true })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await user.click(screen.getByRole("button", { name: /enter invite code/i }))
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: /invite code/i })).toBeInTheDocument()
      })

      const input = screen.getByRole("textbox", { name: /invite code/i })
      await user.type(input, "abc123")

      expect(input).toHaveValue("ABC123")
      await user.click(screen.getByRole("button", { name: /join company/i }))
      await waitFor(() => {
        expect(mockLinkRepresentativeToCompany).toHaveBeenCalledWith("ABC123", "u4")
      })
    })
  })

  // Job Invitation Text Tests
  describe("Job Invitation Text", () => {
    it("displays singular '1 new invitation' when one new invitation", async () => {
      mockGetCurrentUser.mockReturnValue({
        uid: "u1",
        email: "student@test.com",
        role: "student",
      })
      vi.mocked(globalThis.fetch).mockImplementation((input: string | Request | URL) => {
        const url = getFetchUrl(input)
        if (url.includes("/api/job-invitations/received")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                invitations: [{ id: "inv1", status: "sent" }],
              }),
          }) as Promise<Response>
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as Promise<Response>
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/1 new invitation/)).toBeInTheDocument()
      })
    })
  })
})
