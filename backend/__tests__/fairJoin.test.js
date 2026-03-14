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

const VALID_TOKEN = "Bearer valid-token";

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyIdToken.mockResolvedValue({ uid: "user1", email: "u@test.com" });
});

describe("POST /api/fairs/join", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/fairs/join").send({ inviteCode: "ABC12345" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when inviteCode is missing", async () => {
    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inviteCode/i);
  });

  it("returns 404 when no schedule matches the invite code", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "NOTFOUND" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/invite code/i);
  });

  it("returns 404 when user has no company with a booth", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([mockDocSnap({ name: "Spring Fair", inviteCode: "CODE1234" }, true, "sched1")])
          ),
        };
      }
      if (name === "companies") {
        // Return empty for both ownerId query and representativeIDs query
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/booth/i);
  });

  it("registers booth for company owner and returns fairId and fairName", async () => {
    const scheduleDocRef = {
      id: "sched1",
      update: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              {
                ...mockDocSnap(
                  { name: "Spring Fair", inviteCode: "CODE1234", registeredBoothIds: [] },
                  true,
                  "sched1"
                ),
                ref: scheduleDocRef,
              },
            ])
          ),
        };
      }
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([mockDocSnap({ ownerId: "user1", boothId: "booth1" }, true, "comp1")])
          ),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });

    expect(res.status).toBe(200);
    expect(res.body.fairId).toBe("sched1");
    expect(res.body.fairName).toBe("Spring Fair");
    expect(scheduleDocRef.update).toHaveBeenCalledWith({
      registeredBoothIds: expect.arrayContaining(["booth1"]),
    });
  });

  it("registers booth for representative (ownerId query returns empty, rep query succeeds)", async () => {
    const scheduleDocRef = {
      id: "sched1",
      update: jest.fn().mockResolvedValue(undefined),
    };

    let companiesCallCount = 0;
    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              {
                ...mockDocSnap(
                  { name: "Spring Fair", inviteCode: "CODE1234", registeredBoothIds: [] },
                  true,
                  "sched1"
                ),
                ref: scheduleDocRef,
              },
            ])
          ),
        };
      }
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockImplementation(() => {
            companiesCallCount++;
            // First call: ownerId query returns empty
            // Second call: representativeIDs query returns the company
            if (companiesCallCount === 1) return Promise.resolve(mockQuerySnap([]));
            return Promise.resolve(
              mockQuerySnap([mockDocSnap({ boothId: "booth-rep1", representativeIDs: ["user1"] }, true, "comp2")])
            );
          }),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });

    expect(res.status).toBe(200);
    expect(res.body.fairId).toBe("sched1");
    expect(scheduleDocRef.update).toHaveBeenCalledWith({
      registeredBoothIds: expect.arrayContaining(["booth-rep1"]),
    });
  });

  it("does not call update when booth is already registered (idempotent)", async () => {
    const scheduleDocRef = {
      id: "sched1",
      update: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairSchedules") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([
              {
                ...mockDocSnap(
                  { name: "Spring Fair", inviteCode: "CODE1234", registeredBoothIds: ["booth1"] },
                  true,
                  "sched1"
                ),
                ref: scheduleDocRef,
              },
            ])
          ),
        };
      }
      if (name === "companies") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(
            mockQuerySnap([mockDocSnap({ ownerId: "user1", boothId: "booth1" }, true, "comp1")])
          ),
        };
      }
      return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .post("/api/fairs/join")
      .set("Authorization", VALID_TOKEN)
      .send({ inviteCode: "CODE1234" });

    expect(res.status).toBe(200);
    // The update should be skipped entirely when booth is already registered
    expect(scheduleDocRef.update).not.toHaveBeenCalled();
  });
});
