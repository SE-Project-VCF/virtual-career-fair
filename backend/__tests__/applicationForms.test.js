const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    delete: jest.fn(() => "FieldValue.delete"),
    arrayUnion: jest.fn((...args) => args),
    arrayRemove: jest.fn((...args) => args),
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
  db: { collection: jest.fn() },
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

/** Builds a db.collection mock with separate behaviour per collection name */
function setupCollectionMock(configs) {
  db.collection.mockImplementation((name) => {
    const cfg = configs[name] || {};
    const docRef = {
      get: jest.fn().mockResolvedValue(
        mockDocSnap(cfg.docData, cfg.docExists !== false, cfg.docId || "mock-id")
      ),
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

const validForm = {
  title: "Application Form",
  status: "published",
  fields: [{ id: "f1", type: "shortText", label: "Name", required: true }],
};

/* ============================================================
   PUT /api/jobs/:id/form
   ============================================================ */
describe("PUT /api/jobs/:id/form", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).put("/api/jobs/j1/form").send(validForm);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is not an object", async () => {
    const res = await request(app)
      .put("/api/jobs/j1/form")
      .set("Authorization", authHeader())
      .set("Content-Type", "application/json")
      .send("not-an-object");
    expect(res.status).toBe(400);
  });

  it("returns 404 when job does not exist", async () => {
    setupCollectionMock({
      jobs: { docExists: false },
    });

    const res = await request(app)
      .put("/api/jobs/j1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/job not found/i);
  });

  it("returns 404 when company does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn(),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        })),
      };
    });

    const res = await request(app)
      .put("/api/jobs/j1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when user is not the owner or a representative", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn(),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "other-user", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .put("/api/jobs/j1/form")
      .set("Authorization", authHeader())
      .send(validForm);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("saves form successfully as company owner", async () => {
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
      .put("/api/jobs/j1/form")
      .set("Authorization", authHeader())
      .send(validForm);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ applicationForm: expect.objectContaining({ title: "Application Form" }) });
  });

  it("saves form successfully as company representative", async () => {
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
            mockDocSnap({ ownerId: "other-owner", representativeIDs: ["test-uid"] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .put("/api/jobs/j1/form")
      .set("Authorization", authHeader())
      .send(validForm);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 when database update fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn().mockRejectedValue(new Error("DB error")),
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
      .put("/api/jobs/j1/form")
      .set("Authorization", authHeader())
      .send(validForm);

    expect(res.status).toBe(500);
  });
});

/* ============================================================
   DELETE /api/jobs/:id/form
   ============================================================ */
describe("DELETE /api/jobs/:id/form", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete("/api/jobs/j1/form");
    expect(res.status).toBe(401);
  });

  it("returns 404 when job does not exist", async () => {
    setupCollectionMock({ jobs: { docExists: false } });

    const res = await request(app)
      .delete("/api/jobs/j1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/job not found/i);
  });

  it("returns 404 when company does not exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn(),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        })),
      };
    });

    const res = await request(app)
      .delete("/api/jobs/j1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when user is not the owner or a representative", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn(),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(
            mockDocSnap({ ownerId: "other-user", representativeIDs: [] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .delete("/api/jobs/j1/form")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("deletes form successfully as company owner", async () => {
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
      .delete("/api/jobs/j1/form")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ applicationForm: "FieldValue.delete" });
  });

  it("deletes form successfully as company representative", async () => {
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
            mockDocSnap({ ownerId: "other-owner", representativeIDs: ["test-uid"] }, true)
          ),
        })),
      };
    });

    const res = await request(app)
      .delete("/api/jobs/j1/form")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 when database update fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "jobs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ companyId: "c1" }, true)),
            update: jest.fn().mockRejectedValue(new Error("DB error")),
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
      .delete("/api/jobs/j1/form")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

/* ============================================================
   GET /api/companies/:companyId/submissions
   ============================================================ */
describe("GET /api/companies/:companyId/submissions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/companies/c1/submissions");
    expect(res.status).toBe(401);
  });

  it("returns 404 when company does not exist", async () => {
    setupCollectionMock({ companies: { docExists: false } });

    const res = await request(app)
      .get("/api/companies/c1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/company not found/i);
  });

  it("returns 403 when user is not the owner or a representative", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-user", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn() })),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    const res = await request(app)
      .get("/api/companies/c1/submissions")
      .set("Authorization", authHeader());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it("returns empty submissions array when no applications exist", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    const res = await request(app)
      .get("/api/companies/c1/submissions")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.submissions).toEqual([]);
  });

  it("returns submissions sorted by submittedAt descending", async () => {
    const sub1 = { id: "s1", data: () => ({ companyId: "c1", studentId: "u1", submittedAt: 1000, responses: {} }) };
    const sub2 = { id: "s2", data: () => ({ companyId: "c1", studentId: "u2", submittedAt: 3000, responses: {} }) };
    const sub3 = { id: "s3", data: () => ({ companyId: "c1", studentId: "u3", submittedAt: 2000, responses: {} }) };

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([sub1, sub2, sub3])),
      };
    });

    const res = await request(app)
      .get("/api/companies/c1/submissions")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.submissions[0].submittedAt).toBe(3000);
    expect(res.body.submissions[1].submittedAt).toBe(2000);
    expect(res.body.submissions[2].submittedAt).toBe(1000);
  });

  it("allows company representative to view submissions", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "other-owner", representativeIDs: ["test-uid"] }, true)
            ),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    const res = await request(app)
      .get("/api/companies/c1/submissions")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 when database query fails", async () => {
    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(new Error("DB error")),
      };
    });

    const res = await request(app)
      .get("/api/companies/c1/submissions")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });

  it("includes submission id in each returned object", async () => {
    const sub = { id: "sub-abc", data: () => ({ companyId: "c1", studentId: "u1", submittedAt: 500, responses: { q1: "yes" } }) };

    db.collection.mockImplementation((name) => {
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(
              mockDocSnap({ ownerId: "test-uid", representativeIDs: [] }, true)
            ),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([sub])),
      };
    });

    const res = await request(app)
      .get("/api/companies/c1/submissions")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.submissions[0].id).toBe("sub-abc");
    expect(res.body.submissions[0].studentId).toBe("u1");
  });
});
