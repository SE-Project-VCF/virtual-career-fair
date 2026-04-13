import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import ProfilePage from "../ProfilePage"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../StudentProfilePage", () => ({
  default: () => <div data-testid="student-profile-page">Student profile content</div>,
}))

vi.mock("../EmployerProfilePage", () => ({
  default: () => <div data-testid="employer-profile-page">Employer profile content</div>,
}))

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}))

import { authUtils } from "../../utils/auth"

const renderProfile = () =>
  render(
    <BrowserRouter>
      <ProfilePage />
    </BrowserRouter>
  )

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it("redirects to login when not authenticated", async () => {
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(false)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(null)

    const { container } = renderProfile()

    expect(container.firstChild).toBeNull()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })
  })

  it("renders nothing when authenticated but user is missing", () => {
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(null)

    const { container } = renderProfile()

    expect(container.firstChild).toBeNull()
  })

  it("renders StudentProfilePage for students", async () => {
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      role: "student",
      email: "s@school.edu",
      firstName: "S",
      lastName: "T",
    } as any)

    renderProfile()

    expect(await screen.findByTestId("student-profile-page")).toBeInTheDocument()
    expect(screen.queryByTestId("employer-profile-page")).not.toBeInTheDocument()
  })

  it("renders EmployerProfilePage for company owners", async () => {
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u2",
      role: "companyOwner",
      email: "o@co.com",
      firstName: "O",
      lastName: "W",
    } as any)

    renderProfile()

    expect(await screen.findByTestId("employer-profile-page")).toBeInTheDocument()
    expect(screen.queryByTestId("student-profile-page")).not.toBeInTheDocument()
  })

  it("renders EmployerProfilePage for representatives", async () => {
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u3",
      role: "representative",
      email: "r@co.com",
      companyId: "c1",
      firstName: "R",
      lastName: "E",
    } as any)

    renderProfile()

    expect(await screen.findByTestId("employer-profile-page")).toBeInTheDocument()
  })

  it("renders EmployerProfilePage for administrators", async () => {
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u4",
      role: "administrator",
      email: "admin@site.com",
      firstName: "A",
      lastName: "D",
    } as any)

    renderProfile()

    expect(await screen.findByTestId("employer-profile-page")).toBeInTheDocument()
  })
})
