import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import EventList from "../EventList";
import { getDocs, Timestamp } from "firebase/firestore";

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
});
