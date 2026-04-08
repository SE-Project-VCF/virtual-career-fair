import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import CompanyPublicProfile from "../CompanyPublicProfile"

vi.mock("../../config", () => ({ API_URL: "http://localhost:5000" }))
vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children?: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="layout">
      <span data-testid="page-title">{pageTitle}</span>
      {children}
    </div>
  ),
}))

describe("CompanyPublicProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it("loads company name and locations from public API", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        companyName: "Acme Inc",
        locations: [
          {
            id: "loc1",
            label: null,
            venueCity: "Austin",
            venueState: "TX",
            venueZip: "78701",
            venueCountry: null,
            venueGeo: null,
            createdAt: null,
            updatedAt: null,
          },
        ],
      }),
    })

    render(
      <MemoryRouter initialEntries={["/company/c1/public"]}>
        <Routes>
          <Route path="/company/:companyId/public" element={<CompanyPublicProfile />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getAllByText("Acme Inc").length).toBeGreaterThan(0))
    expect(screen.getByText(/Austin, TX 78701/)).toBeInTheDocument()
  })

  it("shows error when company not found", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Company not found" }),
    })

    render(
      <MemoryRouter initialEntries={["/company/missing/public"]}>
        <Routes>
          <Route path="/company/:companyId/public" element={<CompanyPublicProfile />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/Company not found/i)).toBeInTheDocument())
  })
})
