const { mockDocSnap, mockQuerySnap, createTestApp } = require("../testUtils");

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

jest.mock("../../firebase", () => ({
  db: { collection: jest.fn(), runTransaction: jest.fn() },
  auth: { verifyIdToken: jest.fn(), createUser: jest.fn(), getUserByEmail: jest.fn() },
}));

jest.mock("../../helpers", () => {
  const actual = jest.requireActual("../../helpers");
  return { ...actual, verifyAdmin: jest.fn() };
});

jest.mock("../../streamServerClient", () => ({
  streamServerClient: {
    upsertUser: jest.fn().mockResolvedValue({}),
    createToken: jest.fn().mockReturnValue("tok"),
    queryChannels: jest.fn().mockResolvedValue([]),
  },
}));

const request = require("supertest");
const usersRouter = require("../../routes/users");
const { db, auth } = require("../../firebase");
const app = createTestApp(usersRouter);

// Placeholder credential used in request bodies — not a real secret
const TEST_PW = "test-pw-placeholder";

// Auto-authenticate all requests so verifyFirebaseToken passes
const AUTH = "Bearer valid-token";
beforeEach(() => {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
});

/* ============================================================
   POST /api/register-user
============================================================ */
describe("POST /api/register-user", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ password: TEST_PW, role: "student" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "user@test.com", role: "student" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when role is missing", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "user@test.com", password: TEST_PW });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 403 when role is administrator", async () => {
    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "admin@test.com", password: TEST_PW, role: "administrator" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrator/i);
  });

  it("registers a student successfully", async () => {
    auth.createUser.mockResolvedValue({ uid: "new-uid-123" });

    const usersDocRef = {
      set: jest.fn().mockResolvedValue(undefined),
      id: "new-uid-123",
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "student@test.com", password: TEST_PW, role: "student", firstName: "Jane", lastName: "Doe" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.uid).toBe("new-uid-123");
    expect(res.body.user.role).toBe("student");
    expect(res.body.user.companyId).toBeNull();
  });

  it("registers a companyOwner and creates a company document", async () => {
    auth.createUser.mockResolvedValue({ uid: "owner-uid-456" });

    const companyDocRef = {
      set: jest.fn().mockResolvedValue(undefined),
      id: "company-doc-id",
    };
    const usersDocRef = {
      set: jest.fn().mockResolvedValue(undefined),
      id: "owner-uid-456",
    };

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return { doc: jest.fn(() => companyDocRef) };
      }
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/register-user")
      .send({
        email: "owner@test.com",
        password: TEST_PW,
        role: "companyOwner",
        firstName: "John",
        lastName: "Smith",
        companyName: "Acme Corp",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe("companyOwner");
    expect(companyDocRef.set).toHaveBeenCalledTimes(1);
    const companySetArg = companyDocRef.set.mock.calls[0][0];
    expect(companySetArg.companyName).toBe("Acme Corp");
    expect(companySetArg.ownerId).toBe("owner-uid-456");
  });

  it("returns 500 when auth.createUser throws", async () => {
    auth.createUser.mockRejectedValue(new Error("Auth service unavailable"));

    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "user@test.com", password: TEST_PW, role: "student" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Auth service unavailable");
  });

  it("returns 500 when Firestore set throws", async () => {
    auth.createUser.mockResolvedValue({ uid: "uid-fail" });

    const usersDocRef = {
      set: jest.fn().mockRejectedValue(new Error("Firestore write failed")),
      id: "uid-fail",
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "user@test.com", password: TEST_PW, role: "student" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it("still succeeds even when Stream upsertUser throws", async () => {
    const { StreamChat } = require("stream-chat");
    StreamChat.getInstance.mockReturnValue({
      upsertUser: jest.fn().mockRejectedValue(new Error("Stream error")),
      createToken: jest.fn().mockReturnValue("tok"),
      queryChannels: jest.fn().mockResolvedValue([]),
    });

    auth.createUser.mockResolvedValue({ uid: "uid-stream-fail" });
    const usersDocRef = {
      set: jest.fn().mockResolvedValue(undefined),
      id: "uid-stream-fail",
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/register-user")
      .send({ email: "user@test.com", password: TEST_PW, role: "student" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* ============================================================
   GET /api/students
============================================================ */
describe("GET /api/students", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const res = await request(app).get("/api/students").set("Authorization", AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user id is required/i);
  });

  it("returns 404 when user is not found (verifyRepOrOwner)", async () => {
    // verifyRepOrOwner calls db.collection("users").doc(userId).get()
    const usersDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app).get("/api/students?userId=unknown-uid").set("Authorization", AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 403 when user is a student (not rep/owner/admin)", async () => {
    const usersDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true, "student-uid")),
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app).get("/api/students?userId=student-uid").set("Authorization", AUTH);
    expect(res.status).toBe(403);
  });

  it("returns students list for a representative", async () => {
    const studentDocs = [
      mockDocSnap({ firstName: "Alice", lastName: "A", email: "alice@test.com", major: "CS", role: "student" }, true, "s1"),
      mockDocSnap({ firstName: "Bob", lastName: "B", email: "bob@test.com", major: "EE", role: "student" }, true, "s2"),
    ];
    const studentsQuery = mockQuerySnap(studentDocs);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "co-1" }, true, "rep-uid")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(studentsQuery),
        };
      }
    });

    const res = await request(app).get("/api/students?userId=rep-uid").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(2);
    expect(res.body.students[0].firstName).toBe("Alice");
    expect(res.body.students[1].firstName).toBe("Bob");
  });

  it("filters students by search term", async () => {
    const studentDocs = [
      mockDocSnap({ firstName: "Alice", lastName: "Smith", email: "alice@test.com", major: "CS" }, true, "s1"),
      mockDocSnap({ firstName: "Bob", lastName: "Jones", email: "bob@test.com", major: "EE" }, true, "s2"),
    ];
    const studentsQuery = mockQuerySnap(studentDocs);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "co-1" }, true, "rep-uid")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(studentsQuery),
        };
      }
    });

    const res = await request(app).get("/api/students?userId=rep-uid&search=alice").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].firstName).toBe("Alice");
  });

  it("filters students by major", async () => {
    const studentDocs = [
      mockDocSnap({ firstName: "Alice", lastName: "A", email: "alice@test.com", major: "Computer Science" }, true, "s1"),
      mockDocSnap({ firstName: "Bob", lastName: "B", email: "bob@test.com", major: "Electrical Engineering" }, true, "s2"),
    ];
    const studentsQuery = mockQuerySnap(studentDocs);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "co-1" }, true, "rep-uid")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(studentsQuery),
        };
      }
    });

    const res = await request(app).get("/api/students?userId=rep-uid&major=electrical").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].firstName).toBe("Bob");
  });

  it("filters students by boothId (only visited students returned)", async () => {
    const studentDocs = [
      mockDocSnap({ firstName: "Alice", lastName: "A", email: "alice@test.com", major: "CS" }, true, "s1"),
      mockDocSnap({ firstName: "Bob", lastName: "B", email: "bob@test.com", major: "EE" }, true, "s2"),
    ];
    const studentsQuery = mockQuerySnap(studentDocs);

    // Alice visited the booth, Bob did not
    const aliceBoothHistory = mockDocSnap({}, true, "booth-1");
    const bobBoothHistory = mockDocSnap(null, false, "booth-1");

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        const collRef = {
          doc: jest.fn((uid) => {
            if (!uid) {
              // verifyRepOrOwner call: no uid specified — return auth user
              return {
                get: jest.fn().mockResolvedValue(
                  mockDocSnap({ role: "representative", companyId: "co-1" }, true, "rep-uid")
                ),
              };
            }
            return {
              get: jest.fn().mockResolvedValue(
                mockDocSnap({ role: "representative", companyId: "co-1" }, true, "rep-uid")
              ),
              collection: jest.fn((subName) => {
                if (subName === "boothHistory") {
                  return {
                    doc: jest.fn(() => ({
                      get: jest.fn().mockResolvedValue(
                        uid === "s1" ? aliceBoothHistory : bobBoothHistory
                      ),
                    })),
                  };
                }
              }),
            };
          }),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(studentsQuery),
        };
        return collRef;
      }
    });

    const res = await request(app).get("/api/students?userId=rep-uid&boothId=booth-1").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    // Only Alice visited the booth
    const names = res.body.students.map((s) => s.firstName);
    expect(names).toContain("Alice");
    expect(names).not.toContain("Bob");
  });

  it("returns students for an administrator", async () => {
    const studentDocs = [
      mockDocSnap({ firstName: "Alice", lastName: "A", email: "alice@test.com", major: "CS" }, true, "s1"),
    ];
    const studentsQuery = mockQuerySnap(studentDocs);

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "administrator" }, true, "admin-uid")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(studentsQuery),
        };
      }
    });

    const res = await request(app).get("/api/students?userId=admin-uid").set("Authorization", AUTH);
    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
  });

  it("returns 500 when Firestore query throws", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ role: "representative", companyId: "co-1" }, true, "rep-uid")
            ),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockRejectedValue(new Error("Firestore unavailable")),
        };
      }
    });

    const res = await request(app).get("/api/students?userId=rep-uid").set("Authorization", AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed to fetch students/i);
  });
});

/* ============================================================
   POST /api/create-admin
============================================================ */
describe("POST /api/create-admin", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ADMIN_SECRET_KEY: "super-secret-key" };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ password: TEST_PW, adminSecret: "super-secret-key" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "admin@test.com", adminSecret: "super-secret-key" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when adminSecret is missing", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "admin@test.com", password: TEST_PW });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 500 when ADMIN_SECRET_KEY env var is not set", async () => {
    delete process.env.ADMIN_SECRET_KEY;
    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "admin@test.com", password: TEST_PW, adminSecret: "anything" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/server configuration error/i);
  });

  it("returns 403 when adminSecret does not match", async () => {
    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "admin@test.com", password: TEST_PW, adminSecret: "wrong-secret" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invalid admin secret key/i);
  });

  it("returns 400 when user is already an administrator", async () => {
    auth.getUserByEmail.mockResolvedValue({ uid: "existing-uid" });

    const usersDocRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({ role: "administrator", uid: "existing-uid" }, true, "existing-uid")
      ),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "existing-admin@test.com", password: TEST_PW, adminSecret: "super-secret-key" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already an administrator/i);
  });

  it("upgrades an existing non-admin user to administrator", async () => {
    auth.getUserByEmail.mockResolvedValue({ uid: "existing-uid" });

    const usersDocRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap({ role: "student", uid: "existing-uid" }, true, "existing-uid")
      ),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "existing@test.com", password: TEST_PW, adminSecret: "super-secret-key" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/upgraded to administrator/i);
    expect(usersDocRef.update).toHaveBeenCalledWith({ role: "administrator" });
  });

  it("creates a new admin user when email does not exist in auth", async () => {
    const notFoundErr = new Error("No user found");
    notFoundErr.code = "auth/user-not-found";
    auth.getUserByEmail.mockRejectedValue(notFoundErr);
    auth.createUser.mockResolvedValue({ uid: "new-admin-uid" });

    const usersDocRef = {
      set: jest.fn().mockResolvedValue(undefined),
      id: "new-admin-uid",
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/create-admin")
      .send({
        email: "newadmin@test.com",
        password: TEST_PW,
        adminSecret: "super-secret-key",
        firstName: "Super",
        lastName: "Admin",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.uid).toBe("new-admin-uid");
    expect(res.body.user.role).toBe("administrator");
    expect(auth.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "newadmin@test.com" })
    );
  });

  it("returns 500 when getUserByEmail throws a non-auth error", async () => {
    auth.getUserByEmail.mockRejectedValue(new Error("Auth service down"));

    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "admin@test.com", password: TEST_PW, adminSecret: "super-secret-key" });

    expect(res.status).toBe(500);
  });

  it("returns 500 when createUser throws during new admin creation", async () => {
    const notFoundErr = new Error("No user found");
    notFoundErr.code = "auth/user-not-found";
    auth.getUserByEmail.mockRejectedValue(notFoundErr);
    auth.createUser.mockRejectedValue(new Error("Auth create failed"));

    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "newadmin@test.com", password: TEST_PW, adminSecret: "super-secret-key" });

    expect(res.status).toBe(500);
  });

  it("still succeeds even when Stream upsertUser throws during admin creation", async () => {
    const { StreamChat } = require("stream-chat");
    StreamChat.getInstance.mockReturnValue({
      upsertUser: jest.fn().mockRejectedValue(new Error("Stream error")),
      createToken: jest.fn().mockReturnValue("tok"),
      queryChannels: jest.fn().mockResolvedValue([]),
    });

    const notFoundErr = new Error("No user found");
    notFoundErr.code = "auth/user-not-found";
    auth.getUserByEmail.mockRejectedValue(notFoundErr);
    auth.createUser.mockResolvedValue({ uid: "admin-stream-fail-uid" });

    const usersDocRef = {
      set: jest.fn().mockResolvedValue(undefined),
      id: "admin-stream-fail-uid",
    };
    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return { doc: jest.fn(() => usersDocRef) };
      }
    });

    const res = await request(app)
      .post("/api/create-admin")
      .send({ email: "admin@test.com", password: TEST_PW, adminSecret: "super-secret-key" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
