import { describe, it, expect, vi, beforeEach } from "vitest"
import { authUtils } from "../auth"
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signInWithPopup,
} from "firebase/auth"
import { setDoc, getDoc, getDocs, deleteDoc, updateDoc } from "firebase/firestore"

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe("authUtils.registerUser", () => {
  it("registers a student successfully", async () => {
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await authUtils.registerUser("test@test.com", "pass123", "student", {
      firstName: "John",
      lastName: "Doe",
    })

    expect(result.success).toBe(true)
    expect(result.needsVerification).toBe(true)
    expect(setDoc).toHaveBeenCalled()
    expect(sendEmailVerification).toHaveBeenCalled()
  })

  it("returns error on failure", async () => {
    vi.mocked(createUserWithEmailAndPassword).mockRejectedValue(new Error("Email already in use"))

    const result = await authUtils.registerUser("test@test.com", "pass123", "student")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Email already in use")
  })
})

describe("authUtils.login", () => {
  it("logs in successfully with verified email", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student", firstName: "John", lastName: "Doe" }),
    } as any)
    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await authUtils.login("test@test.com", "pass123")

    expect(result.success).toBe(true)
    expect(localStorage.getItem("currentUser")).toBeTruthy()
  })

  it("rejects unverified email", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: false },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student" }),
    } as any)

    const result = await authUtils.login("test@test.com", "pass123")

    expect(result.success).toBe(false)
    expect(result.needsVerification).toBe(true)
  })

  it("rejects if user doc does not exist", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.login("test@test.com", "pass123")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Account not found.")
  })
})

describe("authUtils.loginUser", () => {
  it("logs in with correct role", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student", firstName: "John" }),
    } as any)
    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await authUtils.loginUser("test@test.com", "pass123", "student")

    expect(result.success).toBe(true)
  })

  it("rejects wrong role", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "companyOwner" }),
    } as any)

    const result = await authUtils.loginUser("test@test.com", "pass123", "student")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid account type")
  })
})

describe("authUtils.loginWithGoogle", () => {
  it("logs in existing user on login screen", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student", firstName: "John", lastName: "Doe" }),
    } as any)
    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await authUtils.loginWithGoogle("student", false)

    expect(result.success).toBe(true)
    expect(result.exists).toBe(true)
    expect(result.role).toBe("student")
  })

  it("blocks existing user on register screen", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student" }),
    } as any)

    const result = await authUtils.loginWithGoogle("student", true)

    expect(result.success).toBe(false)
    expect(result.exists).toBe(true)
    expect(result.error).toContain("already exists")
  })

  it("returns needsProfile for new user on register screen", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.loginWithGoogle("student", true)

    expect(result.success).toBe(true)
    expect(result.exists).toBe(false)
    expect(result.needsProfile).toBe(true)
  })

  it("rejects new user on login screen", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.loginWithGoogle("student", false)

    expect(result.success).toBe(false)
    expect(result.error).toContain("register first")
  })
})

describe("authUtils.logout / getCurrentUser / isAuthenticated", () => {
  it("logout clears localStorage", () => {
    localStorage.setItem("currentUser", JSON.stringify({ uid: "u1" }))
    authUtils.logout()
    expect(localStorage.getItem("currentUser")).toBeNull()
  })

  it("getCurrentUser returns parsed user", () => {
    const user = { uid: "u1", email: "test@test.com", role: "student" as const }
    localStorage.setItem("currentUser", JSON.stringify(user))
    expect(authUtils.getCurrentUser()).toEqual(user)
  })

  it("getCurrentUser returns null when empty", () => {
    expect(authUtils.getCurrentUser()).toBeNull()
  })

  it("isAuthenticated returns true when user exists", () => {
    localStorage.setItem("currentUser", JSON.stringify({ uid: "u1", email: "a", role: "student" }))
    expect(authUtils.isAuthenticated()).toBe(true)
  })

  it("isAuthenticated returns false when no user", () => {
    expect(authUtils.isAuthenticated()).toBe(false)
  })
})

describe("authUtils.createCompany", () => {
  it("creates company successfully", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "companyOwner" }),
    } as any)

    const result = await authUtils.createCompany("Test Co", "owner1")

    expect(result.success).toBe(true)
    expect(result.companyId).toBeDefined()
  })

  it("handles error", async () => {
    vi.mocked(setDoc).mockRejectedValue(new Error("Firestore error"))

    const result = await authUtils.createCompany("Test Co", "owner1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Firestore error")
  })
})

describe("authUtils.deleteCompany", () => {
  it("deletes company when owner matches", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1", representativeIDs: [] }),
    } as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(deleteDoc).mockResolvedValue(undefined)

    const result = await authUtils.deleteCompany("comp1", "owner1")

    expect(result.success).toBe(true)
    expect(deleteDoc).toHaveBeenCalled()
  })

  it("rejects non-owner", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "other-owner", representativeIDs: [] }),
    } as any)

    const result = await authUtils.deleteCompany("comp1", "wrong-owner")

    expect(result.success).toBe(false)
    expect(result.error).toContain("permission")
  })

  it("handles company not found", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.deleteCompany("comp1", "owner1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Company not found.")
  })
})

describe("authUtils.updateInviteCode", () => {
  it("updates invite code for owner", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1", inviteCode: "OLD" }),
    } as any)
    vi.mocked(getDocs).mockResolvedValue({
      forEach: vi.fn(),
    } as any)
    vi.mocked(updateDoc).mockResolvedValue(undefined)

    const result = await authUtils.updateInviteCode("comp1", "owner1", "NEWCODE1")

    expect(result.success).toBe(true)
    expect(result.inviteCode).toBe("NEWCODE1")
  })

  it("rejects invalid invite code format", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1" }),
    } as any)

    const result = await authUtils.updateInviteCode("comp1", "owner1", "ab")

    expect(result.success).toBe(false)
    expect(result.error).toContain("4-20 characters")
  })

  it("rejects non-owner", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "other-owner" }),
    } as any)

    const result = await authUtils.updateInviteCode("comp1", "wrong-user")

    expect(result.success).toBe(false)
    expect(result.error).toContain("owner")
  })
})
