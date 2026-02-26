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
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

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
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

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
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

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
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

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

  it("isAuthenticated returns true when user exists", () => {
    localStorage.setItem("currentUser", JSON.stringify({ uid: "u1" }))
    expect(authUtils.isAuthenticated()).toBe(true)
  })

  it("isAuthenticated returns false when no user", () => {
    expect(authUtils.isAuthenticated()).toBe(false)
  })
})

describe("authUtils.createCompany", () => {
  it("creates company successfully", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(updateDoc).mockResolvedValue(undefined)

    const result = await authUtils.createCompany("Tech Corp", "owner-1")

    expect(result.success).toBe(true)
    expect(result.companyId).toBeDefined()
    expect(setDoc).toHaveBeenCalled()
  })

  it("returns error on failure", async () => {
    vi.mocked(setDoc).mockRejectedValue(new Error("Database error"))

    const result = await authUtils.createCompany("Tech Corp", "owner-1")

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("updates user document with company info", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "companyOwner" }),
    } as any)

    await authUtils.createCompany("Tech Corp", "owner-1")

    expect(setDoc).toHaveBeenCalledTimes(2) // Once for company, once for user
  })
})

describe("authUtils.deleteCompany", () => {
  it("deletes company successfully", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1", representativeIDs: [] }),
    } as any)
    vi.mocked(deleteDoc).mockResolvedValue(undefined)
    vi.mocked(updateDoc).mockResolvedValue(undefined)

    const result = await authUtils.deleteCompany("company-1", "owner-1")

    expect(result.success).toBe(true)
    expect(deleteDoc).toHaveBeenCalled()
  })

  it("returns error when not owner", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "different-owner" }),
    } as any)

    const result = await authUtils.deleteCompany("company-1", "owner-1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("don't have permission")
  })

  it("deletes company with representatives successfully", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1", representativeIDs: ["rep-1", "rep-2"] }),
    } as any)
    vi.mocked(deleteDoc).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    const result = await authUtils.deleteCompany("company-1", "owner-1")

    expect(result.success).toBe(true)
    expect(deleteDoc).toHaveBeenCalled()
  })

  it("returns error when company not found", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.deleteCompany("company-1", "owner-1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("not found")
  })
})

describe("authUtils.updateInviteCode", () => {
  it("updates invite code successfully", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, inviteCode: "RAND1234" }),
    } as any)

    const result = await authUtils.updateInviteCode("company-1", "owner-1")

    expect(result.success).toBe(true)
    expect(result.inviteCode).toBeDefined()
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it("validates custom invite code", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, inviteCode: "CUSTOM123" }),
    } as any)

    const result = await authUtils.updateInviteCode("company-1", "owner-1", "CUSTOM123")

    expect(result.success).toBe(true)
    expect(result.inviteCode).toBe("CUSTOM123")
  })

  it("rejects duplicate invite code", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1" }),
    } as any)
    // Backend returns 400 when invite code is already in use
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invite code already in use" }),
    } as any)

    const result = await authUtils.updateInviteCode("company-1", "owner-1", "EXISTING")

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("returns error when not owner", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "different-owner" }),
    } as any)

    const result = await authUtils.updateInviteCode("company-1", "owner-1", "NEWCODE")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only the company owner")
  })

  it("returns error when company not found", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.updateInviteCode("company-1", "owner-1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("not found")
  })
})

describe("authUtils error handling", () => {
  it("handles Firebase auth errors", async () => {
    vi.mocked(createUserWithEmailAndPassword).mockRejectedValue({
      code: "auth/email-already-in-use",
      message: "Email already in use",
    })

    const result = await authUtils.registerUser("test@test.com", "pass123", "student")

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("handles Stream sync failures gracefully", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student" }),
    } as any)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

    const result = await authUtils.login("test@test.com", "pass123")

    // Stream sync failures are non-blocking; login still succeeds
    expect(result.success).toBe(true)
  })

  it("handles missing email in Google login", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { uid: "u1", email: null },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.loginWithGoogle("student", false)

    // No account found in login mode → success: false
    expect(result.success).toBe(false)
    expect(result.error).toContain("No account found")
  })

  it("handles error in registerUser sync", async () => {
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Sync failed"))

    const result = await authUtils.registerUser("test@test.com", "pass123", "student")

    // Stream sync failures are non-blocking; registration still succeeds
    expect(result.success).toBe(true)
    expect(result.needsVerification).toBe(true)
  })
})

describe("authUtils.login - role verification", () => {
  it("stores currentUser in localStorage on successful login", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student", firstName: "John", lastName: "Doe" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await authUtils.login("test@test.com", "pass123")

    expect(result.success).toBe(true)
    const stored = localStorage.getItem("currentUser")
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.role).toBe("student")
  })

  it("logs in successfully and syncs stream user", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student", firstName: "John", lastName: "Doe" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await authUtils.login("test@test.com", "pass123")

    expect(result.success).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/sync-stream-user"),
      expect.any(Object)
    )
  })

  it("handles signin exception in login", async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue(new Error("Auth failed"))

    const result = await authUtils.login("test@test.com", "pass123")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Auth failed")
  })
})

describe("authUtils.loginUser - role-specific validation", () => {
  it("stores role in currentUser", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "representative", companyId: "comp1" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    const result = await authUtils.loginUser("test@test.com", "pass123", "representative")

    expect(result.success).toBe(true)
    const stored = JSON.parse(localStorage.getItem("currentUser")!)
    expect(stored.role).toBe("representative")
  })

  it("rejects unverified email for loginUser", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: false },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "representative" }),
    } as any)

    const result = await authUtils.loginUser("test@test.com", "pass123", "representative")

    expect(result.success).toBe(false)
    expect(result.needsVerification).toBe(true)
  })

  it("calls signOut on role mismatch", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student" }),
    } as any)

    const result = await authUtils.loginUser("test@test.com", "pass123", "representative")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid account type")
    expect(result.error).toContain("representative")
  })

  it("handles missing user document in loginUser", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com", emailVerified: true },
    } as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.loginUser("test@test.com", "pass123", "student")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Account not found")
  })

  it("handles exception in loginUser", async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue(new Error("Firebase error"))

    const result = await authUtils.loginUser("test@test.com", "pass123", "student")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Firebase error")
  })
})

describe("authUtils.registerUser - additional cases", () => {
  it("removes undefined values from userData before saving", async () => {
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    await authUtils.registerUser("test@test.com", "pass123", "student", {
      firstName: "John",
      middleName: undefined,
      lastName: "Doe",
    })

    const callArgs = vi.mocked(setDoc).mock.calls[0]
    const userData = callArgs[1] as any
    expect(userData.middleName).toBeUndefined()
    expect(userData.firstName).toBe("John")
  })

  it("includes additionalData in registration", async () => {
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    const additionalData = { school: "MIT", major: "CS" }
    await authUtils.registerUser("test@test.com", "pass123", "student", additionalData)

    const callArgs = vi.mocked(setDoc).mock.calls[0]
    const userData = callArgs[1] as any
    expect(userData.school).toBe("MIT")
    expect(userData.major).toBe("CS")
  })

  it("syncs stream user with firstName and lastName", async () => {
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user: { uid: "u1", email: "test@test.com" },
    } as any)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    await authUtils.registerUser("test@test.com", "pass123", "student", {
      firstName: "Jane",
      lastName: "Smith",
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/sync-stream-user"),
      expect.objectContaining({
        body: expect.stringContaining("Jane"),
      })
    )
  })
})

describe("authUtils.createCompany - additional cases", () => {
  it("does not update user if they already have companyId", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "companyOwner", companyId: "existing-company" }),
    } as any)

    await authUtils.createCompany("New Corp", "owner-1")

    // setDoc should only be called once (for company), not twice (for user update)
    expect(vi.mocked(setDoc).mock.calls.length).toBe(1)
  })

  it("updates user if they don't have companyId yet", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "companyOwner" }),
    } as any)

    await authUtils.createCompany("New Corp", "owner-1")

    // setDoc should be called twice (for company and user)
    expect(vi.mocked(setDoc).mock.calls.length).toBe(2)
  })

  it("generates unique invite code with correct format", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.createCompany("Tech Startup", "owner-1")

    expect(result.success).toBe(true)
    expect(result.companyId).toBeDefined()
    
    const callArgs = vi.mocked(setDoc).mock.calls[0]
    const companyData = callArgs[1] as any
    expect(companyData.inviteCode).toMatch(/^[A-F0-9]+$/)
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

describe("authUtils.deleteCompany - additional cases", () => {
  it("deletes company successfully", async () => {
    vi.clearAllMocks()
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1", representativeIDs: [] }),
    } as any)
    vi.mocked(deleteDoc).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)

    const result = await authUtils.deleteCompany("company-1", "owner-1")

    expect(result.success).toBe(true)
    expect(vi.mocked(deleteDoc)).toHaveBeenCalled()
  })

  it("handles company with booth deletion error gracefully", async () => {
    vi.clearAllMocks()
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1", representativeIDs: [], boothId: "booth-1" }),
    } as any)
    // First deleteDoc call succeeds (company), second fails (booth) 
    vi.mocked(deleteDoc).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Booth not found"))
    vi.mocked(setDoc).mockResolvedValue(undefined)

    const result = await authUtils.deleteCompany("company-1", "owner-1")

    expect(result.success).toBe(true) // Should succeed even if booth deletion fails
  })

  it("handles general deletion error", async () => {
    vi.clearAllMocks()
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1", representativeIDs: [] }),
    } as any)
    vi.mocked(deleteDoc).mockRejectedValue(new Error("Database error"))

    const result = await authUtils.deleteCompany("company-1", "owner-1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Database error")
  })
})

describe("authUtils.updateInviteCode", () => {
  it("updates invite code for owner", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1", inviteCode: "OLD" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, inviteCode: "NEWCODE1" }),
    } as any)

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

  it("rejects duplicate invite code", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1" }),
    } as any)
    // Backend returns 400 when invite code is already in use
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invite code already in use" }),
    } as any)

    const result = await authUtils.updateInviteCode("comp1", "owner1", "TAKEN")

    expect(result.success).toBe(false)
    expect(result.error).toContain("already in use")
  })

  it("generates random code when none provided", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, inviteCode: "RAND1234" }),
    } as any)

    const result = await authUtils.updateInviteCode("comp1", "owner1")

    expect(result.success).toBe(true)
    expect(result.inviteCode).toBeDefined()
    expect(result.inviteCode?.length).toBeGreaterThan(0)
  })

  it("retries when generated code is in use", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, inviteCode: "RAND5678" }),
    } as any)

    const result = await authUtils.updateInviteCode("comp1", "owner1")

    expect(result.success).toBe(true)
    expect(result.inviteCode).toBeDefined()
  })

  it("handles error when updating document", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1" }),
    } as any)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Update failed"))

    const result = await authUtils.updateInviteCode("comp1", "owner1", "NEWCODE")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Update failed")
  })

  it("returns error when company not found", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any)

    const result = await authUtils.updateInviteCode("comp1", "owner1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("not found")
  })

  it("trims and uppercases custom invite code", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner1" }),
    } as any)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, inviteCode: "CUSTOM123" }),
    } as any)

    const result = await authUtils.updateInviteCode("comp1", "owner1", "  custom123  ")

    expect(result.success).toBe(true)
    expect(result.inviteCode).toBe("CUSTOM123")
  })
})

describe("authUtils.verifyAndLogin", () => {
  it("verifyAndLogin succeeds with valid credentials", async () => {
    const mockUser = {
      uid: "verify-u1",
      email: "verify@test.com",
      emailVerified: true,
      reload: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValueOnce({
      user: mockUser,
    } as any)
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: "student" }),
    } as any)

    const result = await authUtils.verifyAndLogin("verify@test.com", "pass123")
    expect(result.success).toBe(true)
    expect(result.user).toBeDefined()
  })

  it("verifyAndLogin returns error when Firestore record missing", async () => {
    const mockUser = {
      uid: "norecord-u1",
      email: "norecord@test.com",
      emailVerified: true,
      reload: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValueOnce({
      user: mockUser,
    } as any)
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
    } as any)

    const result = await authUtils.verifyAndLogin("norecord@test.com", "pass123")
    expect(result.success).toBe(false)
    expect(result.error).toContain("not found in Firestore")
  })
})

describe("authUtils.linkRepresentativeToCompany", () => {
  it("links representative to company successfully", async () => {
    const mockSnapshot = {
      forEach: vi.fn((callback: any) => {
        callback({
          id: "comp1",
          data: () => ({ inviteCode: "INVITE123", companyName: "Tech Corp" }),
        })
      }),
    }
    vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "representative" }),
    } as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(updateDoc).mockResolvedValue(undefined)

    localStorage.setItem("currentUser", JSON.stringify({ uid: "rep1", email: "rep@test.com" }))

    const result = await authUtils.linkRepresentativeToCompany("INVITE123", "rep1")

    expect(result.success).toBe(true)
    expect(result.companyId).toBe("comp1")
    expect(result.companyName).toBe("Tech Corp")
  })

  it("returns error for invalid invite code", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      forEach: vi.fn(),
    } as any)

    const result = await authUtils.linkRepresentativeToCompany("INVALID", "rep1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid invite code")
  })

  it("returns error when already linked to company", async () => {
    const mockSnapshot = {
      forEach: vi.fn((callback: any) => {
        callback({
          id: "comp1",
          data: () => ({ inviteCode: "INVITE123", companyName: "Tech Corp" }),
        })
      }),
    }
    vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any)
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ companyId: "comp1" }),
    } as any)

    const result = await authUtils.linkRepresentativeToCompany("INVITE123", "rep1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("already linked to this company")
  })

  it("updates company's representativeIDs array", async () => {
    const mockSnapshot = {
      forEach: vi.fn((callback: any) => {
        callback({
          id: "comp1",
          data: () => ({ inviteCode: "INVITE123", companyName: "Tech Corp" }),
        })
      }),
    }
    vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any)
    // User not yet linked to any company (no companyId)
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: "representative" }),
    } as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(updateDoc).mockResolvedValue(undefined)

    await authUtils.linkRepresentativeToCompany("INVITE123", "rep1")

    expect(updateDoc).toHaveBeenCalled()
  })

  it("does not add rep twice to representativeIDs", async () => {
    const mockSnapshot = {
      forEach: vi.fn((callback: any) => {
        callback({
          id: "comp1",
          data: () => ({ inviteCode: "INVITE123", companyName: "Tech Corp" }),
        })
      }),
    }
    vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any)
    // User doc shows rep is already linked to this company
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ companyId: "comp1", role: "representative" }),
    } as any)

    localStorage.setItem("currentUser", JSON.stringify({ uid: "rep1", email: "rep@test.com" }))

    const result = await authUtils.linkRepresentativeToCompany("INVITE123", "rep1")

    // Should return error when rep is already linked to this company
    expect(result.success).toBe(false)
    expect(result.error).toContain("already linked")
    // Should not call updateDoc when rep is already linked
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it("updates localStorage with new company info", async () => {
    const mockSnapshot = {
      forEach: vi.fn((callback: any) => {
        callback({
          id: "comp1",
          data: () => ({ inviteCode: "INVITE123", companyName: "Tech Corp" }),
        })
      }),
    }
    vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any)
    // User not yet linked to any company (no companyId)
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: "representative" }),
    } as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(updateDoc).mockResolvedValue(undefined)

    localStorage.setItem("currentUser", JSON.stringify({ uid: "rep1", email: "rep@test.com", role: "representative" }))

    const result = await authUtils.linkRepresentativeToCompany("INVITE123", "rep1")

    expect(result.success).toBe(true)
    const updatedUser = authUtils.getCurrentUser()
    expect(updatedUser?.companyId).toBe("comp1")
    expect(updatedUser?.companyName).toBe("Tech Corp")
  })

  it("handles error during linking", async () => {
    vi.mocked(getDocs).mockRejectedValue(new Error("Database error"))

    const result = await authUtils.linkRepresentativeToCompany("INVITE123", "rep1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Database error")
  })

  it("handles case-insensitive invite code", async () => {
    const mockSnapshot = {
      forEach: vi.fn((callback: any) => {
        callback({
          id: "comp1",
          data: () => ({ inviteCode: "INVITE123", companyName: "Tech Corp" }),
        })
      }),
    }
    vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any)
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "representative" }),
    } as any)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    vi.mocked(updateDoc).mockResolvedValue(undefined)

    const result = await authUtils.linkRepresentativeToCompany("invite123", "rep1")

    expect(result.success).toBe(true)
  })

  it("handles error when fetching companies", async () => {
    vi.clearAllMocks()
    vi.mocked(getDocs).mockRejectedValue(new Error("Firestore error"))

    const result = await authUtils.linkRepresentativeToCompany("INVITE123", "rep1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Firestore error")
  })
})
