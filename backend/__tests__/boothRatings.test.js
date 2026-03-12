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
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin } = require("../helpers");

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "student-uid", email: "student@test.com" });
  return "Bearer valid-token";
}

function setupDbMock(configs) {
  db.collection.mockImplementation((name) => {
    const cfg = configs[name] || {};
    const docRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap(cfg.docData, cfg.docExists !== false, cfg.docId || "mock-id")
      ),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      id: cfg.docId || "mock-id",
    };
    return {
      doc: jest.fn(() => docRef),
      add: jest.fn().mockResolvedValue({ id: cfg.newDocId || "new-rating-id" }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(cfg.docs || [])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

describe("POST /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/booths/booth1/ratings").send({ rating: 4 });
    expect(res.status).toBe(401);
  });

  it("returns 400 when rating is missing", async () => {
    setupDbMock({
      users: { docData: { role: "student" } },
      booths: { docData: { companyName: "Acme" } },
      boothRatings: { docs: [] },
    });
    const res = await request(app)
      .post("/api/booths/booth1/ratings")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating is required/i);
  });

  it("returns 400 when rating is out of range", async () => {
    setupDbMock({
      users: { docData: { role: "student" } },
      booths: { docData: { companyName: "Acme" } },
      boothRatings: { docs: [] },
    });
    const res = await request(app)
      .post("/api/booths/booth1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/between 1 and 5/i);
  });

  it("returns 400 when comment exceeds 1000 characters", async () => {
    setupDbMock({
      users: { docData: { role: "student" } },
      booths: { docData: { companyName: "Acme" } },
      boothRatings: { docs: [] },
    });
    const res = await request(app)
      .post("/api/booths/booth1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4, comment: "A".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1000 characters/i);
  });

  it("returns 403 when user is not a student", async () => {
    setupDbMock({
      users: { docData: { role: "companyOwner" } },
      booths: { docData: { companyName: "Acme" } },
      boothRatings: { docs: [] },
    });
    const res = await request(app)
      .post("/api/booths/booth1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only students/i);
  });

  it("allows a student to resubmit (upsert) a rating", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "student-uid", email: "student@test.com" });
    const mockSet = jest.fn().mockResolvedValue({});
    db.collection.mockImplementation((col) => {
      if (col === "booths") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ companyName: "Acme" }) }),
            collection: () => ({ doc: () => ({ set: mockSet }) }),
          }),
        };
      }
      if (col === "users") {
        return { doc: () => ({ get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ role: "student" }) }) }) };
      }
    });

    const res = await request(app)
      .post("/api/booths/booth123/ratings")
      .set("Authorization", "Bearer token")
      .send({ rating: 4, comment: "Good booth" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSet).toHaveBeenCalled();
  });

  it("creates rating successfully", async () => {
    const mockSet = jest.fn().mockResolvedValue({});
    db.collection.mockImplementation((col) => {
      if (col === "booths") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ companyName: "Acme Corp" }) }),
            collection: () => ({ doc: () => ({ set: mockSet }) }),
          }),
        };
      }
      if (col === "users") {
        return { doc: () => ({ get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ role: "student" }) }) }) };
      }
    });
    const res = await request(app)
      .post("/api/booths/booth1/ratings")
      .set("Authorization", authHeader())
      .send({ rating: 4, comment: "Great booth!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ratingId).toBe("student-uid");
  });
});

describe("GET /api/booths/:boothId/ratings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/booths/booth1/ratings");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "user-uid" });
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    const res = await request(app)
      .get("/api/booths/booth1/ratings")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(403);
  });

  it("returns ratings and averageRating for a booth", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid" });
    verifyAdmin.mockResolvedValue(null);
    const ratingDocs = [
      mockDocSnap({ studentId: "s1", rating: 4, comment: "Good", createdAt: { toMillis: () => 1000 } }, true, "r1"),
      mockDocSnap({ studentId: "s2", rating: 2, comment: null, createdAt: { toMillis: () => 2000 } }, true, "r2"),
    ];
    setupDbMock({ boothRatings: { docs: ratingDocs } });
    const res = await request(app)
      .get("/api/booths/booth1/ratings")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(2);
    expect(res.body.averageRating).toBe(3);
    expect(res.body.ratings).toHaveLength(2);
  });
});

describe("GET /api/booth-ratings/analytics", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/booth-ratings/analytics");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "user-uid" });
    verifyAdmin.mockResolvedValue({ error: "Only administrators can manage schedules", status: 403 });
    const res = await request(app)
      .get("/api/booth-ratings/analytics")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(403);
  });

  it("returns grouped averages across all booths", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid" });
    verifyAdmin.mockResolvedValue(null);
    const ratingDocs = [
      mockDocSnap({ boothId: "b1", companyName: "Acme", rating: 5 }, true, "r1"),
      mockDocSnap({ boothId: "b1", companyName: "Acme", rating: 3 }, true, "r2"),
      mockDocSnap({ boothId: "b2", companyName: "Globex", rating: 4 }, true, "r3"),
    ];
    setupDbMock({ boothRatings: { docs: ratingDocs } });
    const res = await request(app)
      .get("/api/booth-ratings/analytics")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(res.body.analytics).toHaveLength(2);
    const acme = res.body.analytics.find((a) => a.boothId === "b1");
    expect(acme.averageRating).toBe(4);
    expect(acme.totalRatings).toBe(2);
    const globex = res.body.analytics.find((a) => a.boothId === "b2");
    expect(globex.averageRating).toBe(4);
    expect(globex.totalRatings).toBe(1);
  });
});
