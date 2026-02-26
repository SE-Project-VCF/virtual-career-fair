import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import FairBoothView from "../FairBoothView"
import { useFair } from "../../contexts/FairContext"
import { authUtils } from "../../utils/auth"

const mockNavigate = vi.fn()
const mockBoothId = { boothId: "booth-1" }

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => mockBoothId }
})
vi.mock("../../utils/auth", () => ({ authUtils: { getCurrentUser: vi.fn() } }))
vi.mock("../../contexts/FairContext", () => ({ useFair: vi.fn(), FairProvider: ({ children }: any) => <>{children}</> }))
vi.mock("../../config", () => ({ API_URL: "http://localhost:5000" }))
vi.mock("../ProfileMenu", () => ({ default: () => <div data-testid="profile-menu" /> }))
vi.mock("../../components/NotificationBell", () => ({ default: () => <div data-testid="notification-bell" /> }))
vi.mock("../../utils/boothHistory", () => ({ trackBoothView: vi.fn() }))
vi.mock("../../firebase", () => ({
  db: {},
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("mock-token") } },
}))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))

const renderFairBoothView = () =>
  render(
    <BrowserRouter>
      <FairBoothView />
    </BrowserRouter>
  )

describe("FairBoothView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
    vi.mocked(useFair).mockReturnValue({ fair: { name: "Spring Fair" }, loading: false, fairId: "fair-1", isLive: true } as any)
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "u1", role: "student", email: "s@test.com" } as any)
  })

  it("shows loading spinner while fairLoading is true", () => {
    vi.mocked(useFair).mockReturnValue({ loading: true, fair: null, fairId: null, isLive: false } as any)

    renderFairBoothView()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("renders booth details after successful fetch", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText("Tech Corp")).toBeInTheDocument())
  })

  it("shows error on 403 (fair not live)", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: 403, ok: false })
      .mockResolvedValueOnce({ status: 403, ok: false })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText(/not currently live/i)).toBeInTheDocument())
  })

  it("shows booth not found error on 404", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({ status: 404, ok: false })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText(/booth not found/i)).toBeInTheDocument())
  })

  it("shows jobs when they match the booth's companyId", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jobs: [
            {
              id: "j1",
              name: "Software Engineer",
              description: "Great role",
              majorsAssociated: "CS",
              applicationLink: null,
              companyId: "c1",
            },
          ],
        }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())
  })

  it("shows Message Representative button for student", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /message representative/i })).toBeInTheDocument()
    )
  })

  it("does not show Message Representative button for non-student", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "u1", role: "companyOwner", email: "o@test.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText("Tech Corp")).toBeInTheDocument())

    expect(screen.queryByRole("button", { name: /message representative/i })).not.toBeInTheDocument()
  })

  it("back button navigates to booths", async () => {
    const user = userEvent.setup()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Tech Corp",
          industry: "software",
          companySize: "51-200",
          location: "NYC",
          description: "A great company",
          contactName: "Jane",
          contactEmail: "jane@tech.com",
          companyId: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      })

    renderFairBoothView()

    await waitFor(() => expect(screen.getByText("Tech Corp")).toBeInTheDocument())

    const backButton = screen.getByRole("button", { name: /back to spring fair booths/i })
    await user.click(backButton)

    expect(mockNavigate).toHaveBeenCalledWith("/fair/fair-1/booths")
  })
})
