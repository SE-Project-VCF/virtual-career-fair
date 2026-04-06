import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowseQASessionsPage } from "../BrowseQASessionsPage";
import * as authUtils from "../../../utils/auth";

vi.mock("../../../utils/auth", () => ({
  authUtils: {
    getIdToken: vi.fn(),
  },
}));

const baseSession = {
  sessionId: "s1",
  fairId: "f1",
  employerName: "Employer",
  title: "Talk",
  description: "Desc",
  scheduledTime: Date.now(),
  maxDuration: 30,
  isPresentationMode: false,
  isLive: true,
  jitsiRoom: "jit-1",
  streamChatChannelId: "ch-1",
  createdAt: Date.now(),
};

describe("BrowseQASessionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authUtils.authUtils.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValue("tok");
    globalThis.fetch = vi.fn();
  });

  it("shows error when fairId is missing", async () => {
    render(<BrowseQASessionsPage />);
    expect(await screen.findByText(/fair id is missing/i)).toBeInTheDocument();
  });

  it("loads and lists sessions", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [baseSession] }),
    });

    render(<BrowseQASessionsPage fairId="fair-1" />);

    await waitFor(() => expect(screen.getByText("Talk")).toBeInTheDocument());
    expect(screen.getByText("Employer")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions/active/fair-1", expect.any(Object));
  });

  it("shows info when no sessions", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    });

    render(<BrowseQASessionsPage fairId="fair-1" />);

    expect(await screen.findByText(/no active q&a sessions/i)).toBeInTheDocument();
  });

  it("shows fetch error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    render(<BrowseQASessionsPage fairId="fair-1" />);

    expect(await screen.findByText(/failed to fetch sessions/i)).toBeInTheDocument();
  });

  it("joins session and notifies parent", async () => {
    const onJoin = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [baseSession] }),
    });

    const user = userEvent.setup();
    render(<BrowseQASessionsPage fairId="fair-1" onJoinSession={onJoin} />);

    await waitFor(() => expect(screen.getByText("Talk")).toBeInTheDocument());
    await user.click(screen.getByText("Talk"));

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await user.click(screen.getByRole("button", { name: /join now/i }));

    await waitFor(() => {
      expect(onJoin).toHaveBeenCalledWith("s1", "jit-1", "ch-1");
    });
  });

  it("shows upcoming chip when live is false", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [{ ...baseSession, isLive: false }] }),
    });

    render(<BrowseQASessionsPage fairId="fair-1" />);

    expect(await screen.findByText(/upcoming/i)).toBeInTheDocument();
  });
});
