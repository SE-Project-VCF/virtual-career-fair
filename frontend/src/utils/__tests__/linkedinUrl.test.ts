import { describe, it, expect } from "vitest"
import { parseLinkedInProfileUrl } from "../linkedinUrl"

describe("parseLinkedInProfileUrl", () => {
  it("returns null href for empty or whitespace-only input", () => {
    expect(parseLinkedInProfileUrl("")).toEqual({ ok: true, href: null })
    expect(parseLinkedInProfileUrl("   \t\n")).toEqual({ ok: true, href: null })
  })

  it("accepts https://www.linkedin.com/in/… and strips hash", () => {
    const r = parseLinkedInProfileUrl("https://www.linkedin.com/in/jane-doe#contact")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.href).toBe("https://www.linkedin.com/in/jane-doe")
    }
  })

  it("prepends https when scheme is missing", () => {
    const r = parseLinkedInProfileUrl("linkedin.com/in/jane-doe")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.href).toBe("https://linkedin.com/in/jane-doe")
    }
  })

  it("accepts subdomains of linkedin.com", () => {
    const r = parseLinkedInProfileUrl("https://mobile.linkedin.com/in/x")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.href).toContain("linkedin.com")
    }
  })

  it("accepts lnkd.in short links", () => {
    const r = parseLinkedInProfileUrl("https://lnkd.in/abc123")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.href).toContain("lnkd.in")
    }
  })

  it("accepts lnkd.in subdomains", () => {
    const r = parseLinkedInProfileUrl("https://go.lnkd.in/xyz")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.href).toContain("lnkd.in")
    }
  })

  it("rejects non-LinkedIn hosts", () => {
    const r = parseLinkedInProfileUrl("https://example.com/profile")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toMatch(/linkedin\.com or lnkd\.in/i)
    }
  })

  it("returns error for strings that are not valid URLs", () => {
    const r = parseLinkedInProfileUrl("https://")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toMatch(/valid url/i)
    }
  })
})
