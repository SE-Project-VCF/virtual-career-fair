/// <reference types="vitest/globals" />
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairList from "../FairList"
import * as authUtils from "../../utils/auth"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("../../utils/auth", () => ({
  authUtils: { getCurrentUser: vi.fn() },
}))

vi.mock("../ProfileMenu", () => ({
  default: () => <div data-testid="profile-menu" />,
}))

vi.mock("../../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
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

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
  MAPBOX_ACCESS_TOKEN: "",
  MAPBOX_TOKEN_LOOKS_PUBLIC: false,
}))

vi.mock("../../components/FairsMapView", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../components/FairsMapView")>()
  return { ...mod, default: () => <div data-testid="fairs-map-mock">FairsMapMock</div> }
})

vi.mock("../../firebase", () => ({
  auth: {
    currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") },
    onAuthStateChanged: vi.fn((cb: (u: unknown) => void) => {
      cb({ getIdToken: vi.fn().mockResolvedValue("mock-token") })
      return vi.fn()
    }),
  },
}))

vi.mock("../../hooks/useGeocodeSuggest", () => ({
  useGeocodeSuggest: () => ({
    options: [
      {
        id: "s1",
        label: "Boston, MA, USA",
        lat: 42.3601,
        lng: -71.0589,
      },
    ],
    loading: false,
  }),
}))

const renderFairList = () =>
  render(
    <BrowserRouter>
      <FairList />
    </BrowserRouter>,
  )

describe("FairList — geocode suggestion selection", () => {
  const fairRow = {
    id: "f1",
    name: "Spring Fair",
    description: null,
    isLive: false,
    startTime: null,
    endTime: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })
  })

  it("runs distance search when user picks a suggestion", async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [fairRow] }),
    })

    renderFairList()

    await waitFor(() => expect(screen.getByText("Spring Fair")).toBeInTheDocument())

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [fairRow] }),
    })

    const combo = screen.getByLabelText(/city, address, or zip/i)
    await user.click(combo)
    await user.type(combo, "Bos")

    const opt = await screen.findByRole("option", { name: /Boston, MA, USA/i })
    await user.click(opt)

    await waitFor(() => {
      const url = vi
        .mocked(globalThis.fetch)
        .mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : (c[0] as Request).url))
        .find((u) => u.includes("lat="))
      expect(url).toBeDefined()
      expect(url).toContain("lng=")
      expect(url).toContain("radiusMiles=")
    })

    await waitFor(() => {
      expect(screen.getByText(/showing results for/i)).toBeInTheDocument()
    })
  })
})
