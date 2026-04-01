const { haversineMiles, geoPointToJson, venueFieldsFromDoc } = require("../services/geo");

describe("geo helpers", () => {
  it("haversineMiles is ~0 for identical points", () => {
    expect(haversineMiles(35, -80, 35, -80)).toBeLessThan(0.001);
  });

  it("haversineMiles matches rough Charlotte–Atlanta distance", () => {
    const miles = haversineMiles(35.2271, -80.8431, 33.749, -84.388);
    expect(miles).toBeGreaterThan(200);
    expect(miles).toBeLessThan(280);
  });

  it("geoPointToJson handles Firestore-like GeoPoint", () => {
    const gp = { latitude: 1.5, longitude: -2.25 };
    expect(geoPointToJson(gp)).toEqual({ latitude: 1.5, longitude: -2.25 });
  });

  it("venueFieldsFromDoc maps document fields", () => {
    expect(
      venueFieldsFromDoc({
        venueCity: "C",
        venueState: "S",
        venueZip: "12345",
        venueCountry: "US",
        venueGeo: { latitude: 1, longitude: 2 },
      })
    ).toMatchObject({
      venueCity: "C",
      venueState: "S",
      venueZip: "12345",
      venueCountry: "US",
      venueGeo: { latitude: 1, longitude: 2 },
    });
  });
});
