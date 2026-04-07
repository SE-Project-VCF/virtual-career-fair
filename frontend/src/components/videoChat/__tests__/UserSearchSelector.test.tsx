import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserSearchSelector, getUserSearchOptionLabel } from "../UserSearchSelector";
import type { UserSearchResult } from "../UserSearchSelector";
import * as auth from "../../../utils/auth";

vi.mock("../../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    getIdToken: vi.fn(),
  },
}));

describe("getUserSearchOptionLabel", () => {
  it("returns string option unchanged", () => {
    expect(getUserSearchOptionLabel("typed")).toBe("typed");
    expect(getUserSearchOptionLabel("")).toBe("");
  });

  it("returns name with email when email is set", () => {
    expect(
      getUserSearchOptionLabel({
        id: "1",
        firstName: "Ann",
        lastName: "Bee",
        email: "a@b.com",
      })
    ).toBe("Ann Bee (a@b.com)");
  });

  it("returns trimmed name only when email is empty", () => {
    expect(
      getUserSearchOptionLabel({
        id: "1",
        firstName: "Ann",
        lastName: "Bee",
        email: "",
      })
    ).toBe("Ann Bee");
  });

  it("trims leading and trailing whitespace on full name", () => {
    expect(
      getUserSearchOptionLabel({
        id: "1",
        firstName: "  X",
        lastName: "Y  ",
        email: "",
      })
    ).toBe("X Y");
  });

  it("returns empty string when names empty and no email", () => {
    expect(
      getUserSearchOptionLabel({
        id: "1",
        firstName: "",
        lastName: "",
        email: "",
      })
    ).toBe("");
  });
});

describe("UserSearchSelector Component", () => {
  const mockOnChange = vi.fn();
  const mockUser: UserSearchResult = {
    id: "user-1",
    firstName: "Alice",
    lastName: "Johnson",
    email: "alice@test.com",
    major: "Computer Science",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    vi.mocked(auth.authUtils.getCurrentUser).mockReturnValue({
      uid: "emp-1",
      email: "e@test.com",
    } as ReturnType<typeof auth.authUtils.getCurrentUser>);
    vi.mocked(auth.authUtils.getIdToken).mockResolvedValue("tok");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render search input field with default label", () => {
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByLabelText("Search User")).toBeInTheDocument();
  });

  it("should render with custom label", () => {
    render(<UserSearchSelector value={null} onChange={mockOnChange} label="Find Student" />);

    expect(screen.getByLabelText("Find Student")).toBeInTheDocument();
  });

  it("should render with custom placeholder", () => {
    render(
      <UserSearchSelector value={null} onChange={mockOnChange} placeholder="Type student name..." />
    );

    expect(screen.getByPlaceholderText("Type student name...")).toBeInTheDocument();
  });

  it("should render disabled state", () => {
    render(<UserSearchSelector value={null} onChange={mockOnChange} disabled />);

    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("should display selected user value using getOptionLabel with email", () => {
    render(<UserSearchSelector value={mockUser} onChange={mockOnChange} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toContain("Alice");
    expect(input.value).toContain("alice@test.com");
  });

  it("should handle value change", async () => {
    const user = userEvent.setup();
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ students: [mockUser] }),
    });

    const { rerender } = render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "Alice");

    rerender(<UserSearchSelector value={mockUser} onChange={mockOnChange} />);

    const updatedInput = screen.getByRole("combobox") as HTMLInputElement;
    expect(updatedInput.value).toContain("Alice");
  });

  it("should show error state", () => {
    render(
      <UserSearchSelector value={null} onChange={mockOnChange} error helperText="User search failed" />
    );

    expect(screen.getByText("User search failed")).toBeInTheDocument();
  });

  it("should clear value when onChange called with null", () => {
    const { rerender } = render(<UserSearchSelector value={mockUser} onChange={mockOnChange} />);

    rerender(<UserSearchSelector value={null} onChange={mockOnChange} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("should accept null value prop", () => {
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("should support component remount with different value", () => {
    const { unmount } = render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    unmount();

    render(<UserSearchSelector value={mockUser} onChange={mockOnChange} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toContain("Alice");
  });

  it("should apply fullWidth styling by default", () => {
    const { container } = render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    expect(container.querySelector(".MuiAutocomplete-root")).toBeInTheDocument();
  });

  it("should handle multiple rapid value changes", () => {
    const user2: UserSearchResult = {
      ...mockUser,
      id: "user-2",
      firstName: "Bob",
    };

    const { rerender } = render(<UserSearchSelector value={mockUser} onChange={mockOnChange} />);

    rerender(<UserSearchSelector value={user2} onChange={mockOnChange} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toContain("Bob");
  });

  it("should work with partial user data (no email in label)", () => {
    const partialUser: UserSearchResult = {
      id: "user-3",
      firstName: "Charlie",
      lastName: "",
      email: "",
    };

    render(<UserSearchSelector value={partialUser} onChange={mockOnChange} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toContain("Charlie");
  });

  it("does not fetch when no authenticated user", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(auth.authUtils.getCurrentUser).mockReturnValue(null);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "ab");
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  it("does not fetch when search text is empty after debounce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "x");
    await user.clear(screen.getByRole("combobox"));
    vi.advanceTimersByTime(400);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows loading indicator while fetch is in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveJson: (v: unknown) => void;
    const jsonPromise = new Promise((resolve) => {
      resolveJson = resolve;
    });

    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve({
        ok: true,
        json: () => jsonPromise,
      })
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "Jo");
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    await act(async () => {
      resolveJson!({ students: [] });
    });

    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
  });

  it("renders options with email, major chip, and body text", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [
          {
            id: "s1",
            firstName: "Dana",
            lastName: "Lee",
            email: "dana@test.com",
            major: "Biology",
          },
        ],
      }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "Da");
    vi.advanceTimersByTime(400);

    const option = await screen.findByRole("option", { name: /Dana Lee/i });
    expect(within(option).getByText("dana@test.com")).toBeInTheDocument();
    expect(within(option).getByText("Biology")).toBeInTheDocument();
    expect(option.querySelector(".MuiChip-root")).toBeTruthy();
  });

  it("renders option without email line when email is empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [
          {
            id: "s2",
            firstName: "Ed",
            lastName: "No",
            email: "",
            major: "",
          },
        ],
      }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "Ed");
    vi.advanceTimersByTime(400);

    const option = await screen.findByRole("option", { name: /Ed No/i });
    expect(within(option).queryByText(/@/)).not.toBeInTheDocument();
    expect(option.querySelector(".MuiChip-root")).toBeNull();
  });

  it("renders option without major chip when major is absent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [
          {
            id: "s3",
            firstName: "Flo",
            lastName: "Kay",
            email: "flo@test.com",
          },
        ],
      }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "Fl");
    vi.advanceTimersByTime(400);

    const option = await screen.findByRole("option", { name: /Flo Kay/i });
    expect(within(option).getByText("flo@test.com")).toBeInTheDocument();
    expect(option.querySelector(".MuiChip-root")).toBeNull();
  });

  it("returns no options when API response is not ok", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      statusText: "Bad",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "Zz");
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("returns no options when fetch throws", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network"));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "Zz");
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("maps null/undefined API fields to empty strings but still shows option when name is non-empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [{ id: "x", firstName: null, lastName: "Zed", email: null, major: null }],
      }),
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<UserSearchSelector value={null} onChange={mockOnChange} />);

    await user.type(screen.getByRole("combobox"), "Ze");
    vi.advanceTimersByTime(400);

    const option = await screen.findByRole("option", { name: /Zed/i });
    expect(within(option).queryByText(/@/)).not.toBeInTheDocument();
    expect(option.querySelector(".MuiChip-root")).toBeNull();
  });
});
