import { describe, it, expect, vi } from "vitest";
import { auth, db, storage, googleProvider } from "../firebase";

// Mock Firebase modules
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({ name: "mock-app" })),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ name: "mock-auth" })),
  GoogleAuthProvider: class MockGoogleAuthProvider {
    name = "mock-google-provider";
  },
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({ name: "mock-firestore" })),
}));

vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({ name: "mock-storage" })),
}));

describe("firebase", () => {
  it("exports auth instance", () => {
    expect(auth).toBeDefined();
    expect(auth).toHaveProperty("name");
  });

  it("exports storage instance", () => {
    expect(storage).toBeDefined();
    expect(storage).toHaveProperty("name");
  });

  it("exports db instance", () => {
    expect(db).toBeDefined();
    expect(db).toHaveProperty("name");
  });

  it("exports googleProvider instance", () => {
    expect(googleProvider).toBeDefined();
    expect(googleProvider).toBeInstanceOf(Object);
  });

  it("all firebase services are properly exported", () => {
    expect(auth).toBeDefined();
    expect(storage).toBeDefined();
    expect(db).toBeDefined();
    expect(googleProvider).toBeDefined();
    
    // Verify they are objects (not undefined or null)
    expect(typeof auth).toBe("object");
    expect(typeof storage).toBe("object");
    expect(typeof db).toBe("object");
    expect(typeof googleProvider).toBe("object");
  });

  it("auth export has expected mock properties", () => {
    expect(auth).toHaveProperty("name", "mock-auth");
  });

  it("storage export has expected mock properties", () => {
    expect(storage).toHaveProperty("name", "mock-storage");
  });

  it("db export has expected mock properties", () => {
    expect(db).toHaveProperty("name", "mock-firestore");
  });

  it("googleProvider is an instance", () => {
    expect(googleProvider).toBeInstanceOf(Object);
    expect((googleProvider as any).name).toBe("mock-google-provider");
  });
});
