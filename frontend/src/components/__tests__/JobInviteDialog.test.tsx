import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import JobInviteDialog from "../JobInviteDialog";
import { authUtils } from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

globalThis.fetch = vi.fn();

const mockStudents = [
  { id: "s1", firstName: "Alice", lastName: "Smith", email: "alice@example.com", major: "Computer Science" },
  { id: "s2", firstName: "Bob", lastName: "Jones", email: "bob@example.com", major: "Software Engineering" },
  { id: "s3", firstName: "Carol", lastName: "White", email: "carol@example.com", major: "Data Science" },
];

const mockUser = { uid: "user-1", email: "employer@example.com" };

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  jobId: "job-1",
  jobTitle: "Software Engineer",
};

/** Click the ListItemButton for a student by matching their full name */
async function clickStudent(user: ReturnType<typeof userEvent.setup>, name: string) {
  const listItem = screen.getByText(name).closest("li")!;
  const btn = within(listItem).getByRole("button");
  await user.click(btn);
}

describe("JobInviteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.getCurrentUser as any).mockReturnValue(mockUser);
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ students: mockStudents }),
    });
  });

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it("does not fetch when dialog is closed", () => {
    render(<JobInviteDialog {...defaultProps} open={false} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("renders dialog title and job title", async () => {
    render(<JobInviteDialog {...defaultProps} />);
    expect(screen.getByText("Invite Students to Apply")).toBeInTheDocument();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("renders message textarea and search field after loading", async () => {
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    expect(screen.getByLabelText(/Personal Message/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search by name/i)).toBeInTheDocument();
  });

  it("shows loading spinner while fetching students", () => {
    (globalThis.fetch as any).mockReturnValue(new Promise(() => {}));
    render(<JobInviteDialog {...defaultProps} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows student list after loading", async () => {
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
      expect(screen.getByText("Carol White")).toBeInTheDocument();
    });
  });

  it("shows 'No students found' when list is empty", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ students: [] }),
    });
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("No students found")).toBeInTheDocument());
  });

  // -----------------------------------------------------------------------
  // Fetch behaviour
  // -----------------------------------------------------------------------

  it("fetches students with userId param", async () => {
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("userId=user-1"),
        expect.any(Object)
      )
    );
  });

  it("appends boothId param when provided", async () => {
    render(<JobInviteDialog {...defaultProps} boothId="booth-42" />);
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("boothId=booth-42"),
        expect.any(Object)
      )
    );
  });

  it("shows booth-specific info alert when boothId is provided", async () => {
    render(<JobInviteDialog {...defaultProps} boothId="booth-42" />);
    await waitFor(() =>
      expect(screen.getByText(/who visited your booth/i)).toBeInTheDocument()
    );
  });

  it("shows generic info alert when boothId is absent", async () => {
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() =>
      expect(screen.getByText(/students' dashboards as notifications/i)).toBeInTheDocument()
    );
  });

  it("does not call fetch when user is not authenticated", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue(null);
    render(<JobInviteDialog {...defaultProps} />);
    // Give time for any async effects to settle
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows error when fetch fails", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
  });

  it("resets state each time dialog opens", async () => {
    const { rerender } = render(<JobInviteDialog {...defaultProps} open={false} />);
    rerender(<JobInviteDialog {...defaultProps} open={true} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  });

  // -----------------------------------------------------------------------
  // Search / filter
  // -----------------------------------------------------------------------

  it("filters students by name", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Search by name/i), "alice");

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    });
  });

  it("filters students by email", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Bob Jones")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Search by name/i), "bob@example");

    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
      expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
    });
  });

  it("filters students by major", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Carol White")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Search by name/i), "Data Science");

    await waitFor(() => {
      expect(screen.getByText("Carol White")).toBeInTheDocument();
      expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
    });
  });

  it("shows 'No students match your search' when search yields nothing", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Search by name/i), "zzznomatch");

    await waitFor(() =>
      expect(screen.getByText("No students match your search")).toBeInTheDocument()
    );
  });

  it("clears search when clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Search by name/i), "alice");
    await waitFor(() => expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument());

    // ClearIcon button appears only when search has text; it's the last icon button
    const iconBtns = screen.getAllByRole("button");
    const clearBtn = iconBtns.find((b) => b.querySelector('[data-testid="ClearIcon"]'));
    expect(clearBtn).toBeTruthy();
    await user.click(clearBtn!);

    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
      expect(screen.getByText("Carol White")).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Student selection
  // -----------------------------------------------------------------------

  it("toggles individual student selection", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await clickStudent(user, "Alice Smith");
    await waitFor(() => expect(screen.getByText(/1 selected/)).toBeInTheDocument());

    await clickStudent(user, "Alice Smith");
    await waitFor(() => expect(screen.getByText(/0 selected/)).toBeInTheDocument());
  });

  it("selects all students with Select All button", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Select All/i }));

    await waitFor(() =>
      expect(screen.getByText(`${mockStudents.length} selected`)).toBeInTheDocument()
    );
  });

  it("deselects all when Select All is clicked while all are selected", async () => {
    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Select All/i }));
    await waitFor(() =>
      expect(screen.getByText(`${mockStudents.length} selected`)).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /Deselect All/i }));
    await waitFor(() => expect(screen.getByText(/0 selected/)).toBeInTheDocument());
  });

  it("Select All button is not visible when there are no students", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ students: [] }),
    });
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("No students found")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Select All/i })).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Send button / validation
  // -----------------------------------------------------------------------

  it("Send button is disabled when no students are selected", async () => {
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    const sendBtn = screen.getByRole("button", { name: /^Send$/ });
    expect(sendBtn).toBeDisabled();
  });

  it("sends invitations when students are selected and Send is clicked", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: mockStudents }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sent: 1 }) });

    render(<JobInviteDialog {...defaultProps} onClose={onClose} onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await clickStudent(user, "Alice Smith");
    await waitFor(() => expect(screen.getByText(/1 selected/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Send \(1\)/i }));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/job-invitations/send",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"jobId":"job-1"'),
        })
      )
    );
  });

  it("shows success state after sending", async () => {
    const user = userEvent.setup();

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: mockStudents }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sent: 1 }) });

    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await clickStudent(user, "Alice Smith");
    await user.click(screen.getByRole("button", { name: /Send \(1\)/i }));

    await waitFor(() =>
      expect(screen.getByText(/Successfully sent 1 invitation/i)).toBeInTheDocument()
    );
  });

  it("shows plural in success message for multiple invitations", async () => {
    const user = userEvent.setup();

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: mockStudents }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sent: 3 }) });

    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Select All/i }));
    await user.click(screen.getByRole("button", { name: /Send \(3\)/i }));

    await waitFor(() =>
      expect(screen.getByText(/Successfully sent 3 invitations/i)).toBeInTheDocument()
    );
  });

  it("shows error when send request fails", async () => {
    const user = userEvent.setup();

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: mockStudents }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Invite failed" }) });

    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await clickStudent(user, "Alice Smith");
    await user.click(screen.getByRole("button", { name: /Send \(1\)/i }));

    await waitFor(() => expect(screen.getByText("Invite failed")).toBeInTheDocument());
  });

  it("includes optional message in send payload when provided", async () => {
    const user = userEvent.setup();

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: mockStudents }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sent: 1 }) });

    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.type(screen.getByLabelText(/Personal Message/i), "Hello there!");
    await clickStudent(user, "Alice Smith");
    await user.click(screen.getByRole("button", { name: /Send \(1\)/i }));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"message":"Hello there!"'),
        })
      )
    );
  });

  it("omits message field when message is blank", async () => {
    const user = userEvent.setup();

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: mockStudents }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sent: 1 }) });

    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await clickStudent(user, "Alice Smith");
    await user.click(screen.getByRole("button", { name: /Send \(1\)/i }));

    await waitFor(() => {
      const sendCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) =>
        c[0].includes("job-invitations/send")
      );
      expect(sendCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(sendCalls[0][1].body);
      expect(body.message).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Close behaviour
  // -----------------------------------------------------------------------

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<JobInviteDialog {...defaultProps} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Cancel button is disabled while sending", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: mockStudents }) })
      .mockReturnValueOnce(new Promise(() => {})); // send call never resolves

    render(<JobInviteDialog {...defaultProps} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    await clickStudent(user, "Alice Smith");
    await user.click(screen.getByRole("button", { name: /Send \(1\)/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeDisabled()
    );
  });

  // -----------------------------------------------------------------------
  // Error alert dismissal
  // -----------------------------------------------------------------------

  it("dismisses error alert when close icon is clicked", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Load failed" }),
    });

    const user = userEvent.setup();
    render(<JobInviteDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText("Load failed")).toBeInTheDocument());

    // MUI Alert close button has aria-label="Close"
    const closeAlert = screen.getByRole("button", { name: /close/i });
    await user.click(closeAlert);

    await waitFor(() => expect(screen.queryByText("Load failed")).not.toBeInTheDocument());
  });
});
