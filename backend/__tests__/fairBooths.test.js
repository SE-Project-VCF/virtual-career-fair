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
  db: { collection: jest.fn(), collectionGroup: jest.fn(), runTransaction: jest.fn() },
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

describe("GET /api/fairs/:fairId/booths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.verifyIdToken.mockResolvedValue({ uid: "admin-uid" });
    verifyAdmin.mockResolvedValue(null); // admin by default
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/fairs/fair1/booths");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    auth.verifyIdToken.mockResolvedValue({ uid: "user-uid" });
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    const res = await request(app)
      .get("/api/fairs/fair1/booths")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
  });

  it("returns 404 when fair not found", async () => {
    db.collection.mockImplementation((col) => {
      if (col === "fairSchedules") {
        return { doc: () => ({ get: jest.fn().mockResolvedValue({ exists: false }) }) };
      }
    });

    const res = await request(app)
      .get("/api/fairs/nonexistent/booths")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(404);
  });

  it("returns fair data with booths and their ratings in time window", async () => {
    const startTime = { toMillis: () => 1000, seconds: 1 };
    const endTime = { toMillis: () => 9000, seconds: 9 };

    const mockRatingDoc = {
      id: "student1",
      data: () => ({
        studentId: "student1",
        rating: 4,
        comment: "Good",
        createdAt: { toMillis: () => 5000 },
      }),
    };

    db.collection.mockImplementation((col) => {
      if (col === "fairSchedules") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: "Spring Fair 2025", startTime, endTime, registeredBoothIds: ["booth1"] }),
            }),
          }),
        };
      }
      if (col === "booths") {
        return {
          doc: (id) => ({
            get: jest.fn().mockResolvedValue(
              id === "booth1"
                ? { exists: true, id: "booth1", data: () => ({ companyName: "Acme Corp" }) }
                : { exists: false, data: () => ({}) }
            ),
            collection: () => ({
              where: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({
                forEach: (cb) => cb(mockRatingDoc),
              }),
            }),
          }),
        };
      }
    });

    const res = await request(app)
      .get("/api/fairs/fair1/booths")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.fairName).toBe("Spring Fair 2025");
    expect(res.body.startTime).toBe(1000);
    expect(res.body.endTime).toBe(9000);
    expect(res.body.booths).toHaveLength(1);
    expect(res.body.booths[0].boothId).toBe("booth1");
    expect(res.body.booths[0].companyName).toBe("Acme Corp");
    expect(res.body.booths[0].totalRatings).toBe(1);
    expect(res.body.booths[0].averageRating).toBe(4);
    expect(res.body.booths[0].ratings).toHaveLength(1);
    expect(res.body.booths[0].ratings[0].rating).toBe(4);
  });

  it("returns only registered booths (ignores deleted/non-existent booth IDs)", async () => {
    const startTime = { toMillis: () => 1000, seconds: 1 };
    const endTime = { toMillis: () => 9000, seconds: 9 };

    db.collection.mockImplementation((col) => {
      if (col === "fairSchedules") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                name: "Test Fair",
                startTime,
                endTime,
                registeredBoothIds: ["booth1", "deletedBooth"], // deletedBooth no longer exists
              }),
            }),
          }),
        };
      }
      if (col === "booths") {
        return {
          doc: (id) => ({
            get: jest.fn().mockResolvedValue(
              id === "booth1"
                ? { exists: true, id: "booth1", data: () => ({ companyName: "Acme Corp" }) }
                : { exists: false, data: () => ({}) }
            ),
            collection: () => ({
              where: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({ forEach: () => {} }),
            }),
          }),
        };
      }
    });

    const res = await request(app)
      .get("/api/fairs/fair1/booths")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    // deletedBooth is in registeredBoothIds but exists: false — must be filtered out
    expect(res.body.booths).toHaveLength(1);
    expect(res.body.booths[0].boothId).toBe("booth1");
  });

  it("returns empty booths array when no booths are registered", async () => {
    const startTime = { toMillis: () => 1000, seconds: 1 };
    const endTime = { toMillis: () => 9000, seconds: 9 };

    db.collection.mockImplementation((col) => {
      if (col === "fairSchedules") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                name: "Empty Fair",
                startTime,
                endTime,
                registeredBoothIds: [],
              }),
            }),
          }),
        };
      }
      return { doc: jest.fn(), get: jest.fn() };
    });

    const res = await request(app)
      .get("/api/fairs/fair1/booths")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.booths).toHaveLength(0);
  });
});
