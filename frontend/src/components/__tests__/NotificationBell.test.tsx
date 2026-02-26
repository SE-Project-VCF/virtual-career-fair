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

const studentUser = { uid: "student-1", role: "student" as const, email: "s@test.com" }
const adminUser = { uid: "admin-1", role: "administrator" as const, email: "a@test.com" }

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

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(studentUser)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [] }),
    })
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
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invitations: [makeInvitation(), makeInvitation({ id: "inv-2" })] }),
      })
      renderBell()
      await waitFor(() => {
        expect(screen.getByText("2")).toBeInTheDocument()
      })
    })

    it("logs error when fetch throws", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"))
      renderBell()
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Error fetching notifications:",
          expect.any(Error)
        )
      })
      consoleError.mockRestore()
    })

    it("handles non-ok fetch response gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
      renderBell()
      // No error thrown, badge stays at 0
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
      expect(screen.getByText("Job Invitations")).toBeInTheDocument()
    })

    it("closes the menu when backdrop is clicked (handleClose)", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("Job Invitations")).toBeInTheDocument()

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
      expect(screen.getByText("No new invitations")).toBeInTheDocument()
    })
  })

  describe("Invitation list", () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invitations: [makeInvitation()] }),
      })
    })

    it("renders invitation job name and company", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    })

    it("falls back to 'Job Opportunity' when job is null", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invitations: [makeInvitation({ job: null })] }),
      })
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("Job Opportunity")).toBeInTheDocument()
    })

    it("falls back to 'Company' when company is null", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invitations: [makeInvitation({ company: null })] }),
      })
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("Company")).toBeInTheDocument()
    })

    it("shows 'View All Invitations' footer item", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      expect(screen.getByText("View All Invitations")).toBeInTheDocument()
    })

    it("shows singular 'invitation' label for count of 1", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => {
        expect(screen.getByText(/1 new invitation$/)).toBeInTheDocument()
      })
    })

    it("shows plural 'invitations' label for count > 1", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invitations: [makeInvitation(), makeInvitation({ id: "inv-2" })] }),
      })
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => {
        expect(screen.getByText(/2 new invitations/)).toBeInTheDocument()
      })
    })
  })

  describe("Navigation", () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invitations: [makeInvitation()] }),
      })
    })

    it("navigates to job-invitations and closes menu when invitation is clicked (handleInvitationClick)", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())
      await user.click(screen.getByText("Software Engineer"))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/job-invitations")
      await waitFor(() => {
        expect(screen.queryByText("Job Invitations")).not.toBeInTheDocument()
      })
    })

    it("navigates to job-invitations and closes menu when View All is clicked (handleViewAll)", async () => {
      const user = userEvent.setup()
      renderBell()
      await user.click(screen.getByRole("button"))
      await waitFor(() => expect(screen.getByText("View All Invitations")).toBeInTheDocument())
      await user.click(screen.getByText("View All Invitations"))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/job-invitations")
      await waitFor(() => {
        expect(screen.queryByText("Job Invitations")).not.toBeInTheDocument()
      })
    })
  })

  describe("formatTime", () => {
    const openMenuWithInvitation = async (sentAt: number) => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invitations: [makeInvitation({ sentAt })] }),
      })
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
