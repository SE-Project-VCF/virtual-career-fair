import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import JobSearchPage from "../JobSearchPage"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    isAuthenticated: vi.fn(),
  },
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="base-layout">
      {pageTitle && <span>{pageTitle}</span>}
      {children}
    </div>
  ),
}))

import { authUtils } from "../../utils/auth"

const defaultListResponse = {
  success: true,
  jobs: [
    {
      id: "j1",
      companyId: "c1",
      companyName: "Acme",
      name: "Software Engineer",
      description: "Build things with Python",
      majorsAssociated: "Python",
      applicationLink: "https://example.com/apply",
      locationIsRemote: true,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

const renderPage = () =>
  render(
    <BrowserRouter>
      <JobSearchPage />
    </BrowserRouter>
  )

describe("JobSearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
    globalThis.fetch = vi.fn()
  })

  it("loads jobs on mount with pagination params", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => defaultListResponse,
    })

    renderPage()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    const firstUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(firstUrl).toContain("/api/jobs/search")
    expect(firstUrl).toContain("page=1")
    expect(firstUrl).toContain("limit=20")

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })
    expect(screen.getByText("Acme")).toBeInTheDocument()
  })

  it("runs search and displays filtered job results", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => defaultListResponse,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/keyword/i), "Software")
    await user.click(screen.getByRole("button", { name: /search/i }))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const filtered = calls.map((c) => c[0] as string).find((u) => u.includes("q=Software"))
      expect(filtered).toBeDefined()
    })

    expect(screen.getByText("Software Engineer")).toBeInTheDocument()
  })

  it("shows no matches when filters exclude all jobs", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => defaultListResponse,
    })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, jobs: [], total: 0, page: 1, pageSize: 20 }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/keyword/i), "NonexistentXYZ")
    await user.click(screen.getByRole("button", { name: /search/i }))

    await waitFor(() => {
      expect(screen.getByText(/no jobs matched your filters/i)).toBeInTheDocument()
    })
  })
})
