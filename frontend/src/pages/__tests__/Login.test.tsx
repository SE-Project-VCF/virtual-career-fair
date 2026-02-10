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
  it("renders sign in form", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    expect(screen.getByText("Sign In")).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument()
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument()
  })

  it("shows error when fields are empty", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    // Click the Sign In button (submit)
    const signInButtons = screen.getAllByText("Sign In")
    const submitButton = signInButtons.find(
      (el) => el.closest("button")?.getAttribute("type") === "submit"
    )
    if (submitButton) await user.click(submitButton)

    expect(screen.getByText("All fields are required.")).toBeInTheDocument()
  })

  it("logs in successfully and navigates to dashboard", async () => {
    mockLogin.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/Email/i), "test@test.com")
    await user.type(screen.getByLabelText(/Password/i), "password123")

    const signInButtons = screen.getAllByText("Sign In")
    const submitButton = signInButtons.find(
      (el) => el.closest("button")?.getAttribute("type") === "submit"
    )
    if (submitButton) await user.click(submitButton)

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

    await user.type(screen.getByLabelText(/Email/i), "test@test.com")
    await user.type(screen.getByLabelText(/Password/i), "wrong")

    const signInButtons = screen.getAllByText("Sign In")
    const submitButton = signInButtons.find(
      (el) => el.closest("button")?.getAttribute("type") === "submit"
    )
    if (submitButton) await user.click(submitButton)

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

    await user.type(screen.getByLabelText(/Email/i), "test@test.com")
    await user.type(screen.getByLabelText(/Password/i), "pass")

    const signInButtons = screen.getAllByText("Sign In")
    const submitButton = signInButtons.find(
      (el) => el.closest("button")?.getAttribute("type") === "submit"
    )
    if (submitButton) await user.click(submitButton)

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
})
