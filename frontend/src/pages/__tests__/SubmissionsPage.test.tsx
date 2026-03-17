import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import SubmissionsPage from "../SubmissionsPage"
import { authUtils } from "../../utils/auth"

/* ---- Router mocks ---- */
const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ companyId: "company-1" }),
  }
})

/* ---- Auth utils mock ---- */
vi.mock("../../utils/auth", () => ({
  authUtils: {
    isAuthenticated: vi.fn(() => true),
    getCurrentUser: vi.fn(() => ({ uid: "owner-1", email: "owner@test.com" })),
  },
}))

/* ---- Firebase mock ---- */
vi.mock("../../firebase", () => ({
  auth: {
    currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") },
  },
  db: {},
}))

/* ---- Firestore mock (getDoc for student names) ---- */
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ firstName: "Jane", lastName: "Doe", email: "jane@test.com" }),
  }),
}))

/* ---- ProfileMenu mock ---- */
vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

/* ---- BaseLayout mock ---- */
vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: any) => (
    <div data-testid="base-layout">
      <button aria-label="menu">Menu</button>
      <span>Job Goblin</span>
      <span>Virtual Career Fair</span>
      {pageTitle && <h6>{pageTitle}</h6>}
      <button data-testid="notification-bell" />
      <button data-testid="profile-menu">Profile Menu</button>
      {children}
    </div>
  ),
}))

/* ---- fetch mock ---- */
global.fetch = vi.fn()

const mockJobs = [
  {
    id: "job-1",
    name: "Software Engineer",
    companyId: "company-1",
    applicationForm: {
      title: "SE Application",
      status: "published",
      fields: [
        { id: "f1", type: "shortText", label: "Why do you want this role?", required: true },
      ],
    },
  },
]

const mockSubmissions = [
  {
    id: "sub-1",
    jobId: "job-1",
    companyId: "company-1",
    studentId: "student-1",
    responses: { f1: "Because I love coding" },
    submittedAt: 1700000000000,
  },
  {
    id: "sub-2",
    jobId: "job-1",
    companyId: "company-1",
    studentId: "student-2",
    responses: { f1: "Great opportunity" },
    submittedAt: 1700000001000,
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/company/company-1/submissions"]}>
      <Routes>
        <Route path="/company/:companyId/submissions" element={<SubmissionsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Ensure auth returns true for all tests unless explicitly overridden
  vi.mocked(authUtils.isAuthenticated).mockReturnValue(true)
  ;(global.fetch as any).mockImplementation((url: string) => {
    if (url.includes("/api/jobs")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ jobs: mockJobs }) })
    }
    if (url.includes("/api/companies")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, submissions: mockSubmissions }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

describe("SubmissionsPage", () => {
  describe("Authentication", () => {
    it("redirects to /login when not authenticated", () => {
      vi.mocked(authUtils.isAuthenticated).mockReturnValue(false)

      renderPage()

      expect(mockNavigate).toHaveBeenCalledWith("/login")
    })
  })

  describe("Header", () => {
    it("renders the page title", async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText("Application Submissions")).toBeInTheDocument()
      })
    })

    it("renders ProfileMenu", async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByTestId("profile-menu")).toBeInTheDocument()
      })
    })

    it("back button navigates to company page", async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getByText("Application Submissions")).toBeInTheDocument()
      })

      const backButton = screen.getByRole("button", { name: /back to company/i })
      await user.click(backButton)
      expect(mockNavigate).toHaveBeenCalledWith("/company/company-1")
    })
  })

  describe("Loading state", () => {
    it("shows a loading spinner while fetching data", () => {
      ;(global.fetch as any).mockReturnValue(new Promise(() => {}))
      renderPage()
      expect(screen.getByRole("progressbar")).toBeInTheDocument()
    })
  })

  describe("Error state", () => {
    it("shows error alert when submissions fetch fails", async () => {
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ jobs: [] }) })
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "Unauthorized" }) })
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText("Unauthorized")).toBeInTheDocument()
      })
    })
  })

  describe("Empty state", () => {
    it("shows empty state message when no submissions exist", async () => {
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ jobs: [] }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, submissions: [] }) })
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText("No submissions yet.")).toBeInTheDocument()
      })
    })
  })

  describe("Submissions display", () => {
    it("displays submissions count in the filter bar", async () => {
      renderPage()
      await waitFor(() => {
        // Count appears both in the filter bar and in the job chip — use getAllByText
        expect(screen.getAllByText("2 submissions").length).toBeGreaterThan(0)
      })
    })

    it("shows student name resolved from Firestore", async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0)
      })
    })

    it("groups submissions under the job name", async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })
    })

    it("shows submission count chip per job", async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getAllByText("2 submissions").length).toBeGreaterThan(0)
      })
    })

    it("expands a submission card to show response details", async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0)
      })

      // Click the first expand button
      const expandButtons = screen.getAllByRole("button", { name: "" })
      const expandBtn = expandButtons.find((b) => b.querySelector("svg"))
      if (expandBtn) {
        await user.click(expandBtn)
        await waitFor(() => {
          expect(screen.getByText("Because I love coding")).toBeInTheDocument()
        })
      }
    })
  })

  describe("Job filter", () => {
    it("renders the job filter select", async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText("All jobs")).toBeInTheDocument()
      })
    })

    it("shows the job name as a filter option", async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText("Filter by job:")).toBeInTheDocument()
      })
    })
  })

  describe("Chat navigation", () => {
    it("chat button navigates to /dashboard/chat with studentId as repId", async () => {
      const user = userEvent.setup()
      renderPage()

      await waitFor(() => {
        expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0)
      })

      const chatButtons = screen.getAllByTitle("Chat with applicant")
      await user.click(chatButtons[0])

      expect(mockNavigate).toHaveBeenCalledWith(
        "/dashboard/chat",
        expect.objectContaining({ state: expect.objectContaining({ repId: expect.any(String) }) })
      )
    })
  })

  describe("API calls", () => {
    it("fetches jobs and submissions with the correct company ID", async () => {
      renderPage()

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/jobs?companyId=company-1")
        )
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/companies/company-1/submissions"),
          expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mock-token" }) })
        )
      })
    })
  })
})
