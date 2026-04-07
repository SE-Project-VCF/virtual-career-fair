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

  it("geoPointToJson returns null for nullish or invalid shapes", () => {
    expect(geoPointToJson(null)).toBeNull();
    expect(geoPointToJson(undefined)).toBeNull();
    expect(geoPointToJson({ latitude: "nope", longitude: 1 })).toBeNull();
    expect(geoPointToJson({ latitude: 1 })).toBeNull();
  });

  it("geoPointToJson supports Firestore-style _latitude / _longitude", () => {
    expect(geoPointToJson({ _latitude: 35.2, _longitude: -80.8 })).toEqual({
      latitude: 35.2,
      longitude: -80.8,
    });
  });

  it("venueFieldsFromDoc returns null venue fields when data is nullish", () => {
    const empty = {
      venueCity: null,
      venueState: null,
      venueZip: null,
      venueCountry: null,
      venueGeo: null,
    };
    expect(venueFieldsFromDoc(null)).toEqual(empty);
    expect(venueFieldsFromDoc(undefined)).toEqual(empty);
  });

  it("venueFieldsFromDoc fills nulls for missing keys on partial documents", () => {
    expect(venueFieldsFromDoc({})).toEqual({
      venueCity: null,
      venueState: null,
      venueZip: null,
      venueCountry: null,
      venueGeo: null,
    });
  });
});
