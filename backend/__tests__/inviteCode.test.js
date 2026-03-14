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
const { db } = require("../firebase");

describe("POST /api/update-invite-code", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ userId: "user1" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when company not found", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1", userId: "user1" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the owner", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ownerId: "other-user" }, true)
        ),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1", userId: "user1" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when custom invite code is invalid", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ownerId: "user1" }, true)
        ),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    });

    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1", userId: "user1", newInviteCode: "ab" }); // too short
    expect(res.status).toBe(400);
  });

  it("returns 400 when invite code is already in use", async () => {
    // The server calls: db.collection("companies").doc(companyId).get()
    // then: db.collection("companies").get()  (to check for duplicates)
    let callCount = 0;
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ownerId: "user1" }, true)
        ),
      })),
      get: jest.fn().mockImplementation(() => {
        callCount++;
        // Second .get() is the companies snapshot for duplicate checking
        return Promise.resolve({
          docs: [
            { id: "other-company-id", data: () => ({ inviteCode: "TAKEN123" }) },
          ],
        });
      }),
    }));

    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1", userId: "user1", newInviteCode: "TAKEN123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already in use");
  });

  it("updates invite code successfully with custom code", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ownerId: "user1" }, true)
        ),
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }), // no duplicate codes
    }));

    db.runTransaction.mockImplementation(async (callback) => {
      const transaction = {
        get: jest.fn().mockResolvedValue({ exists: true }),
        update: jest.fn(),
      };
      await callback(transaction);
    });

    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1", userId: "user1", newInviteCode: "MYCODE12" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteCode).toBe("MYCODE12");
  });

  it("generates random code when newInviteCode not provided", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ownerId: "user1" }, true)
        ),
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }), // no duplicate codes
    }));

    db.runTransaction.mockImplementation(async (callback) => {
      const transaction = {
        get: jest.fn().mockResolvedValue({ exists: true }),
        update: jest.fn(),
      };
      await callback(transaction);
    });

    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1", userId: "user1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("returns 500 when database operation fails", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(
          mockDocSnap({ ownerId: "user1" }, true)
        ),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    }));

    db.runTransaction.mockRejectedValueOnce(new Error("Transaction error"));

    const res = await request(app)
      .post("/api/update-invite-code")
      .send({ companyId: "c1", userId: "user1", newInviteCode: "CODE1234" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to update invite code");
  });
});
