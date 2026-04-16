jest.mock("../services/mapboxGeocode", () => ({
  forwardGeocode: jest.fn(),
}));

const { forwardGeocode } = require("../services/mapboxGeocode");
const {
  verifyOfficeLocationInput,
  virtualFairGeocodeQuery,
  trimPart,
  HUB_GEOCODE_QUERY_MAX_LEN,
} = require("../services/verifiedOfficeLocation");

function okGeo(overrides = {}) {
  return {
    lat: 30,
    lng: -97,
    placeName: "Austin, TX, USA",
    city: "Austin",
    state: "TX",
    country: "US",
    postcode: "78701",
    mapboxId: "mbx-1",
    ...overrides,
  };
}

describe("verifiedOfficeLocation helpers", () => {
  it("trimPart trims strings and coerces null", () => {
    expect(trimPart(null)).toBe("");
    expect(trimPart("  hi  ")).toBe("hi");
    expect(trimPart(42)).toBe("42");
  });

  it("virtualFairGeocodeQuery builds city/state and optional zip", () => {
    expect(virtualFairGeocodeQuery("Austin", "TX", "")).toBe("Austin, TX");
    expect(virtualFairGeocodeQuery("Austin", "TX", "78701")).toBe("Austin, TX 78701");
    expect(virtualFairGeocodeQuery("", "", "78701")).toBe("78701");
  });
});

describe("verifyOfficeLocationInput", () => {
  const originalToken = process.env.MAPBOX_ACCESS_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = "test-mapbox-token";
  });

  afterAll(() => {
    process.env.MAPBOX_ACCESS_TOKEN = originalToken;
  });

  it("returns 503 when Mapbox token is not configured", async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    const res = await verifyOfficeLocationInput({ label: "Austin, TX", city: "", state: "", zip: "" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(forwardGeocode).not.toHaveBeenCalled();
  });

  it("rejects geocode query longer than hub max", async () => {
    const long = "x".repeat(HUB_GEOCODE_QUERY_MAX_LEN + 1);
    const res = await verifyOfficeLocationInput({ label: long, geocodeQuery: long, city: "", state: "", zip: "" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(forwardGeocode).not.toHaveBeenCalled();
  });

  it("geocode-by-label path: returns 400 when Mapbox returns no feature", async () => {
    forwardGeocode.mockResolvedValue(null);
    const res = await verifyOfficeLocationInput({
      id: "loc-1",
      label: "Nowhere",
      geocodeQuery: "Nowhere",
      city: "",
      state: "",
      zip: "",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("geocode-by-label path: returns 400 when city/state cannot be resolved", async () => {
    forwardGeocode.mockResolvedValue(okGeo({ city: null, state: null }));
    const res = await verifyOfficeLocationInput({
      id: "loc-1",
      label: "Somewhere",
      geocodeQuery: "Somewhere",
      city: "",
      state: "",
      zip: "",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("geocode-by-label path: returns 400 when postcode from Mapbox is too long", async () => {
    forwardGeocode.mockResolvedValue(okGeo({ postcode: "z".repeat(21) }));
    const res = await verifyOfficeLocationInput({
      id: "loc-1",
      label: "Austin",
      geocodeQuery: "Austin",
      city: "",
      state: "",
      zip: "",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("geocode-by-label path: succeeds and preserves trimmed id", async () => {
    forwardGeocode.mockResolvedValue(okGeo());
    const res = await verifyOfficeLocationInput({
      id: "  my-id  ",
      label: "  Austin HQ  ",
      geocodeQuery: "Austin TX",
      city: "",
      state: "",
      zip: "",
    });
    expect(res.ok).toBe(true);
    expect(res.value.id).toBe("my-id");
    expect(res.value.label).toBe("Austin HQ");
    expect(res.value.city).toBe("Austin");
    expect(res.value.state).toBe("TX");
    expect(res.value.zip).toBe("78701");
    expect(res.value.mapboxId).toBe("mbx-1");
  });

  it("geocode-by-label path: generates id when missing", async () => {
    jest.spyOn(Date, "now").mockReturnValue(111);
    jest.spyOn(Math, "random").mockReturnValue(0.123456789);
    forwardGeocode.mockResolvedValue(okGeo());
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "Austin TX",
      city: "",
      state: "",
      zip: "",
    });
    expect(res.ok).toBe(true);
    expect(res.value.id).toMatch(/^loc-111-/);
    expect(res.value.label).toBe("Austin, TX, USA");
    Date.now.mockRestore();
    Math.random.mockRestore();
  });

  it("city/state/zip path: rejects zip longer than 20 chars", async () => {
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "",
      city: "",
      state: "",
      zip: "z".repeat(21),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(forwardGeocode).not.toHaveBeenCalled();
  });

  it("city/state/zip path: rejects empty composed query", async () => {
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "",
      city: "   ",
      state: "",
      zip: "",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(forwardGeocode).not.toHaveBeenCalled();
  });

  it("city/state/zip path: rejects composed query longer than hub max", async () => {
    const city = "x".repeat(HUB_GEOCODE_QUERY_MAX_LEN);
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "",
      city,
      state: "YY",
      zip: "",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("city/state/zip path: returns 400 when geocode yields nothing", async () => {
    forwardGeocode.mockResolvedValue(null);
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "",
      city: "Austin",
      state: "TX",
      zip: "",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("city/state/zip path: returns 400 when resolved city/state still missing", async () => {
    forwardGeocode.mockResolvedValue(okGeo({ city: null, state: null }));
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "",
      city: "",
      state: "",
      zip: "78701",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("city/state/zip path: rejects client zip before geocode when longer than 20 chars", async () => {
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "",
      city: "Austin",
      state: "TX",
      zip: "z".repeat(21),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(forwardGeocode).not.toHaveBeenCalled();
  });

  it("city/state/zip path: rejects when resolved zip from Mapbox exceeds 20 chars", async () => {
    forwardGeocode.mockResolvedValue(okGeo({ postcode: "z".repeat(21) }));
    const res = await verifyOfficeLocationInput({
      label: "",
      geocodeQuery: "",
      city: "Austin",
      state: "TX",
      zip: "",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("city/state/zip path: succeeds using client city/state with Mapbox fill-ins", async () => {
    forwardGeocode.mockResolvedValue(okGeo({ city: null, state: null, postcode: "78702" }));
    const res = await verifyOfficeLocationInput({
      id: "fixed",
      label: "Custom label",
      geocodeQuery: "",
      city: "Austin",
      state: "TX",
      zip: "",
    });
    expect(res.ok).toBe(true);
    expect(res.value.city).toBe("Austin");
    expect(res.value.state).toBe("TX");
    expect(res.value.zip).toBe("78702");
    expect(res.value.label).toBe("Custom label");
  });

  it("city/state/zip path: uses geocode placeName when label blank", async () => {
    forwardGeocode.mockResolvedValue(okGeo());
    const res = await verifyOfficeLocationInput({
      geocodeQuery: "",
      label: "",
      city: "Austin",
      state: "TX",
      zip: "",
    });
    expect(res.ok).toBe(true);
    expect(res.value.label).toBe("Austin, TX, USA");
  });
});
