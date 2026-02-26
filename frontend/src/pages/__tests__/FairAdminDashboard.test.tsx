/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAdminDashboard from "../FairAdminDashboard"
import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
  FairProvider: ({ children }: any) => <>{children}</>,
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

const renderFairAdminDashboard = () =>
  render(
    <BrowserRouter>
      <FairAdminDashboard />
    </BrowserRouter>
  )

describe("FairAdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()

    // Default: administrator
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    // Default: fair loaded and not live
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: false,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: false,
      fairId: "f1",
    })

    // Default fetch: enrollments endpoint returns empty list
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })
  })

  it("redirects non-admin to /dashboard", () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })

    renderFairAdminDashboard()

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("shows loading spinner when fairLoading is true", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: true,
      fair: null,
      isLive: false,
      fairId: null,
    })

    renderFairAdminDashboard()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows Fair not found when fair is null", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: null,
      isLive: false,
      fairId: "f1",
    })

    renderFairAdminDashboard()

    expect(screen.getByText("Fair not found")).toBeInTheDocument()
  })

  it("renders fair admin header with fair name", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Admin — Spring Fair")).toBeInTheDocument()
    })
  })

  it("shows Live chip when fair is live", async () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        isLive: true,
        startTime: null,
        endTime: null,
        inviteCode: "ABC123",
      },
      isLive: true,
      fairId: "f1",
    })

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument()
    })
  })

  it("shows Offline chip when fair is not live", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument()
    })
  })

  it("shows invite code", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument()
    })
  })

  it("shows No companies enrolled yet when empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("No companies enrolled yet.")).toBeInTheDocument()
    })
  })

  it("Add Company button opens dialog", async () => {
    const user = userEvent.setup()

    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add company/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /add company/i }))

    expect(screen.getByText("Add Company to Fair")).toBeInTheDocument()
  })
})
