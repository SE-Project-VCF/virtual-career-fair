import { describe, it, expect, vi, beforeEach } from "vitest"
import { connectStreamDev, disconnectStream } from "../streamAuth"

const mockConnectUser = vi.fn()
const mockDisconnectUser = vi.fn()
const mockDevToken = vi.fn((uid: string) => `dev-token-${uid}`)

let mockStreamClient: any = {
  connectUser: (...args: any[]) => mockConnectUser(...args),
  disconnectUser: (...args: any[]) => mockDisconnectUser(...args),
  devToken: (uid: string) => mockDevToken(uid),
}

vi.mock("../streamClient", () => ({
  get streamClient() {
    return mockStreamClient
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockStreamClient = {
    connectUser: (...args: any[]) => mockConnectUser(...args),
    disconnectUser: (...args: any[]) => mockDisconnectUser(...args),
    devToken: (uid: string) => mockDevToken(uid),
  }
})

describe("connectStreamDev", () => {
  it("connects user with name", async () => {
    mockConnectUser.mockResolvedValue(undefined)

    await connectStreamDev({ uid: "u1", name: "John", email: "john@test.com" })

    expect(mockConnectUser).toHaveBeenCalledWith(
      { id: "u1", name: "John", image: undefined },
      "dev-token-u1"
    )
  })

  it("falls back to email when no name", async () => {
    mockConnectUser.mockResolvedValue(undefined)

    await connectStreamDev({ uid: "u1", email: "john@test.com" })

    expect(mockConnectUser).toHaveBeenCalledWith(
      { id: "u1", name: "john@test.com", image: undefined },
      "dev-token-u1"
    )
  })

  it("falls back to uid when no name or email", async () => {
    mockConnectUser.mockResolvedValue(undefined)

    await connectStreamDev({ uid: "u1" })

    expect(mockConnectUser).toHaveBeenCalledWith(
      { id: "u1", name: "u1", image: undefined },
      "dev-token-u1"
    )
  })

  it("includes photo URL when provided", async () => {
    mockConnectUser.mockResolvedValue(undefined)

    await connectStreamDev({ 
      uid: "u1", 
      name: "John", 
      email: "john@test.com",
      photoURL: "https://example.com/photo.jpg"
    })

    expect(mockConnectUser).toHaveBeenCalledWith(
      { id: "u1", name: "John", image: "https://example.com/photo.jpg" },
      "dev-token-u1"
    )
  })

  it("throws error when streamClient is not initialized", async () => {
    mockStreamClient = null

    await expect(connectStreamDev({ uid: "u1" })).rejects.toThrow(
      "Stream client is not initialized. Missing VITE_STREAM_API_KEY."
    )
  })
})

describe("disconnectStream", () => {
  it("disconnects user", async () => {
    mockDisconnectUser.mockResolvedValue(undefined)

    await disconnectStream()

    expect(mockDisconnectUser).toHaveBeenCalled()
  })

  it("does nothing when streamClient is null", async () => {
    mockStreamClient = null

    await expect(disconnectStream()).resolves.not.toThrow()
  })

  it("handles disconnect errors gracefully", async () => {
    mockDisconnectUser.mockRejectedValue(new Error("Disconnect failed"))

    await expect(disconnectStream()).resolves.not.toThrow()
  })
})
