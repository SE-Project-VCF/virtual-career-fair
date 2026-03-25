import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitFor, renderHook, act } from "@testing-library/react";
import type { User as FirebaseUser } from "firebase/auth";

// Mock firebase auth - create the mock implementation inline
vi.mock("../../firebase", () => ({
  auth: {
    onAuthStateChanged: vi.fn(),
    currentUser: null,
  },
}));

import { AuthProvider, useAuth } from "../AuthContext";
import { auth } from "../../firebase";

// Get the mocked function for manipulation in tests
const mockOnAuthStateChanged = vi.mocked(auth.onAuthStateChanged);

// Mock localStorage with proper implementation
let localStorageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] || null,
  setItem: (key: string, value: string) => {
    localStorageStore[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageStore[key];
  },
  clear: () => {
    localStorageStore = {};
  },
};

// Spy on the methods so we can track calls
const setItemSpy = vi.spyOn(localStorageMock, "setItem");
const removeItemSpy = vi.spyOn(localStorageMock, "removeItem");

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageStore = {};
  });

  afterEach(() => {
    localStorageStore = {};
  });

  describe("Initialization", () => {
    it("initializes with null user when localStorage is empty", () => {
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(null);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      expect(result.current.currentUser).toBeNull();
      expect(result.current.firebaseUser).toBeNull();
    });

    it("initializes with stored user from localStorage", async () => {
      const storedUser = {
        uid: "user123",
        email: "test@example.com",
        role: "student",
        firstName: "John",
        lastName: "Doe",
      };

      // Set localStorage before rendering
      localStorageStore["currentUser"] = JSON.stringify(storedUser);

      const mockFirebaseUser = { uid: "user123", email: "test@example.com" } as FirebaseUser;

      // Fire with a Firebase user so onAuthStateChanged doesn't clear currentUser
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(mockFirebaseUser);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      // Initial state should load from localStorage synchronously
      await waitFor(() => {
        expect(result.current.currentUser).toEqual(storedUser);
      });
    });

    it("starts with loading=true and sets to false after auth state resolves", async () => {
      mockOnAuthStateChanged.mockImplementation((callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') callback(null);
        }, 10);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe("Firebase Auth State Changes", () => {
    it("updates firebaseUser when auth.onAuthStateChanged fires", async () => {
      const mockFirebaseUser = {
        uid: "firebase-uid",
        email: "firebase@test.com",
      } as FirebaseUser;

      mockOnAuthStateChanged.mockImplementation((callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') callback(mockFirebaseUser);
        }, 10);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.firebaseUser).toEqual(mockFirebaseUser);
      });
    });

    it("clears currentUser when user logs out (firebaseUser becomes null)", async () => {
      const storedUser = {
        uid: "user123",
        email: "test@example.com",
        role: "student",
      };

      // Set localStorage before rendering
      localStorageStore["currentUser"] = JSON.stringify(storedUser);

      const mockFirebaseUser = { uid: "user123", email: "test@example.com" } as FirebaseUser;
      let authCallback: ((user: FirebaseUser | null) => void) | null = null;

      // Initially fire with a Firebase user so currentUser is preserved
      mockOnAuthStateChanged.mockImplementation((callback) => {
        authCallback = typeof callback === 'function' ? callback : null;
        if (typeof callback === 'function') callback(mockFirebaseUser);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.currentUser).toEqual(storedUser);
      });

      // Simulate logout by firing auth callback with null
      act(() => {
        if (authCallback) authCallback(null);
      });

      await waitFor(() => {
        expect(result.current.currentUser).toBeNull();
      });
    });

    it("preserves currentUser when firebaseUser exists", async () => {
      const storedUser = {
        uid: "user123",
        email: "test@example.com",
        role: "student",
      };

      localStorageStore["currentUser"] = JSON.stringify(storedUser);

      const mockFirebaseUser = {
        uid: "user123",
        email: "test@example.com",
      } as FirebaseUser;

      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(mockFirebaseUser);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.firebaseUser).toEqual(mockFirebaseUser);
        expect(result.current.currentUser).toEqual(storedUser);
      });
    });
  });

  describe("LocalStorage Synchronization", () => {
    it("saves currentUser to localStorage when setCurrentUser is called", async () => {
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(null);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      const newUser = {
        uid: "new-user",
        email: "new@test.com",
        role: "student",
      };

      act(() => {
        result.current.setCurrentUser(newUser);
      });

      await waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith(
          "currentUser",
          JSON.stringify(newUser)
        );
      });
    });

    it("removes from localStorage when currentUser is set to null", async () => {
      const storedUser = {
        uid: "user123",
        email: "test@example.com",
        role: "student",
      };

      localStorageStore["currentUser"] = JSON.stringify(storedUser);
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(null);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      act(() => {
        result.current.setCurrentUser(null);
      });

      await waitFor(() => {
        expect(removeItemSpy).toHaveBeenCalledWith("currentUser");
      });
    });

    it("correctly serializes and deserializes user data", async () => {
      const user = {
        uid: "123",
        email: "test@test.com",
        role: "companyOwner",
        firstName: "Jane",
        lastName: "Smith",
        companyId: "company-123",
      };

      localStorageStore["currentUser"] = JSON.stringify(user);

      const mockFirebaseUser = { uid: "123", email: "test@test.com" } as FirebaseUser;

      // Fire with a Firebase user so onAuthStateChanged doesn't clear currentUser
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(mockFirebaseUser);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.currentUser).toEqual(user);
      });
    });
  });

  describe("setCurrentUser Function", () => {
    it("updates currentUser state", async () => {
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(null);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      const newUser = {
        uid: "new-id",
        email: "new@test.com",
        role: "administrator",
      };

      act(() => {
        result.current.setCurrentUser(newUser);
      });

      await waitFor(() => {
        expect(result.current.currentUser).toEqual(newUser);
      });
    });

    it("triggers localStorage update effect", async () => {
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(null);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      const user1 = { uid: "1", email: "user1@test.com", role: "student" };
      const user2 = { uid: "2", email: "user2@test.com", role: "representative" };

      act(() => {
        result.current.setCurrentUser(user1);
      });

      await waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith(
          "currentUser",
          JSON.stringify(user1)
        );
      });

      act(() => {
        result.current.setCurrentUser(user2);
      });

      await waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith(
          "currentUser",
          JSON.stringify(user2)
        );
      });
    });
  });
});

describe("useAuth Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageStore = {};
  });

  describe("Within Provider", () => {
    it("returns context value when used within AuthProvider", () => {
      mockOnAuthStateChanged.mockImplementation((callback) => {
        if (typeof callback === 'function') callback(null);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      expect(result.current).toHaveProperty("currentUser");
      expect(result.current).toHaveProperty("firebaseUser");
      expect(result.current).toHaveProperty("loading");
      expect(result.current).toHaveProperty("setCurrentUser");
    });
  });

  describe("Outside Provider", () => {
    it("throws error when used outside AuthProvider", () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow("useAuth must be used within an AuthProvider");

      consoleError.mockRestore();
    });
  });
});
