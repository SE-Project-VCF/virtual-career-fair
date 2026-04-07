import { describe, it, expect } from "vitest"
import { filterFairsForMapView } from "../FairsMapView"

describe("filterFairsForMapView", () => {
  const now = Date.now()

  it("keeps live fair with valid venueGeo", () => {
    const fairs = [
      {
        id: "a",
        name: "Live",
        startTime: null,
        endTime: null,
        venueGeo: { latitude: 40, longitude: -75 },
      },
    ]
    expect(filterFairsForMapView(fairs)).toHaveLength(1)
  })

  it("keeps upcoming fair with venueGeo and future endTime", () => {
    const fairs = [
      {
        id: "b",
        name: "Upcoming",
        startTime: now + 10000,
        endTime: now + 200000,
        venueGeo: { latitude: 41, longitude: -74 },
      },
    ]
    expect(filterFairsForMapView(fairs)).toHaveLength(1)
  })

  it("drops fairs without venueGeo", () => {
    const fairs = [
      { id: "c", name: "No geo", startTime: null, endTime: null },
      { id: "d", name: "Null geo", startTime: null, endTime: null, venueGeo: null },
    ]
    expect(filterFairsForMapView(fairs as any)).toHaveLength(0)
  })

  it("drops fairs with invalid coordinate types", () => {
    const fairs = [
      {
        id: "e",
        name: "Bad",
        startTime: null,
        endTime: null,
        venueGeo: { latitude: "x" as unknown as number, longitude: -74 },
      },
    ]
    expect(filterFairsForMapView(fairs as any)).toHaveLength(0)
  })

  it("drops ended fairs even with venueGeo", () => {
    const fairs = [
      {
        id: "f",
        name: "Past",
        startTime: null,
        endTime: now - 1000,
        venueGeo: { latitude: 42, longitude: -71 },
      },
    ]
    expect(filterFairsForMapView(fairs)).toHaveLength(0)
  })
})
