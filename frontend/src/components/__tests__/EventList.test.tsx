import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EventList from "../EventList";
import { getDocs, Timestamp } from "firebase/firestore";

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

    render(<EventList />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders nothing when no events exist", async () => {
    (getDocs as any).mockResolvedValue({
      forEach: vi.fn(),
    });

    render(<EventList />);

    await waitFor(() => {
      expect(screen.queryByText("Upcoming Career Fairs")).not.toBeInTheDocument();
    });
  });

  it("renders error state when fetch fails", async () => {
    (getDocs as any).mockRejectedValue(new Error("Firestore error"));

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

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

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Event 1")).toBeInTheDocument();
      expect(screen.getByText("Event 2")).toBeInTheDocument();
    });
  });
});
