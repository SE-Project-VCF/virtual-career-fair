import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import FairBooths from "../FairBooths"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("../../contexts/FairContext", () => ({
  useFair: vi.fn(),
}))

vi.mock("../../utils/auth", () => ({
  authUtils: { getCurrentUser: vi.fn(() => null) },
}))

vi.mock("../../firebase", () => ({
  auth: { currentUser: null },
}))

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { useFair } from "../../contexts/FairContext"
import type { Mock } from "vitest"

function renderFairBooths() {
  return render(
    <MemoryRouter>
      <FairBooths />
    </MemoryRouter>
  )
}

describe("FairBooths", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it("shows loading when fair context is still loading", () => {
    ;(useFair as Mock).mockReturnValue({
      fair: null,
      isLive: false,
      loading: true,
      fairId: "fair-1",
    })

    renderFairBooths()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("fetches and shows booth cards when fair is ready", async () => {
    ;(useFair as Mock).mockReturnValue({
      fair: { name: "Spring Fair" },
      isLive: true,
      loading: false,
      fairId: "fair-1",
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        booths: [
          {
            id: "b1",
            companyName: "Acme Co",
            boothName: "Engineering",
            industry: "software",
            companySize: "100-500",
            location: "Remote",
            description: "Great place",
            companyId: "c1",
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    renderFairBooths()

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument()
    })
    expect(screen.getByText("Acme Co")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
