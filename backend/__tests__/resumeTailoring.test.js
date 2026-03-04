const { mockDocSnap, mockQuerySnap } = require("./testUtils");

jest.mock("firebase-admin", () => {
  const Timestamp = {
    now: jest.fn(() => ({ toMillis: () => 1000000 })),
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
  };
  const FieldValue = {
    delete: jest.fn(() => "FieldValue.delete"),
    serverTimestamp: jest.fn(() => "serverTimestamp"),
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
  db: { collection: jest.fn(), batch: jest.fn() },
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

jest.mock("../patchCache", () => ({
  getCacheEntry: jest.fn(),
  setCacheEntry: jest.fn(),
  clearCacheEntry: jest.fn(),
  getStats: jest.fn(() => ({
    entriesCount: 2,
    memoryEstimate: "~5 KB",
    cacheKeys: [
      { key: "uid1:inv1", createdAt: "2025-01-01T00:00:00.000Z", expiresAt: "2025-01-01T01:00:00.000Z" },
    ],
  })),
}));

jest.mock("../patchValidator", () => {
  return jest.fn().mockImplementation(() => ({
    validatePatches: jest.fn(() => ({
      valid: true,
      patches: [],
      issues: [],
      summary: { averageConfidence: 0.9, validPatches: 2 },
    })),
    detectPatchConflicts: jest.fn(() => []),
  }));
});

jest.mock("../patchApplier", () => ({
  applyPatches: jest.fn(() => ({
    success: true,
    tailoredResume: { summary: "Tailored resume", skills: { items: ["React"] }, experience: [] },
    appliedCount: 2,
    errors: [],
  })),
  summarizePatches: jest.fn(() => ({})),
}));

const request = require("supertest");
const app = require("../server");
const { db, auth } = require("../firebase");
const patchCache = require("../patchCache");
const PatchApplier = require("../patchApplier");

function authHeader() {
  auth.verifyIdToken.mockResolvedValue({ uid: "test-uid", email: "test@test.com" });
  return "Bearer valid-token";
}

/** Build a user document mock that also handles tailoredResumes subcollection. */
function makeUserDocMock({
  userExists = true,
  userData = {},
  tailoredDocExists = true,
  tailoredDocData = {},
  tailoredDocId = "tailored-1",
  tailoredQueryDocs = [],
} = {}) {
  const tailoredDocRef = {
    get: jest.fn().mockResolvedValue(mockDocSnap(tailoredDocData, tailoredDocExists, tailoredDocId)),
    delete: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    id: tailoredDocId,
  };

  const tailoredCollRef = {
    doc: jest.fn(() => tailoredDocRef),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(mockQuerySnap(tailoredQueryDocs)),
  };

  const userDocRef = {
    get: jest.fn().mockResolvedValue(mockDocSnap(userData, userExists, "test-uid")),
    collection: jest.fn(() => tailoredCollRef),
    id: "test-uid",
  };

  return { userDocRef, tailoredDocRef, tailoredCollRef };
}

function setupBatchMock() {
  const batchMock = {
    set: jest.fn(),
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  db.batch.mockReturnValue(batchMock);
  return batchMock;
}

/* ============================================================
   GET /api/resume/tailored  (list)
   ============================================================ */
describe("GET /api/resume/tailored", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/resume/tailored");
    expect(res.status).toBe(401);
  });

  it("returns empty array when user has no tailored resumes", async () => {
    const { userDocRef } = makeUserDocMock({ tailoredQueryDocs: [] });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .get("/api/resume/tailored")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumes).toEqual([]);
  });

  it("returns list of tailored resumes", async () => {
    const doc1 = {
      id: "tr-1",
      data: () => ({
        jobContext: { jobTitle: "React Developer" },
        structured: { summary: "A developer" },
        studentNotes: "Focused on React",
        createdAt: { toMillis: () => 1000 },
        status: "ready",
        expiresAt: null,
        acceptedPatches: [{ opId: "p1" }],
      }),
    };
    const doc2 = {
      id: "tr-2",
      data: () => ({
        jobContext: { jobTitle: "Backend Engineer" },
        structured: null,
        studentNotes: "",
        createdAt: { toMillis: () => 2000 },
        status: "ready",
        expiresAt: null,
        acceptedPatches: [],
      }),
    };

    const { userDocRef } = makeUserDocMock({ tailoredQueryDocs: [doc1, doc2] });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .get("/api/resume/tailored")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumes).toHaveLength(2);
    expect(res.body.resumes[0].id).toBe("tr-1");
    expect(res.body.resumes[0].acceptedPatches).toHaveLength(1);
    expect(res.body.resumes[1].acceptedPatches).toHaveLength(0);
  });

  it("returns 500 when Firestore query fails", async () => {
    const { userDocRef, tailoredCollRef } = makeUserDocMock();
    tailoredCollRef.get.mockRejectedValue(new Error("DB error"));
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .get("/api/resume/tailored")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});

/* ============================================================
   GET /api/resume/tailored/list  (alias)
   ============================================================ */
describe("GET /api/resume/tailored/list", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/resume/tailored/list");
    expect(res.status).toBe(401);
  });

  it("returns list identical to /api/resume/tailored", async () => {
    const doc1 = {
      id: "tr-1",
      data: () => ({
        jobContext: { jobTitle: "Designer" },
        structured: null,
        studentNotes: "",
        createdAt: null,
        status: "ready",
        expiresAt: null,
      }),
    };

    const { userDocRef } = makeUserDocMock({ tailoredQueryDocs: [doc1] });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .get("/api/resume/tailored/list")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumes).toHaveLength(1);
    expect(res.body.resumes[0].id).toBe("tr-1");
  });
});

/* ============================================================
   GET /api/resume/tailored/:tailoredResumeId
   ============================================================ */
describe("GET /api/resume/tailored/:tailoredResumeId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/resume/tailored/tr-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when tailored resume does not exist", async () => {
    const { userDocRef } = makeUserDocMock({ tailoredDocExists: false });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .get("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns tailored resume data", async () => {
    const tailoredData = {
      baseResumeId: "base-123",
      invitationId: "inv-456",
      jobContext: { jobTitle: "React Developer", jobDescription: "Build apps" },
      structured: { summary: "Developer" },
      tailoredText: null,
      method: "patch-based",
      studentNotes: "My notes",
      status: "ready",
      createdAt: { toDate: () => ({ toISOString: () => "2025-01-01T00:00:00.000Z" }) },
      changesCount: 3,
      acceptedPatches: [{ opId: "p1" }, { opId: "p2" }],
    };

    const { userDocRef } = makeUserDocMock({
      tailoredDocExists: true,
      tailoredDocData: tailoredData,
      tailoredDocId: "tr-1",
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .get("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tailoredResumeId).toBe("tr-1");
    expect(res.body.data.baseResumeId).toBe("base-123");
    expect(res.body.data.invitationId).toBe("inv-456");
    expect(res.body.data.method).toBe("patch-based");
    expect(res.body.data.appliedPatches).toBe(2);
    expect(res.body.data.studentNotes).toBe("My notes");
  });

  it("returns 500 when Firestore read fails", async () => {
    const { userDocRef, tailoredDocRef } = makeUserDocMock();
    tailoredDocRef.get.mockRejectedValue(new Error("DB error"));
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .get("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});

/* ============================================================
   PUT /api/resume/tailored/:tailoredResumeId
   ============================================================ */
describe("PUT /api/resume/tailored/:tailoredResumeId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).put("/api/resume/tailored/tr-1").send({});
    expect(res.status).toBe(401);
  });

  it("returns 404 when tailored resume does not exist", async () => {
    const { userDocRef } = makeUserDocMock({ tailoredDocExists: false });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .put("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader())
      .send({ studentNotes: "Updated notes" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("updates student notes successfully", async () => {
    const { userDocRef, tailoredDocRef } = makeUserDocMock({
      tailoredDocExists: true,
      tailoredDocData: { studentNotes: "Old notes", status: "ready" },
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .put("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader())
      .send({ studentNotes: "Updated notes" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/updated successfully/i);
    expect(tailoredDocRef.update).toHaveBeenCalledWith(
      expect.objectContaining({ studentNotes: "Updated notes" })
    );
  });

  it("updates structured resume content", async () => {
    const { userDocRef, tailoredDocRef } = makeUserDocMock({
      tailoredDocExists: true,
      tailoredDocData: { status: "ready" },
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const newStructured = { summary: "Updated summary", skills: { items: ["React"] }, experience: [] };

    const res = await request(app)
      .put("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader())
      .send({ structured: newStructured });

    expect(res.status).toBe(200);
    expect(tailoredDocRef.update).toHaveBeenCalledWith(
      expect.objectContaining({ structured: newStructured })
    );
  });

  it("returns 500 when Firestore update fails", async () => {
    const { userDocRef, tailoredDocRef } = makeUserDocMock({ tailoredDocExists: true, tailoredDocData: {} });
    tailoredDocRef.update.mockRejectedValue(new Error("DB error"));
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .put("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader())
      .send({ studentNotes: "notes" });

    expect(res.status).toBe(500);
  });
});

/* ============================================================
   DELETE /api/resume/tailored/:tailoredResumeId
   ============================================================ */
describe("DELETE /api/resume/tailored/:tailoredResumeId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete("/api/resume/tailored/tr-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when tailored resume does not exist", async () => {
    const { userDocRef } = makeUserDocMock({ tailoredDocExists: false });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .delete("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("deletes tailored resume without an invitation link", async () => {
    const { userDocRef, tailoredDocRef } = makeUserDocMock({
      tailoredDocExists: true,
      tailoredDocData: { status: "ready" }, // no invitationId
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .delete("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/deleted successfully/i);
    expect(tailoredDocRef.delete).toHaveBeenCalled();
  });

  it("deletes tailored resume and clears invitation reference", async () => {
    const invDocRef = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    const { userDocRef, tailoredDocRef } = makeUserDocMock({
      tailoredDocExists: true,
      tailoredDocData: { invitationId: "inv-456", status: "ready" },
    });

    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => userDocRef) };
      if (name === "jobInvitations") return { doc: jest.fn(() => invDocRef) };
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .delete("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(tailoredDocRef.delete).toHaveBeenCalled();
    expect(invDocRef.update).toHaveBeenCalledWith({
      tailoredResumeId: "FieldValue.delete",
      tailoredAt: "FieldValue.delete",
    });
  });

  it("still succeeds even when invitation update fails", async () => {
    const invDocRef = {
      update: jest.fn().mockRejectedValue(new Error("Invitation not found")),
    };

    const { userDocRef, tailoredDocRef } = makeUserDocMock({
      tailoredDocExists: true,
      tailoredDocData: { invitationId: "inv-999", status: "ready" },
    });

    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => userDocRef) };
      if (name === "jobInvitations") return { doc: jest.fn(() => invDocRef) };
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .delete("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 500 when delete Firestore call fails", async () => {
    const { userDocRef, tailoredDocRef } = makeUserDocMock({ tailoredDocExists: true, tailoredDocData: {} });
    tailoredDocRef.delete.mockRejectedValue(new Error("DB error"));
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .delete("/api/resume/tailored/tr-1")
      .set("Authorization", authHeader());

    expect(res.status).toBe(500);
  });
});

/* ============================================================
   POST /api/resume/tailored/save
   ============================================================ */
describe("POST /api/resume/tailored/save", () => {
  const validBody = {
    invitationId: "inv-123",
    acceptedPatchIds: ["patch-1", "patch-2"],
    studentNotes: "Focused on React skills",
  };

  const mockStructured = {
    summary: "A developer",
    skills: { items: ["React", "Node.js"] },
    experience: [{ expId: "e1", title: "Dev", company: "ACME", bullets: [] }],
    projects: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupBatchMock();
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/resume/tailored/save").send(validBody);
    expect(res.status).toBe(401);
  });

  it("returns 400 when invitationId is missing", async () => {
    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ acceptedPatchIds: ["p1"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invitationId/i);
  });

  it("returns 400 when acceptedPatchIds is not an array", async () => {
    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", acceptedPatchIds: "not-array" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when user does not exist", async () => {
    const { userDocRef } = makeUserDocMock({ userExists: false });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it("returns 400 when user has no parsed resume", async () => {
    const { userDocRef } = makeUserDocMock({
      userExists: true,
      userData: { resumeRawText: null, resumeStructured: null },
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resume not parsed/i);
  });

  it("returns 400 when patches are not in cache", async () => {
    patchCache.getCacheEntry.mockReturnValue({ cached: false, error: "Expired" });

    const { userDocRef } = makeUserDocMock({
      userData: { resumeStructured: mockStructured },
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found in cache/i);
  });

  it("returns 400 when no valid patches match accepted IDs", async () => {
    patchCache.getCacheEntry.mockReturnValue({
      cached: true,
      patchResponse: {
        patches: [{ opId: "other-patch", type: "replace_bullet" }],
      },
      jobContext: { jobDescription: "desc" },
    });

    const { userDocRef } = makeUserDocMock({
      userData: { resumeStructured: mockStructured },
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", acceptedPatchIds: ["patch-1", "patch-2"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no valid patches/i);
  });

  it("saves tailored resume and returns tailoredResumeId", async () => {
    patchCache.getCacheEntry.mockReturnValue({
      cached: true,
      patchResponse: {
        patches: [
          { opId: "patch-1", type: "replace_bullet", confidence: 0.9 },
          { opId: "patch-2", type: "remove_skill", confidence: 0.85 },
        ],
      },
      jobContext: {
        jobId: "job-1",
        jobTitle: "React Developer",
        jobDescription: "Build React apps",
        requiredSkills: "React",
      },
    });

    const { userDocRef } = makeUserDocMock({
      userData: { resumeStructured: mockStructured },
    });

    const invDocRef = { update: jest.fn().mockResolvedValue(undefined) };
    db.collection.mockImplementation((name) => {
      if (name === "users") return { doc: jest.fn(() => userDocRef) };
      if (name === "jobInvitations") return { doc: jest.fn(() => invDocRef) };
      return { doc: jest.fn() };
    });

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tailoredResumeId).toMatch(/^tailored_/);
    expect(res.body.appliedCount).toBe(2);
    expect(patchCache.clearCacheEntry).toHaveBeenCalledWith("test-uid", "inv-123");
  });

  it("returns 400 when patch application fails", async () => {
    patchCache.getCacheEntry.mockReturnValue({
      cached: true,
      patchResponse: {
        patches: [{ opId: "patch-1", type: "replace_bullet", confidence: 0.9 }],
      },
      jobContext: { jobDescription: "desc" },
    });

    PatchApplier.applyPatches.mockReturnValueOnce({
      success: false,
      tailoredResume: null,
      appliedCount: 0,
      errors: [{ opId: "patch-1", error: "beforeText does not match" }],
    });

    const { userDocRef } = makeUserDocMock({
      userData: { resumeStructured: mockStructured },
    });
    db.collection.mockImplementation(() => ({ doc: jest.fn(() => userDocRef) }));

    const res = await request(app)
      .post("/api/resume/tailored/save")
      .set("Authorization", authHeader())
      .send({ invitationId: "inv-1", acceptedPatchIds: ["patch-1"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/failed to apply patches/i);
    expect(res.body.errors).toHaveLength(1);
  });
});

/* ============================================================
   GET /api/debug/patch-cache
   ============================================================ */
describe("GET /api/debug/patch-cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("returns 401 without auth token", async () => {
    process.env.NODE_ENV = "development";
    const res = await request(app).get("/api/debug/patch-cache");
    expect(res.status).toBe(401);
  });

  it("returns 403 when not in development environment", async () => {
    process.env.NODE_ENV = "production";

    const res = await request(app)
      .get("/api/debug/patch-cache")
      .set("Authorization", authHeader());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it("returns cache stats in development environment", async () => {
    process.env.NODE_ENV = "development";

    const res = await request(app)
      .get("/api/debug/patch-cache")
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.entriesCount).toBe(2);
    expect(res.body.stats.cacheKeys).toHaveLength(1);
  });
});
