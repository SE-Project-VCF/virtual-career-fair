import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentSelector } from "../StudentSelector";
import * as auth from "../../../utils/auth";

vi.mock("../../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    getIdToken: vi.fn(),
  },
}));

describe("StudentSelector", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.authUtils.getCurrentUser).mockReturnValue({
      uid: "emp-1",
      email: "e@test.com",
    } as ReturnType<typeof auth.authUtils.getCurrentUser>);
    vi.mocked(auth.authUtils.getIdToken).mockResolvedValue("tok");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fetch when search has fewer than 2 characters", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<StudentSelector value={null} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/min 2 chars/i);
    await userEvent.type(input, "a");
    vi.advanceTimersByTime(400);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches after debounced search with auth headers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [
          {
            id: "s1",
            firstName: "Ann",
            lastName: "Bee",
            email: "ann@test.com",
            major: "CS",
          },
        ],
      }),
    });

    render(<StudentSelector value={null} onChange={onChange} />);

    await userEvent.type(screen.getByPlaceholderText(/min 2 chars/i), "An");
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/students?"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        })
      );
    });
  });

  it("returns no options when user is not authenticated", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(auth.authUtils.getCurrentUser).mockReturnValue(null);

    render(<StudentSelector value={null} onChange={onChange} />);

    await userEvent.type(screen.getByPlaceholderText(/min 2 chars/i), "Ab");
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  it("handles non-ok API response with empty options", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(<StudentSelector value={null} onChange={onChange} />);

    await userEvent.type(screen.getByPlaceholderText(/min 2 chars/i), "Ab");
    vi.advanceTimersByTime(400);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("handles fetch rejection and leaves options empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network"));

    render(<StudentSelector value={null} onChange={onChange} />);

    await userEvent.type(screen.getByPlaceholderText(/min 2 chars/i), "Ab");
    vi.advanceTimersByTime(400);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("maps null/undefined names from API to empty strings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [{ id: "x", firstName: null, lastName: undefined, email: "x@y.com" }],
      }),
    });

    render(<StudentSelector value={null} onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText(/min 2 chars/i), "xx");
    vi.advanceTimersByTime(400);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("shows custom helper text when error prop is set", () => {
    render(
      <StudentSelector value={null} onChange={onChange} error helperText="Pick someone" />
    );
    expect(screen.getByText("Pick someone")).toBeInTheDocument();
  });

  it("uses custom label", () => {
    render(<StudentSelector value={null} onChange={onChange} label="Student" />);
    expect(screen.getByLabelText("Student")).toBeInTheDocument();
  });

  it("selecting a student calls onChange with mapped student", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [
          { id: "s1", firstName: "John", lastName: "Doe", email: "j@d.com", major: "EE" },
        ],
      }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StudentSelector value={null} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/min 2 chars/i);
    await user.type(input, "Jo");
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("option", { name: /John Doe/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "s1",
        firstName: "John",
        lastName: "Doe",
        email: "j@d.com",
        major: "EE",
      })
    );
  });

  it("disables interaction when disabled", () => {
    render(<StudentSelector value={null} onChange={onChange} disabled />);
    const combo = screen.getByRole("combobox");
    expect(combo).toBeDisabled();
  });
});
