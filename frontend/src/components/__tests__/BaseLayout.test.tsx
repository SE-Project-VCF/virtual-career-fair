/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter } from "react-router-dom"
import BaseLayout from "../BaseLayout"
import * as authModule from "../../utils/auth"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("../../utils/auth", () => ({
  authUtils: { getCurrentUser: vi.fn() },
}))

vi.mock("../NotificationBell", () => ({
  default: () => <div data-testid="notification-bell">Bell</div>,
}))

vi.mock("../../pages/ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}))

const makeUser = (overrides = {}) => ({
  uid: "user-1",
  email: "user@test.com",
  role: "student" as const,
  ...overrides,
})

const renderLayout = (props: React.ComponentProps<typeof BaseLayout> = { children: <div>content</div> }) =>
  render(
    <BrowserRouter>
      <BaseLayout {...props} />
    </BrowserRouter>
  )

describe("BaseLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(makeUser())
  })

  // ─── Branding ──────────────────────────────────────────────────────────────

  describe("Branding", () => {
    it("renders the Job Goblin heading", () => {
      renderLayout()
      expect(screen.getAllByText("Job Goblin").length).toBeGreaterThan(0)
    })

    it("renders the Virtual Career Fair subheading", () => {
      renderLayout()
      expect(screen.getAllByText("Virtual Career Fair").length).toBeGreaterThan(0)
    })

    it("navigates to /dashboard when branding is clicked", async () => {
      const user = userEvent.setup()
      renderLayout()
      // The branding box is the clickable element containing "Job Goblin"
      const brandingBoxes = screen.getAllByText("Job Goblin")
      // The first instance is in the header (outside the drawer)
      await user.click(brandingBoxes[0])
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
    })
  })

  // ─── Page title ────────────────────────────────────────────────────────────

  describe("pageTitle prop", () => {
    it("renders the page title in the header when provided", () => {
      renderLayout({ children: <div />, pageTitle: "My Page" })
      expect(screen.getByText("My Page")).toBeInTheDocument()
    })

    it("does not render a page title when prop is omitted", () => {
      renderLayout({ children: <div /> })
      // Only branding text should be present, no extra titles
      expect(screen.queryByRole("heading", { name: /my page/i })).not.toBeInTheDocument()
    })
  })

  // ─── Children ──────────────────────────────────────────────────────────────

  describe("children", () => {
    it("renders child content", () => {
      renderLayout({ children: <p>Hello world</p> })
      expect(screen.getByText("Hello world")).toBeInTheDocument()
    })
  })

  // ─── Header actions ────────────────────────────────────────────────────────

  describe("Chat button", () => {
    it("renders the Chat button by default", () => {
      renderLayout()
      expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument()
    })

    it("hides the Chat button when showChat is false", () => {
      renderLayout({ children: <div />, showChat: false })
      expect(screen.queryByRole("button", { name: /chat/i })).not.toBeInTheDocument()
    })

    it("navigates to /dashboard/chat when Chat is clicked", async () => {
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByRole("button", { name: /chat/i }))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard/chat")
    })
  })

  it("renders the NotificationBell", () => {
    renderLayout()
    expect(screen.getByTestId("notification-bell")).toBeInTheDocument()
  })

  it("renders the ProfileMenu", () => {
    renderLayout()
    expect(screen.getByTestId("profile-menu")).toBeInTheDocument()
  })

  // ─── Navigation drawer ─────────────────────────────────────────────────────

  describe("Navigation drawer", () => {
    it("opens when the hamburger button is clicked", async () => {
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByLabelText("Navigation menu"))
      expect(screen.getByRole("presentation")).toBeInTheDocument()
    })

    it("closes when the close button inside the drawer is clicked", async () => {
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByLabelText("Navigation menu"))
      const closeBtn = screen.getByTestId("CloseIcon").closest("button")!
      await user.click(closeBtn)
      await waitFor(() => {
        expect(screen.queryByText("Signed in as")).not.toBeInTheDocument()
      })
    })

    it("shows the signed-in user email and role in the drawer", async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ email: "jane@example.com", role: "student" })
      )
      renderLayout()
      await user.click(screen.getByLabelText("Navigation menu"))
      expect(screen.getByText("jane@example.com")).toBeInTheDocument()
      expect(screen.getByText("student")).toBeInTheDocument()
    })

    it("does not show user info section when no user is logged in", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(null)
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByLabelText("Navigation menu"))
      expect(screen.queryByText("Signed in as")).not.toBeInTheDocument()
    })

    it("navigates and closes the drawer when a nav item is clicked", async () => {
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByLabelText("Navigation menu"))
      await user.click(screen.getByText("Dashboard"))
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
      await waitFor(() => {
        expect(screen.queryByText("Signed in as")).not.toBeInTheDocument()
      })
    })
  })

  // ─── Role-based navigation ─────────────────────────────────────────────────

  describe("Role-based navigation items", () => {
    const openDrawer = async () => {
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByLabelText("Navigation menu"))
      return user
    }

    const commonItems = ["Dashboard", "Browse Fairs", "Chat", "Profile"]

    it("shows common nav items for all roles", async () => {
      await openDrawer()
      for (const label of commonItems) {
        // "Chat" also appears as a header button label, so allow multiple matches
        expect(screen.getAllByText(label).length).toBeGreaterThan(0)
      }
    })

    it("shows student-specific items for student role", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(makeUser({ role: "student" }))
      await openDrawer()
      expect(screen.getByText("Job Invitations")).toBeInTheDocument()
      expect(screen.getByText("Tailored Resumes")).toBeInTheDocument()
      expect(screen.getByText("Booth History")).toBeInTheDocument()
    })

    it("does not show student items for non-student roles", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ role: "administrator" })
      )
      await openDrawer()
      expect(screen.queryByText("Job Invitations")).not.toBeInTheDocument()
      expect(screen.queryByText("Tailored Resumes")).not.toBeInTheDocument()
    })

    it("shows companyOwner-specific items", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ role: "companyOwner" })
      )
      await openDrawer()
      expect(screen.getByText("Manage Companies")).toBeInTheDocument()
      expect(screen.getByText("Browse Booths")).toBeInTheDocument()
    })

    it("shows representative items with dynamic paths when companyId is present", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ role: "representative", companyId: "co-99" })
      )
      await openDrawer()
      expect(screen.getByText("Manage Booth")).toBeInTheDocument()
      expect(screen.getByText("Submissions")).toBeInTheDocument()
      expect(screen.getByText("Browse Booths")).toBeInTheDocument()
    })

    it("shows only Browse Booths for representative without companyId", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ role: "representative", companyId: undefined })
      )
      await openDrawer()
      expect(screen.queryByText("Manage Booth")).not.toBeInTheDocument()
      expect(screen.queryByText("Submissions")).not.toBeInTheDocument()
      expect(screen.getByText("Browse Booths")).toBeInTheDocument()
    })

    it("shows administrator-specific items", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ role: "administrator" })
      )
      await openDrawer()
      expect(screen.getByText("Admin Panel")).toBeInTheDocument()
      expect(screen.getByText("Company Management")).toBeInTheDocument()
    })

    it("navigates to the correct path for a representative's Manage Booth", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ role: "representative", companyId: "co-99" })
      )
      const user = await openDrawer()
      await user.click(screen.getByText("Manage Booth"))
      expect(mockNavigate).toHaveBeenCalledWith("/company/co-99/booth")
    })

    it("navigates to the correct path for a representative's Submissions", async () => {
      vi.mocked(authModule.authUtils.getCurrentUser).mockReturnValue(
        makeUser({ role: "representative", companyId: "co-99" })
      )
      const user = await openDrawer()
      await user.click(screen.getByText("Submissions"))
      expect(mockNavigate).toHaveBeenCalledWith("/company/co-99/submissions")
    })
  })
})
