import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import NotificationBell from "../NotificationBell"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("../../utils/auth", () => ({
  authUtils: { getCurrentUser: vi.fn() },
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}))

import * as authUtils from "../../utils/auth"

const studentUser = {
  uid: "student-1",
  role: "student" as const,
  email: "s@test.com",
  getIdToken: vi.fn().mockResolvedValue("mock-id-token"),
}

const adminUser = { uid: "admin-1", role: "administrator" as const, email: "a@test.com" }

function makeVideoInvitation(overrides = {}) {
  return {
    id: "vc-1",
    employerId: "emp-1",
    employerName: "Pat Employer",
    employerCompanyName: "Acme Co",
    studentId: "student-1",
    status: "pending" as const,
    createdAt: Date.now() - 120000,
    scheduledTime: Date.now() + 3600000,
    jitsiRoom: "room-1",
    ...overrides,
  }
}

const makeInvitation = (overrides = {}) => ({
  id: "inv-1",
  jobId: "job-1",
  status: "sent",
  sentAt: Date.now() - 300000, // 5 minutes ago
  job: { name: "Software Engineer" },
  company: { companyName: "Acme Corp" },
  ...overrides,
})

const renderBell = () =>
  render(
    <BrowserRouter>
      <NotificationBell />
    </BrowserRouter>
  )

type FetchInvites = { ok?: boolean; invitations?: unknown[] }

function defaultFetchImpl(url: string) {
  return mockFetchRoutesResponse(url, { invitations: [] }, { invitations: [] })
}

function mockFetchRoutesResponse(
  url: string,
  jobs: FetchInvites,
  calls: FetchInvites = { invitations: [] }
) {
  if (url.includes("/api/job-invitations/received")) {
    return Promise.resolve({
      ok: jobs.ok !== false,
      json: async () => ({ invitations: jobs.invitations ?? [] }),
    })
  }
  if (url.includes("/api/call-invitations/incoming")) {
    return Promise.resolve({
      ok: calls.ok !== false,
      json: async () => ({ invitations: calls.invitations ?? [] }),
    })
  }
  return Promise.resolve({ ok: false, json: async () => ({}) })
}

function mockFetchRoutes(jobs: FetchInvites, calls: FetchInvites = { invitations: [] }) {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => mockFetchRoutesResponse(url, jobs, calls))
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(studentUser)
    vi.mocked(studentUser.getIdToken).mockResolvedValue("mock-id-token")
    globalThis.fetch = vi.fn().mockImplementation(defaultFetchImpl)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Visibility", () => {
    it("renders the bell icon for students", async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByTestId("NotificationsIcon")).toBeInTheDocument()
      })
    })

    it("returns null for non-student users", () => {
      vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(adminUser)
      const { container } = renderBell()
      expect(container).toBeEmptyDOMElement()
    })

    it("returns null when user is null", () => {
      vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(null)
      const { container } = renderBell()
      expect(container).toBeEmptyDOMElement()
    })
  })

  describe("Fetch invitations", () => {
    it("fetches invitations on mount for students", async () => {
      renderBell()
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/job-invitations/received"),
          expect.objectContaining({ method: "GET" })
        )
      })
    })

    it("does not fetch when user is not a student", () => {
      vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(adminUser)
      renderBell()
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it("shows unread count badge when invitations exist", async () => {
      mockFetchRoutes({
        invitations: [makeInvitation(), makeInvitation({ id: "inv-2" })],
      })
      renderBell()
      await waitFor(() => {
        expect(screen.getByText("2")).toBeInTheDocument()
      })
    })

    it("logs error when job fetch throws", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/job-invitations/received")) {
          return Promise.reject(new Error("Network error"))
        }
        return mockFetchRoutesResponse(url, { invitations: [] }, { invitations: [] })
      })
      renderBell()
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Error fetching job notifications:",
          expect.any(Error)
        )
      })
      consoleError.mockRestore()
    })

    it("logs error when video call fetch throws", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/call-invitations/incoming")) {
          return Promise.reject(new Error("Video API down"))
        }
        return mockFetchRoutesResponse(url, { invitations: [] }, { invitations: [] })
      })
      renderBell()
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Error fetching video call notifications:",
          expect.any(Error)
        )
      })
      consoleError.mockRestore()
    })

    it("skips video fetch when getIdToken returns falsy (lines 88-89)", async () => {
      vi.mocked(studentUser.getIdToken).mockResolvedValue(undefined as unknown as string)
      const fetchSpy = vi.fn().mockImplementation(defaultFetchImpl)
      globalThis.fetch = fetchSpy
      renderBell()
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/api/job-invitations/received"),
          expect.any(Object)
        )
      })
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/call-invitations/incoming"),
        expect.any(Object)
      )
    })

    it("fetches video invitations with Bearer token (lines 91-100)", async () => {
      const fetchSpy = vi.fn().mockImplementation(defaultFetchImpl)
      globalThis.fetch = fetchSpy
      renderBell()
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/api/call-invitations/incoming"),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: "Bearer mock-id-token",
            }),
          })
        )
      })
    })

    it("filters to pending video invites and maps object createdAt with toMillis (lines 102-114)", async () => {
      const ts = { toMillis: () => 1_700_000_000_000 }
      mockFetchRoutes(
        { invitations: [] },
        {
          invitations: [
            makeVideoInvitation({
              id: "p1",
              status: "pending",
              createdAt: ts as unknown as number,
            }),
            makeVideoInvitation({
              id: "acc",
              status: "accepted",
              createdAt: Date.now(),
            }),
          ],
        }
      )
      renderBell()
      await waitFor(() => {
        expect(screen.getByText("1")).toBeInTheDocument()
      })
      const user = userEvent.setup()
      await user.click(screen.getByRole("button"))
      await user.click(screen.getByRole("tab", { name: /Calls/i }))
      expect(screen.getByText("Pat Employer")).toBeInTheDocument()
      expect(screen.getByText("Acme Co")).toBeInTheDocument()
    })

    it("maps numeric createdAt for video invites (line 111 branch)", async () => {
      const t = Date.now() - 120000
      mockFetchRoutes(
        { invitations: [] },
        {
          invitations: [makeVideoInvitation({ createdAt: t })],
        }
      )
      const user = userEvent.setup()
      renderBell()
      await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument())
      await user.click(screen.getByRole("button"))
      await user.click(screen.getByRole("tab", { name: /Calls/i }))
      expect(screen.getByText("2m ago")).toBeInTheDocument()
    })

    it("polls job and video endpoints on interval callback (lines 127-128)", async () => {
      const pollCallbacks: Array<() => void> = []
      const setIntervalSpy = vi
        .spyOn(globalThis, "setInterval")
        .mockImplementation((handler: TimerHandler, delay?: number) => {
          if (delay === 15000 && typeof handler === "function") pollCallbacks.push(handler)
          return 0 as unknown as ReturnType<typeof setInterval>
        })
      try {
        const fetchSpy = vi.fn().mockImplementation(defaultFetchImpl)
        globalThis.fetch = fetchSpy
        renderBell()
        await waitFor(() => {
          expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
        })
        expect(pollCallbacks.length).toBe(1)
        pollCallbacks[0]()
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0)
        })
        await waitFor(() => {
          expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(4)
        })
        const jobCalls = fetchSpy.mock.calls.filter((c) =>
          String(c[0]).includes("/api/job-invitations/received")
        )
        const videoCalls = fetchSpy.mock.calls.filter((c) =>
          String(c[0]).includes("/api/call-invitations/incoming")
        )
        expect(jobCalls.length).toBeGreaterThanOrEqual(2)
        expect(videoCalls.length).toBeGreaterThanOrEqual(2)
      } finally {
        setIntervalSpy.mockRestore()
      }
    })

    it("handles non-ok fetch response gracefully for jobs", async () => {
      mockFetchRoutes({ ok: false, invitations: [] })
      renderBell()
      await waitFor(() => {
        expect(screen.getByTestId("NotificationsIcon")).toBeInTheDocument()
      })
    })

    it("handles non-ok video response without updating call list", async () => {
      mockFetchRoutes({ invitations: [] }, { ok: false, invitations: [] })
      renderBell()
      await waitFor(() => {
        expect(screen.getByTestId("NotificationsIcon")).toBeInTheDocument()
      })
    })
  })

  describe("Menu open / close", () => {
    it("opens the menu when bell is clicked (handleClick)", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText(/Notifications/i)).toBeInTheDocument()
    })

    it("closes the menu when backdrop is clicked (handleClose)", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText(/Notifications/i)).toBeInTheDocument()

      // Press Escape to close
      await user.keyboard("{Escape}")
      await waitFor(() => {
        expect(screen.queryByText("Job Invitations")).not.toBeInTheDocument()
      })
    })
  })

  describe("Empty state", () => {
    it("shows 'No new invitations' when list is empty", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText(/No new job invitations/i)).toBeInTheDocument()
    })
  })

  describe("Video Calls tab (handleTabChange, lines 319-352)", () => {
    it("shows empty copy when there are no call invitations", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await user.click(screen.getByRole("tab", { name: /Calls/i }))
      expect(screen.getByText(/No new call invitations/i)).toBeInTheDocument()
    })

    it("uses Employer and Company fallbacks when names are missing", async () => {
      mockFetchRoutes(
        { invitations: [] },
        {
          invitations: [
            makeVideoInvitation({
              id: "fb-fallback",
              employerName: undefined,
              employerCompanyName: undefined,
            }),
          ],
        }
      )
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await user.click(screen.getByRole("tab", { name: /Calls/i }))
      expect(screen.getByText("Employer")).toBeInTheDocument()
      expect(screen.getAllByText("Company").length).toBeGreaterThan(0)
    })
  })

  describe("Invitation list", () => {
    beforeEach(() => {
      mockFetchRoutes({ invitations: [makeInvitation()] })
    })

    it("renders invitation job name and company", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    })

    it("falls back to 'Job Opportunity' when job is null", async () => {
      mockFetchRoutes({ invitations: [makeInvitation({ job: null })] })
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("Job Opportunity")).toBeInTheDocument()
    })

    it("falls back to 'Company' when company is null", async () => {
      mockFetchRoutes({ invitations: [makeInvitation({ company: null })] })
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("Company")).toBeInTheDocument()
    })

    it("shows 'View All Invitations' footer item", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText(/View All.*Invitations/i)).toBeInTheDocument()
    })

    it("shows singular 'invitation' label for count of 1", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => {
        expect(screen.getByText(/1 new notification/i)).toBeInTheDocument()
      })
    })

    it("shows plural 'invitations' label for count > 1", async () => {
      mockFetchRoutes({
        invitations: [makeInvitation(), makeInvitation({ id: "inv-2" })],
      })
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => {
        expect(screen.getByText(/2 new notifications/i)).toBeInTheDocument()
      })
    })
  })

  describe("Navigation", () => {
    beforeEach(() => {
      mockFetchRoutes({ invitations: [makeInvitation()] })
    })

    it("navigates to job-invitations and closes menu when invitation is clicked (handleInvitationClick)", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())
      await user.click(screen.getByText("Software Engineer"))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/job-invitations")
      await waitFor(() => {
        expect(screen.queryByText(/Notifications/i)).not.toBeInTheDocument()
      })
    })

    it("navigates to job-invitations and closes menu when View All is clicked (handleViewAll)", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => expect(screen.getByText(/View All Job Invitations/i)).toBeInTheDocument())
      await user.click(screen.getByText(/View All Job Invitations/i))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/job-invitations")
      await waitFor(() => {
        expect(screen.queryByText(/Notifications/i)).not.toBeInTheDocument()
      })
    })

    it("navigates to call-invitations when View All is clicked on Calls tab (lines 151, handleViewAll)", async () => {
      mockFetchRoutes(
        { invitations: [] },
        { invitations: [makeVideoInvitation({ id: "vc-nav" })] }
      )
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await user.click(screen.getByRole("tab", { name: /Calls/i }))
      await waitFor(() => expect(screen.getByText(/View All Call Invitations/i)).toBeInTheDocument())
      await user.click(screen.getByText(/View All Call Invitations/i))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/call-invitations")
    })

    it("navigates to call-invitations when a video invitation row is clicked (lines 161-162)", async () => {
      mockFetchRoutes(
        { invitations: [] },
        { invitations: [makeVideoInvitation({ id: "vc-row", employerName: "Row Employer" })] }
      )
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await user.click(screen.getByRole("tab", { name: /Calls/i }))
      await waitFor(() => expect(screen.getByText("Row Employer")).toBeInTheDocument())
      await user.click(screen.getByText("Row Employer"))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/call-invitations")
    })
  })

  describe("formatTime", () => {
    const openMenuWithInvitation = async (sentAt: number) => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) =>
        mockFetchRoutesResponse(url, { invitations: [makeInvitation({ sentAt })] }, { invitations: [] })
      )
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())
    }

    it("shows 'Just now' for timestamps less than 1 minute ago", async () => {
      await openMenuWithInvitation(Date.now() - 30000) // 30 seconds ago
      expect(screen.getByText("Just now")).toBeInTheDocument()
    })

    it("shows 'Xm ago' for timestamps less than 1 hour ago", async () => {
      await openMenuWithInvitation(Date.now() - 300000) // 5 minutes ago
      expect(screen.getByText("5m ago")).toBeInTheDocument()
    })

    it("shows 'Xh ago' for timestamps less than 24 hours ago", async () => {
      await openMenuWithInvitation(Date.now() - 7200000) // 2 hours ago
      expect(screen.getByText("2h ago")).toBeInTheDocument()
    })

    it("shows 'Xd ago' for timestamps less than 7 days ago", async () => {
      await openMenuWithInvitation(Date.now() - 172800000) // 2 days ago
      expect(screen.getByText("2d ago")).toBeInTheDocument()
    })

    it("shows locale date string for timestamps 7+ days ago", async () => {
      const oldDate = new Date(Date.now() - 8 * 86400000) // 8 days ago
      await openMenuWithInvitation(oldDate.getTime())
      expect(screen.getByText(oldDate.toLocaleDateString())).toBeInTheDocument()
    })
  })
})
