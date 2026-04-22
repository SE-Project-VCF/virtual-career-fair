import { describe, it, expect } from "vitest"
import {
  compareJobsByDate,
  formatJobLocationLine,
  getSaveButtonLabel,
} from "../companyJobHelpers"

describe("formatJobLocationLine", () => {
  it("returns Remote when remote flag is true", () => {
    expect(formatJobLocationLine({ locationIsRemote: true, createdAt: null })).toBe("Remote")
  })

  it("uses location string when city/state present", () => {
    expect(
      formatJobLocationLine({
        locationIsRemote: false,
        locationCity: "SF",
        locationState: "CA",
        location: "SF Bay",
        createdAt: null,
      })
    ).toBe("SF Bay")
  })

  it("joins city and state when location empty", () => {
    expect(
      formatJobLocationLine({
        locationIsRemote: false,
        locationCity: "Austin",
        locationState: "TX",
        location: null,
        createdAt: null,
      })
    ).toBe("Austin, TX")
  })

  it("returns standalone location when no structured city/state", () => {
    expect(
      formatJobLocationLine({
        locationIsRemote: false,
        location: "HQ",
        createdAt: null,
      })
    ).toBe("HQ")
  })

  it("returns placeholder when nothing set", () => {
    expect(formatJobLocationLine({ createdAt: null })).toBe("Location not set")
  })
})

describe("compareJobsByDate", () => {
  it("sorts newer first", () => {
    expect(
      compareJobsByDate({ createdAt: 100 }, { createdAt: 200 })
    ).toBeGreaterThan(0)
  })

  it("treats missing createdAt as older", () => {
    expect(compareJobsByDate({ createdAt: null }, { createdAt: 1 })).toBeGreaterThan(0)
    expect(compareJobsByDate({ createdAt: 1 }, { createdAt: null })).toBeLessThan(0)
  })

  it("returns 0 when both missing", () => {
    expect(compareJobsByDate({ createdAt: null }, { createdAt: null })).toBe(0)
  })
})

describe("getSaveButtonLabel", () => {
  it("returns Saving when saving", () => {
    expect(getSaveButtonLabel(true, null)).toBe("Saving...")
  })

  it("returns Update when editing", () => {
    expect(getSaveButtonLabel(false, { id: "j1" })).toBe("Update Job")
  })

  it("returns Publish when creating", () => {
    expect(getSaveButtonLabel(false, null)).toBe("Publish Job")
  })
})
