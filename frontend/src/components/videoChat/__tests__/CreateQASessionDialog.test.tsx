import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateQASessionDialog } from "../CreateQASessionDialog";

describe("CreateQASessionDialog", () => {
  const onClose = vi.fn();
  const onCreateSession = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders fair name when provided", () => {
    render(
      <CreateQASessionDialog
        open
        fairId="fair-1"
        fairName="Spring Fair"
        onClose={onClose}
        onCreateSession={onCreateSession}
      />
    );
    expect(screen.getByText(/spring fair/i)).toBeInTheDocument();
  });

  it("shows error when fairId is missing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CreateQASessionDialog open onClose={onClose} onCreateSession={onCreateSession} />);

    await user.type(screen.getByLabelText(/session title/i), "My Session");
    await user.type(screen.getByLabelText(/scheduled time/i), "2026-06-15T14:00");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    expect(await screen.findByText(/fair id is missing/i)).toBeInTheDocument();
    expect(onCreateSession).not.toHaveBeenCalled();
  });

  it("shows error when title is empty", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CreateQASessionDialog open fairId="f1" onClose={onClose} onCreateSession={onCreateSession} />
    );

    await user.type(screen.getByLabelText(/scheduled time/i), "2026-06-15T14:00");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    expect(await screen.findByText(/please enter a session title/i)).toBeInTheDocument();
  });

  it("shows error when scheduled time is missing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CreateQASessionDialog open fairId="f1" onClose={onClose} onCreateSession={onCreateSession} />
    );

    await user.type(screen.getByLabelText(/session title/i), "Title");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    expect(await screen.findByText(/please select a scheduled time/i)).toBeInTheDocument();
  });

  it("shows error when duration is not positive", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CreateQASessionDialog open fairId="f1" onClose={onClose} onCreateSession={onCreateSession} />
    );

    await user.type(screen.getByLabelText(/session title/i), "Title");
    await user.type(screen.getByLabelText(/scheduled time/i), "2026-06-15T14:00");
    const dur = screen.getByLabelText(/max duration/i);
    await user.clear(dur);
    await user.type(dur, "0");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    expect(await screen.findByText(/duration must be a positive number/i)).toBeInTheDocument();
  });

  it("shows error when scheduled time is not in the future", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CreateQASessionDialog open fairId="f1" onClose={onClose} onCreateSession={onCreateSession} />
    );

    await user.type(screen.getByLabelText(/session title/i), "Title");
    await user.type(screen.getByLabelText(/scheduled time/i), "2026-05-01T10:00");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    expect(await screen.findByText(/scheduled time must be in the future/i)).toBeInTheDocument();
  });

  it("submits valid payload and closes on success", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CreateQASessionDialog open fairId="f1" onClose={onClose} onCreateSession={onCreateSession} />
    );

    await user.type(screen.getByLabelText(/session title/i), "Engineering Q&A");
    await user.type(screen.getByLabelText(/description/i), "Agenda");
    await user.type(screen.getByLabelText(/scheduled time/i), "2026-06-15T14:00");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    await vi.waitFor(() => expect(onCreateSession).toHaveBeenCalled());
    const arg = onCreateSession.mock.calls[0][0];
    expect(arg.fairId).toBe("f1");
    expect(arg.title).toBe("Engineering Q&A");
    expect(arg.description).toBe("Agenda");
    expect(arg.maxDuration).toBe(60);
    expect(arg.scheduledTime).toMatch(/2026-06-15/);
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces API errors", async () => {
    onCreateSession.mockRejectedValueOnce(new Error("Server down"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CreateQASessionDialog open fairId="f1" onClose={onClose} onCreateSession={onCreateSession} />
    );

    await user.type(screen.getByLabelText(/session title/i), "T");
    await user.type(screen.getByLabelText(/scheduled time/i), "2026-06-15T14:00");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    expect(await screen.findByText("Server down")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls cancel", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CreateQASessionDialog open fairId="f1" onClose={onClose} onCreateSession={onCreateSession} />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
