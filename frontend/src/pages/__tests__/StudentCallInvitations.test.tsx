import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { StudentCallInvitations } from "../StudentCallInvitations";
import * as callApi from "../../utils/callInvitationApi";
import * as pollingHook from "../../hooks/useCallInvitationsPolling";
import type { CallInvitation } from "../../utils/callInvitationApi";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../hooks/useCallInvitationsPolling", () => ({
  useCallInvitationsPolling: vi.fn(),
}));

vi.mock("../../utils/callInvitationApi", async () => {
  const actual = await vi.importActual<typeof import("../../utils/callInvitationApi")>(
    "../../utils/callInvitationApi"
  );
  return {
    ...actual,
    acceptCallInvitation: vi.fn(),
    declineCallInvitation: vi.fn(),
  };
});

vi.mock("../../components/BaseLayout", () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="layout" data-title={pageTitle}>
      {children}
    </div>
  ),
}));

function makeInvitation(overrides: Partial<CallInvitation> = {}): CallInvitation {
  const now = Date.now();
  return {
    id: "inv-1",
    employerId: "e1",
    employerName: "Pat Employer",
    employerCompanyName: "Acme Co",
    studentId: "s1",
    studentName: "Sam Student",
    scheduledTime: now + 60 * 60 * 1000,
    duration: 30,
    jitsiRoom: "room-1",
    status: "pending",
    createdAt: now,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StudentCallInvitations />
    </MemoryRouter>
  );
}

describe("StudentCallInvitations", () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const setError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [],
      loading: false,
      error: null,
      refresh,
      setError,
    });
    vi.mocked(callApi.acceptCallInvitation).mockResolvedValue({ success: true });
    vi.mocked(callApi.declineCallInvitation).mockResolvedValue({ success: true });
  });

  it("shows loading state while invitations load", () => {
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [],
      loading: true,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    expect(screen.getByText(/Loading invitations/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows empty state when there are no invitations", () => {
    renderPage();

    expect(screen.getByText(/No invitations yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("shows error alert from hook", () => {
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [],
      loading: false,
      error: "Could not load",
      refresh,
      setError,
    });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
  });

  it("renders tabs with counts and invitation cards", () => {
    const pending = makeInvitation({ id: "p1", status: "pending" });
    const accepted = makeInvitation({
      id: "a1",
      status: "accepted",
      scheduledTime: Date.now() + 10 * 60 * 1000,
    });

    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [pending, accepted],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    expect(screen.getByRole("tab", { name: /Pending \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Accepted \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
  });

  it("accepts invitation and refreshes", async () => {
    const user = userEvent.setup();
    const inv = makeInvitation({ id: "acc-1", status: "pending" });
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [inv],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: /Accept/i }));

    await waitFor(() => {
      expect(callApi.acceptCallInvitation).toHaveBeenCalledWith("acc-1");
    });
    expect(refresh).toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it("sets error when accept returns success false", async () => {
    const user = userEvent.setup();
    vi.mocked(callApi.acceptCallInvitation).mockResolvedValue({
      success: false,
      error: "Server said no",
    });
    const inv = makeInvitation({ status: "pending" });
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [inv],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: /Accept/i }));

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith("Server said no");
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sets error when accept throws", async () => {
    const user = userEvent.setup();
    vi.mocked(callApi.acceptCallInvitation).mockRejectedValue(new Error("network"));
    const inv = makeInvitation({ status: "pending" });
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [inv],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: /Accept/i }));

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith("Failed to accept invitation");
    });
  });

  it("declines invitation and refreshes", async () => {
    const user = userEvent.setup();
    const inv = makeInvitation({ id: "dec-1", status: "pending" });
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [inv],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: /Decline/i }));

    await waitFor(() => {
      expect(callApi.declineCallInvitation).toHaveBeenCalledWith("dec-1");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("sets error when decline returns success false", async () => {
    const user = userEvent.setup();
    vi.mocked(callApi.declineCallInvitation).mockResolvedValue({
      success: false,
      error: "Nope",
    });
    const inv = makeInvitation({ status: "pending" });
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [inv],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: /Decline/i }));

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith("Nope");
    });
  });

  it("navigates to 1x1 call when joining accepted invitation in window", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const inv = makeInvitation({
      id: "join-1",
      status: "accepted",
      scheduledTime: now + 5 * 60 * 1000,
    });
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [inv],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /^Accepted/i }));
    await user.click(screen.getByRole("button", { name: /^Join/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/1x1-call/join-1");
  });

  it("shows empty tab message when filtered list is empty", async () => {
    const user = userEvent.setup();
    const inv = makeInvitation({ status: "pending" });
    vi.mocked(pollingHook.useCallInvitationsPolling).mockReturnValue({
      invitations: [inv],
      loading: false,
      error: null,
      refresh,
      setError,
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /^Accepted/i }));

    expect(await screen.findByText("No accepted invitations")).toBeInTheDocument();
  });
});
