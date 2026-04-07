import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleCallDialog } from "../ScheduleCallDialog";
import * as callApi from "../../../utils/callInvitationApi";

vi.mock("../../../utils/callInvitationApi", () => ({
  createCallInvitation: vi.fn(),
}));

vi.mock("../StudentSelector", () => ({
  StudentSelector: ({
    onChange,
    disabled,
  }: {
    onChange: (s: { id: string; firstName: string; lastName: string; email: string } | null) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange({ id: "stu-1", firstName: "Alex", lastName: "Lee", email: "a@test.com" })}
    >
      Pick student
    </button>
  ),
}));

describe("ScheduleCallDialog", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    vi.mocked(callApi.createCallInvitation).mockResolvedValue({ success: true, invitationId: "inv-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules with pre-selected student", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ScheduleCallDialog
        open
        studentId="stu-99"
        studentName="Jordan Smith"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText(/jordan/i)).toBeInTheDocument();

    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(timeField, "2026-06-15T15:00");

    await user.click(screen.getByRole("button", { name: /schedule call/i }));

    await vi.waitFor(() => expect(callApi.createCallInvitation).toHaveBeenCalled());
    expect(callApi.createCallInvitation).toHaveBeenCalledWith(
      "stu-99",
      expect.any(Date),
      30,
      ""
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("schedules after picking student from selector", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ScheduleCallDialog open onClose={onClose} onSuccess={onSuccess} />);

    await user.click(screen.getByRole("button", { name: /pick student/i }));
    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(timeField, "2026-06-15T15:00");
    await user.click(screen.getByRole("button", { name: /schedule call/i }));

    await vi.waitFor(() => expect(callApi.createCallInvitation).toHaveBeenCalledWith(
      "stu-1",
      expect.any(Date),
      30,
      ""
    ));
    expect(onSuccess).toHaveBeenCalled();
  });

  it("disables schedule when no student and time", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ScheduleCallDialog open onClose={onClose} onSuccess={onSuccess} />);

    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(timeField, "2026-06-15T15:00");
    const scheduleBtn = screen.getByRole("button", { name: /schedule call/i });
    expect(scheduleBtn).toBeDisabled();
  });

  it("enables schedule only after student and future time are set", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ScheduleCallDialog open onClose={onClose} onSuccess={onSuccess} />);

    expect(screen.getByRole("button", { name: /schedule call/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /pick student/i }));
    expect(screen.getByRole("button", { name: /schedule call/i })).toBeDisabled();

    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(timeField, "2026-06-15T15:00");
    expect(screen.getByRole("button", { name: /schedule call/i })).not.toBeDisabled();
  });

  it("shows error for invalid duration", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ScheduleCallDialog
        open
        studentId="s1"
        studentName="Pat"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(timeField, "2026-06-15T15:00");

    const dur = document.querySelector('input[type="number"]') as HTMLInputElement;
    await user.clear(dur);
    await user.type(dur, "500");
    await user.click(screen.getByRole("button", { name: /schedule call/i }));

    expect(await screen.findByText(/duration must be between 1 and 480/i)).toBeInTheDocument();
  });

  it("shows error when time is in the past", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ScheduleCallDialog
        open
        studentId="s1"
        studentName="Pat"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.clear(timeField);
    await user.type(timeField, "2026-05-01T10:00");
    await user.click(screen.getByRole("button", { name: /schedule call/i }));

    expect(await screen.findByText(/future date and time/i)).toBeInTheDocument();
  });

  it("shows API error when createCallInvitation fails", async () => {
    vi.mocked(callApi.createCallInvitation).mockResolvedValue({ success: false, error: "Quota exceeded" });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ScheduleCallDialog
        open
        studentId="s1"
        studentName="Pat"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(timeField, "2026-06-15T15:00");
    await user.click(screen.getByRole("button", { name: /schedule call/i }));

    expect(await screen.findByText("Quota exceeded")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles thrown errors from createCallInvitation", async () => {
    vi.mocked(callApi.createCallInvitation).mockRejectedValue(new Error("network"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ScheduleCallDialog
        open
        studentId="s1"
        studentName="Pat"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const timeField = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(timeField, "2026-06-15T15:00");
    await user.click(screen.getByRole("button", { name: /schedule call/i }));

    expect(await screen.findByText("network")).toBeInTheDocument();
  });
});
