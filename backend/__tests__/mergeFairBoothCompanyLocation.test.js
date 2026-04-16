const {
  mergeFairBoothPayloadWithCompany,
  legacyBoothLocationLine,
} = require("../services/mergeFairBoothCompanyLocation");

describe("mergeFairBoothCompanyLocation", () => {
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
});
