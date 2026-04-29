import { describe, it, expect } from "vitest"
import { formatCompanyOfficeLocationsForDisplay } from "../companyOfficeLocationDisplay"

describe("formatCompanyOfficeLocationsForDisplay", () => {
  it("returns Remote when company is remote-first", () => {
    expect(formatCompanyOfficeLocationsForDisplay({ remoteEmployer: true }, {})).toBe("Remote")
  })

  it("joins office location labels with semicolons", () => {
    const s = formatCompanyOfficeLocationsForDisplay(
      {
        remoteEmployer: false,
        officeLocations: [
          { label: "  Austin  ", city: "Austin", state: "TX" },
          { label: "Denver, CO", city: "Denver", state: "CO" },
        ],
      },
      { location: "Legacy" },
    )
    expect(s).toBe("Austin; Denver, CO")
  })

  it("uses city and state when label missing", () => {
    expect(
      formatCompanyOfficeLocationsForDisplay(
        { officeLocations: [{ label: "", city: "Boulder", state: "CO" }] },
        {},
      ),
    ).toBe("Boulder, CO")
  })

  it("falls back to legacy booth remote and city/state", () => {
    expect(formatCompanyOfficeLocationsForDisplay({}, { locationIsRemote: true })).toBe("Remote")
    expect(formatCompanyOfficeLocationsForDisplay({}, { locationCity: "SF", locationState: "CA" })).toBe("SF, CA")
    expect(formatCompanyOfficeLocationsForDisplay({}, { location: "  HQ  " })).toBe("HQ")
  })

  it("returns empty string when nothing applies", () => {
    expect(formatCompanyOfficeLocationsForDisplay(undefined, undefined)).toBe("")
  })
})
