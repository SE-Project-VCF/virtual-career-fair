const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    arrayUnion: jest.fn((...args) => ({ _type: "arrayUnion", args })),
    arrayRemove: jest.fn((...args) => ({ _type: "arrayRemove", args })),
  };
  return {
    firestore: Object.assign(jest.fn(), { Timestamp, FieldValue }),
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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), runTransaction: jest.fn(), batch: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin } = require("../helpers");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid", email: "a@test.com" });
  verifyAdmin.mockResolvedValue(null);
});

describe("POST /api/fairs/:fairId/enroll", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/fairs/fair1/enroll").send({ companyId: "comp1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when both companyId and inviteCode are missing", async () => {
    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/companyId or inviteCode/i);
  });

  it("returns 404 when fair does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
      };
    });

    const res = await request(app)
      .post("/api/fairs/fair-missing/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/fair not found/i);
  });

  it("enrolls company by companyId for admin", async () => {
    const batch = {
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    db.batch.mockReturnValue(batch);

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ name: "Spring Fair" }, true, "fair1")),
            collection: jest.fn((sub) => {
              if (sub === "enrollments") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
                  })),
                };
              }
              if (sub === "booths") {
                return {
                  doc: jest.fn(() => ({ id: "fairBooth1" })),
                };
              }
              if (sub === "jobs") {
                return {
                  doc: jest.fn(() => ({ id: "fairJob1" })),
                };
              }
              return { doc: jest.fn(() => ({ id: "x" })) };
            }),
          })),
        };
      }

      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ companyName: "Acme", ownerId: "owner-1" }, true, "comp1")
            ),
          })),
        };
      }

      if (name === "jobs") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }

      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
      };
    });

    const res = await request(app)
      .post("/api/fairs/fair1/enroll")
      .set("Authorization", VALID_TOKEN)
      .send({ companyId: "comp1" });

    expect(res.status).toBe(201);
    expect(res.body.fairId).toBe("fair1");
    expect(res.body.boothId).toBe("fairBooth1");
    expect(batch.commit).toHaveBeenCalled();
  });
});
