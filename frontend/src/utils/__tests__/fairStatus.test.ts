import { describe, it, expect, vi, beforeEach } from "vitest"
import { evaluateFairStatusForFair } from "../fairStatus"

vi.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
}))

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn()
})

describe("evaluateFairStatusForFair", () => {
  it("returns live status with schedule name and description", async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        isLive: true,
        name: "Spring Fair",
        description: "Spring career fair",
      }),
    })

    const result = await evaluateFairStatusForFair("fair-1")

    expect(result.isLive).toBe(true)
    expect(result.scheduleName).toBe("Spring Fair")
    expect(result.scheduleDescription).toBe("Spring career fair")
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:3000/api/fairs/fair-1/status")
  })

  it("returns not live when API says not live", async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        isLive: false,
        name: null,
        description: null,
      }),
    })

    const result = await evaluateFairStatusForFair("fair-1")

    expect(result.isLive).toBe(false)
    expect(result.scheduleName).toBeNull()
    expect(result.scheduleDescription).toBeNull()
  })

  it("returns not live when API response is not ok", async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: false,
    })

    const result = await evaluateFairStatusForFair("fair-1")

    expect(result.isLive).toBe(false)
    expect(result.scheduleName).toBeNull()
    expect(result.scheduleDescription).toBeNull()
  })

  it("returns not live when fetch throws an error", async () => {
    ;(globalThis.fetch as any).mockRejectedValue(new Error("Network error"))

    const result = await evaluateFairStatusForFair("fair-1")

    expect(result.isLive).toBe(false)
    expect(result.scheduleName).toBeNull()
    expect(result.scheduleDescription).toBeNull()
  })

  it("handles missing fields in API response gracefully", async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const result = await evaluateFairStatusForFair("fair-1")

    expect(result.isLive).toBe(false)
    expect(result.scheduleName).toBeNull()
    expect(result.scheduleDescription).toBeNull()
  })

  it("returns live with name but no description", async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        isLive: true,
        name: "Active Fair",
      }),
    })

    const result = await evaluateFairStatusForFair("fair-1")

    expect(result.isLive).toBe(true)
    expect(result.scheduleName).toBe("Active Fair")
    expect(result.scheduleDescription).toBeNull()
  })

  it("passes correct fairId to the API URL", async () => {
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ isLive: false }),
    })

    await evaluateFairStatusForFair("test-fair-123")

    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:3000/api/fairs/test-fair-123/status")
  })
})
