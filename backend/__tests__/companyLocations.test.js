const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  function GeoPoint(lat, lng) {
    this.latitude = lat;
    this.longitude = lng;
  }
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, GeoPoint }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
  };
});

jest.mock("../services/mapboxGeocode", () => ({
  forwardGeocode: jest.fn(async (address) => {
    if (!address || !String(address).trim()) return null;
    return {
      lat: 35.2,
      lng: -80.8,
      placeName: "Charlotte, NC, USA",
      city: "Charlotte",
      state: "NC",
      country: "US",
      postcode: "28202",
      mapboxId: "mock-id",
    };
  }),
}));

jest.mock("../firebase", () => ({
  db: { collection: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { forwardGeocode } = require("../services/mapboxGeocode");

function authHeader(uid = "owner-1") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

describe("Company locations API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";
  });

  describe("GET /api/companies/:companyId/locations", () => {
    it("returns 404 when company missing", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "companies") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      });
      const res = await request(app).get("/api/companies/c1/locations");
      expect(res.status).toBe(404);
    });

    it("returns locations for a company", async () => {
      const locDoc = {
        label: "HQ",
        venueCity: "Charlotte",
        venueState: "NC",
        venueZip: "28202",
        venueCountry: "US",
        venueGeo: { latitude: 35, longitude: -80 },
        createdAt: { toMillis: () => 1 },
        updatedAt: { toMillis: () => 2 },
      };
      db.collection.mockImplementation((name) => {
        if (name === "companies") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDocSnap({ companyName: "Acme" }, true, "c1")),
              collection: jest.fn((sub) => {
                if (sub === "locations") {
                  return {
                    orderBy: jest.fn(() => ({
                      get: jest.fn().mockResolvedValue(
                        mockQuerySnap([{ id: "loc1", data: () => locDoc }])
                      ),
                    })),
                  };
                }
                return { get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
              }),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      });

      const res = await request(app).get("/api/companies/c1/locations");
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe("Acme");
      expect(res.body.locations).toHaveLength(1);
      expect(res.body.locations[0].id).toBe("loc1");
      expect(res.body.locations[0].venueCity).toBe("Charlotte");
      expect(res.body.locations[0].venueGeo).toEqual({ latitude: 35, longitude: -80 });
    });
  });

  describe("POST /api/companies/:companyId/locations", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app).post("/api/companies/c1/locations").send({});
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not owner or rep", async () => {
      db.collection.mockImplementation((name) => {
        if (name === "companies") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ ownerId: "other", representativeIDs: [] }, true, "c1")
              ),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      });
      const res = await request(app)
        .post("/api/companies/c1/locations")
        .set("Authorization", authHeader("stranger"))
        .send({ venueGeocodeQuery: "Charlotte NC" });
      expect(res.status).toBe(403);
    });

    it("creates a location for owner", async () => {
      const set = jest.fn().mockResolvedValue(undefined);
      const newRef = {
        id: "new-loc",
        set,
        get: jest.fn().mockResolvedValue(
          mockDocSnap(
            {
              label: "HQ",
              venueCity: "Charlotte",
              venueState: "NC",
              venueZip: "28202",
              venueCountry: "US",
              venueGeo: { latitude: 35.2, longitude: -80.8 },
              createdAt: { toMillis: () => 1 },
              updatedAt: { toMillis: () => 2 },
            },
            true,
            "new-loc"
          )
        ),
      };
      db.collection.mockImplementation((name) => {
        if (name === "companies") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ ownerId: "owner-1", representativeIDs: [] }, true, "c1")
              ),
              collection: jest.fn((sub) => {
                if (sub === "locations") {
                  return { doc: jest.fn(() => newRef) };
                }
                return { doc: jest.fn() };
              }),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      });

      const res = await request(app)
        .post("/api/companies/c1/locations")
        .set("Authorization", authHeader("owner-1"))
        .send({ venueGeocodeQuery: "Charlotte NC", label: "HQ" });

      expect(res.status).toBe(201);
      expect(forwardGeocode).toHaveBeenCalled();
      expect(set).toHaveBeenCalled();
      expect(res.body.venueCity).toBe("Charlotte");
    });
  });

  describe("DELETE /api/companies/:companyId/locations/:locationId", () => {
    it("deletes a location", async () => {
      const del = jest.fn().mockResolvedValue(undefined);
      db.collection.mockImplementation((name) => {
        if (name === "companies") {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ ownerId: "owner-1", representativeIDs: [] }, true, "c1")
              ),
              collection: jest.fn((sub) => {
                if (sub === "locations") {
                  return {
                    doc: jest.fn(() => ({
                      get: jest.fn().mockResolvedValue(mockDocSnap({ venueCity: "X" }, true, "loc1")),
                      delete: del,
                    })),
                  };
                }
                return { doc: jest.fn() };
              }),
            })),
          };
        }
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
      });

      const res = await request(app)
        .delete("/api/companies/c1/locations/loc1")
        .set("Authorization", authHeader("owner-1"));

      expect(res.status).toBe(200);
      expect(del).toHaveBeenCalled();
    });
  });
});
