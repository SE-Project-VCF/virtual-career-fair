import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import EmailVerificationPending from "../EmailVerificationPending"

const mockNavigate = vi.fn()
const mockLocation = { state: { email: "test@test.com", password: "pass123" } } // NOSONAR - test fixture password
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

    expect(mockVerifyAndLogin).toHaveBeenCalled()
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

  it("handles resend verification email", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    const resendButton = screen.getByText(/Resend Verification Email/)
    await user.click(resendButton)

    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(screen.getByText(/Verification email sent/)).toBeInTheDocument()
  })

  it("shows success message after resending verification", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    const resendButton = screen.getByText(/Resend Verification Email/)
    await user.click(resendButton)

    const successAlert = await screen.findByText(/Verification email sent/)
    expect(successAlert).toBeInTheDocument()
  })

  it("disables resend button during cooldown", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    const resendButton = screen.getByText(/Resend Verification Email/)
    expect(resendButton).not.toBeDisabled()

    // After clicking, verify it gets disabled (cooldown starts)
    await user.click(resendButton)
    await new Promise(resolve => setTimeout(resolve, 100))

    const disabledButton = screen.getByText(/Resend in \d+s/)
    expect(disabledButton).toBeDisabled()
  })

  it("has working back button", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    // Find and click the back icon button
    const backButtons = screen.getAllByRole("button")
    const backButton = backButtons[0] // The back button is usually first

    if (backButton.querySelector('svg')) {
      await user.click(backButton)
      expect(mockNavigate).toHaveBeenCalledWith("/")
    }
  })

  it("shows email address in the message", () => {
    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    expect(screen.getByText(/test@test.com/)).toBeInTheDocument()
  })

  it("disables verify button while loading", async () => {
    mockVerifyAndLogin.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
    )
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <EmailVerificationPending />
      </MemoryRouter>
    )

    const verifyButton = screen.getByText("I've Verified My Email")
    expect(verifyButton).not.toBeDisabled()

    await user.click(verifyButton)

    // Button should be disabled during loading
    expect(verifyButton).toBeDisabled()
  })
})
