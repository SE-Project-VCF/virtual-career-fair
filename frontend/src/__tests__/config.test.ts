import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("config", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("API_URL uses VITE_API_URL when set", async () => {
    vi.stubEnv("VITE_API_URL", "http://api.example:9000")
    const mod = await import("../config")
    expect(mod.API_URL).toBe("http://api.example:9000")
  })

  it("API_URL falls back to localhost when VITE_API_URL is empty", async () => {
    vi.stubEnv("VITE_API_URL", "")
    const mod = await import("../config")
    expect(mod.API_URL).toBe("http://localhost:5000")
  })

  it("API_URL strips trailing slashes", async () => {
    vi.stubEnv("VITE_API_URL", "http://api.example:9000///")
    const mod = await import("../config")
    expect(mod.API_URL).toBe("http://api.example:9000")
  })

  it("API_URL strips trailing /api path case-insensitively", async () => {
    vi.stubEnv("VITE_API_URL", "http://x:5000/api/")
    const mod = await import("../config")
    expect(mod.API_URL).toBe("http://x:5000")
  })

  it("MAPBOX_ACCESS_TOKEN is empty when VITE_MAPBOX_ACCESS_TOKEN is not a string", async () => {
    vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", undefined as unknown as string)
    const mod = await import("../config")
    expect(mod.MAPBOX_ACCESS_TOKEN).toBe("")
    expect(mod.MAPBOX_TOKEN_LOOKS_PUBLIC).toBe(false)
  })

  it("normalizeMapboxToken strips BOM, CR, uses first line, and unwraps double quotes", async () => {
    const token = `"pk.${"x".repeat(25)}"`
    const raw = `\r\n\uFEFF${token}\nignored-line`
    vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", raw)
    const mod = await import("../config")
    expect(mod.MAPBOX_ACCESS_TOKEN.startsWith("pk.")).toBe(true)
    expect(mod.MAPBOX_ACCESS_TOKEN).not.toContain("\r")
    expect(mod.MAPBOX_ACCESS_TOKEN).not.toContain('"')
    expect(mod.MAPBOX_TOKEN_LOOKS_PUBLIC).toBe(true)
  })

  it("normalizeMapboxToken unwraps single-quoted token", async () => {
    vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", `'pk.${"y".repeat(25)}'`)
    const mod = await import("../config")
    expect(mod.MAPBOX_ACCESS_TOKEN.startsWith("pk.")).toBe(true)
    expect(mod.MAPBOX_TOKEN_LOOKS_PUBLIC).toBe(true)
  })

  it("MAPBOX_TOKEN_LOOKS_PUBLIC is false for non-pk tokens", async () => {
    vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", `sk.${"z".repeat(30)}`)
    const mod = await import("../config")
    expect(mod.MAPBOX_ACCESS_TOKEN.startsWith("sk.")).toBe(true)
    expect(mod.MAPBOX_TOKEN_LOOKS_PUBLIC).toBe(false)
  })

  it("MAPBOX_TOKEN_LOOKS_PUBLIC is false when pk token is too short", async () => {
    vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "pk.short")
    const mod = await import("../config")
    expect(mod.MAPBOX_ACCESS_TOKEN).toBe("pk.short")
    expect(mod.MAPBOX_TOKEN_LOOKS_PUBLIC).toBe(false)
  })
})
