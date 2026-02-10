import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import EmailVerificationPending from "../EmailVerificationPending"

const mockNavigate = vi.fn()
const mockLocation = { state: { email: "test@test.com", password: "pass123" } }
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

const mockVerifyAndLogin = vi.fn()
vi.mock("../../utils/auth", () => ({
  authUtils: {
    verifyAndLogin: (...args: any[]) => mockVerifyAndLogin(...args),
  },
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: { email: "test@test.com" },
  },
}))

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual("firebase/auth")
  return {
    ...actual,
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("EmailVerificationPending", () => {
  it("renders verification pending page", () => {
    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    expect(screen.getByText("Check Your Email")).toBeInTheDocument()
    expect(screen.getByText(/test@test.com/)).toBeInTheDocument()
    expect(screen.getByText("I've Verified My Email")).toBeInTheDocument()
  })

  it("navigates to dashboard on successful verification", async () => {
    mockVerifyAndLogin.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    await user.click(screen.getByText("I've Verified My Email"))

    expect(mockVerifyAndLogin).toHaveBeenCalledWith("test@test.com", "pass123")
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("shows error on failed verification", async () => {
    mockVerifyAndLogin.mockResolvedValue({ success: false, error: "Email not yet verified." })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    await user.click(screen.getByText("I've Verified My Email"))

    expect(await screen.findByText("Email not yet verified.")).toBeInTheDocument()
  })
})
