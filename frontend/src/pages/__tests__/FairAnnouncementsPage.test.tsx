/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAnnouncementsPage from "../FairAnnouncementsPage"
import * as authUtils from "../../utils/auth"
import * as firebase from "../../firebase"

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock("../../firebase", () => ({
  waitForFirebaseUser: vi.fn(),
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children?: ReactNode; pageTitle?: string }) => (
    <div data-testid="base-layout">
      {pageTitle ? <span data-testid="page-title">{pageTitle}</span> : null}
      {children}
    </div>
  ),
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <FairAnnouncementsPage />
    </BrowserRouter>,
  )

describe("FairAnnouncementsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it("renders nothing when user is null", () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue(null)
    const { container } = renderPage()
    expect(container.firstChild).toBeNull()
  })

  it("shows info alert for roles that cannot use the page", () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      email: "s@example.com",
      role: "student",
    })
    renderPage()
    expect(screen.getByText(/company owners and representatives/i)).toBeInTheDocument()
  })

  it("shows loading then empty state when announcements fetch succeeds with no rows", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      email: "o@example.com",
      role: "companyOwner",
      companyId: "c1",
    })
    vi.mocked(firebase.waitForFirebaseUser).mockResolvedValue({
      getIdToken: vi.fn().mockResolvedValue("tok"),
    } as any)
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ announcements: [] }),
    } as Response)

    renderPage()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/No published announcements yet for your enrolled fairs/i)).toBeInTheDocument()
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:5000/api/fairs/my-announcements",
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    )
  })

  it("shows error when session cannot be verified", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      email: "o@example.com",
      role: "representative",
      companyId: "c1",
    })
    vi.mocked(firebase.waitForFirebaseUser).mockResolvedValue(null)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Could not verify your session/i)).toBeInTheDocument()
    })
  })

  it("shows error when API returns non-OK", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      email: "o@example.com",
      role: "companyOwner",
      companyId: "c1",
    })
    vi.mocked(firebase.waitForFirebaseUser).mockResolvedValue({
      getIdToken: vi.fn().mockResolvedValue("tok"),
    } as any)
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Could not load announcements.")).toBeInTheDocument()
    })
  })

  it("splits rows into upcoming and past sections", async () => {
    const now = Date.now()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "u1",
      email: "o@example.com",
      role: "companyOwner",
      companyId: "c1",
    })
    vi.mocked(firebase.waitForFirebaseUser).mockResolvedValue({
      getIdToken: vi.fn().mockResolvedValue("tok"),
    } as any)

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        announcements: [
          {
            id: "a1",
            fairId: "f1",
            fairName: "Spring",
            title: "T1",
            description: "D1",
            publishedAt: now,
            createdAt: now,
            fairStartTime: now - 86400000,
            fairEndTime: now + 86400000,
          },
          {
            id: "a2",
            fairId: "f2",
            fairName: "Old",
            title: "T2",
            description: "",
            publishedAt: now,
            createdAt: now,
            fairStartTime: now - 86400000 * 10,
            fairEndTime: now - 86400000,
          },
        ],
      }),
    } as Response)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText("Upcoming and current fairs")).toBeInTheDocument()
    })
    expect(screen.getByText("Spring")).toBeInTheDocument()
    expect(screen.getByText("Active / upcoming")).toBeInTheDocument()

    expect(screen.getByText("Past fairs")).toBeInTheDocument()
    expect(screen.getByText("Old")).toBeInTheDocument()
    expect(screen.getByText("Past fair")).toBeInTheDocument()
  })
})
