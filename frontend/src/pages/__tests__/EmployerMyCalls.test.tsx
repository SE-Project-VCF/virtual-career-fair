import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmployerMyCalls } from "../EmployerMyCalls";
import * as callApi from "../../utils/callInvitationApi";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/callInvitationApi", () => ({
  getOutgoingCallInvitations: vi.fn(),
  cancelCallInvitation: vi.fn(),
}));

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="layout" data-title={pageTitle}>
      {children}
    </div>
  ),
}));

vi.mock("../../components/videoChat/ScheduleCallDialog", () => ({
  ScheduleCallDialog: ({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) =>
    open ? (
      <div data-testid="schedule-dialog">
        <button type="button" onClick={() => { onSuccess(); onClose(); }}>
          Mock save
        </button>
      </div>
    ) : null,
}));

vi.mock("../../components/videoChat/CallInvitationCard", () => ({
  CallInvitationCard: ({
    invitation,
    onCancel,
    onJoin,
  }: {
    invitation: { id: string; status: string };
    onCancel: (id: string) => void;
    onJoin: (id: string) => void;
  }) => (
    <div data-testid={`card-${invitation.id}`}>
      <span>{invitation.status}</span>
      <button type="button" onClick={() => onCancel(invitation.id)}>
        Cancel
      </button>
      <button type="button" onClick={() => onJoin(invitation.id)}>
        Join
      </button>
    </div>
  ),
}));

const invitation = {
  id: "inv-1",
  employerId: "e1",
  employerName: "Employer",
  studentId: "s1",
  studentName: "Student",
  scheduledTime: Date.now(),
  duration: 30,
  jitsiRoom: "room",
  status: "pending" as const,
  createdAt: Date.now(),
};

describe("EmployerMyCalls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    (callApi.getOutgoingCallInvitations as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [],
    });
    (callApi.cancelCallInvitation as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  it("shows empty state when no invitations", async () => {
    render(<EmployerMyCalls />);
    expect(await screen.findByText(/no calls scheduled yet/i)).toBeInTheDocument();
  });

  it("shows error when load fails", async () => {
    (callApi.getOutgoingCallInvitations as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Load failed",
    });

    render(<EmployerMyCalls />);

    expect(await screen.findByText("Load failed")).toBeInTheDocument();
  });

  it("lists invitations in tabs", async () => {
    (callApi.getOutgoingCallInvitations as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [
        invitation,
        { ...invitation, id: "inv-2", status: "accepted" as const },
      ],
    });

    render(<EmployerMyCalls />);

    await waitFor(() => expect(screen.getByTestId("card-inv-1")).toBeInTheDocument());
    expect(screen.getByText(/pending \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/accepted \(1\)/i)).toBeInTheDocument();
  });

  it("navigates on join", async () => {
    (callApi.getOutgoingCallInvitations as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [invitation],
    });

    const user = userEvent.setup();
    render(<EmployerMyCalls />);

    await waitFor(() => expect(screen.getByTestId("card-inv-1")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: /join/i })[0]);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/1x1-call/inv-1");
  });

  it("cancels invitation and refreshes", async () => {
    (callApi.getOutgoingCallInvitations as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [invitation],
    });

    const user = userEvent.setup();
    render(<EmployerMyCalls />);

    await waitFor(() => expect(screen.getByTestId("card-inv-1")).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: /cancel/i })[0]);

    await waitFor(() => {
      expect(callApi.cancelCallInvitation).toHaveBeenCalledWith("inv-1");
    });
    expect(callApi.getOutgoingCallInvitations).toHaveBeenCalled();
  });

  it("opens schedule dialog", async () => {
    const user = userEvent.setup();
    render(<EmployerMyCalls />);

    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /schedule call/i }));
    expect(screen.getByTestId("schedule-dialog")).toBeInTheDocument();
  });
});
