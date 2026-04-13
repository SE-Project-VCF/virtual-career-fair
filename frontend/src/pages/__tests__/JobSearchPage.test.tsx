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

  it("redirects to login when not authenticated", () => {
    vi.mocked(authUtils.isAuthenticated).mockReturnValue(false)
    renderPage()
    expect(mockNavigate).toHaveBeenCalledWith("/login")
  })

  it("shows API error when search returns not ok", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server busy" }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Server busy")).toBeInTheDocument()
    })
  })

  it("shows generic error when fetch throws", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("network down")).toBeInTheDocument()
    })
  })

  it("includes skill and location query params when searching", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => defaultListResponse,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/^skill/i), "Python")
    await user.type(screen.getByLabelText(/^location/i), "remote")
    await user.click(screen.getByRole("button", { name: /^search$/i }))

    await waitFor(() => {
      const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
      const withFilters = urls.find((u) => u.includes("skill=Python") && u.includes("location=remote"))
      expect(withFilters).toBeDefined()
    })
  })

  it("renders Apply link when applicationLink is present", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => defaultListResponse,
    })

    renderPage()

    const apply = await screen.findByRole("link", { name: /apply/i })
    expect(apply).toHaveAttribute("href", "https://example.com/apply")
  })

  it("does not render Apply when applicationLink is null", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...defaultListResponse,
        jobs: [{ ...defaultListResponse.jobs[0], applicationLink: null }],
      }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })

    expect(screen.queryByRole("link", { name: /apply/i })).not.toBeInTheDocument()
  })

  it("truncates long descriptions", async () => {
    const longDesc = "x".repeat(300)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...defaultListResponse,
        jobs: [{ ...defaultListResponse.jobs[0], description: longDesc }],
      }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/^x{280}…$/)).toBeInTheDocument()
    })
  })

  it("shows empty state when no jobs and no filters", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [], total: 0, page: 1, pageSize: 20 }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/no job postings are available yet/i)).toBeInTheDocument()
    })
  })

  it("shows result range and singular job label when total is 1", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ...defaultListResponse, total: 1 }),
    })

    renderPage()

    await waitFor(() => {
      const summary = screen.getByText(/^Showing\b/)
      expect(summary.textContent).toMatch(/of 1 job\b/)
      expect(summary.textContent).not.toMatch(/of 1 jobs/)
    })
  })

  it("shows filtered label when keyword is used", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ...defaultListResponse, total: 1 }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/keyword/i), "x")
    await user.click(screen.getByRole("button", { name: /search/i }))

    await waitFor(() => {
      expect(screen.getByText(/\(filtered\)/)).toBeInTheDocument()
    })
  })

  it("changes page when pagination is used", async () => {
    const user = userEvent.setup()
    const page1Job = { ...defaultListResponse.jobs[0], id: "j-page1", name: "Job Page 1" }
    const page2Job = { ...defaultListResponse.jobs[0], id: "j-page2", name: "Job Page 2" }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobs: [page1Job],
        total: 25,
        page: 1,
        pageSize: 20,
      }),
    })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [page2Job],
        total: 25,
        page: 2,
        pageSize: 20,
      }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Job Page 1")).toBeInTheDocument()
    })

    const next = await screen.findByRole("button", { name: /go to next page/i })
    await user.click(next)

    await waitFor(() => {
      const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
      expect(urls.some((u) => u.includes("page=2"))).toBe(true)
    })

    await waitFor(() => {
      expect(screen.getByText("Job Page 2")).toBeInTheDocument()
    })
  })

  it("displays formatted location from API fields", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...defaultListResponse,
        jobs: [
          {
            ...defaultListResponse.jobs[0],
            locationIsRemote: false,
            locationCity: "Denver",
            locationState: "CO",
            applicationLink: null,
          },
        ],
      }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
    })

    const locationLine = screen.getByText("Denver, CO")
    expect(locationLine.closest("p")?.textContent).toContain("Location:")
    expect(locationLine.closest("p")?.textContent).toContain("Denver, CO")
  })
})
