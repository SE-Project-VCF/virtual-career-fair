import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

import { FairProvider, useFair } from "../FairContext"

const fairData = {
  id: "fair-1",
  name: "Spring Career Fair",
  description: "A great fair",
  isLive: false,
  startTime: 1000000,
  endTime: 2000000,
}

function makeWrapper(fairId: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <FairProvider fairId={fairId}>{children}</FairProvider>
  }
}

describe("FairProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts with loading=true then sets to false after fetch resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    )

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-1"),
    })

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it("loads fair data and status when both requests succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => fairData })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ isLive: true }) })
    )

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-1"),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.fair).toEqual(fairData)
    expect(result.current.isLive).toBe(true)
    expect(result.current.fairId).toBe("fair-1")
  })

  it("leaves fair null when fair request fails (not ok)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ isLive: false }) })
    )

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-1"),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.fair).toBeNull()
    expect(result.current.isLive).toBe(false)
  })

  it("defaults isLive to false when status request fails (not ok)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => fairData })
        .mockResolvedValueOnce({ ok: false })
    )

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-1"),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.fair).toEqual(fairData)
    expect(result.current.isLive).toBe(false)
  })

  it("defaults isLive to false when statusData.isLive is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => fairData })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    )

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-1"),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isLive).toBe(false)
  })

  it("handles fetch throwing an error without crashing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")))

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-1"),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.fair).toBeNull()
    expect(result.current.isLive).toBe(false)
    expect(consoleError).toHaveBeenCalledWith(
      "Error loading fair:",
      expect.any(Error)
    )

    consoleError.mockRestore()
  })

  it("fetches from the correct URLs", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal("fetch", mockFetch)

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-42"),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:5000/api/fairs/fair-42")
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:5000/api/fairs/fair-42/status")
  })
})

describe("useFair hook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns context defaults when used outside a provider", () => {
    const { result } = renderHook(() => useFair())

    expect(result.current.fairId).toBeNull()
    expect(result.current.fair).toBeNull()
    expect(result.current.isLive).toBe(false)
    expect(result.current.loading).toBe(true)
  })

  it("returns correct shape with all expected fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => fairData })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ isLive: false }) })
    )

    const { result } = renderHook(() => useFair(), {
      wrapper: makeWrapper("fair-1"),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current).toHaveProperty("fairId")
    expect(result.current).toHaveProperty("fair")
    expect(result.current).toHaveProperty("isLive")
    expect(result.current).toHaveProperty("loading")
  })
})
