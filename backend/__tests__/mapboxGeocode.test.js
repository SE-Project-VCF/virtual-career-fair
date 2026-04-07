const { forwardGeocode, suggestPlaces } = require("../services/mapboxGeocode");

describe("mapboxGeocode.forwardGeocode", () => {
  const origToken = process.env.MAPBOX_ACCESS_TOKEN;
  const origFetch = global.fetch;

  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = "pk.testtoken_for_unit_tests";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = origToken;
    global.fetch = origFetch;
    jest.clearAllMocks();
  });

  it("returns null when MAPBOX_ACCESS_TOKEN is missing", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "";
    await expect(forwardGeocode("Boston MA")).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null for blank address", async () => {
    await expect(forwardGeocode("   ")).resolves.toBeNull();
    await expect(forwardGeocode("")).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws when Mapbox responds non-OK", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    await expect(forwardGeocode("1 Main St")).rejects.toThrow(/Mapbox geocoding failed: 401/);
  });

  it("returns null when features are empty or center is missing", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    await expect(forwardGeocode("nowhere")).resolves.toBeNull();

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ id: "x", place_name: "X" }] }),
    });
    await expect(forwardGeocode("x")).resolves.toBeNull();
  });

  it("parses feature context and place_type into structured result", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            id: "mapbox.place",
            place_name: "Charlotte, NC, USA",
            center: [-80.8431, 35.2271],
            place_type: ["place"],
            text: "Charlotte",
            context: [
              { id: "region.123", text: "North Carolina", short_code: "US-NC" },
              { id: "country.456", short_code: "US" },
              { id: "postcode.789", text: "28202" },
            ],
          },
        ],
      }),
    });

    const r = await forwardGeocode("Charlotte NC");
    expect(r).toMatchObject({
      lat: 35.2271,
      lng: -80.8431,
      placeName: "Charlotte, NC, USA",
      city: "Charlotte",
      state: "NC",
      country: "US",
      postcode: "28202",
      mapboxId: "mapbox.place",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("api.mapbox.com/geocoding/v5/mapbox.places/"),
    );
  });

  it("uses region.text when short_code has no hyphen", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            id: "f1",
            place_name: "Somewhere",
            center: [-70, 40],
            place_type: ["region"],
            text: "New England",
            context: [{ id: "region.1", text: "New England" }],
          },
        ],
      }),
    });
    const r = await forwardGeocode("region only");
    expect(r.state).toBe("New England");
  });
});

describe("mapboxGeocode.suggestPlaces", () => {
  const origToken = process.env.MAPBOX_ACCESS_TOKEN;
  const origFetch = global.fetch;

  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = "pk.testtoken_for_unit_tests";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = origToken;
    global.fetch = origFetch;
    jest.clearAllMocks();
  });

  it("returns [] without token or when query is too short", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "";
    await expect(suggestPlaces("Boston")).resolves.toEqual([]);

    process.env.MAPBOX_ACCESS_TOKEN = "pk.x";
    await expect(suggestPlaces("a")).resolves.toEqual([]);
    await expect(suggestPlaces("")).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns [] and logs when Mapbox responds non-OK", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "error",
    });
    const out = await suggestPlaces("Cleveland");
    expect(out).toEqual([]);
  });

  it("maps features to suggestions and filters invalid coordinates", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            id: "place.1",
            place_name: "Cleveland, OH, USA",
            center: [-81.69, 41.5],
            context: [
              { id: "place.1", text: "Cleveland" },
              { id: "region.x", text: "Ohio", short_code: "US-OH" },
            ],
          },
          {
            id: "bad",
            place_name: "Bad",
            center: [NaN, 41],
          },
        ],
      }),
    });

    const out = await suggestPlaces("Cle", { limit: 5 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "place.1",
      label: "Cleveland, OH, USA",
      lat: 41.5,
      lng: -81.69,
      city: "Cleveland",
      state: "OH",
    });
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain("limit=5");
    expect(url).toContain("autocomplete=true");
  });

  it("clamps limit to 1..10", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    await suggestPlaces("Test", { limit: -1 });
    expect(global.fetch.mock.calls[0][0]).toContain("limit=1");

    global.fetch.mockClear();
    await suggestPlaces("Test", { limit: 99 });
    expect(global.fetch.mock.calls[0][0]).toContain("limit=10");
  });

  it("handles missing features array", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await expect(suggestPlaces("Xy")).resolves.toEqual([]);
  });
});
