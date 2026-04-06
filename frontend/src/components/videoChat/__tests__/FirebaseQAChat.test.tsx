import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDocs, onSnapshot, addDoc } from "firebase/firestore";
import { FirebaseQAChat } from "../FirebaseQAChat";

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(() => ({
    uid: "user-1",
    displayName: "Eve",
    email: "eve@test.com",
  })),
}));

vi.mock("../../../utils/auth", () => ({
  authUtils: {
    getCurrentUser: authMocks.getCurrentUser,
  },
}));

function snapshotWithMessages() {
  const docSnap = {
    id: "m1",
    data: () => ({
      userId: "user-1",
      userName: "Eve",
      text: "Hello",
      timestamp: {
        toDate: () => new Date("2020-01-01T12:00:00Z"),
      },
      role: "employer",
    }),
  };
  return {
    forEach: (cb: (d: typeof docSnap) => void) => {
      cb(docSnap);
    },
  };
}

describe("FirebaseQAChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getCurrentUser.mockImplementation(() => ({
      uid: "user-1",
      displayName: "Eve",
      email: "eve@test.com",
    }));
    vi.mocked(getDocs).mockResolvedValue(snapshotWithMessages() as never);
    vi.mocked(onSnapshot).mockImplementation(((...args: unknown[]) => {
      const onNext = args[1] as (s: ReturnType<typeof snapshotWithMessages>) => void;
      queueMicrotask(() => onNext(snapshotWithMessages()));
      return vi.fn();
    }) as typeof onSnapshot);
    vi.mocked(addDoc).mockResolvedValue({} as never);
  });

  it("renders messages after load", async () => {
    render(<FirebaseQAChat sessionId="sess-1" isEmployer />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });

  it("submits a new message", async () => {
    const user = userEvent.setup();
    render(<FirebaseQAChat sessionId="sess-1" isEmployer />);

    await waitFor(() => expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/type a message/i), "New text");
    const form = document.querySelector("form");
    await user.click(form!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalled();
    });
    const payload = vi.mocked(addDoc).mock.calls[0][1] as Record<string, string>;
    expect(payload.text).toBe("New text");
    expect(payload.role).toBe("employer");
  });

  it("does not send empty messages", async () => {
    render(<FirebaseQAChat sessionId="sess-1" isEmployer />);

    await waitFor(() => expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument());
    const form = document.querySelector("form");
    fireEvent.submit(form!);

    expect(addDoc).not.toHaveBeenCalled();
  });

  it("continues when initial getDocs hits permission-denied", async () => {
    vi.mocked(getDocs).mockRejectedValueOnce({ code: "permission-denied", message: "denied" });
    vi.mocked(onSnapshot).mockImplementation(((...args: unknown[]) => {
      const onNext = args[1] as (s: ReturnType<typeof snapshotWithMessages>) => void;
      queueMicrotask(() => onNext(snapshotWithMessages()));
      return vi.fn();
    }) as typeof onSnapshot);

    render(<FirebaseQAChat sessionId="sess-1" isEmployer />);

    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
  });

  it("shows error when getDocs fails with non-permission error", async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("network"));
    render(<FirebaseQAChat sessionId="sess-1" isEmployer />);
    expect(await screen.findByText("network")).toBeInTheDocument();
  });

  it("invokes onError when snapshot listener errors", async () => {
    const onError = vi.fn();
    vi.mocked(onSnapshot).mockImplementation(((...args: unknown[]) => {
      const onErr = args[2] as (e: { code: string; message: string }) => void;
      queueMicrotask(() => onErr({ code: "failed", message: "snap" }));
      return vi.fn();
    }) as typeof onSnapshot);

    render(<FirebaseQAChat sessionId="sess-1" isEmployer onError={onError} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load messages/i)).toBeInTheDocument();
      expect(onError).toHaveBeenCalled();
    });
  });

  it("shows empty state when no messages", async () => {
    const emptySnap = { forEach: () => {} };
    vi.mocked(getDocs).mockResolvedValue(emptySnap as never);
    vi.mocked(onSnapshot).mockImplementation(((...args: unknown[]) => {
      const onNext = args[1] as (s: typeof emptySnap) => void;
      queueMicrotask(() => onNext(emptySnap));
      return vi.fn();
    }) as typeof onSnapshot);

    render(<FirebaseQAChat sessionId="sess-1" isEmployer />);

    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("skips wiring when user is missing", () => {
    authMocks.getCurrentUser.mockReturnValueOnce(null as never);
    render(<FirebaseQAChat sessionId="sess-1" isEmployer />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
  });
});
