import { describe, it, expect, vi, beforeEach } from "vitest"
import { evaluateFairStatus } from "../fairStatus"
import { getDoc, getDocs } from "firebase/firestore"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("evaluateFairStatus", () => {
  it("returns live when manual toggle is on with active schedule", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ isLive: true }),
    } as any)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        {
          data: () => ({
            startTime: Date.now() - 1000,
            endTime: Date.now() + 100000,
            name: "Spring Fair",
            description: "Spring career fair",
          }),
        },
      ],
    } as any)

    const result = await evaluateFairStatus()

    expect(result.isLive).toBe(true)
    expect(result.scheduleName).toBe("Spring Fair")
    expect(result.scheduleDescription).toBe("Spring career fair")
  })

  it("returns live when manual toggle is on without active schedule", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ isLive: true }),
    } as any)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [],
    } as any)

    const result = await evaluateFairStatus()

    expect(result.isLive).toBe(true)
    expect(result.scheduleName).toBeNull()
  })

  it("returns live based on active schedule even without manual toggle", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ isLive: false }),
    } as any)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        {
          data: () => ({
            startTime: Date.now() - 1000,
            endTime: Date.now() + 100000,
            name: "Active Fair",
            description: "Currently running",
          }),
        },
      ],
    } as any)

    const result = await evaluateFairStatus()

    expect(result.isLive).toBe(true)
    expect(result.scheduleName).toBe("Active Fair")
  })

  it("returns not live when no toggle and no active schedule", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [],
    } as any)

    const result = await evaluateFairStatus()

    expect(result.isLive).toBe(false)
    expect(result.scheduleName).toBeNull()
  })

  it("returns not live when schedule is in the future", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        {
          data: () => ({
            startTime: Date.now() + 100000,
            endTime: Date.now() + 200000,
            name: "Future Fair",
          }),
        },
      ],
    } as any)

    const result = await evaluateFairStatus()

    expect(result.isLive).toBe(false)
  })

  it("handles Timestamp objects for schedule times", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        {
          data: () => ({
            startTime: { toMillis: () => Date.now() - 1000 },
            endTime: { toMillis: () => Date.now() + 100000 },
            name: "Timestamp Fair",
          }),
        },
      ],
    } as any)

    const result = await evaluateFairStatus()

    expect(result.isLive).toBe(true)
    expect(result.scheduleName).toBe("Timestamp Fair")
  })

  it("falls back to manual status on schedule fetch error", async () => {
    // First getDoc call succeeds (manual toggle check), but getDocs fails
    let getDocCallCount = 0
    vi.mocked(getDoc).mockImplementation(() => {
      getDocCallCount++
      return Promise.resolve({
        exists: () => true,
        data: () => ({ isLive: true }),
      } as any)
    })
    vi.mocked(getDocs).mockRejectedValue(new Error("Firestore error"))

    const result = await evaluateFairStatus()

    expect(result.isLive).toBe(true)
    expect(result.scheduleName).toBeNull()
  })
})
