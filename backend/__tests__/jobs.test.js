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
    };
    return {
      doc: jest.fn(() => docRef),
      add: jest.fn().mockResolvedValue({ id: cfg.newDocId || "new-job-id" }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(cfg.docs || [])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

describe("POST /api/jobs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/jobs").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ name: "Dev", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when description is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", name: "Dev", majorsAssociated: "CS" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when majorsAssociated is missing", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", name: "Dev", description: "desc" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when applicationLink is invalid URL", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "test-uid", representativeIDs: [] }, docExists: true },
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({
        companyId: "c1",
        name: "Dev",
        description: "desc",
        majorsAssociated: "CS",
        applicationLink: "not-a-url",
      });
    expect(res.status).toBe(400);
  });

  it("returns 404 when company does not exist", async () => {
    setupDbMock({
      companies: { docExists: false },
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", name: "Dev", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not authorized", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "other-user", representativeIDs: [] }, docExists: true },
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", name: "Dev", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(403);
  });

  it("creates job successfully", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "test-uid", representativeIDs: [] }, docExists: true },
      jobs: { newDocId: "job-123" },
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({
        companyId: "c1",
        name: "Developer",
        description: "Build stuff",
        majorsAssociated: "CS",
        applicationLink: "https://example.com/apply",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBe("job-123");
  });

  it("allows company representative to create job", async () => {
    setupDbMock({
      companies: { docData: { ownerId: "other-owner", representativeIDs: ["test-uid"] }, docExists: true },
      jobs: { newDocId: "job-456" },
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", name: "Dev", description: "desc", majorsAssociated: "CS" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 when database add fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)),
          })),
        };
      }
      return {
        add: jest.fn().mockRejectedValueOnce(new Error("DB error")),
      };
    });

    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", name: "Dev", description: "desc", majorsAssociated: "CS" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("DB error");
  });

  it("returns 400 when job name is only whitespace", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "c1", name: "   ", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when companyId is missing", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(400);
  });

  it("returns 500 when database fetch fails", async () => {
    db.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValueOnce(new Error("DB error")),
    });

    const res = await request(app).get("/api/jobs?companyId=c1");
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to fetch jobs");
  });

  it("returns empty array when no jobs", async () => {
    setupDbMock({ jobs: { docs: [] } });

    const res = await request(app).get("/api/jobs?companyId=c1");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });

  it("returns jobs sorted by createdAt descending", async () => {
    const jobs = [
      {
        id: "j1",
        data: () => ({
          companyId: "c1", name: "Job1", description: "d1",
          majorsAssociated: "CS", applicationLink: null,
          createdAt: { toMillis: () => 1000 },
        }),
      },
      {
        id: "j2",
        data: () => ({
          companyId: "c1", name: "Job2", description: "d2",
          majorsAssociated: "CS", applicationLink: null,
          createdAt: { toMillis: () => 2000 },
        }),
      },
    ];

    setupDbMock({ jobs: { docs: jobs } });

    const res = await request(app).get("/api/jobs?companyId=c1");
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].name).toBe("Job2");
    expect(res.body.jobs[1].name).toBe("Job1");
  });
});

describe("PUT /api/jobs/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).put("/api/jobs/j1").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is empty", async () => {
    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when description is empty", async () => {
    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "Dev", description: "", majorsAssociated: "CS" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when majorsAssociated is empty", async () => {
    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "Dev", description: "desc", majorsAssociated: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when applicationLink is invalid URL", async () => {
    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "Dev", description: "desc", majorsAssociated: "CS", applicationLink: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when job does not exist", async () => {
    setupDbMock({ jobs: { docExists: false } });

    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "Dev", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(404);
  });

  it("returns 500 when database update fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn().mockRejectedValueOnce(new Error("DB error")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "Dev", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(500);
  });

  it("returns 403 when user is not authorized", async () => {
    // Need two collection calls: jobs then companies
    let callCount = 0;
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      // companies
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "other-user", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "Dev", description: "desc", majorsAssociated: "CS" });
    expect(res.status).toBe(403);
  });

  it("updates job successfully", async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: updateMock,
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .put("/api/jobs/j1")
      .set("Authorization", authHeader())
      .send({ name: "Updated Dev", description: "new desc", majorsAssociated: "CS, Math" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });
});

describe("DELETE /api/jobs/:id", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/jobs/j1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    setupDbMock({ jobs: { docExists: false } });

    const res = await request(app)
      .delete("/api/jobs/j1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not authorized", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            delete: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "other-owner", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .delete("/api/jobs/j1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
  });

  it("returns 500 when database delete fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            delete: jest.fn().mockRejectedValueOnce(new Error("DB error")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .delete("/api/jobs/j1")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });

  it("deletes job successfully", async () => {
    const deleteMock = jest.fn().mockResolvedValue(undefined);
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            delete: deleteMock,
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .delete("/api/jobs/j1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deleteMock).toHaveBeenCalled();
  });
});
