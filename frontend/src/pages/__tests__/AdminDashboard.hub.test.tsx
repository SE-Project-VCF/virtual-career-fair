/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import AdminDashboard from "../AdminDashboard"
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
    isAuthenticated: vi.fn(),
  },
}))

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}))

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}))

vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => ({
    options: [
      {
        id: "hub-charlotte",
        label: "Charlotte, NC, USA",
        lat: 35.2271,
        lng: -80.8431,
        city: "Charlotte",
        state: "NC",
        zip: "28202",
      },
    ],
    loading: false,
  }),
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu">Profile Menu</div>,
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children?: ReactNode; pageTitle?: string }) => (
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

const renderAdminDashboard = () =>
  render(
    <BrowserRouter>
      <AdminDashboard />
    </BrowserRouter>,
  )

function clickChipDeleteInDialog(dialog: HTMLElement, chipAccessibleName: RegExp) {
  const chip = within(dialog).getByRole("button", { name: chipAccessibleName })
  const icon = chip.querySelector(".MuiChip-deleteIcon")
  if (!icon) throw new Error("MUI Chip delete icon not found")
  fireEvent.click(icon)
}

describe("AdminDashboard — create fair hub / geocode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "admin-1",
      role: "administrator",
      email: "admin@example.com",
    })
    vi.mocked(authUtils.authUtils.isAuthenticated).mockReturnValue(true)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [] }),
    })
  })

  it("includes venueCity, venueState, venueZip when a hub suggestion is picked", async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new-fair" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) })

    renderAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new fair/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new fair/i }))

    await user.type(screen.getByLabelText(/Fair Name/i), "Hub Fair")

    const combo = screen.getByLabelText(/search places/i)
    await user.click(combo)
    await user.type(combo, "Char")

    const opt = await screen.findByRole("option", { name: /Charlotte, NC, USA/i })
    await user.click(opt)

    await waitFor(() => {
      expect(screen.getByText("Location to add")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /^create$/i }))

    await waitFor(() => {
      const postCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].endsWith("/api/fairs") && c[1]?.method === "POST",
      )
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall![1] as RequestInit).body as string)
      expect(body.venueCity).toBe("Charlotte")
      expect(body.venueState).toBe("NC")
      expect(body.venueZip).toBe("28202")
    })
  })

  it("sends venueGeocodeQuery when user types a place query without picking a suggestion", async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new-fair" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ fairs: [] }) })

    renderAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new fair/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new fair/i }))

    await user.type(screen.getByLabelText(/Fair Name/i), "Query Fair")

    const combo = screen.getByLabelText(/search places/i)
    await user.type(combo, "Remote ZIP 90210")

    await user.click(screen.getByRole("button", { name: /^create$/i }))

    await waitFor(() => {
      const postCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].endsWith("/api/fairs") && c[1]?.method === "POST",
      )
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall![1] as RequestInit).body as string)
      expect(body.venueGeocodeQuery).toBe("Remote ZIP 90210")
      expect(body.venueCity).toBeUndefined()
    })
  })

  it("clears picked hub when chip delete is used", async () => {
    const user = userEvent.setup()
    renderAdminDashboard()

    await waitFor(() => expect(screen.getByRole("button", { name: /new fair/i })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /new fair/i }))

    const combo = screen.getByLabelText(/search places/i)
    await user.click(combo)
    await user.type(combo, "Char")
    const opt = await screen.findByRole("option", { name: /Charlotte, NC, USA/i })
    await user.click(opt)

    await waitFor(() => expect(screen.getByText(/Charlotte, NC, USA/i)).toBeInTheDocument())

    const dlg = screen.getByRole("dialog", { name: /create new fair/i })
    clickChipDeleteInDialog(dlg, /Charlotte, NC, USA/i)

    await waitFor(() => {
      expect(within(dlg).queryByRole("button", { name: /Charlotte, NC, USA/i })).not.toBeInTheDocument()
    })
  })
})
