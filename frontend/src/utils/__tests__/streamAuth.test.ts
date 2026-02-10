import { describe, it, expect, vi, beforeEach } from "vitest"
import { connectStreamDev, disconnectStream } from "../streamAuth"

const mockConnectUser = vi.fn()
const mockDisconnectUser = vi.fn()
const mockDevToken = vi.fn((uid: string) => `dev-token-${uid}`)

vi.mock("../streamClient", () => ({
  streamClient: {
    connectUser: (...args: any[]) => mockConnectUser(...args),
    disconnectUser: (...args: any[]) => mockDisconnectUser(...args),
    devToken: (uid: string) => mockDevToken(uid),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
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
})

describe("disconnectStream", () => {
  it("disconnects user", async () => {
    mockDisconnectUser.mockResolvedValue(undefined)

    await disconnectStream()

    expect(mockDisconnectUser).toHaveBeenCalled()
  })
})
