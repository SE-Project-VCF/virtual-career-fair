import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import JobInvitations from "../JobInvitations"
import { authUtils } from "../../utils/auth"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock("../../utils/auth", () => ({ authUtils: { getCurrentUser: vi.fn() } }))
vi.mock("../ProfileMenu", () => ({ default: () => <div data-testid="profile-menu" /> }))

const mockInvitation = {
  id: "inv-1",
  jobId: "job-1",
  companyId: "c1",
  studentId: "s1",
  sentBy: "rep-1",
  sentVia: "notification" as const,
  status: "sent" as const,
  sentAt: Date.now() - 60000,
  job: {
    id: "job-1",
    name: "Software Engineer",
    description: "Great job",
    majorsAssociated: "CS",
    applicationLink: "https://apply.com",
  },
  company: { id: "c1", companyName: "Tech Corp", boothId: "b1" },
  sender: { id: "rep-1", firstName: "Jane", lastName: "Doe", email: "jane@tech.com" },
}

const renderJobInvitations = () =>
  render(
    <BrowserRouter>
      <JobInvitations />
    </BrowserRouter>
  )

describe("JobInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it("shows error for non-student users", () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "u1", role: "companyOwner", email: "e@e.com" } as any)

    renderJobInvitations()

    expect(screen.getByText(/logged in as a student/i)).toBeInTheDocument()
  })

  it("shows loading while fetching", () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    renderJobInvitations()

    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("renders invitations for student user", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())
  })

  it("shows company name", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Tech Corp")).toBeInTheDocument())
  })

  it("shows New status chip for sent invitation", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("New")).toBeInTheDocument())
  })

  it("shows empty state when no invitations", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText(/No job invitations yet/i)).toBeInTheDocument())
  })

  it("shows error when fetch fails", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Unauthorized" }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText(/Unauthorized/i)).toBeInTheDocument())
  })

  it("clicking View Full Details navigates to booth", async () => {
    const user = userEvent.setup()
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    // Mock the PATCH call that handleViewJob triggers
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const viewButton = screen.getByRole("button", { name: /view full details/i })
    await user.click(viewButton)

    expect(mockNavigate).toHaveBeenCalledWith("/booth/b1")
  })
})
