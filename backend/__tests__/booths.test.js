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

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
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
      add: jest.fn().mockResolvedValue({ id: cfg.newDocId || "new-booth-id" }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(cfg.docs || [])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

describe("POST /api/booths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/booths").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ boothName: "Booth A" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when boothName is missing", async () => {
    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when company does not exist", async () => {
    setupDbMock({ companies: { docExists: false } });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", boothName: "Booth A" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not authorized", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "other-user", representativeIDs: [] }, docExists: true },
    });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", boothName: "Booth A" });
    expect(res.status).toBe(403);
  });

  it("creates booth successfully", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "test-uid", representativeIDs: [] }, docExists: true },
      booths: { newDocId: "booth-123" },
    });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({
        companyId: "c1",
        boothName: "Booth A",
        location: "Hall 1",
        description: "Our booth",
        representatives: ["rep1"],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.boothId).toBe("booth-123");
  });

  it("returns 500 when database add fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        add: jest.fn().mockRejectedValueOnce(new Error("DB error")),
      };
    });

    const res = await request(app)
      .post("/api/booths")
      .set("Authorization", authHeader())
      .send({
        companyId: "c1",
        boothName: "Booth A",
        location: "Hall 1",
        description: "Our booth",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("DB error");
  });
});
