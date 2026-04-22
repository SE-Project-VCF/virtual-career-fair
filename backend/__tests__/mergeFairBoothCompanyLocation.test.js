const {
  mergeFairBoothPayloadWithCompany,
  legacyBoothLocationLine,
  officeLocationsFromCompanyDoc,
  locationDisplayFromCompany,
} = require("../services/mergeFairBoothCompanyLocation");

describe("officeLocationsFromCompanyDoc", () => {
  it("returns empty array for non-array input", () => {
    expect(officeLocationsFromCompanyDoc(null)).toEqual([]);
    expect(officeLocationsFromCompanyDoc({})).toEqual([]);
  });

  it("skips invalid entries and keeps venueGeo-backed coordinates", () => {
    const out = officeLocationsFromCompanyDoc([
      null,
      { id: "", label: "A", lat: 1, lng: 2 },
      { id: "1", label: "", lat: 1, lng: 2 },
      { id: 123, label: "skipped-numeric-id", lat: 1, lng: 2 },
      { id: "skip-label", label: 456, lat: 1, lng: 2 },
      { id: "2", label: "Geo", city: "Austin", state: "TX", venueGeo: { latitude: 30.2, longitude: -97.7 } },
      { id: "3", label: "Bad", lat: Number.NaN, lng: 1 },
    ]);
    expect(out.map((x) => x.id)).toEqual(["2"]);
    expect(out[0].lat).toBeCloseTo(30.2);
    expect(out[0].lng).toBeCloseTo(-97.7);
  });

  it("normalizes zip, country, and mapboxId from mixed Firestore shapes", () => {
    const out = officeLocationsFromCompanyDoc([
      {
        id: "z",
        label: "HQ",
        city: "Austin",
        state: "TX",
        zip: 78701,
        country: "US",
        mapboxId: "id-1",
        lat: 1,
        lng: 2,
      },
      {
        id: "n",
        label: "No extras",
        city: "",
        state: "",
        lat: 3,
        lng: 4,
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].zip).toBe("78701");
    expect(out[0].country).toBe("US");
    expect(out[0].mapboxId).toBe("id-1");
    expect(out[1].zip).toBeNull();
    expect(out[1].country).toBeNull();
    expect(out[1].mapboxId).toBeNull();
  });

  it("reads Firestore-style GeoPoint with underscore fields", () => {
    const out = officeLocationsFromCompanyDoc([
      { id: "g", label: "Here", city: "", state: "", venueGeo: { _latitude: 10, _longitude: 20 } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lat).toBe(10);
    expect(out[0].lng).toBe(20);
  });

  it("uses venueGeo when lat/lng pair is incomplete on the entry", () => {
    const out = officeLocationsFromCompanyDoc([
      {
        id: "mix",
        label: "Mixed",
        city: "",
        state: "",
        lat: 5,
        venueGeo: { latitude: 40, longitude: -105 },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lat).toBe(40);
    expect(out[0].lng).toBe(-105);
  });
});

describe("locationDisplayFromCompany", () => {
  it("treats null company data like missing locations", () => {
    expect(locationDisplayFromCompany(null, { location: "HQ" })).toBe("HQ");
  });

  it("drops office rows without id/label so display falls back to legacy booth", () => {
    const display = locationDisplayFromCompany(
      {
        remoteEmployer: false,
        officeLocations: [{ id: "1", label: "", city: "Denver", state: "CO", lat: 1, lng: 2 }],
      },
      { locationCity: "SF", locationState: "CA" },
    );
    expect(display).toBe("SF, CA");
  });

  it("returns legacy booth remote when company has no offices", () => {
    expect(locationDisplayFromCompany({}, { locationIsRemote: true })).toBe("Remote");
  });
});

describe("legacyBoothLocationLine", () => {
  it("returns empty string for missing or non-object booth", () => {
    expect(legacyBoothLocationLine(null)).toBe("");
    expect(legacyBoothLocationLine(undefined)).toBe("");
    expect(legacyBoothLocationLine("nope")).toBe("");
  });

  it("uses freeform location when city/state are absent", () => {
    expect(legacyBoothLocationLine({ locationIsRemote: false, location: "Worldwide" })).toBe("Worldwide");
  });

  it("returns empty when no location fields apply", () => {
    expect(legacyBoothLocationLine({ locationIsRemote: false })).toBe("");
  });
});

describe("mergeFairBoothPayloadWithCompany", () => {
  it("prefers remote employer on company", () => {
    const out = mergeFairBoothPayloadWithCompany(
      { companyId: "c1", companyName: "Acme", locationCity: "NYC", locationState: "NY" },
      { remoteEmployer: true, officeLocations: [] },
    );
    expect(out.remoteEmployer).toBe(true);
    expect(out.locationDisplay).toBe("Remote");
    expect(out.location).toBe("Remote");
  });

  it("joins office locations from company", () => {
    const out = mergeFairBoothPayloadWithCompany(
      { companyId: "c1", location: "Old" },
      {
        remoteEmployer: false,
        officeLocations: [
          { id: "1", label: "Austin, TX", city: "Austin", state: "TX", lat: 1, lng: 2 },
          { id: "2", label: "Denver, CO", city: "Denver", state: "CO", lat: 3, lng: 4 },
        ],
      },
    );
    expect(out.locationDisplay).toContain("Austin");
    expect(out.locationDisplay).toContain("Denver");
    expect(out.officeLocations).toHaveLength(2);
  });

  it("falls back to legacy booth line when company has no locations", () => {
    const booth = { companyId: "c1", locationIsRemote: false, locationCity: "SF", locationState: "CA" };
    const out = mergeFairBoothPayloadWithCompany(booth, {});
    expect(out.locationDisplay).toBe("SF, CA");
    expect(legacyBoothLocationLine(booth)).toBe("SF, CA");
  });

  it("handles null company data like an empty company", () => {
    const booth = { companyId: "c1", location: "Legacy" };
    const out = mergeFairBoothPayloadWithCompany(booth, null);
    expect(out.remoteEmployer).toBe(false);
    expect(out.officeLocations).toEqual([]);
    expect(out.locationDisplay).toBe("Legacy");
    expect(out.location).toBe("Legacy");
  });

  it("uses locationDisplay for merged location when booth location empty", () => {
    const out = mergeFairBoothPayloadWithCompany(
      { companyId: "c1", location: null },
      { remoteEmployer: false, officeLocations: [{ id: "1", label: "Boulder, CO", lat: 1, lng: 2 }] },
    );
    expect(out.location).toBe("Boulder, CO");
  });

  it("sets merged location to null when display and booth location are empty", () => {
    const out = mergeFairBoothPayloadWithCompany({ companyId: "c1", location: null }, {});
    expect(out.locationDisplay).toBe("");
    expect(out.location).toBeNull();
  });
});
