import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

// Mock import.meta.env
vi.stubEnv("VITE_FIREBASE_API_KEY", "test-api-key")
vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com")
vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "test-project")
vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "test.appspot.com")
vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123456")
vi.stubEnv("VITE_FIREBASE_APP_ID", "1:123:web:abc")
vi.stubEnv("VITE_STREAM_API_KEY", "test-stream-key")
vi.stubEnv("VITE_API_URL", "http://localhost:5000")

// Mock firebase/app
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
}))

// Mock firebase/auth
const mockSignOut = vi.fn()
const mockCurrentUser = { uid: "user1", email: "test@test.com", emailVerified: true, reload: vi.fn(), getIdToken: vi.fn(() => Promise.resolve("mock-token")), displayName: "Test User" }

// Mock GoogleAuthProvider as a class constructor
class MockGoogleAuthProvider {
  constructor() {}
}

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({
    currentUser: mockCurrentUser,
    signOut: mockSignOut,
  })),
  GoogleAuthProvider: MockGoogleAuthProvider,
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: mockSignOut,
  signInWithPopup: vi.fn(),
}))

// Mock firebase/firestore
const mockFirestore = {
  _app: {},
  type: 'firestore',
  _databaseId: {
    projectId: 'test-project',
    database: '(default)'
  }
}

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => mockFirestore),
  doc: vi.fn((_db: any, ...pathSegments: string[]) => ({
    path: pathSegments.join("/"),
    id: `mock-id-${Math.random().toString(36).substring(7)}`
  })),
  collection: vi.fn((_db: any, path: string) => ({ path })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: class MockTimestamp {
    seconds: number
    nanoseconds: number
    static now = vi.fn(() => ({ toMillis: () => Date.now() }))
    static fromMillis = vi.fn((ms: number) => ({ toMillis: () => ms }))
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds
      this.nanoseconds = nanoseconds
    }
    toMillis() {
      return this.seconds * 1000 + this.nanoseconds / 1000000
    }
  },
  arrayUnion: vi.fn((...args: any[]) => args),
}))

// Mock firebase/storage
vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
}))

// Mock stream-chat
vi.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: vi.fn(() => ({
      connectUser: vi.fn(),
      disconnectUser: vi.fn(),
      devToken: vi.fn((uid: string) => `dev-token-${uid}`),
      queryChannels: vi.fn(() => []),
      channel: vi.fn(() => ({
        create: vi.fn(),
        watch: vi.fn(),
      })),
    })),
  },
}))

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Suppress console.error/warn in tests
vi.spyOn(console, "error").mockImplementation(() => {})
vi.spyOn(console, "warn").mockImplementation(() => {})
