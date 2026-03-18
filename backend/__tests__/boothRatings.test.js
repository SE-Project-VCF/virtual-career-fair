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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), runTransaction: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return {
    ...actual,
    verifyAdmin: jest.fn(),
    evaluateFairStatusForFair: jest.fn(),
  };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { evaluateFairStatusForFair, verifyAdmin } = require("../helpers");

function makeFairsCollectionWithBooth(boothSnapshot) {
  const boothDocRef = {
    get: jest.fn().mockResolvedValue(boothSnapshot),
  };
  const boothsCollection = {
    doc: jest.fn(() => boothDocRef),
  };
  const fairDocRef = {
    collection: jest.fn(() => boothsCollection),
  };
  return {
    doc: jest.fn(() => fairDocRef),
  };
}

function makeUsersCollectionForAdminRole() {
  return {
    doc: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ role: "administrator" }) }),
    })),
  };
}

describe("GET /api/fairs/:fairId/booths/:boothId (current route behavior)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when fair is not live and caller is not admin", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });

    const res = await request(app).get("/api/fairs/fair1/booths/booth1");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not currently live/i);
  });

  it("returns booth details when fair is live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return makeFairsCollectionWithBooth({
          exists: true,
          id: "booth1",
          data: () => ({ companyName: "Acme", industry: "Tech" }),
        });
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/fairs/fair1/booths/booth1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("booth1");
    expect(res.body.companyName).toBe("Acme");
  });

  it("allows admin when fair is not live", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid" });

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return makeUsersCollectionForAdminRole();
      }
      if (name === "fairs") {
        return makeFairsCollectionWithBooth({
          exists: true,
          id: "booth1",
          data: () => ({ companyName: "Acme" }),
        });
      }
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .get("/api/fairs/fair1/booths/booth1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("booth1");
  });

  it("returns 404 when booth does not exist", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return makeFairsCollectionWithBooth({ exists: false });
      }
      return { doc: jest.fn() };
    });

    const res = await request(app).get("/api/fairs/fair1/booths/missing");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/booth not found/i);
  });
});

/* -------------------------------------------------------
   Helpers for booth ratings endpoint tests
------------------------------------------------------- */
const { mockDocSnap, mockQuerySnap } = require("./testUtils");

function setupBoothsMock({
  userData,
  boothData,
  boothExists = true,
  ratingData,
  ratingExists = false,
  ratingsSnap = [],
  companyData,
  companyExists = true,
} = {}) {
  db.collection.mockImplementation((name) => {
    if (name === "users") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap(userData, userData != null)
          ),
        })),
      };
    }
    if (name === "booths") {
      const ratingsSubcol = {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(ratingData, ratingExists)),
          set: jest.fn().mockResolvedValue(undefined),
        })),
        get: jest.fn().mockResolvedValue(mockQuerySnap(ratingsSnap)),
      };
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(boothData, boothExists, "booth-1")),
          collection: jest.fn(() => ratingsSubcol),
        })),
      };
    }
    if (name === "companies") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(companyData, companyExists)),
        })),
      };
    }
    return {
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
    };
  });
}

function authAs(uid) {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

/* =======================================================
   POST /api/booths/:boothId/ratings
======================================================= */
describe("POST /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/booths/booth-1/ratings").send({ rating: 4 });
    expect(res.status).toBe(401);
  });

  it("returns 404 when user not found", async () => {
    setupBoothsMock({ userData: null, boothData: null });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("student-uid"))
      .send({ rating: 4 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 403 when user is not a student", async () => {
    setupBoothsMock({ userData: { role: "companyOwner" }, boothData: null });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("owner-uid"))
      .send({ rating: 4 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/student/i);
  });

  it("returns 400 when rating is missing", async () => {
    setupBoothsMock({ userData: { role: "student" }, boothData: { companyName: "Acme" } });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("student-uid"))
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is out of range (>5)", async () => {
    setupBoothsMock({ userData: { role: "student" }, boothData: { companyName: "Acme" } });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("student-uid"))
      .send({ rating: 6 });
    expect(res.status).toBe(400);
  });

  it("returns 404 when booth not found", async () => {
    setupBoothsMock({ userData: { role: "student" }, boothData: null, boothExists: false });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("student-uid"))
      .send({ rating: 4 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/booth not found/i);
  });

  it("submits rating successfully", async () => {
    setupBoothsMock({ userData: { role: "student" }, boothData: { companyName: "Acme" } });
    const res = await request(app)
      .post("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("student-uid"))
      .send({ rating: 5, comment: "Great booth!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* =======================================================
   GET /api/booths/:boothId/ratings/me
======================================================= */
describe("GET /api/booths/:boothId/ratings/me", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/booths/booth-1/ratings/me");
    expect(res.status).toBe(401);
  });

  it("returns null when student has no rating", async () => {
    setupBoothsMock({ userData: { role: "student" }, boothData: { companyName: "Acme" }, ratingExists: false });
    const res = await request(app)
      .get("/api/booths/booth-1/ratings/me")
      .set("Authorization", authAs("student-uid"));
    expect(res.status).toBe(200);
    expect(res.body.rating).toBeNull();
  });

  it("returns existing rating data", async () => {
    setupBoothsMock({
      userData: { role: "student" },
      boothData: { companyName: "Acme" },
      ratingExists: true,
      ratingData: { rating: 4, comment: "Good", createdAt: { toMillis: () => 1000000 } },
    });
    const res = await request(app)
      .get("/api/booths/booth-1/ratings/me")
      .set("Authorization", authAs("student-uid"));
    expect(res.status).toBe(200);
    expect(res.body.rating.rating).toBe(4);
    expect(res.body.rating.comment).toBe("Good");
    expect(res.body.rating.createdAt).toBe(1000000);
  });
});

/* =======================================================
   GET /api/booths/:boothId/ratings
======================================================= */
describe("GET /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/booths/booth-1/ratings");
    expect(res.status).toBe(401);
  });

  it("returns 404 when booth not found (admin)", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupBoothsMock({ userData: { role: "administrator" }, boothData: null, boothExists: false });
    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("admin-uid"));
    expect(res.status).toBe(404);
  });

  it("returns ratings list with averageRating for admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupBoothsMock({
      userData: { role: "administrator" },
      boothData: { companyName: "Acme" },
      ratingsSnap: [
        { id: "s1", data: () => ({ rating: 4, comment: "Good", createdAt: { toMillis: () => 1000 } }) },
        { id: "s2", data: () => ({ rating: 2, comment: null, createdAt: null }) },
      ],
    });
    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("admin-uid"));
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(2);
    expect(res.body.averageRating).toBe(3);
  });

  it("returns 403 when non-admin user has no companyId", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupBoothsMock({
      userData: { role: "student", companyId: null },
      boothData: { companyName: "Acme" },
    });
    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("student-uid"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when company does not own this booth", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupBoothsMock({
      userData: { role: "companyOwner", companyId: "company-1" },
      boothData: { companyName: "Acme" },
      companyData: { boothId: "different-booth" },
    });
    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("owner-uid"));
    expect(res.status).toBe(403);
  });

  it("returns ratings for company owner of this booth", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupBoothsMock({
      userData: { role: "companyOwner", companyId: "company-1" },
      boothData: { companyName: "Acme" },
      companyData: { boothId: "booth-1" },
      ratingsSnap: [
        { id: "s1", data: () => ({ rating: 5, comment: "Excellent", createdAt: { toMillis: () => 2000 } }) },
      ],
    });
    const res = await request(app)
      .get("/api/booths/booth-1/ratings")
      .set("Authorization", authAs("owner-uid"));
    expect(res.status).toBe(200);
    expect(res.body.totalRatings).toBe(1);
    expect(res.body.averageRating).toBe(5);
    expect(res.body.ratings[0].comment).toBe("Excellent");
  });
});
