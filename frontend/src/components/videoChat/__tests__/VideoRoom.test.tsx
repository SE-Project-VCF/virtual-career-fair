import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

let VideoRoom: typeof import("../VideoRoom").VideoRoom;

type ListenerMap = Record<string, Array<(payload?: unknown) => void>>;

function createMockJitsiApi() {
  const listeners: ListenerMap = {};
  const api = {
    addEventListener: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(handler);
    }),
    dispose: vi.fn(),
    _listeners: listeners,
    emit(event: string, payload?: unknown) {
      for (const h of listeners[event] ?? []) {
        h(payload);
      }
    },
  };
  return api;
}

describe("VideoRoom", () => {
  let lastConstructorArgs: { domain: string; options: Record<string, unknown> } | null = null;

  beforeEach(async () => {
    lastConstructorArgs = null;
    vi.resetModules();
    delete (globalThis as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
    ({ VideoRoom } = await import("../VideoRoom"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (globalThis as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
  });

  function setupJitsiConstructor(mockApi: ReturnType<typeof createMockJitsiApi>) {
    const Ctor = vi.fn(function JitsiMeetExternalAPI(this: unknown, domain: string, options: Record<string, unknown>) {
      lastConstructorArgs = { domain, options };
      return mockApi;
    });
    (globalThis as unknown as { JitsiMeetExternalAPI: unknown }).JitsiMeetExternalAPI = Ctor;
    return Ctor;
  }

  it("shows loading overlay initially", () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="room-a" userName="Alice" />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(/loading video conference/i)).toBeInTheDocument();
  });

  it("hides loading after videoConferenceJoined fires", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="room-a" userName="Alice" />);

    await waitFor(() => {
      expect(api.addEventListener).toHaveBeenCalled();
    });

    await act(async () => {
      api.emit("videoConferenceJoined");
    });

    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/loading video conference/i)).not.toBeInTheDocument();
  });

  it("hides loading via 5s fallback when joined event never fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    try {
      render(<VideoRoom roomName="room-fallback" userName="Bob" />);

      await waitFor(() => {
        expect(api.addEventListener).toHaveBeenCalled();
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows moderator error and stops loading on membersOnly conference failure", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="room-mod" userName="Carl" />);

    await waitFor(() => {
      expect(api.addEventListener).toHaveBeenCalled();
    });

    await act(async () => {
      api.emit("onConferenceFailed", "membersOnly restriction");
    });

    await waitFor(() => {
      expect(
        screen.getByText(/moderator approval/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("does not set moderator error when conference failure is unrelated", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="room-ok" userName="Dana" />);

    await waitFor(() => {
      expect(api.addEventListener).toHaveBeenCalled();
    });

    await act(async () => {
      api.emit("onConferenceFailed", "network glitch");
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows error and calls onError when Jitsi constructor throws", async () => {
    const onError = vi.fn();
    function ThrowingCtor() {
      throw new Error("boom");
    }
    const Ctor = vi.fn(ThrowingCtor);
    (globalThis as unknown as { JitsiMeetExternalAPI: unknown }).JitsiMeetExternalAPI = Ctor;

    render(
      <VideoRoom roomName="room-err" userName="Eve" onError={onError} />
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("passes startWithAudioMuted true by default in config", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="r1" userName="User" />);

    await waitFor(() => {
      expect(lastConstructorArgs?.options?.configOverwrite).toMatchObject({
        startWithAudioMuted: true,
      });
    });
  });

  it("passes startWithAudioMuted false when prop is false", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="r2" userName="User" startWithAudioMuted={false} />);

    await waitFor(() => {
      expect(lastConstructorArgs?.options?.configOverwrite).toMatchObject({
        startWithAudioMuted: false,
      });
    });
  });

  it("prefixes room name with AppID in Jitsi options", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="my-room" userName="Display" />);

    await waitFor(() => {
      expect(lastConstructorArgs?.options?.roomName).toMatch(/vpaas-magic-cookie.*\/my-room/);
    });
    expect(lastConstructorArgs?.options?.userInfo).toEqual({ displayName: "Display" });
  });

  it("handles empty userName in userInfo", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    render(<VideoRoom roomName="r-empty" userName="" />);

    await waitFor(() => {
      expect(lastConstructorArgs?.options?.userInfo).toEqual({ displayName: "" });
    });
  });

  it("does not call onError when omitted and init fails", async () => {
    function ThrowingCtor2() {
      throw new Error("no callback");
    }
    const Ctor = vi.fn(ThrowingCtor2);
    (globalThis as unknown as { JitsiMeetExternalAPI: unknown }).JitsiMeetExternalAPI = Ctor;

    render(<VideoRoom roomName="r-nc" userName="X" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("no callback");
    });
  });

  it("wraps non-Error throws in Error for message display and onError", async () => {
    const onError = vi.fn();
    function ThrowingCtorString() {
      throw "plain string failure";
    }
    const Ctor = vi.fn(ThrowingCtorString);
    (globalThis as unknown as { JitsiMeetExternalAPI: unknown }).JitsiMeetExternalAPI = Ctor;

    render(<VideoRoom roomName="r-str" userName="U" onError={onError} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("plain string failure");
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "plain string failure" }));
  });

  it("disposes Jitsi API on unmount", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    const { unmount } = render(<VideoRoom roomName="r-unmount" userName="Y" />);

    await waitFor(() => {
      expect(api.addEventListener).toHaveBeenCalled();
    });

    unmount();

    expect(api.dispose).toHaveBeenCalled();
  });

  it("reinitializes when roomName changes", async () => {
    const api1 = createMockJitsiApi();
    const Ctor = vi.fn()
      .mockImplementationOnce(function (this: unknown, _d: string, _o: Record<string, unknown>) {
        return api1;
      })
      .mockImplementation(function (this: unknown, _d: string, _o: Record<string, unknown>) {
        return createMockJitsiApi();
      });
    (globalThis as unknown as { JitsiMeetExternalAPI: unknown }).JitsiMeetExternalAPI = Ctor;

    const { rerender } = render(<VideoRoom roomName="first-room" userName="Z" />);

    await waitFor(() => {
      expect(Ctor).toHaveBeenCalledTimes(1);
    });

    rerender(<VideoRoom roomName="second-room" userName="Z" />);

    await waitFor(() => {
      expect(Ctor).toHaveBeenCalledTimes(2);
    });
  });

  it("passes parentNode container ref to Jitsi options", async () => {
    const api = createMockJitsiApi();
    setupJitsiConstructor(api);

    const { container } = render(<VideoRoom roomName="r-box" userName="U" />);

    await waitFor(() => {
      expect(lastConstructorArgs?.options?.parentNode).toBeTruthy();
    });
    expect(container.contains(lastConstructorArgs?.options?.parentNode as Node)).toBe(true);
  });
});
