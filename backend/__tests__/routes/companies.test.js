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

const request = require("supertest");
const companiesRouter = require("../../routes/companies");
const { db, auth } = require("../../firebase");
const app = createTestApp(companiesRouter);

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

describe("POST /api/companies", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).post("/api/companies").send({ companyName: "Acme" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyName is missing", async () => {
    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyName is empty string", async () => {
    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authHeader())
      .send({ companyName: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        id: "company-123",
        set: jest.fn(),
      })),
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authHeader())
      .send({ companyName: "Acme" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not companyOwner", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
        id: "company-123",
        set: jest.fn(),
      })),
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authHeader())
      .send({ companyName: "Acme" });
    expect(res.status).toBe(403);
  });

  it("creates company successfully for companyOwner", async () => {
    const mockSet = jest.fn().mockResolvedValue({});
    const mockUpdate = jest.fn().mockResolvedValue({});

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "companyOwner" }, true)),
            update: mockUpdate,
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            id: "company-123",
            set: mockSet,
          })),
        };
      }
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authHeader())
      .send({ companyName: "Acme Corp" });
    expect(res.status).toBe(201);
    expect(res.body.companyId).toBe("company-123");
    expect(res.body.inviteCode).toBeDefined();
    expect(mockSet).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .post("/api/companies")
      .set("Authorization", authHeader())
      .send({ companyName: "Acme" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/link-company", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).post("/api/link-company").send({ inviteCode: "ABC123" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when inviteCode is missing", async () => {
    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when invite code is invalid", async () => {
    db.collection.mockReturnValue({
      where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ empty: true }),
      })),
    });

    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authHeader())
      .send({ inviteCode: "INVALID" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid invite code");
  });

  it("returns 400 when user already linked to company", async () => {
    const companyDoc = {
      id: "comp-1",
      data: () => ({ companyName: "Acme", representativeIDs: [] }),
    };

    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          where: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ empty: false, docs: [companyDoc] }),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "comp-1" }, true)),
        })),
      };
    });

    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authHeader())
      .send({ inviteCode: "ABC123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already linked");
  });

  it("links user to company successfully", async () => {
    const companyDoc = {
      id: "comp-1",
      data: () => ({ companyName: "Acme", representativeIDs: [] }),
    };

    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          where: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ empty: false, docs: [companyDoc] }),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: null }, true)),
        })),
      };
    });

    const mockTransaction = jest.fn((fn) => fn({ update: jest.fn() }));
    db.runTransaction.mockImplementation(mockTransaction);

    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authHeader())
      .send({ inviteCode: "ABC123" });
    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe("comp-1");
    expect(res.body.companyName).toBe("Acme");
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      where: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .post("/api/link-company")
      .set("Authorization", authHeader())
      .send({ inviteCode: "ABC123" });
    expect(res.status).toBe(500);
  });
});

describe("GET /api/companies/:companyId/invite-code", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/api/companies/comp-1/invite-code");
    expect(res.status).toBe(401);
  });

  it("returns 404 when company not found", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
      })),
    });

    const res = await request(app)
      .get("/api/companies/comp-1/invite-code")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not owner or admin", async () => {
    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", inviteCode: "ABC123" }, true)
            ),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/companies/comp-1/invite-code")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns invite code for company owner", async () => {
    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", inviteCode: "ABC123" }, true)
            ),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/companies/comp-1/invite-code")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBe("ABC123");
  });

  it("returns invite code for administrator", async () => {
    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-uid", inviteCode: "XYZ789" }, true)
            ),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/companies/comp-1/invite-code")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBe("XYZ789");
  });

  it("returns 404 when no invite code exists", async () => {
    let callCount = 0;
    db.collection.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", inviteCode: null }, true)
            ),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap({ role: "student" }, true)),
        })),
      };
    });

    const res = await request(app)
      .get("/api/companies/comp-1/invite-code")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No invite code found");
  });

  it("returns 500 on database error", async () => {
    db.collection.mockReturnValue({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      })),
    });

    const res = await request(app)
      .get("/api/companies/comp-1/invite-code")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});
