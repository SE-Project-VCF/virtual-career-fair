const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp }),
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    auth: jest.fn(),
  };
});

jest.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: jest.fn(() => ({
      upsertUser: jest.fn().mockResolvedValue({}),
      createToken: jest.fn().mockReturnValue("tok"),
      queryChannels: jest.fn().mockResolvedValue([]),
    })),
  },
}));

jest.mock("../firebase", () => ({
  db: { collection: jest.fn(), batch: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

jest.mock("../streamServerClient", () => ({
  streamServerClient: {
    upsertUser: jest.fn().mockResolvedValue({}),
    createToken: jest.fn().mockReturnValue("tok"),
    queryChannels: jest.fn().mockResolvedValue([]),
  },
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin } = require("../helpers");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.resetAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "owner-uid", email: "o@test.com" });
});

describe("POST /api/companies — companyNameLower write", () => {
  it("writes companyNameLower alongside companyName on creation", async () => {
    const setSpy = jest.fn().mockResolvedValue();
    const updateSpy = jest.fn().mockResolvedValue();
    const ownerDoc = mockDocSnap({ role: "companyOwner" }, true, "owner-uid");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(ownerDoc),
            update: updateSpy,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            id: "new-company-id",
            set: setSpy,
          })),
        };
      }
      return {};
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", VALID_TOKEN)
      .send({ companyName: "Acme Corp" });

    expect(res.status).toBe(201);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const written = setSpy.mock.calls[0][0];
    expect(written.companyName).toBe("Acme Corp");
    expect(written.companyNameLower).toBe("acme corp");
  });

  it("lowercases trimmed companyName for companyNameLower", async () => {
    const setSpy = jest.fn().mockResolvedValue();
    const ownerDoc = mockDocSnap({ role: "companyOwner" }, true, "owner-uid");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(ownerDoc),
            update: jest.fn().mockResolvedValue(),
          })),
        };
      }
      if (name === "companies") {
        return { doc: jest.fn(() => ({ id: "c2", set: setSpy })) };
      }
      return {};
    });

    await request(app)
      .post("/api/companies")
      .set("Authorization", VALID_TOKEN)
      .send({ companyName: "  MixedCASE Co  " });

    const written = setSpy.mock.calls[0][0];
    expect(written.companyName).toBe("MixedCASE Co");
    expect(written.companyNameLower).toBe("mixedcase co");
  });
});

describe("GET /api/companies/search", () => {
  function setupSearchMocks({
    matches = [],
    enrollments = {},
    isAdmin = true,
  } = {}) {
    if (isAdmin) {
      verifyAdmin.mockResolvedValue(null);
    } else {
      verifyAdmin.mockResolvedValue({ status: 403, error: "Only administrators..." });
    }

    const updateSpy = jest.fn().mockResolvedValue();

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const docs = matches.map((m) => ({
          id: m.companyId,
          data: () => m,
          ref: { update: updateSpy },
        }));
        const querySnap = { docs, empty: docs.length === 0 };
        const chain = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(querySnap),
        };
        return chain;
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn((cid) => ({
                get: jest.fn().mockResolvedValue(
                  mockDocSnap(enrollments[cid] ?? null, !!enrollments[cid], cid)
                ),
              })),
            })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    return { updateSpy };
  }

  it("returns 401 when unauthenticated", async () => {
    auth.verifyIdToken.mockRejectedValueOnce(new Error("invalid"));
    const res = await request(app).get("/api/companies/search?q=acme&fairId=f1");
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not an administrator", async () => {
    setupSearchMocks({ isAdmin: false });
    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(403);
  });

  it("returns 400 when q is missing", async () => {
    setupSearchMocks();
    const res = await request(app)
      .get("/api/companies/search?fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/q/i);
  });

  it("returns 400 when q is empty after trim", async () => {
    setupSearchMocks();
    const res = await request(app)
      .get("/api/companies/search?q=%20%20&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
  });

  it("returns 400 when fairId is missing", async () => {
    setupSearchMocks();
    const res = await request(app)
      .get("/api/companies/search?q=acme")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fairId/i);
  });

  it("returns matching companies with shaped fields", async () => {
    setupSearchMocks({
      matches: [
        {
          companyId: "c1",
          companyName: "Acme Corp",
          companyNameLower: "acme corp",
          logoUrl: "https://logo/acme.png",
          industry: "Software",
          remoteEmployer: false,
          officeLocations: [{ city: "Austin", state: "TX" }],
        },
      ],
    });

    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      {
        companyId: "c1",
        companyName: "Acme Corp",
        logoUrl: "https://logo/acme.png",
        industry: "Software",
        primaryLocation: "Austin, TX",
        alreadyEnrolled: false,
      },
    ]);
  });

  it("marks already-enrolled companies", async () => {
    setupSearchMocks({
      matches: [
        { companyId: "c1", companyName: "Acme", companyNameLower: "acme" },
        { companyId: "c2", companyName: "Acme Two", companyNameLower: "acme two" },
      ],
      enrollments: { c1: { companyId: "c1" } },
    });

    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.results.map((r) => [r.companyId, r]));
    expect(byId.c1.alreadyEnrolled).toBe(true);
    expect(byId.c2.alreadyEnrolled).toBe(false);
  });

  it("lowercases q before querying (case-insensitive search)", async () => {
    let receivedLowerBound = null;

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const chain = {
          where: jest.fn(function (field, op, value) {
            if (op === ">=") receivedLowerBound = value;
            return chain;
          }),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        };
        return chain;
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
            })),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    verifyAdmin.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/companies/search?q=ACME&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(receivedLowerBound).toBe("acme");
  });

  it("resolves primaryLocation to 'Remote' for remote employers", async () => {
    setupSearchMocks({
      matches: [
        {
          companyId: "c1",
          companyName: "Remote Co",
          companyNameLower: "remote co",
          remoteEmployer: true,
          officeLocations: [],
        },
      ],
    });
    const res = await request(app)
      .get("/api/companies/search?q=remote&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.body.results[0].primaryLocation).toBe("Remote");
  });

  it("resolves primaryLocation to null when no remote and no offices", async () => {
    setupSearchMocks({
      matches: [
        { companyId: "c1", companyName: "Mystery", companyNameLower: "mystery" },
      ],
    });
    const res = await request(app)
      .get("/api/companies/search?q=mystery&fairId=f1")
      .set("Authorization", VALID_TOKEN);
    expect(res.body.results[0].primaryLocation).toBeNull();
  });

  it("clamps limit to 50", async () => {
    let receivedLimit = null;
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        const chain = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn(function (n) { receivedLimit = n; return chain; }),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        };
        return chain;
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });
    verifyAdmin.mockResolvedValue(null);

    await request(app)
      .get("/api/companies/search?q=a&fairId=f1&limit=999")
      .set("Authorization", VALID_TOKEN);

    expect(receivedLimit).toBe(50);
  });

  it("lazy-backfills companyNameLower for hits that lack it", async () => {
    const { updateSpy } = setupSearchMocks({
      matches: [
        { companyId: "c1", companyName: "Acme" /* no companyNameLower */ },
      ],
    });

    const res = await request(app)
      .get("/api/companies/search?q=acme&fairId=f1")
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(updateSpy).toHaveBeenCalledWith({ companyNameLower: "acme" });
  });
});
