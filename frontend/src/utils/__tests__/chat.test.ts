import { describe, it, expect, vi, beforeEach } from "vitest"
import { getOrCreateDirectChannel } from "../chat"

// Mock the streamClient module
const mockWatch = vi.fn()
const mockCreate = vi.fn()
const mockQueryChannels = vi.fn()
const mockChannel = vi.fn()

vi.mock("../streamClient", () => ({
  streamClient: {
    queryChannels: (...args: any[]) => mockQueryChannels(...args),
    channel: (...args: any[]) => mockChannel(...args),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.mockReturnValue({
    create: mockCreate,
    watch: mockWatch,
  })
})

describe("getOrCreateDirectChannel", () => {
  it("returns existing channel if found", async () => {
    const existingChannel = { watch: mockWatch, id: "existing" }
    mockQueryChannels.mockResolvedValue([existingChannel])

    const result = await getOrCreateDirectChannel("user1", "user2")

    expect(result).toBe(existingChannel)
    expect(mockWatch).toHaveBeenCalled()
    expect(mockChannel).not.toHaveBeenCalled()
  })

  it("creates new channel if none exists", async () => {
    mockQueryChannels.mockResolvedValue([])
    const newChannel = { create: mockCreate, watch: mockWatch }
    mockChannel.mockReturnValue(newChannel)

    const result = await getOrCreateDirectChannel("user1", "user2")

    expect(mockChannel).toHaveBeenCalledWith("messaging", "dm_user1_user2", {
      members: ["user1", "user2"],
    })
    expect(mockCreate).toHaveBeenCalled()
    expect(mockWatch).toHaveBeenCalled()
    expect(result).toBe(newChannel)
  })
})
