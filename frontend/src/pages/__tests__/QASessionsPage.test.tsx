import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QASessionsPage from "../QASessionsPage";
import * as authUtils from "../../utils/auth";

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getIdToken: vi.fn(),
  },
}));

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="base-layout">{children}</div>,
}));

const mockOpen = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  (authUtils.authUtils.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");
  globalThis.open = mockOpen as unknown as typeof window.open;
});

afterEach(() => {
  vi.useRealTimers();
});

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: () => Promise<unknown> }>) {
  let i = 0;
  globalThis.fetch = vi.fn().mockImplementation(() => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: r.json ?? (async () => ({})),
    });
  }) as unknown as typeof fetch;
}

describe("QASessionsPage", () => {
  it("loads booths and sessions on mount", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ booths: [{ id: "b1", name: "Booth", fairId: "f1", fairName: "Fair" }] }) },
      { ok: true, json: async () => ({ sessions: [] }) },
    ]);

    render(<QASessionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Your Booths")).toBeInTheDocument();
    });
    expect(screen.getByText("Booth")).toBeInTheDocument();
    expect(screen.getByText(/No Q&A sessions scheduled yet/i)).toBeInTheDocument();
  });

  it("sets error when booths fetch fails", async () => {
    mockFetchSequence([{ ok: false, json: async () => ({ error: "nope" }) }]);
    render(<QASessionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch booths/i)).toBeInTheDocument();
    });
  });

  it("shows not authenticated when token missing for booths", async () => {
    (authUtils.authUtils.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    mockFetchSequence([{ ok: true, json: async () => ({ sessions: [] }) }]);
    render(<QASessionsPage />);
    await waitFor(() => {
      expect(screen.getByText("Not authenticated")).toBeInTheDocument();
    });
  });

  it("renders empty booths info when employer has no booths", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ booths: [] }) },
      { ok: true, json: async () => ({ sessions: [] }) },
    ]);
    render(<QASessionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/don't have any booths yet/i)).toBeInTheDocument();
    });
  });

  it("creates a session when form is valid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    mockFetchSequence([
      { ok: true, json: async () => ({ booths: [{ id: "b1", name: "B", fairId: "f", fairName: "F" }] }) },
      { ok: true, json: async () => ({ sessions: [] }) },
      { ok: true, json: async () => ({ success: true }) },
      { ok: true, json: async () => ({ sessions: [] }) },
    ]);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QASessionsPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: /schedule session/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /schedule session/i }));

    await user.type(screen.getByLabelText(/session title/i), "My Session");
    const dt = screen.getByLabelText(/scheduled date/i);
    await user.clear(dt);
    await user.type(dt, "2026-06-15T14:00");

    await user.click(screen.getByRole("button", { name: /create session/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/booth/b1/schedule-qa-session"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows validation error when create title is empty", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ booths: [{ id: "b1", name: "B", fairId: "f", fairName: "F" }] }) },
      { ok: true, json: async () => ({ sessions: [] }) },
    ]);
    const user = userEvent.setup();
    render(<QASessionsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /schedule session/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /schedule session/i }));
    await user.click(screen.getByRole("button", { name: /create session/i }));
    expect(await screen.findByText(/please enter a session title/i)).toBeInTheDocument();
  });

  it("deletes a session after confirmation", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ booths: [] }) },
      {
        ok: true,
        json: async () => ({
          sessions: [
            {
              sessionId: "s1",
              boothId: "b1",
              boothName: "Booth",
              fairName: "Fair",
              title: "T",
              scheduledTime: new Date("2099-01-01T12:00:00Z").toISOString(),
              duration: 60,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      },
      { ok: true, json: async () => ({}) },
      { ok: true, json: async () => ({ sessions: [] }) },
    ]);

    const user = userEvent.setup();
    render(<QASessionsPage />);

    await waitFor(() => expect(screen.getByText("T")).toBeInTheDocument());
    await user.click(screen.getByTitle(/delete session/i));
    await user.click(screen.getByRole("button", { name: /delete session/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/booth/b1/qa-session/s1"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("opens join URL in new tab when join is enabled", async () => {
    const scheduledTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockFetchSequence([
      { ok: true, json: async () => ({ booths: [] }) },
      {
        ok: true,
        json: async () => ({
          sessions: [
            {
              sessionId: "s1",
              boothId: "booth-x",
              boothName: "B",
              fairName: "F",
              title: "Live",
              scheduledTime,
              duration: 60,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      },
    ]);

    const user = userEvent.setup();
    render(<QASessionsPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: /join now/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /join now/i }));
    expect(mockOpen).toHaveBeenCalledWith("/qa-session/booth-x", "_blank");
  });

  it("handles failed sessions fetch (catch path) without blocking booths UI", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ booths: [{ id: "b1", name: "B", fairId: "f", fairName: "F" }] }) },
      { ok: false, json: async () => ({ error: "sessions down" }) },
    ]);

    render(<QASessionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Your Booths")).toBeInTheDocument();
    });
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("shows create error when schedule API returns not ok", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    try {
      mockFetchSequence([
        { ok: true, json: async () => ({ booths: [{ id: "b1", name: "B", fairId: "f", fairName: "F" }] }) },
        { ok: true, json: async () => ({ sessions: [] }) },
        { ok: false, json: async () => ({ error: "Slot unavailable" }) },
      ]);

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<QASessionsPage />);

      await waitFor(() => expect(screen.getByRole("button", { name: /schedule session/i })).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /schedule session/i }));

      await user.type(screen.getByLabelText(/session title/i), "My Session");
      const dt = screen.getByLabelText(/scheduled date/i);
      await user.clear(dt);
      await user.type(dt, "2026-06-15T14:00");

      await user.click(screen.getByRole("button", { name: /create session/i }));

      await waitFor(() => {
        expect(screen.getByText(/Slot unavailable/i)).toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates a session from the edit dialog", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    const scheduledTime = new Date("2099-03-10T16:00:00.000Z").toISOString();

    try {
      mockFetchSequence([
        { ok: true, json: async () => ({ booths: [{ id: "b1", name: "Booth", fairId: "f", fairName: "Fair" }] }) },
        {
          ok: true,
          json: async () => ({
            sessions: [
              {
                sessionId: "s-edit",
                boothId: "b1",
                boothName: "Booth",
                fairName: "Fair",
                title: "Original",
                scheduledTime,
                duration: 60,
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        },
        { ok: true, json: async () => ({}) },
        { ok: true, json: async () => ({ sessions: [] }) },
      ]);

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<QASessionsPage />);

      await waitFor(() => expect(screen.getByText("Original")).toBeInTheDocument());
      await user.click(screen.getByTitle(/edit session/i));

      const titleInputs = screen.getAllByLabelText(/session title/i);
      await user.clear(titleInputs[titleInputs.length - 1]);
      await user.type(titleInputs[titleInputs.length - 1], "Renamed Session");

      await user.click(screen.getByRole("button", { name: /update session/i }));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/booth/b1/qa-session/s-edit"),
          expect.objectContaining({ method: "PUT" })
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
