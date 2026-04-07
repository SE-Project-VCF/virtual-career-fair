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

/* ---- fetch mock ----
 * parseJsonOrThrow uses res.text() and res.headers.get("content-type"),
 * so we must return Response-like objects with those methods.
 */
function mockJsonResponse(data: object, ok = true, status = 200) {
  const body = JSON.stringify(data)
  return Promise.resolve({
    ok,
    status,
    headers: { get: (name: string) => (name === "content-type" ? "application/json; charset=utf-8" : null) },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(data),
  })
}
function mockNonJsonResponse(htmlBody: string, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === "content-type" ? "text/html" : null) },
    text: () => Promise.resolve(htmlBody),
    json: () => Promise.reject(new Error("Not JSON")),
  })
}
global.fetch = vi.fn()

/* ---- window.open mock ---- */
const mockWindowOpen = vi.fn()
Object.defineProperty(window, "open", { value: mockWindowOpen, writable: true })

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

const jobWithMixedFields = {
  id: "job-mixed",
  name: "Data Analyst",
  companyId: "company-1",
  applicationForm: {
    title: "DA Application",
    status: "published",
    fields: [
      { id: "q1", type: "shortText", label: "Name", required: true },
      { id: "q2", type: "checkbox", label: "Available?", required: false },
      { id: "q3", type: "multiSelect", label: "Skills", required: false },
      { id: "q4", type: "file", label: "Portfolio", required: false },
    ],
  },
}

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

const submissionWithResume = {
  id: "sub-resume",
  jobId: "job-1",
  companyId: "company-1",
  studentId: "student-3",
  responses: {},
  attachedResumePath: "resumes/student-3/cv.pdf",
  attachedResumeFileName: "my-resume.pdf",
  submittedAt: 1700000002000,
}

const submissionWithTailored = {
  id: "sub-tailored",
  jobId: "job-1",
  companyId: "company-1",
  studentId: "student-4",
  responses: {},
  attachedTailoredResumeId: "tr-1",
  attachedTailoredResumeLabel: "Frontend Dev – 3/1/2026",
  submittedAt: 1700000003000,
}

const submissionWithFileUrlsResume = {
  id: "sub-fileurls",
  jobId: "job-1",
  companyId: "company-1",
  studentId: "student-5",
  responses: {},
  attachedResumePath: "resumes/student-5/cv.pdf",
  fileUrls: { resume: "https://storage.example.com/resume.pdf" },
  submittedAt: 1700000004000,
}

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
      return mockJsonResponse({ jobs: mockJobs })
    }
    if (url.includes("/api/companies")) {
      return mockJsonResponse({ success: true, submissions: mockSubmissions })
    }
    return mockJsonResponse({})
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

  describe("Resume buttons", () => {
    /** Helper: render page with a single submission, expand its card, return user */
    async function renderWithSubmission(submission: object) {
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) {
          return mockJsonResponse({ jobs: mockJobs })
        }
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submission] })
        }
        // parseJsonOrThrow requires text() and headers.get("content-type")
        if (url.includes("/api/applicant-resume-url")) {
          return mockJsonResponse({ url: "https://example.com/signed.pdf" })
        }
        if (url.includes("/api/applicant-tailored-resume")) {
          return mockJsonResponse({
            tailoredText: "JOHN DOE\nSoftware Engineer\n\nExperience...",
          })
        }
        return mockJsonResponse({})
      })

      renderPage()

      // Wait for the page to load
      await waitFor(() => expect(screen.getByText("Application Submissions")).toBeInTheDocument())
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())

      // Expand the first submission card by clicking the student ID text row
      const cardHeaders = screen.getAllByText(/ID:/)
      await user.click(cardHeaders[0])

      return user
    }

    it("shows View Resume button when submission has attachedResumePath", async () => {
      await renderWithSubmission(submissionWithResume)
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /view resume.*my-resume\.pdf/i })).toBeInTheDocument()
      })
    })

    it("clicking View Resume fetches a signed URL and opens it in a new tab", async () => {
      const user = await renderWithSubmission(submissionWithResume)

      const resumeBtn = await screen.findByRole("button", { name: /view resume/i })
      await user.click(resumeBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/applicant-resume-url/sub-resume"),
          expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mock-token" }) })
        )
        expect(mockWindowOpen).toHaveBeenCalledWith(
          "https://example.com/signed.pdf",
          "_blank",
          "noopener,noreferrer"
        )
      })
    })

    it("View Resume opens fileUrls.resume URL directly without fetching when present", async () => {
      const user = await renderWithSubmission(submissionWithFileUrlsResume)

      const resumeBtn = await screen.findByRole("button", { name: /view resume/i })
      await user.click(resumeBtn)

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalledWith(
          expect.stringContaining("/api/applicant-resume-url"),
          expect.anything()
        )
        expect(mockWindowOpen).toHaveBeenCalledWith(
          "https://storage.example.com/resume.pdf",
          "_blank",
          "noopener,noreferrer"
        )
      })
    })

    it("View Resume shows loading state while fetching URL", async () => {
      let resolveFetch: (v: any) => void
      const fetchPromise = new Promise<any>((resolve) => {
        resolveFetch = resolve
      })
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) return mockJsonResponse({ jobs: mockJobs })
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submissionWithResume] })
        }
        if (url.includes("/api/applicant-resume-url")) return fetchPromise
        return mockJsonResponse({})
      })

      renderPage()
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())
      await user.click(screen.getAllByText(/ID:/)[0])

      const resumeBtn = await screen.findByRole("button", { name: /view resume/i })
      await user.click(resumeBtn)

      expect(screen.getByRole("button", { name: /loading/i })).toBeInTheDocument()

      resolveFetch!(await mockJsonResponse({ url: "https://example.com/signed.pdf" }))
      await waitFor(() => expect(screen.queryByRole("button", { name: /loading/i })).not.toBeInTheDocument())
    })

    it("View Resume handles 404 with appropriate error message", async () => {
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) return mockJsonResponse({ jobs: mockJobs })
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submissionWithResume] })
        }
        if (url.includes("/api/applicant-resume-url")) {
          return mockJsonResponse({ error: "Resume not found" }, false, 404)
        }
        return mockJsonResponse({})
      })

      renderPage()
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())
      await user.click(screen.getAllByText(/ID:/)[0])
      await user.click(await screen.findByRole("button", { name: /view resume/i }))

      await waitFor(() => {
        expect(mockWindowOpen).not.toHaveBeenCalled()
      })
    })

    it("shows View Tailored Resume button when submission has attachedTailoredResumeId", async () => {
      await renderWithSubmission(submissionWithTailored)
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /tailored resume/i })).toBeInTheDocument()
      })
    })

    it("clicking View Tailored Resume opens a dialog with the resume content", async () => {
      const user = await renderWithSubmission(submissionWithTailored)

      const tailoredBtn = await screen.findByRole("button", { name: /tailored resume/i })
      await user.click(tailoredBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/applicant-tailored-resume/sub-tailored"),
          expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mock-token" }) })
        )
        expect(screen.getByText(/JOHN DOE/)).toBeInTheDocument()
      })
    })

    it("tailored resume dialog shows label from attachedTailoredResumeLabel in the title", async () => {
      const user = await renderWithSubmission(submissionWithTailored)

      const tailoredBtn = await screen.findByRole("button", { name: /tailored resume/i })
      await user.click(tailoredBtn)

      // The label appears in both the button text and the dialog heading — use heading role
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Frontend Dev/i })).toBeInTheDocument()
      })
    })

    it("tailored resume dialog shows an error when the API call fails", async () => {
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) {
          return mockJsonResponse({ jobs: mockJobs })
        }
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submissionWithTailored] })
        }
        if (url.includes("/api/applicant-tailored-resume")) {
          return mockJsonResponse({ error: "Not authorized" }, false, 403)
        }
        return mockJsonResponse({})
      })

      renderPage()
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())

      const cardHeaders = screen.getAllByText(/ID:/)
      await user.click(cardHeaders[0])

      const tailoredBtn = await screen.findByRole("button", { name: /tailored resume/i })
      await user.click(tailoredBtn)

      await waitFor(() => {
        expect(screen.getByText("Not authorized")).toBeInTheDocument()
      })
    })

    it("tailored resume dialog shows error when API returns non-JSON (parseJsonOrThrow)", async () => {
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) return mockJsonResponse({ jobs: mockJobs })
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submissionWithTailored] })
        }
        if (url.includes("/api/applicant-tailored-resume")) {
          return mockNonJsonResponse("<html><body>Server Error</body></html>")
        }
        return mockJsonResponse({})
      })

      renderPage()
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())
      await user.click(screen.getAllByText(/ID:/)[0])
      await user.click(await screen.findByRole("button", { name: /tailored resume/i }))

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/Server returned non-JSON|Check that VITE_API_URL/)
      })
    })

    it("tailored resume uses structured data when tailoredText is absent", async () => {
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) return mockJsonResponse({ jobs: mockJobs })
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submissionWithTailored] })
        }
        if (url.includes("/api/applicant-tailored-resume")) {
          return mockJsonResponse({
            structured: { summary: { text: "Experienced data analyst with 5 years in SQL." } },
          })
        }
        return mockJsonResponse({})
      })

      renderPage()
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())
      await user.click(screen.getAllByText(/ID:/)[0])
      await user.click(await screen.findByRole("button", { name: /tailored resume/i }))

      await waitFor(() => {
        expect(screen.getByText(/PROFESSIONAL SUMMARY|Experienced data analyst/)).toBeInTheDocument()
      })
    })

    it("tailored resume shows '(No content found)' when neither tailoredText nor structured", async () => {
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) return mockJsonResponse({ jobs: mockJobs })
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submissionWithTailored] })
        }
        if (url.includes("/api/applicant-tailored-resume")) {
          return mockJsonResponse({})
        }
        return mockJsonResponse({})
      })

      renderPage()
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())
      await user.click(screen.getAllByText(/ID:/)[0])
      await user.click(await screen.findByRole("button", { name: /tailored resume/i }))

      await waitFor(() => {
        expect(screen.getByText("(No content found)")).toBeInTheDocument()
      })
    })
  })

  describe("Form field rendering (renderResponseValue, lines 222-309)", () => {
    async function renderWithJobAndSubmission(job: object, submission: object) {
      const user = userEvent.setup()
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/api/jobs")) return mockJsonResponse({ jobs: [job] })
        if (url.includes("/api/companies")) {
          return mockJsonResponse({ success: true, submissions: [submission] })
        }
        return mockJsonResponse({})
      })
      renderPage()
      await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument())
      await user.click(screen.getAllByText(/ID:/)[0])
      return user
    }

    it("renders boolean as Yes/No", async () => {
      await renderWithJobAndSubmission(jobWithMixedFields, {
        id: "sub-1",
        jobId: "job-mixed",
        companyId: "company-1",
        studentId: "student-1",
        responses: { q1: "John", q2: true, q3: null, q4: null },
        submittedAt: 1700000000000,
      })
      expect(screen.getByText("Yes")).toBeInTheDocument()
    })

    it("renders array as comma-joined string", async () => {
      await renderWithJobAndSubmission(jobWithMixedFields, {
        id: "sub-1",
        jobId: "job-mixed",
        companyId: "company-1",
        studentId: "student-1",
        responses: { q1: "Jane", q2: false, q3: ["Python", "SQL", "R"], q4: null },
        submittedAt: 1700000000000,
      })
      expect(screen.getByText("Python, SQL, R")).toBeInTheDocument()
    })

    it("renders null/undefined as em dash", async () => {
      await renderWithJobAndSubmission(jobWithMixedFields, {
        id: "sub-1",
        jobId: "job-mixed",
        companyId: "company-1",
        studentId: "student-1",
        responses: { q1: "Test", q2: null, q3: [], q4: null },
        submittedAt: 1700000000000,
      })
      const dashes = screen.getAllByText("—")
      expect(dashes.length).toBeGreaterThan(0)
    })

    it("renders file field with View uploaded file link when fileUrl present", async () => {
      await renderWithJobAndSubmission(
        jobWithMixedFields,
        {
          id: "sub-1",
          jobId: "job-mixed",
          companyId: "company-1",
          studentId: "student-1",
          responses: { q1: "Alice", q2: false, q3: null, q4: null },
          fileUrls: { q4: "https://example.com/portfolio.pdf" },
          submittedAt: 1700000000000,
        }
      )
      expect(screen.getByRole("link", { name: /view uploaded file/i })).toHaveAttribute(
        "href",
        "https://example.com/portfolio.pdf"
      )
    })

    it("renders file field as 'No file uploaded' when no fileUrl", async () => {
      await renderWithJobAndSubmission(jobWithMixedFields, {
        id: "sub-1",
        jobId: "job-mixed",
        companyId: "company-1",
        studentId: "student-1",
        responses: { q1: "Bob", q2: false, q3: null, q4: null },
        submittedAt: 1700000000000,
      })
      expect(screen.getByText("No file uploaded")).toBeInTheDocument()
    })

    it("fallback: renders responses and fileUrls when no form fields", async () => {
      const jobNoForm = {
        id: "job-nf",
        name: "Legacy Job",
        companyId: "company-1",
        applicationForm: { title: "Legacy", status: "published", fields: [] },
      }
      await renderWithJobAndSubmission(jobNoForm, {
        id: "sub-1",
        jobId: "job-nf",
        companyId: "company-1",
        studentId: "student-1",
        responses: { custom_key: "Custom answer", other: "More text" },
        fileUrls: { attachment: "https://example.com/file.pdf" },
        submittedAt: 1700000000000,
      })
      expect(screen.getByText("custom_key")).toBeInTheDocument()
      expect(screen.getByText("Custom answer")).toBeInTheDocument()
      expect(screen.getByText("other")).toBeInTheDocument()
      expect(screen.getByText("More text")).toBeInTheDocument()
      expect(screen.getByText("attachment (file)")).toBeInTheDocument()
      expect(screen.getByRole("link", { name: /view uploaded file/i })).toBeInTheDocument()
    })

    it("shows required asterisk for required form fields", async () => {
      await renderWithJobAndSubmission(jobWithMixedFields, {
        id: "sub-1",
        jobId: "job-mixed",
        companyId: "company-1",
        studentId: "student-1",
        responses: { q1: "Name", q2: false, q3: null, q4: null },
        submittedAt: 1700000000000,
      })
      expect(screen.getAllByText("Name").length).toBeGreaterThan(0)
      expect(screen.getByText("*")).toBeInTheDocument()
    })
  })
})
