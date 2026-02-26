/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairLanding from "../FairLanding"
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

vi.mock("../../components/PageHeader", () => ({
  default: () => <div data-testid="page-header" />,
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

const renderFairLanding = () =>
  render(
    <BrowserRouter>
      <FairLanding />
    </BrowserRouter>
  )

describe("FairLanding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    globalThis.fetch = vi.fn()

    // Default: non-company student user
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "user-1",
      email: "student@example.com",
      role: "student",
    })
  })

  it("shows loading spinner while loading", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: true,
      fair: null,
      isLive: false,
      fairId: null,
    })

    renderFairLanding()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("shows not found alert when fair is null", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: null,
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText("Career fair not found")).toBeInTheDocument()
  })

  it("renders fair name and not live chip", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText("Spring Fair")).toBeInTheDocument()
    expect(screen.getByText("Not Live")).toBeInTheDocument()
  })

  it("renders Live Now chip when fair is live", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: true,
      },
      isLive: true,
      fairId: "f1",
    })

    renderFairLanding()

    expect(screen.getByText("Live Now")).toBeInTheDocument()
  })

  it("Browse Booths button is disabled when fair not live", () => {
    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    renderFairLanding()

    // When not live the button text is "Fair Not Live Yet"
    const browseButton = screen.getByRole("button", { name: /browse booths|fair not live/i })
    expect(browseButton).toBeDisabled()
  })

  it("shows Join This Fair button for company owner", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })
  })

  it("shows Leave Fair button when enrolled", async () => {
    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [{ fairId: "f1", boothId: "booth-1" }] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /leave fair/i })).toBeInTheDocument()
    })
  })

  it("opens join dialog when Join This Fair is clicked", async () => {
    const user = userEvent.setup()

    vi.mocked(authUtils.authUtils.getCurrentUser).mockReturnValue({
      uid: "owner-1",
      email: "owner@company.com",
      role: "companyOwner",
    })

    vi.mocked(useFair).mockReturnValue({
      loading: false,
      fair: {
        id: "f1",
        name: "Spring Fair",
        description: null,
        startTime: null,
        endTime: null,
        isLive: false,
      },
      isLive: false,
      fairId: "f1",
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollments: [] }),
    })

    renderFairLanding()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /join this fair/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /join this fair/i }))

    expect(screen.getByLabelText(/fair invite code/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^join fair$/i })).toBeInTheDocument()
  })
})
