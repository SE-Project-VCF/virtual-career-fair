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
  FairProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => ({ options: [], loading: false }),
}))

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

function mockAnnouncementsOk() {
  return { ok: true, json: async () => ({ announcements: [] }) }
}

const renderPage = () =>
  render(
    <BrowserRouter>
      <FairAdminDashboard />
    </BrowserRouter>,
  )

describe("FairAdminDashboard — pending enrollment requests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })
    vi.mocked(useFair).mockReturnValue({
      setFair: vi.fn(),
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
  })

  it("lists pending requests and booth links", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/f1/announcements")) return Promise.resolve(mockAnnouncementsOk())
      if (u.includes("/f1/enrollment-requests") && u.endsWith("/enrollment-requests")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            requests: [
              {
                companyId: "co1",
                companyName: "Acme LLC",
                requestedBy: "u9",
                requestedByName: "Pat Jordan",
                booths: [{ id: "b1", boothName: "Engineering" }],
                message: "Please add us",
                createdAt: 1_700_000_000_000,
              },
            ],
          }),
        })
      }
      if (u.includes("/f1/enrollments")) {
        return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Pending enrollment requests \(1\)/i)).toBeInTheDocument()
    })
    expect(screen.getByText("Acme LLC")).toBeInTheDocument()
    expect(screen.getByText("Pat Jordan")).toBeInTheDocument()
    const boothLink = screen.getByRole("link", { name: /engineering/i })
    expect(boothLink).toHaveAttribute("href", "/fair/f1/booth/b1")
  })

  it("approves a request and reloads lists", async () => {
    const user = userEvent.setup()
    let pending = true

    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method || "GET"
      if (u.includes("/f1/announcements")) return Promise.resolve(mockAnnouncementsOk())
      if (method === "POST" && u.includes("/enrollment-requests/co1/approve")) {
        pending = false
        return Promise.resolve({ ok: true, json: async () => ({ success: true, boothIds: ["fb1"], fairId: "f1", companyId: "co1" }) })
      }
      if (u.includes("/f1/enrollment-requests") && u.endsWith("/enrollment-requests")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            requests: pending
              ? [
                  {
                    companyId: "co1",
                    companyName: "Acme",
                    requestedByName: "Alex",
                    message: null,
                    createdAt: null,
                  },
                ]
              : [],
          }),
        })
      }
      if (u.includes("/f1/enrollments")) {
        return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    renderPage()

    await waitFor(() => expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^approve$/i }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/fairs/f1/enrollment-requests/co1/approve"),
        expect.objectContaining({ method: "POST" }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText(/Enrollment approved/i)).toBeInTheDocument()
    })
  })

  it("rejects a request with optional reason", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method || "GET"
      if (u.includes("/f1/announcements")) return Promise.resolve(mockAnnouncementsOk())
      if (method === "POST" && u.includes("/enrollment-requests/co1/reject")) {
        expect(init?.body).toBe(JSON.stringify({ reason: "At capacity" }))
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
      }
      if (u.includes("/f1/enrollment-requests") && u.endsWith("/enrollment-requests")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            requests: [
              {
                companyId: "co1",
                companyName: "Acme",
                requestedByName: "Alex",
                message: null,
                createdAt: null,
              },
            ],
          }),
        })
      }
      if (u.includes("/f1/enrollments")) {
        return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    renderPage()

    await waitFor(() => expect(screen.getByRole("button", { name: /^reject$/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^reject$/i }))

    const reason = screen.getByLabelText(/reason/i)
    await user.type(reason, "At capacity")

    await user.click(screen.getByRole("button", { name: /reject request/i }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/fairs/f1/enrollment-requests/co1/reject"),
        expect.objectContaining({ method: "POST" }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText(/Request rejected/i)).toBeInTheDocument()
    })
  })

  it("shows enrollment method labels including approved request", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/f1/announcements")) return Promise.resolve(mockAnnouncementsOk())
      if (u.includes("/f1/enrollment-requests")) {
        return Promise.resolve({ ok: true, json: async () => ({ requests: [] }) })
      }
      if (u.includes("/f1/enrollments")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            enrollments: [
              {
                id: "cx",
                companyName: "Beta Co",
                enrollmentMethod: "adminApproval",
                enrolledAt: { seconds: 1_700_000_000 },
              },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    renderPage()

    await waitFor(() => expect(screen.getByText("Beta Co")).toBeInTheDocument())
    expect(screen.getByText("Approved request")).toBeInTheDocument()
  })

  it("treats failing enrollment-requests GET as no pending requests", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/f1/announcements")) return Promise.resolve(mockAnnouncementsOk())
      if (u.includes("/f1/enrollment-requests")) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "nope" }) })
      }
      if (u.includes("/f1/enrollments")) {
        return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Pending enrollment requests \(0\)/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/No pending requests/i)).toBeInTheDocument()
  })

  it("shows error when approve request fails", async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method || "GET"
      if (u.includes("/f1/announcements")) return Promise.resolve(mockAnnouncementsOk())
      if (method === "POST" && u.includes("/enrollment-requests/co1/approve")) {
        return Promise.resolve({ ok: false, json: async () => ({ error: "Cannot approve" }) })
      }
      if (u.includes("/f1/enrollment-requests") && u.endsWith("/enrollment-requests")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            requests: [
              {
                companyId: "co1",
                companyName: "Acme",
                requestedByName: "Alex",
                message: null,
                createdAt: null,
              },
            ],
          }),
        })
      }
      if (u.includes("/f1/enrollments")) {
        return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    renderPage()

    await waitFor(() => expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^approve$/i }))

    await waitFor(() => {
      expect(screen.getByText("Cannot approve")).toBeInTheDocument()
    })
  })
})
