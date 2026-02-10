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

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({
    currentUser: mockCurrentUser,
    signOut: mockSignOut,
  })),
  GoogleAuthProvider: vi.fn(() => ({})),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: mockSignOut,
  signInWithPopup: vi.fn(),
}))

// Mock firebase/firestore
vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((_db: any, ...pathSegments: string[]) => ({ path: pathSegments.join("/") })),
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
  Timestamp: {
    now: vi.fn(() => ({ toMillis: () => Date.now() })),
    fromMillis: vi.fn((ms: number) => ({ toMillis: () => ms })),
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
