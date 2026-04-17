import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  ensureCompanyViewerAccess,
  logClientError,
  mapApiRecordToJob,
} from "../companyPageUtils"

describe("logClientError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logs Error name for Error instances", () => {
    logClientError("ctx", new Error("x"))
    expect(console.error).toHaveBeenCalledWith("ctx", "Error")
  })

  it("logs typeof for non-Error values", () => {
    logClientError("ctx", "string")
    expect(console.error).toHaveBeenCalledWith("ctx", "string")
  })
})

describe("mapApiRecordToJob", () => {
  it("maps known API fields", () => {
    const j = mapApiRecordToJob({
      id: "j1",
      companyId: "c1",
      name: "N",
      description: "D",
      majorsAssociated: "M",
      applicationLink: "https://a.com",
      createdAt: 100,
      locationIsRemote: true,
      locationCity: "X",
      locationState: "Y",
      location: "Z",
    })
    expect(j).toMatchObject({
      id: "j1",
      companyId: "c1",
      name: "N",
      description: "D",
      majorsAssociated: "M",
      applicationLink: "https://a.com",
      createdAt: 100,
      locationIsRemote: true,
      locationCity: "X",
      locationState: "Y",
      location: "Z",
    })
  })

  it("treats non-true locationIsRemote as false-ish for flag", () => {
    const j = mapApiRecordToJob({
      id: "j1",
      companyId: "c1",
      name: "N",
      description: "D",
      majorsAssociated: "M",
      applicationLink: null,
      createdAt: null,
      locationIsRemote: false,
    })
    expect(j.locationIsRemote).toBe(false)
  })
})

describe("ensureCompanyViewerAccess", () => {
  const nav = {
    setError: vi.fn(),
    navigate: vi.fn(),
  }

  beforeEach(() => {
    nav.setError.mockClear()
    nav.navigate.mockClear()
  })

  it("returns true for company owner viewing own company", () => {
    const ok = ensureCompanyViewerAccess(
      { ownerId: "o1", representativeIDs: [] },
      "o1",
      "companyOwner",
      nav
    )
    expect(ok).toBe(true)
    expect(nav.navigate).not.toHaveBeenCalled()
  })

  it("blocks owner viewing another company", () => {
    const ok = ensureCompanyViewerAccess(
      { ownerId: "other", representativeIDs: [] },
      "o1",
      "companyOwner",
      nav
    )
    expect(ok).toBe(false)
    expect(nav.setError).toHaveBeenCalled()
    expect(nav.navigate).toHaveBeenCalledWith("/companies")
  })

  it("allows representative listed on company", () => {
    const ok = ensureCompanyViewerAccess(
      { ownerId: "o1", representativeIDs: ["r1"] },
      "r1",
      "representative",
      nav
    )
    expect(ok).toBe(true)
  })

  it("blocks representative not in list", () => {
    const ok = ensureCompanyViewerAccess(
      { ownerId: "o1", representativeIDs: ["r2"] },
      "r1",
      "representative",
      nav
    )
    expect(ok).toBe(false)
    expect(nav.navigate).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects non-employer roles to dashboard", () => {
    const ok = ensureCompanyViewerAccess(
      { ownerId: "o1", representativeIDs: [] },
      "s1",
      "student",
      nav
    )
    expect(ok).toBe(false)
    expect(nav.navigate).toHaveBeenCalledWith("/dashboard")
  })
})
