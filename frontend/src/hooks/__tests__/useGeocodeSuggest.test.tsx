/// <reference types="vitest/globals" />
import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useGeocodeSuggest } from "../useGeocodeSuggest"

vi.mock("../../config", () => ({
  API_URL: "http://localhost:5000",
}))

describe("useGeocodeSuggest", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("returns empty options when disabled", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [{ id: "1", label: "X", lat: 0, lng: 0 }] }),
    } as Response)

    const { result, rerender } = renderHook(
      ({ enabled, q }: { enabled: boolean; q: string }) => useGeocodeSuggest(q, enabled),
      { initialProps: { enabled: false, q: "Boston" } },
    )

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(result.current.options).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()

    rerender({ enabled: true, q: "Boston" })
    act(() => {
      vi.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(result.current.options.length).toBe(1)
    })
  })

  it("does not fetch when query is shorter than 2 characters", () => {
    renderHook(() => useGeocodeSuggest("B", true))

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("debounces then fetches suggestions and clears loading", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { id: "mb", label: "Boston, MA", lat: 42.36, lng: -71.06 },
        ],
      }),
    } as Response)

    const { result } = renderHook(() => useGeocodeSuggest("Bo", true))

    act(() => {
      vi.advanceTimersByTime(349)
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(50)
    })

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/geocode/suggest?q=Bo",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.options).toEqual([
        expect.objectContaining({ id: "mb", label: "Boston, MA" }),
      ])
    })
  })

  it("uses empty array when suggestions are missing or not an array", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    const { result } = renderHook(() => useGeocodeSuggest("NY", true))

    act(() => {
      vi.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(result.current.options).toEqual([])
    })
  })

  it("ignores non-abort fetch errors and clears options", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("network"))

    const { result } = renderHook(() => useGeocodeSuggest("Seattle", true))

    act(() => {
      vi.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(result.current.options).toEqual([])
      expect(result.current.loading).toBe(false)
    })
  })
})
