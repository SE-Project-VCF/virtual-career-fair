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
      collection: jest.fn().mockReturnThis(),
    };
    return {
      doc: jest.fn(() => docRef),
      add: jest.fn().mockResolvedValue({ id: "new-invitation-id" }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(cfg.docs || [])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

describe("Call Invitations API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/call-invitations/incoming", () => {
    it("returns incoming call invitations for authenticated student", async () => {
      const invitation = {
        id: "inv-1",
        studentId: "test-uid",
        employerId: "emp-1",
        employerName: "John Employer",
        employerCompanyName: "Tech Corp",
        status: "pending",
        createdAt: { toMillis: () => 1000000 },
        scheduledTime: { toMillis: () => 2000000 },
        jitsiRoom: "test-room",
      };

      setupDbMock({
        call_invitations: {
          docs: [
            mockDocSnap(invitation, true, "inv-1"),
          ],
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .get("/api/call-invitations/incoming")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.invitations)).toBe(true);
      expect(res.body.invitations[0]).toHaveProperty("id");
      expect(res.body.invitations[0]).toHaveProperty("employerName");
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/call-invitations/incoming");
      expect(res.status).toBe(401);
    });

    it("filters invitations by studentId", async () => {
      setupDbMock({
        call_invitations: {
          docs: [
            mockDocSnap(
              {
                studentId: "test-uid",
                employerName: "Employer1",
                status: "pending",
                createdAt: { toMillis: () => 1000000 },
              },
              true,
              "inv-1"
            ),
          ],
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .get("/api/call-invitations/incoming")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.invitations)).toBe(true);
    });

    it("handles empty invitation list", async () => {
      setupDbMock({
        call_invitations: {
          docs: [],
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .get("/api/call-invitations/incoming")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.invitations).toEqual([]);
    });

    it("converts timestamp objects to milliseconds", async () => {
      setupDbMock({
        call_invitations: {
          docs: [
            mockDocSnap(
              {
                studentId: "test-uid",
                employerName: "Employer1",
                createdAt: { toMillis: () => 1234567890 },
                scheduledTime: { toMillis: () => 2000000 },
              },
              true,
              "inv-1"
            ),
          ],
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .get("/api/call-invitations/incoming")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.invitations[0].createdAt).toBe(1234567890);
    });
  });

  describe("GET /api/call-invitations/outgoing", () => {
    it("returns outgoing call invitations for authenticated employer", async () => {
      const invitation = {
        id: "inv-1",
        employerId: "test-uid",
        studentId: "student-1",
        status: "pending",
        createdAt: { toMillis: () => 1000000 },
        scheduledTime: { toMillis: () => 2000000 },
      };

      setupDbMock({
        call_invitations: {
          docs: [mockDocSnap(invitation, true, "inv-1")],
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .get("/api/call-invitations/outgoing")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.invitations)).toBe(true);
      expect(res.body.invitations[0]).toHaveProperty("id");
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/call-invitations/outgoing");
      expect(res.status).toBe(401);
    });

    it("filters invitations by employerId", async () => {
      setupDbMock({
        call_invitations: {
          docs: [
            mockDocSnap(
              {
                employerId: "test-uid",
                studentId: "student-1",
                status: "pending",
                createdAt: { toMillis: () => 1000000 },
              },
              true,
              "inv-1"
            ),
          ],
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .get("/api/call-invitations/outgoing")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.invitations)).toBe(true);
    });
  });

  describe("POST /api/call-invitations/create", () => {
    it("creates a new call invitation", async () => {
      setupDbMock({
        call_invitations: {
          newDocId: "new-inv-id",
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "employer-1" });

      const res = await request(app)
        .post("/api/call-invitations/create")
        .set("Authorization", authHeader())
        .send({
          studentId: "student-1",
          scheduledTime: 2000000,
          jitsiRoom: "test-room",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.invitationId).toBe("new-inv-id");
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .post("/api/call-invitations/create")
        .send({
          studentId: "student-1",
          scheduledTime: 2000000,
          jitsiRoom: "test-room",
        });

      expect(res.status).toBe(401);
    });

    it("returns 400 without required fields", async () => {
      auth.verifyIdToken.mockResolvedValue({ uid: "employer-1" });

      const res = await request(app)
        .post("/api/call-invitations/create")
        .set("Authorization", authHeader())
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/call-invitations/:id/accept", () => {
    it("accepts a call invitation", async () => {
      const invitation = {
        studentId: "test-uid",
        employerId: "emp-1",
        status: "pending",
      };

      setupDbMock({
        call_invitations: {
          docData: invitation,
          docId: "inv-1",
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .post("/api/call-invitations/inv-1/accept")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).post("/api/call-invitations/inv-1/accept");
      expect(res.status).toBe(401);
    });

    it("returns 403 if user is not the invitee", async () => {
      setupDbMock({
        call_invitations: {
          docData: {
            studentId: "other-student",
            employerId: "emp-1",
          },
          docId: "inv-1",
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .post("/api/call-invitations/inv-1/accept")
        .set("Authorization", authHeader());

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/call-invitations/:id/decline", () => {
    it("declines a call invitation", async () => {
      const invitation = {
        studentId: "test-uid",
        employerId: "emp-1",
        status: "pending",
      };

      setupDbMock({
        call_invitations: {
          docData: invitation,
          docId: "inv-1",
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .post("/api/call-invitations/inv-1/decline")
        .set("Authorization", authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app).post("/api/call-invitations/inv-1/decline");
      expect(res.status).toBe(401);
    });

    it("returns 403 if user is not the invitee", async () => {
      setupDbMock({
        call_invitations: {
          docData: {
            studentId: "other-student",
            employerId: "emp-1",
          },
          docId: "inv-1",
        },
      });

      auth.verifyIdToken.mockResolvedValue({ uid: "test-uid" });

      const res = await request(app)
        .post("/api/call-invitations/inv-1/decline")
        .set("Authorization", authHeader());

      expect(res.status).toBe(403);
    });
  });
});
