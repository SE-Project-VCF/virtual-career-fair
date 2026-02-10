const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 5000 })),
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
const { db } = require("../firebase");

describe("GET /api/fair-status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns isLive true when a schedule is active", async () => {
    // Timestamp.now() returns 5000, so schedule from 1000-10000 is active
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          get: jest.fn().mockResolvedValue({
            docs: [
              {
                id: "sched-1",
                data: () => ({
                  startTime: { toMillis: () => 1000 },
                  endTime: { toMillis: () => 10000 },
                  name: "Fall Fair",
                  description: "Annual fair",
                }),
              },
            ],
          }),
        };
      }
      // fairSettings
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
        })),
      };
    });

    const res = await request(app).get("/api/fair-status");
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
    expect(res.body.source).toBe("schedule");
    expect(res.body.scheduleName).toBe("Fall Fair");
  });

  it("returns manual status when no active schedules", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: true }, true)),
        })),
      };
    });

    const res = await request(app).get("/api/fair-status");
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
    expect(res.body.source).toBe("manual");
  });

  it("returns isLive false when no settings doc exists", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false }),
        })),
      };
    });

    const res = await request(app).get("/api/fair-status");
    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(false);
  });
});

describe("POST /api/toggle-fair-status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/toggle-fair-status")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const res = await request(app)
      .post("/api/toggle-fair-status")
      .send({ userId: "user1" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not administrator", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
        set: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const res = await request(app)
      .post("/api/toggle-fair-status")
      .send({ userId: "user1" });
    expect(res.status).toBe(403);
  });

  it("toggles status from false to true", async () => {
    const setMock = jest.fn().mockResolvedValue(undefined);

    // The endpoint accesses multiple collections: users, fairSchedules, fairSettings
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      if (name === "fairSchedules") {
        return {
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      }
      // fairSettings
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ isLive: false }, true)),
          set: setMock,
        })),
      };
    });

    const res = await request(app)
      .post("/api/toggle-fair-status")
      .send({ userId: "admin1" });

    expect(res.status).toBe(200);
    expect(res.body.isLive).toBe(true);
  });
});
