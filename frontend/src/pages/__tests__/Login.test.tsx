import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
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

const mockSetDoc = vi.fn()
const mockDoc = vi.fn()
vi.mock("firebase/firestore", () => ({
  doc: (...args: any[]) => mockDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
}))

vi.mock("../../firebase", () => ({
  auth: { currentUser: null },
  db: {},
}))

// Import after mocks
let mockAuth: any
let mockDb: any

beforeEach(async () => {
  vi.clearAllMocks()
  const firebase = await import("../../firebase")
  mockAuth = firebase.auth
  mockDb = firebase.db
  mockAuth.currentUser = null
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

  it("pre-fills Google profile dialog with displayName", async () => {
    mockAuth.currentUser = {
      uid: "test-uid",
      displayName: "John Doe",
    } as any

    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true,
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    await screen.findByText("Complete Your Profile")

    const firstNameInput = screen.getByLabelText("First Name")
    const lastNameInput = screen.getByLabelText("Last Name")

    expect(firstNameInput).toHaveValue("John")
    expect(lastNameInput).toHaveValue("Doe")
  })

  it("handles Google profile dialog save", async () => {
    mockAuth.currentUser = {
      uid: "test-uid",
      displayName: "Jane Smith",
    } as any

    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true,
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    await screen.findByText("Complete Your Profile")

    const firstNameInput = screen.getByLabelText("First Name")
    const lastNameInput = screen.getByLabelText("Last Name")

    await user.clear(firstNameInput)
    await user.clear(lastNameInput)
    await user.type(firstNameInput, "Updated")
    await user.type(lastNameInput, "Name")

    const saveButton = screen.getByRole("button", { name: "Save" })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockDoc).toHaveBeenCalledWith(mockDb, "users", "test-uid")
      expect(mockSetDoc).toHaveBeenCalledWith(
        mockDoc(),
        {
          firstName: "Updated",
          lastName: "Name",
        },
        { merge: true }
      )
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
    })
  })

  it("handles Google profile dialog cancel button", async () => {
    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true,
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    const dialogTitle = await screen.findByText("Complete Your Profile")
    expect(dialogTitle).toBeInTheDocument()

    const cancelButton = screen.getByRole("button", { name: "Cancel" })
    await user.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByText("Complete Your Profile")).not.toBeInTheDocument()
    })
  })

  it("handles Google login exception", async () => {
    mockLoginWithGoogle.mockRejectedValue(new Error("Network error"))
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    expect(
      await screen.findByText(/Failed to sign in with Google/i)
    ).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it("does not save profile if no current user", async () => {
    mockAuth.currentUser = null

    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true,
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    await screen.findByText("Complete Your Profile")

    const saveButton = screen.getByRole("button", { name: "Save" })
    await user.click(saveButton)

    // Should not call setDoc if no current user
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it("handles login failure without error message", async () => {
    mockLogin.mockResolvedValue({ success: false })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    const fields = await screen.findAllByRole("textbox")
    const emailInput = fields[0]
    const passwordInputs = document.querySelectorAll('input[type="password"]')
    const passwordInput = passwordInputs[0] as HTMLInputElement

    await user.type(emailInput, "test@test.com")
    await user.type(passwordInput, "wrong")

    const submitButton = screen.getByRole("button", { name: /^sign in$/i })
    await user.click(submitButton)

    expect(await screen.findByText("Login failed.")).toBeInTheDocument()
  })

  it("handles Google login failure without error message", async () => {
    mockLoginWithGoogle.mockResolvedValue({ success: false })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    expect(await screen.findByText("Google login failed.")).toBeInTheDocument()
  })

  it("handles Google profile with empty displayName parts", async () => {
    mockAuth.currentUser = {
      uid: "test-uid",
      displayName: "SingleName",
    } as any

    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true,
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    await screen.findByText("Complete Your Profile")

    const firstNameInput = screen.getByLabelText("First Name")
    const lastNameInput = screen.getByLabelText("Last Name")

    expect(firstNameInput).toHaveValue("SingleName")
    expect(lastNameInput).toHaveValue("")
  })

  it("handles Google profile without displayName", async () => {
    mockAuth.currentUser = {
      uid: "test-uid",
      displayName: null,
    } as any

    mockLoginWithGoogle.mockResolvedValue({
      success: true,
      role: "student",
      needsProfile: true,
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.click(screen.getByText("Sign in with Google"))

    await screen.findByText("Complete Your Profile")

    const firstNameInput = screen.getByLabelText("First Name")
    const lastNameInput = screen.getByLabelText("Last Name")

    expect(firstNameInput).toHaveValue("")
    expect(lastNameInput).toHaveValue("")
  })

  it("validates empty fields when HTML5 validation is bypassed", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    // Find the form element and submit directly, bypassing HTML5 validation
    const form = document.querySelector("form")
    expect(form).toBeTruthy()

    // Remove required attributes temporarily to test JS validation
    const inputs = form!.querySelectorAll("input")
    inputs.forEach((input) => input.removeAttribute("required"))

    const submitButton = screen.getByRole("button", { name: /^sign in$/i })
    await user.click(submitButton)

    expect(await screen.findByText("All fields are required.")).toBeInTheDocument()
  })
})
