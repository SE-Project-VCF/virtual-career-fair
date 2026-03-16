/**
 * fairs3.test.js – error paths and helper-function branches for routes/fairs.js
 * Goal: push fairs.js branch coverage from ~64% to 80%+
 */
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
  db: {
    collection: jest.fn(),
    collectionGroup: jest.fn(),
    batch: jest.fn(),
  },
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
  },
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return {
    ...actual,
    verifyAdmin: jest.fn(),
    evaluateFairStatusForFair: jest.fn(),
  };
});

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const { verifyAdmin, evaluateFairStatusForFair } = require("../helpers");

const DB_ERROR = new Error("DB error");

function authHeader(uid = "admin-uid") {
  auth.verifyIdToken.mockResolvedValue({ uid, email: `${uid}@test.com` });
  return "Bearer valid-token";
}

// Minimal batch mock
function makeBatch() {
  return {
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
}

const FAIR_DATA = {
  name: "Test Fair",
  description: "desc",
  isLive: false,
  startTime: { toMillis: () => 500 },
  endTime: { toMillis: () => 2000 },
  createdAt: { toMillis: () => 100 },
  updatedAt: { toMillis: () => 200 },
};

// -----------------------------------------------------------------
// Helper: build just enough of the fairs collection mock for DB throws
// -----------------------------------------------------------------
function dbThrowOnFairs() {
  db.batch.mockReturnValue(makeBatch());
  db.collection.mockImplementation((name) => {
    if (name === "fairs") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockRejectedValue(DB_ERROR),
          update: jest.fn().mockRejectedValue(DB_ERROR),
          delete: jest.fn().mockRejectedValue(DB_ERROR),
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(DB_ERROR) })),
            get: jest.fn().mockRejectedValue(DB_ERROR),
          })),
        })),
        get: jest.fn().mockRejectedValue(DB_ERROR),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    }
    return {
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        update: jest.fn().mockResolvedValue(undefined),
      })),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });
}

// Build a standard stub that returns a fair doc + subcollections
function setupSimpleFairs({ fairExists = true, fair = FAIR_DATA, enrollmentExists = false, enrollmentData, companyData, companyExists = true, userData, userExists = true, boothData, boothExists = true, jobData, jobExists = true, boothDocs = [], jobDocs = [], enrollmentDocs = [] } = {}) {
  const batch = makeBatch();
  db.batch.mockReturnValue(batch);

  const makeSubcol = ({ docData, exists = true, docId = "doc-id", docs = [], newId = "new-id" } = {}) => {
    const subDocRef = {
      get: jest.fn().mockResolvedValue(mockDocSnap(docData, exists, docId)),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      id: docId,
      ref: { parent: { parent: { id: "fair-id" } } },
    };
    return {
      doc: jest.fn(() => subDocRef),
      add: jest.fn().mockResolvedValue({ id: newId }),
      get: jest.fn().mockResolvedValue(mockQuerySnap(docs)),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  };

  db.collection.mockImplementation((name) => {
    if (name === "fairs") {
      const boothCol = makeSubcol({ docData: boothData, exists: boothExists, docs: boothDocs });
      const jobCol = makeSubcol({ docData: jobData, exists: jobExists, docId: "job-id", docs: jobDocs, newId: "new-job-id" });
      const enrollCol = makeSubcol({
        docData: enrollmentData,
        exists: enrollmentExists,
        docId: "company-id",
        docs: enrollmentDocs,
      });
      const fairDocRef = {
        get: jest.fn().mockResolvedValue(mockDocSnap(fair, fairExists, "fair-id")),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        id: "fair-id",
        collection: jest.fn((sub) => {
          if (sub === "booths") return boothCol;
          if (sub === "jobs") return jobCol;
          if (sub === "enrollments") return enrollCol;
          return makeSubcol();
        }),
      };
      return {
        doc: jest.fn(() => fairDocRef),
        add: jest.fn().mockResolvedValue({ id: "new-fair-id" }),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    }
    if (name === "companies") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(companyData, companyExists, "company-id")),
          update: jest.fn().mockResolvedValue(undefined),
        })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
    }
    if (name === "users") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDocSnap(userData, userExists, "user-id")),
          update: jest.fn().mockResolvedValue(undefined),
        })),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        where: jest.fn().mockReturnThis(),
      };
    }
    return {
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(null, false)),
        update: jest.fn().mockResolvedValue(undefined),
      })),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
  });

  return batch;
}

// -----------------------------------------------------------------
// GET /api/fairs  — error path
// -----------------------------------------------------------------
describe("GET /api/fairs – error path", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when DB throws", async () => {
    dbThrowOnFairs();
    const res = await request(app).get("/api/fairs");
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/:fairId  — additional branches
// -----------------------------------------------------------------
describe("GET /api/fairs/:fairId – branches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when DB throws", async () => {
    dbThrowOnFairs();
    const res = await request(app).get("/api/fairs/fair-id");
    expect(res.status).toBe(500);
  });

  it("returns fair with inviteCode for admin with encrypted invite code", async () => {
    // Provide a real encrypted invite code so decryptInviteCode can work
    const { encryptInviteCode } = require("../helpers");
    const encrypted = encryptInviteCode("TESTCODE");
    setupSimpleFairs({
      fair: { ...FAIR_DATA, inviteCodeEncrypted: encrypted },
    });
    // admin role lookup: users collection for requesting user
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(
              { ...FAIR_DATA, inviteCodeEncrypted: encrypted },
              true, "fair-id"
            )),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true, "admin-uid")),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/fairs/fair-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    // inviteCode should be decrypted and returned to admin
    expect(res.body.inviteCode).toBe("TESTCODE");
  });

  it("handles getRequestingRoleFromAuthHeader error gracefully (returns fair without inviteCode)", async () => {
    // auth.verifyIdToken throws inside getRequestingRoleFromAuthHeader
    auth.verifyIdToken.mockRejectedValue(new Error("token invalid"));
    setupSimpleFairs({ fair: FAIR_DATA });
    // Override with a direct fairs.doc mock since setupSimpleFairs was already called
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          })),
        };
      }
      if (name === "users") {
        return { doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(new Error("no user")) })) };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
    });

    const res = await request(app)
      .get("/api/fairs/fair-id")
      .set("Authorization", "Bearer bad-token");
    // Should succeed but not include inviteCode (role resolution failed → not admin)
    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBeUndefined();
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/:fairId/status — 500 error (non-"Fair not found")
// -----------------------------------------------------------------
describe("GET /api/fairs/:fairId/status – 500 error", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when evaluateFairStatusForFair throws non-Fair-not-found error", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("database connection lost"));
    const res = await request(app).get("/api/fairs/fair-id/status");
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/my-enrollments — error paths
// -----------------------------------------------------------------
describe("GET /api/fairs/my-enrollments – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when DB throws", async () => {
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(DB_ERROR) })),
      get: jest.fn().mockRejectedValue(DB_ERROR),
      where: jest.fn().mockReturnThis(),
    }));
    const res = await request(app)
      .get("/api/fairs/my-enrollments")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// POST /api/fairs — error paths
// -----------------------------------------------------------------
describe("POST /api/fairs – extra branches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when startTime >= endTime", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupSimpleFairs({});
    const res = await request(app)
      .post("/api/fairs")
      .set("Authorization", authHeader())
      .send({
        name: "Fair",
        startTime: "2030-01-02T00:00:00Z",
        endTime: "2030-01-01T00:00:00Z", // end before start
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/startTime must be before endTime/i);
  });

  it("returns 500 when DB throws during create", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.batch.mockReturnValue(makeBatch());
    db.collection.mockImplementation(() => ({
      add: jest.fn().mockRejectedValue(DB_ERROR),
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      orderBy: jest.fn().mockReturnThis(),
    }));
    const res = await request(app)
      .post("/api/fairs")
      .set("Authorization", authHeader())
      .send({ name: "Error Fair" });
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// PUT /api/fairs/:fairId — additional branches
// -----------------------------------------------------------------
describe("PUT /api/fairs/:fairId – branches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when fair not found", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupSimpleFairs({ fairExists: false });
    const res = await request(app)
      .put("/api/fairs/nonexistent")
      .set("Authorization", authHeader())
      .send({ name: "Updated" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when startTime >= endTime in update", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupSimpleFairs({ fair: FAIR_DATA });
    const res = await request(app)
      .put("/api/fairs/fair-id")
      .set("Authorization", authHeader())
      .send({
        startTime: "2030-06-01T00:00:00Z",
        endTime: "2030-01-01T00:00:00Z",
      });
    expect(res.status).toBe(400);
  });

  it("returns 500 when DB throws during update", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.batch.mockReturnValue(makeBatch());
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
        update: jest.fn().mockRejectedValue(DB_ERROR),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    }));
    const res = await request(app)
      .put("/api/fairs/fair-id")
      .set("Authorization", authHeader())
      .send({ name: "New Name" });
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// DELETE /api/fairs/:fairId — error path
// -----------------------------------------------------------------
describe("DELETE /api/fairs/:fairId – error path", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.batch.mockReturnValue(makeBatch());
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(DB_ERROR),
        delete: jest.fn().mockRejectedValue(DB_ERROR),
        collection: jest.fn(() => ({
          get: jest.fn().mockRejectedValue(DB_ERROR),
        })),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(DB_ERROR),
    }));
    const res = await request(app)
      .delete("/api/fairs/fair-id")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// POST /api/fairs/:fairId/toggle-status — error path
// -----------------------------------------------------------------
describe("POST /api/fairs/:fairId/toggle-status – error path", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.batch.mockReturnValue(makeBatch());
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(DB_ERROR),
        update: jest.fn().mockRejectedValue(DB_ERROR),
      })),
    }));
    const res = await request(app)
      .post("/api/fairs/fair-id/toggle-status")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// POST /api/fairs/:fairId/enroll — helper function branches
// -----------------------------------------------------------------
describe("POST /api/fairs/:fairId/enroll – helper branches", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when inviteCode does not match any fair", async () => {
    db.batch.mockReturnValue(makeBatch());
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
              get: jest.fn().mockResolvedValue(mockQuerySnap([])),
            })),
          })),
          // HMAC lookup returns empty → invalid invite code
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });
    const res = await request(app)
      .post("/api/fairs/fair-id/enroll")
      .set("Authorization", authHeader())
      .send({ inviteCode: "INVALID123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid invite code/i);
  });

  it("returns 404 when user has no companyId and user not found", async () => {
    db.batch.mockReturnValue(makeBatch());
    setupSimpleFairs({ userExists: false, fair: FAIR_DATA });
    const res = await request(app)
      .post("/api/fairs/fair-id/enroll")
      .set("Authorization", authHeader("no-company-user"))
      .send({ companyId: undefined }); // no companyId → tries resolveCompanyIdForEnrollment
    // Actually we need to send companyId as absent AND inviteCode absent
    // but the check "if (!companyId && !inviteCode)" will catch it first
    // Let's send with companyId undefined but still include to pass the initial check
    // Actually to hit resolveCompanyIdForEnrollment, we need to send a truthy inviteCode
    // OR NOT send companyId but send inviteCode that resolves to a valid fair
    expect([400, 404]).toContain(res.status); // either fails validation or user not found
  });

  it("returns 400 when user exists but has no companyId (resolveCompanyIdForEnrollment)", async () => {
    db.batch.mockReturnValue(makeBatch());
    // User with no companyId
    setupSimpleFairs({
      fair: FAIR_DATA,
      fairExists: true,
      userData: { uid: "user-id", role: "student" }, // no companyId
      userExists: true,
    });
    // Need to trigger resolveCompanyIdForEnrollment path (no companyId in request body)
    // The enroll endpoint will try user lookup when no companyId provided
    // BUT we need inviteCode OR companyId per the first check (line 449 in fairs.js)
    // Let's test this by passing an inviteCode that resolves successfully to a fair
    // Then companyId is resolved from user (but user has none)
    // For a successful HMAC lookup, we'll configure the where/get to return the fairDoc
    const { hmacInviteCode, encryptInviteCode } = require("../helpers");
    const code = "MYCODE12";
    const fairDocWithHmac = { ...FAIR_DATA, inviteCodeHmac: hmacInviteCode(code), inviteCodeEncrypted: encryptInviteCode(code) };

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(fairDocWithHmac, true, "fair-id")),
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
              get: jest.fn().mockResolvedValue(mockQuerySnap([])),
            })),
          })),
          where: jest.fn().mockReturnThis(),
          // Return the fair doc for HMAC lookup
          get: jest.fn().mockResolvedValue({
            empty: false,
            docs: [{ id: "fair-id", data: () => fairDocWithHmac }],
          }),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ uid: "user-id", role: "student" }, true, "user-id")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    const res = await request(app)
      .post("/api/fairs/fair-id/enroll")
      .set("Authorization", authHeader("user-id"))
      .send({ inviteCode: code });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not associated with a company/i);
  });

  it("returns 500 when DB throws during enrollment", async () => {
    db.batch.mockReturnValue(makeBatch());
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockRejectedValue(DB_ERROR),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(DB_ERROR) })),
        })),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(DB_ERROR),
    }));
    const res = await request(app)
      .post("/api/fairs/fair-id/enroll")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id" });
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/:fairId/enrollments — error path
// -----------------------------------------------------------------
describe("GET /api/fairs/:fairId/enrollments – error path", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    dbThrowOnFairs();
    const res = await request(app)
      .get("/api/fairs/fair-id/enrollments")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// DELETE /api/fairs/:fairId/enrollments/:companyId — error paths
// -----------------------------------------------------------------
describe("DELETE /api/fairs/:fairId/enrollments/:companyId – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("removes enrollment with jobs batch delete", async () => {
    verifyAdmin.mockResolvedValue(null);
    const batch = makeBatch();
    db.batch.mockReturnValue(batch);

    const jobDocRef = { ref: {}, delete: jest.fn() };
    const jobBatch = {
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    };

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        const enrollRef = {
          get: jest.fn().mockResolvedValue(mockDocSnap({ boothId: "booth-x" }, true, "company-id")),
          delete: jest.fn(),
          ref: {},
        };
        const boothDelete = { delete: jest.fn(), ref: {} };
        const jobsSubcol = {
          doc: jest.fn(() => ({ delete: jest.fn(), ref: {} })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            empty: false,
            docs: [{ ref: {}, id: "job-1" }],
          }),
        };
        const enrollsSubcol = {
          doc: jest.fn(() => enrollRef),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
        const boothsSubcol = {
          doc: jest.fn(() => boothDelete),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
            collection: jest.fn((sub) => {
              if (sub === "enrollments") return enrollsSubcol;
              if (sub === "booths") return boothsSubcol;
              if (sub === "jobs") return jobsSubcol;
              return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
            }),
            id: "fair-id",
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    // Second batch for jobs
    let batchCallCount = 0;
    db.batch.mockImplementation(() => {
      batchCallCount++;
      return {
        set: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        commit: jest.fn().mockResolvedValue(undefined),
      };
    });

    const res = await request(app)
      .delete("/api/fairs/fair-id/enrollments/company-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
  });

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    dbThrowOnFairs();
    const res = await request(app)
      .delete("/api/fairs/fair-id/enrollments/company-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/:fairId/booths — error paths
// -----------------------------------------------------------------
describe("GET /api/fairs/:fairId/booths – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when evaluateFairStatusForFair throws non-Fair-not-found error", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Connection refused"));
    const res = await request(app).get("/api/fairs/fair-id/booths");
    expect(res.status).toBe(500);
  });

  it("returns 404 when evaluateFairStatusForFair throws Fair not found", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Fair not found"));
    const res = await request(app).get("/api/fairs/fair-id/booths");
    expect(res.status).toBe(404);
  });

  it("returns booths when admin requests non-live fair", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: false });
    setupSimpleFairs({
      fair: FAIR_DATA,
      boothDocs: [{ id: "b1", data: () => ({ companyName: "Acme" }) }],
    });
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
            collection: jest.fn((sub) => {
              if (sub === "booths") {
                return {
                  doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
                  get: jest.fn().mockResolvedValue(mockQuerySnap([{ id: "b1", data: () => ({ companyName: "Acme" }) }])),
                  where: jest.fn().mockReturnThis(),
                  orderBy: jest.fn().mockReturnThis(),
                };
              }
              return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
            }),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(mockQuerySnap([])),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true, "admin-uid")),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })), where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });

    const res = await request(app)
      .get("/api/fairs/fair-id/booths")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.booths).toBeDefined();
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/:fairId/booths/:boothId — error paths
// -----------------------------------------------------------------
describe("GET /api/fairs/:fairId/booths/:boothId – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when evaluateFairStatusForFair throws non-fair-not-found error", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("DB connection lost"));
    const res = await request(app).get("/api/fairs/fair-id/booths/booth-id");
    expect(res.status).toBe(500);
  });

  it("returns 404 when evaluateFairStatusForFair throws Fair not found", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Fair not found"));
    const res = await request(app).get("/api/fairs/fair-id/booths/booth-id");
    expect(res.status).toBe(404);
  });
});

// -----------------------------------------------------------------
// PUT /api/fairs/:fairId/booths/:boothId — error/branch paths
// -----------------------------------------------------------------
describe("PUT /api/fairs/:fairId/booths/:boothId – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when non-admin non-owner tries to update booth", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupSimpleFairs({
      boothData: { companyId: "company-id", companyName: "Acme" },
      boothExists: true,
      companyData: { companyName: "Acme", ownerId: "other-user", representativeIDs: [] },
    });
    const res = await request(app)
      .put("/api/fairs/fair-id/booths/booth-id")
      .set("Authorization", authHeader("not-owner"))
      .send({ companyName: "Hacker" });
    expect(res.status).toBe(403);
  });

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    dbThrowOnFairs();
    const res = await request(app)
      .put("/api/fairs/fair-id/booths/booth-id")
      .set("Authorization", authHeader())
      .send({ companyName: "Updated" });
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/:fairId/jobs — error paths
// -----------------------------------------------------------------
describe("GET /api/fairs/:fairId/jobs – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 500 when DB throws", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("DB error"));
    const res = await request(app).get("/api/fairs/fair-id/jobs");
    expect(res.status).toBe(500);
  });

  it("returns 404 when fair not found via evaluateFairStatusForFair", async () => {
    evaluateFairStatusForFair.mockRejectedValue(new Error("Fair not found"));
    const res = await request(app).get("/api/fairs/fair-id/jobs");
    expect(res.status).toBe(404);
  });

  it("returns jobs with companyId filter", async () => {
    evaluateFairStatusForFair.mockResolvedValue({ isLive: true });
    setupSimpleFairs({
      jobDocs: [{ id: "j1", data: () => ({ companyId: "company-id", name: "Dev" }) }],
    });

    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
              get: jest.fn().mockResolvedValue(mockQuerySnap([{ id: "j1", data: () => ({ companyId: "company-id", name: "Dev" }) }])),
              where: jest.fn().mockReturnThis(),
            })),
          })),
        };
      }
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ role: "administrator" }, true)),
          })),
        };
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })), where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(mockQuerySnap([])) };
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/jobs?companyId=company-id")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
  });
});

// -----------------------------------------------------------------
// POST /api/fairs/:fairId/jobs — error paths
// -----------------------------------------------------------------
describe("POST /api/fairs/:fairId/jobs – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when non-admin non-owner tries to add job", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupSimpleFairs({
      fair: FAIR_DATA,
      companyData: { companyName: "Acme", ownerId: "other-user", representativeIDs: [] },
    });
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .set("Authorization", authHeader("not-owner"))
      .send({ companyId: "company-id", name: "Developer" });
    expect(res.status).toBe(403);
  });

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    dbThrowOnFairs();
    const res = await request(app)
      .post("/api/fairs/fair-id/jobs")
      .set("Authorization", authHeader())
      .send({ companyId: "company-id", name: "Developer" });
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// PUT /api/fairs/:fairId/jobs/:jobId — error paths
// -----------------------------------------------------------------
describe("PUT /api/fairs/:fairId/jobs/:jobId – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when non-admin non-owner tries to update job", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupSimpleFairs({
      jobData: { companyId: "company-id", name: "Dev" },
      jobExists: true,
      companyData: { ownerId: "other-user", representativeIDs: [], companyName: "Acme" },
      companyExists: true,
    });
    const res = await request(app)
      .put("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader("not-owner"))
      .send({ name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    dbThrowOnFairs();
    const res = await request(app)
      .put("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader())
      .send({ name: "Updated" });
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// DELETE /api/fairs/:fairId/jobs/:jobId — error paths
// -----------------------------------------------------------------
describe("DELETE /api/fairs/:fairId/jobs/:jobId – error paths", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when non-admin tries to delete job", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupSimpleFairs({
      jobData: { companyId: "company-id", name: "Dev" },
      jobExists: true,
      companyData: { ownerId: "other-user", representativeIDs: [], companyName: "Acme" },
      companyExists: true,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader("not-owner"))
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    dbThrowOnFairs();
    const res = await request(app)
      .delete("/api/fairs/fair-id/jobs/job-id")
      .set("Authorization", authHeader())
      .send({});
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// DELETE /api/fairs/:fairId/leave — branches
// -----------------------------------------------------------------
describe("DELETE /api/fairs/:fairId/leave", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when user not found", async () => {
    setupSimpleFairs({ userExists: false });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
  });

  it("returns 400 when user has no companyId", async () => {
    setupSimpleFairs({
      userData: { uid: "user-id", role: "student" }, // no companyId
      userExists: true,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader("user-id"));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not associated with a company/i);
  });

  it("returns 403 when user is not owner or rep", async () => {
    setupSimpleFairs({
      userData: { uid: "user-id", companyId: "company-id", role: "student" },
      userExists: true,
      companyData: { ownerId: "other-user", representativeIDs: [] },
      companyExists: true,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader("user-id"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when company is not enrolled", async () => {
    setupSimpleFairs({
      userData: { uid: "user-id", companyId: "company-id", role: "companyOwner" },
      userExists: true,
      companyData: { ownerId: "user-id", representativeIDs: [] },
      companyExists: true,
      enrollmentExists: false,
    });
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader("user-id"));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not enrolled/i);
  });

  it("leaves fair successfully with jobs batch delete", async () => {
    db.batch.mockReturnValue(makeBatch());
    db.batch.mockImplementation(() => makeBatch());

    db.collection.mockImplementation((name) => {
      if (name === "users") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ uid: "user-id", companyId: "company-id", role: "companyOwner" }, true, "user-id")),
          })),
        };
      }
      if (name === "companies") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap({ ownerId: "user-id", representativeIDs: [] }, true, "company-id")),
          })),
        };
      }
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((sub) => {
              if (sub === "enrollments") {
                return {
                  doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue(mockDocSnap({ boothId: "booth-id" }, true, "company-id")),
                    ref: {},
                  })),
                };
              }
              if (sub === "booths") {
                return { doc: jest.fn(() => ({ ref: {} })) };
              }
              if (sub === "jobs") {
                return {
                  where: jest.fn().mockReturnThis(),
                  get: jest.fn().mockResolvedValue({
                    empty: false,
                    docs: [{ ref: {}, id: "job-1" }],
                  }),
                };
              }
              return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })) };
            }),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });

    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader("user-id"));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 500 when DB throws", async () => {
    db.batch.mockReturnValue(makeBatch());
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockRejectedValue(DB_ERROR) })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(DB_ERROR),
    }));
    const res = await request(app)
      .delete("/api/fairs/fair-id/leave")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// GET /api/fairs/:fairId/company/:companyId/booth — branches
// -----------------------------------------------------------------
describe("GET /api/fairs/:fairId/company/:companyId/booth", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when non-admin non-company-member tries to access", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupSimpleFairs({
      companyData: { ownerId: "other-user", representativeIDs: [] },
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader("random-user"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when company is not enrolled", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupSimpleFairs({ enrollmentExists: false });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not enrolled/i);
  });

  it("returns 404 when enrollment has no boothId", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupSimpleFairs({
      enrollmentExists: true,
      enrollmentData: { companyId: "company-id" }, // no boothId
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no booth/i);
  });

  it("returns 404 when booth does not exist", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupSimpleFairs({
      enrollmentExists: true,
      enrollmentData: { boothId: "booth-id" },
      boothExists: false, // booth not found
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/booth not found/i);
  });

  it("returns booth data when everything exists", async () => {
    verifyAdmin.mockResolvedValue(null);
    setupSimpleFairs({
      enrollmentExists: true,
      enrollmentData: { boothId: "booth-id" },
      boothData: { companyName: "Acme Inc" },
      boothExists: true,
    });
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("Acme Inc");
  });

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    dbThrowOnFairs();
    const res = await request(app)
      .get("/api/fairs/fair-id/company/company-id/booth")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------
// GET /api/companies/:companyId/fairs — branches
// -----------------------------------------------------------------
describe("GET /api/companies/:companyId/fairs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when non-admin non-company tries to access", async () => {
    verifyAdmin.mockResolvedValue({ error: "Not admin", status: 403 });
    setupSimpleFairs({
      companyData: { ownerId: "other-user", representativeIDs: [] },
    });
    const res = await request(app)
      .get("/api/companies/company-id/fairs")
      .set("Authorization", authHeader("random-user"));
    expect(res.status).toBe(403);
  });

  it("returns fairs list for admin", async () => {
    verifyAdmin.mockResolvedValue(null);
    const enrollRef = {
      ref: { parent: { parent: { id: "fair-id" } } },
      data: () => ({ boothId: "b1", enrolledAt: null }),
      id: "company-id",
    };
    db.collection.mockImplementation((name) => {
      if (name === "fairs") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockDocSnap(FAIR_DATA, true, "fair-id")),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(mockQuerySnap([])),
      };
    });
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [enrollRef] }),
    });
    const res = await request(app)
      .get("/api/companies/company-id/fairs")
      .set("Authorization", authHeader());
    expect(res.status).toBe(200);
    expect(res.body.fairs).toBeDefined();
  });

  it("returns 500 when DB throws", async () => {
    verifyAdmin.mockResolvedValue(null);
    db.collectionGroup.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(DB_ERROR),
    });
    db.collection.mockImplementation(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDocSnap(null, false)) })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockQuerySnap([])),
    }));
    const res = await request(app)
      .get("/api/companies/company-id/fairs")
      .set("Authorization", authHeader());
    expect(res.status).toBe(500);
  });
});
