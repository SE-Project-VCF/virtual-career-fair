import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EventList from "../EventList";

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}));

describe("EventList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}) // Never resolves
    ) as any;

    render(<EventList />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders nothing when no events exist", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fairs: [] }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.queryByText("Upcoming Career Fairs")).not.toBeInTheDocument();
    });
  });

  it("renders error state when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load events")).toBeInTheDocument();
    });
  });

  it("renders events that have not ended", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Tech Fair 2025",
            description: "Annual technology career fair",
            isLive: false,
            startTime: now,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Upcoming Career Fairs")).toBeInTheDocument();
      expect(screen.getByText("Tech Fair 2025")).toBeInTheDocument();
    });
  });

  it("filters out events that have ended", async () => {
    const now = Date.now();
    const pastEnd = now - 3600000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Past Event",
            description: "This event has ended",
            isLive: false,
            startTime: now - 86400000,
            endTime: pastEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.queryByText("Past Event")).not.toBeInTheDocument();
    });
  });

  it("displays event start and end times", async () => {
    const now = Date.now();
    const futureEnd = now + 3600000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Timed Event",
            description: "Event with specific times",
            isLive: false,
            startTime: now,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText(/Start:/)).toBeInTheDocument();
      expect(screen.getByText(/End:/)).toBeInTheDocument();
    });
  });

  it("displays event description", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Event with Description",
            description: "This is a test event description",
            isLive: false,
            startTime: now,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("This is a test event description")).toBeInTheDocument();
    });
  });

  it("sorts events by start time", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-2",
            name: "Event 2",
            description: null,
            isLive: false,
            startTime: now + 3600000,
            endTime: futureEnd,
          },
          {
            id: "event-1",
            name: "Event 1",
            description: null,
            isLive: false,
            startTime: now,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      const events = screen.getAllByText(/Event [12]/);
      expect(events[0].textContent).toContain("Event 1");
      expect(events[1].textContent).toContain("Event 2");
    });
  });

  it("shows upcoming status for future events", async () => {
    const now = Date.now();
    const futureStart = now + 3600000;
    const futureEnd = now + 86400000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Future Event",
            description: null,
            isLive: false,
            startTime: futureStart,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Upcoming")).toBeInTheDocument();
    });
  });

  it("shows live now status for active events", async () => {
    const now = Date.now();
    const pastStart = now - 1800000;
    const futureEnd = now + 1800000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Active Event",
            description: null,
            isLive: true,
            startTime: pastStart,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument();
    });
  });

  it("handles events with missing data fields", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: null,
            description: null,
            isLive: false,
            startTime: now,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Career Fair")).toBeInTheDocument();
    });
  });

  it("handles events with missing start or end times", async () => {
    const now = Date.now();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Incomplete Event",
            description: null,
            isLive: false,
            startTime: null,
            endTime: now + 86400000,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Incomplete Event")).toBeInTheDocument();
    });
  });

  it("displays multiple events", async () => {
    const now = Date.now();
    const futureEnd = now + 86400000;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fairs: [
          {
            id: "event-1",
            name: "Event 1",
            description: null,
            isLive: false,
            startTime: now,
            endTime: futureEnd,
          },
          {
            id: "event-2",
            name: "Event 2",
            description: null,
            isLive: false,
            startTime: now + 3600000,
            endTime: futureEnd,
          },
        ],
      }),
    }) as any;

    render(<EventList />);

    await waitFor(() => {
      expect(screen.getByText("Event 1")).toBeInTheDocument();
      expect(screen.getByText("Event 2")).toBeInTheDocument();
    });
  });
});
