import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShortlistPage from "../ShortlistPage";

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="base-layout">{children}</div>,
}));

vi.mock("../../components/StudentProfileCard", () => ({
  default: ({ studentId }: { studentId: string }) => (
    <div data-testid="student-profile-card">{studentId}</div>
  ),
}));

vi.mock("../../components/videoChat", () => ({
  ShortlistManager: ({
    onScheduleCall,
    onViewStudent,
  }: {
    onScheduleCall: (studentId: string) => void;
    onViewStudent?: (studentId: string) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onScheduleCall("student-99")}>
        Schedule from shortlist
      </button>
      {onViewStudent ? (
        <button type="button" onClick={() => onViewStudent("student-88")}>
          View shortlist student
        </button>
      ) : null}
    </div>
  ),
  ScheduleCallDialog: ({
    open,
    onClose,
    studentId,
  }: {
    open: boolean;
    onClose: () => void;
    studentId: string;
  }) =>
    open ? (
      <div data-testid="schedule-dialog">
        <span data-testid="dialog-student-id">{studentId}</span>
        <button type="button" onClick={onClose}>
          Close schedule dialog
        </button>
      </div>
    ) : null,
}));

describe("ShortlistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and shortlist manager", () => {
    render(<ShortlistPage />);

    expect(screen.getByTestId("base-layout")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Candidate Shortlist/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Manage your candidate shortlist and schedule 1v1 video calls with interested students/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Schedule from shortlist/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View shortlist student/i })).toBeInTheDocument();
  });

  it("opens ScheduleCallDialog with student id when shortlist schedules a call", async () => {
    const user = userEvent.setup();
    render(<ShortlistPage />);

    expect(screen.queryByTestId("schedule-dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Schedule from shortlist/i }));

    expect(screen.getByTestId("schedule-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-student-id")).toHaveTextContent("student-99");
  });

  it("closes dialog and clears selection", async () => {
    const user = userEvent.setup();
    render(<ShortlistPage />);

    await user.click(screen.getByRole("button", { name: /Schedule from shortlist/i }));
    expect(screen.getByTestId("schedule-dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Close schedule dialog/i }));

    expect(screen.queryByTestId("schedule-dialog")).not.toBeInTheDocument();
  });

  it("opens student profile dialog when shortlist requests view", async () => {
    const user = userEvent.setup();
    render(<ShortlistPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /View shortlist student/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Student Profile")).toBeInTheDocument();
    expect(within(dialog).getByTestId("student-profile-card")).toHaveTextContent("student-88");
  });

  it("closes profile dialog via Close action", async () => {
    const user = userEvent.setup();
    render(<ShortlistPage />);

    await user.click(screen.getByRole("button", { name: /View shortlist student/i }));
    await screen.findByTestId("student-profile-card");

    await user.click(screen.getByRole("button", { name: /^Close$/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("student-profile-card")).not.toBeInTheDocument();
    });
  });
});
