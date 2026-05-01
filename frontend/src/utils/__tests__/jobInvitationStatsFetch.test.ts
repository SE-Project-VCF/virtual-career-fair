import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJobInvitationStats } from "../jobInvitationStatsFetch";

describe("fetchJobInvitationStats", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok false when userId is empty", async () => {
    const getIdToken = vi.fn();
    const result = await fetchJobInvitationStats("http://api", "job-1", "", getIdToken);
    expect(result).toEqual({ ok: false });
    expect(getIdToken).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns ok false when getIdToken returns null", async () => {
    const getIdToken = vi.fn().mockResolvedValue(null);
    const result = await fetchJobInvitationStats("http://api", "job-1", "user-1", getIdToken);
    expect(result).toEqual({ ok: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns ok false when response is not ok", async () => {
    const getIdToken = vi.fn().mockResolvedValue("tok");
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "no" }),
    } as Response);

    const result = await fetchJobInvitationStats("http://api", "job-1", "user-1", getIdToken);

    expect(result).toEqual({ ok: false });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://api/api/job-invitations/stats/job-1?userId=user-1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      })
    );
  });

  it("returns stats when response is ok", async () => {
    const payload = { totalSent: 1, totalViewed: 0, totalClicked: 0 };
    const getIdToken = vi.fn().mockResolvedValue("tok");
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    const result = await fetchJobInvitationStats("http://api", "job-9", "rep-1", getIdToken);

    expect(result).toEqual({ ok: true, stats: payload });
  });

  it("returns ok false when fetch throws", async () => {
    const getIdToken = vi.fn().mockResolvedValue("tok");
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("network"));

    const result = await fetchJobInvitationStats("http://api", "job-1", "user-1", getIdToken);

    expect(result).toEqual({ ok: false });
  });
});
