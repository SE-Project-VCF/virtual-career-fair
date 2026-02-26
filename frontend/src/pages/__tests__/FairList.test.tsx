/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairList from "../FairList"
import * as authUtils from "../../utils/auth"

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

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

vi.mock("../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}))

// The source imports NotificationBell from "../components/NotificationBell"
// relative to FairList.tsx which lives in src/pages/, so the resolved path
// is src/components/NotificationBell. Vitest resolves module mocks by the
// specifier used in the source file, so we mock it at that path.
vi.mock("../../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
    onAuthStateChanged: vi.fn((cb: (u: any) => void) => {
      cb({ getIdToken: vi.fn().mockResolvedValue("mock-token") })
      return vi.fn()
    }),
  },
}))

const renderFairList = () =>
  render(
    <BrowserRouter>
      <FairList />
    </BrowserRouter>
  )

describe("FairList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()

    // Default: student user (no company controls)
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })
  })

  it("shows loading spinner initially", async () => {
    // Never-resolving promise keeps loading state true
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    renderFairList()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows fairs list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "f1",
            name: "Spring Fair",
            description: null,
            isLive: true,
            startTime: null,
            endTime: null,
          },
        ],
      }),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText("Spring Fair")).toBeInTheDocument()
    })
  })

  it("shows Live Now chip for live fair", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "f1",
            name: "Spring Fair",
            description: null,
            isLive: true,
            startTime: null,
            endTime: null,
          },
        ],
      }),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument()
    })
  })

  it("shows No career fairs available when list is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [] }),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText("No career fairs available")).toBeInTheDocument()
    })
  })

  it("shows error alert on fetch failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
    })
  })

  it("shows Join Fair button for company owner on non-enrolled fair", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    // First call: /api/fairs — returns fair list
    // Second call: /api/fairs/my-enrollments — returns empty enrollments
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "f1",
              name: "Spring Fair",
              description: null,
              isLive: false,
              startTime: null,
              endTime: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join fair/i })).toBeInTheDocument()
    })
  })

  it("opens join dialog when Join Fair is clicked", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fairs: [
            {
              id: "f1",
              name: "Spring Fair",
              description: null,
              isLive: false,
              startTime: null,
              endTime: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })

    renderFairList()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join fair/i }))

    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument()
  })
})
