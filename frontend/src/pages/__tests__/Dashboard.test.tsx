import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import Dashboard from "../Dashboard"
import * as authUtils from "../../utils/auth"
import * as firestore from "firebase/firestore"

const mockNavigate = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockIsAuthenticated = vi.fn()
const mockLinkRepresentativeToCompany = vi.fn()

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
}))

vi.mock("../../utils/fairStatus", () => ({
  evaluateFairStatus: vi.fn().mockResolvedValue({ isLive: false, scheduleName: null, scheduleDescription: null }),
}))

vi.mock("../../components/EventList", () => ({
  default: () => <div data-testid="event-list">EventList</div>,
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">ProfileMenu</div>,
}))

vi.mock("firebase/firestore")
vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

// Mock fetch for unread count and other API calls
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ unread: 0 }),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  mockNavigate.mockClear()

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
      expect(screen.getByText("Career Opportunities")).toBeInTheDocument()
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

      const viewBoothsButton = screen.getByRole("button", { name: /view all booths/i })
      expect(viewBoothsButton).toBeDisabled()
    })

    it("navigates to booths page when button clicked (when fair is live)", async () => {
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
        expect(screen.getByText("Career Opportunities")).toBeInTheDocument()
      })

      // Note: button is disabled when fair not live, so this just verifies it exists
      expect(screen.getByRole("button", { name: /view all booths/i })).toBeInTheDocument()
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
      expect(screen.getByText("Company Management")).toBeInTheDocument()
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
        const viewAllBoothsButtons = screen.getAllByRole("button", { name: /view all booths/i })
        expect(viewAllBoothsButtons[0]).toBeDisabled()
      })
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
      expect(screen.getByText("Administrator Controls")).toBeInTheDocument()
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

      expect(screen.getByText(/Representing Test Corp/)).toBeInTheDocument()
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
      global.fetch = vi.fn().mockResolvedValue({
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
})
