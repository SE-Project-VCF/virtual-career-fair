import { describe, it, expect, vi, beforeEach } from "vitest"
import type { User } from "firebase/auth"

/** Production code passes a function; Firebase types allow Observer too. */
function asAuthCallback(nextOrObserver: unknown): (user: User | null) => void {
  return nextOrObserver as (user: User | null) => void
}

const authState = { currentUser: null as { uid: string; getIdToken?: () => Promise<string> } | null }
const mockUnsub = vi.fn()

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
}))

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({
    get currentUser() {
      return authState.currentUser
    },
  })),
  onAuthStateChanged: vi.fn(),
  GoogleAuthProvider: class MockGoogleAuthProvider {
    static readonly providerId = "google.com"
  },
}))

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
}))

vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
}))

describe("waitForFirebaseUser", () => {
  beforeEach(async () => {
    authState.currentUser = null
    vi.resetModules()
    vi.clearAllMocks()
    const { onAuthStateChanged } = await import("firebase/auth")
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      const next = asAuthCallback(callback)
      queueMicrotask(() => {
        next({ uid: "auth-flow-user", getIdToken: async () => "tok" } as User)
      })
      return mockUnsub
    })
  })

  it("resolves immediately with currentUser when already present (fast path)", async () => {
    authState.currentUser = { uid: "already-here", getIdToken: async () => "t" }
    const { waitForFirebaseUser } = await import("../firebase")
    const u = await waitForFirebaseUser()
    expect(u).toBe(authState.currentUser)
    expect(vi.mocked((await import("firebase/auth")).onAuthStateChanged)).not.toHaveBeenCalled()
  })

  it("subscribes via onAuthStateChanged and resolves when user is emitted", async () => {
    const { onAuthStateChanged } = await import("firebase/auth")
    authState.currentUser = null
    const { waitForFirebaseUser } = await import("../firebase")
    const u = await waitForFirebaseUser()
    expect(onAuthStateChanged).toHaveBeenCalled()
    expect(u).toMatchObject({ uid: "auth-flow-user" })
    expect(mockUnsub).toHaveBeenCalled()
  })

  it("ignores a null auth callback then resolves on the next user", async () => {
    const { onAuthStateChanged } = await import("firebase/auth")
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      const next = asAuthCallback(callback)
      queueMicrotask(() => {
        next(null)
        queueMicrotask(() => {
          next({ uid: "after-null", getIdToken: async () => "t" } as User)
        })
      })
      return mockUnsub
    })
    authState.currentUser = null
    const { waitForFirebaseUser } = await import("../firebase")
    const u = await waitForFirebaseUser()
    expect(u).toMatchObject({ uid: "after-null" })
  })
})
