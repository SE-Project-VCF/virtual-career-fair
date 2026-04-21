/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairAdminDashboard from "../FairAdminDashboard"
import * as authUtils from "../../utils/auth"
import { useFair } from "../../contexts/FairContext"

const mockNavigate = vi.fn()
const mockSetFair = vi.fn()

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
  FairProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => ({
    options: [
      {
        id: "hub-raleigh",
        label: "Raleigh, NC, USA",
        lat: 35.7796,
        lng: -78.6382,
        city: "Raleigh",
        state: "NC",
        zip: "27601",
      },
    ],
    loading: false,
  }),
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
    </BrowserRouter>,
  )

function clickChipDeleteInDialog(dialog: HTMLElement, chipAccessibleName: RegExp) {
  const chip = within(dialog).getByRole("button", { name: chipAccessibleName })
  const icon = chip.querySelector(".MuiChip-deleteIcon")
  if (!icon) throw new Error("MUI Chip delete icon not found")
  fireEvent.click(icon)
}

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

/** Minimal Response shape used by app code (ok + json); satisfies `typeof fetch` for tests. */
function mockFetchResponse(data: {
  ok: boolean
  status?: number
  json: () => Promise<unknown>
}): Promise<Response> {
  return Promise.resolve(data as unknown as Response)
}

/** FairAdminDashboard fires enrollments + announcements GETs in parallel on mount; mockResolvedValueOnce order is nondeterministic. */
function stubFairAdminDashboardFetch(opts: {
  putResponse?: { ok: boolean; status: number; json: () => Promise<unknown> }
  getFairAfterPut?: Record<string, unknown>
}) {
  const fairId = "f1"
  const impl: typeof fetch = (input, init) => {
    const u = requestUrlString(input)
    const method = init?.method ?? "GET"

    if (u.includes(`/api/fairs/${fairId}/enrollments`) && method === "GET") {
      return mockFetchResponse({ ok: true, json: async () => ({ enrollments: [] }) })
    }
    if (u.includes(`/api/fairs/${fairId}/announcements`) && method === "GET") {
      return mockFetchResponse({ ok: true, json: async () => ({ announcements: [] }) })
    }

    const isFairPut =
      method === "PUT" &&
      u.includes(`/api/fairs/${fairId}`) &&
      !u.includes("/enrollments") &&
      !u.includes("/announcements") &&
      !u.includes("/toggle") &&
      !u.includes("/refresh") &&
      !u.includes("/enroll")

    if (isFairPut && opts.putResponse) {
      return mockFetchResponse(opts.putResponse)
    }
    if (isFairPut && !opts.putResponse) {
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    }

    const isFairGet =
      method === "GET" &&
      u.includes(`/api/fairs/${fairId}`) &&
      !u.includes("/enrollments") &&
      !u.includes("/announcements")

    if (isFairGet && opts.getFairAfterPut) {
      return mockFetchResponse({ ok: true, json: async () => opts.getFairAfterPut })
    }
    if (isFairGet) {
      return mockFetchResponse({ ok: true, json: async () => ({}) })
    }

    return mockFetchResponse({ ok: true, json: async () => ({}) })
  }
  return vi.fn(impl)
}

describe("FairAdminDashboard — venue hub / edit save", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockSetFair.mockClear()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      role: "administrator",
    })

    vi.mocked(useFair).mockReturnValue({
      setFair: mockSetFair,
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: "Desc",
        isLive: false,
        startTime: 1700000000000,
        endTime: 1700100000000,
        inviteCode: "ABC123",
        venueCity: "Charlotte",
        venueState: "NC",
        venueZip: "28202",
        venueCountry: "US",
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })
  })

  it("shows Fair Location in details when venue fields exist", async () => {
    renderFairAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText("Fair Location")).toBeInTheDocument()
      expect(screen.getByText(/Charlotte.*NC.*28202|Charlotte, NC 28202/)).toBeInTheDocument()
    })
  })

  it("shows current location chip in edit dialog from saved hub", async () => {
    const user = userEvent.setup()
    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))

    await waitFor(() => {
      expect(screen.getByText("Current location")).toBeInTheDocument()
      expect(screen.getByText(/Charlotte.*NC.*28202.*·.*US|28202 · US/)).toBeInTheDocument()
    })
  })

  it("PUT clears venue when saved hub chip is removed and save is clicked", async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "f1",
          name: "Spring Fair",
          inviteCode: "ABC123",
        }),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))

    await waitFor(() => expect(screen.getByText("Current location")).toBeInTheDocument())

    const dlg = screen.getByRole("dialog", { name: /edit fair details/i })
    clickChipDeleteInDialog(dlg, /Charlotte, NC 28202 · US/)

    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => {
      const putCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/api/fairs/f1") && c[1]?.method === "PUT",
      )
      expect(putCall).toBeDefined()
      const body = JSON.parse((putCall![1] as RequestInit).body as string)
      expect(body.venueCity).toBe("")
      expect(body.venueState).toBe("")
      expect(body.venueZip).toBe("")
    })
  })

  it("PUT sends venue fields when a new hub suggestion is picked", async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "f1", name: "Spring Fair" }),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))

    const combo = screen.getByLabelText(/search places/i)
    await user.click(combo)
    await user.type(combo, "Ral")
    const opt = await screen.findByRole("option", { name: /Raleigh, NC, USA/i })
    await user.click(opt)

    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => {
      const putCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/api/fairs/f1") && c[1]?.method === "PUT",
      )
      expect(putCall).toBeDefined()
      const body = JSON.parse((putCall![1] as RequestInit).body as string)
      expect(body.venueCity).toBe("Raleigh")
      expect(body.venueState).toBe("NC")
      expect(body.venueZip).toBe("27601")
    })
  })

  it("PUT sends venueGeocodeQuery when user types in search without picking", async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enrollments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "f1", name: "Spring Fair" }),
      })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))

    const dlg = screen.getByRole("dialog", { name: /edit fair details/i })
    clickChipDeleteInDialog(dlg, /Charlotte, NC 28202 · US/)

    const combo = screen.getByLabelText(/search places/i)
    await user.type(combo, "Durham NC downtown")

    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => {
      const putCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/api/fairs/f1") && c[1]?.method === "PUT",
      )
      expect(putCall).toBeDefined()
      const body = JSON.parse((putCall![1] as RequestInit).body as string)
      expect(body.venueGeocodeQuery).toBe("Durham NC downtown")
    })
  })

  it("shows API error status when PUT fails and response body is not JSON", async () => {
    const user = userEvent.setup()
    globalThis.fetch = stubFairAdminDashboardFetch({
      putResponse: {
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("bad json")
        },
      },
    })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => {
      expect(screen.getByText("API error: 502")).toBeInTheDocument()
    })
  })

  it("updates fair from GET after successful PUT when refresh returns fair JSON", async () => {
    const user = userEvent.setup()
    const refreshedFair = {
      id: "f1",
      name: "Updated Name",
      inviteCode: "ABC123",
      venueCity: "Raleigh",
    }
    globalThis.fetch = stubFairAdminDashboardFetch({ getFairAfterPut: refreshedFair })

    renderFairAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /edit/i }))
    await user.clear(screen.getByLabelText(/Fair Name/i))
    await user.type(screen.getByLabelText(/Fair Name/i), "Updated Name")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => {
      expect(mockSetFair).toHaveBeenCalledWith(refreshedFair)
    })
  })
})
