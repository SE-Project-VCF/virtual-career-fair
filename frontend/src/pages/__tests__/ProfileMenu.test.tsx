import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import ProfileMenu from "../ProfileMenu"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockLogout = vi.fn()
const mockGetCurrentUser = vi.fn()
vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: () => mockGetCurrentUser(),
    logout: () => mockLogout(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCurrentUser.mockReturnValue({ uid: "u1", email: "test@test.com", role: "student" })
})

describe("ProfileMenu", () => {
  it("renders avatar with first letter of email", () => {
    render(
      <MemoryRouter>
        <ProfileMenu />
      </MemoryRouter>
    )

    expect(screen.getByText("T")).toBeInTheDocument()
  })

  it("opens menu on avatar click", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ProfileMenu />
      </MemoryRouter>
    )

    await user.click(screen.getByText("T"))

    expect(screen.getByText("Edit Profile")).toBeInTheDocument()
    expect(screen.getByText("Logout")).toBeInTheDocument()
  })

  it("navigates to profile on Edit Profile click", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ProfileMenu />
      </MemoryRouter>
    )

    await user.click(screen.getByText("T"))
    await user.click(screen.getByText("Edit Profile"))

    expect(mockNavigate).toHaveBeenCalledWith("/profile")
  })

  it("logs out and navigates to login", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ProfileMenu />
      </MemoryRouter>
    )

    await user.click(screen.getByText("T"))
    await user.click(screen.getByText("Logout"))

    expect(mockLogout).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith("/login")
  })
})
