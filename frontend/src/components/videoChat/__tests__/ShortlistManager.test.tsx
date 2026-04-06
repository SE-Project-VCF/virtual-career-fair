import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortlistManager } from "../ShortlistManager";
import * as authUtils from "../../../utils/auth";

vi.mock("../../../utils/auth", () => ({
  authUtils: {
    getIdToken: vi.fn(),
  },
}));

vi.mock("../UserSearchSelector", () => ({
  UserSearchSelector: ({
    value,
    onChange,
    disabled,
  }: {
    value: { id: string; firstName: string; lastName: string; email: string } | null;
    onChange: (v: unknown) => void;
    disabled?: boolean;
  }) => (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ id: "stu-1", firstName: "Sam", lastName: "S", email: "sam@test.com" })}
      >
        Pick student
      </button>
      <span data-testid="selected">{value?.email ?? "none"}</span>
    </div>
  ),
}));

describe("ShortlistManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValue("tok");
    globalThis.fetch = vi.fn();
  });

  it("loads and shows empty shortlist", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ shortlist: [] }),
    });

    render(<ShortlistManager />);

    expect(await screen.findByText(/no candidates in shortlist/i)).toBeInTheDocument();
  });

  it("shows error when list fetch fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    render(<ShortlistManager />);

    expect(await screen.findByText(/authentication failed/i)).toBeInTheDocument();
  });

  it("removes student from shortlist", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shortlist: [
            {
              studentId: "stu-1",
              studentName: "Sam",
              studentEmail: "sam@test.com",
              notes: "",
              addedAt: 1,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const user = userEvent.setup();
    render(<ShortlistManager />);

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    const row = screen.getByText("Sam").closest("li");
    const deleteBtn = row?.querySelector(".MuiIconButton-colorError");
    expect(deleteBtn).toBeTruthy();
    await user.click(deleteBtn!);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/shortlist/stu-1", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("adds student via dialog", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ shortlist: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shortlist: [
            {
              studentId: "stu-1",
              studentName: "Sam S",
              studentEmail: "sam@test.com",
              notes: "note",
              addedAt: 1,
            },
          ],
        }),
      });

    const user = userEvent.setup();
    render(<ShortlistManager />);

    await waitFor(() => expect(screen.getByRole("button", { name: /add candidate/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /add candidate/i }));
    await user.click(screen.getByRole("button", { name: /pick student/i }));

    await user.type(screen.getByLabelText(/notes/i), "My note");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/shortlist/add",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("stu-1"),
        })
      );
    });
  });

  it("keeps dialog Add disabled until a student is selected", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ shortlist: [] }),
    });

    const user = userEvent.setup();
    render(<ShortlistManager />);

    await waitFor(() => expect(screen.getByRole("button", { name: /add candidate/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /add candidate/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /^add$/i })).toBeDisabled();
  });

  it("calls onScheduleCall when provided", async () => {
    const onSchedule = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        shortlist: [
          {
            studentId: "stu-1",
            studentName: "Sam",
            studentEmail: "sam@test.com",
            notes: "",
            addedAt: 1,
          },
        ],
      }),
    });

    const user = userEvent.setup();
    render(<ShortlistManager onScheduleCall={onSchedule} />);

    await waitFor(() => expect(screen.getByTitle(/schedule call/i)).toBeInTheDocument());
    await user.click(screen.getByTitle(/schedule call/i));

    expect(onSchedule).toHaveBeenCalledWith("stu-1", "Sam");
  });
});
