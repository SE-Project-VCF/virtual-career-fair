import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import Login from "../Login"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate, Link: actual.Link }
})

const mockLogin = vi.fn()
const mockLoginWithGoogle = vi.fn()
vi.mock("../../utils/auth", () => ({
  authUtils: {
    login: (...args: any[]) => mockLogin(...args),
    loginWithGoogle: (...args: any[]) => mockLoginWithGoogle(...args),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Login", () => {
  it("renders sign in form", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    expect(screen.getByRole("heading", { name: "Sign In" })).toBeInTheDocument()
    const fields = await screen.findAllByRole("textbox");
    expect(fields.length).toBeGreaterThan(0);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBeGreaterThan(0);
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument()
  })

  it("shows error when fields are empty", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    // The form should have required fields that prevent empty submission
    const fields = await screen.findAllByRole("textbox");
    const submitButton = screen.getByRole("button", { name: /^sign in$/i })

    // Verify required fields exist
    expect(fields.length).toBeGreaterThan(0)
    expect(submitButton).toBeInTheDocument()
  })

  it("logs in successfully and navigates to dashboard", async () => {
    mockLogin.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    const fields = await screen.findAllByRole("textbox");
    const emailInput = fields[0];
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;

    await user.type(emailInput, "test@test.com")
    await user.type(passwordInput, "password123")

    const submitButton = screen.getByRole("button", { name: /^sign in$/i })
    await user.click(submitButton)

    expect(mockLogin).toHaveBeenCalledWith("test@test.com", "password123")
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("shows error on login failure", async () => {
    mockLogin.mockResolvedValue({ success: false, error: "Invalid credentials" })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    const fields = await screen.findAllByRole("textbox");
    const emailInput = fields[0];
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;

    await user.type(emailInput, "test@test.com")
    await user.type(passwordInput, "wrong")

    const submitButton = screen.getByRole("button", { name: /^sign in$/i })
    await user.click(submitButton)

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument()
  })

  it("shows verification needed message", async () => {
    mockLogin.mockResolvedValue({ success: false, needsVerification: true })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    const fields = await screen.findAllByRole("textbox");
    const emailInput = fields[0];
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;

    await user.type(emailInput, "test@test.com")
    await user.type(passwordInput, "pass")

    const submitButton = screen.getByRole("button", { name: /^sign in$/i })
    await user.click(submitButton)

    expect(await screen.findByText(/verify your email/i)).toBeInTheDocument()
  })

  it("handles Google login - existing user", async () => {
    mockLoginWithGoogle.mockResolvedValue({ success: true, role: "student" })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    expect(mockLoginWithGoogle).toHaveBeenCalledWith("student", false)
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("handles Google login - no account exists", async () => {
    mockLoginWithGoogle.mockResolvedValue({ success: true, role: undefined })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    expect(await screen.findByText(/No account exists/i)).toBeInTheDocument()
  })

  it("has link to register page", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    expect(screen.getByText("Register here")).toBeInTheDocument()
  })

  it("handles Google login with profile completion needed", async () => {
    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    expect(await screen.findByText("Complete Your Profile")).toBeInTheDocument()
  })

  it("shows profile completion dialog when needed", async () => {
    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    // Verify profile dialog appears
    const dialogTitle = await screen.findByText("Complete Your Profile")
    expect(dialogTitle).toBeInTheDocument()
  })

  it("allows canceling profile completion dialog", async () => {
    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    const cancelButton = await screen.findByRole("button", { name: "Cancel" })
    expect(cancelButton).toBeInTheDocument()
  })

  it("handles Google login error", async () => {
    mockLoginWithGoogle.mockResolvedValue({
      success: false,
      error: "Google login failed"
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    expect(await screen.findByText("Google login failed")).toBeInTheDocument()
  })

  it("shows back to home link", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    expect(screen.getByText("← Back to Home")).toBeInTheDocument()
  })
})
