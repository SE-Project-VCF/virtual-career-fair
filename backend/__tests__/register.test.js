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

jest.mock("stream-chat", () => {
  const mockUpsertUser = jest.fn().mockResolvedValue({});
  return {
    StreamChat: {
      getInstance: jest.fn(() => ({
        upsertUser: mockUpsertUser,
        createToken: jest.fn().mockReturnValue("tok"),
        queryChannels: jest.fn().mockResolvedValue([]),
      })),
    },
    __mockUpsertUser: mockUpsertUser,
  };
});

jest.mock("../firebase", () => {
  return {
    db: { collection: jest.fn(), runTransaction: jest.fn() },
    auth: {
      verifyIdToken: jest.fn(),
      createUser: jest.fn(),
      getUserByEmail: jest.fn(),
    },
  };
});

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return {
    ...actual,
    verifyAdmin: jest.fn(),
  };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { __mockUpsertUser } = require("stream-chat");

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
      add: jest.fn().mockResolvedValue({ id: cfg.newDocId || "new-id" }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(cfg.docs || [])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

describe("POST /api/register-user", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ password: "pass123", role: "student" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "test@test.com", role: "student" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is missing", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "test@test.com", password: "pass123" });
    expect(res.status).toBe(400);
  });

  it("returns 403 when role is administrator", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "test@test.com", password: "pass123", role: "administrator" });
    expect(res.status).toBe(403);
  });

  it("registers a student successfully", async () => {
    auth.createUser.mockResolvedValue({ uid: "new-uid" });
    setupDbMock({ users: {} });

    const res = await request(app)
      .post("/api/register-user")
      .send({
        firstName: "John",
        lastName: "Doe",
        email: "john@test.com",
        password: "pass123",
        role: "student",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.uid).toBe("new-uid");
    expect(res.body.user.role).toBe("student");
    expect(res.body.user.companyId).toBeNull();
  });

  it("registers a companyOwner with company creation", async () => {
    auth.createUser.mockResolvedValue({ uid: "owner-uid" });
    setupDbMock({
      companies: { docId: "company-id" },
      users: {},
    });

    const res = await request(app)
      .post("/api/register-user")
      .send({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@company.com",
        password: "pass123",
        role: "companyOwner",
        companyName: "Acme Corp",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe("companyOwner");
  });

  it("handles Stream upsert failure gracefully", async () => {
    auth.createUser.mockResolvedValue({ uid: "new-uid" });
    setupDbMock({ users: {} });
    __mockUpsertUser.mockRejectedValueOnce(new Error("Stream error"));

    const res = await request(app)
      .post("/api/register-user")
      .send({
        email: "test@test.com",
        password: "pass123",
        role: "student",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 when auth.createUser throws", async () => {
    auth.createUser.mockRejectedValue(new Error("Auth error"));

    const res = await request(app)
      .post("/api/register-user")
      .send({
        email: "test@test.com",
        password: "pass123",
        role: "student",
      });

    expect(res.status).toBe(500);
  });
});

describe("POST /api/create-admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ password: "pass", adminSecret: "test-admin-secret" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "a@b.com", adminSecret: "test-admin-secret" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when adminSecret is missing", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "a@b.com", password: "pass" });
    expect(res.status).toBe(400);
  });

  it("returns 403 when adminSecret is wrong", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "a@b.com", password: "pass", adminSecret: "wrong-secret" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when user is already an administrator", async () => {
    auth.getUserByEmail.mockResolvedValue({ uid: "existing-uid" });
    setupDbMock({
      users: { docData: { role: "administrator" }, docExists: true },
    });

    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "admin@test.com", password: "pass", adminSecret: "test-admin-secret" });
    expect(res.status).toBe(400);
  });

  it("upgrades existing non-admin user to administrator", async () => {
    auth.getUserByEmail.mockResolvedValue({ uid: "existing-uid" });
    const docRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "user@test.com", password: "pass", adminSecret: "test-admin-secret" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/upgraded/i);
  });

  it("creates new admin when user does not exist", async () => {
    const authError = new Error("User not found");
    authError.code = "auth/user-not-found";
    auth.getUserByEmail.mockRejectedValue(authError);
    auth.createUser.mockResolvedValue({ uid: "new-admin-uid" });
    setupDbMock({ users: {} });

    const res = await request(app)
      .post("/api/create-admin")
      .send({
        firstName: "Admin",
        lastName: "User",
        email: "newadmin@test.com",
        password: "pass",
        adminSecret: "test-admin-secret",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe("administrator");
  });

  describe("Stream Chat Integration", () => {
    it("handles Stream upsert failure gracefully and still creates admin", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });
      setupDbMock({ users: {} });

      const mockUpsertUser = require("stream-chat").StreamChat.getInstance().upsertUser;
      mockUpsertUser.mockRejectedValueOnce(new Error("Stream error"));

      const res = await request(app)
        .post("/api/create-admin")
        .send({
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("generates username from email for Stream", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });
      setupDbMock({ users: {} });

      const mockUpsertUser = require("stream-chat").StreamChat.getInstance().upsertUser;

      await request(app)
        .post("/api/create-admin")
        .send({
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(mockUpsertUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "john.doe",
          email: "john.doe@example.com",
        })
      );
    });
  });

  describe("Name Handling", () => {
    it("uses email as displayName when names are missing", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });
      setupDbMock({ users: {} });

      await request(app)
        .post("/api/create-admin")
        .send({
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "admin@test.com",
          displayName: "",
        })
      );
    });

    it("creates displayName from firstName only", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });
      setupDbMock({ users: {} });

      await request(app)
        .post("/api/create-admin")
        .send({
          firstName: "John",
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "John",
        })
      );
    });

    it("creates displayName from lastName only", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });
      setupDbMock({ users: {} });

      await request(app)
        .post("/api/create-admin")
        .send({
          lastName: "Doe",
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "Doe",
        })
      );
    });

    it("creates displayName from both firstName and lastName", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });
      setupDbMock({ users: {} });

      await request(app)
        .post("/api/create-admin")
        .send({
          firstName: "John",
          lastName: "Doe",
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "John Doe",
        })
      );
    });
  });

  describe("Error Scenarios", () => {
    it("returns 500 when auth.getUserByEmail throws unexpected error", async () => {
      auth.getUserByEmail.mockRejectedValue(new Error("Unexpected auth error"));

      const res = await request(app)
        .post("/api/create-admin")
        .send({
          email: "test@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(res.status).toBe(500);
    });

    it("returns 500 when Firestore set fails", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });

      const docRef = {
        set: jest.fn().mockRejectedValue(new Error("Firestore error")),
      };
      db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

      const res = await request(app)
        .post("/api/create-admin")
        .send({
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(res.status).toBe(500);
    });

    it("returns 500 when createUser fails", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockRejectedValue(new Error("Failed to create user"));
      setupDbMock({ users: {} });

      const res = await request(app)
        .post("/api/create-admin")
        .send({
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("Email Verification", () => {
    it("sets emailVerified to true for new admin", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });
      setupDbMock({ users: {} });

      await request(app)
        .post("/api/create-admin")
        .send({
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          emailVerified: true,
        })
      );
    });

    it("saves emailVerified to Firestore for new admin", async () => {
      const authError = new Error("User not found");
      authError.code = "auth/user-not-found";
      auth.getUserByEmail.mockRejectedValue(authError);
      auth.createUser.mockResolvedValue({ uid: "new-uid" });

      const docRef = {
        set: jest.fn().mockResolvedValue(undefined),
      };
      db.collection.mockReturnValue({ doc: jest.fn(() => docRef) });

      await request(app)
        .post("/api/create-admin")
        .send({
          email: "admin@test.com",
          password: "pass",
          adminSecret: "test-admin-secret",
        });

      expect(docRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          emailVerified: true,
        }),
        { merge: true }
      );
    });
  });
});
