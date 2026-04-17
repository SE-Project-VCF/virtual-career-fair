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
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "owner-uid", email: "owner@test.com" });
});

describe("GET /api/booths", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/booths").query({ companyId: "c1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 without companyId query param", async () => {
    const res = await request(app)
      .get("/api/booths")
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not owner or rep of the company", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", representativeIDs: [] }, true, "c1")
            ),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/booths")
      .query({ companyId: "c1" })
      .set("Authorization", VALID_TOKEN);
    expect(res.status).toBe(403);
  });

  it("returns all booths for the company", async () => {
    const boothDocs = [
      { id: "b1", data: () => ({ companyId: "c1", boothName: "Engineering", industry: "software" }) },
      { id: "b2", data: () => ({ companyId: "c1", boothName: "Marketing", industry: "marketing" }) },
    ];

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", representativeIDs: [] }, true, "c1")
            ),
          })),
        };
      }
      if (name === "booths") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockQuerySnap(boothDocs)),
          }),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/booths")
      .query({ companyId: "c1" })
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.booths).toHaveLength(2);
    expect(res.body.booths[0]).toMatchObject({ id: "b1", boothName: "Engineering" });
    expect(res.body.booths[1]).toMatchObject({ id: "b2", boothName: "Marketing" });
  });

  it("returns empty array when company has no booths", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "owner-uid", representativeIDs: [] }, true, "c1")
            ),
          })),
        };
      }
      if (name === "booths") {
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockQuerySnap([])),
          }),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/booths")
      .query({ companyId: "c1" })
      .set("Authorization", VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.booths).toEqual([]);
  });
});
