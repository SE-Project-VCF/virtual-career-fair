import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QASessionPage from "../QASessionPage";
import * as authUtils from "../../utils/auth";

const mockNavigate = vi.fn();
const routeParams: { boothId?: string } = { boothId: "booth-1" };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => routeParams,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: vi.fn(),
    getIdToken: vi.fn(),
  },
}));

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="base-layout" data-page-title={pageTitle}>
      {children}
    </div>
  ),
}));

vi.mock("../../components/videoChat/QASessionRoom", () => ({
  QASessionRoom: ({ jitsiRoom, userName }: { jitsiRoom: string; userName: string }) => (
    <div data-testid="qa-session-room">
      <span data-testid="room">{jitsiRoom}</span>
      <span data-testid="uname">{userName}</span>
    </div>
  ),
}));

function joinableSession(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 10 * 60 * 1000);
  return {
    title: "Session A",
    scheduledTime: start.toISOString(),
    duration: 60,
    jitsiRoom: "room-xyz",
    ...overrides,
  };
}

describe("QASessionPage", () => {
  beforeEach(() => {
    routeParams.boothId = "booth-1";
    vi.clearAllMocks();
    (authUtils.authUtils.getCurrentUser as ReturnType<typeof vi.fn>).mockReturnValue({
      uid: "u1",
      email: "a@test.com",
      displayName: "Alice",
    });
    (authUtils.authUtils.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValue("tok");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading then room when one joinable session is returned", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ qaSessions: [joinableSession()] }),
    });

    render(<QASessionPage />);

    await waitFor(() => {
      expect(screen.getByTestId("qa-session-room")).toBeInTheDocument();
    });
    expect(screen.getByTestId("room")).toHaveTextContent("room-xyz");
  });

  it("uses legacy qaSession shape", async () => {
    const s = joinableSession();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ qaSession: s }),
    });

    render(<QASessionPage />);

    await waitFor(() => expect(screen.getByTestId("qa-session-room")).toBeInTheDocument());
  });

  it("shows error when API returns 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "bad" }),
    });

    render(<QASessionPage />);

    expect(await screen.findByText(/log in again/i)).toBeInTheDocument();
  });

  it("shows error when no sessions in payload", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ qaSessions: [] }),
    });

    render(<QASessionPage />);

    expect(await screen.findByText(/no active sessions/i)).toBeInTheDocument();
  });

  it("shows error when sessions are not in join window", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        qaSessions: [
          {
            title: "Future",
            scheduledTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            duration: 30,
            jitsiRoom: "r",
          },
        ],
      }),
    });

    render(<QASessionPage />);

    expect(await screen.findByText(/no available sessions/i)).toBeInTheDocument();
  });

  it("lets user pick among multiple sessions then shows room", async () => {
    const a = joinableSession({ title: "A", jitsiRoom: "ja" });
    const b = joinableSession({ title: "B", jitsiRoom: "jb" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ qaSessions: [a, b] }),
    });

    const user = userEvent.setup();
    render(<QASessionPage />);

    expect(await screen.findByText(/multiple q&a sessions available/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /join selected session/i }));

    await waitFor(() => {
      expect(screen.getByTestId("qa-session-room")).toBeInTheDocument();
    });
  });

  it("waits for auth then errors when still unauthenticated", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (authUtils.authUtils.getCurrentUser as ReturnType<typeof vi.fn>).mockReturnValue(null);

    render(<QASessionPage />);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(await screen.findByText(/not authenticated\. please log in\./i)).toBeInTheDocument();
  });

  it("shows error when booth id route param is missing", async () => {
    routeParams.boothId = undefined;
    render(<QASessionPage />);
    expect(await screen.findByText(/booth id is required/i)).toBeInTheDocument();
  });
});
