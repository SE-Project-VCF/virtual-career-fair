import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import Dashboard from "../Dashboard"
import { getDocs } from "firebase/firestore"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockGetCurrentUser = vi.fn()
const mockIsAuthenticated = vi.fn()
const mockLinkRepresentativeToCompany = vi.fn()
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

// Mock fetch for unread count and other API calls
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ unread: 0 }),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  // Mock getDocs for stats
  vi.mocked(getDocs).mockResolvedValue({ size: 5, forEach: vi.fn(), docs: [] } as any)
})

describe("Dashboard", () => {
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

  it("renders student dashboard", async () => {
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
    expect(screen.getByText("Chat")).toBeInTheDocument()
  })

  it("renders company owner dashboard", async () => {
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
    const manageCompaniesElements = screen.getAllByText("Manage Companies")
    expect(manageCompaniesElements.length).toBeGreaterThan(0)
  })

  it("renders administrator dashboard", async () => {
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
    expect(screen.getByText("Go to Admin Dashboard")).toBeInTheDocument()
  })

  it("renders representative dashboard without company", async () => {
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
    expect(screen.getByText("Enter Invite Code")).toBeInTheDocument()
  })

  it("renders representative dashboard with company", async () => {
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

  it("shows fair not live alert", async () => {
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
      expect(screen.getByText("Career Fair is Not Currently Live")).toBeInTheDocument()
    })
  })
})
