import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useJitsiControl } from "../useJitsiControl";

describe("useJitsiControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initial state: muted, video on, no participants", () => {
    const { result } = renderHook(() => useJitsiControl());
    expect(result.current.isMuted).toBe(true);
    expect(result.current.isVideoOn).toBe(true);
    expect(result.current.participants).toEqual([]);
  });

  it("toggleAudio is a no-op when API is not set", () => {
    const { result } = renderHook(() => useJitsiControl());
    act(() => {
      result.current.toggleAudio();
    });
    expect(result.current.isMuted).toBe(true);
  });

  it("toggleVideo is a no-op when API is not set", () => {
    const { result } = renderHook(() => useJitsiControl());
    act(() => {
      result.current.toggleVideo();
    });
    expect(result.current.isVideoOn).toBe(true);
  });

  it("muteAllParticipants and hangUp are no-ops when API is not set", () => {
    const { result } = renderHook(() => useJitsiControl());
    act(() => {
      result.current.muteAllParticipants();
      result.current.hangUp();
      result.current.sendChatMessage("hi");
    });
    expect(result.current.participants).toEqual([]);
  });

  it("toggleAudio calls Jitsi executeCommand and flips muted state", () => {
    const executeCommand = vi.fn();
    const { result } = renderHook(() => useJitsiControl());

    act(() => {
      result.current.setApi({ executeCommand });
    });
    act(() => {
      result.current.toggleAudio();
    });

    expect(executeCommand).toHaveBeenCalledWith("toggleAudio");
    expect(result.current.isMuted).toBe(false);

    act(() => {
      result.current.toggleAudio();
    });
    expect(result.current.isMuted).toBe(true);
  });

  it("toggleVideo calls executeCommand and flips video state", () => {
    const executeCommand = vi.fn();
    const { result } = renderHook(() => useJitsiControl());

    act(() => {
      result.current.setApi({ executeCommand });
    });
    act(() => {
      result.current.toggleVideo();
    });

    expect(executeCommand).toHaveBeenCalledWith("toggleVideo");
    expect(result.current.isVideoOn).toBe(false);
  });

  it("muteAllParticipants sends muteEveryone", () => {
    const executeCommand = vi.fn();
    const { result } = renderHook(() => useJitsiControl());

    act(() => {
      result.current.setApi({ executeCommand });
      result.current.muteAllParticipants();
    });

    expect(executeCommand).toHaveBeenCalledWith("muteEveryone");
  });

  it("hangUp sends hangup command", () => {
    const executeCommand = vi.fn();
    const { result } = renderHook(() => useJitsiControl());

    act(() => {
      result.current.setApi({ executeCommand });
      result.current.hangUp();
    });

    expect(executeCommand).toHaveBeenCalledWith("hangup");
  });

  it("sendChatMessage passes message to Jitsi", () => {
    const executeCommand = vi.fn();
    const { result } = renderHook(() => useJitsiControl());

    act(() => {
      result.current.setApi({ executeCommand });
      result.current.sendChatMessage("hello room");
    });

    expect(executeCommand).toHaveBeenCalledWith("sendChatMessage", "hello room");
  });

  it("swallows executeCommand errors for toggleAudio without updating state", () => {
    const executeCommand = vi.fn(() => {
      throw new Error("jitsi");
    });
    const { result } = renderHook(() => useJitsiControl());

    act(() => {
      result.current.setApi({ executeCommand });
    });
    act(() => {
      result.current.toggleAudio();
    });

    expect(result.current.isMuted).toBe(true);
  });

  it("updateParticipants replaces participants list", () => {
    const { result } = renderHook(() => useJitsiControl());

    act(() => {
      result.current.updateParticipants(["a", "b"]);
    });
    expect(result.current.participants).toEqual(["a", "b"]);

    act(() => {
      result.current.updateParticipants([]);
    });
    expect(result.current.participants).toEqual([]);
  });
});
