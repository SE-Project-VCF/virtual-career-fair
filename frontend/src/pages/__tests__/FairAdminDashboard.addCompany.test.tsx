/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAdminDashboard from "../FairAdminDashboard"
import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => vi.fn() }
})
vi.mock("../../utils/auth", () => ({
  authUtils: { getCurrentUser: vi.fn() },
}))
vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
  FairProvider: ({ children }: any) => <>{children}</>,
}))
vi.mock("../ProfileMenu", () => ({ default: () => <div data-testid="profile-menu" /> }))
vi.mock("../../config", () => ({ API_URL: "http://localhost:5000" }))
vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => ({ options: [], loading: false }),
}))
vi.mock("../../firebase", () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") } },
}))

const renderDashboard = () =>
  render(<BrowserRouter><FairAdminDashboard /></BrowserRouter>)

function fairContextValue() {
  return {
    setFair: vi.fn(),
    loading: false,
    fair: { id: "f1", name: "Spring Fair", adminId: "admin-1", isLive: false, startTime: null, endTime: null },
    fairId: "f1",
    isLive: false,
  } as any
}

describe("FairAdminDashboard — Add Company search", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1", email: "admin@example.com", role: "administrator",
    })
    vi.mocked(useFair).mockReturnValue(fairContextValue())
  })

  function installFetch(searchResults: any[], onEnroll?: (body: any) => void) {
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
      const u = String(url)
      if (u.includes("/companies/search")) {
        return Promise.resolve({ ok: true, json: async () => ({ results: searchResults }) })
      }
      if (u.includes("/enroll") && init?.method === "POST") {
        if (onEnroll) onEnroll(JSON.parse(init.body))
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ boothIds: ["b1"] }) })
      }
      if (u.includes("/announcements")) {
        return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
    }) as any
  }

  it("queries the search endpoint after typing and renders options", async () => {
    installFetch([
      { companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: "Software", primaryLocation: "Austin, TX", alreadyEnrolled: false },
    ])
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole("button", { name: /add company/i }))
    const input = await screen.findByLabelText(/search company/i)
    await user.type(input, "acme")

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    })
    expect(
      (globalThis.fetch as any).mock.calls.some(([u]: [string]) =>
        String(u).includes("/companies/search") && String(u).includes("q=acme")
      )
    ).toBe(true)
  })

  it("disables already-enrolled options and shows label", async () => {
    installFetch([
      { companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: null, primaryLocation: null, alreadyEnrolled: true },
    ])
    const user = userEvent.setup()
    renderDashboard()
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "acme")

    const option = await screen.findByText("Acme Corp")
    expect(option.closest("li")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/already enrolled/i)).toBeInTheDocument()
  })

  it("posts the selected companyId to the enroll endpoint", async () => {
    let enrollBody: any = null
    installFetch(
      [{ companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: null, primaryLocation: null, alreadyEnrolled: false }],
      (body) => { enrollBody = body }
    )
    const user = userEvent.setup()
    renderDashboard()
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "acme")
    await user.click(await screen.findByText("Acme Corp"))
    await user.click(screen.getByRole("button", { name: /^add company$/i }))

    await waitFor(() => {
      expect(enrollBody).toEqual({ companyId: "c1" })
    })
  })

  it("shows search error message when the search request fails", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes("/companies/search")) {
        return Promise.resolve({ ok: false, json: async () => ({ error: "Search failed" }) })
      }
      if (u.includes("/announcements")) {
        return Promise.resolve({ ok: true, json: async () => ({ announcements: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ enrollments: [] }) })
    }) as any

    const user = userEvent.setup()
    renderDashboard()
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "xyz")

    await waitFor(() => {
      expect(screen.getByText(/search failed/i)).toBeInTheDocument()
    })
  })

  it("clears state when the dialog is cancelled", async () => {
    installFetch([
      { companyId: "c1", companyName: "Acme Corp", logoUrl: null, industry: null, primaryLocation: null, alreadyEnrolled: false },
    ])
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole("button", { name: /add company/i }))
    await user.type(await screen.findByLabelText(/search company/i), "acme")
    await screen.findByText("Acme Corp")

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    // Re-open — input should be empty
    await user.click(await screen.findByRole("button", { name: /add company/i }))
    expect(screen.getByLabelText(/search company/i)).toHaveValue("")
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument()
  })
})
