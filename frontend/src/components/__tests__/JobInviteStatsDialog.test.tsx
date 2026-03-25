import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import JobInviteStatsDialog from "../JobInviteStatsDialog";
import { authUtils } from "../../utils/auth";

// Mock authUtils
vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

// Mock fetch
globalThis.fetch = vi.fn();

const mockInvitations = [
  {
    id: "inv-1",
    studentId: "s1",
    student: {
      id: "s1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      major: "Computer Science",
    },
    status: "sent",
    sentAt: Date.now() - 3600000, // 1 hour ago
    viewedAt: null,
    clickedAt: null,
    message: "Great opportunity for you!",
  },
  {
    id: "inv-2",
    studentId: "s2",
    student: {
      id: "s2",
      firstName: "John",
      lastName: "Smith",
      email: "john@example.com",
      major: "Software Engineering",
    },
    status: "viewed",
    sentAt: Date.now() - 7200000, // 2 hours ago
    viewedAt: Date.now() - 1800000, // 30 min ago
    clickedAt: null,
    message: null,
  },
  {
    id: "inv-3",
    studentId: "s3",
    student: {
      id: "s3",
      firstName: "Alice",
      lastName: "Johnson",
      email: "alice@example.com",
      major: "Data Science",
    },
    status: "clicked",
    sentAt: Date.now() - 10800000, // 3 hours ago
    viewedAt: Date.now() - 9000000, // 2.5 hours ago
    clickedAt: Date.now() - 7200000, // 2 hours ago
    message: "We'd love to have you apply!",
  },
];

describe("JobInviteStatsDialog", () => {
  const mockOnClose = vi.fn();
  const mockUser = { uid: "user-1", email: "test@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.getCurrentUser as any).mockReturnValue(mockUser);
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: mockInvitations }),
    });
  });

  it("does not fetch data when dialog is closed", () => {
    render(
      <JobInviteStatsDialog
        open={false}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("renders dialog title with job title", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    expect(screen.getByText("Invitation Details")).toBeInTheDocument();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("fetches invitation details when opened", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/job-invitations/details/job-1?userId=user-1",
        expect.objectContaining({
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  });

  it("displays error message when fetch fails", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Failed to fetch data" }),
    });

    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch data")).toBeInTheDocument();
    });
  });

  it("displays all invitations by default", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("John Smith")).toBeInTheDocument();
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    });
  });

  it("displays student email and major", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
      expect(screen.getByText(/Computer Science/)).toBeInTheDocument();
    });
  });

  it("displays correct tab counts", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/All \(3\)/)).toBeInTheDocument();
      expect(screen.getByText(/Sent \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Viewed \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Applied \(1\)/)).toBeInTheDocument();
    });
  });

  it("filters invitations when 'Sent' tab is clicked", async () => {
    const user = userEvent.setup();
    
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    const sentTab = screen.getByRole("tab", { name: /Sent \(1\)/ });
    await user.click(sentTab);

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
      expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    });
  });

  it("filters invitations when 'Viewed' tab is clicked", async () => {
    const user = userEvent.setup();
    
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    const viewedTab = screen.getByRole("tab", { name: /Viewed \(1\)/ });
    await user.click(viewedTab);

    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
      expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    });
  });

  it("filters invitations when 'Applied' tab is clicked", async () => {
    const user = userEvent.setup();
    
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    });

    const appliedTab = screen.getByRole("tab", { name: /Applied \(1\)/ });
    await user.click(appliedTab);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
      expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
    });
  });

  it("displays status chips correctly", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Sent")).toBeInTheDocument();
      expect(screen.getByText("Viewed")).toBeInTheDocument();
      expect(screen.getByText("Applied")).toBeInTheDocument();
    });
  });

  it("displays timeline information", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      const sentLabels = screen.getAllByText(/Sent:/);
      expect(sentLabels.length).toBeGreaterThan(0);
    });
  });

  it("displays invitation message when present", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Great opportunity for you!/)).toBeInTheDocument();
      expect(screen.getByText(/We'd love to have you apply!/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no invitations", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invitations: [] }),
    });

    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("No invitations sent yet")).toBeInTheDocument();
    });
  });

  it("shows empty state for filtered tabs with no results", async () => {
    const user = userEvent.setup();
    
    // Mock data with only "sent" invitations
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        invitations: [
          {
            id: "inv-1",
            studentId: "s1",
            student: {
              id: "s1",
              firstName: "Jane",
              lastName: "Doe",
              email: "jane@example.com",
              major: "CS",
            },
            status: "sent",
            sentAt: Date.now(),
            viewedAt: null,
            clickedAt: null,
            message: null,
          },
        ] 
      }),
    });

    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    const appliedTab = screen.getByRole("tab", { name: /Applied \(0\)/ });
    await user.click(appliedTab);

    await waitFor(() => {
      expect(screen.getByText("No clicked invitations")).toBeInTheDocument();
    });
  });

  it("calls onClose when Close button is clicked", async () => {
    const user = userEvent.setup();
    
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("handles missing student information gracefully", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        invitations: [
          {
            id: "inv-1",
            studentId: "s1",
            student: null,
            status: "sent",
            sentAt: Date.now(),
            viewedAt: null,
            clickedAt: null,
            message: null,
          },
        ] 
      }),
    });

    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Unknown Student")).toBeInTheDocument();
    });
  });

  it("does not fetch when user is not authenticated", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue(null);

    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  it("formats timestamps correctly for recent times", async () => {
    const now = Date.now();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        invitations: [
          {
            id: "inv-1",
            studentId: "s1",
            student: {
              id: "s1",
              firstName: "Test",
              lastName: "User",
              email: "test@test.com",
              major: "CS",
            },
            status: "sent",
            sentAt: now - 30000, // 30 seconds ago
            viewedAt: null,
            clickedAt: null,
            message: null,
          },
        ] 
      }),
    });

    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Just now|0 min ago/)).toBeInTheDocument();
    });
  });

  it("refetches data when jobId changes", async () => {
    const { rerender } = render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-2"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        "http://localhost:5000/api/job-invitations/details/job-2?userId=user-1",
        expect.any(Object)
      );
    });
  });

  it("displays viewed and applied timestamps in timeline", async () => {
    render(
      <JobInviteStatsDialog
        open={true}
        onClose={mockOnClose}
        jobId="job-1"
        jobTitle="Software Engineer"
      />
    );

    await waitFor(() => {
      const viewedElements = screen.getAllByText(/Viewed:/);
      const appliedElements = screen.getAllByText(/Applied:/);
      expect(viewedElements.length).toBeGreaterThan(0);
      expect(appliedElements.length).toBeGreaterThan(0);
    });
  });
});
