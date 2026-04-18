import { describe, it, expect } from "vitest"
import { formatJobLocation, locationQueryParamFromSuggest } from "../jobSearchDisplay"

describe("formatJobLocation", () => {
  it('returns "Remote" when locationIsRemote is true', () => {
    expect(formatJobLocation({ locationIsRemote: true })).toBe("Remote")
  })

  it("uses explicit location string when city/state are set", () => {
    expect(
      formatJobLocation({
        locationCity: "Boston",
        locationState: "MA",
        location: "Custom HQ",
      })
    ).toBe("Custom HQ")
  })

  it("joins city and state when location string is absent", () => {
    expect(
      formatJobLocation({
        locationCity: "Austin",
        locationState: "TX",
      })
    ).toBe("Austin, TX")
  })

  it("uses only location when no city/state", () => {
    expect(formatJobLocation({ location: "HQ — Building A" })).toBe("HQ — Building A")
  })

  it('returns em dash when nothing is set', () => {
    expect(formatJobLocation({})).toBe("—")
  })
})

describe("locationQueryParamFromSuggest", () => {
  it("prefers city and state when both exist", () => {
    expect(
      locationQueryParamFromSuggest({
        id: "1",
        label: "Seattle, Washington, United States",
        lat: 0,
        lng: 0,
        city: "Seattle",
        state: "WA",
      })
    ).toBe("Seattle, WA")
  })

  it("uses city only when state is missing", () => {
    expect(
      locationQueryParamFromSuggest({
        id: "1",
        label: "Paris, France",
        lat: 0,
        lng: 0,
        city: "Paris",
        state: null,
      })
    ).toBe("Paris")
  })

  it("uses first segment of label when city is missing", () => {
    expect(
      locationQueryParamFromSuggest({
        id: "1",
        label: "Portland, OR, USA",
        lat: 0,
        lng: 0,
        city: null,
        state: null,
      })
    ).toBe("Portland")
  })
})
