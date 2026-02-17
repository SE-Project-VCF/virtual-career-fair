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

const mockUpsertUser = jest.fn().mockResolvedValue({});
const mockCreateToken = jest.fn().mockReturnValue("mock-stream-token");
const mockQueryChannels = jest.fn().mockResolvedValue([]);

jest.mock("stream-chat", () => ({
  StreamChat: {
    getInstance: jest.fn(() => ({
      upsertUser: mockUpsertUser,
      createToken: mockCreateToken,
      queryChannels: mockQueryChannels,
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

describe("POST /api/sync-stream-user", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when uid is missing", async () => {
    const res = await request(app)
      .post("/api/sync-stream-user")
      .send({ email: "test@test.com" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/sync-stream-user")
      .send({ uid: "user1" });
    expect(res.status).toBe(400);
  });

  it("returns 200 on valid input", async () => {
    const res = await request(app)
      .post("/api/sync-stream-user")
      .send({ uid: "user1", email: "user@test.com", firstName: "John", lastName: "Doe" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockUpsertUser).toHaveBeenCalled();
  });

  it("returns 500 when upsertUser throws", async () => {
    mockUpsertUser.mockRejectedValueOnce(new Error("Stream error"));
    const res = await request(app)
      .post("/api/sync-stream-user")
      .send({ uid: "user1", email: "user@test.com" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/sync-stream-users", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).post("/api/sync-stream-users");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not administrator", async () => {
    const userDoc = mockDocSnap({ role: "student" }, true);
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(userDoc) })),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app)
      .post("/api/sync-stream-users")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns error when no users found", async () => {
    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      return {
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    const res = await request(app)
      .post("/api/sync-stream-users")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("No users found");
  });

  it("returns 500 when database fetch fails", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValueOnce(new Error("DB error")),
      })),
    }));

    const res = await request(app)
      .post("/api/sync-stream-users")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("DB error");
  });

  it("syncs users successfully", async () => {
    const users = [
      mockDocSnap({ uid: "u1", email: "a@b.com", firstName: "A", lastName: "B" }),
      mockDocSnap({ uid: "u2", email: "c@d.com", firstName: "C", lastName: "D" }),
    ];

    // First call: get user doc for admin check; second call: get all users
    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Admin check
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      // Get all users
      return {
        get: jest.fn().mockResolvedValue({
          docs: users.map((u) => ({ data: () => u.data() })),
        }),
      };
    });

    const res = await request(app)
      .post("/api/sync-stream-users")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });
});

describe("GET /api/stream-token", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/stream-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 when token verification fails", async () => {
    auth.verifyIdToken.mockRejectedValueOnce(new Error("Invalid token"));
    const res = await request(app)
      .get("/api/stream-token")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid or expired token");
  });

  it("returns 500 when stream token creation fails", async () => {
    mockCreateToken.mockImplementationOnce(() => {
      throw new Error("Stream error");
    });
    const res = await request(app)
      .get("/api/stream-token")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Unable to create token");
  });

  it("returns token for authenticated user", async () => {
    const res = await request(app)
      .get("/api/stream-token")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe("mock-stream-token");
  });
});

describe("GET /api/stream-unread", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/stream-unread");
    expect(res.status).toBe(401);
  });

  it("returns unread 0 when user has no channels", async () => {
    mockQueryChannels.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/stream-unread")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(0);
  });

  it("returns 500 when queryChannels throws error", async () => {
    mockQueryChannels.mockRejectedValueOnce(new Error("Stream error"));
    const res = await request(app)
      .get("/api/stream-unread")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to compute unread");
  });

  it("calculates unread correctly", async () => {
    const lastRead = new Date("2024-01-01T00:00:00Z");
    mockQueryChannels.mockResolvedValue([
      {
        state: {
          read: {
            "test-uid": { last_read: lastRead },
          },
          messages: [
            { created_at: new Date("2024-01-02"), user: { id: "other-user" } },
            { created_at: new Date("2024-01-02"), user: { id: "test-uid" } }, // own message, skip
            { created_at: new Date("2023-12-31"), user: { id: "other-user" } }, // before last_read, skip
          ],
        },
      },
    ]);

    const res = await request(app)
      .get("/api/stream-unread")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(1);
  });
});
