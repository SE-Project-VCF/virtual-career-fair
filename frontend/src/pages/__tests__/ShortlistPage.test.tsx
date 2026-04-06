import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShortlistPage from "../ShortlistPage";

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="base-layout">{children}</div>,
}));

vi.mock("../../components/videoChat", () => ({
  ShortlistManager: ({ onScheduleCall }: { onScheduleCall: (studentId: string) => void }) => (
    <button type="button" onClick={() => onScheduleCall("student-99")}>
      Schedule from shortlist
    </button>
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
});
