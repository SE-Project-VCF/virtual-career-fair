import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import EventList from "../EventList";
import { getDocs, getDoc, Timestamp } from "firebase/firestore";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
}));

import { auth } from "../../firebase";

import { authUtils } from "../../utils/auth";

describe("EventList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", async () => {
    (getDocs as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ forEach: vi.fn() }), 100);
        })
    );

    render(<MemoryRouter><EventList /></MemoryRouter>);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders nothing when no events exist", async () => {
    (getDocs as any).mockResolvedValue({
      forEach: vi.fn(),
    });

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.queryByText("Upcoming Career Fairs")).not.toBeInTheDocument();
    });
  });

  it("renders error state when fetch fails", async () => {
    (getDocs as any).mockRejectedValue(new Error("Firestore error"));

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Failed to load events")).toBeInTheDocument();
    });
  });

  it("renders events that have not ended", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000; // 24 hours from now

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Tech Fair 2025",
            description: "Annual technology career fair",
            startTime: now,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Upcoming Career Fairs")).toBeInTheDocument();
      expect(screen.getByText("Tech Fair 2025")).toBeInTheDocument();
    });
  });

  it("filters out events that have ended", async () => {
    const now = Date.now();
    const pastEnd = now - 3600000; // 1 hour ago

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Past Event",
            description: "This event has ended",
            startTime: now - 86400000,
            endTime: pastEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.queryByText("Past Event")).not.toBeInTheDocument();
    });
  });

  it("handles Timestamp objects from Firebase", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Timestamp Event",
            description: "Event with Timestamp",
            startTime: new Timestamp(Math.floor(now / 1000), 0),
            endTime: new Timestamp(Math.floor(futureEnd / 1000), 0),
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Timestamp Event")).toBeInTheDocument();
    });
  });

  it("displays event start and end times", async () => {
    const now = Date.now();
    const futureEnd = now + 3600000; // 1 hour from now

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Timed Event",
            description: "Event with specific times",
            startTime: now,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText(/Start:/)).toBeInTheDocument();
      expect(screen.getByText(/End:/)).toBeInTheDocument();
    });
  });

  it("displays event description", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Event with Description",
            description: "This is a test event description",
            startTime: now,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("This is a test event description")).toBeInTheDocument();
    });
  });

  it("sorts events by start time", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    const mockSnapshot = {
      forEach: (callback: any) => {
        // Add events in reverse order
        callback({
          id: "event-2",
          data: () => ({
            name: "Event 2",
            startTime: now + 3600000, // 1 hour from now
            endTime: futureEnd,
          }),
        });
        callback({
          id: "event-1",
          data: () => ({
            name: "Event 1",
            startTime: now, // now
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      const events = screen.getAllByText(/Event [12]/);
      expect(events[0].textContent).toContain("Event 1");
      expect(events[1].textContent).toContain("Event 2");
    });
  });

  it("shows upcoming status for future events", async () => {
    const now = Date.now();
    const futureStart = now + 3600000; // 1 hour from now
    const futureEnd = now + 86400000;

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Future Event",
            startTime: futureStart,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Upcoming")).toBeInTheDocument();
    });
  });

  it("shows live now status for active events", async () => {
    const now = Date.now();
    const pastStart = now - 1800000; // 30 minutes ago
    const futureEnd = now + 1800000; // 30 minutes from now

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Active Event",
            startTime: pastStart,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument();
    });
  });

  it("handles events with missing data fields", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: null,
            description: null,
            startTime: now,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Career Fair")).toBeInTheDocument(); // default name
    });
  });

  it("handles events with missing start or end times", async () => {
    const now = Date.now();

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Incomplete Event",
            startTime: null,
            endTime: now + 86400000,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Incomplete Event")).toBeInTheDocument();
    });
  });

  it("displays multiple events", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "event-1",
          data: () => ({
            name: "Event 1",
            startTime: now,
            endTime: futureEnd,
          }),
        });
        callback({
          id: "event-2",
          data: () => ({
            name: "Event 2",
            startTime: now + 3600000,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Event 1")).toBeInTheDocument();
      expect(screen.getByText("Event 2")).toBeInTheDocument();
    });
  });

  it("student can click live fair to navigate to fair booths", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });

    const now = Date.now();
    const pastStart = now - 1800000; // 30 minutes ago
    const futureEnd = now + 1800000; // 30 minutes from now

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Live Student Fair",
            startTime: pastStart,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Live Student Fair")).toBeInTheDocument();
    });

    const browseButton = screen.getByRole("button", { name: "Browse Booths" });
    await userEvent.click(browseButton);

    expect(mockNavigate).toHaveBeenCalledWith("/fairs/fair-1/booths");
  });

  it("student does not see browse button for upcoming fairs", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });

    const now = Date.now();
    const futureStart = now + 3600000; // 1 hour from now
    const futureEnd = now + 86400000;

    const mockSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Upcoming Student Fair",
            startTime: futureStart,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any).mockResolvedValue(mockSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Upcoming Student Fair")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Browse Booths" })).not.toBeInTheDocument();
  });

  it("company user does not see browse booths button", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "company-1",
      role: "companyOwner",
    });

    const now = Date.now();
    const pastStart = now - 1800000;
    const futureEnd = now + 1800000;

    // First call: company owner query (returns empty), second call: fairSchedules
    const emptySnapshot = { empty: true, docs: [], forEach: vi.fn() };
    const fairSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Live Company Fair",
            startTime: pastStart,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any)
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValueOnce(fairSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Live Company Fair")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Browse Booths" })).not.toBeInTheDocument();
  });

  // --- Join Fair Dialog Tests ---

  const setupCompanyUserWithFair = () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "company-1",
      role: "companyOwner",
    });

    const now = Date.now();
    const futureEnd = now + 86400000;

    const emptySnapshot = { empty: true, docs: [], forEach: vi.fn() };
    const fairSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Test Fair",
            startTime: now + 3600000,
            endTime: futureEnd,
          }),
        });
      },
    };

    (getDocs as any)
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValueOnce(fairSnapshot);
  };

  it("company user sees Join a Fair button", async () => {
    setupCompanyUserWithFair();

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });
  });

  it("student does not see Join a Fair button", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "student-1",
      role: "student",
    });

    const now = Date.now();
    const futureEnd = now + 86400000;

    (getDocs as any).mockResolvedValue({
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Student Fair",
            startTime: now,
            endTime: futureEnd,
          }),
        });
      },
    });

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Student Fair")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Join a Fair" })).not.toBeInTheDocument();
  });

  it("clicking Join a Fair opens the dialog", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));

    expect(screen.getByText("Join a Career Fair")).toBeInTheDocument();
    expect(screen.getByLabelText("Fair Invite Code")).toBeInTheDocument();
  });

  it("shows error when submitting empty invite code", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));

    // The Join Fair submit button should be disabled when code is empty
    const joinButton = screen.getByRole("button", { name: "Join Fair" });
    expect(joinButton).toBeDisabled();
  });

  it("shows error when not logged in", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));

    // Set auth.currentUser to null to simulate logged out
    const originalCurrentUser = (auth as any).currentUser;
    (auth as any).currentUser = null;

    await user.type(screen.getByLabelText("Fair Invite Code"), "TESTCODE");
    await user.click(screen.getByRole("button", { name: "Join Fair" }));

    await waitFor(() => {
      expect(screen.getByText("You must be logged in to join a fair")).toBeInTheDocument();
    });

    // Restore
    (auth as any).currentUser = originalCurrentUser;
  });

  it("successful join shows success message", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "company-1",
      role: "companyOwner",
    });

    const now = Date.now();
    const futureEnd = now + 86400000;

    const emptySnapshot = { empty: true, docs: [], forEach: vi.fn() };
    const fairSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Test Fair",
            startTime: now + 3600000,
            endTime: futureEnd,
          }),
        });
      },
    };

    // Initial load: owner query + fair schedules
    // After join success: fetchSchedules called again — owner query + fair schedules
    (getDocs as any)
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValueOnce(fairSnapshot)
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValueOnce(fairSnapshot);

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ fairName: "Spring Fair" }),
    });

    const user = userEvent.setup();
    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));
    await user.type(screen.getByLabelText("Fair Invite Code"), "SPRING2025");
    await user.click(screen.getByRole("button", { name: "Join Fair" }));

    await waitFor(() => {
      expect(screen.getByText(/Joined "Spring Fair" successfully/)).toBeInTheDocument();
    });
  });

  it("failed join shows server error", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid invite code" }),
    });

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));
    await user.type(screen.getByLabelText("Fair Invite Code"), "BADCODE");
    await user.click(screen.getByRole("button", { name: "Join Fair" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid invite code")).toBeInTheDocument();
    });
  });

  it("network error shows fallback message", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));
    await user.type(screen.getByLabelText("Fair Invite Code"), "CODE123");
    await user.click(screen.getByRole("button", { name: "Join Fair" }));

    await waitFor(() => {
      expect(screen.getByText("Network error. Please try again.")).toBeInTheDocument();
    });
  });

  it("cancel button closes the join dialog", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));
    expect(screen.getByText("Join a Career Fair")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("Join a Career Fair")).not.toBeInTheDocument();
    });
  });

  it("company owner with boothId sees Enrolled chip for enrolled fairs", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "company-1",
      role: "companyOwner",
    });

    const now = Date.now();
    const futureEnd = now + 86400000;

    const ownerSnapshot = {
      empty: false,
      docs: [
        {
          data: () => ({ ownerId: "company-1", boothId: "booth-abc" }),
        },
      ],
    };

    const fairSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Enrolled Fair",
            startTime: now + 3600000,
            endTime: futureEnd,
            registeredBoothIds: ["booth-abc"],
          }),
        });
      },
    };

    (getDocs as any)
      .mockResolvedValueOnce(ownerSnapshot)
      .mockResolvedValueOnce(fairSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Enrolled Fair")).toBeInTheDocument();
      expect(screen.getByText("Enrolled")).toBeInTheDocument();
    });
  });

  it("representative booth lookup via getDoc", async () => {
    (authUtils.getCurrentUser as any).mockReturnValue({
      uid: "rep-1",
      role: "representative",
      companyId: "company-1",
    });

    const now = Date.now();
    const futureEnd = now + 86400000;

    // Owner query returns empty
    const emptySnapshot = { empty: true, docs: [] };

    // getDoc returns company with boothId
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ boothId: "booth-rep" }),
    });

    const fairSnapshot = {
      forEach: (callback: any) => {
        callback({
          id: "fair-1",
          data: () => ({
            name: "Rep Fair",
            startTime: now + 3600000,
            endTime: futureEnd,
            registeredBoothIds: ["booth-rep"],
          }),
        });
      },
    };

    (getDocs as any)
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValueOnce(fairSnapshot);

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText("Rep Fair")).toBeInTheDocument();
      expect(screen.getByText("Enrolled")).toBeInTheDocument();
    });
  });

  it("failed join with no error field shows default message", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));
    await user.type(screen.getByLabelText("Fair Invite Code"), "NOERROR");
    await user.click(screen.getByRole("button", { name: "Join Fair" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to join fair")).toBeInTheDocument();
    });
  });

  it("typing in invite code clears previous error", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Bad code" }),
    });

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));
    await user.type(screen.getByLabelText("Fair Invite Code"), "BAD");
    await user.click(screen.getByRole("button", { name: "Join Fair" }));

    await waitFor(() => {
      expect(screen.getByText("Bad code")).toBeInTheDocument();
    });

    // Typing should clear the error
    await user.type(screen.getByLabelText("Fair Invite Code"), "X");
    await waitFor(() => {
      expect(screen.queryByText("Bad code")).not.toBeInTheDocument();
    });
  });

  it("input converts text to uppercase", async () => {
    setupCompanyUserWithFair();
    const user = userEvent.setup();

    render(<MemoryRouter><EventList /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Join a Fair" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Join a Fair" }));
    await user.type(screen.getByLabelText("Fair Invite Code"), "abc");

    expect(screen.getByLabelText("Fair Invite Code")).toHaveValue("ABC");
  });
});
