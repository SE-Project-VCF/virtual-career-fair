import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import FairyJobmotherPage from "../FairyJobmotherPage"
import { authUtils } from "../../utils/auth"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="base-layout">{children}</div>,
}))

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

function renderPage() {
  return render(
    <BrowserRouter>
      <FairyJobmotherPage />
    </BrowserRouter>
  )
}

describe("FairyJobmotherPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it("redirects to home when not signed in", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue(null)

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/")
    })
    expect(screen.queryByRole("heading", { name: /Meet the Fairy Jobmother/i })).not.toBeInTheDocument()
  })

  it("renders main sections for a signed-in user", () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      email: "a@b.c",
      role: "student",
    } as any)

    renderPage()

    expect(screen.getByTestId("base-layout")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Meet the Fairy Jobmother/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /How it works/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Example things to ask/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Tips/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Frequently asked questions/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/in-app guide for Job Goblin/i)).toBeInTheDocument()
    expect(screen.getByText(/vetted navigation/i)).toBeInTheDocument()
  })

  it("shows student-oriented example prompts for students", () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "s1",
      email: "s@school.edu",
      role: "student",
    } as any)

    renderPage()

    expect(screen.getByRole("heading", { name: /Students/i, level: 3 })).toBeInTheDocument()
    expect(screen.getByText("Tailored resumes")).toBeInTheDocument()
    expect(screen.queryByText("Open the admin panel")).not.toBeInTheDocument()
  })

  it("shows administrator example prompts for administrators", () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "adm1",
      email: "admin@org.edu",
      role: "administrator",
    } as any)

    renderPage()

    expect(screen.getByRole("heading", { name: /Administrators/i, level: 3 })).toBeInTheDocument()
    expect(screen.getByText("Open the admin panel")).toBeInTheDocument()
  })

  it("shows representative-only submission prompt for representatives", () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "r1",
      email: "rep@co.com",
      role: "representative",
    } as any)

    renderPage()

    expect(screen.getByText("View submissions for my booth")).toBeInTheDocument()
  })

  it("does not show representative-only submission prompt for company owners", () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "c1",
      email: "owner@co.com",
      role: "companyOwner",
    } as any)

    renderPage()

    expect(screen.queryByText("View submissions for my booth")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Company owners & representatives/i, level: 3 })).toBeInTheDocument()
  })

  it("expands an FAQ panel", async () => {
    const user = (await import("@testing-library/user-event")).default.setup()
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      email: "a@b.c",
      role: "student",
    } as any)

    renderPage()

    await user.click(screen.getByRole("button", { name: /Why didn't I get a link/i }))

    expect(
      screen.getByText(/She only suggests links when your question matches something the app can open/i)
    ).toBeInTheDocument()
  })
})
