import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import EmployerProfilePage from "../EmployerProfilePage"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="base-layout">
      {pageTitle ? <span>{pageTitle}</span> : null}
      {children}
    </div>
  ),
}))

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((...args: unknown[]) => ({ path: args.join("/") })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock("../../firebase", () => ({
  db: {},
}))

import { authUtils } from "../../utils/auth"
import * as firestore from "firebase/firestore"

const ownerUser = {
  uid: "emp-1",
  role: "companyOwner" as const,
  email: "owner@company.com",
  firstName: "Olivia",
  lastName: "Owner",
  companyId: "company-99",
}

function setupAuth(user: typeof ownerUser | null, authenticated: boolean) {
  vi.mocked(authUtils.getCurrentUser).mockReturnValue(user as any)
  vi.mocked(authUtils.isAuthenticated).mockReturnValue(authenticated)
}

const renderEmployer = () =>
  render(
    <BrowserRouter>
      <EmployerProfilePage />
    </BrowserRouter>
  )

describe("EmployerProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => false,
    } as any)
    vi.mocked(firestore.setDoc).mockResolvedValue(undefined)
  })

  it("redirects to login when not authenticated", () => {
    setupAuth(ownerUser, false)
    renderEmployer()
    expect(mockNavigate).toHaveBeenCalledWith("/login")
  })

  it("renders nothing when user is null", () => {
    setupAuth(null, true)
    const { container } = renderEmployer()
    expect(container.firstChild).toBeNull()
  })

  it("shows loading then form after Firestore loads", async () => {
    setupAuth(ownerUser, true)
    let resolveLoad: (v: unknown) => void
    const loadPromise = new Promise((resolve) => {
      resolveLoad = resolve
    })
    vi.mocked(firestore.getDoc).mockImplementation(() => loadPromise as any)

    renderEmployer()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()

    resolveLoad!({
      exists: () => true,
      data: () => ({
        firstName: "Pat",
        lastName: "Lee",
        jobTitle: "Recruiter",
        linkedinUrl: "https://www.linkedin.com/in/pat",
      }),
    })

    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    })

    expect(screen.getByLabelText(/First name/i)).toHaveValue("Pat")
    expect(screen.getByLabelText(/Last name/i)).toHaveValue("Lee")
    expect(screen.getByLabelText(/Job title/i)).toHaveValue("Recruiter")
    expect(screen.getByLabelText(/LinkedIn URL/i)).toHaveValue("https://www.linkedin.com/in/pat")
  })

  it("shows load error when getDoc throws", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockRejectedValue(new Error("network"))

    renderEmployer()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load profile/i)).toBeInTheDocument()
    })
  })

  it("shows company owner copy and company navigation when companyId is set", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ firstName: "A", lastName: "B" }),
    } as any)

    renderEmployer()

    await waitFor(() => {
      expect(screen.getByText(/Company owner/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Go to company & booth/i }),
      ).toBeInTheDocument()
    })
    const goCompany = screen.getByRole("button", { name: /Go to company & booth/i })
    await userEvent.click(goCompany)
    expect(mockNavigate).toHaveBeenCalledWith("/company/company-99")
  })

  it("does not show company button without companyId", async () => {
    setupAuth({ ...ownerUser, companyId: undefined } as any, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({}),
    } as any)

    renderEmployer()

    await waitFor(() => {
      expect(screen.getByLabelText(/First name/i)).toBeInTheDocument()
    })

    expect(
      screen.queryByRole("button", { name: /Go to company & booth/i }),
    ).not.toBeInTheDocument()
  })

  it("shows representative role label for representatives", async () => {
    setupAuth(
      {
        uid: "r1",
        role: "representative",
        email: "rep@co.com",
        firstName: "R",
        lastName: "E",
        companyId: "c1",
      } as any,
      true
    )
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)

    renderEmployer()

    await waitFor(() => {
      expect(screen.getByText(/Company representative/i)).toBeInTheDocument()
    })
  })

  it("shows administrator label for administrators", async () => {
    setupAuth(
      {
        uid: "a1",
        role: "administrator",
        email: "admin@site.com",
        firstName: "A",
        lastName: "D",
      } as any,
      true
    )
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)

    renderEmployer()

    await waitFor(() => {
      expect(screen.getByText(/Administrator/i)).toBeInTheDocument()
    })
  })

  it("shows generic Employer label for other roles", async () => {
    setupAuth(
      {
        uid: "x1",
        role: "company",
        email: "legacy@co.com",
        firstName: "L",
        lastName: "E",
      } as any,
      true
    )
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)

    renderEmployer()

    await waitFor(() => {
      expect(screen.getByText(/^Employer\. This information is separate from your company booth and job postings\.$/)).toBeInTheDocument()
    })
  })

  it("shows empty email field when user email is missing", async () => {
    setupAuth({ ...ownerUser, email: undefined } as any, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)

    renderEmployer()

    await waitFor(() => {
      expect(screen.getByLabelText(/Email/i)).toHaveValue("")
    })
  })

  it("navigates back to dashboard", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)

    renderEmployer()

    await screen.findByRole("button", { name: /^Back$/i })
    await userEvent.click(screen.getByRole("button", { name: /^Back$/i }))
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("saves profile and calls setDoc with merged fields", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ firstName: "", lastName: "" }),
    } as any)

    const user = userEvent.setup()
    renderEmployer()

    await screen.findByLabelText(/First name/i)
    await user.type(screen.getByLabelText(/First name/i), "Sam")
    await user.type(screen.getByLabelText(/Last name/i), "Smith")
    await user.type(screen.getByLabelText(/Job title \(optional\)/i), "Campus Recruiter")
    await user.type(screen.getByLabelText(/LinkedIn URL/i), "linkedin.com/in/samsmith")

    await user.click(screen.getByRole("button", { name: /^Save$/i }))

    await waitFor(() => {
      expect(firestore.setDoc).toHaveBeenCalled()
    })

    const call = vi.mocked(firestore.setDoc).mock.calls[0]
    const payload = call[1] as Record<string, unknown>
    expect(payload.firstName).toBe("Sam")
    expect(payload.lastName).toBe("Smith")
    expect(payload.jobTitle).toBe("Campus Recruiter")
    expect(typeof payload.linkedinUrl).toBe("string")
    expect((payload.linkedinUrl as string).includes("linkedin.com")).toBe(true)
  })

  it("saves with empty LinkedIn and sends null linkedinUrl", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        firstName: "A",
        lastName: "B",
        linkedinUrl: "https://www.linkedin.com/in/old",
      }),
    } as any)

    const user = userEvent.setup()
    renderEmployer()

    const li = await screen.findByLabelText(/LinkedIn URL/i)
    await user.clear(li)

    await user.click(screen.getByRole("button", { name: /^Save$/i }))

    await waitFor(() => {
      expect(firestore.setDoc).toHaveBeenCalled()
    })

    const payload = vi.mocked(firestore.setDoc).mock.calls[0][1] as Record<string, unknown>
    expect(payload.linkedinUrl).toBeNull()
  })

  it("shows validation error for invalid LinkedIn URL", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)

    const user = userEvent.setup()
    renderEmployer()

    await screen.findByLabelText(/LinkedIn URL/i)
    await user.type(screen.getByLabelText(/LinkedIn URL/i), "https://example.com/x")

    fireEvent.submit(screen.getByLabelText(/First name/i).closest("form")!)

    await waitFor(() => {
      expect(screen.getByText(/linkedin\.com or lnkd\.in/i)).toBeInTheDocument()
    })

    expect(firestore.setDoc).not.toHaveBeenCalled()
  })

  it("shows error when setDoc fails", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)
    vi.mocked(firestore.setDoc).mockRejectedValue(new Error("permission denied"))

    const user = userEvent.setup()
    renderEmployer()

    await screen.findByLabelText(/First name/i)
    await user.type(screen.getByLabelText(/First name/i), "X")
    await user.type(screen.getByLabelText(/Last name/i), "Y")

    await user.click(screen.getByRole("button", { name: /^Save$/i }))

    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
    })
  })

  it("shows generic save error when setDoc rejects a non-Error", async () => {
    setupAuth(ownerUser, true)
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false } as any)
    vi.mocked(firestore.setDoc).mockRejectedValue("firestore")

    const user = userEvent.setup()
    renderEmployer()

    await screen.findByLabelText(/First name/i)
    await user.type(screen.getByLabelText(/First name/i), "X")
    await user.type(screen.getByLabelText(/Last name/i), "Y")

    await user.click(screen.getByRole("button", { name: /^Save$/i }))

    await waitFor(() => {
      expect(screen.getByText(/^Failed to save\.$/)).toBeInTheDocument()
    })
  })
})
