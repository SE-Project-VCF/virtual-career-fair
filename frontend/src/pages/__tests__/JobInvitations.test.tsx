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
vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue("mock-token"),
  },
}))
vi.mock("../ProfileMenu", () => ({ default: () => <div data-testid="profile-menu" /> }))
vi.mock("../../components/NotificationBell", () => ({ default: () => <div data-testid="notification-bell" /> }))
vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: any) => (
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

vi.mock("../../components/JobApplicationFormDialog", () => ({
  default: ({ open, onClose, job }: { open: boolean; onClose: () => void; job: { name?: string } }) =>
    open ? (
      <div data-testid="apply-form-dialog">
        <span>Apply: {job?.name}</span>
        <button type="button" onClick={onClose}>
          Close apply dialog
        </button>
      </div>
    ) : null,
}))

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
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token")
    globalThis.fetch = vi.fn()
  })

  it("shows Not authenticated when getIdToken returns null", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    vi.mocked(authUtils.getIdToken).mockResolvedValue(null)

    renderJobInvitations()

    await waitFor(() => {
      expect(screen.getByText(/not authenticated/i)).toBeInTheDocument()
    })
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

  it("truncates job description longer than 200 characters", async () => {
    const longDesc = "x".repeat(250)
    const inv = {
      ...mockInvitation,
      job: { ...mockInvitation.job, description: longDesc },
    }

    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [inv] }),
    })

    renderJobInvitations()

    await waitFor(() => {
      const truncated = screen.getByText((_, el) =>
        Boolean(el?.textContent?.startsWith("x".repeat(200)) && el?.textContent?.endsWith("..."))
      );
      expect(truncated).toBeInTheDocument();
    })
  })

  it("does not show Required Skills when majorsAssociated is empty", async () => {
    const inv = {
      ...mockInvitation,
      job: { ...mockInvitation.job, majorsAssociated: "" },
    }

    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [inv] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    expect(screen.queryByText("Required Skills:")).not.toBeInTheDocument()
  })

  it("shows Representative when message exists but sender is null", async () => {
    const inv = {
      ...mockInvitation,
      message: "Join us!",
      sender: null as any,
    }

    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [inv] }),
    })

    renderJobInvitations()

    await waitFor(() => {
      expect(screen.getByText("Representative")).toBeInTheDocument()
      expect(screen.getByText(/Join us!/)).toBeInTheDocument()
    })
  })

  it("shows locale date when invitation was sent more than 7 days ago", async () => {
    const oldSent = new Date("2019-06-01T12:00:00.000Z").getTime()
    const expectedLabel = new Date(oldSent).toLocaleDateString()
    const oldInv = { ...mockInvitation, sentAt: oldSent }

    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [oldInv] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText(expectedLabel)).toBeInTheDocument())
  })

  it("navigates to tailor-simple when Tailor Resume is clicked", async () => {
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByRole("button", { name: /tailor resume/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /tailor resume/i }))

    expect(mockNavigate).toHaveBeenCalledWith("/invitations/inv-1/tailor-simple")
  })

  it("opens apply dialog for published application form and closes it", async () => {
    const invWithPublishedForm = {
      ...mockInvitation,
      company: { id: "c1", companyName: "Tech Corp", boothId: null },
      job: {
        ...mockInvitation.job,
        applicationLink: null,
        applicationForm: {
          title: "Company form",
          fields: [],
          status: "published" as const,
        },
      },
    }

    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [invWithPublishedForm] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByRole("button", { name: /apply now/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /apply now/i }))

    await waitFor(() => expect(screen.getByTestId("apply-form-dialog")).toBeInTheDocument())
    expect(screen.getByText(/Apply: Software Engineer/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /close apply dialog/i }))

    await waitFor(() => expect(screen.queryByTestId("apply-form-dialog")).not.toBeInTheDocument())
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

describe("JobInvitations — Apply Now button", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token")
    globalThis.fetch = vi.fn()
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
  })

  it("shows Apply Now button when applicationLink is present", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByRole("button", { name: /apply now/i })).toBeInTheDocument())
  })

  it("calls status PATCH and opens applicationLink when Apply Now is clicked", async () => {
    vi.spyOn(globalThis, "open").mockReturnValue(null)

    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByRole("button", { name: /apply now/i })).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /apply now/i }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/inv-1/status"),
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"clicked"'),
        })
      )
    })
  })

  it("logs when PATCH for clicked status fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation] }),
      })
      .mockRejectedValueOnce(new Error("patch failed"));

    const user = userEvent.setup();
    renderJobInvitations();

    await waitFor(() => expect(screen.getByRole("button", { name: /apply now/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /apply now/i }));

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("Error updating invitation status:", expect.any(Error));
    });

    consoleError.mockRestore();
  });

  it("does not PATCH clicked status when getIdToken returns null after load", async () => {
    vi.mocked(authUtils.getIdToken).mockResolvedValueOnce("mock-token").mockResolvedValueOnce(null)

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByRole("button", { name: /apply now/i })).toBeInTheDocument())

    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await user.click(screen.getByRole("button", { name: /apply now/i }))

    const patchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: any[]) => call[1]?.method === "PATCH"
    )
    expect(patchCalls).toHaveLength(0)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it("updates status chip to Applied after Apply Now", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("New")).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /apply now/i }))

    await waitFor(() => expect(screen.getByText("Applied")).toBeInTheDocument())
  })

  it("does not show Apply Now when applicationLink is null", async () => {
    const invNoLink = { ...mockInvitation, job: { ...mockInvitation.job, applicationLink: null } }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [invNoLink] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    expect(screen.queryByRole("button", { name: /apply now/i })).not.toBeInTheDocument()
  })
})

describe("JobInvitations — tab filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token")
    globalThis.fetch = vi.fn()
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
  })

  it("filters to only viewed invitations when Viewed tab is clicked", async () => {
    const sentInv = { ...mockInvitation, id: "inv-1", status: "sent" as const }
    const viewedInv = { ...mockInvitation, id: "inv-2", status: "viewed" as const, job: { ...mockInvitation.job, name: "Designer Role" } }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [sentInv, viewedInv] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    await user.click(screen.getByRole("tab", { name: /viewed/i }))

    await waitFor(() => {
      expect(screen.queryByText("Software Engineer")).not.toBeInTheDocument()
      expect(screen.getByText("Designer Role")).toBeInTheDocument()
    })
  })

  it("filters to only applied invitations when Applied tab is clicked", async () => {
    const sentInv = { ...mockInvitation, id: "inv-1", status: "sent" as const }
    const clickedInv = { ...mockInvitation, id: "inv-3", status: "clicked" as const, job: { ...mockInvitation.job, name: "PM Role" } }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [sentInv, clickedInv] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    await user.click(screen.getByRole("tab", { name: /applied/i }))

    await waitFor(() => {
      expect(screen.queryByText("Software Engineer")).not.toBeInTheDocument()
      expect(screen.getByText("PM Role")).toBeInTheDocument()
    })
  })

  it("shows empty state message with tab name when tab has no items", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    await user.click(screen.getByRole("tab", { name: /applied/i }))

    await waitFor(() => {
      expect(screen.getByText(/No clicked invitations/i)).toBeInTheDocument()
    })
  })

  it("shows all invitations when All tab is selected after filtering", async () => {
    const sentInv = { ...mockInvitation, id: "inv-1", status: "sent" as const }
    const viewedInv = { ...mockInvitation, id: "inv-2", status: "viewed" as const, job: { ...mockInvitation.job, name: "Designer Role" } }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [sentInv, viewedInv] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    await user.click(screen.getByRole("tab", { name: /viewed/i }))
    await user.click(screen.getByRole("tab", { name: /all/i }))

    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      expect(screen.getByText("Designer Role")).toBeInTheDocument()
    })
  })
})

describe("JobInvitations — handleViewJob error case", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token")
    globalThis.fetch = vi.fn()
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
  })

  it("shows error when booth ID is null on View Full Details click", async () => {
    const invNoBooth = {
      ...mockInvitation,
      company: { id: "c1", companyName: "Tech Corp", boothId: null },
    }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [invNoBooth] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /view full details/i }))

    await waitFor(() => {
      expect(screen.getByText(/This company doesn't have a booth set up yet/i)).toBeInTheDocument()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("marks invitation as viewed when status is sent and View Full Details is clicked", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: /view full details/i }))

    await waitFor(() => {
      const patchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: any[]) => call[1]?.method === "PATCH"
      )
      expect(patchCalls.length).toBeGreaterThan(0)
      expect(patchCalls[0][1].body).toContain('"viewed"')
    })
  })

  it("logs when PATCH for viewed status fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    ;(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation] }),
      })
      .mockRejectedValueOnce(new Error("network error"));

    const user = userEvent.setup();
    renderJobInvitations();

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /view full details/i }));

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("Error updating invitation status:", expect.any(Error));
    });

    consoleError.mockRestore();
  });

  it("does not send PATCH when getIdToken returns null after load", async () => {
    vi.mocked(authUtils.getIdToken).mockResolvedValueOnce("mock-token").mockResolvedValueOnce(null)

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    const callsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await user.click(screen.getByRole("button", { name: /view full details/i }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/booth/b1"))

    const patchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: any[]) => call[1]?.method === "PATCH"
    )
    expect(patchCalls).toHaveLength(0)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it("does not send PATCH when invitation status is already viewed", async () => {
    const viewedInvitation = { ...mockInvitation, status: "viewed" as const }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [viewedInvitation] }),
    })

    const user = userEvent.setup()
    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Software Engineer")).toBeInTheDocument())

    const fetchCallsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await user.click(screen.getByRole("button", { name: /view full details/i }))

    // Should navigate but not make an extra PATCH call
    expect(mockNavigate).toHaveBeenCalledWith("/booth/b1")
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBefore)
  })
})

describe("JobInvitations — misc rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authUtils.getIdToken).mockResolvedValue("mock-token")
    globalThis.fetch = vi.fn()
    vi.mocked(authUtils.getCurrentUser).mockReturnValue({ uid: "student-1", role: "student" as const, email: "s@s.com" } as any)
  })

  it("shows sender name in message block", async () => {
    const invWithMsg = { ...mockInvitation, message: "We think you'd be a great fit!" }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [invWithMsg] }),
    })

    renderJobInvitations()

    await waitFor(() => {
      expect(screen.getByText(/We think you'd be a great fit!/i)).toBeInTheDocument()
      expect(screen.getByText("Jane Doe")).toBeInTheDocument()
    })
  })

  it("shows Viewed chip for viewed invitation", async () => {
    const viewedInv = { ...mockInvitation, status: "viewed" as const }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [viewedInv] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Viewed")).toBeInTheDocument())
  })

  it("shows Applied chip for clicked invitation", async () => {
    const clickedInv = { ...mockInvitation, status: "clicked" as const }

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [clickedInv] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText("Applied")).toBeInTheDocument())
  })

  it("shows required skills section when majorsAssociated is present", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    renderJobInvitations()

    await waitFor(() => {
      expect(screen.getByText("Required Skills:")).toBeInTheDocument()
      expect(screen.getByText("CS")).toBeInTheDocument()
    })
  })

  it("shows new count badge in header when there are new invitations", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [mockInvitation] }),
    })

    renderJobInvitations()

    await waitFor(() => {
      expect(screen.getByText(/1 new/i)).toBeInTheDocument()
    })
  })

  it("renders inside the page layout wrapper", async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [] }),
    })

    renderJobInvitations()

    await waitFor(() => expect(screen.getByText(/No job invitations yet/i)).toBeInTheDocument())

    expect(screen.getByTestId("base-layout")).toBeInTheDocument()
  })
})
